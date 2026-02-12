# Super-Goose Panel Features

> **Super-Goose** = Goose + Super Features. The paid tier that unlocks full agentic automation, studios, marketplace, GPU orchestration, and real-time core switching.

---

## Architecture: Left Sidebar + Content Panel

```
┌──────────────┬─────────────────────────────────────────────────┐
│  LEFT SIDEBAR│           CONTENT AREA                          │
│              │  ┌─────────────────────────────────────────────┐│
│  [SG Logo]   │  │  Top Bar: Section Name + Status Badges     ││
│              │  ├─────────────────────────────────────────────┤│
│  ⚡ Dashboard │  │                                             ││
│  🧪 Studios   │  │  Active Panel Content                       ││
│  🤖 Agents    │  │  (scrollable, max-width 700px)              ││
│  🛒 Marketplace│ │                                             ││
│  🖥️ GPU Cluster│ │  Sub-tabs within each panel                 ││
│  🔌 Connections│ │  Cards, forms, progress bars, logs          ││
│  📊 Monitor   │  │                                             ││
│  ⚙️ Settings  │  │                                             ││
│              │  ├─────────────────────────────────────────────┤│
│  [GPU Status]│  │  Footer: Tech Stack + Version               ││
│              │  └─────────────────────────────────────────────┘│
└──────────────┴─────────────────────────────────────────────────┘
```

The sidebar is collapsible (click logo to toggle icon-only mode). Each nav item maps to a full panel with its own sub-tabs.

---

## Panel 1: ⚡ Dashboard

The home screen. Shows system health at a glance.

| Section | Content |
|---------|---------|
| **Stats Grid** | Active Cores count, Agents Running, GPU Utilization %, Marketplace downloads |
| **Quick Actions** | New Core, Deploy Agent, Train on GPU, Browse Market — one-click launchers |
| **Hardware Status** | Real-time VRAM bars for RTX 3090 Ti (24GB), RX 7800 XT (16GB), System RAM (128GB), with temperatures |
| **Recent Activity** | Timestamped feed — agent completions, training jobs, marketplace events, model syncs |

---

## Panel 2: 🧪 Studios

Super-Goose's creative tools. Each studio is a complete pipeline.

### Sub-tabs
- **All** — Grid view of all 6 studios
- **Recent** — Last opened studios
- **Running** — Studios with active sessions

### Available Studios

| Studio | Icon | Description | Key Technology |
|--------|------|-------------|----------------|
| **Core Studio** | 🧠 | Train & publish Intelligence Cores | LoRA/QLoRA/DoRA + Unsloth |
| **Agent Studio** | 🤖 | Build & configure agentic workflows | DAG Builder + Core Selection |
| **Data Studio** | 📊 | Curate, clean & label training data | Auto-Label + Vision Agent |
| **Eval Studio** | ✅ | Benchmark & compare model performance | SWE-bench + custom evals |
| **Deploy Studio** | 🚀 | Package & ship to any target | OCI/Docker + Nixpacks |
| **Vision Studio** | 👁️ | Multimodal analysis & generation | VL Models (Qwen2.5-VL) |

### Studio Detail View

Each studio opens with the **6-step pipeline** from the original Goose Studio JSX:

```
① SOURCE → ② BUILD → ③ PREPARE → ④ TRAIN → ⑤ TEST → ⑥ PUBLISH
```

Key features inside the detail view:
- **Source Selection**: HuggingFace search (filtered to ≤24GB VRAM), GitHub clone, local file upload
- **Model Search**: Real-time HuggingFace model browser with VRAM/speed/license filters
- **Pipeline Progress**: Visual step tracker with done/active/pending states
- **Launch Pipeline**: Single-click to start the full automation

---

## Panel 3: 🤖 Agents

Manage running agents, installed cores, and build new cores.

### Sub-tabs
- **Active** — Running agents with status, task, model, and uptime
- **My Cores** — Installed core types (FreeformCore, StructuredCore, OrchestratorCore, AdaptiveLearningCore)
- **Builder** — Core builder form to scaffold new custom cores

### Agent Card Fields
- Agent name
- Active core type (e.g., FreeformCore, StructuredCore)
- Backend model (e.g., Claude Sonnet, Qwen3-30B-A3B, GLM-4.7-Flash)
- Status dot (running/idle/error)
- Current task description
- Uptime

### Core Registry

