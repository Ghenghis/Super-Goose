---
title: Development Guide
sidebar_position: 20
---

# Development Guide

This guide covers how to build, test, and contribute to Super-Goose.

## Prerequisites

- **Rust** 1.75+ (with `cargo`)
- **Node.js** 18+ (with `npm`)
- **Git**
- **Platform SDK** (Windows SDK on Windows, Xcode CLT on macOS)

## Repository Structure

```
goose/
├── crates/
│   ├── goose/              # Core agent library (Rust)
│   │   └── src/
│   │       ├── agents/     # Agent runtime, cores, learning
│   │       ├── ota/        # OTA self-build pipeline
│   │       ├── autonomous/ # Autonomous daemon
│   │       ├── timewarp/   # TimeWarp event store
│   │       └── compaction/ # Context compaction
│   ├── goose-server/       # HTTP API server (Rust)
│   │   └── src/routes/     # REST endpoints
│   ├── goose-cli/          # CLI binary
│   └── goose-mcp/          # MCP protocol implementation
├── ui/desktop/             # Electron + React frontend
│   └── src/components/
│       ├── super/          # 8 Super-Goose panels
│       ├── features/       # Feature panels (budget, critic, guardrails)
│       ├── timewarp/       # TimeWarp components
│       ├── pipeline/       # Pipeline visualization
│       ├── cli/            # Embedded terminal
│       └── settings/       # Settings panels
├── documentation/          # Docusaurus site (this site)
└── .github/workflows/      # CI/CD pipelines
```

## Building

### Backend (Rust)

```bash
# Check compilation (fast, no linking)
cargo check

# Build in debug mode
cargo build

# Build release binary
cargo build --release

# The binaries are at:
#   target/release/goose    (CLI)
#   target/release/goosed   (server)
```

**Windows note**: If linking fails, set the `LIB` environment variable to point to your Windows SDK and MSVC lib directories.

### Frontend (Electron + React)

```bash
cd ui/desktop

# Install dependencies
npm install

# Start development server
npm start

# Build production app
npm run make
```

## Testing

### Rust Tests

```bash
# Run all library tests (recommended — avoids LLVM OOM during linking)
cargo test --lib

# Run tests for a specific crate
cargo test -p goose --lib
cargo test -p goose-server --lib

# Run a specific test module
cargo test -p goose --lib agents::core

# Check for warnings
cargo check 2>&1 | head -50
```

### Frontend Tests (Vitest)

```bash
cd ui/desktop

# Run all unit tests
npx vitest run

# Run tests in watch mode
npx vitest

# Run a specific test file
npx vitest run src/components/super/__tests__/SuperGoosePanel.test.tsx
```

### TypeScript Type Checking

```bash
cd ui/desktop
npx tsc --noEmit
```

### E2E Tests (Playwright)

```bash
cd ui/desktop

# Kill any zombie goosed processes first (Windows)
taskkill /F /IM goosed.exe 2>nul

# Run all E2E tests
npx playwright test

# Run with UI mode
npx playwright test --ui
```

## Current Test Counts

| Suite | Count | Status |
|:--|:--:|:--:|
| Vitest (unit) | 2,457 | ALL PASS |
| Playwright (E2E) | 291 | ALL PASS |
| Rust (cargo test) | 700+ | ALL PASS |
| tsc --noEmit | 0 errors | CLEAN |
| cargo check | 0 warnings | CLEAN |

## Slash Commands (Development)

Super-Goose exposes these commands during a session:

| Command | Purpose |
|:--|:--|
| `/cores` | List all agentic cores |
| `/core <name>` | Switch to a specific core |
| `/experience [stats]` | View learning data |
| `/skills` | List verified skills |
| `/insights` | Extract pattern insights |
| `/self-improve [--dry-run\|status]` | OTA self-build pipeline |
| `/autonomous [start\|stop\|status]` | Autonomous daemon control |

## Key Development Patterns

- **React JSX Transform**: Modern transform is enabled. Do not add `import React from 'react'`.
- **Mutex<Option<Arc<T>>>**: Used for lazy-initialized stores in the Agent struct.
- **`Conversation.messages()`**: This is a method, not a field. Always use `.messages()`.
- **Feature flags**: `default = ["memory"]` enables memory, bookmarks, HITL, extended thinking.
- **Windows cargo**: Use `.bat` wrapper scripts when PATH/shell escaping causes issues.

## Contributing

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Ensure `cargo check`, `cargo test --lib`, `npx vitest run`, and `npx tsc --noEmit` all pass
5. Open a pull request against `main`
