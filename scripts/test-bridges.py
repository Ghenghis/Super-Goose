#!/usr/bin/env python3
"""
Test all Super-Goose bridge server implementations.

Verifies each bridge can be imported, has required MCP handlers
(list_tools, call_tool), and optionally calls a status tool.

Usage:
    python scripts/test-bridges.py                      # test all bridges
    python scripts/test-bridges.py --syntax-only        # syntax check only (no deps needed)
    python scripts/test-bridges.py --bridge aider       # test specific bridge
    python scripts/test-bridges.py --json               # JSON output
    python scripts/test-bridges.py --verbose            # detailed output
    python scripts/test-bridges.py --new-only           # test only the 19 new bridges
"""

import argparse
import ast
import asyncio
import importlib
import importlib.util
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

# Path to bridge server files
BRIDGES_DIR = Path(__file__).resolve().parent.parent / "crates" / "goose-mcp" / "src" / "bridges"

# Add bridges dir to path so we can import from it
sys.path.insert(0, str(BRIDGES_DIR))

# Bridge registry: name -> module filename (without .py)
# Mirrors __init__.py BRIDGES dict
BRIDGES = {
    # --- Original 16 ---
    "aider": "aider_bridge_server",
    "autogen": "autogen_bridge_server",
    "browser_use": "browser_use_bridge_server",
    "camel": "camel_bridge_server",
    "composio": "composio_bridge_server",
    "crewai": "crewai_bridge_server",
    "dspy": "dspy_bridge_server",
    "evoagentx": "evoagentx_bridge_server",
    "goat": "goat_bridge_server",
    "instructor": "instructor_bridge_server",
    "langchain": "langchain_bridge_server",
    "langgraph": "langgraph_bridge_server",
    "llamaindex": "llamaindex_bridge_server",
    "mem0": "mem0_bridge_server",
    "swarm": "swarm_bridge_server",
    "taskweaver": "taskweaver_bridge_server",
    # --- New 19 ---
    "resource_coordinator": "resource_coordinator_bridge_server",
    "inspect_bridge": "inspect_bridge_server",
    "langfuse_bridge": "langfuse_bridge_server",
    "openhands_bridge": "openhands_bridge_server",
    "semgrep_bridge": "semgrep_bridge_server",
    "scip_bridge": "scip_bridge_server",
    "swe_agent_bridge": "swe_agent_bridge_server",
    "playwright_bridge": "playwright_bridge_server",
    "voice_bridge": "voice_bridge_server",
    "emotion_bridge": "emotion_bridge_server",
    "microsandbox_bridge": "microsandbox_bridge_server",
    "arrakis_bridge": "arrakis_bridge_server",
    "astgrep_bridge": "astgrep_bridge_server",
    "conscious_bridge": "conscious_bridge_server",
    "crosshair_bridge": "crosshair_bridge_server",
    "pydantic_ai_bridge": "pydantic_ai_bridge_server",
    "praisonai_bridge": "praisonai_bridge_server",
    "pr_agent_bridge": "pr_agent_bridge_server",
    "overnight_gym_bridge": "overnight_gym_bridge_server",
}

# Just the 19 new bridges (for --new-only flag)
NEW_BRIDGES = {k: v for k, v in BRIDGES.items() if k not in {
    "aider", "autogen", "browser_use", "camel", "composio", "crewai",
    "dspy", "evoagentx", "goat", "instructor", "langchain", "langgraph",
    "llamaindex", "mem0", "swarm", "taskweaver",
}}


