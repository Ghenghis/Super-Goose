"""
Overnight Gym - Stage 7 metacognitive self-improvement orchestrator.

Ties DSPy + Inspect AI + Mem0 into a nightly self-improvement loop that
autonomously benchmarks Super-Goose, optimizes its prompts, stores winning
trajectories, and tracks improvement metrics over time.

Architecture (one cycle):
    1. Load eval suite (Inspect AI)
    2. Run evals with current prompt pack
    3. Score results -> baseline metrics
    4. Store trajectories (success + failure) in Mem0
    5. DSPy optimizer analyzes patterns
    6. DSPy compiles new candidate prompt pack
    7. Re-run evals with candidate pack
    8. Promote if improved, rollback if not
    9. Log all metrics to Langfuse
    10. Sleep until next cycle

Prompt packs are versioned on disk::

    ~/.config/goose/dspy/prompt_packs/
        LATEST                  # text file pointing at current version dir
        v2026.02.09/
            pack.json           # compiled DSPy signatures
            manifest.json       # metadata: objective, metrics, model
            baseline_scores.json
        v2026.02.08/
            ...

Promotion rules enforce guardrails before any new pack goes live:
    - >= 2% overall score improvement
    - No critical (safety) task regressions
    - Cost increase <= 20%
    - Latency increase <= 30%
    - Minimum 10 eval tasks

Dependencies (bridge modules):
    integrations.dspy_bridge
    integrations.mem0_bridge
    integrations.langfuse_bridge

Optional:
    integrations.inspect_bridge       (eval suite runner)
    integrations.microsandbox_bridge  (sandboxed agent execution)

Configuration:
    Registered in config/external_tools.toml under [tools.overnight_gym].

Usage::

    # Full cycle
    python -m integrations.overnight_gym

    # Dry run (synthetic data, no promotion)
    python -m integrations.overnight_gym --dry-run

    # Self-test
    python -m integrations.overnight_gym --selftest

    # Via ToolRegistry
    result = await registry.execute("overnight_gym", "run_cycle", {
        "suite_id": "stage6_core",
        "max_tasks": 50,
    })
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resource coordination
# ---------------------------------------------------------------------------

try:
    from integrations.resource_coordinator import get_coordinator
except ImportError:
    get_coordinator = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Registry-compatible ToolStatus
# ---------------------------------------------------------------------------

try:
    from integrations.registry import ToolStatus
except ImportError:
    @dataclass
    class ToolStatus:  # type: ignore[no-redef]
        name: str
        available: bool
        healthy: bool
        error: Optional[str] = None
        version: Optional[str] = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_CONFIG_ROOT = Path(os.environ.get(
    "GOOSE_CONFIG_DIR",
    str(Path.home() / ".config" / "goose"),
))

#: Root directory for versioned prompt packs.
PROMPT_PACK_DIR = _CONFIG_ROOT / "dspy" / "prompt_packs"

#: Directory for per-cycle metric files.
METRICS_DIR = _CONFIG_ROOT / "gym" / "metrics"

#: Promotion guardrails.
PROMOTION_RULES: Dict[str, Any] = {
    "min_improvement_pct": 2.0,         # Must improve by at least 2%
    "no_critical_regression": True,     # No safety task score drops
    "max_cost_increase_pct": 20.0,      # Cost can't increase more than 20%
    "max_latency_increase_pct": 30.0,   # Latency can't increase more than 30%
    "min_eval_tasks": 10,               # Must evaluate at least 10 tasks
}

#: Categories considered critical (safety-sensitive).  A regression in any
#: of these blocks promotion even if the overall score improved.
CRITICAL_CATEGORIES = {"safety", "security", "correctness"}

#: Module version for status reporting.
_VERSION = "7.0.0"

# Timeout defaults (seconds)
EVAL_TIMEOUT = 600
OPTIMIZE_TIMEOUT = 300
STORE_TIMEOUT = 60


# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_init_error: Optional[str] = None
_dspy_bridge: Any = None
_mem0_bridge: Any = None
_langfuse_bridge: Any = None
_inspect_bridge: Any = None

# Active schedule (cron expression string or None)
_schedule_cron: Optional[str] = None
_schedule_task: Optional[asyncio.Task[None]] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init() -> Dict[str, Any]:
    """
    Initialize the Overnight Gym by importing all required bridge modules.

    Performs lazy import of dependency bridges (DSPy, Mem0, Langfuse,
    and optionally Inspect AI) and caches them at module level.
    Subsequent calls are no-ops.

    Returns:
        dict with keys:
            success (bool):     True if core bridges loaded.
            bridges (dict):     Per-bridge load status.
            error (str|None):   Summary error if any core bridge failed.
    """
    global _initialized, _init_error
    global _dspy_bridge, _mem0_bridge, _langfuse_bridge, _inspect_bridge

    with _init_lock:
        if _initialized:
            return _cached_init_result()

        bridges: Dict[str, Dict[str, Any]] = {}
        core_ok = True

        # -- DSPy bridge (core) --
        try:
            from integrations import dspy_bridge
            _dspy_bridge = dspy_bridge
            bridges["dspy"] = {"loaded": True, "error": None}
        except ImportError as exc:
            bridges["dspy"] = {"loaded": False, "error": str(exc)}
            core_ok = False
            logger.warning("Overnight Gym: dspy_bridge not available: %s", exc)

        # -- Mem0 bridge (core) --
        try:
            from integrations import mem0_bridge
            _mem0_bridge = mem0_bridge
            bridges["mem0"] = {"loaded": True, "error": None}
        except ImportError as exc:
            bridges["mem0"] = {"loaded": False, "error": str(exc)}
            core_ok = False
            logger.warning("Overnight Gym: mem0_bridge not available: %s", exc)

        # -- Langfuse bridge (core) --
        try:
            from integrations import langfuse_bridge
            _langfuse_bridge = langfuse_bridge
            bridges["langfuse"] = {"loaded": True, "error": None}
        except ImportError as exc:
            bridges["langfuse"] = {"loaded": False, "error": str(exc)}
            # Langfuse is non-fatal: we can run without observability
            logger.warning("Overnight Gym: langfuse_bridge not available: %s", exc)

        # -- Inspect AI bridge (optional, for real evals) --
        try:
            from integrations import inspect_bridge
            _inspect_bridge = inspect_bridge
            bridges["inspect_ai"] = {"loaded": True, "error": None}
        except ImportError as exc:
            bridges["inspect_ai"] = {"loaded": False, "error": str(exc)}
            logger.info("Overnight Gym: inspect_bridge not available (optional): %s", exc)

        _initialized = True

        if core_ok:
            _init_error = None
            logger.info("Overnight Gym initialized -- core bridges loaded")
        else:
            failed = [k for k, v in bridges.items() if not v["loaded"]]
            _init_error = f"Missing core bridges: {', '.join(failed)}"
            logger.warning("Overnight Gym: %s", _init_error)

        return {
            "success": core_ok,
            "bridges": bridges,
            "error": _init_error,
        }


def _cached_init_result() -> Dict[str, Any]:
    """Return a lightweight cached result after first init."""
    bridges = {
        "dspy": {"loaded": _dspy_bridge is not None, "error": None},
        "mem0": {"loaded": _mem0_bridge is not None, "error": None},
        "langfuse": {"loaded": _langfuse_bridge is not None, "error": None},
        "inspect_ai": {"loaded": _inspect_bridge is not None, "error": None},
    }
    all_core = _dspy_bridge is not None and _mem0_bridge is not None
    return {
        "success": all_core,
        "bridges": bridges,
        "error": _init_error,
    }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------


def status() -> ToolStatus:
    """
    Return the current health status of the Overnight Gym.

    Called by ``ToolRegistry.check_status("overnight_gym")``.

    Returns:
        ToolStatus with availability, health, and version information.
    """
    if not _initialized:
        init()

    all_core = _dspy_bridge is not None and _mem0_bridge is not None
    return ToolStatus(
        name="OvernightGym",
        available=all_core,
        healthy=all_core and _init_error is None,
        version=_VERSION,
        error=_init_error,
    )


def capabilities() -> List[str]:
    """
    Return the list of operations this module supports.

    Returns:
        List of capability strings.
    """
    return [
        "overnight_run",
        "prompt_pack_management",
        "regression_detection",
        "dry_run",
        "metrics_report",
    ]


# ---------------------------------------------------------------------------
# Prompt Pack Management
# ---------------------------------------------------------------------------


def _pack_dir() -> Path:
    """Return the prompt packs root directory, creating it if needed."""
    PROMPT_PACK_DIR.mkdir(parents=True, exist_ok=True)
    return PROMPT_PACK_DIR


def _latest_pointer_path() -> Path:
    """Return the path to the LATEST pointer file."""
    return _pack_dir() / "LATEST"


def _version_stamp() -> str:
    """Return a version stamp for a new prompt pack, e.g. 'v2026.02.09'."""
    return datetime.now(timezone.utc).strftime("v%Y.%m.%d")


def _version_stamp_full() -> str:
    """Return a version stamp with time for uniqueness, e.g. 'v2026.02.09-031500'."""
    return datetime.now(timezone.utc).strftime("v%Y.%m.%d-%H%M%S")


def load_current_pack() -> Dict[str, Any]:
    """
    Load the currently active prompt pack from disk.

    Reads the LATEST pointer to find the active version directory,
    then loads pack.json and manifest.json.

    Returns:
        dict with keys:
            version (str):       Pack version string.
            signatures (dict):   Compiled DSPy signatures from pack.json.
            manifest (dict):     Pack metadata from manifest.json.
            path (str):          Absolute path to the pack directory.
        Returns an empty default pack if no pack exists on disk.
    """
    latest_path = _latest_pointer_path()

    if not latest_path.exists():
        logger.info("No LATEST pointer found -- using empty default pack")
        return {
            "version": "v0000.00.00",
            "signatures": {},
            "manifest": {
                "objective": "default",
                "model": "unknown",
                "created_at": _utcnow_iso(),
            },
            "path": "",
        }

    try:
        version_name = latest_path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        logger.warning("Cannot read LATEST pointer: %s", exc)
        return {"version": "v0000.00.00", "signatures": {}, "manifest": {}, "path": ""}

    version_dir = _pack_dir() / version_name
    if not version_dir.is_dir():
        logger.warning("LATEST points to missing directory: %s", version_dir)
        return {"version": version_name, "signatures": {}, "manifest": {}, "path": ""}

    # Load pack.json
    signatures: Dict[str, Any] = {}
    pack_file = version_dir / "pack.json"
    if pack_file.exists():
        try:
            signatures = json.loads(pack_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot load pack.json from %s: %s", version_dir, exc)

    # Load manifest.json
    manifest: Dict[str, Any] = {}
    manifest_file = version_dir / "manifest.json"
    if manifest_file.exists():
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot load manifest.json from %s: %s", version_dir, exc)

    return {
        "version": version_name,
        "signatures": signatures,
        "manifest": manifest,
        "path": str(version_dir),
    }


async def _save_pack(
    version: str,
    signatures: Dict[str, Any],
    manifest: Dict[str, Any],
    scores: Optional[Dict[str, Any]] = None,
) -> Path:
    """
    Save a prompt pack to disk under the given version name.

    Args:
        version:     Version directory name (e.g. ``"v2026.02.09"``).
        signatures:  Compiled DSPy signatures dict.
        manifest:    Pack metadata dict.
        scores:      Optional baseline scores at time of creation.

    Returns:
        Path to the created version directory.
    """
    version_dir = _pack_dir() / version
    version_dir.mkdir(parents=True, exist_ok=True)

    # Write pack.json
    (version_dir / "pack.json").write_text(
        json.dumps(signatures, indent=2, default=str),
        encoding="utf-8",
    )

    # Write manifest.json
    manifest.setdefault("created_at", _utcnow_iso())
    manifest.setdefault("version", version)
    (version_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, default=str),
        encoding="utf-8",
    )

    # Write baseline_scores.json if provided
    if scores is not None:
        (version_dir / "baseline_scores.json").write_text(
            json.dumps(scores, indent=2, default=str),
            encoding="utf-8",
        )

    logger.info("Prompt pack saved: %s", version_dir)
    return version_dir


def _update_latest_pointer(version: str) -> None:
    """Update the LATEST pointer file to reference the given version."""
    latest_path = _latest_pointer_path()
    latest_path.write_text(version + "\n", encoding="utf-8")
    logger.info("LATEST pointer updated -> %s", version)


def _list_pack_versions() -> List[str]:
    """List all prompt pack versions on disk, sorted newest first."""
    pack_root = _pack_dir()
    versions = []
    if pack_root.exists():
        for child in pack_root.iterdir():
            if child.is_dir() and child.name.startswith("v"):
                versions.append(child.name)
    versions.sort(reverse=True)
    return versions


# ---------------------------------------------------------------------------
# Eval runner helpers
# ---------------------------------------------------------------------------


async def run_evals(
    suite_id: str,
    max_tasks: int,
    prompt_pack: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Run an Inspect AI eval suite, returning scored results.

    If the Inspect AI bridge is unavailable, generates synthetic scores
    to allow the cycle to complete in degraded mode.

    Args:
        suite_id:     Eval suite identifier.
        max_tasks:    Maximum number of tasks to evaluate.
        prompt_pack:  The prompt pack dict to use during evaluation.

    Returns:
        dict with keys:
            overall_score (float):     Aggregate pass rate.
            by_category (dict):        Per-category scores.
            total_cost_usd (float):    Cost of running the evals.
            avg_latency_ms (float):    Average latency per eval.
            task_results (list):       Per-task result records.
            num_tasks (int):           Number of tasks evaluated.
    """
    if _inspect_bridge is not None:
        try:
            result = await _inspect_bridge.execute("run_eval", {
                "suite_id": suite_id,
                "max_tasks": max_tasks,
                "prompt_pack": prompt_pack.get("signatures", {}),
                "timeout": EVAL_TIMEOUT,
            })
            if result.get("success"):
                return {
                    "overall_score": result.get("overall_score", 0.0),
                    "by_category": result.get("by_category", {}),
                    "total_cost_usd": result.get("total_cost_usd", 0.0),
                    "avg_latency_ms": result.get("avg_latency_ms", 0.0),
                    "task_results": result.get("task_results", []),
                    "num_tasks": result.get("num_tasks", 0),
                }
            else:
                logger.warning(
                    "Inspect AI eval failed: %s -- falling back to synthetic",
                    result.get("error"),
                )
        except Exception as exc:
            logger.warning("Inspect AI eval exception: %s -- using synthetic scores", exc)

    # Fallback: generate synthetic scores for degraded/dry-run mode
    return _generate_synthetic_scores(suite_id, max_tasks)


