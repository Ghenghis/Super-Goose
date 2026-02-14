# Install Python dependencies for Super-Goose bridge extensions
# Usage: .\scripts\install-bridges.ps1 [--all|--bridge-name]
#
# Examples:
#   .\scripts\install-bridges.ps1                  # install all bridges
#   .\scripts\install-bridges.ps1 -Bridge aider    # install only aider deps
#   .\scripts\install-bridges.ps1 -Bridge langchain -DryRun  # preview langchain install
#   .\scripts\install-bridges.ps1 -Bridge all -Verbose       # verbose output

param(
    [string]$Bridge = "all",
    [switch]$DryRun,
    [switch]$Verbose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# REQUIREMENTS dict mirroring __init__.py
# ---------------------------------------------------------------------------
$REQUIREMENTS = [ordered]@{
    # --- Original 16 ---
    "aider"              = @("aider-chat")
    "autogen"            = @("pyautogen")
    "browser_use"        = @("browser-use", "langchain-openai")
    "camel"              = @("camel-ai")
    "composio"           = @("composio-core")
    "crewai"             = @("crewai")
    "dspy"               = @("dspy-ai")
    "evoagentx"          = @("evoagentx")
    "goat"               = @("goat-sdk")
    "instructor"         = @("instructor", "openai")
    "langchain"          = @("langchain", "langchain-openai")
    "langgraph"          = @("langgraph", "langchain-openai")
    "llamaindex"         = @("llama-index")
    "mem0"               = @("mem0ai")
    "swarm"              = @("git+https://github.com/openai/swarm.git")
    "taskweaver"         = @("taskweaver")
    # --- New 19 ---
    "resource_coordinator" = @("mcp")
    "inspect_bridge"       = @("inspect-ai")
    "langfuse_bridge"      = @("langfuse")
    "openhands_bridge"     = @("openhands-ai")
    "semgrep_bridge"       = @("semgrep")
    "scip_bridge"          = @("scip-python")
    "swe_agent_bridge"     = @("sweagent")
    "playwright_bridge"    = @("playwright")
    "voice_bridge"         = @("pyttsx3", "SpeechRecognition")
    "emotion_bridge"       = @("transformers", "torch")
    "microsandbox_bridge"  = @("microsandbox")
    "arrakis_bridge"       = @("arrakis-compute")
    "astgrep_bridge"       = @("ast-grep-py")
    "conscious_bridge"     = @("mcp")
    "crosshair_bridge"     = @("crosshair-tool")
    "pydantic_ai_bridge"   = @("pydantic-ai")
    "praisonai_bridge"     = @("praisonai")
    "pr_agent_bridge"      = @("pr-agent")
    "overnight_gym_bridge" = @("pytest")
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Status {
    param([string]$Msg, [string]$Color = "Cyan")
    Write-Host "[bridges] " -ForegroundColor DarkGray -NoNewline
    Write-Host $Msg -ForegroundColor $Color
}

function Write-Ok {
    param([string]$Msg)
    Write-Host "  [OK]  " -ForegroundColor Green -NoNewline
    Write-Host $Msg
}

function Write-Fail {
    param([string]$Msg)
    Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
    Write-Host $Msg
}

function Write-Skip {
    param([string]$Msg)
    Write-Host "  [SKIP] " -ForegroundColor Yellow -NoNewline
    Write-Host $Msg
}

function Write-Detail {
    param([string]$Msg)
    if ($Verbose) {
        Write-Host "         $Msg" -ForegroundColor DarkGray
    }
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
function Test-PythonVersion {
    $pythonCmd = $null
    foreach ($cmd in @("python", "python3")) {
        try {
            $ver = & $cmd --version 2>&1
            if ($ver -match "Python (\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -ge 3 -and $minor -ge 10) {
                    $pythonCmd = $cmd
                    Write-Detail "Found $cmd -> $ver"
                    break
                } else {
                    Write-Detail "$cmd is $ver (need 3.10+), skipping"
                }
            }
        } catch {
            Write-Detail "$cmd not found"
        }
    }
    return $pythonCmd
}

function Test-PipAvailable {
    param([string]$Python)
    try {
        $out = & $Python -m pip --version 2>&1
        if ($out -match "pip (\S+)") {
            Write-Detail "pip $($Matches[1]) available"
            return $true
        }
    } catch {}
    return $false
}

# ---------------------------------------------------------------------------
# Install a single package
# ---------------------------------------------------------------------------
function Install-Package {
    param(
        [string]$Python,
        [string]$Package,
        [string]$BridgeName
    )

    Write-Detail "Installing $Package for $BridgeName..."

    if ($DryRun) {
        Write-Host "  [DRY]  " -ForegroundColor Magenta -NoNewline
        Write-Host "$Python -m pip install $Package"
        return $true
    }

    try {
        $pipArgs = @("-m", "pip", "install", "--quiet", $Package)
        if ($Verbose) {
            $pipArgs = @("-m", "pip", "install", $Package)
        }
        $proc = Start-Process -FilePath $Python -ArgumentList $pipArgs `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardError ([System.IO.Path]::GetTempFileName())
        if ($proc.ExitCode -eq 0) {
            return $true
        } else {
            Write-Detail "pip install exited with code $($proc.ExitCode)"
            return $false
        }
    } catch {
        $errMsg = $_.Exception.Message
        if ($errMsg -match "Access.*denied|Permission") {
            Write-Fail "Permission denied installing $Package -- try running as Administrator or use --user"
        } elseif ($errMsg -match "network|connection|timeout|SSL|resolve") {
            Write-Fail "Network error installing $Package -- check connectivity"
        } else {
            Write-Fail "Error installing ${Package}: $errMsg"
        }
        return $false
    }
}

# ---------------------------------------------------------------------------
# Verify a package is importable
# ---------------------------------------------------------------------------
function Test-PackageImport {
    param(
        [string]$Python,
        [string]$Package
    )

    # Derive a probable import name from the pip package name
    $importName = $Package
    # Strip git+ URLs
    if ($importName -match "git\+") { return $true }
    # Common transforms
    $importName = $importName -replace "-", "_"
    $importName = $importName -replace "\..*", ""
    # Known overrides
    $importMap = @{
        "aider_chat"     = "aider"
        "pyautogen"      = "autogen"
        "browser_use"    = "browser_use"
        "camel_ai"       = "camel"
        "composio_core"  = "composio"
        "dspy_ai"        = "dspy"
        "goat_sdk"       = "goat_sdk"
        "langchain_openai" = "langchain_openai"
        "llama_index"    = "llama_index"
        "mem0ai"         = "mem0"
        "inspect_ai"     = "inspect_ai"
        "openhands_ai"   = "openhands"
        "scip_python"    = "scip"
        "SpeechRecognition" = "speech_recognition"
        "ast_grep_py"    = "ast_grep"
        "crosshair_tool" = "crosshair"
        "pydantic_ai"    = "pydantic_ai"
        "pr_agent"       = "pr_agent"
        "arrakis_compute" = "arrakis"
    }
    if ($importMap.ContainsKey($importName)) {
        $importName = $importMap[$importName]
    }

    try {
        $exitCode = & $Python -c "import $importName" 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------------------
# Install one bridge's requirements
# ---------------------------------------------------------------------------
function Install-Bridge {
    param(
        [string]$Python,
        [string]$Name
    )

    $packages = $REQUIREMENTS[$Name]
    if (-not $packages) {
        Write-Fail "Unknown bridge: $Name"
        Write-Status "Available bridges: $($REQUIREMENTS.Keys -join ', ')" "Yellow"
        return $false
    }

    $allOk = $true
    foreach ($pkg in $packages) {
        $ok = Install-Package -Python $Python -Package $pkg -BridgeName $Name
        if ($ok -and -not $DryRun) {
            $verified = Test-PackageImport -Python $Python -Package $pkg
            if ($verified) {
                Write-Ok "$pkg installed and importable"
            } else {
                Write-Ok "$pkg installed (import verification skipped)"
            }
        } elseif (-not $ok) {
            Write-Fail "$pkg installation failed"
            $allOk = $false
        }
    }
    return $allOk
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Write-Status "Super-Goose Bridge Dependency Installer" "White"
Write-Status "========================================" "DarkGray"

if ($DryRun) {
    Write-Status "DRY RUN -- no packages will be installed" "Magenta"
}

# Check Python
$python = Test-PythonVersion
if (-not $python) {
    Write-Fail "Python 3.10+ is required but not found."
    Write-Status "Install from https://www.python.org/downloads/" "Yellow"
    exit 1
}
Write-Ok "Python found: $python"

# Check pip
if (-not (Test-PipAvailable -Python $python)) {
    Write-Fail "pip is not available. Run: $python -m ensurepip --upgrade"
    exit 1
}
Write-Ok "pip is available"

# Install base MCP requirement first
Write-Status "Installing base MCP SDK..." "Cyan"
$mcpOk = Install-Package -Python $python -Package "mcp" -BridgeName "base"
if (-not $mcpOk -and -not $DryRun) {
    Write-Fail "Failed to install base MCP SDK. Cannot continue."
    exit 1
}
if (-not $DryRun) {
    Write-Ok "MCP SDK ready"
}

# Determine bridges to install
$bridgesToInstall = @()
if ($Bridge -eq "all") {
    $bridgesToInstall = $REQUIREMENTS.Keys
    Write-Status "Installing all $($bridgesToInstall.Count) bridges..." "Cyan"
} else {
    if (-not $REQUIREMENTS.ContainsKey($Bridge)) {
        Write-Fail "Unknown bridge: $Bridge"
        Write-Status "Available bridges:" "Yellow"
        foreach ($name in $REQUIREMENTS.Keys) {
            Write-Host "  - $name ($($REQUIREMENTS[$name] -join ', '))"
        }
        exit 1
    }
    $bridgesToInstall = @($Bridge)
    Write-Status "Installing bridge: $Bridge" "Cyan"
}

# Install each bridge
$succeeded = 0
$failed = 0
$failedNames = @()

foreach ($name in $bridgesToInstall) {
    Write-Status "--- $name ---" "DarkCyan"
    $ok = Install-Bridge -Python $python -Name $name
    if ($ok) {
        $succeeded++
    } else {
        $failed++
        $failedNames += $name
    }
}

# Summary
Write-Host ""
Write-Status "========================================" "DarkGray"
Write-Status "Installation Summary" "White"
Write-Ok "$succeeded bridge(s) succeeded"

if ($failed -gt 0) {
    Write-Fail "$failed bridge(s) failed: $($failedNames -join ', ')"
    exit 1
} else {
    Write-Status "All bridges installed successfully!" "Green"
}

# Playwright special: run install if playwright was installed
if ($Bridge -eq "all" -or $Bridge -eq "playwright_bridge") {
    if (-not $DryRun) {
        Write-Status "Running playwright browser install..." "Cyan"
        try {
            & $python -m playwright install chromium 2>&1 | Out-Null
            Write-Ok "Playwright Chromium browser installed"
        } catch {
            Write-Skip "Playwright browser install failed (non-fatal): $($_.Exception.Message)"
        }
    }
}
