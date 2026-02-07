# AGENTS Instructions

goose is a **sophisticated enterprise AI agent framework** in Rust with CLI and Electron desktop interfaces, featuring advanced multi-agent orchestration, specialist agents, and enterprise workflow automation.

## Quick Reference

**Primary Stacks:** Rust 1.75+ (backend) + TypeScript 5.9/React 19 (desktop)
**Key Commands:** `just release-binary`, `just run-ui`, `cargo test`, `./scripts/clippy-lint.sh`
**Entry Points:** Backend: `crates/goose/src/lib.rs` | Desktop: `ui/desktop/src/main.ts`
**Tests:** `cargo test` (Rust 950+ tests) | `npm run test:run` (UI 298 tests)

## Tech Stack (Complete)

### Backend Stack
- **Language**: Rust 1.75+ (2021 edition)
- **Async Runtime**: Tokio 1.x
- **Web Framework**: Axum 0.7
- **Build Tool**: Cargo + Just (cross-platform commands)
- **Testing**: Cargo test (950+ tests), cargo-nextest
- **Linting**: Clippy (zero warnings policy) + rustfmt
- **Quality**: SonarQube integration, Tarpaulin coverage
- **Key Crates**: anyhow, serde, tracing, async-trait

### Desktop Stack
- **Runtime**: Electron 40.2.1
- **UI Framework**: React 19.2.4 (functional components)
- **Language**: TypeScript 5.9.3 (strict mode)
- **Build**: Vite 7.3.1 + Electron Forge 7.10.2
- **Testing**: Vitest 4.0.18 (298 tests) + Playwright 1.57.0 (E2E)
- **Styling**: Tailwind CSS 4.1.18 + clsx for conditionals
- **State**: React Context API + SWR 2.3.8 for data fetching
- **Quality**: ESLint 9.39 + Prettier + Husky + lint-staged
- **Coverage**: Vitest Coverage v8 (12.2% current, 80% target)

### CI/CD Stack
- **Platform**: GitLab CI/CD (4-stage pipeline)
- **Quality Gate**: SonarQube Community Edition 9.9.8
- **Coverage**: Vitest Coverage (v8) + Cargo tarpaulin/llvm-cov
- **Pre-commit**: Husky hooks block TODO/FIXME/HACK/XXX markers
- **Pre-push**: SonarQube analysis enforces quality gate
- **Standards**: Zero warnings, zero blockers, zero critical issues

## Setup
```bash
source bin/activate-hermit
cargo build
```

## Commands

### Build
```bash
cargo build                   # debug
cargo build --release         # release  
just release-binary           # release + openapi
```

### Test
```bash
cargo test                   # all tests
cargo test -p goose          # specific crate
cargo test --package goose --test mcp_integration_test
just record-mcp-tests        # record MCP
```

### Lint/Format
```bash
cargo fmt
./scripts/clippy-lint.sh
cargo clippy --fix
```

### UI
```bash
just generate-openapi        # after server changes
just run-ui                  # start desktop
cd ui/desktop && npm test    # test UI
```

## Structure
```
crates/
├── goose             # core logic with enterprise multi-agent platform
│   ├── agents/       # Enhanced agent architecture
│   │   ├── agent.rs           # Core Agent with ExecutionMode, planning, critique
│   │   ├── orchestrator.rs    # AgentOrchestrator for multi-agent coordination
│   │   ├── workflow_engine.rs # Enterprise workflow orchestration
│   │   ├── specialists/       # Specialist agent implementations
│   │   │   ├── code_agent.rs     # Code generation specialist
│   │   │   ├── test_agent.rs     # Testing and QA specialist
│   │   │   ├── deploy_agent.rs   # Deployment specialist
│   │   │   ├── docs_agent.rs     # Documentation specialist
│   │   │   └── security_agent.rs # Security analysis specialist
│   │   ├── persistence/       # LangGraph-style checkpointing
│   │   ├── reasoning.rs       # ReAct, CoT, ToT patterns
│   │   ├── reflexion.rs       # Self-improvement via verbal reinforcement
│   │   ├── critic.rs          # Self-critique system
│   │   ├── planner.rs         # Multi-step planning system
│   │   ├── state_graph/       # Self-correcting execution loops
│   │   ├── shell_guard.rs     # Security and approval system
│   │   └── done_gate.rs       # Task completion verification
│   ├── prompts/      # Advanced prompt engineering
│   │   ├── mod.rs             # PromptManager for pattern coordination
│   │   ├── patterns.rs        # 20+ reusable patterns (ReAct, CoT, etc.)
│   │   ├── templates.rs       # Template engine with variable validation
│   │   └── errors.rs          # Error types for prompt operations
│   ├── observability/# Token tracking, cost estimation, tracing
│   ├── policies/     # Rule engine and policy management
│   ├── guardrails/   # Safety constraints and validation
│   └── mcp_gateway/  # MCP protocol gateway
├── goose-bench       # benchmarking
├── goose-cli         # CLI entry with workflow management
├── goose-server      # backend (binary: goosed)
├── goose-mcp         # MCP extensions with security integration
├── goose-test        # test utilities
├── mcp-client        # MCP client
├── mcp-core          # MCP shared
└── mcp-server        # MCP server

temporal-service/     # Go scheduler
ui/desktop/           # Electron app
```

