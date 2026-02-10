"""
CrossHair Bridge - Formal verification of Python contracts for Super-Goose.

Wraps the CrossHair tool's CLI interface to provide async contract checking,
counterexample extraction, and contract management for use by Goose agents
through the Conscious bridge layer.

CrossHair (https://github.com/pschanely/CrossHair) uses the Z3 SMT solver
for symbolic execution of Python code.  Instead of running code with concrete
inputs, it reasons about ALL possible inputs simultaneously, finding
counterexamples that violate function contracts (pre/postconditions expressed
as PEP 316 docstring contracts or ``icontract`` decorators).

Architecture:
    Goose Agent --> Conscious Bridge --> crosshair_bridge.py --> subprocess
                                                             --> crosshair CLI

CrossHair is invoked exclusively through subprocess to maintain process
isolation.  The Z3 solver can consume significant memory and CPU, so each
invocation runs in its own process with configurable timeouts.

Capabilities registered in external_tools.toml:
    contract_check, formal_verify, counterexample, contract_manage

Typical usage via the ToolRegistry::

    result = await registry.execute("crosshair", "check_module", {
        "module_path": "my_package.my_module",
    })

Reference:
    CrossHair docs: https://crosshair.readthedocs.io/
    PEP 316:        https://peps.python.org/pep-0316/
    Z3 solver:      https://github.com/Z3Prover/z3
"""

from __future__ import annotations

import asyncio
import ast
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Resource coordination
# ---------------------------------------------------------------------------

try:
    from integrations.resource_coordinator import get_coordinator
except ImportError:
    get_coordinator = None  # type: ignore[assignment,misc]

from integrations.registry import ToolStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Default per-condition timeout in seconds for CrossHair checks.
#: CrossHair's Z3 solver explores paths symbolically; complex functions
#: may need more time.
DEFAULT_PER_CONDITION_TIMEOUT = 30

#: Default overall timeout for a single CrossHair invocation (seconds).
DEFAULT_PROCESS_TIMEOUT = 120

#: Maximum timeout allowed for a single check to prevent runaway processes.
MAX_PROCESS_TIMEOUT = 600

#: Default directory containing bridge modules for bulk checking.
DEFAULT_BRIDGE_DIR = Path(__file__).resolve().parent

#: PEP 316 contract markers used in docstrings.
PEP316_PRE = "pre:"
PEP316_POST = "post:"
PEP316_INV = "inv:"

#: Pattern to detect icontract decorators.
ICONTRACT_PATTERN = re.compile(
    r"@(?:icontract\.)?(?:require|ensure|invariant)\s*\(",
    re.MULTILINE,
)

#: Pattern to extract counterexample lines from CrossHair output.
#: CrossHair outputs lines like: "COUNTEREXAMPLE: func_name(x=42, y=-1)"
COUNTEREXAMPLE_PATTERN = re.compile(
    r"(?:COUNTEREXAMPLE|counterexample):\s*(.*)",
    re.IGNORECASE,
)

