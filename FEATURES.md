# Goose Features

**Version:** 1.23.0  
**Last Updated:** February 7, 2026

This document provides a comprehensive list of all features available in Goose, organized by category. This file is maintained in sync with the README.md and reflects the current state of the application.

---

## 🎯 Core Features

### AI Agent Framework
- **Multi-Agent Orchestration** - 5 specialist agents (Code, Test, Deploy, Docs, Security) working in coordination
- **Self-Correcting StateGraph** - Autonomous CODE → TEST → FIX development loops
- **Advanced Reasoning Patterns** - ReAct, Chain-of-Thought, and Tree-of-Thoughts
- **Reflexion Self-Improvement** - Episodic memory and verbal reinforcement learning
- **LangGraph-Style Checkpointing** - SQLite and in-memory persistence for state management

### Planning & Quality Assurance
- **Multi-Step Planning** - Structured plans with dependency management (1,173 lines)
- **Self-Critique System** - Automated quality assurance with 8 issue categories (951 lines)
- **Done Gate Verification** - Multi-stage verification before completion (427 lines)
- **Enterprise Workflow Engine** - 10 pre-built workflow categories (831 lines)

### Observability & Cost Management
- **Real-Time Token Tracking** - Monitor token usage across all interactions
- **Cost Estimation** - 7 model presets with real-time cost calculation
- **Budget Limits** - Set and enforce spending limits
- **Tracing & Analytics** - Comprehensive observability (796 lines)

---

## 🖥️ Desktop Application

### User Interface
- **Modern Desktop App** - Built with Electron and React
- **Cross-Platform** - Windows, macOS, and Linux support
- **Dark/Light Theme** - Customizable theme support
- **Responsive Layout** - Adaptive UI for different screen sizes

### Chat & Conversations
- **Interactive Chat Interface** - Real-time AI conversations
- **Message History** - Full conversation tracking and replay
- **Multiple Sessions** - Run multiple AI sessions simultaneously
- **Session Management** - Save, load, and organize chat sessions
- **Shared Sessions** - Share sessions with deep links
- **Popular Topics** - Quick-start conversation templates

### Input & Interaction
- **Text Input** - Rich text input with markdown support
- **Audio Capture** - Voice input support with waveform visualization
- **File Attachments** - Attach files to conversations
- **Image Preview** - View images inline
- **Mention System** - @ mentions for tools and extensions
- **Context Management** - Advanced context window management

---

## 🔧 Extensions & Integrations

### Extension System
- **Extension Marketplace** - Browse and install extensions
- **Built-in Extensions** - Pre-configured extensions for common tasks
- **Extension Loading** - Dynamic extension loading with toast notifications
- **Extension Configuration** - Per-extension settings and preferences
- **MCP Apps Support** - Model Context Protocol application integration
- **MCP UI Resources** - Render MCP resources in UI

### MCP (Model Context Protocol)
- **MCP Server Integration** - Connect to external MCP servers
- **Resource Rendering** - Display MCP resources in chat
- **Tool Integration** - Execute MCP tools from chat interface

---

## 📝 Recipes & Workflows

### Recipe System
- **Recipe Library** - Pre-built recipes for common tasks
- **Custom Recipes** - Create and save custom workflows
- **Recipe Parameters** - Configurable input parameters
- **Recipe Execution** - Run recipes with one click
- **Recipe Sharing** - Share recipes with team members

### Workflow Automation
- **Scheduled Tasks** - Schedule workflows to run automatically
- **Cron Support** - Flexible scheduling with cron expressions
- **Workflow Templates** - 10 enterprise workflow categories
- **Multi-Agent Workflows** - Coordinate multiple agents in workflows

---

## ⚙️ Settings & Configuration

