# GOOSE STUDIO — Agentic LoRA Pipeline Architecture

## "Every Path Leads to a Working Core"

**Version:** 1.0.0
**Date:** February 11, 2026
**Status:** Architecture Design
**Parent System:** Super-Goose L6 Desktop

---

## 1. Executive Summary

Goose Studio is a **tab-based, agentic pipeline** that takes users from zero to a finished, working LoRA adapter (Intelligence Core) through a series of simple guided steps. The system is designed around one absolute principle:

> **"All choices always result in a finished and working product."**

There are no dead ends. Every branch, every option, every path the user can take terminates in a working, validated, deployable LoRA Core. If something fails, agents fix it automatically. If the user doesn't know what to choose, smart defaults produce excellent results.

### What Makes This Different

| Traditional ML Workflow | Goose Studio |
|------------------------|--------------|
| 47 steps, CLI commands, YAML editing | 6 tabs, click through |
| Breaks constantly, cryptic errors | Agents auto-fix all failures |
| Requires ML expertise | Requires zero ML knowledge |
| Dead ends everywhere | Every path completes |
| Manual everything | Fully agentic |
| Cloud-only ($$$) | Local-first (free on your GPUs) |

---

## 2. Design Philosophy: "No Dead Ends"

### The Guarantee System

Every step in the pipeline implements a **Guarantee Contract**:

```
┌─────────────────────────────────────────────────┐
│              GUARANTEE CONTRACT                   │
│                                                   │
│  For every user choice at step N:                 │
│                                                   │
│  1. There EXISTS a valid path to step N+1         │
│  2. If the path fails, an AGENT intervenes        │
│  3. If the agent fails, a FALLBACK activates      │
│  4. If the fallback fails, the user is TOLD       │
│     exactly what's needed (never left stuck)      │
│                                                   │
│  Failure is NOT: "Error. Try again."              │
│  Failure IS: "This needs X. Want me to fix it?"   │
└─────────────────────────────────────────────────┘
```

### The Agent Hierarchy

When something goes wrong at any step, a cascade of agents handles it:

```
User Action
    │
    ▼
[Step Agent] ──── Handles the normal happy path
    │ fails?
    ▼
[Repair Agent] ── Diagnoses and fixes the issue automatically
    │ fails?
    ▼
[Fallback Agent] ── Tries alternative approaches
    │ fails?
    ▼
[Guide Agent] ─── Explains exactly what's needed in plain English
                   Offers to help the user get unstuck
                   NEVER just shows an error and stops
```

---

## 3. The 6-Tab Pipeline

```
┌────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐   ┌─────────┐
│   1    │──▶│    2    │──▶│    3    │──▶│    4    │──▶│   5    │──▶│    6    │
│ SOURCE │   │  BUILD  │   │ PREPARE │   │  TRAIN  │   │  TEST  │   │ PUBLISH │
│        │   │         │   │         │   │         │   │        │   │         │
│ Where  │   │ Build & │   │ Create  │   │ Run the │   │ Verify │   │ Package │
│ from?  │   │ Preview │   │ training│   │ LoRA    │   │ it     │   │ & Ship  │
│        │   │ the app │   │ data    │   │ training│   │ works  │   │         │
└────────┘   └─────────┘   └─────────┘   └─────────┘   └────────┘   └─────────┘
     │             │              │             │             │             │
  Choose        Nixpacks       Auto or       Click         Chat +       One-click
  source        auto-build     manual        Start         Eval         publish
```

### Tab Overview

| Tab | Name | User Action | Agent Action | Output |
|-----|------|-------------|--------------|--------|
| 1 | SOURCE | Pick: HuggingFace / GitHub / Local | Fetch, validate, scan | Raw materials ready |
| 2 | BUILD | Watch (or skip) | Nixpacks build, Docker run, preview | Running app + code index |
| 3 | PREPARE | Choose dataset strategy | Generate/clean/format training data | Ready JSONL dataset |
| 4 | TRAIN | Pick model + click Start | LLaMA-Factory + Unsloth training | LoRA adapter files |
| 5 | TEST | Chat with it, review scores | Automated eval + vision QA | Quality report |
| 6 | PUBLISH | Set price, write description | Package .gcpkg, validate, upload | Published Core |

---

## 4. Tab 1: SOURCE — "Where Does Your Knowledge Come From?"

### User-Facing UI

```
┌─────────────────────────────────────────────────────────────┐
│  ① SOURCE                                                    │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Where should your Intelligence Core learn from?              │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  🤗 HuggingFace │  │  🐙 GitHub      │  │  📁 My Files │ │
│  │                 │  │                 │  │              │ │
│  │  Browse models  │  │  Clone a repo   │  │  Upload your │ │
│  │  and datasets   │  │  and learn its  │  │  own training│ │
│  │  from the Hub   │  │  source code    │  │  data files  │ │
│  │                 │  │                 │  │              │ │
│  │  Best for:      │  │  Best for:      │  │  Best for:   │ │
│  │  General skills │  │  Code expertise │  │  Custom data │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                               │
│  ── Or try a Quick Recipe ──────────────────────────────────  │
│                                                               │
│  [🔥 Coding Assistant]  [✍️ Writing Style]  [🧠 Reasoning]   │
│  [📊 Data Analyst]      [🎮 Game Dev]       [🔧 DevOps]      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Source: HuggingFace

**User picks:** Browse/search HuggingFace for a base model AND/OR a training dataset.

**Agent actions:**
1. Search HuggingFace Hub for models matching user's goal
2. Auto-filter to models that FIT the user's GPU (VRAM check)
3. Download model + dataset
4. Validate compatibility
5. If dataset needs reformatting → agent reformats automatically

**Available choices (all lead to completion):**

```
HuggingFace Source
├── Pick a Base Model
│   ├── Recommended for you: [auto-selected based on GPU + goal]
│   ├── Browse by category: Coding / Chat / Reasoning / Vision
│   ├── Search by name: _______________
│   └── Agent guardrail: Only shows models that FIT your VRAM
│
├── Pick a Dataset
│   ├── Recommended: [matched to your chosen model + goal]
│   ├── Browse popular: coding-instruct, alpaca, dolly, ...
│   ├── Search: _______________
│   └── Agent guardrail: Auto-reformats any dataset to required format
│
└── Quick Combo (one click)
    ├── "Coding Pro" → Qwen3-8B + code-feedback dataset
    ├── "Writer" → LLaMA-3-8B + writing-prompts dataset
    ├── "Reasoner" → GLM-4-9B + reasoning-chains dataset
    └── Agent builds everything from the combo template
