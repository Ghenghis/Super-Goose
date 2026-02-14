# OpenClaw × Super-Goose Integration Plan

## Overview

This document maps 25 OpenClaw ecosystem repositories to Super-Goose's agentic pipeline, defining integration strategies, effort estimates, and a phased roadmap.

**Pipeline Stages**: PLAN → TEAM → EXECUTE → EVOLVE → REVIEW → OBSERVE

**ALMAS Agent Team**: Architect → Developer → QA → Security → Deploy

---

## Tier Classification

| Tier | Count | Strategy | Priority |
|------|-------|----------|----------|
| **T1 — Critical** | 6 | Deep Merge / Absorb Pattern / Integrate | Immediate |
| **T2 — High Value** | 10 | Integrate / Absorb Pattern / Harvest | Next Release |
| **T3 — Reference** | 9 | Reference / Skip | Future / Archive |

---

## T1 Critical Repos (Phase 1–2)

### 1. nearai/ironclaw ⭐623 — Rust — DEEP MERGE

**What**: Rust rewrite of OpenClaw by Illia Polosukhin (NEAR co-founder, "Attention Is All You Need" co-author). WASM sandboxed tools, hybrid FTS+vector search, identity files, MCP protocol.

**Integration Strategy**: Extract crates directly into Super-Goose workspace.

| Extract | Target | Effort |
|---------|--------|--------|
| WASM sandbox crate | Replace microsandbox for tool isolation | Medium |
| Hybrid search (RRF) | Enhance ExperienceStore with FTS+vector fusion | Medium |
| Identity file pattern | ALMAS agent persona definitions | Low |
| Credential protection | Extend guardrails system | Low |

**Risk**: Requires PostgreSQL+pgvector (Super-Goose uses SQLite). Need storage abstraction layer.

---

### 2. snarktank/antfarm ⭐904 — TypeScript — ABSORB PATTERN

**What**: One-command multi-agent teams. YAML-defined workflows with 5-agent pipeline: planner → developer → verifier → tester → reviewer.

**Integration Strategy**: Reimplement patterns in Rust, map to ALMAS roles.

| antfarm Role | ALMAS Agent | Notes |
|-------------|-------------|-------|
| planner | Architect | Task decomposition |
| developer | Developer | Code generation |
| verifier | QA | Implementation validation |
| tester | QA | Test execution |
| reviewer | Security | Code review |

**Key Patterns to Port**:
- YAML workflow schema → Rust YAML loader in goose-server
- Fresh context per step (prevents hallucination drift)
- Automatic retry with feedback loops
- Human escalation gates
- Story-based task decomposition

**Risk**: TypeScript CLI — reimplement in Rust, no JS runtime dependency.

---

### 3. archestra-ai/archestra ⭐1.2K+ — Go/TypeScript — INTEGRATE

**What**: Enterprise MCP registry, gateway & orchestrator. $3.3M funded. Per-team cost monitoring, prompt injection defense, RBAC, OpenTelemetry.

**Integration Strategy**: Docker sidecar alongside Super-Goose.

```yaml
# docker-compose addition
archestra:
  image: archestra/gateway:latest
  ports: ["9000:9000"]
  environment:
    - GOOSE_MCP_URL=http://goose:3001
```

**What it provides**:
- MCP server registry with versioning
- Security gateway for all agent-to-tool calls
- Per-agent/team cost monitoring & limits
- RBAC with granular permissions
- OpenTelemetry traces + Prometheus metrics

**Risk**: Kubernetes-native — needs Docker Compose adaptation. Enterprise features may require paid tier.

---

### 4. NevaMind-AI/memU ⭐~200 — TypeScript — ABSORB PATTERN

**What**: 24/7 proactive memory for agents. Episodic + persistent storage, cross-session recall, proactive memory surfacing.

**Integration Strategy**: Port memory model to Rust, extend ExperienceStore.

| Pattern | Super-Goose Target | Impact |
|---------|-------------------|--------|
| Episodic memory | Extend ExperienceStore SQLite schema | Session narratives |
| Proactive recall | Agent::reply() pre-task context surfacing | Better context |
| Memory decay scoring | ExperienceStore relevance weighting | Cleaner memory |

