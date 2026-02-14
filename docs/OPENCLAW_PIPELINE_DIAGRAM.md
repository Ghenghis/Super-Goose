# OpenClaw × Super-Goose Pipeline Diagrams

## Full Pipeline Architecture

```mermaid
graph TB
    subgraph PLAN["📋 PLAN — Task Decomposition"]
        CS[CoreSelector] --> LG[LangGraph]
        CS --> WF[WorkflowCore YAML]
    end

    subgraph TEAM["👥 TEAM — ALMAS Agent Assignment"]
        GT[GooseTeam MCP] --> AF[antfarm Patterns]
        AF --> EG[engram Shared Memory]
        GT --> ARCH[Architect 🏗️]
        GT --> DEV[Developer 💻]
        GT --> QA[QA ✅]
        GT --> SEC[Security 🛡️]
        GT --> DEP[Deploy 🚀]
    end

    subgraph EXECUTE["⚡ EXECUTE — Sandboxed Execution"]
        IC[ironclaw WASM Sandbox] --> MCP_B[openclaw-mcp-plugin Bridge]
        MCP_B --> SKILLS[awesome-openclaw-skills]
        IC --> TOOLS[MCP Tool Calls]
    end

    subgraph EVOLVE["🧬 EVOLVE — Memory & Learning"]
        MU[memU Episodic Memory] --> ES[ExperienceStore]
        MS[memsearch Vector Search] --> ES
        ES --> SL[SkillLibrary]
        ES --> RF[Reflexion]
    end

    subgraph REVIEW["🔍 REVIEW — Security & Quality"]
        AG[Archestra Gateway] --> CW[clawsec Scanning]
        CW --> AC[AdversarialCore Coach]
        AC --> PI[Prompt Injection Defense]
    end

    subgraph OBSERVE["📊 OBSERVE — Monitoring"]
        CR[ClawRouter Cost Optimizer] --> LF[Langfuse Traces]
        OS[openclaw-studio Patterns] --> AP[Agent Panel UI]
        MC[mission-control RBAC] --> TW[TimeWarp Events]
    end

    PLAN --> TEAM
    TEAM --> EXECUTE
    EXECUTE --> EVOLVE
    EVOLVE --> REVIEW
    REVIEW --> OBSERVE
    OBSERVE -.->|Feedback Loop| PLAN

    style PLAN fill:#38BDF8,color:#000
    style TEAM fill:#818CF8,color:#000
    style EXECUTE fill:#FBBF24,color:#000
    style EVOLVE fill:#A78BFA,color:#000
    style REVIEW fill:#F472B6,color:#000
    style OBSERVE fill:#34D399,color:#000
```

## ALMAS Agent Team Architecture

```mermaid
graph LR
    subgraph TeamCoordination["GooseTeam MCP Server"]
        REG[Agent Registry]
        TASKS[Task Manager]
        MSG[Message Bus]
    end

    subgraph Agents["ALMAS Team"]
        A["🏗️ Architect<br/>Plans + Decomposes"]
        D["💻 Developer<br/>Implements + Integrates"]
        Q["✅ QA<br/>Tests + Validates"]
        S["🛡️ Security<br/>Audits + Scans"]
        P["🚀 Deploy<br/>Ships + Monitors"]
    end

    subgraph SharedMemory["engram Shared Memory"]
        SM_PLAN[Plan Context]
        SM_CODE[Code Artifacts]
        SM_TEST[Test Results]
        SM_AUDIT[Audit Findings]
    end

    REG --> A & D & Q & S & P
    A -->|Architecture Decision| SM_PLAN
    D -->|Code Change| SM_CODE
    Q -->|Test Report| SM_TEST
    S -->|Audit Report| SM_AUDIT
    SM_PLAN --> D
    SM_CODE --> Q
    SM_TEST --> S
    SM_AUDIT --> P

    TASKS --> A
    A --> TASKS
    MSG -.-> A & D & Q & S & P

    style TeamCoordination fill:#7C3AED,color:#fff
    style Agents fill:#FBBF24,color:#000
    style SharedMemory fill:#10B981,color:#000
```

## Integration Tiers