```

### Source: GitHub

**User picks:** Paste a GitHub URL (or search for repos).

**Agent actions:**
1. Clone the repository
2. **Nixpacks** auto-detects language/framework
3. Analyze code structure (files, functions, classes, patterns)
4. Generate a code knowledge graph
5. Auto-select best base model for this language/framework
6. Proceed to BUILD tab (Tab 2)

**Available choices (all lead to completion):**

```
GitHub Source
├── Paste URL: https://github.com/user/repo
│   └── Agent: clone → detect → index → ready
│
├── Search GitHub: _______________
│   └── Agent: search → show results → user picks → clone
│
├── My Repositories (if GitHub connected)
│   └── Shows your repos with size/language badges
│
└── Multi-Repo (advanced)
    ├── Add multiple repos to learn from
    └── Agent merges knowledge from all repos
```

### Source: My Files

**User picks:** Upload files (JSONL, CSV, TXT, PDF, code files).

**Agent actions:**
1. Detect file format
2. Auto-convert to training format (instruction/output JSONL)
3. Validate data quality
4. Show preview of training examples
5. Suggest improvements

**Supported uploads:**

```
My Files Source
├── Training Data (structured)
│   ├── .jsonl (instruction/output pairs) → ready immediately
│   ├── .csv (columns mapped to instruction/output) → auto-convert
│   └── .parquet → auto-convert
│
├── Documents (unstructured → agent generates Q&A)
│   ├── .txt, .md → extract knowledge, generate training pairs
│   ├── .pdf → OCR + extract + generate pairs
│   └── .docx → extract + generate pairs
│
├── Code Files (agent generates code Q&A)
│   ├── .py, .js, .ts, .rs, .cs, etc.
│   └── .zip of project → extract + analyze + generate pairs
│
└── Chat Exports (conversation history → training pairs)
    ├── Goose chat history export
    ├── ChatGPT export
    └── Any conversation JSON
```

### Quick Recipes (One-Click Start)

Pre-built templates that auto-select source + model + dataset + settings:

| Recipe | Base Model | Dataset Source | Result |
|--------|-----------|---------------|--------|
| 🔥 Coding Assistant | Qwen3-8B | HuggingFace: code-feedback | Code-specialized Core |
| ✍️ Writing Style | LLaMA-3.3-8B | HuggingFace: writing-prompts | Writing-specialized Core |
| 🧠 Reasoning Pro | GLM-4-9B | HuggingFace: reasoning-chains | Reasoning-specialized Core |
| 📊 Data Analyst | Qwen3-14B | HuggingFace: sql-instruct | Data/SQL-specialized Core |
| 🎮 Game Dev | DeepSeek-Coder-8B | GitHub: popular game repos | Game dev-specialized Core |
| 🔧 DevOps Expert | Qwen3-8B | HuggingFace: devops-instruct | DevOps-specialized Core |

Each recipe skips straight to TRAIN tab with everything pre-configured.

---

## 5. Tab 2: BUILD — "Nixpacks Build Engine"

This tab is **only active when the source is GitHub**. For HuggingFace/Local sources, this tab shows a brief "Source Ready ✅" status and auto-advances to PREPARE.

### Purpose

Build and run the cloned GitHub project so agents can:
1. See the running application (vision model)
2. Understand the codebase deeply (code indexer)
3. Generate better training data (from real working code)

### Build Engine: Nixpacks Integration

**Nixpacks** (by Railway, open source, Rust-based) is the build engine:

```
┌─────────────────────────────────────────────────────────────┐
│  ② BUILD                                                     │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Repository: github.com/user/awesome-dashboard                │
│  Detected:   React 18 + TypeScript + Vite + Tailwind CSS     │
│  Status:     ⏳ Building...                                   │
│                                                               │
│  ┌─ Build Log ─────────────────────┬─ Live Preview ────────┐ │
│  │ ✅ Cloned repository            │                        │ │
│  │ ✅ Detected: Node.js 20         │   ┌──────────────┐    │ │
│  │ ✅ nixpacks plan generated      │   │              │    │ │
│  │ ✅ npm install (347 packages)   │   │  Loading...  │    │ │
│  │ ⏳ npm run build                │   │              │    │ │
│  │ ⏳ Starting dev server...       │   │              │    │ │
│  │                                  │   └──────────────┘    │ │
│  │                                  │                        │ │
│  └──────────────────────────────────┴────────────────────────┘ │
│                                                               │
│  ┌─ Code Analysis ───────────────────────────────────────── ┐ │
│  │ Files: 127 │ Functions: 412 │ Components: 34 │ Tests: 18 │ │
│  │ Framework: React 18  │ State: Redux  │ API: REST + tRPC  │ │
│  │ Entry: src/main.tsx  │ Routes: 12    │ DB: PostgreSQL     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  [🔄 Rebuild]  [⏭️ Skip to Prepare]  [▶️ Next: Prepare →]    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Nixpacks Auto-Detection

Nixpacks detects and builds 20+ languages automatically:

| Language | Detection File | Build Command | Run Command |
|----------|---------------|---------------|-------------|
| Node.js / React | package.json | npm install && npm build | npm start / npm dev |
| Python / Flask / Django | requirements.txt / pyproject.toml | pip install | python app.py |
| Rust | Cargo.toml | cargo build | cargo run |
| Go | go.mod | go build | ./app |
| Ruby / Rails | Gemfile | bundle install | rails server |
| Java / Spring | pom.xml / build.gradle | mvn package | java -jar |
| C# / .NET | *.csproj / *.sln | dotnet build | dotnet run |
| PHP / Laravel | composer.json | composer install | php artisan serve |
| Elixir / Phoenix | mix.exs | mix deps.get | mix phx.server |
| Static HTML | index.html | (none) | nginx serve |

### Build Failure Recovery (No Dead Ends)

When Nixpacks build fails, the agent cascade activates:

```
Build fails
    │
    ▼
[Build Repair Agent]
    ├── Missing dependency? → Auto-add to nixpacks.toml
    ├── Wrong Node version? → Set NIXPACKS_NODE_VERSION
    ├── Missing env vars? → Create .env from .env.example
    ├── Port conflict? → Remap to available port
    ├── Missing system lib? → Add to nixPkgs
    │
    ▼ still fails?
[Dockerfile Fallback Agent]
    ├── Scan repo for existing Dockerfile → use it
    ├── Generate Dockerfile from code analysis
    ├── Try docker compose if compose file exists
    │
    ▼ still fails?
[Skip Build Agent]
    ├── "This repo can't be run, but I can still analyze the code"
    ├── Proceed to PREPARE with code-only analysis
    ├── User still gets a working LoRA from the source code
    └── NO DEAD END — just a different path
```

### Vision Agent Exploration (When Build Succeeds)

If the project builds and runs (web app on localhost), the vision agent explores:

