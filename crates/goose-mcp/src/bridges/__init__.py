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
    # --- Original 16 bridges ---
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
    # --- New 19 bridges ---
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

# Python package requirements for each bridge
REQUIREMENTS = {
    # --- Original 16 ---
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
    # --- New 19 ---
    "resource_coordinator": "mcp",
    "inspect_bridge": "inspect-ai",
    "langfuse_bridge": "langfuse",
    "openhands_bridge": "openhands-ai",
    "semgrep_bridge": "semgrep",
    "scip_bridge": "scip-python",
    "swe_agent_bridge": "sweagent",
    "playwright_bridge": "playwright",
    "voice_bridge": "pyttsx3 SpeechRecognition",
    "emotion_bridge": "transformers torch",
    "microsandbox_bridge": "microsandbox",
    "arrakis_bridge": "arrakis-compute",
    "astgrep_bridge": "ast-grep-py",
    "conscious_bridge": "mcp",
    "crosshair_bridge": "crosshair-tool",
    "pydantic_ai_bridge": "pydantic-ai",
    "praisonai_bridge": "praisonai",
    "pr_agent_bridge": "pr-agent",
    "overnight_gym_bridge": "pytest",
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