## Development Loop

### Rust Changes
```bash
1. source bin/activate-hermit
2. Make changes
3. cargo fmt                           # format
4. cargo build                         # compile
5. cargo test -p <crate>               # test specific crate
6. ./scripts/clippy-lint.sh            # zero warnings
7. [if server changes] just generate-openapi
```

### UI Changes
```bash
1. cd ui/desktop
2. Make changes
3. npm run typecheck                   # TypeScript validation
4. npm run lint:check                  # ESLint (--max-warnings 0)
5. npm run test:run                    # Vitest tests
6. npm run format:check                # Prettier
7. [if API changes] just generate-openapi
```

### Performance Optimization (File-Scoped Operations)

**Single-File Operations (Preferred for Speed):**
```bash
# Type check one file
cd ui/desktop && npx tsc --noEmit src/components/ChatView.tsx

# Lint one file
cd ui/desktop && npx eslint src/components/ChatView.tsx --fix

# Test one file
cd ui/desktop && npx vitest src/components/ChatView.test.tsx

# Clippy one crate
cargo clippy -p goose -- -D warnings
```

**Full Project (Only When Explicitly Needed):**
```bash
npm run typecheck     # Full type check
npm run lint:check    # Full lint (all files)
npm run test:run      # Full test suite (298 tests)
./scripts/clippy-lint.sh  # All Rust warnings
```

## File Structure Map (Quick Navigation)

### Key Configuration Files
- **Rust**: `Cargo.toml`, `Cargo.lock`, `.clippy.toml`
- **UI**: `ui/desktop/package.json`, `ui/desktop/tsconfig.json`
- **Build**: `justfile`, `ui/desktop/forge.config.ts`, `ui/desktop/vite.config.ts`
- **Quality**: `crates/sonar-project.properties`, `ui/sonar-project.properties`
- **Tests**: `ui/desktop/vitest.config.ts`, `ui/desktop/playwright.config.ts`
- **Linting**: `ui/desktop/eslint.config.js`, `.prettierrc`
- **Git**: `.husky/pre-commit`, `.husky/pre-push`, `.gitlab-ci.yml`

### When You Modify...
| Change Type | Required Steps | Files to Update |
|------------|---------------|-----------------|
| **Rust core feature** | `cargo fmt` → `cargo build` → `cargo test` → `./scripts/clippy-lint.sh` | `crates/goose/src/` |
| **Server API endpoint** | Add route → `just generate-openapi` → rebuild UI | `crates/goose-server/src/routes/` |
| **UI component** | Create component → update `App.tsx` → add tests → lint | `ui/desktop/src/components/` |
| **Shared types** | Update model → `just generate-openapi` → rebuild both | `crates/goose-server/src/models/` |
| **Dependencies** | `cargo add <crate>` (Rust) | `npm install <pkg>` (UI) | `Cargo.toml`, `package.json` |

## Rules

Test: Prefer tests/ folder, e.g. crates/goose/tests/
Test: When adding features, update goose-self-test.yaml, rebuild, then run `goose run --recipe goose-self-test.yaml` to validate
Error: Use anyhow::Result
Provider: Implement Provider trait see providers/base.rs
MCP: Extensions in crates/goose-mcp/
Server: Changes need just generate-openapi

## Phase 5 Enterprise Rules

Agent: Implement SpecialistAgent trait see specialists/mod.rs
Orchestrator: Use AgentOrchestrator for multi-agent coordination
Workflow: Create workflow templates in WorkflowEngine
Specialist: Each specialist agent handles specific domain (Code, Test, Deploy, Docs, Security)
Enterprise: Follow enterprise patterns for scalability and maintainability

## Code Quality

Comments: Write self-documenting code - prefer clear names over comments
Comments: Never add comments that restate what code does
Comments: Only comment for complex algorithms, non-obvious business logic, or "why" not "what"
Simplicity: Don't make things optional that don't need to be - the compiler will enforce
Simplicity: Booleans should default to false, not be optional
Errors: Don't add error context that doesn't add useful information (e.g., `.context("Failed to X")` when error already says it failed)
Simplicity: Avoid overly defensive code - trust Rust's type system
Logging: Clean up existing logs, don't add more unless for errors or security events

## Common Patterns

