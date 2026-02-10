#!/usr/bin/env python3
"""
Run self-tests for all Stage 6-7 bridge modules.

Usage:
    python test_all_bridges.py          # Run all bridge self-tests
    python test_all_bridges.py --quick  # Just check imports, no execution
"""

import argparse
import importlib
import os
import subprocess
import sys
import time

# All bridge modules to test
BRIDGES = [
    "aider_bridge",
    "arrakis_bridge",
    "astgrep_bridge",
    "conscious_bridge",
    "crosshair_bridge",
    "dspy_bridge",
    "inspect_bridge",
    "langfuse_bridge",
    "langgraph_bridge",
    "mem0_bridge",
    "microsandbox_bridge",
    "openhands_bridge",
    "overnight_gym",
    "pr_agent_bridge",
    "pydantic_ai_bridge",
    "semgrep_bridge",
]

# Infrastructure modules
INFRA = [
    "resource_coordinator",
    "registry",
]


def check_file_exists(bridge: str) -> tuple[str, str]:
    """Check if bridge file exists."""
    path = os.path.join(
        os.path.dirname(__file__), "src", "integrations", f"{bridge}.py"
    )
    if os.path.exists(path):
        return bridge, "EXISTS"
    return bridge, "MISSING"


def check_import(bridge: str) -> tuple[str, str]:
    """Check if bridge can be imported."""
    try:
        # Add parent to path for relative imports
        src_dir = os.path.join(os.path.dirname(__file__), "src")
        if src_dir not in sys.path:
            sys.path.insert(0, src_dir)
        importlib.import_module(f"integrations.{bridge}")
        return bridge, "IMPORT_OK"
    except ImportError as e:
        return bridge, f"IMPORT_FAIL: {e}"
    except Exception as e:
        return bridge, f"ERROR: {e}"


def run_selftest(bridge: str) -> tuple[str, str]:
    """Run bridge self-test via subprocess."""
    path = os.path.join(
        os.path.dirname(__file__), "src", "integrations", f"{bridge}.py"
    )
    if not os.path.exists(path):
        return bridge, "MISSING"
    try:
        result = subprocess.run(
            [sys.executable, path, "--test"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=os.path.dirname(path),
        )
        if result.returncode == 0:
            return bridge, "PASS"
        return bridge, f"FAIL (exit {result.returncode}): {result.stderr[:200]}"
    except subprocess.TimeoutExpired:
        return bridge, "TIMEOUT (60s)"
    except Exception as e:
        return bridge, f"ERROR: {e}"


def main():
    parser = argparse.ArgumentParser(description="Test all Stage 6-7 bridges")
    parser.add_argument("--quick", action="store_true", help="Only check imports")
    args = parser.parse_args()

    all_modules = BRIDGES + INFRA
    print(f"\n{'='*60}")
    print(f"  Super-Goose Stage 6-7 Bridge Test Runner")
    print(f"  Testing {len(all_modules)} modules")
    print(f"{'='*60}\n")

    # Phase 1: File existence
    print("Phase 1: File existence check")
    print("-" * 40)
    missing = []
    for module in all_modules:
        name, status = check_file_exists(module)
        icon = "OK" if status == "EXISTS" else "MISSING"
        print(f"  [{icon}] {name}")
        if status == "MISSING":
            missing.append(name)
    print()

    if missing:
        print(f"  WARNING: {len(missing)} files missing: {missing}\n")

    if args.quick:
        # Phase 2: Import check only
        print("Phase 2: Import check (--quick mode)")
        print("-" * 40)
        import_fails = []
        for module in all_modules:
            name, status = check_import(module)
            ok = status == "IMPORT_OK"
            print(f"  [{'OK' if ok else 'FAIL'}] {name}: {status}")
            if not ok:
                import_fails.append(name)
        print()

        total = len(all_modules)
        passed = total - len(missing) - len(import_fails)
        print(f"\nResults: {passed}/{total} modules OK")
        if import_fails:
            print(f"Import failures: {import_fails}")
        sys.exit(1 if import_fails else 0)

    # Phase 2: Self-tests
    print("Phase 2: Self-tests")
    print("-" * 40)
    results = {}
    for module in all_modules:
        start = time.time()
        name, status = run_selftest(module)
        elapsed = time.time() - start
        results[name] = status
        ok = status == "PASS"
        print(f"  [{'PASS' if ok else 'FAIL'}] {name} ({elapsed:.1f}s): {status}")
    print()

    # Summary
    passes = sum(1 for s in results.values() if s == "PASS")
    failures = [n for n, s in results.items() if s != "PASS"]
    print(f"\n{'='*60}")
    print(f"  Results: {passes}/{len(results)} passed")
    if failures:
        print(f"  Failures: {failures}")
    print(f"{'='*60}\n")

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