#: Pattern to extract error/failure lines from CrossHair output.
FAILURE_PATTERN = re.compile(
    r"(?:FAIL|ERROR|error|fail):\s*(.*)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Module-level state (lazy initialisation)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_crosshair_executable: Optional[str] = None
_crosshair_version: Optional[str] = None
_z3_available: Optional[bool] = None


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """
    Initialise the CrossHair bridge.

    Performs lazy discovery of the ``crosshair`` CLI executable and checks
    for Z3 solver availability.  Safe to call multiple times -- subsequent
    calls return cached state.

    Returns:
        dict with keys:
            success (bool):      True if CrossHair is available.
            executable (str):    Resolved path to the crosshair binary, or None.
            version (str):       CrossHair version string, or None.
            z3_available (bool): Whether the Z3 solver is importable.
            error (str):         Error message if initialisation failed.
    """
    global _initialized, _crosshair_executable, _crosshair_version, _z3_available

    with _init_lock:
        if _initialized:
            return {
                "success": _crosshair_executable is not None,
                "executable": _crosshair_executable,
                "version": _crosshair_version,
                "z3_available": _z3_available,
                "error": None if _crosshair_executable else "CrossHair executable not found",
            }

        # 1. Try to find crosshair on PATH
        exe = shutil.which("crosshair")

        # 2. Fallback: try python -m crosshair
        if exe is None:
            try:
                result = subprocess.run(
                    [sys.executable, "-m", "crosshair", "--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    exe = f"{sys.executable} -m crosshair"
                    _crosshair_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        # 3. Retrieve version if we found a direct executable
        if exe and _crosshair_version is None:
            try:
                result = subprocess.run(
                    _split_cmd(exe) + ["--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    _crosshair_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        # 4. Check Z3 availability
        try:
            z3_check = subprocess.run(
                [sys.executable, "-c", "import z3; print(z3.get_version_string())"],
                capture_output=True, text=True, timeout=10,
            )
            _z3_available = z3_check.returncode == 0
        except (subprocess.TimeoutExpired, OSError):
            _z3_available = False

        _crosshair_executable = exe if exe else None
        _initialized = True

        if _crosshair_executable:
            logger.info(
                "CrossHair bridge initialised: %s (v%s, z3=%s)",
                _crosshair_executable, _crosshair_version, _z3_available,
            )
        else:
            logger.warning(
                "CrossHair bridge: executable not found. "
                "Install with: pip install crosshair-tool"
            )

        return {
            "success": _crosshair_executable is not None,
            "executable": _crosshair_executable,
            "version": _crosshair_version,
            "z3_available": _z3_available,
            "error": None if _crosshair_executable else "CrossHair executable not found",
        }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------

def status() -> ToolStatus:
    """
    Return the current health status of the CrossHair tool.

    Called by ``ToolRegistry.check_status("crosshair")`` to populate the
    registry dashboard.

    Returns:
        ToolStatus dataclass with availability, health, version, and
        any error information.
    """
    state = init()
    return ToolStatus(
        name="CrossHair",
        available=state["success"],
        healthy=state["success"] and (state["z3_available"] is True),
        version=state["version"],
        error=state["error"],
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
        "formal_verify",
        "symbolic_exec",
        "contract_check",
        "property_test",
        "counterexample",
        "contract_manage",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def check_module(
    module_path: str,
    timeout_per_condition: int = DEFAULT_PER_CONDITION_TIMEOUT,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    extra_args: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Check all contracts in a Python module using CrossHair.

    CrossHair symbolically executes functions in the module, looking for
    inputs that violate PEP 316 docstring contracts or icontract decorators.

    Args:
        module_path:          Dotted module path (e.g. ``"my_package.my_module"``)
                              or a file path (e.g. ``"/path/to/module.py"``).
        timeout_per_condition: Maximum seconds CrossHair spends on each
                              individual contract condition.
        timeout:              Maximum wall-clock seconds for the entire check.
        extra_args:           Additional CLI arguments forwarded to CrossHair.

    Returns:
        dict with keys:
            success (bool):         True if no contract violations were found.
            module (str):           The module path that was checked.
            output (str):           Raw CrossHair stdout.
            violations (list):      List of violation dicts extracted from output.
            counterexamples (list): Counterexample strings from CrossHair.
            error (str):            Error message if the check itself failed.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    cmd = _split_cmd(_crosshair_executable)
    cmd += [
        "check",
        module_path,
        f"--per_condition_timeout={timeout_per_condition}",
    ]

    if extra_args:
        cmd += extra_args

    return await _run_crosshair(
        cmd,
        timeout=min(timeout, MAX_PROCESS_TIMEOUT),
        context={"module": module_path},
    )


async def check_function(
    module_path: str,
    function_name: str,
    timeout: int = 60,
    extra_args: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Check contracts for a specific function in a Python module.

    This targets a single function rather than the entire module, which
    is faster and produces more focused results.

    Args:
        module_path:   Dotted module path or file path containing the function.
        function_name: Name of the function to check (e.g. ``"my_function"``).
        timeout:       Maximum seconds for the check process.
        extra_args:    Additional CLI arguments forwarded to CrossHair.

    Returns:
        dict with keys:
            success (bool):         True if no violations were found.
            module (str):           The module path.
            function (str):         The function name that was checked.
            output (str):           Raw CrossHair stdout.
            violations (list):      Violation dicts extracted from output.
            counterexamples (list): Counterexample strings.
            error (str):            Error message on failure.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    # CrossHair accepts module_path.FunctionName syntax for targeting
    target = f"{module_path}.{function_name}"

    cmd = _split_cmd(_crosshair_executable)
    cmd += [
        "check",
        target,
        f"--per_condition_timeout={timeout}",
    ]

    if extra_args:
        cmd += extra_args

    return await _run_crosshair(
        cmd,
        timeout=min(timeout + 30, MAX_PROCESS_TIMEOUT),
        context={"module": module_path, "function": function_name},
    )


async def check_all_bridges(
    bridge_dir: Optional[str] = None,
    timeout_per_condition: int = DEFAULT_PER_CONDITION_TIMEOUT,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
) -> dict[str, Any]:
    """
    Check all bridge modules in the integrations directory for contract violations.

    Scans for ``*_bridge.py`` files in the bridge directory and runs CrossHair
    on each one.  This is useful as a pre-commit or CI verification step to
    ensure no bridge contracts are violated.

    Args:
        bridge_dir:            Path to the directory containing bridge modules.
                               Defaults to the directory containing this file.
        timeout_per_condition: Per-condition timeout for each module check.
        timeout:               Overall timeout for each individual module check.

    Returns:
        dict with keys:
            success (bool):       True if ALL bridge modules pass.
            results (list):       Per-module result dicts.
            total_checked (int):  Number of bridge modules checked.
            total_passed (int):   Number that passed without violations.
            total_failed (int):   Number with at least one violation.
            total_errors (int):   Number that errored during checking.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    scan_dir = Path(bridge_dir) if bridge_dir else DEFAULT_BRIDGE_DIR
    if not scan_dir.is_dir():
        return {
            "success": False,
            "results": [],
            "total_checked": 0,
            "total_passed": 0,
            "total_failed": 0,
            "total_errors": 0,
            "error": f"Bridge directory not found: {scan_dir}",
        }

    bridge_files = sorted(scan_dir.glob("*_bridge.py"))
    if not bridge_files:
        return {
            "success": True,
            "results": [],
            "total_checked": 0,
            "total_passed": 0,
            "total_failed": 0,
            "total_errors": 0,
            "error": None,
        }

    results = []
    passed = 0
    failed = 0
    errors = 0

    for bridge_file in bridge_files:
        module_result = await check_module(
            str(bridge_file),
            timeout_per_condition=timeout_per_condition,
            timeout=timeout,
        )
        results.append({
            "file": str(bridge_file),
            "module": bridge_file.stem,
            **module_result,
        })

        if module_result.get("error"):
            errors += 1
        elif module_result.get("success"):
            passed += 1
        else:
            failed += 1

    return {
        "success": failed == 0 and errors == 0,
        "results": results,
        "total_checked": len(bridge_files),
        "total_passed": passed,
        "total_failed": failed,
        "total_errors": errors,
        "error": None,
    }


def get_counterexamples(check_result: dict[str, Any]) -> dict[str, Any]:
    """
    Extract and structure counterexamples from a CrossHair check result.

    CrossHair output contains counterexample lines showing specific input
    values that violate a contract.  This function parses those into a
    structured format for programmatic consumption.

    Args:
        check_result: A result dict from ``check_module`` or ``check_function``.

    Returns:
        dict with keys:
            success (bool):            True (this is a parsing operation).
            counterexamples (list):    List of structured counterexample dicts.
            count (int):               Number of counterexamples found.
            raw_output (str):          The original output that was parsed.
    """
    output = check_result.get("output", "")
    raw_counterexamples = check_result.get("counterexamples", [])

    structured = []
    for raw in raw_counterexamples:
        entry: dict[str, Any] = {"raw": raw}

        # Try to parse function name and arguments
        # Format: "func_name(arg1=val1, arg2=val2)"
        match = re.match(r"(\w+)\((.*)\)", raw.strip())
        if match:
            entry["function"] = match.group(1)
            args_str = match.group(2)
            entry["arguments"] = _parse_counterexample_args(args_str)
        else:
            entry["function"] = None
            entry["arguments"] = {}

        structured.append(entry)

    return {
        "success": True,
        "counterexamples": structured,
        "count": len(structured),
        "raw_output": output,
    }


async def add_contract(
    function_path: str,
    preconditions: Optional[list[str]] = None,
    postconditions: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Add PEP 316 contracts to a function's docstring.

    Reads the source file, locates the target function, and inserts
    pre/postcondition lines into its docstring.  If the function has no
    docstring, one is created.

    PEP 316 contract format in docstrings::

        def divide(a: float, b: float) -> float:
            '''Divide a by b.

            pre: b != 0
            post: __return__ * b == a
            '''
            return a / b

    Args:
        function_path: Dotted path to the function (e.g.
                       ``"my_module.my_function"``) or
                       ``"path/to/file.py::my_function"``.
        preconditions: List of precondition expressions (e.g.
                       ``["b != 0", "a >= 0"]``).
        postconditions: List of postcondition expressions (e.g.
                        ``["__return__ >= 0"]``).

    Returns:
        dict with keys:
            success (bool):    True if contracts were added.
            file_path (str):   The file that was modified.
            function (str):    The function name.
            added_pre (list):  Preconditions that were added.
            added_post (list): Postconditions that were added.
            error (str):       Error message on failure.
    """
    if not preconditions and not postconditions:
        return {
            "success": False,
            "file_path": "",
            "function": "",
            "added_pre": [],
            "added_post": [],
            "error": "No preconditions or postconditions provided.",
        }

    # Parse the function path
    file_path, func_name = _parse_function_path(function_path)
    if not file_path or not func_name:
        return {
            "success": False,
            "file_path": file_path or "",
            "function": func_name or "",
            "added_pre": [],
            "added_post": [],
            "error": (
                f"Could not parse function path: {function_path!r}. "
                "Use 'path/to/file.py::function_name' or 'module.function'."
            ),
        }

    target = Path(file_path)
    if not target.is_file():
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": [],
            "added_post": [],
            "error": f"File not found: {file_path}",
        }

    try:
        source = target.read_text(encoding="utf-8")
    except OSError as exc:
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": [],
            "added_post": [],
            "error": f"Failed to read file: {exc}",
        }

    # Use AST to find the function definition
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": [],
            "added_post": [],
            "error": f"Syntax error in {file_path}: {exc}",
        }

    func_node = _find_function_node(tree, func_name)
    if func_node is None:
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": [],
            "added_post": [],
            "error": f"Function '{func_name}' not found in {file_path}.",
        }

    # Build contract lines
    contract_lines = []
    added_pre = preconditions or []
    added_post = postconditions or []

    for pre in added_pre:
        contract_lines.append(f"    {PEP316_PRE} {pre}")
    for post in added_post:
        contract_lines.append(f"    {PEP316_POST} {post}")

    contract_block = "\n".join(contract_lines)

    # Insert contracts into the docstring
    lines = source.splitlines(keepends=True)
    modified = _insert_contracts_into_docstring(
        lines, func_node, contract_block,
    )

    if modified is None:
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": added_pre,
            "added_post": added_post,
            "error": "Failed to insert contracts into docstring.",
        }

    try:
        target.write_text(modified, encoding="utf-8")
    except OSError as exc:
        return {
            "success": False,
            "file_path": file_path,
            "function": func_name,
            "added_pre": added_pre,
            "added_post": added_post,
            "error": f"Failed to write file: {exc}",
        }

    logger.info(
        "Added %d pre + %d post contracts to %s::%s",
        len(added_pre), len(added_post), file_path, func_name,
    )

    return {
        "success": True,
        "file_path": file_path,
        "function": func_name,
        "added_pre": added_pre,
        "added_post": added_post,
        "error": None,
    }


async def list_contracts(module_path: str) -> dict[str, Any]:
    """
    List all existing contracts (PEP 316 and icontract) in a Python module.

    Parses the module source to find functions with PEP 316 docstring
    contracts and icontract decorators, returning a structured inventory.

    Args:
        module_path: File path to the Python module to scan.

    Returns:
        dict with keys:
            success (bool):          True if the module was scanned.
            module (str):            The module path scanned.
            contracts (list):        List of contract dicts, each with:
                - function (str): function name
                - type (str): "pep316_pre", "pep316_post", "pep316_inv",
                              or "icontract"
                - expression (str): the contract expression
                - line (int): line number in the source
            total_functions (int):   Number of functions in the module.
            functions_with_contracts (int): Functions that have contracts.
            error (str):             Error message if scanning failed.
    """
    target = Path(module_path)
    if not target.is_file():
        return {
            "success": False,
            "module": module_path,
            "contracts": [],
            "total_functions": 0,
            "functions_with_contracts": 0,
            "error": f"File not found: {module_path}",
        }

    try:
        source = target.read_text(encoding="utf-8")
    except OSError as exc:
        return {
            "success": False,
            "module": module_path,
            "contracts": [],
            "total_functions": 0,
            "functions_with_contracts": 0,
            "error": f"Failed to read file: {exc}",
        }

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return {
            "success": False,
            "module": module_path,
            "contracts": [],
            "total_functions": 0,
            "functions_with_contracts": 0,
            "error": f"Syntax error in {module_path}: {exc}",
        }

    lines = source.splitlines()
    contracts: list[dict[str, Any]] = []
    total_functions = 0
    functions_with: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        total_functions += 1
        func_name = node.name

        # Check for PEP 316 contracts in docstrings
        docstring = ast.get_docstring(node, clean=False)
        if docstring:
            doc_start_line = node.body[0].lineno  # type: ignore[union-attr]
            for i, doc_line in enumerate(docstring.splitlines()):
                stripped = doc_line.strip()
                for prefix, contract_type in [
                    (PEP316_PRE, "pep316_pre"),
                    (PEP316_POST, "pep316_post"),
                    (PEP316_INV, "pep316_inv"),
                ]:
                    if stripped.startswith(prefix):
                        expression = stripped[len(prefix):].strip()
                        contracts.append({
                            "function": func_name,
                            "type": contract_type,
                            "expression": expression,
                            "line": doc_start_line + i,
                        })
                        functions_with.add(func_name)

        # Check for icontract decorators
        for decorator in node.decorator_list:
            dec_line = decorator.lineno
            if dec_line <= len(lines):
                line_text = lines[dec_line - 1]
                if ICONTRACT_PATTERN.search(line_text):
                    contracts.append({
                        "function": func_name,
                        "type": "icontract",
                        "expression": line_text.strip(),
                        "line": dec_line,
                    })
                    functions_with.add(func_name)

    return {
        "success": True,
        "module": module_path,
        "contracts": contracts,
        "total_functions": total_functions,
        "functions_with_contracts": len(functions_with),
        "error": None,
    }


# ---------------------------------------------------------------------------
# Convenience aliases (matching external_tools.toml endpoint names)
# ---------------------------------------------------------------------------

async def verify(
    module_path: str,
    per_condition_timeout: int = DEFAULT_PER_CONDITION_TIMEOUT,
    max_iterations: Optional[int] = None,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
) -> dict[str, Any]:
    """
    Run CrossHair formal verification on a module (alias for check_module).

    This is the primary entry point for the ``verify`` endpoint defined in
    ``external_tools.toml``.  It delegates to :func:`check_module` with an
    optional ``--max_iterations`` flag.

    Args:
        module_path:          Dotted module path or file path to verify.
        per_condition_timeout: Seconds per contract condition.
        max_iterations:       Maximum symbolic execution iterations (None = unlimited).
        timeout:              Overall process timeout in seconds.

    Returns:
        dict with verification results (see :func:`check_module`).
    """
    extra_args: list[str] = []
    if max_iterations is not None:
        extra_args.append(f"--max_iterations={max_iterations}")
    return await check_module(
        module_path,
        timeout_per_condition=per_condition_timeout,
        timeout=timeout,
        extra_args=extra_args or None,
    )


async def check_contracts(
    module_path: str,
    function_name: Optional[str] = None,
    timeout: int = 60,
) -> dict[str, Any]:
    """
    Check contracts for a specific function or an entire module.

    If ``function_name`` is provided, only that function is checked.
    Otherwise the full module is verified.

    Args:
        module_path:   Dotted module path or file path.
        function_name: Optional function name to narrow the check.
        timeout:       Maximum seconds for the check.

    Returns:
        dict with contract check results.
    """
    if function_name:
        return await check_function(module_path, function_name, timeout=timeout)
    return await check_module(module_path, timeout=timeout)


async def find_counterexample(
    module_path: str,
    function_name: str,
    timeout: int = 60,
) -> dict[str, Any]:
    """
    Find a counter-example for a specific function's contract.

    Runs CrossHair on the function and then extracts structured
    counter-examples from the output.

    Args:
        module_path:   Dotted module path or file path.
        function_name: Function whose contract to test.
        timeout:       Maximum seconds for the check.

    Returns:
        dict with ``counterexamples`` list and structured results.
    """
    raw_result = await check_function(module_path, function_name, timeout=timeout)
    parsed = get_counterexamples(raw_result)
    # Merge so the caller gets both the raw run info and parsed counterexamples
    return {**raw_result, **parsed}


async def check_directory(
    directory: str,
    allowlist: Optional[list[str]] = None,
    per_condition_timeout: int = DEFAULT_PER_CONDITION_TIMEOUT,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
) -> dict[str, Any]:
    """
    Check all Python modules in a directory for contract violations.

    Only files matching the ``allowlist`` glob patterns are checked.
    If no allowlist is given, defaults to ``["*_bridge.py"]`` which
    targets bridge modules known to carry PEP 316 contracts.

    Args:
        directory:             Path to the directory to scan.
        allowlist:             List of glob patterns (e.g. ``["*.py"]``).
                               Defaults to ``["*_bridge.py"]``.
        per_condition_timeout: Per-condition timeout for each module.
        timeout:               Overall timeout for each individual check.

    Returns:
        dict with aggregate results and per-module details.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    scan_dir = Path(directory)
    if not scan_dir.is_dir():
        return {
            "success": False,
            "results": [],
            "total_checked": 0,
            "total_passed": 0,
            "total_failed": 0,
            "total_errors": 0,
            "error": f"Directory not found: {directory}",
        }

    if allowlist is None:
        allowlist = ["*_bridge.py"]

    # Collect matching files
    target_files: list[Path] = []
    for pattern in allowlist:
        target_files.extend(sorted(scan_dir.glob(pattern)))
    # Deduplicate while preserving order
    seen: set[Path] = set()
    unique_files: list[Path] = []
    for f in target_files:
        if f not in seen:
            seen.add(f)
            unique_files.append(f)

    if not unique_files:
        return {
            "success": True,
            "results": [],
            "total_checked": 0,
            "total_passed": 0,
            "total_failed": 0,
            "total_errors": 0,
            "error": None,
        }

    results = []
    passed = 0
    failed = 0
    errors = 0

    for target_file in unique_files:
        module_result = await check_module(
            str(target_file),
            timeout_per_condition=per_condition_timeout,
            timeout=timeout,
        )
        results.append({
            "file": str(target_file),
            "module": target_file.stem,
            **module_result,
        })

        if module_result.get("error"):
            errors += 1
        elif module_result.get("success"):
            passed += 1
        else:
            failed += 1

    return {
        "success": failed == 0 and errors == 0,
        "results": results,
        "total_checked": len(unique_files),
        "total_passed": passed,
        "total_failed": failed,
        "total_errors": errors,
        "error": None,
    }


async def selftest() -> dict[str, Any]:
    """
    Run CrossHair's built-in self-test to verify the installation.

    Invokes ``crosshair --selftest`` which exercises the Z3 solver
    and basic contract-checking machinery.

    Returns:
        dict with ``success`` and raw output.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    cmd = _split_cmd(_crosshair_executable) + ["--selftest"]
    return await _run_crosshair(cmd, timeout=60, context={"operation": "selftest"})


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Unified dispatch for the ToolRegistry.

    Routes an operation name and parameter dict to the appropriate bridge
    function.  This is the primary entry point used by
    ``ToolRegistry.execute("crosshair", operation, params)``.

    Supported operations:
        check_module        -> check_module(**params)
        check_function      -> check_function(**params)
        check_all_bridges   -> check_all_bridges(**params)
        verify              -> verify(**params)
        check_contracts     -> check_contracts(**params)
        find_counterexample -> find_counterexample(**params)
        check_directory     -> check_directory(**params)
        selftest            -> selftest()
        get_counterexamples -> get_counterexamples(**params)
        add_contract        -> add_contract(**params)
        list_contracts      -> list_contracts(**params)
        status              -> status().__dict__-like
        init                -> init()
        capabilities        -> capabilities()

    Args:
        operation:  Name of the operation to execute.
        params:     Keyword arguments forwarded to the operation function.

    Returns:
        dict with at least ``success`` and ``error`` keys.
    """
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("crosshair", "verify"):
                return await _execute_inner(operation, params)
        except Exception as exc:
            logger.warning(
                "ResourceCoordinator unavailable, running without coordination: %s",
                exc,
            )
    return await _execute_inner(operation, params)


async def _execute_inner(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Inner dispatch logic (separated for resource coordination wrapping)."""
    dispatch: dict[str, Any] = {
        "check_module": check_module,
        "check_function": check_function,
        "check_all_bridges": check_all_bridges,
        "verify": verify,
        "check_contracts": check_contracts,
        "find_counterexample": find_counterexample,
        "check_directory": check_directory,
        "selftest": selftest,
        "add_contract": add_contract,
        "list_contracts": list_contracts,
    }

    sync_dispatch: dict[str, Any] = {
        "get_counterexamples": get_counterexamples,
    }

    if operation in sync_dispatch:
        try:
            return sync_dispatch[operation](**params)
        except Exception as exc:
            return {"success": False, "error": str(exc)}

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

    if operation not in dispatch:
        all_ops = sorted(
            list(dispatch) + list(sync_dispatch)
            + ["status", "init", "capabilities"]
        )
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(all_ops)}"
            ),
        }

    func = dispatch[operation]
    try:
        return await func(**params)
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

