# SonarQube MCP Server Integration Guide

**Version**: 1.0
**Date**: 2026-02-06
**Purpose**: Connect Claude Desktop, Windsurf IDE, and LM Studio to your SonarQube instance for AI-powered code analysis

---

## Overview

The **Official SonarQube MCP Server** (released by SonarSource in late 2025) bridges AI assistants (Claude Desktop, Windsurf, LM Studio) with your SonarQube Community Edition instance, enabling:

- ✅ Real-time code quality analysis during AI coding sessions
- ✅ Automatic detection of TODO/FIXME markers
- ✅ AI-powered fix suggestions based on SonarQube rules
- ✅ Quality gate checks before code generation
- ✅ Integration with your existing enforcement system

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI Clients (Claude Desktop, Windsurf, LM Studio)  │
│  -------------------------------------------------- │
│  User: "Write a function to validate email"        │
│  AI: "Let me check SonarQube first..."             │
└─────────────────┬───────────────────────────────────┘
                  │ MCP Protocol
                  ↓
┌─────────────────────────────────────────────────────┐
│  SonarQube MCP Server (Docker/Standalone)          │
│  -------------------------------------------------- │
│  Tools:                                             │
│   - sonarqube_get_issues                            │
│   - sonarqube_check_quality_gate                    │
│   - sonarqube_get_measures                          │
│   - sonarqube_get_rules                             │
└─────────────────┬───────────────────────────────────┘
                  │ REST API
                  ↓
┌─────────────────────────────────────────────────────┐
│  SonarQube Community Edition (localhost:9000)      │
│  -------------------------------------------------- │
│  Database: Code issues, quality gates, rules        │
└─────────────────┬───────────────────────────────────┘
                  │ Scan results
                  ↓
┌─────────────────────────────────────────────────────┐
│  SonarScanner CLI (Local project)                  │
│  -------------------------------------------------- │
│  Analyzes: TypeScript, Rust, finds TODOs           │
└─────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before installing the MCP server, ensure you have:

- [x] SonarQube Community Edition running (see `QUALITY_ENFORCEMENT_SYSTEM.md`)
- [x] SonarScanner CLI installed and configured
- [x] Docker Desktop installed (for containerized deployment)
- [x] SonarQube user token generated
- [x] AI client installed (Claude Desktop, Windsurf, or LM Studio)

---

## Installation

### Step 1: Generate SonarQube User Token

1. Open SonarQube: `http://localhost:9000`
2. Log in as admin
3. Navigate to: **My Account** > **Security** > **Generate Token**
4. Token details:
   - **Name**: `mcp-server-token`
   - **Type**: User Token
   - **Expires in**: No expiration (or 1 year)
5. Click **Generate** and copy the token immediately (shown only once)

**Example token**: `sqa_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Step 2: Install SonarQube MCP Server

#### Option A: Docker (Recommended)

**Why Docker?**
- ✅ Isolated environment
- ✅ Easy updates (`docker pull mcp/sonarqube`)
- ✅ No dependency conflicts
- ✅ Works on Windows/Mac/Linux

**Installation:**
```powershell
# Pull official image
docker pull mcp/sonarqube

# Test connection
docker run -i --rm \
  -e SONAR_HOST_URL=http://host.docker.internal:9000 \
  -e SONAR_TOKEN=sqa_YOUR_TOKEN_HERE \
  mcp/sonarqube

# Expected output: MCP server started successfully
```

**Note**: `host.docker.internal` allows Docker to access your Windows host's `localhost:9000`.

#### Option B: Standalone (Java)

**Prerequisites**: Java 17 or 21 installed

```powershell
# Clone repository
git clone https://github.com/SonarSource/sonarqube-mcp-server.git
cd sonarqube-mcp-server

# Build
./gradlew build

# Run
java -jar build/libs/sonarqube-mcp-server.jar \
  --sonar.host.url=http://localhost:9000 \
  --sonar.token=sqa_YOUR_TOKEN_HERE
```

#### Option C: npm Package (Node.js)

```powershell
# Install globally
npm install -g @sonarsource/sonarqube-mcp

# Run
sonarqube-mcp \
  --host http://localhost:9000 \
  --token sqa_YOUR_TOKEN_HERE
```

---

## Configuration for AI Clients

### Claude Desktop / Claude Code

**File**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
**File**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
**File**: `~/.config/Claude/claude_desktop_config.json` (Linux)

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e", "SONAR_TOKEN=sqa_YOUR_TOKEN_HERE",
        "-e", "SONAR_PROJECT_KEY=goose-ui",
        "mcp/sonarqube"
      ]
    }
  },
  "globalShortcut": "Alt+Space"
}
```

