# Local Build Guide for Goose v1.24.0

This guide helps you build Goose locally on Windows to avoid GitHub Actions costs.

## Quick Start

### Option 1: Use PowerShell Script (Recommended)

```powershell
# Build everything (CLI + Desktop)
.\build-local.ps1 -All

# Build only portable CLI (fastest)
.\build-local.ps1 -PortableCLI

# Build only desktop app
.\build-local.ps1 -Desktop
```

### Option 2: Manual Build

#### Portable CLI (~10 minutes)
```powershell
# Build binaries
cargo build --release --bin goose --bin goosed

# Package
mkdir build-output\goose-portable-windows-x64
copy target\release\goose.exe build-output\goose-portable-windows-x64\
copy target\release\goosed.exe build-output\goose-portable-windows-x64\
copy README.md build-output\goose-portable-windows-x64\
copy LICENSE build-output\goose-portable-windows-x64\
Compress-Archive -Path build-output\goose-portable-windows-x64 -DestinationPath build-output\goose-portable-windows-x64-v1.24.0.zip
```

#### Desktop App (~30 minutes)
```powershell
# Build server
cargo build --release --bin goosed

# Copy to desktop
mkdir ui\desktop\src\bin
copy target\release\goosed.exe ui\desktop\src\bin\

# Build desktop
cd ui\desktop
npm ci --legacy-peer-deps
npm run package
npm run make
cd ..\..

# Outputs will be in: ui\desktop\out\make\
```

## Upload to Release

```powershell
# Upload all build outputs to v1.24.0 release
gh release upload v1.24.0 build-output\*.exe build-output\*.zip
```

## Build Requirements

- **Rust**: 1.75+ (already installed)
- **Node.js**: 24+ recommended (you have 23.11, should work)
- **Cargo**: Latest (already installed)
- **Disk Space**: ~10GB for full build

## Build Times (approximate)

- Portable CLI: 10-15 minutes
- Desktop App: 30-40 minutes
- Total: ~45 minutes

## Cost Savings

- GitHub Actions: $100+ (failed workflows)
- Local Build: $0 (uses your hardware)

## Troubleshooting

### Cargo Build Fails
```powershell
# Clean and retry
cargo clean
cargo build --release --bin goose --bin goosed
```

### npm install fails (Node 23 vs 24)
```powershell
# Use legacy peer deps
npm ci --legacy-peer-deps
```

### Desktop build fails
```powershell
# Check if goosed.exe exists
ls target\release\goosed.exe

# Rebuild server
cargo build --release --bin goosed
```

## What's Built

### Portable CLI Package
- `goose.exe` - CLI tool
- `goosed.exe` - Server binary
- README.md, LICENSE
- Total size: ~50MB zipped

### Desktop App
- Windows installer (.exe) - ~100MB
- Portable zip - ~150MB
- Includes goosed.exe server
- Electron-based UI

## Next Steps

After building:
1. Test binaries: `.\target\release\goose.exe --version`
2. Upload to release (see above)
3. Update release notes on GitHub