def syntax_check_bridge(name: str, module_name: str) -> dict[str, Any]:
    """Check a bridge file for Python syntax errors using ast.parse().
    Does NOT attempt to import or execute the file -- no dependencies needed."""
    module_path = BRIDGES_DIR / f"{module_name}.py"
    result = {"name": name, "module": module_name, "file": str(module_path)}

    if not module_path.exists():
        result["status"] = "NOT_FOUND"
        result["error"] = f"File not found: {module_path}"
        return result

    try:
        source = module_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(module_path))
        line_count = len(source.splitlines())
        func_count = sum(
            1 for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        )

        # Verify expected structural elements exist in the AST
        has_main = any(
            isinstance(n, ast.AsyncFunctionDef) and n.name == "main"
            for n in ast.walk(tree)
        )
        has_call_tool = any(
            isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "call_tool"
            for n in ast.walk(tree)
        )
        has_list_tools = any(
            isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "list_tools"
            for n in ast.walk(tree)
        )

        result["status"] = "OK"
        result["lines"] = line_count
        result["functions"] = func_count
        result["has_main"] = has_main
        result["has_list_tools"] = has_list_tools
        result["has_call_tool"] = has_call_tool
    except SyntaxError as e:
        result["status"] = "SYNTAX_ERROR"
        result["error"] = f"Line {e.lineno}: {e.msg}"
    except Exception as e:
        result["status"] = "ERROR"
        result["error"] = f"{type(e).__name__}: {e}"
    return result


class BridgeTestResult:
    """Result of testing a single bridge."""

    def __init__(self, name: str):
        self.name = name
        self.module_found = False
        self.import_ok = False
        self.import_error: str | None = None
        self.has_server = False
        self.has_list_tools = False
        self.has_call_tool = False
        self.tools_listed: list[str] = []
        self.list_tools_error: str | None = None
        self.has_status_tool = False
        self.status_result: dict[str, Any] | None = None
        self.status_error: str | None = None
        self.lib_available: bool | None = None

    @property
    def passed(self) -> bool:
        return self.module_found and self.import_ok and self.has_list_tools and self.has_call_tool

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "passed": self.passed,
            "module_found": self.module_found,
            "import_ok": self.import_ok,
            "import_error": self.import_error,
            "has_server": self.has_server,
            "has_list_tools": self.has_list_tools,
            "has_call_tool": self.has_call_tool,
            "tools": self.tools_listed,
            "has_status_tool": self.has_status_tool,
            "status_result": self.status_result,
            "status_error": self.status_error,
            "lib_available": self.lib_available,
        }


def load_bridge_module(name: str, module_name: str) -> tuple[Any, str | None]:
    """Load a bridge module by filename. Returns (module, error_string)."""
    module_path = BRIDGES_DIR / f"{module_name}.py"

    if not module_path.exists():
        return None, f"File not found: {module_path}"

    try:
        spec = importlib.util.spec_from_file_location(module_name, str(module_path))
        if spec is None or spec.loader is None:
            return None, f"Cannot create module spec for {module_path}"

        module = importlib.util.module_from_spec(spec)
        # Prevent the bridge from running its __main__ block
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module, None
    except SystemExit:
        # Some bridges call sys.exit(1) if MCP SDK is missing
        return None, "Module called sys.exit (likely missing dependency)"
    except ImportError as exc:
        return None, f"ImportError: {exc}"
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"


