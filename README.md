<div align="center">

# Super-Goose

> An AI-powered coding agent with multi-core intelligence, cross-session learning, and a professional IDE-like interface.

**Fork of [Block's Goose](https://github.com/block/goose) with enterprise-grade enhancements.**

[![Version](https://img.shields.io/badge/v1.25.0-stable-FF6600?style=for-the-badge)](https://github.com/Ghenghis/Super-Goose/releases/tag/v1.25.0)
[![Tests](https://img.shields.io/badge/Tests-5,423_passing-00CC66?style=for-the-badge)](https://github.com/Ghenghis/Super-Goose/actions)
[![CI](https://img.shields.io/github/actions/workflow/status/Ghenghis/Super-Goose/ci-main.yml?branch=feat/resizable-layout&style=for-the-badge&label=CI&color=00CC66)](https://github.com/Ghenghis/Super-Goose/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-FF6600.svg?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/Ghenghis/Super-Goose/pkgs/container/super-goose)
[![Docs](https://img.shields.io/badge/Docs-GitHub_Pages-00CC66?style=for-the-badge&logo=github&logoColor=white)](https://ghenghis.github.io/Super-Goose/)

</div>

---

## Key Features

### Multi-Core Agent System

6 specialized agent cores that auto-select the best approach per task:

| Core | Strategy | Best For |
|:--|:--|:--|
| **Freeform** | General-purpose conversational AI | Research, brainstorming, Q&A (default) |
| **Structured** | Code &rarr; Test &rarr; Fix finite state machine | Deterministic development cycles |
| **Orchestrator** | DAG-based task decomposition | Complex multi-step coordination |
| **Swarm** | Parallel multi-agent execution | Large-scale refactoring |
| **Workflow** | Template-driven pipelines | CI, deploy, and release sequences |
| **Adversarial** | Coach/Player review pattern | High-stakes code review |

> Switch cores at runtime with `/core <name>`. List available cores with `/cores`. No restart needed.

### Cross-Session Learning

Super-Goose remembers what works across sessions. Four interlocking systems drive continuous improvement:

| System | Inspired By | Purpose |
|:--|:--|:--|
| **ExperienceStore** | SQLite persistence | Records every task &rarr; core &rarr; outcome &rarr; insight |
| **InsightExtractor** | ExpeL (2023) | Discovers patterns in core selection and failure modes |
| **SkillLibrary** | Voyager (2023) | Retrieves verified-only reusable strategies |
| **Reflexion** | Reflexion (2023) | Persistent learn-from-mistakes loop across restarts |

**CoreSelector** auto-picks the best AgentCore per task using ExperienceStore history with confidence scoring and source tracking (experience / suitability / default).

### Professional UI

| Feature | Details |
|:--|:--|
| **AG-UI Protocol** | Real-time SSE streaming with broadcast event bus (capacity 4096) |
| **Resizable Panels** | Dockable panel system with upstream shadcn Sidebar + CSS transitions |
| **5 Layout Presets** | Focus, Standard, Full, Agent, Custom |
| **Pipeline Visualization** | Real-time animated PLAN &rarr; TEAM &rarr; EXECUTE &rarr; EVOLVE &rarr; REVIEW &rarr; OBSERVE |
| **16 Super-Goose Panels** | Dashboard, Studios, Agents, Marketplace, GPU, Connections, Monitor, Settings + 8 more |
| **GPU Detection** | nvidia-smi parsing backend with real-time memory/utilization monitoring |
| **sg-* Design Tokens** | 255 CSS custom properties with dual color scoping -- stock Goose colors untouched |

### Enterprise Features

| Feature | Description |
|:--|:--|
| **Cost Tracking** | Real-time budget enforcement with over-budget alerts |
| **Content Guardrails** | Bidirectional scanning for secrets and PII (warn-only) |
| **Enterprise Settings** | 7 dedicated settings panels for team configuration |
| **OTA Self-Build** | State save, self-build, binary swap, health check, rollback |
| **Autonomous Daemon** | Task scheduler, branch manager, CI watcher, docs generator, audit log |
| **Extended Thinking** | 7 chain-of-thought patterns with configurable budgets |
| **Human-in-the-Loop** | Breakpoints, plan approval, feedback injection, state inspection |

---

## Test Coverage

All counts verified. Zero failures across all suites.

| Suite | Tests | Status |
|:--|--:|:--|
| **Rust Core (Agent + Learning)** | 139 | All passing |
| **Rust Total** | 1,754 | All passing |
| **Vitest (Frontend)** | 3,378 | All passing (239 files) |
| **Playwright E2E** | 291 | All passing (68 skipped: backend/CDP) |
| **TypeScript** | 0 errors | `tsc --noEmit` clean |
| **Cargo Check** | 0 warnings | Both `goose` and `goose-server` crates |
| **Total** | **5,423+** | **Zero failures** |

---

## Quick Start

See [BUILD_AND_DEPLOY.md](docs/archive/sessions/BUILD_AND_DEPLOY.md) for full build instructions, including Rust backend compilation, Electron desktop packaging, Docker images, and platform-specific notes.

| Platform | CLI | Desktop |
|:--|:--|:--|
| **Docker** | `ghcr.io/ghenghis/super-goose:v1.25.0` | -- |
| **Windows x64** | `goose-x86_64-pc-windows-msvc.zip` | `Super-Goose-win32-x64.zip` |
| **macOS ARM** | `goose-aarch64-apple-darwin.tar.bz2` | `Super-Goose.dmg` |
| **macOS Intel** | `goose-x86_64-apple-darwin.tar.bz2` | `Super-Goose-intel.dmg` |
| **Linux x86** | `goose-x86_64-unknown-linux-gnu.tar.bz2` | `.deb` / `.rpm` |
| **Linux ARM** | `goose-aarch64-unknown-linux-gnu.tar.bz2` | -- |

---

## Documentation

| Document | Description |
|:--|:--|
| [Architecture: Agentic Cores](docs/ARCHITECTURE_AGENTIC_CORES.md) | System overview with Mermaid diagrams and data flow |
| [Continuation Guide](docs/CONTINUATION_10_AGENTS_MASTER.md) | 10-agent master plan and phase tracking |
| [Release Checklist](docs/RELEASE_CHECKLIST.md) | Pre-release verification steps |
| [GitHub Pages](https://ghenghis.github.io/Super-Goose/) | Full Docusaurus documentation site |

---

## Tech Stack

| Layer | Technology |
|:--|:--|
| **Backend** | Rust (7 workspace crates), Tokio async, SQLite, MCP protocol |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4 |
| **Desktop** | Electron + electron-forge |
| **Layout** | shadcn Sidebar + CSS transitions (5 presets) |
| **Streaming** | AG-UI protocol (SSE + broadcast channel event bus) |
| **Testing** | cargo test, Vitest, Playwright, tsc |
| **CI/CD** | GitHub Actions (change detection, matrix builds, comprehensive + release workflows) |
| **Container** | Docker (`ghcr.io/ghenghis/super-goose`, linux/amd64) |
| **Docs** | Docusaurus on GitHub Pages |

---

## Contributing

Super-Goose is a fork of [Block's Goose](https://github.com/block/goose). Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Run the full test suite (Rust, Vitest, and Playwright)
4. Submit a pull request

See the [Issues](https://github.com/Ghenghis/Super-Goose/issues) page for open tasks.

---

## License

[Apache License 2.0](LICENSE) -- Based on [Goose](https://github.com/block/goose) by Block, Inc.

---

<div align="center">

**Built with the Super-Goose multi-agent system.**

[Releases](https://github.com/Ghenghis/Super-Goose/releases) &bull; [Docker](https://github.com/Ghenghis/Super-Goose/pkgs/container/super-goose) &bull; [Docs](https://ghenghis.github.io/Super-Goose/) &bull; [Discord](https://discord.gg/goose-oss) &bull; [Issues](https://github.com/Ghenghis/Super-Goose/issues)

</div>
