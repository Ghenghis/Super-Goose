"""
Aider MCP Server - Exposes Aider's editing capabilities as MCP tools for Goose.

This is a Model Context Protocol (MCP) server that wraps the existing
aider_bridge.py and exposes its functions as tools that Goose can call.

Communication is via stdio: JSON-RPC messages on stdin, responses on stdout.
All logging goes to stderr to avoid corrupting the MCP protocol stream.

Supports two modes:
  1. FastMCP mode   - Uses the ``mcp`` Python package (preferred)
  2. Raw JSON-RPC   - Fallback when ``mcp`` package is not installed

Launch:
    python aider_mcp_server.py

Extension config (goose profiles):
    type: stdio
    cmd: python
    args: ["G:/goose/external/conscious/src/integrations/aider_mcp_server.py"]
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Logging -- MUST go to stderr; stdout is the MCP protocol channel
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("aider-mcp")

# ---------------------------------------------------------------------------
# Import the aider bridge
# ---------------------------------------------------------------------------
# Add the integrations directory to sys.path so we can import aider_bridge
# and its dependency on integrations.registry
_this_dir = os.path.dirname(os.path.abspath(__file__))
_integrations_dir = _this_dir  # .../src/integrations
_src_dir = os.path.dirname(_integrations_dir)  # .../src

# The bridge does ``from integrations.registry import ToolStatus``
# so we need ``src/`` on the path so that ``integrations`` resolves.
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)

import integrations.aider_bridge as aider_bridge  # noqa: E402

# ---------------------------------------------------------------------------
# Server metadata
# ---------------------------------------------------------------------------
SERVER_NAME = "aider-mcp"
SERVER_VERSION = "1.0.0"
PROTOCOL_VERSION = "2024-11-05"

# ---------------------------------------------------------------------------
# Try to use the ``mcp`` Python package (FastMCP) if available
# ---------------------------------------------------------------------------
_USE_FASTMCP = False
try:
    from mcp.server.fastmcp import FastMCP
    from mcp.shared.exceptions import McpError
    from mcp.types import ErrorData, INTERNAL_ERROR, INVALID_PARAMS

    _USE_FASTMCP = True
    logger.info("Using FastMCP from the 'mcp' package")
except ImportError:
    logger.info("'mcp' package not found -- falling back to raw JSON-RPC")


# =========================================================================
# PATH 1: FastMCP-based server
# =========================================================================

if _USE_FASTMCP:

    mcp_server = FastMCP(
        SERVER_NAME,
        version=SERVER_VERSION,
    )

    @mcp_server.tool()
    async def aider_edit(
        file_path: str,
        instruction: str,
        strategy: str = "diff",
        model: Optional[str] = None,
        auto_commit: bool = False,
    ) -> str:
        """Edit a file using Aider with the specified instruction and strategy.

        Aider applies the instruction to the file using the chosen editing strategy.
        The default strategy is "diff" (search/replace blocks), which is the most
        reliable.  Use ``aider_strategies`` to see all 13 available strategies.

        Args:
            file_path:   Absolute or repo-relative path to the file to edit.
            instruction: Natural-language description of the desired change.
            strategy:    Edit strategy name (default "diff"). See aider_strategies.
            model:       Optional LLM model identifier for Aider to use.
            auto_commit: Whether to auto-commit the changes (default False).

        Returns:
            JSON string with {success, output, error, file, strategy}.
        """
        try:
            result = await aider_bridge.edit_file(
                file_path=file_path,
                instruction=instruction,
                edit_strategy=strategy,
                model=model,
                auto_commit=auto_commit,
            )
            return json.dumps(result, indent=2)
        except Exception as e:
            logger.error(f"aider_edit failed: {e}", exc_info=True)
            raise McpError(ErrorData(INTERNAL_ERROR, f"aider_edit error: {e}")) from e

    @mcp_server.tool()
    async def aider_map_repo(
        directory: str,
        map_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> str:
        """Generate a repository context map using Aider's tree-sitter integration.

        Builds a ranked tag map of the repository showing function signatures,
        class definitions, and imports -- fitted within the specified token budget.

        Args:
            directory:  Path to the repository root directory.
            map_tokens: Target token budget for the map (default 2048).
            model:      Optional LLM model identifier (for tokenizer selection).

        Returns:
            JSON string with {success, output, error, repo}.
        """
        try:
            result = await aider_bridge.map_repo(
                repo_path=directory,
                map_tokens=map_tokens,
                model=model,
            )
            return json.dumps(result, indent=2)
        except Exception as e:
            logger.error(f"aider_map_repo failed: {e}", exc_info=True)
            raise McpError(ErrorData(INTERNAL_ERROR, f"aider_map_repo error: {e}")) from e

    @mcp_server.tool()
    async def aider_commit(
        repo_path: str,
        message: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        """Auto-commit changes using Aider's smart commit message generation.

        If ``message`` is provided it is used directly.  Otherwise Aider generates
        a descriptive commit message from the staged diff using an LLM.

        Args:
            repo_path: Path to the git repository.
            message:   Optional explicit commit message.
            model:     Optional LLM model identifier.

        Returns:
            JSON string with {success, output, error, repo}.
        """
        try:
            result = await aider_bridge.auto_commit_changes(
                repo_path=repo_path,
                message=message,
                model=model,
            )
            return json.dumps(result, indent=2)
        except Exception as e:
            logger.error(f"aider_commit failed: {e}", exc_info=True)
            raise McpError(ErrorData(INTERNAL_ERROR, f"aider_commit error: {e}")) from e

    @mcp_server.tool()
    async def aider_lint(
        file_path: str,
        lint_cmd: Optional[str] = None,
        model: Optional[str] = None,
        auto_commit: bool = False,
    ) -> str:
        """Lint a file and auto-fix any issues found using Aider.

        Runs the configured linter on the file, then uses Aider to automatically
        apply fixes for any reported issues.

        Args:
            file_path:   Path to the file to lint and fix.
            lint_cmd:    Custom lint command (e.g. "ruff check --fix").
            model:       Optional LLM model identifier.
            auto_commit: Whether to auto-commit the fixes (default False).

        Returns:
            JSON string with {success, output, error, file}.
        """
        try:
            result = await aider_bridge.lint_and_fix(
                file_path=file_path,
                lint_cmd=lint_cmd,
                model=model,
                auto_commit=auto_commit,
            )
            return json.dumps(result, indent=2)
        except Exception as e:
            logger.error(f"aider_lint failed: {e}", exc_info=True)
            raise McpError(ErrorData(INTERNAL_ERROR, f"aider_lint error: {e}")) from e

    @mcp_server.tool()
    def aider_strategies() -> str:
        """List all available Aider code editing strategies.

        Returns the full list of 13 editing strategies with descriptions,
        the default strategy name, and the total count.

        Returns:
            JSON string with {success, strategies, default, count}.
        """
        result = aider_bridge.list_strategies()
        return json.dumps(result, indent=2)

    def run_fastmcp():
        """Entry point for FastMCP mode."""
        logger.info("Starting Aider MCP server (FastMCP mode)")
        mcp_server.run()


# =========================================================================
# PATH 2: Raw JSON-RPC over stdio (fallback)
# =========================================================================

# MCP tool definitions for the initialize handshake
TOOL_DEFINITIONS = [
    {
        "name": "aider_edit",
        "description": (
            "Edit a file using Aider with the specified instruction and strategy. "
            "The default strategy is 'diff' (search/replace blocks). "
            "Use aider_strategies to see all 13 available strategies."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Absolute or repo-relative path to the file to edit.",
                },
                "instruction": {
                    "type": "string",
                    "description": "Natural-language description of the desired change.",
                },
                "strategy": {
                    "type": "string",
                    "description": "Edit strategy name (default 'diff'). See aider_strategies.",
                    "default": "diff",
                },
                "model": {
                    "type": "string",
                    "description": "Optional LLM model identifier for Aider to use.",
                },
                "auto_commit": {
                    "type": "boolean",
                    "description": "Whether to auto-commit the changes (default false).",
                    "default": False,
                },
            },
            "required": ["file_path", "instruction"],
        },
    },
    {
        "name": "aider_map_repo",
        "description": (
            "Generate a repository context map using Aider's tree-sitter integration. "
            "Builds a ranked tag map showing function signatures, class definitions, "
            "and imports within the specified token budget."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "Path to the repository root directory.",
                },
                "map_tokens": {
                    "type": "integer",
                    "description": "Target token budget for the map (default 2048).",
                    "default": 2048,
                },
                "model": {
                    "type": "string",
                    "description": "Optional LLM model identifier (for tokenizer selection).",
                },
            },
            "required": ["directory"],
        },
    },
    {
        "name": "aider_commit",
        "description": (
            "Auto-commit changes using Aider's smart commit message generation. "
            "If message is provided it is used directly; otherwise Aider generates "
            "a descriptive commit message from the staged diff."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "repo_path": {
                    "type": "string",
                    "description": "Path to the git repository.",
                },
                "message": {
                    "type": "string",
                    "description": "Optional explicit commit message.",
                },
                "model": {
                    "type": "string",
                    "description": "Optional LLM model identifier.",
                },
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "aider_lint",
        "description": (
            "Lint a file and auto-fix any issues found using Aider. "
            "Runs the configured linter then uses Aider to apply fixes."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to lint and fix.",
                },
                "lint_cmd": {
                    "type": "string",
                    "description": "Custom lint command (e.g. 'ruff check --fix').",
                },
                "model": {
                    "type": "string",
                    "description": "Optional LLM model identifier.",
                },
                "auto_commit": {
                    "type": "boolean",
                    "description": "Whether to auto-commit the fixes (default false).",
                    "default": False,
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "name": "aider_strategies",
        "description": (
            "List all available Aider code editing strategies with descriptions, "
            "the default strategy, and the total count."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


async def _handle_tool_call(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a tool call to the appropriate aider_bridge function."""
    if tool_name == "aider_edit":
        return await aider_bridge.edit_file(
            file_path=arguments["file_path"],
            instruction=arguments["instruction"],
            edit_strategy=arguments.get("strategy", "diff"),
            model=arguments.get("model"),
            auto_commit=arguments.get("auto_commit", False),
        )
    elif tool_name == "aider_map_repo":
        return await aider_bridge.map_repo(
            repo_path=arguments["directory"],
            map_tokens=arguments.get("map_tokens", 2048),
            model=arguments.get("model"),
        )
    elif tool_name == "aider_commit":
        return await aider_bridge.auto_commit_changes(
            repo_path=arguments["repo_path"],
            message=arguments.get("message"),
            model=arguments.get("model"),
        )
    elif tool_name == "aider_lint":
        return await aider_bridge.lint_and_fix(
            file_path=arguments["file_path"],
            lint_cmd=arguments.get("lint_cmd"),
            model=arguments.get("model"),
            auto_commit=arguments.get("auto_commit", False),
        )
    elif tool_name == "aider_strategies":
        return aider_bridge.list_strategies()
    else:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}