### Adding a New Rust Crate Feature
```bash
1. Implement in crates/goose/src/
2. Export in crates/goose/src/lib.rs
3. Add tests in crates/goose/tests/
4. cargo fmt && cargo build && cargo test
5. ./scripts/clippy-lint.sh (zero warnings)
6. Update AGENTS.md if workflow changes
```

### Adding a New Desktop UI Feature
```bash
1. Create component in ui/desktop/src/components/
2. Add route in App.tsx if needed
3. Add tests: vitest src/components/YourComponent.test.tsx
4. Run quality checks: typecheck + lint + test
5. [if API integration] just generate-openapi
```

### Adding a Server API Endpoint
```bash
1. Define route in crates/goose-server/src/routes/
2. Add model in crates/goose-server/src/models/ (if needed)
3. Implement handler logic
4. just generate-openapi (creates ui/desktop/openapi.json)
5. Rebuild UI to get TypeScript types
6. Add tests for both backend and frontend
```

### Code Examples to Follow

**React Components**: Copy pattern from `ui/desktop/src/components/SettingsView.tsx`
- Functional components with TypeScript
- Props interface above component
- Use React Context for global state
- clsx for conditional Tailwind classes

**Rust Agent Specialists**: See `crates/goose/src/agents/specialists/code_agent.rs`
- Implement SpecialistAgent trait
- Use anyhow::Result for errors
- Add comprehensive tests in tests/ folder
- Follow existing logging patterns with tracing

**IPC Communication**: See `ui/desktop/src/components/McpApps/useSandboxBridge.ts`
- Main process exposes: `window.electron.invoke('channel-name', args)`
- Preload defines: `ipcRenderer.invoke('channel-name', args)`
- Type-safe with TypeScript interfaces

**Forms**: Use Tanstack React Form like `ui/desktop/src/components/SettingsView.tsx`
- Controlled components
- Validation on submit
- Error display patterns

## Anti-Patterns (Never Do This)

### Build/Config
- ❌ Edit `ui/desktop/openapi.json` manually (always use `just generate-openapi`)
- ❌ Edit `Cargo.toml` manually (use `cargo add <crate>` instead)
- ❌ Edit `package.json` dependencies manually (use `npm install`)
- ❌ Commit without `cargo fmt` and `./scripts/clippy-lint.sh`
- ❌ Commit UI changes without `npm run typecheck` and `npm run lint:check`
- ❌ Skip running tests before claiming task complete
- ❌ Use `--no-verify` on git commits (bypasses quality hooks)

### Code Quality
- ❌ Add comments that restate what code does (`// Initialize variable`)
- ❌ Comment getters/setters, constructors, or standard Rust/TypeScript idioms
- ❌ Make booleans optional when they should default to `false` (not `Option<bool>`)
- ❌ Add error context that doesn't add information (`.context("Failed to X")`)
- ❌ Write defensive code that duplicates type system guarantees
- ❌ Add logs for normal operations (only for errors or security events)

### Security
- ❌ Commit secrets, API keys, tokens, or credentials
- ❌ Skip security validation in `crates/goose/src/guardrails/`
- ❌ Bypass approval policies without explicit user permission
- ❌ Store credentials in code or config files (use environment variables)

### Architecture
- ❌ Introduce new patterns without discussing trade-offs
- ❌ Mix async/sync patterns (use Tokio consistently)
- ❌ Create circular dependencies between crates
- ❌ Add dependencies without checking existing alternatives

## Phase 7 Claude-Inspired Features

### Task Graph (crates/goose/src/tasks/)
DAG-based task management with dependencies, concurrency control, and persistence:
- `Task`, `TaskGraph`, `TaskGraphConfig` - Core task management
- `TaskPersistence` - Checkpoint/restore for long-running tasks
- `TaskEventEmitter` - Event-driven task lifecycle

### Hook System (crates/goose/src/hooks/)
Deterministic lifecycle hooks (13 events) with validators:
- `PreToolUse`, `PostToolUse`, `OnError`, `OnComplete` - Lifecycle events
- `HookManager`, `HookConfig` - Hook registration and execution
- `HookLogger` - Audit-proof logging (JSONL + human-readable)

### Validators (crates/goose/src/validators/)
Language-specific and security validators:
- `RustValidator` - cargo build/test/clippy/fmt
- `PythonValidator` - ruff/mypy/pyright
- `JavaScriptValidator` - eslint/tsc
- `SecurityValidator` - Secret detection, dangerous patterns
- `ContentValidator` - File existence, TODO checking

### Team Agents (crates/goose/src/agents/team/)
Builder/Validator pairing with enforced roles:
- `BuilderAgent` - Full write access, auto-validation
- `ValidatorAgent` - Read-only verification
- `TeamCoordinator` - Orchestrates build/validate workflows