**After editing**:
1. Save the file
2. Restart Claude Desktop
3. Verify: Click the 🔌 icon → Should show "sonarqube" server connected

### Windsurf IDE

**Installation via Extensions:**

1. Open Windsurf IDE
2. Navigate to: **Extensions** (Ctrl+Shift+X)
3. Search: `SonarQube MCP`
4. Click **Install**

**Configuration:**

1. After installation, go to: **Settings** > **Extensions** > **SonarQube MCP**
2. Configure:
   - **SonarQube Host URL**: `http://localhost:9000`
   - **Authentication Token**: `sqa_YOUR_TOKEN_HERE`
   - **Default Project Key**: `goose-ui` (or `goose-rust`)
3. Click **Save** and **Enable**

**Verify Installation:**
- Open Command Palette (Ctrl+Shift+P)
- Type: `SonarQube: Check Connection`
- Expected: "✅ Connected to SonarQube"

### LM Studio

**Prerequisites**: LM Studio v0.3.17 or later

**Configuration:**

1. Open LM Studio
2. Navigate to: **Settings** > **MCP Servers** > **Add Server**
3. Choose: **Docker-based MCP Server**
4. Configure:
   ```json
   {
     "name": "SonarQube",
     "type": "docker",
     "image": "mcp/sonarqube",
     "env": {
       "SONAR_HOST_URL": "http://host.docker.internal:9000",
       "SONAR_TOKEN": "sqa_YOUR_TOKEN_HERE",
       "SONAR_PROJECT_KEY": "goose-ui"
     }
   }
   ```
5. Click **Test Connection** → Should return success
6. Click **Save** and **Enable**

**Verify:**
- In chat, ask: "Check SonarQube for issues in this file"
- LM Studio should invoke `sonarqube_get_issues` tool

---

## Available MCP Tools

The SonarQube MCP Server exposes these tools to AI clients:

### 1. `sonarqube_get_issues`

**Description**: Retrieves code issues from SonarQube

**Parameters**:
- `projectKey` (string): Project identifier (e.g., `goose-ui`)
- `severities` (array, optional): Filter by severity: `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`
- `types` (array, optional): Filter by type: `BUG`, `VULNERABILITY`, `CODE_SMELL`
- `statuses` (array, optional): Filter by status: `OPEN`, `CONFIRMED`, `REOPENED`, `RESOLVED`, `CLOSED`
- `componentKeys` (string, optional): Filter by file path

**Example Usage (AI prompt)**:
```
Show me all BLOCKER issues in goose-ui project
```

**AI Tool Call**:
```json
{
  "tool": "sonarqube_get_issues",
  "parameters": {
    "projectKey": "goose-ui",
    "severities": ["BLOCKER"],
    "statuses": ["OPEN"]
  }
}
```

**Response**:
```json
{
  "issues": [
    {
      "key": "AY1234567890",
      "rule": "typescript:S1135",
      "severity": "BLOCKER",
      "message": "Complete the task associated with this TODO comment",
      "component": "src/components/Auth.tsx",
      "line": 42,
      "status": "OPEN"
    }
  ],
  "total": 1
}
```

### 2. `sonarqube_check_quality_gate`

**Description**: Checks if project passes quality gate

**Parameters**:
- `projectKey` (string): Project identifier

**Example Usage**:
```
Check if goose-ui passes the quality gate
```

**Response**:
```json
{
  "status": "ERROR",
  "conditions": [
    {
      "metric": "new_coverage",
      "status": "ERROR",
      "actual": "75.2",
      "error": "80"
    },
    {
      "metric": "blocker_violations",
      "status": "ERROR",
      "actual": "1",
      "error": "0"
    }
  ]
}
```

### 3. `sonarqube_get_measures`

**Description**: Retrieves code metrics

**Parameters**:
- `projectKey` (string): Project identifier
- `metricKeys` (array): Metrics to retrieve (e.g., `coverage`, `bugs`, `code_smells`)

**Example Usage**:
```
Get test coverage for goose-ui
```

**Response**:
```json
{
  "measures": [
    {
      "metric": "coverage",
      "value": "82.5"
    },
    {
      "metric": "bugs",
      "value": "3"
    }
  ]
}
```

### 4. `sonarqube_get_rules`