def _generate_synthetic_scores(suite_id: str, max_tasks: int) -> Dict[str, Any]:
    """
    Generate synthetic eval scores for dry-run or degraded mode.

    Uses deterministic pseudo-random scores so cycles are reproducible.

    Returns:
        Scores dict with the same schema as a real eval run.
    """
    import hashlib
    import random

    # Seed for reproducibility based on suite_id
    seed = int(hashlib.sha256(suite_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    categories = {
        "code_quality": rng.uniform(0.60, 0.90),
        "bug_fix": rng.uniform(0.55, 0.85),
        "refactoring": rng.uniform(0.65, 0.90),
        "safety": rng.uniform(0.80, 0.98),
        "documentation": rng.uniform(0.70, 0.95),
    }

    num_tasks = min(max_tasks, 50)
    task_results = []
    for i in range(num_tasks):
        cat = rng.choice(list(categories.keys()))
        score = rng.uniform(0.3, 1.0)
        task_results.append({
            "task_id": f"synth-{suite_id}-{i:04d}",
            "category": cat,
            "score": round(score, 4),
            "passed": score >= 0.5,
            "cost_usd": round(rng.uniform(0.01, 0.20), 4),
            "latency_ms": round(rng.uniform(2000, 25000), 1),
        })

    scores_list = [t["score"] for t in task_results]
    overall_score = sum(scores_list) / len(scores_list) if scores_list else 0.0
    total_cost = sum(t["cost_usd"] for t in task_results)
    avg_latency = (
        sum(t["latency_ms"] for t in task_results) / len(task_results)
        if task_results
        else 0.0
    )

    return {
        "overall_score": round(overall_score, 4),
        "by_category": {k: round(v, 4) for k, v in categories.items()},
        "total_cost_usd": round(total_cost, 4),
        "avg_latency_ms": round(avg_latency, 1),
        "task_results": task_results,
        "num_tasks": num_tasks,
    }


# ---------------------------------------------------------------------------
# Trajectory storage (Mem0)
# ---------------------------------------------------------------------------


async def store_trajectories(
    cycle_id: str,
    scores: Dict[str, Any],
) -> None:
    """
    Store run trajectories (successes and failures) in Mem0 graph memory.

    Each task result is stored as a trajectory so the DSPy optimizer can
    later retrieve similar past experiences as few-shot exemplars.

    Args:
        cycle_id:  Unique identifier for the current cycle.
        scores:    Scores dict from ``run_evals`` with ``task_results``.
    """
    if _mem0_bridge is None:
        logger.info("Mem0 not available -- skipping trajectory storage")
        return

    task_results = scores.get("task_results", [])
    stored = 0

    for tr in task_results:
        try:
            actions = [
                {
                    "tool": "eval",
                    "input": {"task_id": tr.get("task_id", "unknown")},
                    "output": f"score={tr.get('score', 0.0)}, passed={tr.get('passed', False)}",
                }
            ]
            outcome = "passed" if tr.get("passed", False) else "failed"

            await _mem0_bridge.execute("store_trajectory", {
                "task_id": f"{cycle_id}/{tr.get('task_id', 'unknown')}",
                "actions": actions,
                "outcome": outcome,
                "metadata": {
                    "cycle_id": cycle_id,
                    "category": tr.get("category", "unknown"),
                    "score": tr.get("score", 0.0),
                    "cost_usd": tr.get("cost_usd", 0.0),
                    "latency_ms": tr.get("latency_ms", 0.0),
                },
            })
            stored += 1
        except Exception as exc:
            logger.warning(
                "Failed to store trajectory for %s: %s",
                tr.get("task_id", "unknown"), exc,
            )

    logger.info("Stored %d/%d trajectories in Mem0", stored, len(task_results))


async def retrieve_trajectories(suite_id: str, top_k: int = 10) -> List[Dict[str, Any]]:
    """
    Retrieve similar past trajectories from Mem0 for few-shot injection.

    Args:
        suite_id:  Eval suite identifier to search for related trajectories.
        top_k:     Maximum number of trajectories to retrieve.

    Returns:
        List of trajectory dicts, each containing task_id, actions, outcome.
    """
    if _mem0_bridge is None:
        logger.info("Mem0 not available -- returning empty trajectory list")
        return []

    try:
        result = await _mem0_bridge.execute("recall_trajectory", {
            "task_pattern": f"eval suite {suite_id} optimization patterns",
            "limit": top_k,
        })
        trajectories = result.get("trajectories", [])
        logger.info("Retrieved %d past trajectories from Mem0", len(trajectories))
        return trajectories
    except Exception as exc:
        logger.warning("Failed to retrieve trajectories: %s", exc)
        return []


# ---------------------------------------------------------------------------
# DSPy optimization
# ---------------------------------------------------------------------------


async def optimize_prompts(
    scores: Dict[str, Any],
    trajectories: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Run DSPy optimizer to produce a new candidate prompt pack.

    Feeds the baseline scores and past trajectories (as few-shot examples)
    into the DSPy GEPA or MIPROv2 optimizer.  The optimizer analyzes
    success/failure patterns and compiles improved prompt signatures.

    Args:
        scores:        Baseline eval scores dict.
        trajectories:  Past trajectory exemplars from Mem0.

    Returns:
        dict representing a candidate prompt pack with keys:
            version (str):       Version stamp for the candidate.
            signatures (dict):   Compiled signature state.
            manifest (dict):     Pack metadata.
    """
    version = _version_stamp_full()

    if _dspy_bridge is None:
        logger.warning("DSPy not available -- returning empty candidate pack")
        return {
            "version": version,
            "signatures": {},
            "manifest": {
                "objective": "optimization_skipped",
                "model": "none",
                "created_at": _utcnow_iso(),
                "reason": "dspy_bridge not available",
            },
        }

    try:
        # Build a task description from the scores for the optimizer
        by_category = scores.get("by_category", {})
        weakest = (
            min(by_category, key=by_category.get)
            if by_category
            else "general"
        )
        task_desc = (
            f"Improve Super-Goose agent prompts. "
            f"Current overall score: {scores.get('overall_score', 0.0):.2%}. "
            f"Weakest category: {weakest} ({by_category.get(weakest, 0.0):.2%}). "
            f"Focus on improving {weakest} while maintaining safety scores."
        )

        # Build current prompt from trajectories
        trajectory_context = ""
        if trajectories:
            examples = trajectories[:5]
            for i, traj in enumerate(examples, 1):
                content = traj.get("memory", traj.get("content", ""))
                if content:
                    trajectory_context += f"\nExample {i}: {content[:300]}"

        current_prompt = (
            f"You are Super-Goose, an AI coding agent. "
            f"Past performance context: {trajectory_context}"
        )

        # Run DSPy optimize
        result = await _dspy_bridge.execute("optimize_prompt", {
            "task_description": task_desc,
            "current_prompt": current_prompt,
            "optimizer": "MIPROv2",
            "num_candidates": 10,
        })

        optimized_prompt = result.get("optimized_prompt", current_prompt)
        optimizer_score = result.get("score", 0.0)

        signatures = {
            "agent_prompt": {
                "instructions": optimized_prompt,
                "optimizer_score": optimizer_score,
                "optimizer": result.get("optimizer", "MIPROv2"),
            },
        }

        manifest = {
            "objective": task_desc[:200],
            "model": result.get("model", "default"),
            "optimizer": result.get("optimizer", "MIPROv2"),
            "optimizer_score": optimizer_score,
            "num_candidates": result.get("num_candidates", 10),
            "created_at": _utcnow_iso(),
            "version": version,
            "baseline_overall_score": scores.get("overall_score", 0.0),
        }

        logger.info(
            "DSPy optimization complete: score=%.4f, version=%s",
            optimizer_score, version,
        )

        return {
            "version": version,
            "signatures": signatures,
            "manifest": manifest,
        }

    except Exception as exc:
        logger.error("DSPy optimization failed: %s", exc)
        return {
            "version": version,
            "signatures": {},
            "manifest": {
                "objective": "optimization_failed",
                "error": str(exc),
                "created_at": _utcnow_iso(),
            },
        }


# ---------------------------------------------------------------------------
# Promotion logic
# ---------------------------------------------------------------------------


def evaluate_promotion(
    baseline: Dict[str, Any],
    candidate: Dict[str, Any],
    rules: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Apply promotion rules to decide whether a candidate pack should replace
    the current one.

    Compares baseline and candidate eval scores against configurable
    thresholds for improvement, cost, latency, and critical regressions.

    Args:
        baseline:   Baseline eval scores dict.
        candidate:  Candidate eval scores dict.
        rules:      Override promotion rules (defaults to PROMOTION_RULES).

    Returns:
        dict with keys:
            promote (bool):   True if the candidate should be promoted.
            reason (str):     Human-readable explanation of the decision.
            checks (dict):    Individual check results.
    """
    rules = rules or PROMOTION_RULES

    base_score = baseline.get("overall_score", 0.0)
    cand_score = candidate.get("overall_score", 0.0)
    num_tasks = candidate.get("num_tasks", 0)

    # Avoid division by zero
    if base_score == 0.0:
        score_improvement_pct = 100.0 if cand_score > 0.0 else 0.0
    else:
        score_improvement_pct = ((cand_score - base_score) / base_score) * 100.0

    # Cost delta
    base_cost = baseline.get("total_cost_usd", 0.0)
    cand_cost = candidate.get("total_cost_usd", 0.0)
    if base_cost > 0:
        cost_increase_pct = ((cand_cost - base_cost) / base_cost) * 100.0
    else:
        cost_increase_pct = 0.0

    # Latency delta
    base_latency = baseline.get("avg_latency_ms", 0.0)
    cand_latency = candidate.get("avg_latency_ms", 0.0)
    if base_latency > 0:
        latency_increase_pct = ((cand_latency - base_latency) / base_latency) * 100.0
    else:
        latency_increase_pct = 0.0

    # Critical category regression check
    base_cats = baseline.get("by_category", {})
    cand_cats = candidate.get("by_category", {})
    critical_regression = False
    regression_details: List[str] = []
    for cat in CRITICAL_CATEGORIES:
        base_val = base_cats.get(cat, 0.0)
        cand_val = cand_cats.get(cat, 0.0)
        if base_val > 0 and cand_val < base_val:
            critical_regression = True
            regression_details.append(
                f"{cat}: {base_val:.4f} -> {cand_val:.4f}"
            )

    # Apply checks
    checks: Dict[str, Dict[str, Any]] = {}

    # Check 1: Minimum improvement
    min_improve = rules.get("min_improvement_pct", 2.0)
    checks["improvement"] = {
        "passed": score_improvement_pct >= min_improve,
        "value": round(score_improvement_pct, 2),
        "threshold": min_improve,
    }

    # Check 2: No critical regression
    if rules.get("no_critical_regression", True):
        checks["critical_regression"] = {
            "passed": not critical_regression,
            "regressions": regression_details,
        }

    # Check 3: Cost threshold
    max_cost = rules.get("max_cost_increase_pct", 20.0)
    checks["cost"] = {
        "passed": cost_increase_pct <= max_cost,
        "value": round(cost_increase_pct, 2),
        "threshold": max_cost,
    }

    # Check 4: Latency threshold
    max_latency = rules.get("max_latency_increase_pct", 30.0)
    checks["latency"] = {
        "passed": latency_increase_pct <= max_latency,
        "value": round(latency_increase_pct, 2),
        "threshold": max_latency,
    }

    # Check 5: Minimum eval tasks
    min_tasks = rules.get("min_eval_tasks", 10)
    checks["min_tasks"] = {
        "passed": num_tasks >= min_tasks,
        "value": num_tasks,
        "threshold": min_tasks,
    }

    # Overall decision
    all_passed = all(c["passed"] for c in checks.values())

    if all_passed:
        reason = (
            f"Score improved by {score_improvement_pct:.1f}% "
            f"within cost/latency thresholds"
        )
    else:
        failed_checks = [k for k, v in checks.items() if not v["passed"]]
        reason = f"Promotion blocked by: {', '.join(failed_checks)}"

    return {
        "promote": all_passed,
        "reason": reason,
        "checks": checks,
        "delta": {
            "score_improvement_pct": round(score_improvement_pct, 2),
            "cost_increase_pct": round(cost_increase_pct, 2),
            "latency_increase_pct": round(latency_increase_pct, 2),
        },
    }


async def promote_pack(
    pack: Dict[str, Any],
    scores: Dict[str, Any],
) -> None:
    """
    Save a new prompt pack to disk and update the LATEST pointer.

    Args:
        pack:    Candidate prompt pack dict with version, signatures, manifest.
        scores:  Eval scores at the time of promotion.
    """
    version = pack.get("version", _version_stamp_full())

    await _save_pack(
        version=version,
        signatures=pack.get("signatures", {}),
        manifest=pack.get("manifest", {}),
        scores=scores,
    )

    _update_latest_pointer(version)
    logger.info("Prompt pack promoted: %s", version)


async def rollback_pack(to_version: str) -> Dict[str, Any]:
    """
    Rollback the LATEST pointer to a previous prompt pack version.

    Args:
        to_version:  Version name to rollback to (e.g. ``"v2026.02.08"``).

    Returns:
        dict with success status.
    """
    version_dir = _pack_dir() / to_version
    if not version_dir.is_dir():
        return {
            "success": False,
            "error": f"Version directory not found: {to_version}",
        }

    _update_latest_pointer(to_version)
    logger.info("Rolled back to pack version: %s", to_version)
    return {"success": True, "version": to_version}


# ---------------------------------------------------------------------------
# Metrics / Langfuse logging
# ---------------------------------------------------------------------------


async def log_metrics(
    cycle_id: str,
    baseline: Dict[str, Any],
    candidate: Dict[str, Any],
    decision: Dict[str, Any],
) -> None:
    """
    Log cycle metrics to file and optionally to Langfuse.

    Writes a JSON metrics file to the metrics directory and sends
    key metrics to Langfuse as a trace with spans.

    Args:
        cycle_id:    Unique cycle identifier.
        baseline:    Baseline eval scores.
        candidate:   Candidate eval scores.
        decision:    Promotion decision dict.
    """
    timestamp = _utcnow_iso()
    delta = decision.get("delta", {})

    metrics = {
        "cycle_id": cycle_id,
        "timestamp": timestamp,
        "suite_id": "stage6_core",
        "tasks_evaluated": baseline.get("num_tasks", 0),
        "baseline": {
            "overall_score": baseline.get("overall_score", 0.0),
            "by_category": baseline.get("by_category", {}),
            "total_cost_usd": baseline.get("total_cost_usd", 0.0),
            "avg_latency_ms": baseline.get("avg_latency_ms", 0.0),
        },
        "candidate": {
            "overall_score": candidate.get("overall_score", 0.0),
            "by_category": candidate.get("by_category", {}),
            "total_cost_usd": candidate.get("total_cost_usd", 0.0),
            "avg_latency_ms": candidate.get("avg_latency_ms", 0.0),
        },
        "delta": {
            "score_improvement_pct": delta.get("score_improvement_pct", 0.0),
            "cost_increase_pct": delta.get("cost_increase_pct", 0.0),
            "latency_increase_pct": delta.get("latency_increase_pct", 0.0),
        },
        "decision": {
            "promote": decision.get("promote", False),
            "reason": decision.get("reason", ""),
        },
    }

    # Write to disk
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    metrics_file = METRICS_DIR / f"{cycle_id}.json"
    try:
        metrics_file.write_text(
            json.dumps(metrics, indent=2, default=str),
            encoding="utf-8",
        )
        logger.info("Cycle metrics written to %s", metrics_file)
    except OSError as exc:
        logger.error("Failed to write metrics file: %s", exc)

    # Log to Langfuse if available
    if _langfuse_bridge is not None:
        try:
            # Start a trace for this cycle
            trace_result = await _langfuse_bridge.execute("start_trace", {
                "name": f"overnight_gym:{cycle_id}",
                "metadata": {
                    "cycle_id": cycle_id,
                    "baseline_score": baseline.get("overall_score", 0.0),
                    "candidate_score": candidate.get("overall_score", 0.0),
                    "promoted": decision.get("promote", False),
                },
            })
            trace_id = trace_result.get("trace_id", "")

            if trace_id:
                # Add span for baseline eval
                await _langfuse_bridge.execute("add_span", {
                    "trace_id": trace_id,
                    "name": "baseline_eval",
                    "input_data": {"suite_id": "stage6_core"},
                    "output_data": {
                        "overall_score": baseline.get("overall_score", 0.0),
                        "num_tasks": baseline.get("num_tasks", 0),
                    },
                })

                # Add span for candidate eval
                await _langfuse_bridge.execute("add_span", {
                    "trace_id": trace_id,
                    "name": "candidate_eval",
                    "input_data": {"suite_id": "stage6_core"},
                    "output_data": {
                        "overall_score": candidate.get("overall_score", 0.0),
                        "num_tasks": candidate.get("num_tasks", 0),
                    },
                })

                # Add span for decision
                await _langfuse_bridge.execute("add_span", {
                    "trace_id": trace_id,
                    "name": "promotion_decision",
                    "output_data": {
                        "promote": decision.get("promote", False),
                        "reason": decision.get("reason", ""),
                        "delta": delta,
                    },
                })

                # End trace
                trace_status = "success" if decision.get("promote") else "no_promotion"
                await _langfuse_bridge.execute("end_trace", {
                    "trace_id": trace_id,
                    "trace_status": trace_status,
                })

            logger.info("Cycle metrics logged to Langfuse (trace=%s)", trace_id)

        except Exception as exc:
            logger.warning("Failed to log metrics to Langfuse: %s", exc)


# ---------------------------------------------------------------------------
# Core cycle
# ---------------------------------------------------------------------------


async def run_cycle(
    suite_id: str = "stage6_core",
    max_tasks: int = 50,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Run one complete improvement cycle.

    Steps:
        1. Load current prompt pack
        2. Run eval suite with current prompts -> baseline
        3. Store trajectories in Mem0
        4. Retrieve past trajectories for few-shot
        5. DSPy optimizer compiles candidate pack
        6. Re-run evals with candidate pack
        7. Compare baseline vs candidate (promotion rules)
        8. Promote if improved, discard otherwise
        9. Log metrics to file + Langfuse
        10. Return full cycle results

    Args:
        suite_id:    Eval suite identifier (default ``"stage6_core"``).
        max_tasks:   Maximum number of eval tasks per run.
        dry_run:     If True, uses synthetic scores, skips Mem0/DSPy/promotion.

    Returns:
        dict with cycle_id, baseline/candidate scores, decision, and dry_run flag.
    """
    if not _initialized:
        init()

    cycle_id = f"gym-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    logger.info(
        "=== Cycle %s START  suite=%s  tasks=%d  dry_run=%s ===",
        cycle_id, suite_id, max_tasks, dry_run,
    )

    start_time = time.monotonic()

    # Step 1: Load current prompt pack
    current_pack = load_current_pack()
    logger.info("Current pack: %s", current_pack.get("version", "none"))

    if dry_run:
        # Dry run: use synthetic data throughout, skip real bridges
        baseline_scores = _generate_synthetic_scores(suite_id, max_tasks)
        logger.info(
            "[dry-run] Synthetic baseline: overall=%.4f",
            baseline_scores["overall_score"],
        )

        # Generate slightly better candidate scores to simulate improvement
        candidate_scores = _generate_synthetic_scores(
            suite_id + "_candidate", max_tasks,
        )
        # Nudge candidate scores up slightly
        candidate_scores["overall_score"] = min(
            1.0, candidate_scores["overall_score"] * 1.05,
        )
        logger.info(
            "[dry-run] Synthetic candidate: overall=%.4f",
            candidate_scores["overall_score"],
        )

        decision = evaluate_promotion(baseline_scores, candidate_scores)
        logger.info(
            "[dry-run] Decision: promote=%s  reason=%s",
            decision["promote"], decision["reason"],
        )

        # Log metrics even in dry-run
        await log_metrics(cycle_id, baseline_scores, candidate_scores, decision)

        elapsed = time.monotonic() - start_time
        logger.info(
            "=== Cycle %s DONE (dry-run, %.1fs) ===", cycle_id, elapsed,
        )

        return {
            "cycle_id": cycle_id,
            "baseline_scores": baseline_scores,
            "candidate_scores": candidate_scores,
            "decision": decision,
            "dry_run": True,
            "duration_seconds": round(elapsed, 2),
            "pack_version": current_pack.get("version", "none"),
        }

    # Step 2: Run eval suite with current prompts -> baseline
    baseline_scores = await run_evals(suite_id, max_tasks, current_pack)
    logger.info(
        "Baseline eval: overall=%.4f  tasks=%d  cost=$%.2f",
        baseline_scores["overall_score"],
        baseline_scores["num_tasks"],
        baseline_scores["total_cost_usd"],
    )

    # Step 3: Store trajectories in Mem0
    await store_trajectories(cycle_id, baseline_scores)

    # Step 4: Retrieve similar past trajectories for few-shot
    past_trajectories = await retrieve_trajectories(suite_id)

    # Step 5: DSPy optimization -> candidate pack
    candidate_pack = await optimize_prompts(baseline_scores, past_trajectories)

    # Step 6: Re-run evals with candidate pack
    candidate_scores = await run_evals(suite_id, max_tasks, candidate_pack)
    logger.info(
        "Candidate eval: overall=%.4f  tasks=%d  cost=$%.2f",
        candidate_scores["overall_score"],
        candidate_scores["num_tasks"],
        candidate_scores["total_cost_usd"],
    )

    # Step 7: Compare and decide
    decision = evaluate_promotion(baseline_scores, candidate_scores)
    logger.info(
        "Promotion decision: promote=%s  reason=%s",
        decision["promote"], decision["reason"],
    )

    # Step 8: Promote or discard
    new_version = current_pack.get("version", "unknown")
    if decision["promote"]:
        await promote_pack(candidate_pack, candidate_scores)
        new_version = candidate_pack.get("version", new_version)
        logger.info("Pack promoted: %s", new_version)
    else:
        logger.info("Candidate pack discarded: %s", decision["reason"])

    # Step 9: Log metrics
    await log_metrics(cycle_id, baseline_scores, candidate_scores, decision)

    elapsed = time.monotonic() - start_time
    logger.info("=== Cycle %s DONE (%.1fs) ===", cycle_id, elapsed)

    return {
        "cycle_id": cycle_id,
        "baseline_scores": baseline_scores,
        "candidate_scores": candidate_scores,
        "decision": decision,
        "dry_run": False,
        "duration_seconds": round(elapsed, 2),
        "pack_version": new_version,
    }


# ---------------------------------------------------------------------------
# Additional operations
# ---------------------------------------------------------------------------


async def get_metrics(last_n_cycles: int = 10) -> Dict[str, Any]:
    """
    Get improvement metrics over the last N cycles.

    Reads cycle metric files from disk and returns aggregated trends.

    Args:
        last_n_cycles:  Number of recent cycles to include.

    Returns:
        dict with success status and a list of cycle summaries.
    """
    METRICS_DIR.mkdir(parents=True, exist_ok=True)

    metric_files = sorted(METRICS_DIR.glob("gym-*.json"), reverse=True)
    cycles: List[Dict[str, Any]] = []

    for mf in metric_files[:last_n_cycles]:
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
            cycles.append(data)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot read metrics file %s: %s", mf, exc)

    # Compute trends
    if len(cycles) >= 2:
        first = cycles[-1]  # oldest
        last = cycles[0]    # newest
        first_score = first.get("baseline", {}).get("overall_score", 0.0)
        last_score = last.get("candidate", {}).get("overall_score", first_score)
        if first_score > 0:
            total_improvement_pct = ((last_score - first_score) / first_score) * 100.0
        else:
            total_improvement_pct = 0.0
    else:
        total_improvement_pct = 0.0

    return {
        "success": True,
        "num_cycles": len(cycles),
        "total_improvement_pct": round(total_improvement_pct, 2),
        "cycles": cycles,
    }


def get_current_pack() -> Dict[str, Any]:
    """
    Get information about the currently active prompt pack.

    Returns:
        dict with version, manifest, and available versions list.
    """
    pack = load_current_pack()
    versions = _list_pack_versions()

    return {
        "success": True,
        "current_version": pack.get("version", "none"),
        "manifest": pack.get("manifest", {}),
        "path": pack.get("path", ""),
        "available_versions": versions,
        "total_versions": len(versions),
    }


async def schedule(cron_expression: str) -> Dict[str, Any]:
    """
    Set a nightly schedule for the improvement cycle.

    NOTE: This is a simplified scheduler that uses asyncio.sleep for
    the interval.  In production, a proper cron scheduler (APScheduler,
    celery-beat) should be used instead.

    Args:
        cron_expression:  Cron-like expression (simplified: only the hour
                          is extracted, e.g. ``"0 3 * * *"`` means 3 AM).

    Returns:
        dict with success status and schedule info.
    """
    global _schedule_cron, _schedule_task

    # Cancel existing schedule
    if _schedule_task is not None and not _schedule_task.done():
        _schedule_task.cancel()
        try:
            await _schedule_task
        except asyncio.CancelledError:
            pass

    _schedule_cron = cron_expression
    logger.info("Schedule set: %s", cron_expression)

    # Parse hour from cron expression (simplified)
    parts = cron_expression.strip().split()
    target_hour = 3  # default to 3 AM
    if len(parts) >= 2:
        try:
            target_hour = int(parts[1])
        except ValueError:
            pass

    async def _scheduled_loop() -> None:
        """Background loop that runs cycles at the scheduled time."""
        while True:
            now = datetime.now(timezone.utc)
            # Calculate seconds until next target hour
            target = now.replace(
                hour=target_hour, minute=0, second=0, microsecond=0,
            )
            if target <= now:
                # Already past today's target, schedule for tomorrow
                from datetime import timedelta
                target += timedelta(days=1)

            wait_seconds = (target - now).total_seconds()
            logger.info(
                "Next scheduled cycle at %s UTC (in %.0f seconds)",
                target.isoformat(), wait_seconds,
            )
            await asyncio.sleep(wait_seconds)

            # Run the cycle
            try:
                await run_cycle()
            except Exception as exc:
                logger.error("Scheduled cycle failed: %s", exc)

    _schedule_task = asyncio.create_task(_scheduled_loop())

    return {
        "success": True,
        "cron_expression": cron_expression,
        "target_hour_utc": target_hour,
        "message": f"Scheduled nightly cycle at {target_hour:02d}:00 UTC",
    }


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------


async def execute(operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Unified dispatch for the ToolRegistry.

    Routes an operation name and parameter dict to the appropriate function.
    This is the primary entry point used by
    ``ToolRegistry.execute("overnight_gym", operation, params)``.

    Supported operations:
        run_cycle        -> run_cycle(**params)
        dry_run          -> run_cycle(dry_run=True, **params)
        promote_pack     -> promote_pack(**params)
        rollback         -> rollback_pack(**params)
        get_metrics      -> get_metrics(**params)
        get_current_pack -> get_current_pack()
        schedule         -> schedule(**params)
        status           -> status().__dict__
        init             -> init()
        capabilities     -> capabilities()

    Args:
        operation:  Name of the operation to execute.
        params:     Keyword arguments forwarded to the operation.

    Returns:
        dict with at least ``success`` and ``error`` keys.
    """
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("overnight_gym", "train"):
                return await _execute_inner(operation, params)
        except Exception as exc:
            logger.warning(
                "ResourceCoordinator unavailable, running without coordination: %s",
                exc,
            )
    return await _execute_inner(operation, params)


async def _execute_inner(operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Inner dispatch logic (separated for resource coordination wrapping)."""
    # Sync operations
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
    if operation == "get_current_pack":
        return get_current_pack()

    # Async dispatch table
    async_ops: Dict[str, Any] = {
        "run_cycle": run_cycle,
        "dry_run": None,  # handled specially
        "promote_pack": None,  # handled specially
        "rollback": rollback_pack,
        "get_metrics": get_metrics,
        "schedule": schedule,
    }

    if operation == "dry_run":
        p = dict(params)
        p["dry_run"] = True
        try:
            return await run_cycle(**p)
        except TypeError as exc:
            return {"success": False, "error": f"Invalid parameters: {exc}"}

    if operation == "promote_pack":
        pack_version = params.get("pack_version")
        if not pack_version:
            return {"success": False, "error": "pack_version is required"}
        # Load the pack from disk if it exists
        version_dir = _pack_dir() / pack_version
        if not version_dir.is_dir():
            return {"success": False, "error": f"Pack not found: {pack_version}"}
        _update_latest_pointer(pack_version)
        return {"success": True, "version": pack_version}

    if operation == "rollback":
        to_version = params.get("to_version")
        if not to_version:
            return {"success": False, "error": "to_version is required"}
        return await rollback_pack(to_version)

    if operation not in async_ops:
        all_ops = sorted([
            "run_cycle", "dry_run", "promote_pack", "rollback",
            "get_metrics", "get_current_pack", "schedule",
            "status", "init", "capabilities",
        ])
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(all_ops)}"
            ),
        }

    func = async_ops[operation]
    if func is None:
        return {"success": False, "error": f"Operation '{operation}' not implemented"}

    try:
        result = await func(**params)
        if not isinstance(result, dict):
            return {"success": True, "result": result}
        return result
    except TypeError as exc:
        return {"success": False, "error": f"Invalid parameters for '{operation}': {exc}"}
    except Exception as exc:
        logger.exception("execute(%s) failed", operation)
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _utcnow_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description=(
            "Overnight Gym - Stage 7 metacognitive self-improvement orchestrator"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Quick self-test (dry run with 3 tasks)
    python -m integrations.overnight_gym --selftest

    # Dry run with 10 tasks
    python -m integrations.overnight_gym --dry-run --tasks 10

    # Full cycle
    python -m integrations.overnight_gym --suite stage6_core --tasks 50

    # Check current pack
    python -m integrations.overnight_gym --show-pack

    # View recent metrics
    python -m integrations.overnight_gym --show-metrics
""",
    )
    parser.add_argument(
        "--selftest", action="store_true",
        help="Run a quick self-test (dry-run with 3 tasks)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run without promoting (use synthetic scores)",
    )
    parser.add_argument(
        "--suite", type=str, default="stage6_core",
        help="Eval suite identifier (default: stage6_core)",
    )
    parser.add_argument(
        "--tasks", type=int, default=50,
        help="Maximum number of eval tasks per run (default: 50)",
    )
    parser.add_argument(
        "--show-pack", action="store_true",
        help="Show current prompt pack info and exit",
    )
    parser.add_argument(
        "--show-metrics", action="store_true",
        help="Show recent cycle metrics and exit",
    )
    parser.add_argument(
        "--rollback", type=str, default=None, metavar="VERSION",
        help="Rollback to a specific prompt pack version",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    async def _main() -> int:
        """CLI entry point."""

        if args.show_pack:
            pack_info = get_current_pack()
            print(json.dumps(pack_info, indent=2, default=str))
            return 0

        if args.show_metrics:
            metrics = await get_metrics(last_n_cycles=10)
            print(json.dumps(metrics, indent=2, default=str))
            return 0

        if args.rollback:
            result = await rollback_pack(args.rollback)
            print(json.dumps(result, indent=2, default=str))
            return 0 if result.get("success") else 1

        # Initialize
        state = init()
        print(f"Initialization: success={state['success']}")
        for bridge_name, bridge_info in state.get("bridges", {}).items():
            icon = "[OK]" if bridge_info["loaded"] else "[--]"
            print(f"  {icon} {bridge_name}")

        if args.selftest or args.dry_run:
            max_tasks = 3 if args.selftest else args.tasks
            print(f"\nRunning {'self-test' if args.selftest else 'dry-run'} "
                  f"(suite={args.suite}, tasks={max_tasks})...")

            result = await run_cycle(
                suite_id=args.suite,
                max_tasks=max_tasks,
                dry_run=True,
            )

            print(f"\n{'='*60}")
            print(f"Cycle ID:     {result['cycle_id']}")
            print(f"Dry Run:      {result['dry_run']}")
            print(f"Duration:     {result.get('duration_seconds', 0):.1f}s")
            print(f"\nBaseline:")
            baseline = result.get("baseline_scores", {})
            print(f"  Overall:    {baseline.get('overall_score', 0):.4f}")
            print(f"  Cost:       ${baseline.get('total_cost_usd', 0):.2f}")
            print(f"  Latency:    {baseline.get('avg_latency_ms', 0):.0f}ms")
            print(f"  Categories: {json.dumps(baseline.get('by_category', {}), indent=14)}")

            print(f"\nCandidate:")
            candidate = result.get("candidate_scores", {})
            print(f"  Overall:    {candidate.get('overall_score', 0):.4f}")
            print(f"  Cost:       ${candidate.get('total_cost_usd', 0):.2f}")
            print(f"  Latency:    {candidate.get('avg_latency_ms', 0):.0f}ms")

            decision = result.get("decision", {})
            print(f"\nDecision:")
            print(f"  Promote:    {decision.get('promote', False)}")
            print(f"  Reason:     {decision.get('reason', '')}")
            delta = decision.get("delta", {})
            print(f"  Score +/-:  {delta.get('score_improvement_pct', 0):+.2f}%")
            print(f"  Cost +/-:   {delta.get('cost_increase_pct', 0):+.2f}%")
            print(f"  Latency +/-:{delta.get('latency_increase_pct', 0):+.2f}%")

            print(f"\nPack Version: {result.get('pack_version', 'none')}")
            print(f"{'='*60}")

            # Status
            s = status()
            print(f"\nBridge Status: name={s.name}  available={s.available}  "
                  f"healthy={s.healthy}  version={s.version}")

            print("\nSelf-test complete." if args.selftest else "\nDry-run complete.")
            return 0

        # Full cycle (non-dry-run)
        if not state["success"]:
            print(f"\nCannot run full cycle: {state.get('error')}")
            return 1

        result = await run_cycle(
            suite_id=args.suite,
            max_tasks=args.tasks,
            dry_run=False,
        )
        print(json.dumps(result, indent=2, default=str))
        return 0

    sys.exit(asyncio.run(_main()))
