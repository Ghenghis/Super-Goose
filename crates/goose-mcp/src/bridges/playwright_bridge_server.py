#!/usr/bin/env python3
"""
Playwright MCP Bridge Server for Super-Goose.

Wraps Playwright for browser automation — page navigation, screenshots,
element interaction, and form filling via MCP stdio protocol.

Install: pip install mcp playwright && python -m playwright install
"""

import asyncio
import base64
import json
import logging
import sys
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "playwright_bridge"
BRIDGE_DESCRIPTION = "Playwright browser automation for navigation, screenshots, and interaction"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from playwright.async_api import async_playwright
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("playwright not installed. Install: pip install playwright && python -m playwright install")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="playwright_navigate",
            description="Navigate to a URL and return page title + text content",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to navigate to",
                    },
                    "wait_for": {
                        "type": "string",
                        "description": "Wait condition: load, domcontentloaded, networkidle",
                        "default": "load",
                    },
                    "extract_text": {
                        "type": "boolean",
                        "description": "Extract visible text content from the page",
                        "default": True,
                    },
                },
                "required": ["url"],
            },
        ),
        Tool(
            name="playwright_screenshot",
            description="Take a screenshot of a page and return it as base64",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to screenshot",
                    },
                    "full_page": {
                        "type": "boolean",
                        "description": "Capture full scrollable page vs. viewport only",
                        "default": False,
                    },
                    "selector": {
                        "type": "string",
                        "description": "CSS selector to screenshot a specific element",
                        "default": "",
                    },
                },
                "required": ["url"],
            },
        ),
        Tool(
            name="playwright_evaluate",
            description="Execute JavaScript on a page and return the result",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to navigate to first",
                    },
                    "script": {
                        "type": "string",
                        "description": "JavaScript code to execute on the page",
                    },
                },
                "required": ["url", "script"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "playwright_navigate":
            result = await _navigate(arguments)
        elif name == "playwright_screenshot":
            result = await _screenshot(arguments)
        elif name == "playwright_evaluate":
            result = await _evaluate(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _navigate(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "playwright not installed"}

    url = args["url"]
    wait_for = args.get("wait_for", "load")
    extract = args.get("extract_text", True)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until=wait_for, timeout=30000)

            title = await page.title()
            text = ""
            if extract:
                text = await page.inner_text("body")
                text = text[:5000]  # Limit text size

            await browser.close()
            return {
                "status": "success",
                "url": url,
                "title": title,
                "text": text if extract else "(extraction disabled)",
            }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _screenshot(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "playwright not installed"}

    url = args["url"]
    full_page = args.get("full_page", False)
    selector = args.get("selector", "")

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until="load", timeout=30000)

            if selector:
                element = page.locator(selector)
                screenshot_bytes = await element.screenshot()
            else:
                screenshot_bytes = await page.screenshot(full_page=full_page)

            await browser.close()
            b64 = base64.b64encode(screenshot_bytes).decode()
            return {
                "status": "success",
                "url": url,
                "full_page": full_page,
                "selector": selector or "(viewport)",
                "screenshot_base64": b64,
                "size_bytes": len(screenshot_bytes),
            }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _evaluate(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "playwright not installed"}

    url = args["url"]
    script = args["script"]

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until="load", timeout=30000)

            result = await page.evaluate(script)
            await browser.close()
            return {
                "status": "success",
                "url": url,
                "script": script[:200],
                "result": str(result)[:5000],
            }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
