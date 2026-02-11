# Stage 6 MCP Bridge Servers

MCP (Model Context Protocol) bridge servers that wrap third-party Python AI/ML
libraries and expose them as stdio extensions for Super-Goose.

## Overview

Each bridge is a standalone Python script that:
- Runs as an MCP stdio server (communicates via stdin/stdout JSON-RPC)
- Wraps a specific Python library (CrewAI, LangChain, DSPy, etc.)
- Provides 2-3 tools specific to that library
- Handles missing dependencies gracefully (returns "unavailable" status)

## Available Bridges

| Bridge | Package | Tools | Description |
|--------|---------|-------|-------------|
| aider | `aider-chat` | edit_code, review_code | AI pair programming |
| autogen | `pyautogen` | create_agent, run_conversation | Multi-agent conversations |
| browser_use | `browser-use` | browse_url, extract_data | AI web browsing |
| camel | `camel-ai` | create_society, run_task | Role-playing agent societies |
| composio | `composio-core` | execute_action, list_actions | Tool/action orchestration |
| crewai | `crewai` | create_crew, kickoff | Multi-agent task orchestration |
| dspy | `dspy-ai` | compile_program, predict | Prompt optimization |
| evoagentx | `evoagentx` | evolve_agent, evaluate | Evolutionary agent optimization |
| goat | `goat-sdk` | execute_task, get_tools | Web3/blockchain agent toolkit |
| instructor | `instructor` | extract_structured, validate | Structured LLM output |
| langchain | `langchain` | run_chain, create_agent | Chain execution and agents |
| langgraph | `langgraph` | run_graph, create_graph | Stateful agent workflows |
| llamaindex | `llama-index` | create_index, query_index | RAG document querying |
| mem0 | `mem0ai` | add_memory, search_memory, get_all | Persistent memory |
| swarm | `openai/swarm` | run_swarm, create_agent, multi_agent | Lightweight multi-agent |
| taskweaver | `taskweaver` | plan_task, execute_plan | Code-first task planning |

## Quick Start

### 1. Install a bridge

```bash
# All bridges need the MCP SDK
pip install mcp

# Install the bridge-specific package
pip install crewai        # for CrewAI bridge
pip install langchain langchain-openai  # for LangChain bridge
pip install mem0ai        # for Mem0 bridge
```

### 2. Test the bridge locally

```bash
# Run directly to verify it starts
python crewai_bridge_server.py
```

The server will start listening on stdin for MCP JSON-RPC messages.
Press Ctrl+C to stop.

### 3. Register in config.yaml

Add the bridge to your Super-Goose configuration:

```yaml
extensions:
  crewai_bridge:
    type: stdio
    cmd: python
    args: ["/path/to/crates/goose-mcp/src/bridges/crewai_bridge_server.py"]
    timeout: 300
    enabled: true
```

### 4. Or register in bundled-extensions.json

The bridges are already registered in
`ui/desktop/src/components/settings/extensions/bundled-extensions.json`
with type `stdio`. They appear in the Extensions panel and can be
toggled on/off.

## Creating a New Bridge

1. Copy `mcp_bridge_template.py` as `{name}_bridge_server.py`
2. Update `BRIDGE_NAME`, `BRIDGE_DESCRIPTION`
3. Replace the library import in the try/except block
4. Define your tools in `list_tools()` with appropriate schemas
5. Implement tool handlers in `call_tool()`
6. Add entry to `__init__.py` BRIDGES dict
7. Add entry to `bundled-extensions.json`

## Architecture

```
Super-Goose Agent (Rust)
  |
  +-- MCP Protocol (stdio: stdin/stdout JSON-RPC)
  |
  +-- Bridge Server (Python)
        |
        +-- @server.list_tools()   -> Advertise capabilities
        +-- @server.call_tool()    -> Execute tool invocations
        |
        +-- Third-party Library (crewai, langchain, etc.)
```

## Error Handling

All bridges follow a consistent error pattern:

- **Library not installed**: Returns `{"status": "unavailable", "message": "..."}`
- **Execution error**: Returns `{"status": "error", "message": "..."}`
- **Success**: Returns `{"status": "success", ...tool-specific-fields...}`

## Environment Variables

Most bridges require an `OPENAI_API_KEY` (or equivalent) to be set,
since the underlying libraries use LLM APIs. Set this in your shell
or in the Super-Goose environment configuration.

## File Structure

```
bridges/
  __init__.py                  # Bridge registry and requirements
  mcp_bridge_template.py       # Template for new bridges
  README.md                    # This file
  aider_bridge_server.py       # Aider bridge
  autogen_bridge_server.py     # AutoGen bridge
  browser_use_bridge_server.py # Browser-Use bridge
  camel_bridge_server.py       # CAMEL bridge
  composio_bridge_server.py    # Composio bridge
  crewai_bridge_server.py      # CrewAI bridge
  dspy_bridge_server.py        # DSPy bridge
  evoagentx_bridge_server.py   # EvoAgentX bridge
  goat_bridge_server.py        # GOAT bridge
  instructor_bridge_server.py  # Instructor bridge
  langchain_bridge_server.py   # LangChain bridge
  langgraph_bridge_server.py   # LangGraph bridge
  llamaindex_bridge_server.py  # LlamaIndex bridge
  mem0_bridge_server.py        # Mem0 bridge
  swarm_bridge_server.py       # Swarm bridge
  taskweaver_bridge_server.py  # TaskWeaver bridge
```