def _split_cmd(cmd_str: Optional[str]) -> list[str]:
    """
    Split a command string into a list suitable for subprocess.

    Handles the case where ``_crosshair_executable`` might be a multi-word
    string like ``"python -m crosshair"``.

    Args:
        cmd_str: The command string to split.

    Returns:
        List of command components.
    """
    if cmd_str is None:
        return []
    return cmd_str.split()


def _error_not_installed() -> dict[str, Any]:
    """
    Return a standardised error dict when CrossHair is not available.

    Returns:
        dict with success=False and an informative error message.
    """
    return {
        "success": False,
        "output": "",
        "violations": [],
        "counterexamples": [],
        "error": (
            "CrossHair is not installed or not found on PATH. "
            "Install with: pip install crosshair-tool"
        ),
    }


async def _run_crosshair(
    cmd: list[str],
    timeout: int,
    context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Execute a CrossHair subprocess asynchronously and capture its output.

    Uses ``asyncio.create_subprocess_exec`` for non-blocking execution.
    Parses the output to extract counterexamples and violation information.

    Args:
        cmd:      Full command list (executable + arguments).
        timeout:  Maximum execution time in seconds.
        context:  Additional key-value pairs merged into the return dict.

    Returns:
        dict with keys:
            success (bool):         True if no violations were found.
            output (str):           Raw stdout from the process.
            violations (list):      Parsed violation dicts.
            counterexamples (list): Extracted counterexample strings.
            error (str):            Error message if the check itself failed.
            Plus any keys from ``context``.
    """
    env = {**os.environ}
    env["PYTHONUNBUFFERED"] = "1"

    result: dict[str, Any] = {
        "success": False,
        "output": "",
        "violations": [],
        "counterexamples": [],
        "error": None,
    }
    if context:
        result.update(context)

    logger.debug(
        "CrossHair bridge exec: %s (timeout=%ds)",
        " ".join(cmd), timeout,
    )

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            result["error"] = (
                f"CrossHair process timed out after {timeout}s. "
                "Consider increasing the timeout or reducing the module scope."
            )
            logger.warning("CrossHair timed out: %s", " ".join(cmd[:5]))
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        result["output"] = stdout

        # CrossHair returns exit code 0 when no violations found,
        # non-zero when violations or errors occur.
        if process.returncode == 0:
            result["success"] = True
        else:
            # Parse violations and counterexamples from output
            violations, counterexamples = _parse_crosshair_output(stdout)
            result["violations"] = violations
            result["counterexamples"] = counterexamples

            if not violations and not counterexamples:
                # Non-zero exit but no parsed violations -- treat as error
                result["error"] = (
                    stderr or f"CrossHair exited with code {process.returncode}"
                )
            else:
                # Violations found -- not an error, just a failed check
                result["success"] = False
                result["error"] = None

        if stderr and not result["error"]:
            logger.debug("CrossHair stderr (non-fatal): %s", stderr[:200])

    except FileNotFoundError:
        result["error"] = (
            f"CrossHair executable not found: {cmd[0]}. "
            "The tool may have been uninstalled since initialisation."
        )
        global _initialized
        _initialized = False
        logger.error("CrossHair executable vanished: %s", cmd[0])

    except OSError as exc:
        result["error"] = f"Failed to start CrossHair process: {exc}"
        logger.error("CrossHair OSError: %s", exc)

    return result


def _parse_crosshair_output(
    output: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Parse CrossHair stdout to extract violations and counterexamples.

    CrossHair produces output like::

        error: my_module.divide
        COUNTEREXAMPLE: divide(a=1.0, b=0.0)
        when calling divide(a=1.0, b=0.0):
          ZeroDivisionError: float division by zero

    Args:
        output: Raw stdout from a CrossHair process.

    Returns:
        Tuple of (violations_list, counterexamples_list).
    """
    violations: list[dict[str, Any]] = []
    counterexamples: list[str] = []

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # Extract counterexamples
        ce_match = COUNTEREXAMPLE_PATTERN.search(stripped)
        if ce_match:
            counterexamples.append(ce_match.group(1).strip())
            continue

        # Extract failure/error lines
        fail_match = FAILURE_PATTERN.search(stripped)
        if fail_match:
            violations.append({
                "message": fail_match.group(1).strip(),
                "raw_line": stripped,
            })
            continue

        # Lines describing exceptions during symbolic execution
        if stripped.startswith("when calling ") or "Error:" in stripped:
            violations.append({
                "message": stripped,
                "raw_line": stripped,
            })

    return violations, counterexamples


def _parse_counterexample_args(args_str: str) -> dict[str, str]:
    """
    Parse a counterexample argument string into a dict.

    Input like ``"x=42, y=-1"`` becomes ``{"x": "42", "y": "-1"}``.

    Args:
        args_str: Comma-separated key=value pairs.

    Returns:
        dict mapping argument names to their string values.
    """
    result: dict[str, str] = {}
    if not args_str.strip():
        return result

    # Simple split -- does not handle nested structures perfectly
    # but covers the common CrossHair output format.
    depth = 0
    current = ""
    for char in args_str:
        if char in "([{":
            depth += 1
            current += char
        elif char in ")]}":
            depth -= 1
            current += char
        elif char == "," and depth == 0:
            _add_kv_pair(current.strip(), result)
            current = ""
        else:
            current += char

    if current.strip():
        _add_kv_pair(current.strip(), result)

    return result


def _add_kv_pair(pair_str: str, target: dict[str, str]) -> None:
    """Add a 'key=value' string to the target dict."""
    if "=" in pair_str:
        key, _, value = pair_str.partition("=")
        target[key.strip()] = value.strip()


def _parse_function_path(
    function_path: str,
) -> tuple[Optional[str], Optional[str]]:
    """
    Parse a function path into (file_path, function_name).

    Supports two formats:
        - ``"path/to/file.py::function_name"``
        - ``"module.submodule.function_name"`` (file resolved via path)

    Args:
        function_path: The function path string.

    Returns:
        Tuple of (file_path, function_name), either may be None on failure.
    """
    # Format: path/to/file.py::function_name
    if "::" in function_path:
        parts = function_path.split("::", 1)
        return parts[0], parts[1]

    # Format: module.submodule.function_name
    if "." in function_path:
        parts = function_path.rsplit(".", 1)
        module_part = parts[0]
        func_name = parts[1]

        # Try to resolve the module to a file path
        module_file = module_part.replace(".", os.sep) + ".py"
        if Path(module_file).is_file():
            return module_file, func_name

        # Try relative to the bridge directory
        candidate = DEFAULT_BRIDGE_DIR.parent / module_file
        if candidate.is_file():
            return str(candidate), func_name

        # Return the path as-is; caller will handle the error
        return module_file, func_name

    return None, None


def _find_function_node(
    tree: ast.Module,
    func_name: str,
) -> Optional[ast.FunctionDef]:
    """
    Find a function definition node in an AST by name.

    Searches top-level functions and methods inside classes.

    Args:
        tree: The parsed AST module.
        func_name: Name of the function to find.

    Returns:
        The AST FunctionDef/AsyncFunctionDef node, or None.
    """
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == func_name:
                return node  # type: ignore[return-value]
    return None


def _insert_contracts_into_docstring(
    lines: list[str],
    func_node: ast.FunctionDef,
    contract_block: str,
) -> Optional[str]:
    """
    Insert contract lines into a function's docstring.

    If the function has an existing docstring, the contracts are appended
    before the closing quotes.  If it has no docstring, a new one is
    created with the contracts.

    Args:
        lines:          Source file lines (with line endings).
        func_node:      The AST node for the target function.
        contract_block: Formatted contract lines to insert.

    Returns:
        The modified source as a string, or None on failure.
    """
    # Check if function body starts with a docstring
    if (
        func_node.body
        and isinstance(func_node.body[0], ast.Expr)
        and isinstance(func_node.body[0].value, ast.Constant)
        and isinstance(func_node.body[0].value.value, str)
    ):
        # Existing docstring -- find its end and insert before closing quotes
        doc_node = func_node.body[0]
        end_line = doc_node.end_lineno
        if end_line is None:
            return None

        # Insert contract block before the closing line of the docstring
        end_idx = end_line - 1  # 0-based index
        closing_line = lines[end_idx]

        # Determine indentation from the closing quotes
        stripped_closing = closing_line.lstrip()
        indent = closing_line[: len(closing_line) - len(stripped_closing)]

        # Build the insertion: newline + contracts + newline
        insertion = "\n" + contract_block + "\n" + indent
        # Insert before the closing triple quotes
        if '"""' in closing_line:
            modified_line = closing_line.replace('"""', insertion + '"""', 1)
        elif "'''" in closing_line:
            modified_line = closing_line.replace("'''", insertion + "'''", 1)
        else:
            # Single-line docstring on the closing line
            return None

        lines[end_idx] = modified_line
        return "".join(lines)
    else:
        # No docstring -- create one after the function definition line
        func_line = lines[func_node.lineno - 1]
        base_indent = func_line[: len(func_line) - len(func_line.lstrip())]
        body_indent = base_indent + "    "

        docstring = (
            f'{body_indent}"""Function with CrossHair contracts.\n'
            f"\n"
            f"{contract_block}\n"
            f'{body_indent}"""\n'
        )

        # Insert before the first statement in the function body
        if func_node.body:
            insert_idx = func_node.body[0].lineno - 1
        else:
            insert_idx = func_node.lineno

        lines.insert(insert_idx, docstring)
        return "".join(lines)


# ---------------------------------------------------------------------------
# CLI entry point for testing
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="CrossHair Bridge - Formal verification for Super-Goose",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run bridge self-test: initialise and report status.",
    )
    parser.add_argument(
        "--check",
        type=str,
        metavar="MODULE",
        help="Check contracts in a Python module.",
    )
    parser.add_argument(
        "--list-contracts",
        type=str,
        metavar="FILE",
        help="List contracts in a Python file.",
    )
    parser.add_argument(
        "--check-bridges",
        action="store_true",
        help="Check all bridge modules for contract violations.",
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Run CrossHair's built-in self-test.",
    )

    args = parser.parse_args()

    if args.test:
        print("CrossHair Bridge Self-Test")
        print("=" * 40)
        state = init()
        print(f"  Executable:   {state['executable']}")
        print(f"  Version:      {state['version']}")
        print(f"  Z3 Available: {state['z3_available']}")
        print(f"  Success:      {state['success']}")
        if state["error"]:
            print(f"  Error:        {state['error']}")
        print()

        s = status()
        print(f"  Status:       available={s.available}, healthy={s.healthy}")
        print(f"  Capabilities: {capabilities()}")
        print()
        print("Self-test complete.")

    elif args.check:
        result = asyncio.run(check_module(args.check))
        print(f"Module: {result.get('module')}")
        print(f"Success: {result.get('success')}")
        if result.get("counterexamples"):
            print("Counterexamples:")
            for ce in result["counterexamples"]:
                print(f"  - {ce}")
        if result.get("violations"):
            print("Violations:")
            for v in result["violations"]:
                print(f"  - {v.get('message', v)}")
        if result.get("error"):
            print(f"Error: {result['error']}")
        print(f"\nRaw output:\n{result.get('output', '')}")

    elif args.list_contracts:
        result = asyncio.run(list_contracts(args.list_contracts))
        print(f"Module: {result.get('module')}")
        print(f"Total functions: {result.get('total_functions')}")
        print(f"With contracts:  {result.get('functions_with_contracts')}")
        if result.get("contracts"):
            print("\nContracts:")
            for c in result["contracts"]:
                print(
                    f"  [{c['type']}] {c['function']} "
                    f"(line {c['line']}): {c['expression']}"
                )
        if result.get("error"):
            print(f"Error: {result['error']}")

    elif args.check_bridges:
        result = asyncio.run(check_all_bridges())
        print(f"Checked: {result.get('total_checked')} bridges")
        print(f"Passed:  {result.get('total_passed')}")
        print(f"Failed:  {result.get('total_failed')}")
        print(f"Errors:  {result.get('total_errors')}")
        if result.get("results"):
            for r in result["results"]:
                status_str = "PASS" if r.get("success") else "FAIL"
                print(f"  [{status_str}] {r.get('module', r.get('file'))}")
        if result.get("error"):
            print(f"Error: {result['error']}")

    elif args.selftest:
        print("Running CrossHair self-test...")
        result = asyncio.run(selftest())
        print(f"Success: {result.get('success')}")
        if result.get("output"):
            print(f"Output:\n{result['output']}")
        if result.get("error"):
            print(f"Error: {result['error']}")

    else:
        parser.print_help()
