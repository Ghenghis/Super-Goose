#!/usr/bin/env bash
# Install Python dependencies for Super-Goose bridge extensions
# Usage: ./scripts/install-bridges.sh [--all|--bridge <name>] [--dry-run] [--verbose]
#
# Examples:
#   ./scripts/install-bridges.sh                         # install all bridges
#   ./scripts/install-bridges.sh --bridge aider           # install only aider deps
#   ./scripts/install-bridges.sh --bridge langchain --dry-run  # preview install
#   ./scripts/install-bridges.sh --all --verbose          # verbose output

set -euo pipefail

# ---------------------------------------------------------------------------
# REQUIREMENTS dict mirroring __init__.py
# Bridge name -> space-separated pip packages
# ---------------------------------------------------------------------------
declare -A REQUIREMENTS=(
    # --- Original 16 ---
    ["aider"]="aider-chat"
    ["autogen"]="pyautogen"
    ["browser_use"]="browser-use langchain-openai"
    ["camel"]="camel-ai"
    ["composio"]="composio-core"
    ["crewai"]="crewai"
    ["dspy"]="dspy-ai"
    ["evoagentx"]="evoagentx"
    ["goat"]="goat-sdk"
    ["instructor"]="instructor openai"
    ["langchain"]="langchain langchain-openai"
    ["langgraph"]="langgraph langchain-openai"
    ["llamaindex"]="llama-index"
    ["mem0"]="mem0ai"
    ["swarm"]="git+https://github.com/openai/swarm.git"
    ["taskweaver"]="taskweaver"
    # --- New 19 ---
    ["resource_coordinator"]="mcp"
    ["inspect_bridge"]="inspect-ai"
    ["langfuse_bridge"]="langfuse"
    ["openhands_bridge"]="openhands-ai"
    ["semgrep_bridge"]="semgrep"
    ["scip_bridge"]="scip-python"
    ["swe_agent_bridge"]="sweagent"
    ["playwright_bridge"]="playwright"
    ["voice_bridge"]="pyttsx3 SpeechRecognition"
    ["emotion_bridge"]="transformers torch"
    ["microsandbox_bridge"]="microsandbox"
    ["arrakis_bridge"]="arrakis-compute"
    ["astgrep_bridge"]="ast-grep-py"
    ["conscious_bridge"]="mcp"
    ["crosshair_bridge"]="crosshair-tool"
    ["pydantic_ai_bridge"]="pydantic-ai"
    ["praisonai_bridge"]="praisonai"
    ["pr_agent_bridge"]="pr-agent"
    ["overnight_gym_bridge"]="pytest"
)

# Ordered list of bridge names (bash associative arrays are unordered)
BRIDGE_ORDER=(
    aider autogen browser_use camel composio crewai dspy evoagentx goat
    instructor langchain langgraph llamaindex mem0 swarm taskweaver
    resource_coordinator inspect_bridge langfuse_bridge openhands_bridge
    semgrep_bridge scip_bridge swe_agent_bridge playwright_bridge
    voice_bridge emotion_bridge microsandbox_bridge arrakis_bridge
    astgrep_bridge conscious_bridge crosshair_bridge pydantic_ai_bridge
    praisonai_bridge pr_agent_bridge overnight_gym_bridge
)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
BRIDGE="all"
DRY_RUN=false
VERBOSE=false

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
WHITE='\033[1;37m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