```mermaid
graph TD
    subgraph T1["T1 — Critical (6 repos)"]
        IC1[ironclaw<br/>Rust DEEP MERGE]
        AF1[antfarm<br/>TS ABSORB PATTERN]
        AR1[archestra<br/>Go INTEGRATE]
        MU1[memU<br/>TS ABSORB PATTERN]
        EG1[engram<br/>TS ABSORB PATTERN]
        MCP1[openclaw-mcp-plugin<br/>TS INTEGRATE]
    end

    subgraph T2["T2 — High Value (10 repos)"]
        SK2[awesome-skills<br/>HARVEST]
        GT2[GooseTeam<br/>INTEGRATE]
        AM2[Agent-MCP<br/>ABSORB]
        CR2[ClawRouter<br/>INTEGRATE]
        MS2[memsearch<br/>INTEGRATE]
        OS2[openclaw-studio<br/>ABSORB UI]
        MC2[mission-control<br/>ABSORB UI]
        EX2[explain-openclaw<br/>HARVEST]
        CS2[clawsec<br/>HARVEST]
        FM2[openclaw-mcp<br/>INTEGRATE]
    end

    subgraph T3["T3 — Reference/Skip (9 repos)"]
        OC3[openclaw core<br/>BRIDGE]
        SC3[secure-openclaw<br/>REF]
        SP3[secure-patterns<br/>REF]
        NB3[nanobot<br/>OPT]
        NC3[nanoclaw<br/>REF]
        BS3[openclaw-skills<br/>SKIP]
        VP3[openclaw-acp<br/>SKIP]
        PC3[picoclaw<br/>SKIP]
        PM3[pumpclaw<br/>SKIP]
    end

    T1 -->|Phase 1-2| T2
    T2 -->|Phase 3-4| T3

    style T1 fill:#FF6B35,color:#fff
    style T2 fill:#F59E0B,color:#000
    style T3 fill:#6B7280,color:#fff
```

## 4-Phase Roadmap

```mermaid
gantt
    title OpenClaw Integration Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Foundation
        antfarm workflow schema    :p1a, 2026-02-17, 7d
        engram shared memory       :p1b, 2026-02-17, 7d
        GooseTeam MCP deploy       :p1c, 2026-02-17, 5d
        ALMAS role mapping         :p1d, 2026-02-20, 4d
    section Phase 2: Execution
        ironclaw WASM extract      :p2a, 2026-03-03, 10d
        openclaw-mcp-plugin deploy :p2b, 2026-03-03, 5d
        Hybrid search port         :p2c, 2026-03-06, 7d
        Identity file system       :p2d, 2026-03-10, 4d
    section Phase 3: Security
        Archestra gateway deploy   :p3a, 2026-03-17, 7d
        clawsec scanning           :p3b, 2026-03-17, 5d
        RBAC patterns              :p3c, 2026-03-20, 5d
        Audit trail integration    :p3d, 2026-03-24, 3d
    section Phase 4: Memory+Observe
        memU episodic memory       :p4a, 2026-03-31, 7d
        memsearch vector deploy    :p4b, 2026-03-31, 5d
        ClawRouter cost optimizer  :p4c, 2026-04-03, 5d
        Dashboard UI patterns      :p4d, 2026-04-07, 3d
```

## Docker Compose Architecture

```mermaid
graph TB
    subgraph Host["Host Machine"]
        SG["Super-Goose<br/>:3000<br/>(Rust + Electron)"]
    end

    subgraph Sidecars["Docker Sidecars"]
        GT["GooseTeam<br/>:3001<br/>(Node.js MCP)"]
        OB["openclaw-bridge<br/>:8100<br/>(MCP Plugin)"]
        AR["Archestra<br/>:9000<br/>(Go Gateway)"]
        MS["memsearch<br/>:8200<br/>(Python Vector)"]
        CR["ClawRouter<br/>:8300<br/>(TS Router)"]
    end

    SG <-->|MCP| GT
    SG <-->|MCP| OB
    SG -->|Tool Calls| AR
    AR -->|Scanned| OB
    SG <-->|Vector Search| MS
    SG -->|LLM Routing| CR
    CR -->|Anthropic/OpenAI/Ollama| LLM["LLM Providers"]

    style Host fill:#FF6B35,color:#fff
    style Sidecars fill:#38BDF8,color:#000
```

---

*Diagrams for Super-Goose v1.24.06+ OpenClaw integration planning*