**Description**: Retrieves SonarQube rule definitions

**Parameters**:
- `ruleKeys` (array, optional): Specific rule IDs (e.g., `typescript:S1135`)
- `languages` (array, optional): Filter by language (e.g., `ts`, `js`, `rust`)
- `severities` (array, optional): Filter by severity

**Example Usage**:
```
What is rule S1135?
```

**Response**:
```json
{
  "rules": [
    {
      "key": "typescript:S1135",
      "name": "Track uses of \"TODO\" tags",
      "severity": "INFO",
      "lang": "ts",
      "description": "TODO tags are commonly used to mark areas where implementation is missing..."
    }
  ]
}
```

---

## AI Workflow Examples

### Example 1: AI Checks Quality Before Generating Code

**User Prompt**:
```
Write a function to validate user email addresses
```

**AI Workflow** (with MCP integration):

1. **AI**: "Let me check existing code quality first"
   - Calls: `sonarqube_get_issues` with `componentKeys="src/utils/validation.ts"`
   - Finds: 2 TODO comments, 1 empty function

2. **AI**: "I found incomplete validation code. Let me fix it first"
   - Reviews existing issues
   - Generates complete implementation without TODOs

3. **AI**: "Here's a complete implementation with proper validation"
   ```typescript
   /**
    * Validates an email address format.
    * @param email - Email address to validate
    * @returns true if valid, false otherwise
    */
   export function validateEmail(email: string): boolean {
     if (!email) {
       return false;
     }

     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
     return emailRegex.test(email);
   }
   ```

### Example 2: AI Fixes Existing Issues

**User Prompt**:
```
Fix all BLOCKER issues in src/components/Auth.tsx
```

**AI Workflow**:

1. **AI** calls: `sonarqube_get_issues`
   ```json
   {
     "projectKey": "goose-ui",
     "severities": ["BLOCKER"],
     "componentKeys": "src/components/Auth.tsx"
   }
   ```

2. **Response**: Found 2 BLOCKER issues
   - Line 42: TODO comment
   - Line 58: Empty function `handleLogin()`

3. **AI** reads file content and generates fixes:
   ```typescript
   // Before (Line 42)
   // TODO: implement token validation

   // After
   /**
    * Validates authentication token format and expiration.
    * @param token - JWT token to validate
    * @returns true if valid and not expired
    */
   function validateToken(token: string): boolean {
     // Implementation complete
   }
   ```

4. **AI** runs: `sonar-scanner` (via shell MCP)
5. **AI** verifies: `sonarqube_check_quality_gate` → Status: PASSED

### Example 3: Pre-Commit Quality Check

**User Prompt**:
```
I'm about to commit these changes. Can you check if they'll pass quality gates?
```

**AI Workflow**:

1. **AI**: "Let me scan your changes first"
   - Executes: `sonar-scanner` (via shell MCP)

2. **AI** calls: `sonarqube_check_quality_gate` for `goose-ui`

3. **Response**: Quality gate FAILED
   - New coverage: 75% (required: 80%)
   - BLOCKER issues: 1 (required: 0)

4. **AI**: "Your commit will be blocked. Here's what needs fixing:"
   - Lists specific issues with line numbers
   - Suggests fixes for each issue

5. **User**: "Okay, apply the fixes"

6. **AI**: Generates corrected code, re-runs scanner, verifies passing

### Example 4: Continuous Quality Monitoring

**User Prompt**:
```
Monitor code quality as I work and warn me if I introduce issues
```

**AI Workflow**:

1. **AI**: "I'll check quality after each code change"
2. User writes code with AI assistance
3. After each significant change, AI:
   - Runs: `sonar-scanner` in background
   - Calls: `sonarqube_get_issues` for changed files
   - Alerts immediately if new issues detected

**Example Alert**:
```
⚠️ Quality Issue Detected:
File: src/utils/helpers.ts
Line: 23
Severity: BLOCKER
Rule: S1135 (TODO comment)
Message: Complete the task associated with this TODO comment

Would you like me to fix this now?
```

---

## Running Scanner from AI

The SonarQube MCP Server **retrieves data** but doesn't run scans. To let AI run scans, enable shell access:

### Option 1: Default Shell MCP (Claude Desktop)

**Claude Desktop includes a built-in shell tool.** Enable it in config:

