"""
DSPy Bridge - Prompt optimization and signature compilation for Super-Goose.

Wraps DSPy's core functionality (Signatures, Modules, MIPROv2/GEPA optimizers,
compiled prompt persistence) for use by Goose agents through the Conscious
bridge layer.

DSPy enables *programming* with LLMs rather than *prompting* them.  Instead of
hand-crafting prompt text, you declare typed I/O signatures and let DSPy's
optimizers (MIPROv2, GEPA) search for optimal instructions, few-shot examples,
and prompt structures automatically.

This bridge exposes the following operations:
    optimize_prompt     - Run MIPROv2 or GEPA to optimize a prompt string
    create_signature    - Build a dspy.Signature dynamically from I/O fields
    compile_signatures  - Compile signatures with the MIPROv2 optimizer
    save_compiled       - Persist compiled signatures to JSON
    load_compiled       - Load previously compiled signatures from JSON
    list_signatures     - List all registered signatures
    evaluate_prompt     - Score a prompt against test cases

Architecture:
    1. Direct import of the ``dspy`` package (preferred, zero overhead).
    2. Subprocess fallback when dspy is not importable (isolated execution).

The bridge is registered in config/external_tools.toml under [tools.dspy]
and discovered by the ToolRegistry at startup.

Usage via ToolRegistry::

    result = await registry.execute("dspy", "optimize_prompt", {
        "task_description": "Summarize a code diff into a commit message",
        "current_prompt": "You are a git commit message writer...",
    })

Direct usage::

    from integrations.dspy_bridge import optimize_prompt, create_signature

    sig = await create_signature(
        name="CommitWriter",
        input_fields={"diff": "str", "file_list": "list[str]"},
        output_fields={"message": "str"},
        instructions="Write a concise, conventional commit message.",
    )
    result = await optimize_prompt(
        task_description="Generate commit messages",
        current_prompt="Summarize the diff",
    )

Reference:
    DSPy docs:  https://dspy.ai
    DSPy repo:  https://github.com/stanfordnlp/dspy
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

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

#: Default path for persisted compiled prompts.
DEFAULT_COMPILED_PATH = Path(
    os.environ.get(
        "DSPY_COMPILED_PATH",
        str(Path.home() / ".config" / "goose" / "dspy" / "compiled_prompts.json"),
    )
)

#: Subprocess timeout for DSPy optimization calls (seconds).
#: Optimization can be very slow -- MIPROv2 with 30 candidates may take 20+ min.
OPTIMIZE_TIMEOUT = 1800  # 30 minutes

#: Subprocess timeout for quick operations (status, list, etc.).
QUICK_TIMEOUT = 30  # 30 seconds

#: Default number of MIPROv2 candidate prompts to explore.
DEFAULT_NUM_CANDIDATES = 30

#: Supported optimizer backends.
OPTIMIZERS: dict[str, str] = {
    "MIPROv2": (
        "Bayesian optimization over prompt instructions and few-shot examples. "
        "Explores num_candidates variations and selects the best by metric score. "
        "Recommended for production prompt tuning."
    ),
    "GEPA": (
        "Reflective prompt evolution via Generative Estimation of Prompt Aptitude. "
        "Uses the LLM itself to critique and improve prompts iteratively. "
        "Lighter-weight than MIPROv2 but less exhaustive."
    ),
}

#: Default LLM model for DSPy operations.  Can be overridden via environment.
DEFAULT_MODEL: Optional[str] = os.environ.get("DSPY_MODEL", "openai/gpt-4o-mini")


# ---------------------------------------------------------------------------
# Lazy globals -- populated by init()
# ---------------------------------------------------------------------------

_dspy: Any = None                     # dspy top-level module
_initialized: bool = False
_init_error: Optional[str] = None
_version: Optional[str] = None

#: Registry of dynamically created signatures: name -> signature class.
_signatures: dict[str, Any] = {}

#: Registry of compiled modules: name -> compiled dspy.Module.
_compiled_modules: dict[str, Any] = {}

#: The currently configured dspy.LM instance (set during init).
_lm: Any = None

#: Async lock protecting LM reconfiguration in async code paths.
#: Any async code that calls ``dspy.configure(lm=...)`` or mutates ``_lm``
#: must hold this lock to prevent concurrent operations from seeing a
#: half-configured LM.
#: IMPORTANT: Must be created lazily inside async context, NOT at module level.
_lm_lock: Optional[asyncio.Lock] = None


async def _get_lm_lock() -> asyncio.Lock:
    """Return the async LM lock, creating it lazily inside the event loop."""
    global _lm_lock
    if _lm_lock is None:
        _lm_lock = asyncio.Lock()
    return _lm_lock

#: Thread lock protecting LM configuration during synchronous init().
#: This guards the one-time setup in init() which runs outside the
#: event loop.
_lm_init_lock: threading.Lock = threading.Lock()


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init(model: Optional[str] = None) -> dict[str, Any]:
    """
    Initialize the DSPy bridge.

    Attempts to import ``dspy`` and configure a default LM.  Safe to call
    multiple times -- subsequent calls are no-ops that return cached state.

    Args:
        model: LLM model identifier for ``dspy.LM()``.
               Defaults to the ``DSPY_MODEL`` environment variable or
               ``"openai/gpt-4o-mini"``.

    Returns:
        dict with keys:
            success (bool):   True if DSPy is available and configured.
            version (str):    DSPy version string, or None.
            error (str):      Error message if initialization failed.
    """
    global _dspy, _initialized, _init_error, _version, _lm

    if _initialized:
        return {
            "success": _dspy is not None,
            "version": _version,
            "error": _init_error,
        }

    try:
        import dspy  # noqa: WPS433
        _dspy = dspy
        _version = getattr(dspy, "__version__", getattr(dspy, "version", None))
        if _version is None:
            try:
                import importlib.metadata
                _version = importlib.metadata.version("dspy")
            except Exception:
                _version = "unknown"
    except ImportError as exc:
        _init_error = (
            f"Failed to import dspy: {exc}. "
            "Install with: pip install dspy"
        )
        _initialized = True
        logger.error(_init_error)
        return {"success": False, "version": None, "error": _init_error}

    # Configure default LM (guarded by threading lock for sync safety)
    target_model = model or DEFAULT_MODEL
    with _lm_init_lock:
        try:
            _lm = dspy.LM(target_model)
            dspy.configure(lm=_lm)
            logger.info("DSPy bridge: configured LM=%s", target_model)
        except Exception as exc:
            # LM configuration failure is non-fatal -- user can reconfigure later.
            logger.warning(
                "DSPy bridge: LM configuration failed for %s: %s. "
                "Operations requiring an LM will fail until reconfigured.",
                target_model, exc,
            )

    _initialized = True
    logger.info("DSPy bridge initialized (version=%s)", _version)

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
    Return the current health status of the DSPy tool.

    Called by ``ToolRegistry.check_status("dspy")`` to populate the
    registry dashboard.

    Checks both that the ``dspy`` package is importable **and** that
    the configured LM is responsive (i.e., ``dspy.configure(lm=...)``
    succeeded and the LM object exists).

    Returns:
        ToolStatus dataclass with availability, health, version, and
        any error information.
    """
    if not _initialized:
        init()

    available = _dspy is not None
    # Healthy requires: import succeeded, no init error, AND an LM is configured.
    # Without a configured LM, all operations that call the model will fail.
    lm_configured = _lm is not None
    healthy = available and _init_error is None and lm_configured

    error = _init_error
    if available and not lm_configured and error is None:
        error = (
            "DSPy imported but no LM configured.  "
            "Set DSPY_MODEL env var or call init(model='...') to configure."
        )

    return ToolStatus(
        name="DSPy",
        available=available,
        healthy=healthy,
        version=_version,
        error=error,
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
        "prompt_optimization",
        "signature_creation",
        "signature_compilation",
        "prompt_evaluation",
        "compiled_persistence",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------


async def optimize_prompt(
    task_description: str,
    current_prompt: str,
    *,
    dataset_path: Optional[str] = None,
    optimizer: str = "MIPROv2",
    num_candidates: int = DEFAULT_NUM_CANDIDATES,
    model: Optional[str] = None,
    metric_fn: Optional[Callable[..., float]] = None,
) -> dict[str, Any]:
    """
    Optimize a prompt using DSPy's MIPROv2 or GEPA optimizer.

    Given a task description and a current prompt, this function:
    1. Creates a dspy.Signature from the task description.
    2. Wraps the current prompt as instructions.
    3. Runs the selected optimizer to find improved prompt text.
    4. Returns the optimized prompt and metrics.

    If DSPy is not importable, falls back to a subprocess invocation
    of a helper script.

    Args:
        task_description:  Natural-language description of the task the
                           prompt is intended to accomplish.
        current_prompt:    The existing prompt text to optimize.
        dataset_path:      Optional path to a JSON/JSONL file containing
                           training examples.  Each example should have
                           ``input`` and ``output`` (or ``expected``) keys.
        optimizer:         Optimizer backend: ``"MIPROv2"`` or ``"GEPA"``.
        num_candidates:    Number of candidate prompts for MIPROv2 to explore.
        model:             LLM model override.  If None, uses the bridge default.
        metric_fn:         Optional custom metric function.  Should accept
                           ``(example, prediction, trace)`` and return a float
                           between 0 and 1.

    Returns:
        dict with keys:
            success (bool):            True if optimization completed.
            optimized_prompt (str):    The best prompt found.
            original_prompt (str):     The input prompt for comparison.
            optimizer (str):           Which optimizer was used.
            num_candidates (int):      How many candidates were explored.
            score (float):             Best metric score achieved.
            dataset_size (int):        Number of training examples used.
            duration_seconds (float):  Wall-clock time for optimization.
            error (str):               Error message if failed.
    """
    _ensure_init()

    start_time = time.monotonic()
    result: dict[str, Any] = {
        "success": False,
        "optimized_prompt": "",
        "original_prompt": current_prompt,
        "optimizer": optimizer,
        "num_candidates": num_candidates,
        "score": 0.0,
        "dataset_size": 0,
        "duration_seconds": 0.0,
        "error": None,
    }

    # Validate optimizer choice
    if optimizer not in OPTIMIZERS:
        result["error"] = (
            f"Unknown optimizer '{optimizer}'. "
            f"Available: {', '.join(OPTIMIZERS.keys())}"
        )
        return result

    try:
        import dspy  # noqa: WPS433

        # Reconfigure LM if a different model is requested.
        # Must hold _lm_lock to prevent concurrent LM stomping.
        if model and model != DEFAULT_MODEL:
            async with (await _get_lm_lock()):
                lm = dspy.LM(model)
                dspy.configure(lm=lm)

        # Load dataset if provided
        trainset: list[Any] = []
        if dataset_path:
            trainset = _load_dataset(dataset_path)
            result["dataset_size"] = len(trainset)

        # Build a simple Signature for the task
        sig_cls = _make_basic_signature(task_description, current_prompt)

        # Create a Predict module
        predict_module = dspy.Predict(sig_cls)

        # Define a default metric if none provided
        if metric_fn is None:
            def _default_metric(
                example: Any, prediction: Any, trace: Any = None,
            ) -> float:
                """Simple exact-match metric."""
                expected = getattr(
                    example, "output", getattr(example, "expected", ""),
                )
                predicted = getattr(prediction, "output", "")
                if not expected:
                    return 1.0  # No ground truth -> pass
                return (
                    1.0
                    if str(predicted).strip() == str(expected).strip()
                    else 0.0
                )
            metric_fn = _default_metric

        # Run the optimizer
        if optimizer == "MIPROv2":
            opt = dspy.MIPROv2(
                metric=metric_fn,
                num_candidates=num_candidates,
                verbose=False,
            )
        else:
            # GEPA
            opt = dspy.GEPA(
                metric=metric_fn,
                verbose=False,
            )

        # If we have training data, compile the module
        synthetic: list[Any] = []
        if trainset:
            compiled = opt.compile(predict_module, trainset=trainset)
        else:
            # With no dataset, do a minimal self-optimization pass
            synthetic = _generate_synthetic_examples(
                dspy, task_description, count=5,
            )
            result["dataset_size"] = len(synthetic)
            compiled = opt.compile(predict_module, trainset=synthetic)

        # Extract the optimized prompt/instructions from the compiled module
        optimized_prompt = _extract_instructions(compiled, sig_cls)

        # Compute a final score if we have data
        score = 0.0
        eval_set = trainset if trainset else synthetic
        if eval_set:
            correct = 0.0
            eval_subset = eval_set[:20]  # Cap evaluation at 20 examples
            for ex in eval_subset:
                try:
                    pred = compiled(
                        **{k: getattr(ex, k) for k in sig_cls.input_fields}
                    )
                    s = metric_fn(ex, pred)
                    correct += s
                except Exception:
                    pass
            score = correct / max(len(eval_subset), 1)

        result["success"] = True
        result["optimized_prompt"] = optimized_prompt
        result["score"] = round(score, 4)

    except ImportError:
        # Fallback: run via subprocess
        return await _optimize_via_subprocess(
            task_description, current_prompt, dataset_path,
            optimizer, num_candidates, model, result,
        )
    except Exception as exc:
        logger.exception("optimize_prompt failed")
        result["error"] = str(exc)

    result["duration_seconds"] = round(time.monotonic() - start_time, 2)
    return result


async def create_signature(
    name: str,
    input_fields: dict[str, str],
    output_fields: dict[str, str],
    instructions: str = "",
) -> dict[str, Any]:
    """
    Create a dspy.Signature dynamically from field descriptors.

    A Signature declares the typed I/O contract for a DSPy module.
    Input and output fields are specified as ``{"field_name": "description"}``
    dicts.  Field types default to ``str`` (DSPy's convention).

    The created signature is registered in the bridge's internal registry
    and can be referenced by name in subsequent operations.

    Args:
        name:           Unique name for this signature (e.g. ``"CommitWriter"``).
        input_fields:   Mapping of input field names to their descriptions.
        output_fields:  Mapping of output field names to their descriptions.
        instructions:   Docstring / instructions for the signature.  This
                        becomes the system-level guidance text that DSPy
                        optimizers can refine.

    Returns:
        dict with keys:
            success (bool):       True if the signature was created.
            name (str):           The signature name.
            input_fields (list):  List of input field names.
            output_fields (list): List of output field names.
            instructions (str):   The instructions text.
            error (str):          Error message if failed.
    """
    _ensure_init()

    try:
        import dspy  # noqa: WPS433

        # Build the signature class dynamically using dspy.Signature subclassing
        sig_fields: dict[str, Any] = {}
        sig_annotations: dict[str, type] = {}

        for field_name, desc in input_fields.items():
            sig_fields[field_name] = dspy.InputField(desc=desc)
            sig_annotations[field_name] = str

        for field_name, desc in output_fields.items():
            sig_fields[field_name] = dspy.OutputField(desc=desc)
            sig_annotations[field_name] = str

        # Create the class with a docstring as instructions
        sig_fields["__doc__"] = instructions or f"Signature: {name}"
        sig_fields["__annotations__"] = sig_annotations

        sig_cls = type(name, (dspy.Signature,), sig_fields)

        # Register it
        _signatures[name] = sig_cls

        logger.info(
            "Signature '%s' created with %d inputs, %d outputs",
            name, len(input_fields), len(output_fields),
        )

        return {
            "success": True,
            "name": name,
            "input_fields": list(input_fields.keys()),
            "output_fields": list(output_fields.keys()),
            "instructions": instructions,
            "error": None,
        }

    except Exception as exc:
        logger.exception("create_signature failed for '%s'", name)
        return {
            "success": False,
            "name": name,
            "input_fields": list(input_fields.keys()),
            "output_fields": list(output_fields.keys()),
            "instructions": instructions,
            "error": str(exc),
        }


async def compile_signatures(
    signatures: list[str],
    *,
    metric_fn: Optional[Callable[..., float]] = None,
    num_candidates: int = DEFAULT_NUM_CANDIDATES,
    dataset_path: Optional[str] = None,
    optimizer: str = "MIPROv2",
) -> dict[str, Any]:
    """
    Compile one or more registered signatures with the MIPROv2 optimizer.

    Compilation transforms raw signatures into optimized modules with
    refined instructions and few-shot demonstrations selected by the
    optimizer.

    Args:
        signatures:     List of signature names (previously created via
                        ``create_signature``).
        metric_fn:      Custom metric function.  If None, uses an exact-match
                        metric.
        num_candidates: Number of prompt candidates for MIPROv2 to explore.
        dataset_path:   Optional path to training data (JSON/JSONL).
        optimizer:      Optimizer backend name.

    Returns:
        dict with keys:
            success (bool):        True if all signatures were compiled.
            compiled (list[str]):  Names of successfully compiled signatures.
            failed (list[dict]):   Names and errors of failed compilations.
            error (str):           Top-level error message if the whole
                                   operation failed.
    """
    _ensure_init()

    compiled_names: list[str] = []
    failed_list: list[dict[str, str]] = []

    # Validate all signature names first
    missing = [s for s in signatures if s not in _signatures]
    if missing:
        return {
            "success": False,
            "compiled": [],
            "failed": [
                {"name": m, "error": "Signature not found"} for m in missing
            ],
            "error": f"Unknown signatures: {', '.join(missing)}",
        }

    try:
        import dspy  # noqa: WPS433

        # Load dataset
        trainset: list[Any] = []
        if dataset_path:
            trainset = _load_dataset(dataset_path)

        # Default metric
        if metric_fn is None:
            def _default_metric(
                example: Any, prediction: Any, trace: Any = None,
            ) -> float:
                expected = getattr(
                    example, "output", getattr(example, "expected", ""),
                )
                predicted = getattr(prediction, "output", "")
                if not expected:
                    return 1.0
                return (
                    1.0
                    if str(predicted).strip() == str(expected).strip()
                    else 0.0
                )
            metric_fn = _default_metric

        for sig_name in signatures:
            sig_cls = _signatures[sig_name]

            try:
                predict_module = dspy.Predict(sig_cls)

                if optimizer == "MIPROv2":
                    opt = dspy.MIPROv2(
                        metric=metric_fn,
                        num_candidates=num_candidates,
                        verbose=False,
                    )
                elif optimizer == "GEPA":
                    opt = dspy.GEPA(
                        metric=metric_fn,
                        verbose=False,
                    )
                else:
                    failed_list.append({
                        "name": sig_name,
                        "error": f"Unknown optimizer: {optimizer}",
                    })
                    continue

                # Use training data or generate synthetic
                data = trainset if trainset else _generate_synthetic_examples(
                    dspy, sig_cls.__doc__ or sig_name, count=5,
                )

                compiled = opt.compile(predict_module, trainset=data)
                _compiled_modules[sig_name] = compiled
                compiled_names.append(sig_name)

                logger.info("Compiled signature '%s' successfully", sig_name)

            except Exception as exc:
                logger.error(
                    "Failed to compile signature '%s': %s", sig_name, exc,
                )
                failed_list.append({"name": sig_name, "error": str(exc)})

        return {
            "success": len(failed_list) == 0,
            "compiled": compiled_names,
            "failed": failed_list,
            "error": (
                None
                if not failed_list
                else f"{len(failed_list)} compilation(s) failed"
            ),
        }

    except Exception as exc:
        logger.exception("compile_signatures failed")
        return {
            "success": False,
            "compiled": compiled_names,
            "failed": failed_list,
            "error": str(exc),
        }


async def save_compiled(
    path: Optional[str] = None,
    signatures: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Save compiled signatures to a JSON file.

    Persists the compiled module state (optimized instructions, few-shot
    examples, configuration) so it can be loaded later without re-running
    the optimizer.

    Args:
        path:        File path for the output JSON.  Defaults to
                     ``~/.config/goose/dspy/compiled_prompts.json``.
        signatures:  Optional list of signature names to save.  If None,
                     saves all compiled signatures.

    Returns:
        dict with keys:
            success (bool):     True if the file was written.
            path (str):         The resolved output file path.
            saved (list[str]):  Names of saved signatures.
            error (str):        Error message if failed.
    """
    _ensure_init()

    save_path = Path(path) if path else DEFAULT_COMPILED_PATH

    # Determine which signatures to save
    if signatures:
        missing = [s for s in signatures if s not in _compiled_modules]
        if missing:
            return {
                "success": False,
                "path": str(save_path),
                "saved": [],
                "error": f"Not compiled: {', '.join(missing)}. Compile first.",
            }
        to_save = {name: _compiled_modules[name] for name in signatures}
    else:
        to_save = dict(_compiled_modules)

    if not to_save:
        return {
            "success": False,
            "path": str(save_path),
            "saved": [],
            "error": "No compiled signatures to save. Run compile_signatures first.",
        }

    try:
        # Ensure parent directory exists
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # Serialize compiled modules
        serialized: dict[str, Any] = {}
        for name, module in to_save.items():
            try:
                # DSPy modules support dump_state() for serialization
                if hasattr(module, "dump_state"):
                    serialized[name] = module.dump_state()
                elif hasattr(module, "state"):
                    serialized[name] = module.state()
                else:
                    # Fallback: extract what we can
                    state: dict[str, Any] = {}
                    if hasattr(module, "demos"):
                        state["demos"] = [
                            d.toDict() if hasattr(d, "toDict") else str(d)
                            for d in module.demos
                        ]
                    if hasattr(module, "signature"):
                        state["instructions"] = str(
                            module.signature.instructions
                        )
                    serialized[name] = state
            except Exception as exc:
                logger.warning("Could not serialize '%s': %s", name, exc)
                serialized[name] = {"error": str(exc)}

        # Atomic write: write to temp file, then rename to avoid
        # corrupting the JSON if a concurrent write or crash occurs.
        import tempfile as _tempfile
        dir_name = os.path.dirname(str(save_path)) or "."
        with _tempfile.NamedTemporaryFile(
            mode="w", dir=dir_name, delete=False, suffix=".tmp", encoding="utf-8",
        ) as f:
            json.dump(serialized, f, indent=2, default=str)
            tmp_path = f.name
        os.replace(tmp_path, str(save_path))

        saved_names = list(serialized.keys())
        logger.info(
            "Saved %d compiled signatures to %s", len(saved_names), save_path,
        )

        return {
            "success": True,
            "path": str(save_path),
            "saved": saved_names,
            "error": None,
        }

    except Exception as exc:
        logger.exception("save_compiled failed")
        return {
            "success": False,
            "path": str(save_path),
            "saved": [],
            "error": str(exc),
        }


async def load_compiled(
    path: Optional[str] = None,
) -> dict[str, Any]:
    """
    Load previously compiled signatures from a JSON file.

    Restores compiled module state so that optimized prompts can be used
    without re-running the optimizer.

    Args:
        path:  File path to read.  Defaults to
               ``~/.config/goose/dspy/compiled_prompts.json``.

    Returns:
        dict with keys:
            success (bool):      True if the file was loaded.
            path (str):          The resolved file path.
            loaded (list[str]):  Names of loaded signatures.
            error (str):         Error message if failed.
    """
    _ensure_init()

    load_path = Path(path) if path else DEFAULT_COMPILED_PATH

    if not load_path.exists():
        return {
            "success": False,
            "path": str(load_path),
            "loaded": [],
            "error": f"File not found: {load_path}",
        }

    try:
        import dspy  # noqa: WPS433

        with open(load_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        loaded_names: list[str] = []

        for name, state in data.items():
            try:
                if (
                    isinstance(state, dict)
                    and "error" in state
                    and len(state) == 1
                ):
                    logger.warning(
                        "Skipping '%s': was saved with error", name,
                    )
                    continue

                # If the signature exists, rebuild the compiled module
                if name in _signatures:
                    sig_cls = _signatures[name]
                    module = dspy.Predict(sig_cls)

                    # Restore state
                    if hasattr(module, "load_state") and isinstance(state, dict):
                        module.load_state(state)
                    elif isinstance(state, dict):
                        if "demos" in state:
                            module.demos = state["demos"]
                        if "instructions" in state and hasattr(module, "signature"):
                            module.signature = module.signature.with_instructions(
                                state["instructions"]
                            )

                    _compiled_modules[name] = module
                    loaded_names.append(name)
                else:
                    # Store raw state for later use when signature is created
                    _compiled_modules[name] = state
                    loaded_names.append(name)

                logger.info("Loaded compiled state for '%s'", name)

            except Exception as exc:
                logger.warning("Failed to load '%s': %s", name, exc)

        return {
            "success": True,
            "path": str(load_path),
            "loaded": loaded_names,
            "error": None,
        }

    except json.JSONDecodeError as exc:
        return {
            "success": False,
            "path": str(load_path),
            "loaded": [],
            "error": f"Invalid JSON: {exc}",
        }
    except Exception as exc:
        logger.exception("load_compiled failed")
        return {
            "success": False,
            "path": str(load_path),
            "loaded": [],
            "error": str(exc),
        }


async def list_signatures() -> dict[str, Any]:
    """
    List all registered signatures and their compilation status.

    Returns:
        dict with keys:
            success (bool):         Always True.
            count (int):            Number of registered signatures.
            signatures (list):      List of signature info dicts, each with:
                name (str):         Signature name.
                input_fields (list): Input field names.
                output_fields (list): Output field names.
                instructions (str): Current instructions text.
                compiled (bool):    Whether the signature has been compiled.
    """
    if not _initialized:
        init()

    sigs_info: list[dict[str, Any]] = []

    for name, sig_cls in _signatures.items():
        info: dict[str, Any] = {
            "name": name,
            "input_fields": [],
            "output_fields": [],
            "instructions": "",
            "compiled": name in _compiled_modules,
        }

        try:
            if hasattr(sig_cls, "input_fields"):
                info["input_fields"] = list(
                    sig_cls.input_fields.keys()
                    if hasattr(sig_cls.input_fields, "keys")
                    else sig_cls.input_fields
                )
            if hasattr(sig_cls, "output_fields"):
                info["output_fields"] = list(
                    sig_cls.output_fields.keys()
                    if hasattr(sig_cls.output_fields, "keys")
                    else sig_cls.output_fields
                )
            if hasattr(sig_cls, "__doc__") and sig_cls.__doc__:
                info["instructions"] = sig_cls.__doc__.strip()
        except Exception:
            pass

        sigs_info.append(info)

    return {
        "success": True,
        "count": len(sigs_info),
        "signatures": sigs_info,
    }


async def cleanup_stale(
    max_signatures: int = 50,
    max_compiled: int = 50,
) -> dict[str, Any]:
    """
    Prune old signatures and compiled modules to prevent unbounded memory growth.

    Keeps the most recently registered entries up to the specified limits.
    Since Python dicts are insertion-ordered (3.7+), older entries are at the
    front.

    Args:
        max_signatures: Maximum number of signatures to retain.
        max_compiled:   Maximum number of compiled modules to retain.

    Returns:
        dict with keys:
            success (bool):              Always True.
            signatures_pruned (int):     Number of signatures removed.
            compiled_pruned (int):       Number of compiled modules removed.
            signatures_remaining (int):  Signatures kept.
            compiled_remaining (int):    Compiled modules kept.
    """
    sigs_pruned = 0
    compiled_pruned = 0

    # Prune signatures
    if len(_signatures) > max_signatures:
        excess = len(_signatures) - max_signatures
        keys_to_remove = list(_signatures.keys())[:excess]
        for key in keys_to_remove:
            del _signatures[key]
            sigs_pruned += 1
            logger.debug("Pruned stale signature: %s", key)

    # Prune compiled modules
    if len(_compiled_modules) > max_compiled:
        excess = len(_compiled_modules) - max_compiled
        keys_to_remove = list(_compiled_modules.keys())[:excess]
        for key in keys_to_remove:
            del _compiled_modules[key]
            compiled_pruned += 1
            logger.debug("Pruned stale compiled module: %s", key)

    if sigs_pruned or compiled_pruned:
        logger.info(
            "Cleanup: pruned %d signatures, %d compiled modules",
            sigs_pruned, compiled_pruned,
        )

    return {
        "success": True,
        "signatures_pruned": sigs_pruned,
        "compiled_pruned": compiled_pruned,
        "signatures_remaining": len(_signatures),
        "compiled_remaining": len(_compiled_modules),
    }


async def evaluate_prompt(
    prompt: str,
    test_cases: list[dict[str, str]],
    *,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    Score a prompt against a set of test cases.

    Runs the prompt through the LLM for each test case and computes
    accuracy metrics.  This is useful for comparing a hand-written
    prompt against a DSPy-optimized one.

    Each test case should have ``input`` and ``expected`` keys.

    Args:
        prompt:      The prompt text to evaluate.  The ``{input}`` placeholder
                     is replaced with each test case's input.
        test_cases:  List of dicts with ``input`` and ``expected`` keys.
        model:       LLM model override.

    Returns:
        dict with keys:
            success (bool):        True if evaluation completed.
            accuracy (float):      Fraction of test cases where the output
                                   matched the expected value (exact match).
            total (int):           Number of test cases evaluated.
            passed (int):          Number that passed.
            failed (int):          Number that failed.
            results (list):        Per-case results with input, expected,
                                   actual, and passed flag.
            duration_seconds (float): Wall-clock time.
            error (str):           Error message if failed.
    """
    _ensure_init()

    start_time = time.monotonic()
    result: dict[str, Any] = {
        "success": False,
        "accuracy": 0.0,
        "total": len(test_cases),
        "passed": 0,
        "failed": 0,
        "results": [],
        "duration_seconds": 0.0,
        "error": None,
    }

    if not test_cases:
        result["error"] = "No test cases provided"
        return result

    try:
        import dspy  # noqa: WPS433

        # Reconfigure LM if needed.
        # Must hold _lm_lock to prevent concurrent LM stomping.
        if model and model != DEFAULT_MODEL:
            async with (await _get_lm_lock()):
                lm = dspy.LM(model)
                dspy.configure(lm=lm)

        # Build a simple signature for evaluation
        class EvalSignature(dspy.Signature):
            """Evaluate a prompt against expected output."""
            input_text: str = dspy.InputField(desc="The input to process")
            output: str = dspy.OutputField(desc="The generated output")

        predict = dspy.Predict(EvalSignature)

        # Override instructions with the prompt being evaluated
        if hasattr(predict, "signature"):
            predict.signature = predict.signature.with_instructions(prompt)

        passed = 0
        case_results: list[dict[str, Any]] = []

        for case in test_cases:
            input_text = case.get("input", "")
            expected = case.get("expected", "")

            try:
                prediction = predict(input_text=input_text)
                actual = getattr(prediction, "output", "")
                is_pass = str(actual).strip() == str(expected).strip()

                if is_pass:
                    passed += 1

                case_results.append({
                    "input": input_text,
                    "expected": expected,
                    "actual": actual,
                    "passed": is_pass,
                })
            except Exception as exc:
                case_results.append({
                    "input": input_text,
                    "expected": expected,
                    "actual": "",
                    "passed": False,
                    "error": str(exc),
                })

        total = len(test_cases)
        result["success"] = True
        result["passed"] = passed
        result["failed"] = total - passed
        result["accuracy"] = round(passed / max(total, 1), 4)
        result["results"] = case_results

    except ImportError:
        result["error"] = (
            "DSPy is not available for evaluation. Install with: pip install dspy"
        )
    except Exception as exc:
        logger.exception("evaluate_prompt failed")
        result["error"] = str(exc)

    result["duration_seconds"] = round(time.monotonic() - start_time, 2)
    return result


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------


async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Unified dispatch for the ToolRegistry.

    Routes an operation name and parameter dict to the appropriate bridge
    function.  This is the primary entry point used by
    ``ToolRegistry.execute("dspy", operation, params)``.

    Supported operations:
        optimize_prompt    -> optimize_prompt(**params)
        create_signature   -> create_signature(**params)
        compile_signatures -> compile_signatures(**params)
        save_compiled      -> save_compiled(**params)
        load_compiled      -> load_compiled(**params)
        list_signatures    -> list_signatures()
        evaluate_prompt    -> evaluate_prompt(**params)
        status             -> status().__dict__
        init               -> init(**params)

    Args:
        operation:  Name of the operation to execute.
        params:     Keyword arguments forwarded to the operation function.

    Returns:
        dict with at least ``success`` and ``error`` keys.
    """
    dispatch: dict[str, Any] = {
        "optimize_prompt": optimize_prompt,
        "create_signature": create_signature,
        "compile_signatures": compile_signatures,
        "save_compiled": save_compiled,
        "load_compiled": load_compiled,
        "list_signatures": list_signatures,
        "evaluate_prompt": evaluate_prompt,
        "cleanup_stale": cleanup_stale,
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
        return init(**params)
    if operation == "capabilities":
        return {"success": True, "capabilities": capabilities()}

    # Async operations
    func = dispatch[operation]

    async def _do_operation():
        return await func(**params)

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("dspy", "optimize"):
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


def _load_dataset(path_str: str) -> list[Any]:
    """
    Load a training dataset from a JSON or JSONL file.

    Each record should have at least ``input`` and ``output`` (or
    ``expected``) keys.  Records are converted to ``dspy.Example``
    objects.

    Args:
        path_str: File path to the dataset.

    Returns:
        List of dspy.Example objects.

    Raises:
        FileNotFoundError: If the path does not exist.
        ValueError: If the file format is not recognized.
    """
    import dspy  # noqa: WPS433

    path = Path(path_str)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    records: list[dict[str, Any]] = []

    if path.suffix == ".jsonl":
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    elif path.suffix == ".json":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                records = data
            else:
                raise ValueError(
                    f"Expected a JSON array in {path}, got {type(data).__name__}"
                )
    else:
        raise ValueError(
            f"Unsupported dataset format: {path.suffix}. Use .json or .jsonl"
        )

    # Normalize keys: accept "expected" as an alias for "output"
    examples = []
    for rec in records:
        if "expected" in rec and "output" not in rec:
            rec["output"] = rec.pop("expected")
        input_keys = [k for k in rec if k != "output"]
        ex = dspy.Example(**rec).with_inputs(*input_keys)
        examples.append(ex)

    logger.info("Loaded %d examples from %s", len(examples), path)
    return examples


def _make_basic_signature(
    task_description: str,
    instructions: str,
) -> Any:
    """
    Create a basic input->output Signature for prompt optimization.

    The signature has one input field (``input``) and one output field
    (``output``), with the instructions set to the provided prompt text.

    Args:
        task_description: Description of the task (used for field desc).
        instructions: The prompt text to set as instructions.

    Returns:
        A dspy.Signature subclass.
    """
    import dspy  # noqa: WPS433

    class BasicSignature(dspy.Signature):
        pass

    BasicSignature.__doc__ = instructions
    BasicSignature.__annotations__ = {
        "input": str,
        "output": str,
    }

    # Set field descriptors
    BasicSignature.input = dspy.InputField(
        desc=f"Input for: {task_description}",
    )
    BasicSignature.output = dspy.OutputField(
        desc=f"Output for: {task_description}",
    )

    return BasicSignature


def _generate_synthetic_examples(
    dspy_module: Any,
    task_description: str,
    count: int = 5,
) -> list[Any]:
    """
    Generate synthetic training examples when no dataset is available.

    Creates minimal placeholder examples so the optimizer has something
    to work with.  In practice, users should provide real training data
    for meaningful optimization results.

    Args:
        dspy_module: The imported dspy module.
        task_description: Description of the task for example generation.
        count: Number of examples to generate.

    Returns:
        List of dspy.Example objects.
    """
    examples = []
    for i in range(count):
        ex = dspy_module.Example(
            input=f"Example input {i + 1} for: {task_description}",
            output=f"Example output {i + 1}",
        ).with_inputs("input")
        examples.append(ex)
    return examples


def _extract_instructions(
    compiled_module: Any,
    original_signature: Any,
) -> str:
    """
    Extract the optimized instructions from a compiled DSPy module.

    Tries several attributes that different DSPy versions use to store
    the optimized instructions.

    Args:
        compiled_module: The compiled dspy.Predict (or similar) module.
        original_signature: The original signature class for reference.

    Returns:
        The optimized instruction string, or the original if extraction fails.
    """
    # Try various ways DSPy exposes the optimized instructions
    try:
        if hasattr(compiled_module, "signature"):
            sig = compiled_module.signature
            if hasattr(sig, "instructions"):
                return str(sig.instructions)
            if hasattr(sig, "__doc__"):
                return sig.__doc__ or ""
    except Exception:
        pass

    try:
        if hasattr(compiled_module, "extended_signature"):
            return str(compiled_module.extended_signature.instructions)
    except Exception:
        pass

    # Fallback: return the original instructions
    if hasattr(original_signature, "__doc__"):
        return original_signature.__doc__ or ""

    return ""


async def _optimize_via_subprocess(
    task_description: str,
    current_prompt: str,
    dataset_path: Optional[str],
    optimizer: str,
    num_candidates: int,
    model: Optional[str],
    result: dict[str, Any],
) -> dict[str, Any]:
    """
    Fallback: run DSPy optimization via a subprocess.

    This is used when the ``dspy`` package cannot be imported directly
    (e.g. due to dependency conflicts) but is available as a CLI tool
    or via a separate Python environment.

    Args:
        task_description: The task description.
        current_prompt: The prompt to optimize.
        dataset_path: Optional training data path.
        optimizer: Optimizer name.
        num_candidates: Number of candidates.
        model: LLM model override.
        result: The result dict to populate.

    Returns:
        The populated result dict.
    """
    start_time = time.monotonic()

    target_model = model or DEFAULT_MODEL

    # Escape for embedding in a Python string literal
    safe_prompt = current_prompt.replace("\\", "\\\\").replace("'", "\\'")
    safe_task = task_description.replace("\\", "\\\\").replace("'", "\\'")

    num_cand_line = ""
    if optimizer == "MIPROv2":
        num_cand_line = f"    num_candidates={num_candidates},"

    script = "\n".join([
        "import json, sys",
        "try:",
        "    import dspy",
        "except ImportError:",
        "    print(json.dumps({'error': 'dspy not installed'}))",
        "    sys.exit(1)",
        "",
        f"lm = dspy.LM('{target_model}')",
        "dspy.configure(lm=lm)",
        "",
        "class Sig(dspy.Signature):",
        f"    '''{safe_prompt}'''",
        f"    input: str = dspy.InputField(desc='{safe_task}')",
        "    output: str = dspy.OutputField(desc='Generated output')",
        "",
        "predict = dspy.Predict(Sig)",
        "examples = [",
        "    dspy.Example(input=f'Example {i}', output=f'Output {i}').with_inputs('input')",
        "    for i in range(5)",
        "]",
        "",
        f"opt = dspy.{optimizer}(",
        "    metric=lambda e, p, t=None: 1.0,",
        num_cand_line,
        "    verbose=False,",
        ")",
        "",
        "compiled = opt.compile(predict, trainset=examples)",
        "instructions = ''",
        "if hasattr(compiled, 'signature') and hasattr(compiled.signature, 'instructions'):",
        "    instructions = str(compiled.signature.instructions)",
        "elif hasattr(compiled, 'extended_signature'):",
        "    instructions = str(compiled.extended_signature.instructions)",
        "",
        "print(json.dumps({'optimized_prompt': instructions, 'success': True}))",
    ])

    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-c", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=OPTIMIZE_TIMEOUT,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            result["error"] = (
                f"Subprocess optimization timed out after {OPTIMIZE_TIMEOUT}s"
            )
            result["duration_seconds"] = round(time.monotonic() - start_time, 2)
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        if process.returncode == 0 and stdout:
            try:
                sub_result = json.loads(stdout)
                result["success"] = sub_result.get("success", False)
                result["optimized_prompt"] = sub_result.get("optimized_prompt", "")
            except json.JSONDecodeError:
                result["error"] = f"Could not parse subprocess output: {stdout[:500]}"
        else:
            result["error"] = stderr or f"Subprocess exited with code {process.returncode}"

    except FileNotFoundError:
        result["error"] = "Python executable not found for subprocess fallback"
    except OSError as exc:
        result["error"] = f"Subprocess failed: {exc}"

    result["duration_seconds"] = round(time.monotonic() - start_time, 2)
    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="DSPy Bridge for Super-Goose",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Run a quick self-test to verify the bridge is functional.",
    )
    parser.add_argument(
        "--create-signature", metavar="NAME",
        help="Create a named signature.",
    )
    parser.add_argument(
        "--inputs", nargs="+", metavar="NAME:DESC",
        help="Input fields for --create-signature (format: name:description).",
    )
    parser.add_argument(
        "--outputs", nargs="+", metavar="NAME:DESC",
        help="Output fields for --create-signature (format: name:description).",
    )
    parser.add_argument(
        "--list-signatures", action="store_true",
        help="List all registered signatures.",
    )
    parser.add_argument(
        "--model", default=None,
        help="LLM model to use for initialization.",
    )

    args = parser.parse_args()

    # Configure logging for CLI
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    async def _run_test() -> None:
        """Self-test: init, create a signature, list, status."""
        print("=" * 60)
        print("DSPy Bridge Self-Test")
        print("=" * 60)

        # 1. Init
        print("\n[1/4] Initializing bridge...")
        init_result = init(model=args.model)
        print(f"  success:  {init_result['success']}")
        print(f"  version:  {init_result['version']}")
        print(f"  error:    {init_result['error']}")

        # 2. Status
        print("\n[2/4] Checking status...")
        s = status()
        print(f"  name:      {s.name}")
        print(f"  available: {s.available}")
        print(f"  healthy:   {s.healthy}")
        print(f"  version:   {s.version}")
        print(f"  error:     {s.error}")

        # 3. Capabilities
        print("\n[3/4] Capabilities:")
        for cap in capabilities():
            print(f"    - {cap}")

        # 4. Create a test signature
        print("\n[4/4] Creating test signature 'TestSig'...")
        sig_result = await create_signature(
            name="TestSig",
            input_fields={"question": "A question to answer"},
            output_fields={"answer": "The answer to the question"},
            instructions="Answer the question concisely.",
        )
        print(f"  success: {sig_result['success']}")
        print(f"  name:    {sig_result['name']}")
        print(f"  inputs:  {sig_result['input_fields']}")
        print(f"  outputs: {sig_result['output_fields']}")

        # List signatures
        sigs = await list_signatures()
        print(f"\n  Registered signatures: {sigs['count']}")
        for s_info in sigs["signatures"]:
            print(f"    - {s_info['name']} (compiled: {s_info['compiled']})")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_create_signature() -> None:
        """Create a signature from CLI arguments."""
        init(model=args.model)
        input_fields: dict[str, str] = {}
        for inp in (args.inputs or []):
            parts = inp.split(":", 1)
            input_fields[parts[0]] = parts[1] if len(parts) > 1 else parts[0]
        output_fields: dict[str, str] = {}
        for out in (args.outputs or []):
            parts = out.split(":", 1)
            output_fields[parts[0]] = parts[1] if len(parts) > 1 else parts[0]

        sig_result = await create_signature(
            name=args.create_signature,
            input_fields=input_fields,
            output_fields=output_fields,
        )
        print(json.dumps(sig_result, indent=2))

    async def _run_list_signatures() -> None:
        """List all registered signatures."""
        init(model=args.model)
        sig_result = await list_signatures()
        print(json.dumps(sig_result, indent=2))

    if args.test:
        asyncio.run(_run_test())
    elif args.create_signature:
        asyncio.run(_run_create_signature())
    elif args.list_signatures:
        asyncio.run(_run_list_signatures())
    else:
        parser.print_help()