### Tool Search (crates/goose/src/tools/)
Dynamic tool discovery (85% token reduction):
- `ToolSearchTool` - On-demand tool discovery
- `ToolRegistry` - Central tool management
- `ProgrammaticToolCall` - Structured tool calling with validation

### Compaction (crates/goose/src/compaction/)
Context management for long conversations:
- `CompactionManager` - Automatic context summarization
- `CompactionConfig` - Trigger thresholds, preservation rules
- Preserves critical messages while reducing tokens

### Skills Pack (crates/goose/src/skills/)
Installable enforcement modules:
- `SkillPack` - Prompts, validators, gates
- `SkillManager` - Discovery from .goose/skills/
- `GateConfig` - Pre-complete validation commands

### Status Line (crates/goose/src/status/)
Real-time feedback for agent operations:
- `StatusLine` - Ephemeral status updates
- `StatusUpdate` - Reading, writing, executing states
- `ToolExecutionStatus` - Progress tracking for tool calls

### Subagents (crates/goose/src/subagents/)
Task spawning and parallel execution:
- `SubagentSpawner` - Spawn and track subagents
- `SubagentConfig` - Type, instructions, timeout
- `SubagentResult` - Artifacts and summaries

### Agent Capabilities (crates/goose/src/agents/capabilities.rs)
Unified integration of Phase 7 modules:
- `AgentCapabilities` - Single interface for hooks, tasks, validators, tools
- `CapabilitiesConfig` - Feature toggles
- Hook integration for tool permission checks and done gates

### Slash Commands (crates/goose/src/slash_commands.rs)
Built-in and custom command handling:
- 20 built-in commands (/help, /clear, /compact, /status, etc.)
- `ParsedCommand` - Builtin, Recipe, or Unknown
- Recipe-based custom commands

## Phase 7-8 New Features

### Computer Use CLI
Integrated AI-driven computer control and debugging interface:
- **Location**: crates/goose-cli/src/computer_use.rs
- **Command**: `goose computer-use <subcommand>`
- **Subcommands**:
  - `control` - Direct keyboard/mouse control
  - `debug` - Interactive debugging with breakpoints
  - `test` - Automated testing (unit, integration, visual)
  - `remote` - Remote access and collaboration
  - `fix` - Workflow failure analysis and automated fixes
- **Status**: CLI structure complete, core logic needs implementation

### LM Studio Provider
Local AI model hosting with OpenAI-compatible API:
- **Location**: crates/goose/src/providers/lmstudio.rs
- **Models Supported**:
  - GLM 4.6, 4.7, 4-9b (Chinese language models)
  - Qwen2.5 Coder (7B, 14B, 32B)
  - Qwen3 Coder (latest)
  - DeepSeek R1 distill (7B, 32B) for reasoning
  - Qwen2 VL for vision tasks
  - Meta Llama 3.1, Mistral 7B
- **Features**:
  - OpenAI-compatible API (/v1/*)
  - Native LM Studio API (/api/v1/*)
  - Anthropic-compatible API (/v1/messages)
  - Model management (load/unload/download)
  - MCP integration for tool calling
  - Stateful chats with previous_response_id
  - Speculative decoding with draft models
  - Idle TTL and auto-evict
  - Enhanced stats (tokens/second, TTFT)
- **Configuration**:
  - `LMSTUDIO_BASE_URL` (default: http://localhost:1234/v1)
  - `LMSTUDIO_API_TOKEN` (optional authentication)
- **Status**: Fully implemented and integrated

## Entry Points
- CLI: crates/goose-cli/src/main.rs
- Server: crates/goose-server/src/main.rs
- UI: ui/desktop/src/main.ts
- Agent: crates/goose/src/agents/agent.rs
- Orchestrator: crates/goose/src/agents/orchestrator.rs
- WorkflowEngine: crates/goose/src/agents/workflow_engine.rs
- Specialists: crates/goose/src/agents/specialists/mod.rs
- **ComputerUse: crates/goose-cli/src/computer_use.rs** [Phase 7]
- Prompts: crates/goose/src/prompts/mod.rs
- Observability: crates/goose/src/observability/mod.rs
- Policies: crates/goose/src/policies/mod.rs
- Tasks: crates/goose/src/tasks/mod.rs
- Hooks: crates/goose/src/hooks/mod.rs
- Validators: crates/goose/src/validators/mod.rs
- Team: crates/goose/src/agents/team/mod.rs
- Tools: crates/goose/src/tools/mod.rs
- Compaction: crates/goose/src/compaction/mod.rs
- Skills: crates/goose/src/skills/mod.rs
- Status: crates/goose/src/status/mod.rs
- Subagents: crates/goose/src/subagents/mod.rs
- Capabilities: crates/goose/src/agents/capabilities.rs
- SlashCommands: crates/goose/src/slash_commands.rs
- **LM Studio Provider: crates/goose/src/providers/lmstudio.rs** [Phase 7]