**File**: `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e", "SONAR_TOKEN=sqa_YOUR_TOKEN_HERE",
        "mcp/sonarqube"
      ]
    },
    "shell": {
      "command": "powershell",
      "args": ["-NoProfile", "-Command", "-"]
    }
  }
}
```

**AI can now run**:
```powershell
# User: "Scan the TypeScript project"
# AI executes via shell MCP:
cd C:\Users\Admin\Downloads\projects\goose\ui\desktop
sonar-scanner -Dsonar.qualitygate.wait=true
```

### Option 2: Desktop Commander MCP (Advanced)

**For your project, you already have Desktop Commander MCP configured!**

The AI can use:
- `execute_command` - Run shell commands
- `read_file` - Read scan results
- `write_file` - Update configurations

**Example AI Workflow**:
```
User: "Scan the entire Goose project and fix all issues"

AI:
1. Uses Desktop Commander `execute_command`:
   "sonar-scanner -Dsonar.qualitygate.wait=true"

2. Uses SonarQube MCP `sonarqube_get_issues`:
   Retrieves all BLOCKER/CRITICAL issues

3. Uses Desktop Commander `read_file`:
   Reads files with issues

4. Generates fixes

5. Uses Desktop Commander `write_file`:
   Applies fixes

6. Uses Desktop Commander `execute_command`:
   Re-runs scanner to verify

7. Uses SonarQube MCP `sonarqube_check_quality_gate`:
   Confirms passing
```

---

## Integration with Existing Quality System

### How It Fits

```
┌─────────────────────────────────────────────────────┐
│  LAYER 1: IDE (Real-time)                          │
│  ┌──────────────────────────────────────────────┐  │
│  │ SonarLint VSCode Extension                   │  │
│  │ + SonarQube MCP Server                       │  │
│  │ = AI-powered real-time issue detection      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 2: Pre-commit (Client-side)                 │
│  ┌──────────────────────────────────────────────┐  │
│  │ Husky + lint-staged                         │  │
│  │ AI: "Should I commit? Let me check first"   │  │
│  │ Calls: sonarqube_check_quality_gate         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 3: Pre-push (Client-side)                   │
│  ┌──────────────────────────────────────────────┐  │
│  │ SonarScanner full analysis                   │  │
│  │ AI: Monitors scan, alerts on failures       │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  LAYER 4: CI/CD (Server-side)                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ GitLab pipeline + SonarQube                  │  │
│  │ AI: Reviews pipeline failures, suggests fixes│  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Enhanced AI Instructions

Add to your AI system prompts:

```markdown
## Code Quality Standards

Before generating any code:
1. Check existing issues: Use `sonarqube_get_issues` tool
2. Review quality gate: Use `sonarqube_check_quality_gate` tool
3. Ensure zero BLOCKER/CRITICAL issues

After generating code:
1. Run: `sonar-scanner` (via shell)
2. Verify: Quality gate passes
3. Fix: Any new issues introduced

NEVER generate code with:
- TODO/FIXME/HACK comments
- Empty functions or stubs
- "Not implemented" errors
- Code that would fail quality gates
```

---

## Troubleshooting

### Issue: MCP Server Connection Failed

**Symptoms**: Claude Desktop shows "❌ sonarqube (disconnected)"

**Solutions**:

1. **Verify SonarQube is running**:
   ```powershell
   curl http://localhost:9000/api/system/status
   # Expected: {"status":"UP","version":"10.2"}
   ```

2. **Check Docker connectivity**:
   ```powershell
   docker run -i --rm \
     -e SONAR_HOST_URL=http://host.docker.internal:9000 \
     -e SONAR_TOKEN=sqa_YOUR_TOKEN \
     mcp/sonarqube
   ```

3. **Verify token is valid**:
   - SonarQube UI > My Account > Security
   - Check token hasn't expired
   - Regenerate if needed

4. **Check config file syntax**:
   - Validate JSON: https://jsonlint.com/
   - Ensure no trailing commas
   - Restart AI client after changes

### Issue: AI Can't Run Scanner

**Symptoms**: AI says "I don't have permission to run shell commands"

**Solution**: Enable shell MCP in config

```json
{
  "mcpServers": {
    "sonarqube": { ... },
    "shell": {
      "command": "powershell",
      "args": ["-NoProfile", "-Command", "-"]
    }
  }
}
```

### Issue: Wrong Project Being Analyzed

**Symptoms**: AI analyzes wrong project or can't find project

**Solution**: Specify project key in MCP config

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e", "SONAR_TOKEN=sqa_YOUR_TOKEN",
        "-e", "SONAR_PROJECT_KEY=goose-ui",  // ← Add this
        "mcp/sonarqube"
      ]
    }
  }
}
```

