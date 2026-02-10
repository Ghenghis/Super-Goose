"""Quick smoke test for aider_mcp_server.py -- verifies it can import and handle initialize."""

import json
import sys
import os

# Add this directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

# Suppress all logging to stderr during test
import logging
logging.disable(logging.CRITICAL)

# Test 1: Import the module
print("Test 1: Import aider_mcp_server...", end=" ")
try:
    import aider_mcp_server
    print("OK")
except Exception as e:
    print(f"FAIL: {e}")
    sys.exit(1)

# Test 2: Check constants
print("Test 2: Check server constants...", end=" ")
assert aider_mcp_server.SERVER_NAME == "aider-mcp"
assert aider_mcp_server.SERVER_VERSION == "1.0.0"
assert aider_mcp_server.PROTOCOL_VERSION == "2024-11-05"
print("OK")

# Test 3: Check tool definitions
print("Test 3: Check tool definitions...", end=" ")
tool_names = {t["name"] for t in aider_mcp_server.TOOL_DEFINITIONS}
expected = {"aider_edit", "aider_map_repo", "aider_commit", "aider_lint", "aider_strategies"}
assert tool_names == expected, f"Got {tool_names}, expected {expected}"
print(f"OK ({len(tool_names)} tools)")

# Test 4: Handle initialize request
print("Test 4: Handle initialize request...", end=" ")
import asyncio

async def test_initialize():
    msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"},
        },
    }
    response = await aider_mcp_server._handle_message(msg)
    assert response is not None, "Response should not be None"
    assert response["id"] == 1
    assert "result" in response
    result = response["result"]
    assert result["protocolVersion"] == "2024-11-05"
    assert "tools" in result["capabilities"]
    assert result["serverInfo"]["name"] == "aider-mcp"
    return response

resp = asyncio.run(test_initialize())
print("OK")
print(f"  Response: {json.dumps(resp, indent=2)}")

# Test 5: Handle tools/list request
print("Test 5: Handle tools/list request...", end=" ")

async def test_tools_list():
    msg = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    response = await aider_mcp_server._handle_message(msg)
    assert response is not None
    assert response["id"] == 2
    tools = response["result"]["tools"]
    assert len(tools) == 5
    return response

resp = asyncio.run(test_tools_list())
print("OK")

# Test 6: Handle aider_strategies tool call
print("Test 6: Handle aider_strategies tool call...", end=" ")

async def test_strategies():
    msg = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {"name": "aider_strategies", "arguments": {}},
    }
    response = await aider_mcp_server._handle_message(msg)
    assert response is not None
    assert response["id"] == 3
    result = response["result"]
    content = json.loads(result["content"][0]["text"])
    assert content["success"] is True
    assert content["count"] == 13
    assert content["default"] == "diff"
    return content

content = asyncio.run(test_strategies())
print(f"OK ({content['count']} strategies, default={content['default']})")

# Test 7: Handle notifications/initialized (should return None)
print("Test 7: Handle notifications/initialized...", end=" ")

async def test_notification():
    msg = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    response = await aider_mcp_server._handle_message(msg)
    assert response is None, "Notification should return None"

asyncio.run(test_notification())
print("OK (no response, as expected)")

# Test 8: Handle unknown tool
print("Test 8: Handle unknown tool...", end=" ")

async def test_unknown_tool():
    msg = {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {"name": "nonexistent_tool", "arguments": {}},
    }
    response = await aider_mcp_server._handle_message(msg)
    assert response is not None
    assert "error" in response
    assert response["error"]["code"] == -32601
    return response

resp = asyncio.run(test_unknown_tool())
print("OK (error returned correctly)")

# Test 9: Handle ping
print("Test 9: Handle ping...", end=" ")

async def test_ping():
    msg = {"jsonrpc": "2.0", "id": 5, "method": "ping", "params": {}}
    response = await aider_mcp_server._handle_message(msg)
    assert response is not None
    assert response["id"] == 5
    assert "result" in response

asyncio.run(test_ping())
print("OK")

# Test 10: Verify FastMCP status
print(f"Test 10: FastMCP available: {aider_mcp_server._USE_FASTMCP}")

print()
print("=" * 50)
print("All tests passed!")
print("=" * 50)