**Risk**: Low — pattern extraction only, no runtime dependency.

---

### 5. RyanLisse/engram ⭐~150 — TypeScript — ABSORB PATTERN

**What**: Unified multi-agent shared memory. Local-first, conflict resolution for concurrent writes.

**Integration Strategy**: Design shared memory schema in SQLite.

```sql
-- Proposed schema extension
CREATE TABLE team_memories (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,      -- 'shared' or agent-specific
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by TEXT NOT NULL,     -- agent ID
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP,
  UNIQUE(namespace, key)
);
```

**Critical Gap Filled**: Currently Super-Goose memory is per-agent. Shared memory lets Architect's plan be visible to Developer, QA sees test results across all agents.

**Risk**: Low — need careful concurrency handling in Rust (Mutex/RwLock).

---

### 6. lunarpulse/openclaw-mcp-plugin ⭐~50 — TypeScript — INTEGRATE

**What**: MCP bridge plugin enabling OpenClaw↔Goose bidirectional communication.

**Integration Strategy**: Deploy as bundled MCP extension.

```json
// bundled-extensions.json addition
{
  "name": "openclaw-bridge",
  "type": "streamable_http",
  "url": "http://localhost:8100/mcp",
  "description": "OpenClaw ecosystem bridge"
}
```

**Risk**: Bridge stability — needs robust error handling and timeout management.

---

## T2 High Value Repos (Phase 2–3)

| # | Repo | Stars | Strategy | Integration |
|---|------|-------|----------|-------------|
| 7 | VoltAgent/awesome-openclaw-skills | 3K+ | HARVEST | Cherry-pick coding/security skills as MCP tools |
| 8 | cliffhall/GooseTeam | 36 | INTEGRATE | Multi-agent MCP server for team coordination |
| 9 | rinadelph/Agent-MCP | ~300 | ABSORB PATTERN | Scoped context + task dependency DAG |
| 10 | BlockRunAI/ClawRouter | ~100 | INTEGRATE | LLM cost optimizer as Docker sidecar |
| 11 | zilliztech/memsearch | ~200 | INTEGRATE | Vector search memory via MCP |
| 12 | grp06/openclaw-studio | ~80 | ABSORB UI | Dashboard patterns for Agent Panel |
| 13 | abhi1693/openclaw-mission-control | ~60 | ABSORB UI | RBAC + audit trail patterns |
| 14 | centminmod/explain-openclaw | ~100 | HARVEST | Security audit methodology |
| 15 | prompt-security/clawsec | ~80 | HARVEST | Security scanning MCP tools |
| 16 | freema/openclaw-mcp | ~40 | INTEGRATE | OAuth LLM authentication bridge |

---

## T3 Reference/Skip Repos

| # | Repo | Strategy | Notes |
|---|------|----------|-------|
| 17 | openclaw/openclaw | BRIDGE TARGET | Core platform — bidirectional bridge via #6 |
| 18 | ComposioHQ/secure-openclaw | REFERENCE | Sandboxing patterns |
| 19 | kriskimmerle/secure-openclaw-patterns | REFERENCE | Threat model templates |
| 20 | HKUDS/nanobot | OPTIONAL | Lightweight Python sub-agent |
| 21 | qwibitai/nanoclaw | REFERENCE | Container isolation patterns |
| 22 | BankrBot/openclaw-skills | SKIP | Blockchain-specific |
| 23 | Virtual-Protocol/openclaw-acp | SKIP | On-chain agent commerce |
| 24 | sipeed/picoclaw | SKIP | Edge device — wrong target |
| 25 | clawd800/pumpclaw | SKIP | Token launcher — irrelevant |

---

## 4-Phase Integration Roadmap

### Phase 1: Foundation (Week 1–2)
**Goal**: Team coordination + shared memory

| Task | Source | Target |
|------|--------|--------|
| Port antfarm workflow schema | snarktank/antfarm | goose-server YAML loader |
| Implement shared memory | RyanLisse/engram | SQLite team_memories table |
| Deploy GooseTeam MCP | cliffhall/GooseTeam | bundled-extensions.json |
| Map ALMAS roles | antfarm 5-agent model | Agent personas |