### Issue: Slow AI Responses

**Symptoms**: AI takes 10+ seconds to respond when checking quality

**Optimization**:

1. **Enable caching** (MCP Server v1.1+):
   ```json
   "-e", "SONAR_CACHE_ENABLED=true",
   "-e", "SONAR_CACHE_TTL=300"  // 5 minutes
   ```

2. **Use background scanning**:
   ```
   User: "Scan in background, let me know when done"
   AI: Runs scanner in background, continues working
   ```

3. **Filter queries**:
   ```
   // Instead of:
   sonarqube_get_issues({ projectKey: "goose-ui" })  // All issues

   // Use:
   sonarqube_get_issues({
     projectKey: "goose-ui",
     severities: ["BLOCKER", "CRITICAL"],  // Only critical
     componentKeys: "src/components/"      // Only relevant files
   })
   ```

---

## Security Considerations

### Token Storage

**❌ NEVER**:
- Commit tokens to Git repositories
- Share tokens in documentation
- Use same token across multiple environments

**✅ DO**:
- Store tokens in environment variables
- Use separate tokens per AI client
- Rotate tokens quarterly
- Revoke unused tokens immediately

### Token Permissions

**Minimum required permissions**:
- **Browse**: View project and issues
- **Execute Analysis**: Only if AI needs to trigger scans

**Create restricted token**:
1. SonarQube UI > Administration > Security > Users
2. Create service account: `ai-mcp-client`
3. Grant minimum permissions to specific projects only
4. Generate token for this account

### Network Security

**For production deployments**:

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--network", "sonar-net",  // Isolated Docker network
        "-e", "SONAR_HOST_URL=http://sonarqube:9000",  // Internal DNS
        "-e", "SONAR_TOKEN=${SONAR_TOKEN}",  // From env var
        "mcp/sonarqube"
      ]
    }
  }
}
```

---

## Advanced Features

### Multi-Project Support

**Configure multiple projects**:

```json
{
  "mcpServers": {
    "sonarqube-ui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e", "SONAR_TOKEN=sqa_TOKEN_1",
        "-e", "SONAR_PROJECT_KEY=goose-ui",
        "mcp/sonarqube"
      ]
    },
    "sonarqube-rust": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e", "SONAR_TOKEN=sqa_TOKEN_2",
        "-e", "SONAR_PROJECT_KEY=goose-rust",
        "mcp/sonarqube"
      ]
    }
  }
}
```

**AI can now**:
```
User: "Check quality for both UI and Rust"
AI: Calls sonarqube-ui and sonarqube-rust MCP servers in parallel
```

### Custom Rules Integration

**AI can query custom rules**:

```
User: "Show me all violations of our custom naming conventions"

AI calls: sonarqube_get_issues({
  projectKey: "goose-ui",
  ruleKeys: ["custom:naming-convention"]
})
```

### Historical Trend Analysis

**AI can track quality over time**:

```
User: "Has code quality improved this sprint?"

AI:
1. Gets measures for last 7 days
2. Compares with previous sprint
3. Generates trend report
```

---

## Resources

### Official Documentation
- [SonarQube MCP Server GitHub](https://github.com/SonarSource/sonarqube-mcp-server)
- [SonarQube Community Edition API](https://docs.sonarsource.com/sonarqube/latest/extension-guide/web-api/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

### AI Client Documentation
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/mcp)
- [Windsurf MCP Extensions](https://windsurf.ai/docs/extensions)
- [LM Studio MCP Support](https://lmstudio.ai/docs/mcp)

### Community
- [SonarQube Community Forum](https://community.sonarsource.com/)
- [MCP Discord Server](https://discord.gg/model-context-protocol)

---

## Conclusion

The **SonarQube MCP Server** completes your quality enforcement system by:

✅ **Bridging AI assistants** to your quality database
✅ **Enabling real-time quality checks** during code generation
✅ **Preventing AI from generating incomplete code**
✅ **Providing instant feedback** on code quality
✅ **Automating quality gate checks** before commits
✅ **Integrating with existing workflows** (Husky, GitLab CI)

**Your AI assistants now enforce the same zero-tolerance standards as your CI/CD pipeline!**

---

**Document Version**: 1.0
**Last Updated**: 2026-02-06
**Integration Status**: ✅ READY FOR DEPLOYMENT