async def test_bridge(name: str, module_name: str, verbose: bool = False) -> BridgeTestResult:
    """Test a single bridge by importing it and checking handlers."""
    result = BridgeTestResult(name)

    # Check module file exists
    module_path = BRIDGES_DIR / f"{module_name}.py"
    result.module_found = module_path.exists()
    if not result.module_found:
        result.import_error = f"File not found: {module_path}"
        return result

    # Import module
    module, error = load_bridge_module(name, module_name)
    if error:
        result.import_error = error
        return result
    result.import_ok = True

    # Check for _LIB_AVAILABLE flag
    if hasattr(module, "_LIB_AVAILABLE"):
        result.lib_available = getattr(module, "_LIB_AVAILABLE")

    # Check for server object
    server = getattr(module, "server", None)
    result.has_server = server is not None

    # Check for list_tools handler
    # MCP servers register handlers via @server.list_tools() decorator.
    # The handler is stored internally; we check if the server's request_handlers
    # dict has the ListToolsRequest key, or we look for the function directly.
    list_tools_fn = None

    # Try to find the decorated list_tools function
    # Check module-level function named list_tools
    if hasattr(module, "list_tools") and callable(module.list_tools):
        result.has_list_tools = True
        list_tools_fn = module.list_tools
    # Also check if the server has registered handlers
    if server is not None:
        try:
            handlers = getattr(server, "request_handlers", {})
            if handlers:
                for key in handlers:
                    key_name = str(key)
                    if "ListTools" in key_name or "list_tools" in key_name:
                        result.has_list_tools = True
                        if list_tools_fn is None:
                            list_tools_fn = handlers[key]
                        break
        except Exception:
            pass

    # Check for call_tool handler
    if hasattr(module, "call_tool") and callable(module.call_tool):
        result.has_call_tool = True
    if server is not None:
        try:
            handlers = getattr(server, "request_handlers", {})
            if handlers:
                for key in handlers:
                    key_name = str(key)
                    if "CallTool" in key_name or "call_tool" in key_name:
                        result.has_call_tool = True
                        break
        except Exception:
            pass

    # Try to call list_tools to enumerate available tools
    if list_tools_fn is not None:
        try:
            tools_result = list_tools_fn()
            if asyncio.iscoroutine(tools_result):
                tools_result = await tools_result
            if isinstance(tools_result, list):
                for tool in tools_result:
                    tool_name = getattr(tool, "name", None) or (
                        tool.get("name") if isinstance(tool, dict) else str(tool)
                    )
                    if tool_name:
                        result.tools_listed.append(tool_name)
                # Check for status tool
                status_names = {"status", f"{name}_status", "resource_status", "bridge_status"}
                for tool_name in result.tools_listed:
                    if tool_name in status_names or tool_name.endswith("_status"):
                        result.has_status_tool = True
                        break
        except Exception as exc:
            result.list_tools_error = f"{type(exc).__name__}: {exc}"
            if verbose:
                traceback.print_exc()

    # Try calling a status tool if one exists
    if result.has_status_tool:
        call_tool_fn = getattr(module, "call_tool", None)
        if call_tool_fn is not None:
            status_tool_name = None
            for t_name in result.tools_listed:
                if t_name.endswith("_status") or t_name == "status":
                    status_tool_name = t_name
                    break

            if status_tool_name:
                try:
                    status_result = call_tool_fn(status_tool_name, {})
                    if asyncio.iscoroutine(status_result):
                        status_result = await status_result
                    if isinstance(status_result, list) and len(status_result) > 0:
                        item = status_result[0]
                        text = getattr(item, "text", None) or (
                            item.get("text") if isinstance(item, dict) else str(item)
                        )
                        if text:
                            try:
                                result.status_result = json.loads(text)
                            except (json.JSONDecodeError, TypeError):
                                result.status_result = {"raw": text}
                    elif isinstance(status_result, dict):
                        result.status_result = status_result
                except Exception as exc:
                    result.status_error = f"{type(exc).__name__}: {exc}"

    return result


def print_result(result: BridgeTestResult, verbose: bool = False) -> None:
    """Print a single bridge test result."""
    icon = "\033[32m[PASS]\033[0m" if result.passed else "\033[31m[FAIL]\033[0m"
    lib_tag = ""
    if result.lib_available is not None:
        lib_tag = (
            " \033[32m(lib available)\033[0m"
            if result.lib_available
            else " \033[33m(lib missing)\033[0m"
        )

    print(f"  {icon} {result.name}{lib_tag}")

    if not result.passed or verbose:
        if result.import_error:
            print(f"         Import: {result.import_error}")
        if not result.has_list_tools:
            print("         Missing: list_tools handler")
        if not result.has_call_tool:
            print("         Missing: call_tool handler")
        if result.list_tools_error:
            print(f"         list_tools error: {result.list_tools_error}")

    if verbose and result.tools_listed:
        print(f"         Tools: {', '.join(result.tools_listed)}")

    if verbose and result.has_status_tool:
        if result.status_result:
            print(f"         Status: {json.dumps(result.status_result, indent=2)[:200]}")
        elif result.status_error:
            print(f"         Status error: {result.status_error}")