| Core | Description | Agent Count |
|------|-------------|-------------|
| FreeformCore | LLM loop with all subsystems | 2 |
| StructuredCore | Code→Test→Fix StateGraph with DoneGate | 2 |
| OrchestratorCore | Specialist teams with DAG distribution | 0 |
| AdaptiveLearningCore ✨ | Self-learning with Voyager-style skill library + Reflexion memory + PEFT | 0 (NEW) |

### Core Builder
Form fields:
- Core Name
- Base Core (dropdown)
- Shared Services (checkboxes): MemoryManager, CostTracker, CheckpointMgr, GuardrailsEngine, ExperienceStore, SkillLibrary

---

## Panel 4: 🛒 Core Marketplace

Buy, sell, and share Intelligence Cores.

### Sub-tabs
- **Browse** — Search and filter marketplace cores
- **My Cores** — Published and draft cores
- **Sell** — Submit a core for marketplace listing
- **Review** — Core Review Engine status

### Browse Features
- Search bar with text query
- Filter dropdown: All / Free / Paid / Trending
- Core cards showing: name, author, price, downloads, star rating, base model, size, tags

### Sell Features
- Select which local core to sell
- Price selector: Free / $2.99 / $4.99 / $9.99 / Custom
- License selector: Apache 2.0 / MIT / Proprietary
- **Build Cost Transparency** panel showing:
  - Total build time
  - GPU cost (local = $0.00)
  - Training data count and quality score
  - Base model and license
  - Training method
  - Adapter file size

### Core Review Engine (6-gate pipeline)

| Gate | Check | Auto/Human |
|------|-------|------------|
| Schema Validation | adapter_config.json valid, safetensors format | Automated |
| Security Scan | No pickle files, no secrets, no malicious code | Automated |
| Quality Benchmark | Score ≥ 70/100 threshold | Automated |
| Portability Check | Works on GPU ≥ 6GB VRAM | Automated |
| License Compliance | Derivative works allowed | Automated |
| Human Review | Code quality, documentation, usefulness | Human (~4h avg) |

---

## Panel 5: 🖥️ GPU Cluster

Agentic GPU Orchestrator with BYOK (Bring Your Own Key).

### Sub-tabs
- **Cluster** — Connected GPU providers and local GPUs
- **Jobs** — Running/completed training jobs
- **Launch** — Start a new training job

### Connected Providers

| Provider | GPUs | Rate | Auth |
|----------|------|------|------|
| Local — RTX 3090 Ti | 24GB CUDA | Free | Always active |
| Local — RX 7800 XT | 16GB ROCm | Free | Always active |
| RunPod | A100/H100 | $0.74/hr+ | API key (BYOK) |
| Lambda Labs | A100/A10G | $1.10/hr+ | API key (BYOK) |
| Vast.ai | Community | $0.30/hr+ | API key (BYOK) |
| SkyPilot | Auto-cheapest | Varies | Cloud credentials |

### Job Launch Form
- **Target GPU** dropdown (local first, then cloud options with pricing)
- **Method** selector: QLoRA 4-bit / LoRA 16-bit / DoRA / Full Fine-tune
- **Max Budget** selector: $0 / $5 / $20 / $50 / ∞
- **Auto-terminate** toggle
- **Save checkpoints** toggle

### Job Card Fields
- Job ID, name, provider, GPU type
- Progress bar with percentage
- Cost so far (green if $0 local, amber if cloud)
- ETA to completion

### 9-Step Orchestration Flow (powered by SkyPilot)
1. Uses customer API key (BYOK)
2. Spins up instance via CLI or REST
3. SSHs into provisioned node
4. Pushes training scripts automatically
5. Starts training
6. Monitors GPU utilization, loss curves
7. Saves checkpoints to persistent storage
8. Streams logs back in real-time
9. Terminates instance on completion

---

## Panel 6: 🔌 Connections

Service connections, local models, and API key management.

### Sub-tabs
- **Services** — Connected external services
- **Models** — Local models available via Ollama/LM Studio
- **API Keys** — Credential management

### Connected Services

| Service | Protocol | Use |
|---------|----------|-----|
| HuggingFace | REST API + Git LFS | Model downloads, adapter uploads |
| GitHub | REST + SSH | Repo cloning, PR creation |
| Ollama | REST (localhost:11434) | Local model inference |
| LM Studio | REST (localhost:1234) | Local model inference (alternative) |
| Claude API | REST | Planning, reasoning, code review |
| OpenAI | REST | Optional fallback |
| W&B | REST | Training metrics, experiment tracking |
| Docker Hub | REST + Registry | Container image publishing |