status()  { echo -e "${GRAY}[bridges]${NC} ${CYAN}$1${NC}"; }
ok()      { echo -e "  ${GREEN}[OK]${NC}  $1"; }
fail()    { echo -e "  ${RED}[FAIL]${NC} $1"; }
skip()    { echo -e "  ${YELLOW}[SKIP]${NC} $1"; }
detail()  { $VERBOSE && echo -e "         ${GRAY}$1${NC}" || true; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --all)
            BRIDGE="all"; shift ;;
        --bridge)
            BRIDGE="${2:-}";
            if [[ -z "$BRIDGE" ]]; then
                fail "Missing bridge name after --bridge"
                exit 1
            fi
            shift 2 ;;
        --dry-run)
            DRY_RUN=true; shift ;;
        --verbose)
            VERBOSE=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--all|--bridge <name>] [--dry-run] [--verbose]"
            echo ""
            echo "Options:"
            echo "  --all            Install all bridge dependencies (default)"
            echo "  --bridge <name>  Install dependencies for a specific bridge"
            echo "  --dry-run        Show what would be installed without installing"
            echo "  --verbose        Show detailed output"
            echo ""
            echo "Available bridges:"
            for name in "${BRIDGE_ORDER[@]}"; do
                echo "  $name -> ${REQUIREMENTS[$name]}"
            done
            exit 0
            ;;
        *)
            # Treat positional arg as bridge name for convenience
            BRIDGE="$1"; shift ;;
    esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