### Phase 2: Execution (Week 3–4)
**Goal**: Sandboxed execution + MCP bridge

| Task | Source | Target |
|------|--------|--------|
| Extract WASM sandbox | nearai/ironclaw | New goose crate |
| Deploy OpenClaw bridge | lunarpulse/openclaw-mcp-plugin | MCP extension |
| Port hybrid search | nearai/ironclaw | ExperienceStore upgrade |
| Add identity files | nearai/ironclaw | ALMAS agent personas |

### Phase 3: Security (Week 5–6)
**Goal**: Enterprise governance layer

| Task | Source | Target |
|------|--------|--------|
| Deploy Archestra gateway | archestra-ai/archestra | Docker sidecar |
| Integrate clawsec scanning | prompt-security/clawsec | MCP security tools |
| Add RBAC patterns | openclaw-mission-control | Policy engine |
| Adopt audit trail | openclaw-mission-control | TimeWarp enrichment |

### Phase 4: Memory + Observability (Week 7–8)
**Goal**: Enhanced memory + cost optimization

| Task | Source | Target |
|------|--------|--------|
| Port episodic memory | NevaMind-AI/memU | ExperienceStore extension |
| Deploy memsearch | zilliztech/memsearch | MCP vector search |
| Deploy ClawRouter | BlockRunAI/ClawRouter | LLM cost optimizer |
| Dashboard patterns | openclaw-studio | Agent Panel UI |

---

## Docker Compose Additions

```yaml
services:
  gooseteam:
    image: node:20-alpine
    command: npx goose-team
    ports: ["3001:3001"]
    volumes:
      - gooseteam-data:/data

  openclaw-bridge:
    image: node:20-alpine
    command: npx openclaw-mcp-plugin
    ports: ["8100:8100"]
    environment:
      - GOOSE_URL=http://goose:3000

  archestra:
    image: archestra/gateway:latest
    ports: ["9000:9000"]
    environment:
      - REGISTRY_URL=http://goose:3000/mcp

  memsearch:
    image: zilliztech/memsearch:latest
    ports: ["8200:8200"]
    volumes:
      - memsearch-data:/data

  clawrouter:
    image: blockrunai/clawrouter:latest
    ports: ["8300:8300"]
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}

volumes:
  gooseteam-data:
  memsearch-data:
```

---

## Pipeline Stage → Repo Mapping

```
PLAN     ─── LangGraph, Goose CoreSelector
  │
TEAM     ─── GooseTeam (#8), antfarm (#2), engram (#5)
  │
EXECUTE  ─── ironclaw WASM (#1), openclaw-mcp-plugin (#6), awesome-skills (#7)
  │
EVOLVE   ─── memU (#4), memsearch (#11), Mem0ᵍ, DSPy
  │
REVIEW   ─── Archestra (#3), clawsec (#15), explain-openclaw (#14)
  │
OBSERVE  ─── ClawRouter (#10), openclaw-studio (#12), mission-control (#13)
```

---

## Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| Malicious OpenClaw skills | HIGH | Security audit all skills before adoption; route through Archestra gateway |
| PostgreSQL dependency (ironclaw) | MEDIUM | Abstract storage layer; keep SQLite as default, PG optional |
| Kubernetes dependency (Archestra) | MEDIUM | Docker Compose adaptation; local dev mode |
| Bridge latency (ClawRouter) | MEDIUM | Benchmark against direct calls; optional bypass |
| TypeScript runtime dependencies | LOW | Reimplement patterns in Rust; no JS runtime in core |
| Concurrent memory writes | LOW | Rust Mutex/RwLock; SQLite WAL mode |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Multi-agent task completion rate | >85% (vs single-agent baseline) |
| Cross-agent memory recall accuracy | >90% relevant context surfaced |
| LLM cost reduction via routing | >50% savings on routine tasks |
| Security scan coverage | 100% of tool calls through gateway |
| Pipeline stage transition time | <2s per stage |

---

*Generated 2026-02-14 for Super-Goose v1.24.06+*