```
Vision Agent Exploration Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pages found: 12
├── / (Homepage) ──── Screenshot captured
├── /login ────────── Form found: email + password
├── /dashboard ────── Charts: 3 bar, 2 line, 1 pie
├── /settings ─────── 4 tabs: Profile, Security, Billing, API
├── /users ────────── Table with pagination (47 users)
└── /404 ──────────── Custom error page

Components mapped: 34
├── <Navbar /> ─── Present on all pages
├── <Sidebar /> ── Collapsible, 8 menu items
├── <DataTable /> ─ Sortable, filterable, paginated
└── ...

Issues found: 2
├── /settings: "Dark mode" toggle doesn't persist
└── /users: Table overflows on mobile viewport

This exploration data will be used to generate
high-quality training pairs about this project.
```

---

## 6. Tab 3: PREPARE — "Create Training Data"

### Purpose

Transform raw source material into clean, validated training data ready for LoRA fine-tuning. This is where the "magic" happens — agents auto-generate training pairs from whatever the user provided.

### User-Facing UI

```
┌─────────────────────────────────────────────────────────────┐
│  ③ PREPARE                                                   │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Source: github.com/user/awesome-dashboard (React + TS)       │
│                                                               │
│  How should I create training data?                           │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  🤖 Auto-Generate│  │  📝 Manual Edit  │  │  🔀 Mix    │ │
│  │                  │  │                  │  │            │ │
│  │  I'll analyze    │  │  Upload or write │  │  Auto +    │ │
│  │  the code and    │  │  your own Q&A    │  │  Manual    │ │
│  │  generate Q&A    │  │  training pairs  │  │  combined  │ │
│  │  pairs for you   │  │                  │  │            │ │
│  │                  │  │  Best for:       │  │  Best for: │ │
│  │  Best for:       │  │  Specific domain │  │  Maximum   │ │
│  │  Code learning   │  │  knowledge       │  │  quality   │ │
│  │  (recommended)   │  │                  │  │            │ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Auto-Generate Pipeline (For GitHub Sources)

The agent reads the codebase and generates training pairs across 6 categories:

```
Code Analysis → Training Data Generation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Category 1: "What does this do?" (Function Explanation)
──────────────────────────────────────────────────────
Input:  Each function/component in the codebase
Output: Q&A about what it does, how it works
Example:
  Q: "How does the authentication middleware work?"
  A: "The auth middleware in src/middleware/auth.ts
     validates JWT tokens from the Authorization header.
     It first checks the Redis cache for revoked tokens,
     then verifies the signature using jsonwebtoken.verify()
     with the JWT_SECRET env var. On failure, it returns
     401 with a structured error response..."

Category 2: "How do I add X?" (Code Generation)
──────────────────────────────────────────────────
Input:  Patterns found in the codebase
Output: "Add a new X following this project's patterns"
Example:
  Q: "Add a new API endpoint for user notifications"
  A: "Based on this project's patterns:
     1. Create src/routes/notifications.ts
     2. Follow the same router pattern as routes/users.ts
     3. Add NotificationService in src/services/
     4. Create migration in prisma/migrations/..."

Category 3: "Fix this error" (Debugging)
──────────────────────────────────────────
Input:  Common errors in this tech stack
Output: Project-specific debugging guidance
Example:
  Q: "TypeError: Cannot read property 'map' of undefined
     in UserList.tsx"
  A: "This project fetches users via useQuery in
     hooks/useUsers.ts. The error means the API returned
     before data was ready. Add a loading check:
     if (isLoading) return <Spinner />;
     Also check that the API endpoint /api/users is
     returning the expected { users: [...] } shape..."

Category 4: "Architecture questions" (Design)
──────────────────────────────────────────────
Input:  Project structure analysis
Output: Architecture-level Q&A
Example:
  Q: "What database does this project use and why?"
  A: "PostgreSQL via Prisma ORM. The schema is in
     prisma/schema.prisma. Key models: User, Post,
     Comment with cascade deletes. The choice of
     Postgres over MongoDB is because the data is
     highly relational (users have posts which have
     comments). Connection pooling via PgBouncer..."

Category 5: "Test this" (Testing)
──────────────────────────────────
Input:  Existing tests + untested code
Output: How to write tests for this project
Example:
  Q: "Write a test for the createUser service"
  A: "Using this project's test setup (Jest + Supertest):
     import { createUser } from '../services/userService';
     import { prismaMock } from '../__mocks__/prisma';
     ..."

Category 6: "UI/UX" (From Vision Agent Exploration)
────────────────────────────────────────────────────
Input:  Screenshots + component analysis from BUILD tab
Output: UI-specific Q&A
Example:
  Q: "How is the dashboard layout structured?"
  A: "The dashboard uses a 3-column grid layout:
     - Left: <Sidebar /> (collapsible, 240px)
     - Center: <MainContent /> (flex-grow)
     - Right: <ActivityFeed /> (320px, hidden on mobile)
     Charts use Recharts library with the theme
     colors defined in styles/theme.ts..."
```

### Auto-Generate Pipeline (For HuggingFace Datasets)

When the source is a HuggingFace dataset, the agent:

1. Downloads the dataset
2. Inspects format (instruction/output, QA, conversation, etc.)
3. Converts to standard JSONL format
4. Filters low-quality entries
5. Balances categories
6. Shows preview for user approval

### Data Quality Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Training Data Ready                                         │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Total pairs: 2,847                                           │
│  ┌────────────────────────────────────────────────────┐      │
│  │ Function Explanation  ████████████████████ 812     │      │
│  │ Code Generation       ██████████████████   734     │      │
│  │ Debugging             ██████████████       523     │      │
│  │ Architecture           ████████████        401     │      │
│  │ Testing                █████████           287     │      │
│  │ UI/UX                  ██████              90      │      │
│  └────────────────────────────────────────────────────┘      │
│                                                               │
│  Quality Score: 87/100  ✅                                    │
│  Avg tokens per pair: 342                                     │
│  Estimated training time: ~28 minutes (Qwen3-8B, QLoRA)      │
│                                                               │
│  [👁️ Preview Samples]  [✏️ Edit/Add]  [▶️ Next: Train →]    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### No Dead Ends in PREPARE

| Scenario | Agent Response |
|----------|---------------|
| Dataset too small (<100 pairs) | Agent generates more from related HuggingFace datasets |
| Dataset has formatting errors | Agent auto-fixes format |
| Mixed languages in dataset | Agent separates and lets user choose |
| Uploaded CSV with wrong columns | Agent asks which column is which, then maps |
| Empty upload | Agent suggests Quick Recipe datasets |
| Corrupted file | Agent reports issue, offers alternative upload |

---

## 7. Tab 4: TRAIN — "Run the LoRA Training"

### User-Facing UI

```
┌─────────────────────────────────────────────────────────────┐
│  ④ TRAIN                                                     │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  ┌─ Model ─────────────────────────────────────────────────┐ │
│  │  Recommended: Qwen3-8B (fits 3090 Ti, fast, excellent)  │ │
│  │  [Qwen3-8B ▼]  ← dropdown with GPU-compatible models    │ │
│  │                                                          │ │
│  │  VRAM needed: ~6GB of 24GB available  [████░░░░░░] 25%  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Method ────────────────────────────────────────────────┐ │
│  │  ● QLoRA 4-bit (Recommended — fast, low VRAM)           │ │
│  │  ○ LoRA 16-bit (Higher quality, more VRAM)              │ │
│  │  ○ Full fine-tune (Maximum quality, needs most VRAM)    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Speed ─────────────────────────────────────────────────┐ │
│  │  ● Turbo (Unsloth enabled — 2-5x faster)               │ │
│  │  ○ Standard                                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Presets ───────────────────────────────────────────────┐ │
│  │  ● Recommended (3 epochs, lr 2e-4, rank 16, alpha 32)  │ │
│  │  ○ Quick Test (1 epoch — 5 min, lower quality)          │ │
│  │  ○ High Quality (5 epochs — 45 min, best results)       │ │
│  │  ○ Custom (show all hyperparameters)                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Dataset: 2,847 pairs │ Est. time: ~28 min │ VRAM: 6.2GB    │
│                                                               │
│  [ ▶▶ START TRAINING ]                                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### During Training

