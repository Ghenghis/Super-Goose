# Conscious + Super-Goose Setup Guide

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Python | 3.11+ | `python --version` |
| Node.js | 20+ | `node --version` |
| npm | 9+ | `npm --version` |
| Rust | 1.75+ | `rustc --version` |
| CUDA (optional) | 11.8+ | `nvidia-smi` |

## 1. Clone & Install — Conscious Python Backend

```bash
cd D:\conscious
pip install -e .

# Verify installation
python -c "from conscious.voice.agent_api import MoshiAgentAPI; print('OK')"
```

### Optional Dependencies

```bash
# Wake word detection
pip install -e ".[wake]"

# Device management (SSH)
pip install -e ".[devices]"

# Development + testing
pip install -e ".[dev]"
pip install pytest pytest-asyncio aiohttp
```

## 2. Install — Super-Goose Electron UI

```bash
cd D:\goose\ui\desktop
npm install

# Verify TypeScript
npx tsc --noEmit

# Verify lint
npx eslint src/components/conscious/ src/components/settings/conscious/ --max-warnings 0
```

## 3. Build — Super-Goose Rust Backend

```bash
cd D:\goose
source bin/activate-hermit   # Linux/macOS
cargo build
just generate-openapi
```

## 4. Run

### Start Conscious API Server

```bash
cd D:\conscious
python -m conscious
# Server starts on http://127.0.0.1:8999
```

### Start Super-Goose Desktop

```bash
cd D:\goose
just run-ui
# Electron app launches, connects to Conscious via HTTP + WebSocket
```

## 5. Verify Everything Works

```bash
# Check Conscious health
curl http://localhost:8999/api/health

# Check agentic status
curl http://localhost:8999/api/agentic/status

# Check emotion status
curl http://localhost:8999/api/emotion/status
```

## 6. Run Tests

```bash
# Python unit tests
cd D:\conscious
python -m pytest tests/unit/ -v --timeout=30

# Python integration tests
python -m pytest tests/integration/ -v --timeout=60

# All Python tests
python -m pytest tests/ -v --timeout=60

# TypeScript typecheck
cd D:\goose\ui\desktop
npx tsc --noEmit

# UI unit tests
cd D:\goose\ui\desktop
npm run test:run

# Rust tests
cd D:\goose
cargo test
```

## Ports Reference

| Service | Port | Protocol |
|---------|------|----------|
| Conscious API | 8999 | HTTP |
| Moshi S2S | 8998 | WebSocket |
| UI Bridge | 8997 | WebSocket |
| goosed | 3000 | HTTP |

## Troubleshooting

### `@types/node` not installing (npm 11.x + Node 25.x on Windows)

npm may create an empty `@types/node` directory. Fix:

```powershell
cd D:\goose\ui\desktop
npm pack @types/node@22.15.0
Remove-Item -Recurse -Force node_modules\@types\node
New-Item -ItemType Directory -Path node_modules\@types\node -Force
tar -xzf types-node-22.15.0.tgz -C node_modules\@types\node --strip-components=1
Remove-Item types-node-22.15.0.tgz
```

### Conscious API not reachable from Electron

Ensure Conscious is running on port 8999 before launching Electron. The UI polls every 5 seconds and will auto-connect.

### CUDA not available

Conscious works without CUDA — emotion detection falls back to CPU (slower but functional). Moshi requires GPU for real-time S2S.

### Windows file locking on node_modules

Close all IDE instances, then:

```powershell
Remove-Item -Recurse -Force D:\goose\ui\desktop\node_modules
npm install
```
