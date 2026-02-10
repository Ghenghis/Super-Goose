"""
Tool Registry - Central discovery and management of external tools.

Reads external_tools.toml and provides a unified interface for:
  - Discovering available tools
  - Checking tool health/status
  - Routing requests to the correct bridge module
  - Graceful degradation when tools are unavailable
"""

import importlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

try:
    import tomllib  # Python 3.11+
except ImportError:
    try:
        import tomli as tomllib  # Fallback
    except ImportError:
        tomllib = None


@dataclass
class ToolEndpoint:
    """A single API endpoint exposed by a tool."""
    method: str
    path: str


@dataclass
class ToolConfig:
    """Configuration for a single external tool."""
    name: str
    description: str
    path: str
    bridge_module: str
    enabled: bool = True
    capabilities: list[str] = field(default_factory=list)
    entry_point: str = ""
    python_requires: str = ""
    install_cmd: str = ""
    requires_docker: bool = False
    endpoints: dict[str, ToolEndpoint] = field(default_factory=dict)


@dataclass
class ToolStatus:
    """Runtime status of a tool."""
    name: str
    available: bool
    healthy: bool
    error: Optional[str] = None
    version: Optional[str] = None


class ToolRegistry:
    """
    Central registry for all external tools.

    Usage:
        registry = ToolRegistry()
        registry.load_config("config/external_tools.toml")

        # Check what's available
        for tool in registry.list_tools():
            status = registry.check_status(tool.name)
            print(f"{tool.name}: {'OK' if status.healthy else status.error}")

        # Route a request
        result = await registry.execute("aider", "edit_file", {
            "file": "src/main.rs",
            "instruction": "Add error handling"
        })
    """

    def __init__(self):
        self.tools: dict[str, ToolConfig] = {}
        self._bridges: dict[str, Any] = {}
        self._unavailable: dict[str, str] = {}
        self._config_path: Optional[Path] = None

    def load_config(self, config_path: str | Path) -> None:
        """Load tool configuration from TOML file."""
        config_path = Path(config_path)
        if not config_path.exists():
            logger.warning(f"Tool config not found: {config_path}")
            return

        if tomllib is None:
            logger.error("No TOML parser available. Install tomli: pip install tomli")
            return

        with open(config_path, "rb") as f:
            data = tomllib.load(f)

        self._config_path = config_path

        for tool_key, tool_data in data.get("tools", {}).items():
            endpoints = {}
            for ep_name, ep_data in tool_data.pop("endpoints", {}).items():
                endpoints[ep_name] = ToolEndpoint(
                    method=ep_data.get("method", "POST"),
                    path=ep_data.get("path", ""),
                )

            self.tools[tool_key] = ToolConfig(
                name=tool_data.get("name", tool_key),
                description=tool_data.get("description", ""),
                path=tool_data.get("path", ""),
                bridge_module=tool_data.get("bridge_module", ""),
                enabled=tool_data.get("enabled", True),
                capabilities=tool_data.get("capabilities", []),
                entry_point=tool_data.get("entry_point", ""),
                python_requires=tool_data.get("python_requires", ""),
                install_cmd=tool_data.get("install_cmd", ""),
                requires_docker=tool_data.get("requires_docker", False),
                endpoints=endpoints,
            )

        logger.info(
            f"Loaded {len(self.tools)} tools from {config_path}: "
            f"{', '.join(self.tools.keys())}"
        )

    def list_tools(self, enabled_only: bool = True) -> list[ToolConfig]:
        """List all registered tools."""
        tools = list(self.tools.values())
        if enabled_only:
            tools = [t for t in tools if t.enabled]
        return tools

    def get_tool(self, name: str) -> Optional[ToolConfig]:
        """Get a specific tool config by name."""
        return self.tools.get(name)

    def check_status(self, name: str) -> ToolStatus:
        """Check if a tool is available and healthy."""
        tool = self.tools.get(name)
        if not tool:
            return ToolStatus(name=name, available=False, healthy=False,
                              error=f"Tool '{name}' not registered")

        if not tool.enabled:
            return ToolStatus(name=name, available=False, healthy=False,
                              error="Tool is disabled in config")

        # Check if path exists
        if not Path(tool.path).exists():
            return ToolStatus(name=name, available=False, healthy=False,
                              error=f"Tool path not found: {tool.path}")

        # Try loading the bridge module
        try:
            bridge = self._get_bridge(name)
            if bridge is None:
                error_msg = self._unavailable.get(name, "Bridge failed to load")
                return ToolStatus(name=name, available=False, healthy=False,
                                  error=error_msg)
            if hasattr(bridge, "status"):
                return bridge.status()
            return ToolStatus(name=name, available=True, healthy=True)
        except Exception as e:
            return ToolStatus(name=name, available=True, healthy=False,
                              error=str(e))

    def _get_bridge(self, name: str) -> Any:
        """Lazy-load a bridge module. Returns None if bridge fails to load."""
        if name in self._unavailable:
            return None
        if name not in self._bridges:
            tool = self.tools.get(name)
            if not tool:
                raise ValueError(f"Tool '{name}' not registered")

            try:
                module = importlib.import_module(tool.bridge_module)
                self._bridges[name] = module
            except ImportError as e:
                logger.warning(
                    f"Bridge for '{name}' failed to load: {e}. "
                    f"Tool will be unavailable. Install: {tool.install_cmd}"
                )
                self._unavailable[name] = str(e)
                return None

        return self._bridges.get(name)

    async def execute(self, tool_name: str, operation: str,
                      params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute an operation on a tool via its bridge module."""
        tool = self.tools.get(tool_name)
        if not tool:
            return {"error": f"Tool '{tool_name}' not registered", "success": False}

        if not tool.enabled:
            return {"error": f"Tool '{tool_name}' is disabled", "success": False}

        try:
            bridge = self._get_bridge(tool_name)
            if bridge is None:
                error_msg = self._unavailable.get(tool_name, "Bridge not available")
                return {"error": f"Tool '{tool_name}' bridge not available: {error_msg}",
                        "success": False}
            if hasattr(bridge, "execute"):
                return await bridge.execute(operation, params or {})
            elif hasattr(bridge, operation):
                func = getattr(bridge, operation)
                return await func(**(params or {}))
            else:
                return {
                    "error": f"Operation '{operation}' not found on '{tool_name}'",
                    "success": False,
                }
        except Exception as e:
            logger.error(f"Error executing {tool_name}.{operation}: {e}")
            return {"error": str(e), "success": False}

    def find_tools_for_capability(self, capability: str) -> list[ToolConfig]:
        """Find all tools that support a given capability."""
        return [
            tool for tool in self.tools.values()
            if tool.enabled and capability in tool.capabilities
        ]

    def summary(self) -> str:
        """Return a human-readable summary of all tools."""
        lines = ["Super-Goose External Tools Registry", "=" * 40]
        available_count = 0
        unavailable_count = 0
        for name, tool in self.tools.items():
            status = self.check_status(name)
            if name in self._unavailable:
                icon = "[UNAVAIL]"
                unavailable_count += 1
            elif status.healthy:
                icon = "[OK]"
                available_count += 1
            elif status.available:
                icon = "[WARN]"
                available_count += 1
            else:
                icon = "[FAIL]"
                unavailable_count += 1
            lines.append(f"  {icon} {tool.name}")
            lines.append(f"     {tool.description}")
            lines.append(f"     Capabilities: {', '.join(tool.capabilities)}")
            if name in self._unavailable:
                lines.append(f"     Bridge error: {self._unavailable[name]}")
                lines.append(f"     Install: {tool.install_cmd}")
            elif status.error:
                lines.append(f"     Error: {status.error}")
            lines.append("")
        lines.append(f"Total: {len(self.tools)} tools | "
                      f"{available_count} available | "
                      f"{unavailable_count} unavailable")
        return "\n".join(lines)
