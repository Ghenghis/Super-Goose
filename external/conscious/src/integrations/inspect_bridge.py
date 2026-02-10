"""
Inspect AI Bridge - Evaluation harness for scoring agent tasks against benchmarks.

Wraps the Inspect AI framework's core functionality (Task, eval, Solver, Scorer,
Dataset) for use by Goose agents through the Conscious bridge layer.

Inspect AI (https://inspect.ai-safety-institute.org.uk/) provides a structured
evaluation pipeline:
    1. Define a Task with a dataset, solver strategy, and scorer.
    2. Run eval() to execute the pipeline against a model.
    3. Collect scores and compare against baselines.

This bridge exposes the following operations:
    run_eval            - Execute an evaluation task suite
    score               - Score task results with a given scorer
    load_dataset        - Load an evaluation dataset (JSON / CSV)
    create_task         - Create an Inspect Task definition
    get_regression_delta - Compare current scores against a baseline

Architecture:
    1. Direct import of the ``inspect_ai`` package (preferred, zero overhead).
    2. All eval results are persisted to eval_reports/<run_id>/report.json.

The bridge is registered in config/external_tools.toml under [tools.inspect_ai]
and discovered by the ToolRegistry at startup.

Usage via ToolRegistry::

    result = await registry.execute("inspect_ai", "run_eval", {
        "suite_id": "swe_bench_lite",
        "dataset_path": "data/swe_bench_lite.json",
        "solver_config": {"type": "chain_of_thought"},
        "sandbox_type": "docker",
    })

Direct usage::

    from integrations.inspect_bridge import run_eval, load_dataset

    dataset = await load_dataset(path="data/humaneval.json", format="json")
    result = await run_eval(
        suite_id="humaneval_check",
        dataset_path="data/humaneval.json",
    )

Reference:
    Inspect AI docs:  https://inspect.ai-safety-institute.org.uk/
    Inspect AI repo:  https://github.com/UKGovernmentBEIS/inspect_ai
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registry-compatible ToolStatus
# ---------------------------------------------------------------------------

try:
    from integrations.registry import ToolStatus
except ImportError:
    # Fallback: define a minimal ToolStatus when registry is unavailable
    # (e.g. during standalone testing).
    @dataclass
    class ToolStatus:  # type: ignore[no-redef]
        name: str
        available: bool
        healthy: bool
        error: Optional[str] = None
        version: Optional[str] = None

from integrations.resource_coordinator import get_coordinator


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Default directory for eval report output.
DEFAULT_REPORT_DIR = Path(
    os.environ.get(
        "INSPECT_REPORT_DIR",
        str(Path.home() / ".config" / "goose" / "inspect" / "eval_reports"),
    )
)

#: Default eval timeout in seconds (Inspect evals can be very long).
DEFAULT_EVAL_TIMEOUT = 3600  # 60 minutes

#: Maximum concurrent eval tasks (configurable via INSPECT_MAX_EVALS env var).
MAX_CONCURRENT_EVALS = int(os.environ.get("INSPECT_MAX_EVALS", "2"))

#: Supported scorer types.
SCORER_TYPES: dict[str, str] = {
    "match": "Exact string match between model output and expected answer.",
    "model_graded_fact": "Uses an LLM judge to assess factual accuracy.",
    "includes": "Checks if the expected answer is contained in model output.",
    "pattern": "Regex pattern matching against model output.",
}

#: Supported solver types.
SOLVER_TYPES: dict[str, str] = {
    "generate": "Direct generation from the model.",
    "chain_of_thought": "Step-by-step reasoning before answering.",
    "system_message": "Prepend a system message to the prompt.",
}


# ---------------------------------------------------------------------------
# Lazy globals -- populated by init()
# ---------------------------------------------------------------------------

_inspect: Any = None                    # inspect_ai top-level module
_initialized: bool = False
_init_lock = threading.Lock()
_init_error: Optional[str] = None
_version: Optional[str] = None

#: Registry of created task definitions: name -> Task config dict.
_tasks: dict[str, dict[str, Any]] = {}

#: Semaphore to limit concurrent evals.
_eval_semaphore: Optional[asyncio.Semaphore] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init() -> dict[str, Any]:
    """
    Initialize the Inspect AI bridge.

    Attempts to import ``inspect_ai`` and verify core components are
    available.  Safe to call multiple times -- subsequent calls are no-ops
    that return cached state.

    Returns:
        dict with keys:
            success (bool):   True if inspect_ai is available.
            version (str):    Inspect AI version string, or None.
            error (str):      Error message if initialization failed.
    """
    global _inspect, _initialized, _init_error, _version, _eval_semaphore

    with _init_lock:
        if _initialized:
            return {
                "success": _inspect is not None,
                "version": _version,
                "error": _init_error,
            }

        try:
            import inspect_ai  # noqa: WPS433
            _inspect = inspect_ai
            _version = getattr(inspect_ai, "__version__", None)
            if _version is None:
                try:
                    import importlib.metadata
                    _version = importlib.metadata.version("inspect_ai")
                except Exception:
                    _version = "unknown"
        except ImportError as exc:
            _init_error = (
                f"Failed to import inspect_ai: {exc}. "
                "Install with: pip install inspect-ai"
            )
            _initialized = True
            logger.error(_init_error)
            return {"success": False, "version": None, "error": _init_error}

        # Verify core components are importable
        try:
            from inspect_ai import Task, eval as _eval_fn  # noqa: WPS433, F401
            from inspect_ai.solver import generate  # noqa: WPS433, F401
            from inspect_ai.scorer import match  # noqa: WPS433, F401
        except ImportError as exc:
            _init_error = (
                f"inspect_ai is installed but missing core components: {exc}. "
                "Try upgrading: pip install --upgrade inspect-ai"
            )
            _initialized = True
            logger.error(_init_error)
            return {"success": False, "version": _version, "error": _init_error}

        # Create eval semaphore
        _eval_semaphore = asyncio.Semaphore(MAX_CONCURRENT_EVALS)

        # Ensure report directory exists
        DEFAULT_REPORT_DIR.mkdir(parents=True, exist_ok=True)

        _initialized = True
        logger.info("Inspect AI bridge initialized (version=%s)", _version)

        return {
            "success": True,
            "version": _version,
            "error": None,
        }


def _ensure_init() -> None:
    """Call init() if not yet done, and raise if it failed fatally."""
    if not _initialized:
        init()
    if _init_error:
        raise RuntimeError(_init_error)


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------


def status() -> ToolStatus:
    """
    Return the current health status of the Inspect AI tool.

    Called by ``ToolRegistry.check_status("inspect_ai")`` to populate the
    registry dashboard.

    Returns:
        ToolStatus dataclass with availability, health, version, and
        any error information.
    """
    if not _initialized:
        init()

    available = _inspect is not None
    healthy = available and _init_error is None
    return ToolStatus(
        name="Inspect AI",
        available=available,
        healthy=healthy,
        version=_version,
        error=_init_error,
    )


def capabilities() -> list[str]:
    """
    Return the list of operations this bridge supports.

    Matches the ``capabilities`` field in external_tools.toml so the
    registry can validate routing.

    Returns:
        List of capability strings.
    """
    return [
        "benchmark_eval",
        "scoring",
        "dataset_load",
        "swe_bench",
        "humaneval",
        "run_eval",
        "score",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------


async def run_eval(
    suite_id: str,
    dataset_path: Optional[str] = None,
    solver_config: Optional[dict[str, Any]] = None,
    sandbox_type: Optional[str] = None,
    *,
    model: Optional[str] = None,
    scorer_type: str = "match",
    max_samples: Optional[int] = None,
    report_dir: Optional[str] = None,
) -> dict[str, Any]:
    """
    Execute an evaluation task suite using Inspect AI.

    Runs one or more evaluation tasks against a model, using the specified
    solver strategy and scorer.  Results are persisted as JSON reports.

    Args:
        suite_id:       Unique identifier for this evaluation run (used for
                        report naming and deduplication).
        dataset_path:   Path to the evaluation dataset (JSON or CSV).  If
                        None, uses a previously created task's dataset.
        solver_config:  Solver configuration dict.  Keys:
                        - ``type``: Solver type (``"generate"``,
                          ``"chain_of_thought"``, ``"system_message"``).
                        - ``system_message``: Optional system message text.
        sandbox_type:   Sandbox environment type (``"docker"``, ``"local"``,
                        or ``None`` for default).
        model:          Model identifier for evaluation.  If None, uses the
                        Inspect AI default.
        scorer_type:    Scoring strategy (``"match"``, ``"model_graded_fact"``,
                        ``"includes"``, ``"pattern"``).
        max_samples:    Maximum number of dataset samples to evaluate.
                        None evaluates the full dataset.
        report_dir:     Directory for eval reports.  Defaults to
                        ``~/.config/goose/inspect/eval_reports``.

    Returns:
        dict with keys:
            success (bool):         True if evaluation completed.
            suite_id (str):         The suite identifier.
            run_id (str):           Unique run identifier.
            scores (dict):         Score metrics from the evaluation.
            total_samples (int):    Number of samples evaluated.
            report_path (str):      Path to the persisted JSON report.
            duration_seconds (float): Wall-clock time for the eval.
            error (str):            Error message if failed.
    """
    _ensure_init()

    start_time = time.monotonic()
    run_id = f"{suite_id}_{uuid.uuid4().hex[:8]}"

    result: dict[str, Any] = {
        "success": False,
        "suite_id": suite_id,
        "run_id": run_id,
        "scores": {},
        "total_samples": 0,
        "report_path": "",
        "duration_seconds": 0.0,
        "error": None,
    }

    try:
        from inspect_ai import Task, eval as inspect_eval
        from inspect_ai.solver import generate, system_message, chain_of_thought
        from inspect_ai.scorer import match as match_scorer
        from inspect_ai.scorer import model_graded_fact, includes
        from inspect_ai.dataset import json_dataset, csv_dataset

        # Build solver chain
        solver_config = solver_config or {"type": "generate"}
        solver_chain = _build_solver_chain(solver_config)

        # Build scorer
        scorer = _build_scorer(scorer_type)

        # Load dataset
        dataset = None
        if dataset_path:
            ds_path = Path(dataset_path)
            if ds_path.suffix == ".csv":
                dataset = csv_dataset(str(ds_path))
            else:
                dataset = json_dataset(str(ds_path))

        # Check for a pre-created task definition
        if suite_id in _tasks and dataset is None:
            task_def = _tasks[suite_id]
            if "dataset_path" in task_def and task_def["dataset_path"]:
                ds_p = Path(task_def["dataset_path"])
                if ds_p.suffix == ".csv":
                    dataset = csv_dataset(str(ds_p))
                else:
                    dataset = json_dataset(str(ds_p))

        if dataset is None:
            result["error"] = (
                "No dataset provided.  Supply dataset_path or create a task "
                "with create_task() first."
            )
            result["duration_seconds"] = round(time.monotonic() - start_time, 2)
            return result

        # Build the task
        task = Task(
            dataset=dataset,
            solver=solver_chain,
            scorer=scorer,
            sandbox=sandbox_type,
        )

        # Configure eval kwargs
        eval_kwargs: dict[str, Any] = {}
        if model:
            eval_kwargs["model"] = model
        if max_samples is not None:
            eval_kwargs["max_samples"] = max_samples

        # Run eval with semaphore to limit concurrency
        async with _eval_semaphore:
            # inspect_ai.eval() is synchronous; run in executor to avoid
            # blocking the event loop.
            loop = asyncio.get_running_loop()
            eval_results = await loop.run_in_executor(
                None,
                lambda: inspect_eval(task, **eval_kwargs),
            )

        # Extract scores from results
        scores: dict[str, Any] = {}
        total_samples = 0

        if eval_results:
            # eval() returns a list of EvalLog objects
            eval_log = eval_results[0] if isinstance(eval_results, list) else eval_results

            if hasattr(eval_log, "results") and eval_log.results:
                eval_result_obj = eval_log.results
                if hasattr(eval_result_obj, "scores"):
                    for score_obj in eval_result_obj.scores:
                        score_name = getattr(score_obj, "name", "default")
                        score_metrics = {}
                        if hasattr(score_obj, "metrics"):
                            for metric_name, metric_val in score_obj.metrics.items():
                                score_metrics[metric_name] = getattr(
                                    metric_val, "value", metric_val
                                )
                        scores[score_name] = score_metrics

            if hasattr(eval_log, "samples") and eval_log.samples:
                total_samples = len(eval_log.samples)
            elif hasattr(eval_log, "stats") and eval_log.stats:
                total_samples = getattr(eval_log.stats, "samples", 0)

        # Persist report
        out_dir = Path(report_dir) if report_dir else DEFAULT_REPORT_DIR
        run_dir = out_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        report_path = run_dir / "report.json"

        report_data = {
            "suite_id": suite_id,
            "run_id": run_id,
            "scores": scores,
            "total_samples": total_samples,
            "solver_config": solver_config,
            "scorer_type": scorer_type,
            "sandbox_type": sandbox_type,
            "model": model,
            "dataset_path": dataset_path,
            "duration_seconds": round(time.monotonic() - start_time, 2),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, default=str)

        result["success"] = True
        result["scores"] = scores
        result["total_samples"] = total_samples
        result["report_path"] = str(report_path)

        logger.info(
            "Eval '%s' completed: %d samples, scores=%s, report=%s",
            suite_id, total_samples, scores, report_path,
        )

    except ImportError as exc:
        result["error"] = f"Inspect AI components not available: {exc}"
        logger.error(result["error"])
    except Exception as exc:
        logger.exception("run_eval failed for suite '%s'", suite_id)
        result["error"] = str(exc)

    result["duration_seconds"] = round(time.monotonic() - start_time, 2)
    return result


async def score(
    task_results: dict[str, Any],
    scorer_type: str = "match",
) -> dict[str, Any]:
    """
    Score a set of task results using a specified scorer.

    Applies the given scorer to pre-computed task predictions, returning
    aggregate metrics.  Useful for re-scoring results with different
    scorers without re-running the full evaluation.

    Args:
        task_results:  Dict containing ``predictions`` -- a list of dicts
                       each with ``input``, ``output`` (model answer), and
                       ``expected`` (ground truth) keys.
        scorer_type:   Scoring strategy (``"match"``, ``"includes"``, etc.).

    Returns:
        dict with keys:
            success (bool):    True if scoring completed.
            metrics (dict):    Computed score metrics.
            total (int):       Number of predictions scored.
            passed (int):      Number that matched / passed.
            accuracy (float):  Fraction of passed predictions.
            error (str):       Error message if failed.
    """
    _ensure_init()

    result: dict[str, Any] = {
        "success": False,
        "metrics": {},
        "total": 0,
        "passed": 0,
        "accuracy": 0.0,
        "error": None,
    }

    predictions = task_results.get("predictions", [])
    if not predictions:
        result["error"] = "No predictions to score.  Provide 'predictions' list."
        return result

    try:
        total = len(predictions)
        passed = 0

        for pred in predictions:
            expected = str(pred.get("expected", "")).strip()
            actual = str(pred.get("output", "")).strip()

            if scorer_type == "match":
                if actual == expected:
                    passed += 1
            elif scorer_type == "includes":
                if expected in actual:
                    passed += 1
            elif scorer_type == "pattern":
                import re
                if re.search(expected, actual):
                    passed += 1
            elif scorer_type == "model_graded_fact":
                # Model-graded scoring requires an LLM call, which is
                # expensive.  For the bridge-level scoring we fall back
                # to fuzzy substring matching as a lightweight proxy.
                if expected.lower() in actual.lower():
                    passed += 1
            else:
                result["error"] = (
                    f"Unknown scorer_type '{scorer_type}'.  "
                    f"Available: {', '.join(SCORER_TYPES.keys())}"
                )
                return result

        accuracy = round(passed / max(total, 1), 4)

        result["success"] = True
        result["total"] = total
        result["passed"] = passed
        result["accuracy"] = accuracy
        result["metrics"] = {
            "accuracy": accuracy,
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "scorer": scorer_type,
        }

        logger.info(
            "Scored %d predictions with '%s': accuracy=%.4f",
            total, scorer_type, accuracy,
        )

    except Exception as exc:
        logger.exception("score() failed")
        result["error"] = str(exc)

    return result


async def load_dataset(
    path: str,
    format: Optional[str] = None,
) -> dict[str, Any]:
    """
    Load an evaluation dataset from a JSON or CSV file.

    Validates the dataset structure and returns metadata about the
    loaded data.  The dataset remains accessible for subsequent
    ``run_eval`` calls via path reference.

    Args:
        path:    File path to the dataset.
        format:  Explicit format override (``"json"`` or ``"csv"``).
                 If None, inferred from file extension.

    Returns:
        dict with keys:
            success (bool):       True if the dataset was loaded.
            path (str):           The resolved file path.
            format (str):         Detected or specified format.
            num_samples (int):    Number of samples in the dataset.
            sample_fields (list): Field names from the first sample.
            preview (list):       First 3 samples (for inspection).
            error (str):          Error message if failed.
    """
    _ensure_init()

    result: dict[str, Any] = {
        "success": False,
        "path": path,
        "format": format,
        "num_samples": 0,
        "sample_fields": [],
        "preview": [],
        "error": None,
    }

    ds_path = Path(path)
    if not ds_path.exists():
        result["error"] = f"Dataset not found: {path}"
        return result

    # Determine format
    if format is None:
        if ds_path.suffix == ".csv":
            format = "csv"
        elif ds_path.suffix in (".json", ".jsonl"):
            format = "json"
        else:
            result["error"] = (
                f"Cannot infer format from extension '{ds_path.suffix}'.  "
                "Specify format='json' or format='csv'."
            )
            return result

    result["format"] = format

    try:
        if format == "json":
            with open(ds_path, "r", encoding="utf-8") as f:
                if ds_path.suffix == ".jsonl":
                    records = [
                        json.loads(line)
                        for line in f
                        if line.strip()
                    ]
                else:
                    data = json.load(f)
                    if isinstance(data, list):
                        records = data
                    elif isinstance(data, dict) and "samples" in data:
                        records = data["samples"]
                    else:
                        result["error"] = (
                            f"Expected JSON array or object with 'samples' key, "
                            f"got {type(data).__name__}"
                        )
                        return result
        elif format == "csv":
            import csv as csv_mod
            with open(ds_path, "r", encoding="utf-8") as f:
                reader = csv_mod.DictReader(f)
                records = list(reader)
        else:
            result["error"] = f"Unsupported format: {format}"
            return result

        result["success"] = True
        result["num_samples"] = len(records)
        if records:
            result["sample_fields"] = list(records[0].keys())
            result["preview"] = records[:3]

        logger.info(
            "Loaded dataset '%s' (%s): %d samples, fields=%s",
            path, format, len(records), result["sample_fields"],
        )

    except json.JSONDecodeError as exc:
        result["error"] = f"Invalid JSON in {path}: {exc}"
    except Exception as exc:
        logger.exception("load_dataset failed for '%s'", path)
        result["error"] = str(exc)

    return result


async def create_task(
    name: str,
    dataset: Optional[str] = None,
    solver: Optional[str] = None,
    scorer: Optional[str] = None,
    *,
    solver_config: Optional[dict[str, Any]] = None,
    description: str = "",
) -> dict[str, Any]:
    """
    Create and register an Inspect Task definition for later evaluation.

    Stores the task configuration so it can be referenced by name in
    subsequent ``run_eval`` calls.  The actual Inspect ``Task`` object
    is constructed at eval time.

    Args:
        name:           Unique name for this task definition.
        dataset:        Path to the evaluation dataset.
        solver:         Solver type name (e.g. ``"chain_of_thought"``).
        scorer:         Scorer type name (e.g. ``"match"``).
        solver_config:  Additional solver configuration options.
        description:    Human-readable description of the task.

    Returns:
        dict with keys:
            success (bool):     True if the task was registered.
            name (str):         The task name.
            dataset_path (str): The dataset path, if provided.
            solver (str):       The solver type.
            scorer (str):       The scorer type.
            error (str):        Error message if failed.
    """
    _ensure_init()

    if name in _tasks:
        return {
            "success": False,
            "name": name,
            "error": f"Task '{name}' already exists.  Choose a different name.",
        }

    task_def: dict[str, Any] = {
        "name": name,
        "dataset_path": dataset,
        "solver": solver or "generate",
        "scorer": scorer or "match",
        "solver_config": solver_config or {},
        "description": description,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    _tasks[name] = task_def

    logger.info(
        "Task '%s' created (solver=%s, scorer=%s, dataset=%s)",
        name, task_def["solver"], task_def["scorer"], dataset,
    )

    return {
        "success": True,
        "name": name,
        "dataset_path": dataset,
        "solver": task_def["solver"],
        "scorer": task_def["scorer"],
        "error": None,
    }


async def get_regression_delta(
    current_scores: dict[str, Any],
    baseline_path: Optional[str] = None,
) -> dict[str, Any]:
    """
    Compare current evaluation scores against a baseline to detect regressions.

    Loads a baseline report JSON and computes per-metric deltas.  Positive
    deltas indicate improvement, negative deltas indicate regression.

    Args:
        current_scores: Dict of metric_name -> float with current eval scores.
                        This is typically the ``scores`` dict from a ``run_eval``
                        result.
        baseline_path:  Path to a baseline report JSON.  Should contain a
                        ``scores`` key with the same structure as current_scores.
                        If None, returns a no-baseline result.

    Returns:
        dict with keys:
            success (bool):          True if comparison completed.
            deltas (dict):           Per-metric deltas (current - baseline).
            regressions (list):      Metrics that regressed (negative delta).
            improvements (list):     Metrics that improved (positive delta).
            baseline_path (str):     The baseline file used.
            has_regression (bool):   True if any metric regressed.
            error (str):             Error message if failed.
    """
    _ensure_init()

    result: dict[str, Any] = {
        "success": False,
        "deltas": {},
        "regressions": [],
        "improvements": [],
        "baseline_path": baseline_path,
        "has_regression": False,
        "error": None,
    }

    if not baseline_path:
        result["error"] = "No baseline_path provided for comparison."
        return result

    bl_path = Path(baseline_path)
    if not bl_path.exists():
        result["error"] = f"Baseline file not found: {baseline_path}"
        return result

    try:
        with open(bl_path, "r", encoding="utf-8") as f:
            baseline_data = json.load(f)

        baseline_scores = baseline_data.get("scores", {})
        if not baseline_scores:
            result["error"] = "Baseline file has no 'scores' key."
            return result

        deltas: dict[str, float] = {}
        regressions: list[str] = []
        improvements: list[str] = []

        # Flatten scores -- handle nested dict (scorer_name -> {metric -> value})
        flat_current = _flatten_scores(current_scores)
        flat_baseline = _flatten_scores(baseline_scores)

        # Compute deltas for all metrics present in current results
        all_metrics = set(flat_current.keys()) | set(flat_baseline.keys())
        for metric in sorted(all_metrics):
            current_val = flat_current.get(metric, 0.0)
            baseline_val = flat_baseline.get(metric, 0.0)

            try:
                delta = float(current_val) - float(baseline_val)
            except (TypeError, ValueError):
                continue

            deltas[metric] = round(delta, 6)

            if delta < -0.001:  # Tolerance for floating point
                regressions.append(metric)
            elif delta > 0.001:
                improvements.append(metric)

        result["success"] = True
        result["deltas"] = deltas
        result["regressions"] = regressions
        result["improvements"] = improvements
        result["has_regression"] = len(regressions) > 0

        logger.info(
            "Regression check: %d improvements, %d regressions out of %d metrics",
            len(improvements), len(regressions), len(deltas),
        )

    except json.JSONDecodeError as exc:
        result["error"] = f"Invalid JSON in baseline: {exc}"
    except Exception as exc:
        logger.exception("get_regression_delta failed")
        result["error"] = str(exc)

    return result


# ---------------------------------------------------------------------------
# DSPy Integration Helper
# ---------------------------------------------------------------------------


def as_dspy_metric(task_results: dict[str, Any]) -> float:
    """
    Convert Inspect AI scores to a single float metric for DSPy optimization.

    Extracts the primary accuracy metric from an Inspect evaluation result
    and returns it as a float between 0.0 and 1.0.  This can be used as
    the metric function in DSPy's MIPROv2 or GEPA optimizers to optimize
    prompts based on eval benchmark performance.

    Args:
        task_results: A result dict from ``run_eval`` or ``score``,
                      containing a ``scores`` or ``metrics`` key.

    Returns:
        Float between 0.0 and 1.0 representing the primary score.
        Returns 0.0 if no score can be extracted.

    Example::

        from integrations.inspect_bridge import as_dspy_metric
        from integrations.dspy_bridge import optimize_prompt

        eval_result = await run_eval(suite_id="test", ...)
        metric_value = as_dspy_metric(eval_result)
        # Use metric_value in DSPy optimization loop
    """
    # Try direct accuracy from score() results
    metrics = task_results.get("metrics", {})
    if "accuracy" in metrics:
        try:
            return float(metrics["accuracy"])
        except (TypeError, ValueError):
            pass

    # Try nested scores from run_eval() results
    scores = task_results.get("scores", {})
    if scores:
        flat = _flatten_scores(scores)
        # Prefer 'accuracy' metric, then 'mean', then first numeric value
        for preferred_key in ("accuracy", "mean", "score"):
            if preferred_key in flat:
                try:
                    return float(flat[preferred_key])
                except (TypeError, ValueError):
                    continue

        # Fall back to first numeric value
        for val in flat.values():
            try:
                return float(val)
            except (TypeError, ValueError):
                continue

    # Last resort: direct accuracy field
    if "accuracy" in task_results:
        try:
            return float(task_results["accuracy"])
        except (TypeError, ValueError):
            pass

    return 0.0


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------


async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Unified dispatch for the ToolRegistry.

    Routes an operation name and parameter dict to the appropriate bridge
    function.  This is the primary entry point used by
    ``ToolRegistry.execute("inspect_ai", operation, params)``.

    Supported operations:
        run_eval             -> run_eval(**params)
        score                -> score(**params)
        load_dataset         -> load_dataset(**params)
        create_task          -> create_task(**params)
        get_regression_delta -> get_regression_delta(**params)
        status               -> status().__dict__
        init                 -> init()
        capabilities         -> capabilities()

    Args:
        operation:  Name of the operation to execute.
        params:     Keyword arguments forwarded to the operation function.

    Returns:
        dict with at least ``success`` and ``error`` keys.
    """
    dispatch: dict[str, Any] = {
        "run_eval": run_eval,
        "score": score,
        "load_dataset": load_dataset,
        "create_task": create_task,
        "get_regression_delta": get_regression_delta,
        # Sync operations handled specially below
        "status": None,
        "init": None,
        "capabilities": None,
    }

    if operation not in dispatch:
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(sorted(dispatch.keys()))}"
            ),
        }

    # Synchronous operations
    if operation == "status":
        s = status()
        return {
            "success": s.healthy,
            "name": s.name,
            "available": s.available,
            "healthy": s.healthy,
            "version": s.version,
            "error": s.error,
        }
    if operation == "init":
        return init()
    if operation == "capabilities":
        return {"success": True, "capabilities": capabilities()}

    # Async operations
    func = dispatch[operation]

    async def _do_operation():
        return await func(**params)

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("inspect_ai", "evaluate"):
            return await _do_operation()
    except Exception as coord_err:
        logger.warning(
            "ResourceCoordinator unavailable, running without coordination: %s",
            coord_err,
        )
        try:
            return await _do_operation()
        except TypeError as exc:
            return {
                "success": False,
                "error": f"Invalid parameters for '{operation}': {exc}",
            }
        except Exception as exc:
            logger.exception("execute(%s) failed", operation)
            return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_solver_chain(solver_config: dict[str, Any]) -> Any:
    """
    Build an Inspect AI solver chain from a configuration dict.

    Args:
        solver_config: Dict with at least a ``type`` key.

    Returns:
        A solver or list of solvers for an Inspect Task.
    """
    from inspect_ai.solver import generate, system_message, chain_of_thought

    solver_type = solver_config.get("type", "generate")
    solvers = []

    # Add system message if specified
    sys_msg = solver_config.get("system_message")
    if sys_msg:
        solvers.append(system_message(sys_msg))

    # Add primary solver
    if solver_type == "chain_of_thought":
        solvers.append(chain_of_thought())
        solvers.append(generate())
    elif solver_type == "system_message":
        # system_message already added above; just generate
        solvers.append(generate())
    else:
        # Default: direct generation
        solvers.append(generate())

    return solvers