### Provider Settings
- **Multiple Providers** - OpenAI, Anthropic, LM Studio, Ollama, and more
- **Provider Configuration** - API keys, endpoints, and model selection
- **Model Selection** - Choose from available models per provider
- **Provider Guard** - Ensure provider is configured before use
- **API Key Management** - Secure storage of API credentials
- **Provider Testing** - Test provider connections

### Application Settings
- **General Settings** - Application-level preferences
- **Theme Settings** - Dark/light theme and customization
- **Update Settings** - Auto-update configuration
- **Telemetry Settings** - Opt-in/out of telemetry
- **Permission Settings** - Tool approval policies (SAFE/PARANOID/AUTOPILOT)
- **Working Directory** - Default working directory for operations

### Security & Permissions
- **3-Tier Approval Policies**:
  - **SAFE** - Prompt for all tool executions
  - **PARANOID** - Require explicit approval for each action
  - **AUTOPILOT** - Auto-approve safe operations
- **Tool Confirmation** - Review and approve tool calls
- **Permission Management** - Granular control over tool permissions

---

## 🔄 Updates & Maintenance

### Auto-Update System
- **Automatic Update Detection** - Check for updates on startup
- **Background Download** - Download updates without interruption
- **Auto-Restart** - Automatically restart app after update (3-second delay)
- **Update Notifications** - Desktop notifications for updates
- **GitHub Fallback** - Fallback to GitHub releases if update server unavailable
- **Version Display** - Current version shown in settings

### Diagnostics & Support
- **System Diagnostics** - View system information
- **Error Reporting** - Report bugs directly to GitHub
- **Crash Reports** - Automatic crash detection and reporting
- **Log Management** - Comprehensive logging with electron-log
- **Analytics** - Usage analytics (opt-in)

---

## 🗂️ Session Management

### Session Features
- **Session History** - View all past sessions
- **Session Search** - Find sessions by content
- **Session Export** - Export sessions for sharing
- **Session Import** - Import shared sessions
- **Active Session Tracking** - Monitor active sessions
- **Session Indicators** - Visual indicators for session status

---

## 🛠️ Developer Tools

### Testing & Validation
- **Comprehensive Test Suite** - 950+ passing tests
- **Test Framework Support** - Cargo test, npm test, pytest, Jest
- **Automated Testing** - Self-correcting test loops
- **Quality Validation** - Multi-pass validation system (25 checks)
- **SonarQube Integration** - Code quality enforcement

### Build & Deployment
- **Windows Installer** - Squirrel.Windows installer
- **macOS Bundle** - DMG and ZIP distribution
- **Linux Packages** - DEB, RPM, and Flatpak
- **Code Signing** - Signed executables (Windows/macOS)
- **CI/CD Integration** - GitLab CI/CD pipelines

---

## 📦 Advanced Features

### Prompt Engineering
- **20+ Prompt Templates** - Reusable prompt patterns (1,200 lines)
- **Prompt Customization** - Edit and save custom prompts
- **Prompt Library** - Browse and use pre-built prompts

### State Management
- **Persistent State** - SQLite-based state persistence
- **Checkpointing** - Save and restore agent state
- **State Recovery** - Recover from crashes
- **In-Memory Caching** - Fast state access

### Specialized Agents
1. **Code Agent** - Code generation and refactoring
2. **Test Agent** - Test creation and execution
3. **Deploy Agent** - Deployment automation
4. **Docs Agent** - Documentation generation
5. **Security Agent** - Security analysis and fixes

---

## 🌐 Platform Support

### Operating Systems
- ✅ **Windows** - Windows 10/11 (x64)
- ✅ **macOS** - macOS 10.15+ (Intel & Apple Silicon)
- ✅ **Linux** - Ubuntu, Debian, Fedora, Arch

### Architectures
- ✅ x64 (Intel/AMD)
- ✅ ARM64 (Apple Silicon, ARM devices)

---

## 📊 Enterprise Features