```
┌─────────────────────────────────────────────────────────────┐
│  ④ TRAIN — Running                                           │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Model: Qwen3-8B │ Method: QLoRA 4-bit │ Unsloth: ON        │
│  Progress: ████████████████░░░░░░░░░░ 62% (Step 1,764/2,847)│
│  Time: 17:23 elapsed │ ~10:30 remaining                      │
│                                                               │
│  ┌─ Loss Curve ────────────────────────────────────────────┐ │
│  │ 2.4 ╷                                                    │ │
│  │     │╲                                                   │ │
│  │ 1.8 │ ╲                                                  │ │
│  │     │  ╲                                                 │ │
│  │ 1.2 │   ╲__                                              │ │
│  │     │      ╲___                                          │ │
│  │ 0.6 │          ╲_______                                  │ │
│  │     │                  ╲___________                      │ │
│  │ 0.0 ┼─────────────────────────────────── steps           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ GPU Status ────────────────────────────────────────────┐ │
│  │  RTX 3090 Ti: 6.2GB / 24GB  [██░░░░░░░░] 26%  72°C    │ │
│  │  RTX 3060 Ti: idle (available for inference)             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  [⏸ Pause]  [⏹ Stop & Save Best]  [📊 Details]              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Model Selection: GPU-Aware Filtering

The dropdown ONLY shows models that fit the user's hardware:

```
Model Selector (for RTX 3090 Ti, 24GB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⭐ Recommended
├── Qwen3-8B          │ ~6GB  │ ⚡ Fast  │ Best all-around
├── GLM-4-9B-0414     │ ~7GB  │ ⚡ Fast  │ Great for coding
└── LLaMA-3.3-8B      │ ~6GB  │ ⚡ Fast  │ Great for English

More Models
├── Qwen3-14B         │ ~10GB │ 🟡 Med   │ Higher quality
├── DeepSeek-V3-7B    │ ~6GB  │ ⚡ Fast  │ Strong reasoning
├── Phi-4-14B         │ ~10GB │ 🟡 Med   │ Microsoft, compact
├── Mistral-7B-v0.3   │ ~6GB  │ ⚡ Fast  │ European model
└── Qwen3-30B-A3B     │ ~18GB │ 🔴 Slow  │ MoE, big brain

Advanced (tight fit)
├── GLM-4-32B-0414    │ ~20GB │ 🔴 Slow  │ Max quality 
└── LLaMA-3.1-70B     │ ~22GB │ 🔴 Slow  │ Needs Unsloth

───── Hidden (won't fit) ─────
  ✗ Qwen3-72B (needs 40GB+)
  ✗ LLaMA-3.1-405B (needs cluster)
  ✗ DeepSeek-V3-671B (needs cluster)
```

### Backend: LLaMA-Factory + Unsloth

Every training run generates a YAML recipe:

```yaml
# Auto-generated by Goose Studio
# Recipe: coding-assistant-qwen3-8b-qlora
model_name_or_path: Qwen/Qwen3-8B
stage: sft
do_train: true
finetuning_type: lora
lora_target: all
lora_rank: 16
lora_alpha: 32
lora_dropout: 0.05

# QLoRA settings
quantization_bit: 4
quantization_method: bitsandbytes

# Unsloth acceleration
use_unsloth: true

# Dataset
dataset: goose_studio_prepared
template: qwen
cutoff_len: 2048

# Training
num_train_epochs: 3
per_device_train_batch_size: 4
gradient_accumulation_steps: 4
learning_rate: 2.0e-4
lr_scheduler_type: cosine
warmup_ratio: 0.1
bf16: true

# Output
output_dir: /studio/output/coding-assistant-v1
logging_steps: 10
save_steps: 500

# Monitoring
report_to: tensorboard
```

### Training Failure Recovery (No Dead Ends)

| Failure | Agent Response |
|---------|---------------|
| OOM (out of VRAM) | Auto-reduce batch size → retry. If still OOM, switch to smaller model |
| CUDA error | Reset GPU, clear cache, retry. If persistent, switch to CPU offload |
| Loss explodes (NaN) | Reduce learning rate by half → retry from last checkpoint |
| Loss plateaus (not learning) | Increase learning rate or add more data → retry |
| Disk full | Move cache, clear old outputs, retry |
| Training hangs | Kill process, restart from last checkpoint |
| Model download fails | Retry with mirror, or suggest pre-downloading |
| Unsloth incompatible | Disable Unsloth, train standard (slower but works) |

**Key principle:** The agent ALWAYS recovers or finds an alternative. The user never sees a bare error message.

---

## 8. Tab 5: TEST — "Verify It Works"

### User-Facing UI

```
┌─────────────────────────────────────────────────────────────┐
│  ⑤ TEST                                                      │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Training Complete ✅  Adapter: coding-assistant-v1 (8.3MB)  │
│                                                               │
│  ┌─ Chat Test ───────────────┬─ Auto Eval ────────────────┐ │
│  │                            │                             │ │
│  │  You: How do I add a new  │  Benchmark Results          │ │
│  │  API route to this        │  ─────────────────          │ │
│  │  project?                 │                             │ │
│  │                            │  Code Quality:  92/100 ✅  │ │
│  │  Core: Based on this      │  Instruction     88/100 ✅  │ │
│  │  project's patterns in    │   Following:                │ │
│  │  src/routes/, you'd       │  Helpfulness:   85/100 ✅  │ │
│  │  create a new file...     │  Accuracy:      90/100 ✅  │ │
│  │  [shows detailed,         │  Consistency:   87/100 ✅  │ │
│  │   project-aware answer]   │                             │ │
│  │                            │  Overall:       88/100 ✅  │ │
│  │  ┌──────────────────────┐ │                             │ │
│  │  │ Type a question...   │ │  vs Base Model: +23 points │ │
│  │  └──────────────────────┘ │  Grade: ⭐⭐⭐⭐ Excellent  │ │
│  └────────────────────────────┴─────────────────────────────┘ │
│                                                               │
│  ┌─ Side-by-Side Comparison ───────────────────────────────┐ │
│  │  Base Model (no LoRA)    │  Your Core (with LoRA)       │ │
│  │  "To add an API route,   │  "In this project, routes    │ │
│  │  you typically create    │  live in src/routes/. Create  │ │
│  │  an endpoint handler..." │  notifications.ts following   │ │
│  │  (generic answer)        │  the pattern in users.ts..."  │ │
│  │                           │  (project-specific answer!)  │ │
│  └───────────────────────────┴─────────────────────────────┘ │
│                                                               │
│  [🔄 Retrain (adjust)]  [▶️ Next: Publish →]                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Automated Eval Pipeline

The agent runs multiple evaluation methods:

```
Evaluation Pipeline
━━━━━━━━━━━━━━━━━━

1. HELD-OUT TEST SET (10% of training data reserved)
   → Run model on unseen examples
   → Compare outputs to expected answers
   → Calculate BLEU, ROUGE, semantic similarity
   
2. BENCHMARK EVAL (standard tests)
   → HumanEval (coding)
   → MMLU subset (general knowledge)
   → GSM8K subset (reasoning)
   → IFEval (instruction following)
   → Compare LoRA vs base model

3. CHAT QUALITY (LLM-as-judge)
   → Generate 20 responses to diverse prompts
   → Another LLM rates helpfulness, accuracy, style
   → Produces quality score 0-100

4. VISION QA (if web project, uses GPU 2)
   → Vision model reviews the running app
   → Asks the Core questions about the UI
   → Verifies Core gives correct, specific answers

5. REGRESSION CHECK
   → Ensure LoRA didn't break base model capabilities
   → Test general knowledge still works
   → Test multi-language still works
```

### If Quality is Low

The agent doesn't just report failure — it fixes it:

```
Quality Score: 54/100 ⚠️ Below threshold (70)

Agent Analysis:
  "The Core is not learning the project-specific patterns
   well enough. This is likely because:
   
   1. Dataset has too many generic examples (42% generic)
   2. Training was only 1 epoch (underfitting)
   
   I recommend:
   ✅ Filtering dataset to remove generic pairs
   ✅ Increasing to 3 epochs
   ✅ Increasing LoRA rank from 8 to 16
   
   [🔧 Auto-Fix & Retrain] ← one click, agent handles it
   [✏️ Manual Adjustments]
   [⏭️ Accept Anyway]"
```

---

## 9. Tab 6: PUBLISH — "Package & Ship"

### User-Facing UI

```
┌─────────────────────────────────────────────────────────────┐
│  ⑥ PUBLISH                                                   │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  Quality Score: 88/100 ✅ Ready to publish!                  │
│                                                               │
│  ┌─ Core Details ──────────────────────────────────────────┐ │
│  │                                                          │ │
│  │  Name:  [React Dashboard Expert_________]                │ │
│  │  Desc:  [Specialized in React+TS dashboard patterns.    │ │
│  │          Trained on awesome-dashboard repo. Knows        │ │
│  │          Recharts, Redux, Prisma, tRPC patterns._____]  │ │
│  │                                                          │ │
│  │  Tags:  [react] [typescript] [dashboard] [coding]        │ │
│  │                                                          │ │
│  │  Icon:  [🎯] ← pick emoji or upload                     │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Validation Gates ─────────────────────────────────────┐  │
│  │  ✅ V1: Schema valid (manifest.json, adapter files)     │  │
│  │  ✅ V2: Security passed (no secrets, no malicious code) │  │
│  │  ✅ V3: Eval passed (88/100, above 70 threshold)        │  │
│  │  ✅ V4: Portable (works with base model on any GPU)     │  │
│  │  ✅ V5: Quality (consistent outputs, no degradation)    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Pricing ───────────────────────────────────────────────┐ │
│  │  ● Free (open source, anyone can use)                    │ │
│  │  ○ $4.99 (suggested by pricing engine)                   │ │
│  │  ○ Custom: $[___]                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Destination ───────────────────────────────────────────┐ │
│  │  ☑ Goose Marketplace                                     │ │
│  │  ☑ Save locally (G:\goose\studio\cores\)                 │ │
│  │  ☐ Upload to HuggingFace Hub                             │ │
│  │  ☐ Export as standalone GGUF                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  [ 🚀 PUBLISH CORE ]                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Core Package (.gcpkg) — Final Output

```
react-dashboard-expert-v1.gcpkg (12.4 MB)
├── manifest.json              # Core identity + metadata
│   {
│     "name": "React Dashboard Expert",
│     "version": "1.0.0",
│     "base_model": "Qwen/Qwen3-8B",
│     "method": "qlora-4bit",
│     "quality_score": 88,
│     "tags": ["react", "typescript", "dashboard"],
│     "created": "2026-02-11T23:45:00Z",
│     "hardware": { "trained_on": "RTX 3090 Ti" },
│     "compatible_vram_min_gb": 6
│   }
│
├── adapter/
│   ├── adapter_model.safetensors   # LoRA weights (8.3MB)
│   └── adapter_config.json         # PEFT configuration
│
├── training/
│   ├── recipe.yaml                 # LLaMA-Factory config (reproducible)
│   ├── training_log.jsonl          # Full training log
│   └── eval_results.json           # Benchmark scores
│
├── data/
│   ├── dataset_card.md             # What data was used (not the data)
│   └── sample_pairs.jsonl          # 10 example pairs for preview
│
├── README.md                       # Core description + usage
└── PROVENANCE.json                 # Full audit trail
    {
      "source": "github.com/user/awesome-dashboard",
      "commit": "a1b2c3d",
      "build_engine": "nixpacks",
      "training_duration_sec": 1680,
      "training_gpu": "NVIDIA RTX 3090 Ti",
      "dataset_pairs": 2847,
      "epochs": 3,
      "final_loss": 0.42,
      "unsloth": true
    }
```

---

## 10. Infrastructure: Docker Service Architecture

### docker-compose.studio.yml

```yaml
version: "3.8"

services:
  # ═══════════════════════════════════════════════
  # CORE: LLaMA-Factory Training Engine
  # ═══════════════════════════════════════════════
  llamafactory:
    image: hiyouga/llamafactory:latest
    container_name: goose-studio-train
    ports:
      - "7860:7860"   # LlamaBoard WebUI
      - "8000:8000"   # OpenAI-compatible API
    volumes:
      - ${GOOSE_HOME}/studio/data:/app/data
      - ${GOOSE_HOME}/studio/output:/app/output
      - ${GOOSE_HOME}/studio/recipes:/app/recipes
      - ${GOOSE_HOME}/studio/cache:/root/.cache/huggingface
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - GRADIO_SERVER_NAME=0.0.0.0
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["0"]    # RTX 3090 Ti
              capabilities: [gpu]
    restart: unless-stopped

  # ═══════════════════════════════════════════════
  # BUILD ENGINE: Nixpacks + Docker-in-Docker
  # ═══════════════════════════════════════════════
  builder:
    image: ghcr.io/railwayapp/nixpacks:latest
    container_name: goose-studio-builder
    volumes:
      - ${GOOSE_HOME}/studio/repos:/repos
      - ${GOOSE_HOME}/studio/builds:/builds
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock
    restart: unless-stopped

  # ═══════════════════════════════════════════════
  # SANDBOX: Running user projects
  # ═══════════════════════════════════════════════
  sandbox:
    build:
      context: ./docker/sandbox
    container_name: goose-studio-sandbox
    ports:
      - "3000-3010:3000-3010"   # App ports
      - "6080:6080"              # noVNC (desktop apps)
    volumes:
      - ${GOOSE_HOME}/studio/repos:/workspace
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped

  # ═══════════════════════════════════════════════
  # VISION: UI Navigation Agent
  # ═══════════════════════════════════════════════
  vision-agent:
    image: goose/vision-agent:latest
    container_name: goose-studio-vision
    ports:
      - "7870:7870"   # Vision agent API
    volumes:
      - ${GOOSE_HOME}/studio/screenshots:/screenshots
    environment:
      - CUDA_VISIBLE_DEVICES=1
      - MODEL=Qwen/Qwen2.5-VL-7B-Instruct
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["1"]    # RTX 3060 Ti
              capabilities: [gpu]
    restart: unless-stopped

  # ═══════════════════════════════════════════════
  # DATA PREP: Training data generation
  # ═══════════════════════════════════════════════
  data-agent:
    image: goose/data-agent:latest
    container_name: goose-studio-data
    ports:
      - "7871:7871"
    volumes:
      - ${GOOSE_HOME}/studio/data:/data
      - ${GOOSE_HOME}/studio/repos:/repos:ro
    restart: unless-stopped

  # ═══════════════════════════════════════════════
  # VALIDATOR: 5-Gate Core Validation
  # ═══════════════════════════════════════════════
  validator:
    image: goose/core-validator:latest
    container_name: goose-studio-validator
    ports:
      - "7872:7872"
    volumes:
      - ${GOOSE_HOME}/studio/output:/output:ro
      - ${GOOSE_HOME}/studio/cores:/cores
    restart: unless-stopped
```

### GPU Assignment

```
┌─────────────────────────────────────────────────────┐
│  GPU 0: RTX 3090 Ti (24GB)                           │
│  ├── Primary: LoRA Training (LLaMA-Factory)          │
│  ├── Secondary: Large model inference                │
│  └── Idle: Available for sandbox GPU tasks           │
│                                                       │
│  GPU 1: RTX 3060 Ti (12GB)                           │
│  ├── Primary: Vision Agent (Qwen2.5-VL-7B)          │
│  ├── Secondary: Chat testing inference               │
│  └── Idle: Available for second training job         │
│                                                       │
│  GPU 2+: Tesla P40 (24GB each, optional)             │
│  ├── Overflow training (multi-GPU)                   │
│  ├── Parallel inference                              │
│  └── Batch evaluation                                │
└─────────────────────────────────────────────────────┘
```

---

## 11. Agent Orchestration System

### Agent Roles

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT HIERARCHY                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  CONDUCTOR AGENT (orchestrates the entire pipeline)      │ │
│  │  - Monitors all tabs / all steps                         │ │
│  │  - Decides when to advance to next tab                   │ │
│  │  - Handles cross-step dependencies                       │ │
│  │  - Ensures "no dead ends" guarantee                      │ │
│  └──────────────────────┬──────────────────────────────────┘ │
│                          │                                    │
│  ┌───────┬───────┬───────┼───────┬───────┬───────┐          │
│  │       │       │       │       │       │       │          │
│  ▼       ▼       ▼       ▼       ▼       ▼       ▼          │
│ Source  Build  Prepare  Train   Test  Publish  Repair       │
│ Agent   Agent  Agent    Agent   Agent  Agent   Agent        │
│                                                               │
│ Fetches Nixpacks Generates Runs    Evals  Packages Fixes    │
│ models  builds   training  LLaMA-  quality validates any    │
│ datasets runs    data      Factory scores  .gcpkg   failure │
│ repos   sandbox            +Unsloth                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  VISION AGENT (sees and navigates running applications)  │ │
│  │  - Takes screenshots of preview                          │ │
│  │  - Clicks through UI, maps pages                         │ │
│  │  - Reports bugs and layout issues                        │ │
│  │  - Generates UI-specific training data                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Agent Communication Protocol

Agents communicate through a simple event bus:

```
Event: step.source.complete
  payload: { source_type: "github", repo: "user/repo", files: 127 }
  → triggers: Build Agent starts

Event: step.build.complete
  payload: { success: true, port: 3000, framework: "react" }
  → triggers: Vision Agent explores, Prepare Agent starts

Event: step.build.failed
  payload: { error: "npm install failed", exit_code: 1 }
  → triggers: Repair Agent activates

Event: step.prepare.complete
  payload: { pairs: 2847, quality: 87 }
  → triggers: Train tab becomes active

Event: step.train.progress
  payload: { step: 1764, total: 2847, loss: 0.42, eta_sec: 630 }
  → triggers: UI update (progress bar, loss curve)

Event: step.train.complete
  payload: { adapter_path: "/output/v1/", loss: 0.38 }
  → triggers: Test Agent starts evaluation

Event: step.test.complete
  payload: { score: 88, passed: true }
  → triggers: Publish tab becomes active

Event: step.test.failed
  payload: { score: 54, issues: ["underfitting", "generic data"] }
  → triggers: Repair Agent with auto-fix suggestions
```

---

## 12. Complete User Journey: Start to Finish

### Scenario: "I want a Core that knows React Dashboard development"

```
TIME    ACTION                                              TAB
─────   ───────────────────────────────────────────────     ────
0:00    User opens Studio                                   -
0:01    Clicks "GitHub" source                              ① SOURCE
0:02    Pastes: github.com/user/awesome-dashboard           ① SOURCE
0:05    Agent clones repo (2 sec), detects React+TS         ① SOURCE
        → Auto-advances to BUILD

0:06    Nixpacks detects Node.js 20, starts build           ② BUILD
0:15    npm install completes (347 packages)                ② BUILD
0:20    npm run dev → localhost:3000 live                   ② BUILD
0:21    Preview shows the running dashboard                 ② BUILD
0:22    Vision agent starts exploring (background)          ② BUILD
0:30    Code analysis complete: 127 files, 412 functions    ② BUILD
0:35    Vision agent mapped 12 pages, 34 components         ② BUILD
        → User clicks "Next"

0:36    Agent shows: "Auto-Generate recommended"            ③ PREPARE
0:37    User clicks "Auto-Generate"                         ③ PREPARE
1:00    Agent generates 2,847 training pairs                ③ PREPARE
1:01    Quality dashboard shows: 87/100                     ③ PREPARE
        → User clicks "Next"

1:02    Train tab pre-filled: Qwen3-8B, QLoRA, Turbo       ④ TRAIN
1:03    User clicks "START TRAINING"                        ④ TRAIN
1:05    Model downloading (if not cached)...                ④ TRAIN
1:10    Training begins, loss curve updating                ④ TRAIN
29:00   Training complete! Loss: 0.38                       ④ TRAIN
        → Auto-advances to TEST

29:01   Chat test window opens, auto-eval starts            ⑤ TEST
29:05   User chats: "How do I add a notification system?"   ⑤ TEST
29:06   Core responds with project-specific answer          ⑤ TEST
30:00   Auto-eval complete: 88/100                          ⑤ TEST
        → User clicks "Next"

30:01   Publish form pre-filled from repo metadata          ⑥ PUBLISH
30:02   5-gate validation: all pass ✅                      ⑥ PUBLISH
30:03   User sets price: Free                               ⑥ PUBLISH
30:04   User clicks "PUBLISH CORE"                          ⑥ PUBLISH
30:10   Core live on Marketplace! 🎉                        ⑥ PUBLISH

TOTAL TIME: ~30 minutes from paste URL to published Core
CLICKS: ~12 clicks total
ML KNOWLEDGE REQUIRED: Zero
```

---

## 13. Quick Recipe: One-Click Flows

For users who don't want to go through all tabs:

```
┌─────────────────────────────────────────────────────────────┐
│  Quick Recipes — One Click to Start                          │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🔥 Coding Assistant                                      ││
│  │ Qwen3-8B + HuggingFace code-feedback dataset             ││
│  │ QLoRA 4-bit + Unsloth │ ~15 min │ 6GB VRAM              ││
│  │ [Start →]                                                 ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ ✍️  Writing Style Clone                                   ││
│  │ LLaMA-3.3-8B + your writing samples (upload)            ││
│  │ QLoRA 4-bit + Unsloth │ ~20 min │ 6GB VRAM              ││
│  │ [Start →]                                                 ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🧠 Reasoning Boost                                       ││
│  │ GLM-4-9B + reasoning-chains dataset                      ││
│  │ QLoRA 4-bit + Unsloth │ ~25 min │ 7GB VRAM              ││
│  │ [Start →]                                                 ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🐙 Learn a GitHub Repo                                   ││
│  │ Paste URL → auto-build → auto-train → done              ││
│  │ Qwen3-8B + auto-generated data │ ~30 min │ 6GB VRAM     ││
│  │ [Paste URL: _______________] [Start →]                    ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 📊 Data & SQL Expert                                     ││
│  │ Qwen3-14B + sql-create-context dataset                   ││
│  │ QLoRA 4-bit + Unsloth │ ~35 min │ 10GB VRAM             ││
│  │ [Start →]                                                 ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🎮 Game Dev Specialist                                    ││
│  │ DeepSeek-Coder-8B + game programming datasets            ││
│  │ QLoRA 4-bit + Unsloth │ ~20 min │ 6GB VRAM              ││
│  │ [Start →]                                                 ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  Quick recipes auto-configure ALL tabs. You can still        │
│  review and adjust at any step before training starts.        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Build Engine** | Nixpacks (by Railway) | Auto-detect, auto-build any repo |
| **Training Engine** | LLaMA-Factory + Unsloth | LoRA/QLoRA fine-tuning |
| **Training UI** | LlamaBoard (embedded) | Training configuration WebUI |
| **Vision Agent** | Qwen2.5-VL-7B / ShowUI-2B | See and navigate running apps |
| **Code Indexer** | tree-sitter + custom | Parse and map codebases |
| **Data Generator** | Custom Python pipeline | Auto-generate training pairs from code |
| **Sandbox** | Docker + noVNC | Isolated build/run environment |
| **Model Registry** | HuggingFace Hub API | Download models and datasets |
| **Eval Engine** | lm-eval-harness + custom | Benchmark and quality scoring |
| **Packaging** | Custom .gcpkg builder | Core packaging and validation |
| **Orchestration** | Python + Redis event bus | Agent communication |
| **Frontend** | Electron WebView (in Goose) | Studio tab UI |
| **GPU Management** | NVIDIA Container Toolkit | GPU assignment per service |

### Open Source Dependencies

Every component is open source:

| Component | License | Repository |
|-----------|---------|-----------|
| Nixpacks | MIT | github.com/railwayapp/nixpacks |
| LLaMA-Factory | Apache 2.0 | github.com/hiyouga/LLaMA-Factory |
| Unsloth | Apache 2.0 | github.com/unslothai/unsloth |
| tree-sitter | MIT | github.com/tree-sitter/tree-sitter |
| ShowUI | MIT | github.com/showlab/ShowUI |
| Qwen2.5-VL | Apache 2.0 | huggingface.co/Qwen/Qwen2.5-VL-7B |
| lm-eval-harness | MIT | github.com/EleutherAI/lm-evaluation-harness |
| noVNC | MPL 2.0 | github.com/novnc/noVNC |
| Docker | Apache 2.0 | github.com/moby/moby |

---

## 15. File System Layout

```
G:\goose\
├── studio/                              # ← NEW: Studio workspace
│   ├── repos/                           # Cloned GitHub repositories
│   │   └── {repo-name}/
│   │       ├── .git/
│   │       ├── src/
│   │       ├── nixpacks.toml            # Auto-generated if needed
│   │       └── .studio-index.json       # Code analysis cache
│   │
│   ├── builds/                          # Nixpacks build outputs
│   │   └── {repo-name}/
│   │       ├── Dockerfile               # Generated by Nixpacks
│   │       └── .nixpacks-plan.json      # Build plan
│   │
│   ├── data/                            # Training datasets
│   │   ├── prepared/                    # Ready-to-train JSONL
│   │   │   └── {dataset-name}.jsonl
│   │   ├── raw/                         # User uploads before processing
│   │   ├── generated/                   # Agent-generated from code
│   │   └── curated/                     # HuggingFace downloaded
│   │
│   ├── output/                          # Training outputs
│   │   └── {experiment-name}/
│   │       ├── adapter_model.safetensors
│   │       ├── adapter_config.json
│   │       ├── training_args.yaml
│   │       ├── trainer_log.jsonl
│   │       └── eval_results.json
│   │
│   ├── recipes/                         # Reusable YAML configs
│   │   ├── quick-coding-8b.yaml
│   │   ├── quick-writing-8b.yaml
│   │   ├── quick-reasoning-9b.yaml
│   │   └── custom/
│   │
│   ├── cores/                           # Packaged .gcpkg files
│   │   └── react-dashboard-expert-v1.gcpkg
│   │
│   ├── screenshots/                     # Vision agent captures
│   │   └── {repo-name}/
│   │       ├── page-home.png
│   │       ├── page-login.png
│   │       └── exploration-report.json
│   │
│   ├── cache/                           # HuggingFace model cache
│   │   └── huggingface/
│   │
│   ├── docker-compose.studio.yml        # Studio services
│   └── studio-config.json               # Studio settings
│
├── docs/
│   └── GOOSE_STUDIO_PIPELINE_ARCHITECTURE.md  # This document
```

---

## 16. Implementation Roadmap

### Phase 1: Core Pipeline (Weeks 1-3)

**Goal:** Tab 1 (SOURCE) + Tab 4 (TRAIN) + Tab 6 (PUBLISH) working end-to-end.

- [ ] Studio tab in Goose sidebar with 6 sub-tabs
- [ ] HuggingFace model/dataset browser + downloader
- [ ] LLaMA-Factory Docker service with GPU passthrough
- [ ] Training configuration UI (model selector, presets)
- [ ] Training progress display (loss curve, ETA, GPU stats)
- [ ] .gcpkg packaging from trained adapters
- [ ] Quick Recipes: Coding Assistant, Writing Style
- [ ] Basic error recovery (OOM → reduce batch size)

### Phase 2: Build Engine (Weeks 4-5)

**Goal:** Tab 2 (BUILD) with Nixpacks + live preview.

- [ ] GitHub repo clone + Nixpacks auto-detection
- [ ] Docker sandbox for running built projects
- [ ] Live preview WebView in Studio
- [ ] Code indexer (tree-sitter based)
- [ ] Port forwarding for preview
- [ ] noVNC fallback for desktop applications
- [ ] Build failure recovery agents

### Phase 3: Data Generation (Weeks 6-7)

**Goal:** Tab 3 (PREPARE) with auto-generation pipeline.

- [ ] Auto-generate training pairs from code analysis
- [ ] 6-category generation (explain, generate, debug, arch, test, UI)
- [ ] Dataset quality scoring
- [ ] Manual editing / upload support
- [ ] Data preview and filtering UI
- [ ] HuggingFace dataset download + reformatting

### Phase 4: Testing & Vision (Weeks 8-10)

**Goal:** Tab 5 (TEST) with full evaluation + vision agent.

- [ ] Chat test interface (side-by-side comparison)
- [ ] Automated benchmark evaluation
- [ ] Vision agent (ShowUI / Qwen2.5-VL) integration
- [ ] UI exploration and screenshot mapping
- [ ] Quality-based auto-fix suggestions
- [ ] Regression testing

### Phase 5: Polish & Agent Orchestration (Weeks 11-12)

**Goal:** Full "no dead ends" guarantee across all paths.

- [ ] Conductor agent (cross-tab orchestration)
- [ ] Repair agent (automatic failure recovery)
- [ ] Fallback agent (alternative paths)
- [ ] Guide agent (plain-English explanations)
- [ ] End-to-end integration testing
- [ ] Performance optimization
- [ ] Documentation and video tutorials

---

## 17. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time from URL paste to published Core | < 45 minutes | End-to-end timer |
| User clicks to complete pipeline | < 15 clicks | UI analytics |
| Dead end rate (user gets stuck) | 0% | Error tracking |
| Build success rate (Nixpacks) | > 85% | Build logs |
| Training success rate | > 95% | Training logs |
| Quality score of produced Cores | > 70/100 avg | Eval pipeline |
| User needs to read docs | Never | User testing |
| User needs ML knowledge | Never | User testing |

---

## Appendix A: Supported Model Matrix (RTX 3090 Ti)

| Model | Parameters | QLoRA VRAM | Train Time (2K pairs) | Recommended For |
|-------|-----------|------------|----------------------|-----------------|
| Qwen3-8B | 8B | ~6GB | ~15 min | General, coding |
| GLM-4-9B-0414 | 9B | ~7GB | ~18 min | Coding, Chinese |
| LLaMA-3.3-8B-Instruct | 8B | ~6GB | ~15 min | English, writing |
| DeepSeek-Coder-V2-Lite | 7B | ~6GB | ~14 min | Coding specialist |
| Mistral-7B-v0.3 | 7B | ~6GB | ~14 min | European languages |
| Phi-4-14B | 14B | ~10GB | ~30 min | Compact quality |
| Qwen3-14B | 14B | ~10GB | ~30 min | Higher quality |
| Qwen3-30B-A3B | 30B (3B active) | ~18GB | ~40 min | MoE efficiency |
| GLM-4-32B-0414 | 32B | ~20GB | ~2 hr | Maximum quality |

## Appendix B: Nixpacks Language Detection

| Language | Detection Files | Auto-Install | Auto-Start |
|----------|----------------|-------------|------------|
| Node.js | package.json | npm install | npm start |
| Python | requirements.txt, Pipfile, pyproject.toml | pip install | python/gunicorn |
| Go | go.mod | go build | ./binary |
| Rust | Cargo.toml | cargo build | ./target/release/binary |
| Ruby | Gemfile | bundle install | rails s / ruby app.rb |
| Java | pom.xml, build.gradle | mvn package / gradle build | java -jar |
| PHP | composer.json | composer install | php artisan serve |
| C# | *.csproj | dotnet restore | dotnet run |
| Elixir | mix.exs | mix deps.get | mix phx.server |
| Crystal | shard.yml | shards install | crystal run |
| Dart | pubspec.yaml | dart pub get | dart run |
| Deno | deno.json | (auto) | deno run |
| F# | *.fsproj | dotnet restore | dotnet run |
| Haskell | stack.yaml | stack build | stack exec |
| Scala | build.sbt | sbt compile | sbt run |
| Swift | Package.swift | swift build | swift run |
| Zig | build.zig | zig build | ./zig-out/bin/* |
| Clojure | project.clj | lein deps | lein run |
| Cobol | *.cbl | (custom) | (custom) |
| Static HTML | index.html | (none) | nginx/caddy |

---

*End of Architecture Document*
*"Every Path Leads to a Working Core"*