def _build_scorer(scorer_type: str) -> Any:
    """
    Build an Inspect AI scorer from a type name.

    Args:
        scorer_type: One of the keys in SCORER_TYPES.

    Returns:
        A scorer callable for an Inspect Task.
    """
    from inspect_ai.scorer import match as match_scorer
    from inspect_ai.scorer import model_graded_fact, includes

    scorers = {
        "match": match_scorer,
        "model_graded_fact": model_graded_fact,
        "includes": includes,
    }

    scorer_fn = scorers.get(scorer_type)
    if scorer_fn is None:
        logger.warning(
            "Unknown scorer '%s', falling back to 'match'", scorer_type,
        )
        scorer_fn = match_scorer

    return scorer_fn()


def _flatten_scores(scores: dict[str, Any]) -> dict[str, Any]:
    """
    Flatten a potentially nested scores dict into a flat metric -> value dict.

    Handles both flat dicts (``{"accuracy": 0.85}``) and nested dicts
    (``{"match": {"accuracy": 0.85, "mean": 0.80}}``).

    Args:
        scores: The scores dict to flatten.

    Returns:
        Flat dict of metric_name -> value.
    """
    flat: dict[str, Any] = {}
    for key, value in scores.items():
        if isinstance(value, dict):
            for inner_key, inner_value in value.items():
                flat_key = f"{key}/{inner_key}" if key != "default" else inner_key
                flat[flat_key] = inner_value
                # Also store without prefix for easier lookup
                if inner_key not in flat:
                    flat[inner_key] = inner_value
        else:
            flat[key] = value
    return flat


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Inspect AI Bridge for Super-Goose",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--selftest", action="store_true",
        help="Run a quick self-test to verify the bridge is functional.",
    )
    parser.add_argument(
        "--load-dataset", metavar="PATH",
        help="Load and inspect a dataset file.",
    )

    args = parser.parse_args()

    # Configure logging for CLI
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    async def _run_selftest() -> None:
        """Self-test: init, status, capabilities, create task."""
        print("=" * 60)
        print("Inspect AI Bridge Self-Test")
        print("=" * 60)

        # 1. Init
        print("\n[1/5] Initializing bridge...")
        init_result = init()
        print(f"  success:  {init_result['success']}")
        print(f"  version:  {init_result['version']}")
        print(f"  error:    {init_result['error']}")

        # 2. Status
        print("\n[2/5] Checking status...")
        s = status()
        print(f"  name:      {s.name}")
        print(f"  available: {s.available}")
        print(f"  healthy:   {s.healthy}")
        print(f"  version:   {s.version}")
        print(f"  error:     {s.error}")

        # 3. Capabilities
        print("\n[3/5] Capabilities:")
        for cap in capabilities():
            print(f"    - {cap}")

        # 4. Create a test task
        print("\n[4/5] Creating test task 'selftest_task'...")
        task_result = await create_task(
            name="selftest_task",
            solver="chain_of_thought",
            scorer="match",
            description="Self-test task for bridge verification.",
        )
        print(f"  success: {task_result['success']}")
        print(f"  name:    {task_result['name']}")
        print(f"  solver:  {task_result.get('solver')}")
        print(f"  scorer:  {task_result.get('scorer')}")

        # 5. Test score operation
        print("\n[5/5] Testing score operation...")
        score_result = await score(
            task_results={
                "predictions": [
                    {"input": "q1", "output": "42", "expected": "42"},
                    {"input": "q2", "output": "hello", "expected": "hello"},
                    {"input": "q3", "output": "wrong", "expected": "right"},
                ],
            },
            scorer_type="match",
        )
        print(f"  success:  {score_result['success']}")
        print(f"  accuracy: {score_result['accuracy']}")
        print(f"  passed:   {score_result['passed']}/{score_result['total']}")

        # 6. Test as_dspy_metric
        print("\n  as_dspy_metric: {:.4f}".format(as_dspy_metric(score_result)))

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_load_dataset() -> None:
        """Load and display a dataset."""
        init()
        ds_result = await load_dataset(path=args.load_dataset)
        print(json.dumps(ds_result, indent=2, default=str))

    if args.selftest:
        asyncio.run(_run_selftest())
    elif args.load_dataset:
        asyncio.run(_run_load_dataset())
    else:
        parser.print_help()