def _make_response(req_id: Any, result: Any) -> dict:
    """Build a JSON-RPC 2.0 success response."""
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _make_error(req_id: Any, code: int, message: str, data: Any = None) -> dict:
    """Build a JSON-RPC 2.0 error response."""
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": err}


# JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS_CODE = -32602
INTERNAL_ERROR_CODE = -32603


async def _handle_message(msg: dict) -> Optional[dict]:
    """
    Process a single JSON-RPC message according to the MCP protocol.

    Returns a response dict, or None for notifications (no ``id``).
    """
    req_id = msg.get("id")
    method = msg.get("method", "")
    params = msg.get("params", {})

    logger.debug(f"Received: method={method} id={req_id}")

    # ---- initialize ----
    if method == "initialize":
        return _make_response(req_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
            },
            "serverInfo": {
                "name": SERVER_NAME,
                "version": SERVER_VERSION,
            },
        })

    # ---- notifications/initialized ----
    if method == "notifications/initialized" or method == "initialized":
        logger.info("Client completed initialization handshake")
        return None  # notification, no response

    # ---- ping ----
    if method == "ping":
        return _make_response(req_id, {})

    # ---- tools/list ----
    if method == "tools/list":
        return _make_response(req_id, {"tools": TOOL_DEFINITIONS})

    # ---- tools/call ----
    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        # Validate tool exists
        valid_tools = {t["name"] for t in TOOL_DEFINITIONS}
        if tool_name not in valid_tools:
            return _make_error(
                req_id,
                METHOD_NOT_FOUND,
                f"Unknown tool: {tool_name}. Available: {', '.join(sorted(valid_tools))}",
            )

        try:
            result = await _handle_tool_call(tool_name, arguments)
            # MCP tools/call returns content as an array of content blocks
            content_text = json.dumps(result, indent=2)
            is_error = not result.get("success", True)
            return _make_response(req_id, {
                "content": [{"type": "text", "text": content_text}],
                "isError": is_error,
            })
        except KeyError as e:
            return _make_error(
                req_id,
                INVALID_PARAMS_CODE,
                f"Missing required parameter: {e}",
            )
        except Exception as e:
            logger.error(f"Tool call {tool_name} failed: {e}", exc_info=True)
            return _make_response(req_id, {
                "content": [{"type": "text", "text": json.dumps({
                    "success": False,
                    "error": str(e),
                })}],
                "isError": True,
            })

    # ---- unknown method ----
    if req_id is not None:
        return _make_error(req_id, METHOD_NOT_FOUND, f"Unknown method: {method}")

    # Unknown notification -- ignore
    logger.debug(f"Ignoring unknown notification: {method}")
    return None


