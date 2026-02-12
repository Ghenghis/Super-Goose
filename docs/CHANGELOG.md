# Super-Goose Changelog

## [Unreleased] — feat/resizable-layout (2026-02-12)

### Added — Resizable Panel System
- **react-resizable-panels** integration for IDE-like dockable layout
- 4-zone layout: Left (sidebar), Center (chat), Right (agent/SG panels), Bottom (pipeline/terminal)
- `PanelSystemProvider` context with layout state, lock/unlock, localStorage persistence
- `PanelRegistry` with 9 configurable panels (sidebar, chat, pipeline, agent, super-goose, terminal, logs, settings, help)
- `PanelLayoutPresets` with 5 presets: Focus, Standard, Full, Agent, Custom
- `PanelContainer` wrapper with minimize/maximize/close controls
- `PanelToolbar` with layout mode selector and panel toggles
- `StatusBar` extracted from ChatInput (dir, cost, model, mode, extensions)
- `ResizableLayout` main orchestrator replacing AppLayout's inner content
- 50+ new Vitest tests for panel system components

### Added — Documentation Overhaul
- New comprehensive docs: ARCHITECTURE.md, AGENTIC_CORES.md, UI_PANEL_SYSTEM.md, FEATURES.md, ROADMAP.md, TESTING.md, BUILD_AND_DEPLOY.md, ENTERPRISE.md
- Removed 40+ outdated session docs, audit reports, and chat logs

## [1.24.05] — feat/comprehensive-testing (2026-02-12)

### Added — Agentic Core System (Phase 0-3)
- `AgentCore` trait with 6 implementations: Freeform, Structured, Orchestrator, Swarm, Workflow, Adversarial
- `AgentCoreRegistry` with hot-swap and `/core`, `/cores` commands
- `CoreSelector` auto-selects best core per task (experience + suitability scoring)
- `CoreMetrics` per-core performance tracking
- `AgentContext` shared execution context
- 87/87 core unit tests passing

### Added — Learning Engine (Phase 2)
- `ExperienceStore` — SQLite cross-session learning (task→core→outcome→insights)
- `InsightExtractor` — ExpeL-style pattern analysis
- `SkillLibrary` — Voyager-style reusable strategies with verified-only retrieval
- `SqliteReflectionStore` — Persistent Reflexion data
- `ReflexionAgent` — Learn-from-mistakes loop
- `LlmPlanner` — LLM + regex fallback planning
- `/experience`, `/skills`, `/insights` commands
- 52/52 learning tests passing

### Added — OTA Self-Build Pipeline (Phase 4)
- 7 modules: StateSaver, SelfBuilder, BinarySwapper, HealthChecker, RollbackManager, UpdateScheduler, OtaManager
- 90/90 OTA tests passing

### Added — Autonomous Daemon (Phase 5)
- 8 modules: TaskScheduler, BranchManager, ReleaseManager, DocsGenerator, CiWatcher, Failsafe, AuditLog, AutonomousDaemon
- 86/86 autonomous tests passing

### Added — Pipeline Visualization (Phase 6)
- Real-time 6-stage pipeline: PLAN → TEAM → EXECUTE → EVOLVE → REVIEW → OBSERVE
- Quantum particle animations, ChatState-wired
- Pipeline toggle in AppSettingsSection with localStorage persist
- 69/69 pipeline tests passing

### Added — Super-Goose 8-Panel Sidebar (Phase 7)
- Dashboard, Studios, Agents, Marketplace, GPU, Connections, Monitor, Settings
- `data-super="true"` scoping with sg-* CSS tokens
- 11/11 panel tests passing

### Added — sg-* Design Tokens (Phase 8)
- 255 lines of CSS variables and utility classes
- Brand colors: --sg-gold, --sg-indigo, --sg-emerald, etc.
- Scoped to `.super-goose-panel` / `[data-super="true"]`
- Stock Goose colors (teal, orange) UNTOUCHED

### Added — CI/CD (Phase 10)
- `ci-comprehensive.yml` (371 lines) with change detection
- Concurrency groups, artifact upload, test result summaries
- RELEASE_CHECKLIST.md

### Fixed — Critical Wiring Gaps (commit b12a665ed6)
- init_learning_stores() now called via lazy Mutex init in reply()
- Core dispatch routes through active core (non-freeform → core.execute())
- CoreSelector auto-invoked before dispatch
- SuperGoosePanel routed at `/super`

### Fixed — Playwright E2E Tests (commit 5c1fa46ae1)
- 17 test files fixed (strict mode, navigation, force-click, MCP SDK import)
- 291 pass, 68 skip, 0 fail

## [1.24.02] — 2026-02-11

### Added
- Branding: All product-facing strings → "Super-Goose" (46+ edits, 12+ files)
- Agent Panel: 8 components in GooseSidebar/ with AgentPanelContext
- TimeWarp Bar: 8 components with TimeWarpContext
- Enterprise Settings: 7 panels
- CLI Integration: 7 components (route `/cli`, CLIProvider)
- Tools Panel: 30-extension 3-tier display

### Fixed
- 27 TypeScript errors fixed across 16 test files
- 33 Vitest runtime failures fixed
- All URLs updated from block.github.io → ghenghis.github.io/Super-Goose