### Local Models (Real-time)

| Model | Size | GPU | Speed |
|-------|------|-----|-------|
| GLM-4.7-Flash | 18GB | RTX 3090 Ti | ⚡ 93 t/s |
| Qwen3-30B-A3B | 18GB | RTX 3090 Ti | ⚡ 87 t/s |
| Qwen3-8B | 5GB | RX 7800 XT | ⚡ 110 t/s |
| Qwen2.5-Coder-7B | 4GB | RX 7800 XT | ⚡ 95 t/s |

Users can **pull from Ollama** or **browse HuggingFace** to add models. Automated download with VRAM compatibility check.

---

## Panel 7: 📊 Monitor

Real-time system dashboard with live logs.

### Stats Bar
- Agents active/total
- GPU jobs running
- API calls today
- Cost today

### Cost Tracker
Monthly breakdown: Local GPU ($0), Cloud GPU, API Calls

### Live Log Stream
Monospace log viewer with:
- Timestamp
- Level (INFO/WARN/ERROR/OK) with color coding
- Message (agent actions, training progress, marketplace events, model serving)

---

## Panel 8: ⚙️ Settings

Super-Goose configuration and subscription management.

### Subscription Badge
Visual "SUPER GOOSE Pro Edition" badge with renewal date.

### Configurable Defaults
- Default model (GLM-4.7-Flash)
- Training method (QLoRA 4-bit + Unsloth)
- GPU preference (Local First → Cloud Spot)
- Core format (SafeTensors)
- Max agent count (4 Claude + unlimited local)

### Feature Toggles
- Auto-save checkpoints ✅
- GPU auto-terminate ✅
- Marketplace notifications ✅
- Agent cost alerts ($5 threshold) ✅
- Experimental: AdaptiveLearningCore ❌
- Experimental: Core hot-swap ❌

### Data & Storage
NVMe usage breakdown: Models, Cores, Datasets, Checkpoints

---

## Design Tokens (Color System)

| Token | Hex | Use |
|-------|-----|-----|
| `bg` | `#080818` | Page background |
| `surface` | `#0a0a1f` | Sidebar, header, footer |
| `card` | `#0f0f23` | Card backgrounds |
| `input` | `#1a1a2e` | Input fields, secondary surfaces |
| `border` | `#1e293b` | Primary borders |
| `superGold` | `#fbbf24` | Super-Goose branding accent |
| `indigo` | `#6366f1` | Primary action color |
| `emerald` | `#10b981` | Success, active, connected |
| `amber` | `#f59e0b` | Warning, in-progress |
| `red` | `#ef4444` | Training, GPU, errors |
| `violet` | `#8b5cf6` | Cores, studios |
| `sky` | `#0ea5e9` | Marketplace, info |

---

## Goose (Free) vs Super-Goose (Paid)

| Feature | Goose (Free) | Super-Goose (Paid) |
|---------|--------------|-------------------|
| Basic chat + tools | ✅ | ✅ |
| FreeformCore | ✅ | ✅ |
| StructuredCore | ❌ | ✅ |
| OrchestratorCore | ❌ | ✅ |
| AdaptiveLearningCore | ❌ | ✅ |
| Core Studio (train cores) | ❌ | ✅ |
| Agent Studio | ❌ | ✅ |
| Data Studio | ❌ | ✅ |
| Eval Studio | ❌ | ✅ |
| Deploy Studio | ❌ | ✅ |
| Vision Studio | ❌ | ✅ |
| Core Marketplace (browse) | ✅ (free cores only) | ✅ (all cores) |
| Core Marketplace (sell) | ❌ | ✅ |
| GPU Orchestrator (local) | ✅ | ✅ |
| GPU Orchestrator (cloud BYOK) | ❌ | ✅ |
| Multi-machine inference | ❌ | ✅ |
| Live Monitor dashboard | Basic | Full |
| Agent limit | 2 | Unlimited |
| Priority marketplace review | ❌ | ✅ |

---

## File Structure

```
G:\goose\docs\panel-features\
├── PANEL-FEATURES.md          ← This document
├── ARCHITECTURE-PANELS.md     ← Component architecture
├── super-goose-features.jsx   ← React template (side panel)
├── goose-studio-pipeline.jsx  ← Original studio pipeline (embedded in Studios panel)
└── assets/
    └── mockups/               ← UI screenshots / design references
```