### Workflow Management
- **10 Workflow Categories**:
  1. Code Development
  2. Testing & QA
  3. Deployment
  4. Documentation
  5. Security Analysis
  6. Code Review
  7. Refactoring
  8. Bug Fixing
  9. Feature Implementation
  10. Maintenance

### Team Collaboration
- **Shared Sessions** - Share AI sessions with team
- **Session Deep Links** - Quick access to shared sessions
- **Team Recipes** - Share recipes across team
- **Collaborative Workflows** - Multi-user workflow execution

---

## 🔐 Security Features

### Code Security
- **Security Analysis** - Automated security scanning
- **Vulnerability Detection** - Identify security issues
- **Fix Suggestions** - Automated security fixes
- **Security Agent** - Dedicated security analysis agent

### Data Privacy
- **Local Processing** - Chat history stored locally
- **API Key Encryption** - Secure credential storage
- **Telemetry Opt-Out** - Complete control over data sharing
- **No Data Collection** - Optional analytics only

---

## 📈 Performance & Optimization

### Efficiency
- **Streaming Responses** - Real-time response streaming
- **Progressive Rendering** - Incremental message display
- **Lazy Loading** - Load components on demand
- **Memory Management** - Efficient resource usage
- **Background Processing** - Non-blocking operations

### Optimization
- **Token Optimization** - Minimize token usage
- **Context Pruning** - Smart context window management
- **Caching** - Cache responses for repeated queries
- **Batch Processing** - Batch tool executions

---

## 🎨 UI Components

### Core Components
- Hub - Main dashboard
- Chat Interface - Conversation view
- Sidebar Navigation - Quick access menu
- Settings Panel - Configuration interface
- Extension Manager - Extension marketplace
- Recipe Browser - Recipe library
- Session Browser - Session history
- Schedule Manager - Workflow scheduler

### Advanced UI
- **Markdown Rendering** - Full markdown support with KaTeX
- **Syntax Highlighting** - Code syntax highlighting
- **Progress Indicators** - Visual progress tracking
- **Toast Notifications** - Non-intrusive notifications
- **Modal Dialogs** - Interactive dialogs
- **Waveform Visualizer** - Audio visualization
- **Loading States** - Animated loading indicators

---

## 🚀 Getting Started Features

### Onboarding
- **Welcome Screen** - First-time setup wizard
- **Provider Setup** - Guided provider configuration
- **Quick Start** - Popular topics for new users
- **Tutorial Links** - Access to documentation
- **Sample Recipes** - Pre-loaded example recipes

### Help & Documentation
- **In-App Help** - Context-sensitive help
- **Keyboard Shortcuts** - Quick access shortcuts
- **Tooltips** - Helpful UI hints
- **Error Messages** - Clear error explanations
- **Troubleshooting** - Built-in diagnostics

---

## 🔮 Upcoming Features

### Planned Enhancements
- Enhanced file manager integration
- Advanced AI chat modes
- Real-time collaboration
- Cloud sync (optional)
- Mobile companion app
- Browser extension
- IDE integrations

---

## 📄 Feature Categories Summary

| Category | Features | Lines of Code |
|----------|----------|---------------|
| **Core AI** | Multi-agent, Reasoning, Planning | ~6,000 |
| **UI/UX** | Desktop app, Chat, Sessions | ~15,000 |
| **Extensions** | MCP, Extensions, Apps | ~3,000 |
| **Workflows** | Recipes, Schedules, Automation | ~2,000 |
| **Security** | Permissions, Approval, Encryption | ~1,500 |
| **Developer** | Testing, Validation, Build | ~3,500 |
| **Total** | **60+ Major Features** | **~31,000** |

---

## 📝 Maintenance

This FEATURES.md file is maintained in sync with:
- README.md (project overview)
- CHANGELOG.md (version history)
- Documentation (detailed guides)

**Last verified:** February 7, 2026  
**Version:** 1.23.0

For detailed usage instructions, see the [README.md](README.md).  
For version history, see the [CHANGELOG.md](CHANGELOG.md).