def _write_stdout(msg: dict) -> None:
    """Write a JSON-RPC message to stdout as a newline-delimited JSON line.

    Uses the raw binary stdout buffer to avoid encoding issues on Windows
    and ensures the output is flushed immediately.
    """
    data = json.dumps(msg) + "\n"
    sys.stdout.buffer.write(data.encode("utf-8"))
    sys.stdout.buffer.flush()


async def run_raw_jsonrpc():
    """
    Main loop for the raw JSON-RPC stdio server.

    Reads newline-delimited JSON from stdin and writes responses to stdout.
    Uses a thread-based stdin reader to avoid platform-specific asyncio pipe
    issues (especially on Windows where connect_read_pipe is unreliable
    with console handles).
    """
    logger.info("Starting Aider MCP server (raw JSON-RPC mode)")

    loop = asyncio.get_event_loop()

    # Use a binary stdin handle for reliable cross-platform reading
    stdin_bin = sys.stdin.buffer

    def _read_line_blocking() -> Optional[bytes]:
        """Read a single line from stdin (blocking). Returns None on EOF."""
        try:
            line = stdin_bin.readline()
            if not line:
                return None
            return line
        except (OSError, ValueError):
            return None

    logger.info("Aider MCP server ready -- waiting for JSON-RPC messages on stdin")

    while True:
        try:
            # Read stdin in a thread so we don't block the event loop
            raw_line = await loop.run_in_executor(None, _read_line_blocking)
            if raw_line is None:
                logger.info("stdin closed -- shutting down")
                break

            line_str = raw_line.decode("utf-8", errors="replace").strip()
            if not line_str:
                continue

            try:
                msg = json.loads(line_str)
            except json.JSONDecodeError as e:
                error_resp = _make_error(None, PARSE_ERROR, f"JSON parse error: {e}")
                _write_stdout(error_resp)
                continue

            response = await _handle_message(msg)
            if response is not None:
                _write_stdout(response)

        except asyncio.CancelledError:
            logger.info("Server cancelled -- shutting down")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            try:
                error_resp = _make_error(None, INTERNAL_ERROR_CODE, f"Server error: {e}")
                _write_stdout(error_resp)
            except Exception:
                pass


# =========================================================================
# Entry point
# =========================================================================

def main():
    """Start the Aider MCP server."""
    logger.info(f"Aider MCP Server v{SERVER_VERSION}")
    logger.info(f"Protocol version: {PROTOCOL_VERSION}")
    logger.info(f"Bridge module: {aider_bridge.__file__}")
    logger.info(f"FastMCP available: {_USE_FASTMCP}")

    # Initialize the aider bridge eagerly so we log status at startup
    init_result = aider_bridge.init()
    if init_result["success"]:
        logger.info(
            f"Aider bridge ready: {init_result['executable']} "
            f"(v{init_result['version']})"
        )
    else:
        logger.warning(
            f"Aider bridge init warning: {init_result['error']} "
            "(tools will return errors until aider is installed)"
        )

    if _USE_FASTMCP:
        run_fastmcp()
    else:
        asyncio.run(run_raw_jsonrpc())


if __name__ == "__main__":
    main()