find_python() {
    local cmd
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local version
            version=$("$cmd" --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
            local major minor
            major=$(echo "$version" | cut -d. -f1)
            minor=$(echo "$version" | cut -d. -f2)
            if [[ "$major" -ge 3 && "$minor" -ge 10 ]]; then
                detail "Found $cmd -> Python $version"
                echo "$cmd"
                return 0
            else
                detail "$cmd is Python $version (need 3.10+), skipping"
            fi
        fi
    done
    return 1
}

check_pip() {
    local python="$1"
    if "$python" -m pip --version &>/dev/null; then
        detail "pip available: $("$python" -m pip --version 2>&1)"
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Install a single package
# ---------------------------------------------------------------------------
install_package() {
    local python="$1"
    local package="$2"
    local bridge_name="$3"

    detail "Installing $package for $bridge_name..."

    if $DRY_RUN; then
        echo -e "  ${MAGENTA}[DRY]${NC}  $python -m pip install $package"
        return 0
    fi

    local pip_args="-m pip install"
    if ! $VERBOSE; then
        pip_args="$pip_args --quiet"
    fi

    if "$python" $pip_args "$package" 2>/tmp/bridge_pip_err.$$.log; then
        return 0
    else
        local exit_code=$?
        local err_msg
        err_msg=$(cat /tmp/bridge_pip_err.$$.log 2>/dev/null || echo "unknown error")
        rm -f /tmp/bridge_pip_err.$$.log

        if echo "$err_msg" | grep -qi "permission\|access denied"; then
            fail "Permission denied installing $package -- try: pip install --user $package"
        elif echo "$err_msg" | grep -qi "network\|connection\|timeout\|SSL\|resolve\|Could not fetch"; then
            fail "Network error installing $package -- check connectivity"
        elif echo "$err_msg" | grep -qi "No matching distribution\|Could not find"; then
            fail "Package $package not found -- check the name and Python version"
        else
            fail "Error installing $package (exit $exit_code)"
            $VERBOSE && echo "         $err_msg"
        fi
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Verify a package is importable
# ---------------------------------------------------------------------------
verify_package() {
    local python="$1"
    local package="$2"

    # Skip git URLs
    if [[ "$package" == git+* ]]; then
        return 0
    fi

    # Derive import name
    local import_name="${package//-/_}"
    import_name="${import_name%%.*}"

    # Known import name overrides
    declare -A IMPORT_MAP=(
        ["aider_chat"]="aider"
        ["pyautogen"]="autogen"
        ["browser_use"]="browser_use"
        ["camel_ai"]="camel"
        ["composio_core"]="composio"
        ["dspy_ai"]="dspy"
        ["goat_sdk"]="goat_sdk"
        ["langchain_openai"]="langchain_openai"
        ["llama_index"]="llama_index"
        ["mem0ai"]="mem0"
        ["inspect_ai"]="inspect_ai"
        ["openhands_ai"]="openhands"
        ["scip_python"]="scip"
        ["SpeechRecognition"]="speech_recognition"
        ["ast_grep_py"]="ast_grep"
        ["crosshair_tool"]="crosshair"
        ["pydantic_ai"]="pydantic_ai"
        ["pr_agent"]="pr_agent"
        ["arrakis_compute"]="arrakis"
    )

    if [[ -n "${IMPORT_MAP[$import_name]+x}" ]]; then
        import_name="${IMPORT_MAP[$import_name]}"
    fi

    if "$python" -c "import $import_name" 2>/dev/null; then
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Install one bridge's requirements
# ---------------------------------------------------------------------------
install_bridge() {
    local python="$1"
    local name="$2"

    if [[ -z "${REQUIREMENTS[$name]+x}" ]]; then
        fail "Unknown bridge: $name"
        status "Available bridges: ${BRIDGE_ORDER[*]}"
        return 1
    fi

    local packages="${REQUIREMENTS[$name]}"
    local all_ok=true

    for pkg in $packages; do
        if install_package "$python" "$pkg" "$name"; then
            if ! $DRY_RUN; then
                if verify_package "$python" "$pkg"; then
                    ok "$pkg installed and importable"
                else
                    ok "$pkg installed (import verification skipped)"
                fi
            fi
        else
            fail "$pkg installation failed"
            all_ok=false
        fi
    done

    $all_ok
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo -e "${WHITE}[bridges] Super-Goose Bridge Dependency Installer${NC}"
echo -e "${GRAY}[bridges] ========================================${NC}"

if $DRY_RUN; then
    echo -e "${GRAY}[bridges]${NC} ${MAGENTA}DRY RUN -- no packages will be installed${NC}"
fi

# Check Python
PYTHON=$(find_python) || {
    fail "Python 3.10+ is required but not found."
    status "Install from https://www.python.org/downloads/"
    exit 1
}
ok "Python found: $PYTHON ($($PYTHON --version 2>&1))"

# Check pip
if ! check_pip "$PYTHON"; then
    fail "pip is not available. Run: $PYTHON -m ensurepip --upgrade"
    exit 1
fi
ok "pip is available"

# Install base MCP SDK first
status "Installing base MCP SDK..."
if install_package "$PYTHON" "mcp" "base"; then
    $DRY_RUN || ok "MCP SDK ready"
else
    $DRY_RUN || { fail "Failed to install base MCP SDK. Cannot continue."; exit 1; }
fi

# Determine bridges to install
bridges_to_install=()
if [[ "$BRIDGE" == "all" ]]; then
    bridges_to_install=("${BRIDGE_ORDER[@]}")
    status "Installing all ${#bridges_to_install[@]} bridges..."
else
    if [[ -z "${REQUIREMENTS[$BRIDGE]+x}" ]]; then
        fail "Unknown bridge: $BRIDGE"
        status "Available bridges:"
        for name in "${BRIDGE_ORDER[@]}"; do
            echo "  - $name (${REQUIREMENTS[$name]})"
        done
        exit 1
    fi
    bridges_to_install=("$BRIDGE")
    status "Installing bridge: $BRIDGE"
fi

# Install each bridge
succeeded=0
failed=0
failed_names=()

for name in "${bridges_to_install[@]}"; do
    echo -e "${GRAY}[bridges]${NC} ${CYAN}--- $name ---${NC}"
    if install_bridge "$PYTHON" "$name"; then
        ((succeeded++))
    else
        ((failed++))
        failed_names+=("$name")
    fi
done

# Summary
echo ""
echo -e "${GRAY}[bridges] ========================================${NC}"
echo -e "${WHITE}[bridges] Installation Summary${NC}"
ok "$succeeded bridge(s) succeeded"

if [[ $failed -gt 0 ]]; then
    fail "$failed bridge(s) failed: ${failed_names[*]}"
    exit 1
else
    echo -e "${GRAY}[bridges]${NC} ${GREEN}All bridges installed successfully!${NC}"
fi

# Playwright special: run browser install if playwright was installed
if [[ "$BRIDGE" == "all" || "$BRIDGE" == "playwright_bridge" ]]; then
    if ! $DRY_RUN; then
        status "Running playwright browser install..."
        if "$PYTHON" -m playwright install chromium 2>/dev/null; then
            ok "Playwright Chromium browser installed"
        else
            skip "Playwright browser install failed (non-fatal)"
        fi
    fi
fi