async def main() -> int:
    parser = argparse.ArgumentParser(description="Test Super-Goose bridge servers")
    parser.add_argument("--bridge", "-b", type=str, default="all",
                        help="Bridge name to test, or 'all' (default: all)")
    parser.add_argument("--json", "-j", action="store_true",
                        help="Output results as JSON")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show detailed output per bridge")
    parser.add_argument("--list", "-l", action="store_true",
                        help="List available bridges and exit")
    parser.add_argument("--syntax-only", "-s", action="store_true",
                        help="Only check Python syntax (ast.parse), no imports needed")
    parser.add_argument("--new-only", "-n", action="store_true",
                        help="Only test the 19 new bridges (skip original 16)")
    args = parser.parse_args()

    # List mode
    if args.list:
        print("Available bridges:")
        for name, module_name in sorted(BRIDGES.items()):
            module_path = BRIDGES_DIR / f"{module_name}.py"
            exists = "[exists]" if module_path.exists() else "[missing]"
            print(f"  {name:30s} {module_name}.py  {exists}")
        return 0

    # Select bridge set
    bridge_set = NEW_BRIDGES if args.new_only else BRIDGES

    # Syntax-only mode: just ast.parse, no imports
    if args.syntax_only:
        if args.bridge == "all":
            targets = list(bridge_set.items())
        else:
            if args.bridge not in bridge_set:
                print(f"Error: Unknown bridge '{args.bridge}'", file=sys.stderr)
                return 1
            targets = [(args.bridge, bridge_set[args.bridge])]

        if not args.json:
            print(f"Syntax-checking {len(targets)} bridge(s)...")
            print(f"Bridges directory: {BRIDGES_DIR}")
            print()

        syntax_results = [syntax_check_bridge(name, mod) for name, mod in targets]
        ok = sum(1 for r in syntax_results if r["status"] == "OK")
        fail = len(syntax_results) - ok

        if args.json:
            print(json.dumps({"total": len(syntax_results), "ok": ok, "errors": fail,
                              "results": syntax_results}, indent=2))
        else:
            for r in syntax_results:
                if r["status"] == "OK":
                    extra = f"{r['lines']} lines, {r['functions']} funcs"
                    if not r.get("has_list_tools"):
                        extra += " [WARN: no list_tools]"
                    if not r.get("has_call_tool"):
                        extra += " [WARN: no call_tool]"
                    print(f"  \033[32m[OK]\033[0m    {r['name']:<35} {extra}")
                else:
                    print(f"  \033[31m[ERROR]\033[0m {r['name']:<35} {r.get('error', r['status'])}")

            print()
            print(f"{'='*60}")
            print(f"  Total: {len(syntax_results)} | OK: \033[32m{ok}\033[0m | Errors: \033[31m{fail}\033[0m")
            print(f"{'='*60}")
        return 1 if fail > 0 else 0

    # Determine which bridges to test
    if args.bridge == "all":
        bridges_to_test = list(bridge_set.items())
    else:
        if args.bridge not in bridge_set:
            print(f"Error: Unknown bridge '{args.bridge}'", file=sys.stderr)
            print(f"Available: {', '.join(sorted(bridge_set.keys()))}", file=sys.stderr)
            return 1
        bridges_to_test = [(args.bridge, bridge_set[args.bridge])]

    if not args.json:
        print(f"Testing {len(bridges_to_test)} bridge(s)...")
        print(f"Bridges directory: {BRIDGES_DIR}")
        print()

    # Run tests
    results: list[BridgeTestResult] = []
    for name, module_name in bridges_to_test:
        result = await test_bridge(name, module_name, verbose=args.verbose)
        results.append(result)

        if not args.json:
            print_result(result, verbose=args.verbose)

    # Summary
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    libs_available = sum(1 for r in results if r.lib_available is True)
    libs_missing = sum(1 for r in results if r.lib_available is False)

    if args.json:
        output = {
            "summary": {
                "total": len(results),
                "passed": passed,
                "failed": failed,
                "libs_available": libs_available,
                "libs_missing": libs_missing,
            },
            "results": [r.to_dict() for r in results],
        }
        print(json.dumps(output, indent=2))
    else:
        print()
        print(f"{'='*50}")
        print(f"  Total:  {len(results)}")
        print(f"  Passed: \033[32m{passed}\033[0m")
        print(f"  Failed: \033[31m{failed}\033[0m")
        if libs_available > 0 or libs_missing > 0:
            print(f"  Libs available: {libs_available}, missing: {libs_missing}")
        print(f"{'='*50}")

        if failed > 0:
            print()
            failed_names = [r.name for r in results if not r.passed]
            print(f"  Failed bridges: {', '.join(failed_names)}")

    return 1 if failed > 0 else 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
