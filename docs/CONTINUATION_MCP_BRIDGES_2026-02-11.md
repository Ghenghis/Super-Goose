# Continuation: MCP Bridge Servers for Stage 6 Tools

**Date**: 2026-02-11
**Branch**: feat/session-9-wiring
**Author**: Claude Opus 4.6

## Summary

Created 16 MCP bridge server wrappers for Stage 6 Python tools, plus a
template, registry, and documentation. These bridges enable third-party
Python AI/ML libraries to be loaded as MCP stdio extensions in Super-Goose.

## Files Created

### Template and Infrastructure
| File | Purpose |
|------|---------|
| `crates/goose-mcp/src/bridges/__init__.py` | Bridge registry with BRIDGES dict and REQUIREMENTS |
| `crates/goose-mcp/src/bridges/mcp_bridge_template.py` | Annotated template for creating new bridges |
| `crates/goose-mcp/src/bridges/README.md` | Usage docs, quick start, architecture diagram |

### 16 Bridge Servers
| File | Library | Package | Tools |
|------|---------|---------|-------|
| `aider_bridge_server.py` | Aider | `aider-chat` | edit_code, review_code |
| `autogen_bridge_server.py` | AutoGen | `pyautogen` | create_agent, run_conversation |
| `browser_use_bridge_server.py` | Browser-Use | `browser-use` | browse_url, extract_data |
| `camel_bridge_server.py` | CAMEL-AI | `camel-ai` | create_society, run_task |
| `composio_bridge_server.py` | Composio | `composio-core` | execute_action, list_actions |
| `crewai_bridge_server.py` | CrewAI | `crewai` | create_crew, kickoff |
| `dspy_bridge_server.py` | DSPy | `dspy-ai` | compile_program, predict |
| `evoagentx_bridge_server.py` | EvoAgentX | `evoagentx` | evolve_agent, evaluate |
| `goat_bridge_server.py` | GOAT | `goat-sdk` | execute_task, get_tools |
| `instructor_bridge_server.py` | Instructor | `instructor` | extract_structured, validate |
| `langchain_bridge_server.py` | LangChain | `langchain` | run_chain, create_agent |
| `langgraph_bridge_server.py` | LangGraph | `langgraph` | run_graph, create_graph |
| `llamaindex_bridge_server.py` | LlamaIndex | `llama-index` | create_index, query_index |
| `mem0_bridge_server.py` | Mem0 | `mem0ai` | add_memory, search_memory, get_all |
| `swarm_bridge_server.py` | Swarm | `openai/swarm` | run_swarm, create_agent, multi_agent |
| `taskweaver_bridge_server.py` | TaskWeaver | `taskweaver` | plan_task, execute_plan |

## Design Patterns

All bridges follow the same architecture:

1. **MCP SDK import** with fatal exit if missing
2. **Library import** in try/except with graceful degradation
3. **`@server.list_tools()`** returning Tool objects with JSON Schema
4. **`@server.call_tool()`** routing to async handler functions
5. **Structured JSON responses** with status, result, and error fields
6. **Logging to stderr** (stdout reserved for MCP protocol)

## config.yaml Registration Pattern

```yaml
extensions:
  crewai_bridge:
    type: stdio
    cmd: python
    args: ["G:/goose/crates/goose-mcp/src/bridges/crewai_bridge_server.py"]
    timeout: 300
    enabled: true
```

## bundled-extensions.json Status

All 16 bridges already have entries in bundled-extensions.json (added in
earlier session). They appear in the Extensions UI panel with type "stdio".

## Installation Requirements

All bridges require:
```bash
pip install mcp  # MCP SDK (required for all bridges)
```

Per-bridge requirements:
```
aider:       pip install aider-chat
autogen:     pip install pyautogen
browser_use: pip install browser-use langchain-openai
camel:       pip install camel-ai
composio:    pip install composio-core
crewai:      pip install crewai
dspy:        pip install dspy-ai
evoagentx:   pip install evoagentx
goat:        pip install goat-sdk
instructor:  pip install instructor openai
langchain:   pip install langchain langchain-openai
langgraph:   pip install langgraph langchain-openai
llamaindex:  pip install llama-index
mem0:        pip install mem0ai
swarm:       pip install git+https://github.com/openai/swarm.git
taskweaver:  pip install taskweaver
```

Most bridges also need `OPENAI_API_KEY` in the environment.

## Remaining Work

### High Priority
- [ ] Wire bundled-extensions.json `cmd`/`args` fields to actual bridge paths
- [ ] Add bridge path resolution in goose-server extension loader
- [ ] Integration test: start bridge, send MCP handshake, call a tool
- [ ] Add `pip install` command to each bridge's bundled-extensions.json entry

### Medium Priority
- [ ] Create `requirements.txt` per bridge for isolated venv install
- [ ] Add Docker containers for bridges with complex dependencies
- [ ] Health-check endpoint (status tool) for each bridge
- [ ] Bridge auto-discovery from bridges/ directory

### Low Priority
- [ ] CI pipeline to validate bridge imports (syntax check only)
- [ ] Bridge performance benchmarks
- [ ] Shared utility module for common patterns (logging, error handling)
- [ ] Bridge version negotiation with MCP protocol versioning

## Architecture Notes

```
Super-Goose Desktop App
  |
  +-- Electron (ui/desktop)
  |     +-- Extensions Panel (bundled-extensions.json)
  |     +-- Toggle enable/disable per bridge
  |
  +-- goose-server (Rust)
  |     +-- Extension Loader
  |     +-- Spawns Python subprocess per bridge
  |     +-- MCP stdio transport (stdin/stdout JSON-RPC)
  |
  +-- Bridge Server (Python, one per library)
        +-- mcp.server.stdio handles protocol
        +-- @server.list_tools() advertises capabilities
        +-- @server.call_tool() handles invocations
        +-- Library import with graceful fallback
```

## Verification

To verify a bridge works:
```bash
# 1. Install dependencies
pip install mcp crewai

# 2. Run the bridge (it will wait for MCP messages on stdin)
python crates/goose-mcp/src/bridges/crewai_bridge_server.py

# 3. In another terminal, send a JSON-RPC message:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python crewai_bridge_server.py
```
