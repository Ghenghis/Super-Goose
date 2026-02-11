"""
Stage 6 MCP Bridge Servers for Super-Goose.

Each bridge wraps a third-party Python AI/ML library and exposes it as
an MCP stdio extension. Bridges are standalone Python scripts that
communicate via stdin/stdout JSON-RPC (MCP protocol).

Registration:
  Add to config.yaml under extensions:
    bridge_name:
      type: stdio
      cmd: python
      args: ["/path/to/bridge_name_bridge_server.py"]
      timeout: 300
      enabled: true
"""

# Bridge registry: name -> module filename (without .py)
BRIDGES = {
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
}

# Python package requirements for each bridge
REQUIREMENTS = {
    "aider": "aider-chat",
    "autogen": "pyautogen",
    "browser_use": "browser-use langchain-openai",
    "camel": "camel-ai",
    "composio": "composio-core",
    "crewai": "crewai",
    "dspy": "dspy-ai",
    "evoagentx": "evoagentx",
    "goat": "goat-sdk",
    "instructor": "instructor openai",
    "langchain": "langchain langchain-openai",
    "langgraph": "langgraph langchain-openai",
    "llamaindex": "llama-index",
    "mem0": "mem0ai",
    "swarm": "git+https://github.com/openai/swarm.git",
    "taskweaver": "taskweaver",
}


def get_bridge_path(bridge_name: str) -> str:
    """Return the module filename for a bridge."""
    if bridge_name not in BRIDGES:
        raise KeyError(f"Unknown bridge: {bridge_name}. Available: {list(BRIDGES.keys())}")
    return BRIDGES[bridge_name] + ".py"


def get_requirements(bridge_name: str) -> str:
    """Return pip install string for a bridge."""
    if bridge_name not in REQUIREMENTS:
        raise KeyError(f"Unknown bridge: {bridge_name}")
    return REQUIREMENTS[bridge_name]
