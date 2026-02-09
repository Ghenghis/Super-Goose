## Super-Goose: Release-Readiness & Completeness Audit Framework

**Version:** 2.0 — Ultra-Strict, 20-Pass, Bidirectional Traceability  
**Scope:** Multi-Agent Orchestration System (Super-Goose)  
**Audit Style:** Fagan Inspection + Traceability Matrix + SRE Production Readiness  
**Owner Handle:** ShadowByte  
**Last Updated:** 2026-02-09

## Table of Contents 

1.  [Purpose & Philosophy](#1-purpose--philosophy)
2.  [Audit Terminology Reference](#2-audit-terminology-reference)
3.  [Core Methodology: Bidirectional Traceability](#3-core-methodology-bidirectional-traceability)
4.  [The 20-Pass Audit System](#4-the-20-pass-audit-system)
    *   [Phase A: Structural Discovery (Passes 1–4)](#phase-a-structural-discovery-passes-14)
    *   [Phase B: Data & State Integrity (Passes 5–8)](#phase-b-data--state-integrity-passes-58)
    *   [Phase C: Evidence & Proof (Passes 9–12)](#phase-c-evidence--proof-passes-912)
    *   [Phase D: Security & Dependency Health (Passes 13–14)](#phase-d-security--dependency-health-passes-1314)
    *   [Phase E: Performance & Operations (Passes 15–16)](#phase-e-performance--operations-passes-1516)
    *   [Phase F: Documentation & Lifecycle (Passes 17–19)](#phase-f-documentation--lifecycle-passes-1719)
    *   [Phase G: Release Gate (Pass 20)](#phase-g-release-gate-pass-20)
5.  [Super-Goose Agent-Specific Audit Modules](#5-super-goose-agent-specific-audit-modules)
6.  [Specialized Auditor Agent Roles](#6-specialized-auditor-agent-roles)
7.  [Hidden Gaps Detection System](#7-hidden-gaps-detection-system)
8.  [Defect Log Format (Fagan-Style)](#8-defect-log-format-fagan-style)
9.  [Feature Verification Matrix Template](#9-feature-verification-matrix-template)
10.  [Go/No-Go Decision Framework](#10-gono-go-decision-framework)
11.  [Master Audit Prompts (Copy/Paste Ready)](#11-master-audit-prompts-copypaste-ready)
12.  [Appendix A: Strictness Enforcement Phrases](#appendix-a-strictness-enforcement-phrases)
13.  [Appendix B: Anti-Pattern Detection Keywords](#appendix-b-anti-pattern-detection-keywords)
14.  [Appendix C: Audit Pass Dependency Graph](#appendix-c-audit-pass-dependency-graph)

## 1\. Purpose & Philosophy

This document defines a **20-pass, multi-phase audit framework** for proving that Super-Goose — a multi-agent orchestration system — is feature-complete, correctly wired, production-safe, and release-ready.

### Why 20 Passes Instead of 8

The original 8-pass audit framework covers **structural completeness** — proving every feature exists and is wired. That catches roughly 60% of production-blocking issues. The remaining 40% live in:

*   **Data corruption paths** that only appear under partial failures
*   **Race conditions** between concurrent agents
*   **API contract breaks** that silently produce wrong results
*   **Configuration drift** between environments
*   **Memory leaks and resource exhaustion** under sustained load
*   **Upgrade paths** that destroy user state
*   **Documentation lies** — docs that say one thing while code does another
*   **Rollback impossibility** — deploying something you can't undo

This framework catches all of it.

### Core Principles

1.  **No credit without evidence.** Every claim of "this works" requires file paths, line numbers, test names, or runtime reproduction steps.
2.  **Bidirectional traceability.** Every feature maps to code AND every piece of code maps to a feature. Unmapped items are defects.
3.  **Assume broken until proven working.** Default status is `NOT VERIFIED`. Only evidence moves it to `PASS`.
4.  **Agent-aware auditing.** Super-Goose is a multi-agent system. Standard single-service audits miss agent lifecycle, communication, isolation, and orchestration failure modes.
5.  **Hidden gap hunting.** Explicitly search for TODO, FIXME, HACK, dead code, unreachable states, unused exports, and commented-out handlers. These are high-risk incomplete work.

## 2\. Audit Terminology Reference

### Release Readiness Categories

| Term | What It Proves |
| --- | --- |
| **Release Readiness Review (RRR)** | The product meets all exit criteria for shipping |
| **Production Readiness Review (PRR)** | The system is operationally safe for production traffic |
| **Go/No-Go Review** | Binary decision: ship or block, with explicit blocking reasons |
| **Definition of Done (DoD) Validation** | Every acceptance criterion on every feature is met |
| **Exit Criteria Verification** | All gates (build, test, security, docs, packaging) pass |

### Completeness Categories

| Term | What It Proves |
| --- | --- |
| **Functional Completeness Audit** | Every specified feature exists and produces correct output |
| **Feature Verification Matrix** | Structured mapping: feature → UI → API → handler → data → tests |
| **Acceptance Test Validation** | User-facing scenarios pass from the user's perspective |
| **Regression Test Pass** | Previously working features still work after changes |
| **Smoke Test** | The system boots and its primary function responds |
| **Sanity Test** | Basic operations work without deep edge-case coverage |

### Wiring & Structure Categories

| Term | What It Proves |
| --- | --- |
| **Wiring Audit** | UI → API → service → DB connections are real, not stubbed |
| **Dead Code / Orphaned Routes Audit** | No code exists without a reachable path and documented purpose |
| **Unreachable UI States Audit** | Every UI screen/state is navigable by a user |
| **Config & Feature-Flag Audit** | Every flag is documented, tested in both states, has a default |
| **Permissions/Roles Audit** | Every protected resource enforces correct access control |
| **Error-Path Audit** | Every failure mode is handled, logged, and recoverable |

### Formal Inspection Categories

| Term | What It Proves |
| --- | --- |
| **Fagan Inspection** | Structured review with roles, checklists, defect logging |
| **Traceability Matrix** | Requirements → implementation mapping with evidence |
| **Bidirectional Traceability** | Spec → code AND code → spec, both directions verified |
| **Coverage-Driven Audit** | Claims are backed by test coverage + runtime checks |
| **Attack Surface Review** | Every entry point (API, file, input) is inventoried and hardened |

### Advanced Audit Categories

| Term | What It Proves |
| --- | --- |
| **STRIDE Threat Model** | Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation risks assessed |
| **Architecture Conformance Review** | Code follows declared architecture; no layering violations |
| **Dependency Graph Audit** | No circular deps, abandoned deps, or license conflicts |
| **Operational Readiness Review** | Logging, metrics, alerting, runbooks, graceful shutdown all work |
| **Failure-Mode Analysis** | Every component's failure is handled by its consumers |
| **Chaos Testing Readiness** | System degrades gracefully under partial outages |

## 3\. Core Methodology: Bidirectional Traceability

Most audits fail because they only go in one direction. This framework requires both:

### Forward Traceability (Spec → Code)

```plaintext
Feature Spec → Find UI Entrypoint → Find API Route → Find Backend Handler
→ Find Data Model/State → Find Tests → Confirm All Exist and Are Wired
```

**What it catches:** Features that were specified but never implemented, partially implemented, or implemented but not tested.

### Reverse Traceability (Code → Spec)

```plaintext
Enumerate All Routes → Map Each to a Feature
Enumerate All UI Pages → Map Each to a Feature
Enumerate All Feature Flags → Map Each to a Feature
Enumerate All Background Jobs → Map Each to a Feature
Enumerate All CLI Commands → Map Each to a Feature
Enumerate All Agent Tools → Map Each to a Feature
```

**What it catches:** Code that exists but isn't documented, orphaned features, dead code, hidden functionality, backdoors, and forgotten experiments.

### The Rule

\> **Anything that exists in code but doesn't map to a documented feature is a defect.**  
\> **Anything that exists in the spec but doesn't map to working code is a defect.**

## 4\. The 20-Pass Audit System

### Phase A: Structural Discovery (Passes 1–4)

#### Pass 1: Inventory (Codebase Map)

**Objective:** Build a complete inventory of every addressable component in the system.

**Agent Prompt:**

```plaintext
PASS 1: INVENTORY — Build a complete codebase inventory for Super-Goose.

Enumerate and list ALL of the following with exact file paths:

ROUTES &amp; ENDPOINTS:
- Every HTTP route (method + path + handler file + line number)
- Every WebSocket endpoint
- Every GraphQL query/mutation/subscription
- Every MCP tool registration
- Every RPC/IPC channel

AGENTS &amp; ORCHESTRATION:
- Every agent class/module (name + file + line)
- Every agent capability/tool binding
- Every orchestrator/scheduler/dispatcher
- Every message queue/topic/channel
- Every agent state machine / lifecycle definition

UI COMPONENTS:
- Every page/screen/view
- Every form/dialog/modal
- Every navigation entry (sidebar, menu, tab)
- Every interactive control (button, toggle, input) with its handler

DATA LAYER:
- Every database model/schema/migration
- Every cache key pattern
- Every persistent state store
- Every file system path the app reads/writes

CONFIGURATION:
- Every environment variable (with default or REQUIRED)
- Every feature flag (with default state)
- Every config file format and location
- Every CLI argument/command

BACKGROUND PROCESSES:
- Every scheduled job/cron/timer
- Every background worker/consumer
- Every startup/shutdown hook
- Every health check endpoint

OUTPUT FORMAT:
Structured table per category with columns:
| Name | File Path | Line | Type | Connected To | Notes |

No assumptions. If you cannot find it, mark as NOT FOUND.
Do NOT summarize or skip items for brevity.
```

**Search Keywords:**

```plaintext
@app.route, @router, router.get, router.post, router.put, router.delete,
app.get, app.post, app.use, @Controller, @GetMapping, @PostMapping,
WebSocket, socket.on, io.on, ws.on,
tool_registration, register_tool, @tool, MCP, mcp_server,
class.*Agent, class.*Orchestrator, class.*Scheduler, class.*Dispatcher,
Queue, Channel, Topic, Pub, Sub, subscribe, publish, emit,
Schema, Model, migration, CREATE TABLE, ALTER TABLE,
ENV, process.env, os.environ, config., settings.,
feature_flag, feature_toggle, FF_, FEATURE_,
cron, schedule, setInterval, setTimeout, @scheduled,
healthcheck, health_check, /health, /ready, /live
```

#### Pass 2: Forward Feature Traceability

**Objective:** Map every documented/specified feature to its implementation chain.

**Agent Prompt:**

```plaintext
PASS 2: FORWARD FEATURE TRACEABILITY

Using the feature list/spec/README for Super-Goose, create a Feature Verification
Matrix by mapping EVERY feature through its full implementation chain.

For EACH feature, document:

| Feature ID | Feature Name | UI Entrypoint | API Route | Backend Handler | Data Model/State | Tests (Unit) | Tests (Integration) | Tests (E2E) | Status |

STATUS must be one of:
- VERIFIED: All columns populated with real file:line references
- PARTIAL: Some columns missing — list exactly what's missing
- NOT IMPLEMENTED: Feature documented but no code found
- NOT TESTED: Code exists but no test coverage
- BROKEN: Code exists but fails when executed

RULES:
- Every cell must contain a file path + line number, or "MISSING"
- "Tests" cells must list actual test file names and test function names
- Do NOT mark anything as VERIFIED without proving every link in the chain
- If a feature has sub-features, each sub-feature gets its own row
- If UI is "coming soon" or disabled, status is NOT IMPLEMENTED

After completing the matrix, provide:
1. Total features specified
2. Total VERIFIED
3. Total PARTIAL (with gap list)
4. Total NOT IMPLEMENTED
5. Total NOT TESTED
6. Total BROKEN
7. Completion percentage
```

#### Pass 3: Reverse Traceability (Orphan Detection)

**Objective:** Walk the codebase and find everything that doesn't map to a documented feature.

**Agent Prompt:**

```plaintext
PASS 3: REVERSE TRACEABILITY — Orphan Detection

Walk the ENTIRE codebase and enumerate every addressable component.
For EACH component, determine if it maps to a documented feature.

CHECK THESE CATEGORIES:

1. ORPHANED ROUTES:
   - API endpoints with no corresponding feature or UI that calls them
   - WebSocket handlers with no client connection

2. ORPHANED UI:
   - Pages/screens not reachable from navigation
   - Components imported but never rendered
   - Buttons/controls with no click handler or handlers that do nothing
   - Menu items that lead nowhere

3. ORPHANED AGENTS:
   - Agent classes never instantiated by the orchestrator
   - Agent tools registered but never invoked
   - Agent capabilities declared but not exercised in any workflow

4. ORPHANED DATA:
   - Database tables/collections with no read or write path
   - Cache keys set but never read (or read but never set)
   - Config keys defined but never consumed

5. ORPHANED CODE:
   - Exported functions/classes never imported elsewhere
   - Files not imported by any other file
   - Test fixtures with no test that uses them

6. SUSPICIOUS PATTERNS:
   - Feature flags that are always ON or always OFF (never toggled)
   - Conditional code paths that are unreachable given current config
   - Commented-out code blocks (potential abandoned work)

OUTPUT FORMAT:
| Category | Item | File Path | Line | Mapped Feature | Orphan? | Risk Level |

Risk Levels:
- CRITICAL: Exposed endpoint with no feature mapping (security risk)
- HIGH: UI element or agent with no purpose (confusion risk)
- MEDIUM: Dead code or unused export (maintenance burden)
- LOW: Unused test fixture or helper (cleanup opportunity)
```

#### Pass 4: Wiring Verification

**Objective:** Prove every UI action triggers a real backend operation and every backend operation is reachable from the UI (where expected).

**Agent Prompt:**

```plaintext
PASS 4: WIRING VERIFICATION

Trace every user-facing action through the full stack to prove real wiring.

For EACH UI action (button click, form submit, toggle, navigation):

| UI Element | Event Handler | API Call | Backend Handler | Side Effect | Response Handling | Error Handling | Status |

VERIFY:
1. The UI element exists and is visible (not hidden, not disabled without reason)
2. The event handler calls a real API (not a console.log, not a TODO)
3. The API route exists and matches the call (method + path + params)
4. The backend handler processes the request (not a stub, not a pass-through to nothing)
5. The side effect occurs (DB write, file operation, agent dispatch, state change)
6. The response is handled in the UI (success state, loading state, data display)
7. Errors are caught and displayed (not swallowed, not generic "something went wrong")

ALSO VERIFY REVERSE DIRECTION:
- Every backend event that should update the UI (WebSocket push, SSE, polling)
  actually reaches the UI and updates the display

FLAG:
- Buttons that log but don't act
- Forms that validate but don't submit
- API calls with no error handling
- Handlers that return hardcoded/mock data
- WebSocket events emitted but never listened to
- Loading states that never resolve

STATUS: WIRED / PARTIALLY WIRED (explain gap) / NOT WIRED / MOCK ONLY
```

### Phase B: Data & State Integrity (Passes 5–8)

#### Pass 5: Data Integrity & State Audit

**Objective:** Verify all data operations are correct, consistent, and safe under failure.

**Agent Prompt:**

```plaintext
PASS 5: DATA INTEGRITY &amp; STATE AUDIT

Audit every data operation in Super-Goose for correctness and safety.

SCHEMA &amp; MIGRATION:
- List every database schema/model with fields, types, constraints
- List every migration in order — verify they apply cleanly on empty DB
- Verify every migration is reversible OR has documented "no rollback" justification
- Check for schema drift: does the ORM/model match the actual migration state?
- Verify foreign keys, indexes, unique constraints are correct and complete

STATE CONSISTENCY:
- For every write operation: what happens if it fails mid-write?
  - Is there a transaction? Is it rolled back?
  - Is there distributed state? Are there compensating actions?
- For every read-after-write: is the read guaranteed to see the write?
  - Check for eventual consistency issues
  - Check for cache invalidation after writes
- For agent state: what happens if an agent crashes mid-operation?
  - Is state recoverable? Is there a WAL/journal?
  - Can another agent pick up the work?

ORPHANED DATA:
- Every write path must have a corresponding read path
- Every read path must have data that's actually written
- Tables/collections with writes but no reads = suspicious
- Tables/collections with reads but no writes = broken

DATA LIFECYCLE:
- Is old data cleaned up? (TTL, archival, deletion)
- Are there unbounded growth paths? (logs, events, queues)
- Is sensitive data encrypted at rest?
- Is PII handled according to retention policies?

OUTPUT: Defect log with file paths and specific data operations that fail any check.
```

#### Pass 6: Concurrency & Race Condition Audit

**Objective:** Enumerate every shared mutable state and prove each is protected.

**Agent Prompt:**

```plaintext
PASS 6: CONCURRENCY &amp; RACE CONDITION AUDIT

Super-Goose is a multi-agent system. Concurrency bugs are existential threats.

SHARED MUTABLE STATE INVENTORY:
List every piece of state that can be accessed by more than one agent,
thread, process, or async task:

| State | Location | Readers | Writers | Protection Mechanism | Verified? |

PROTECTION MECHANISMS (verify one exists for each shared state):
- Mutex/Lock/Semaphore
- Atomic operations
- Message passing (no shared state)
- Database transactions with proper isolation level
- Queue-based serialization
- Copy-on-write / immutable data structures

CHECK FOR:
1. TOCTOU (Time-of-Check to Time-of-Use):
   - if (exists(file)) then read(file) — file could be deleted between check and read
   - if (available(resource)) then use(resource) — resource could be claimed

2. DEADLOCKS:
   - Two agents acquiring locks in different orders
   - Agent A waits for Agent B which waits for Agent A
   - Resource pool exhaustion (all connections in use, everyone waiting)

3. RACE CONDITIONS:
   - Multiple agents writing to the same file/record simultaneously
   - Counter increments without atomic operations
   - Read-modify-write cycles without transactions

4. STARVATION:
   - Priority inversion (low-priority agent holds resource high-priority needs)
   - Unbounded retry loops that never yield
   - Queue consumers that can't keep up with producers (backpressure?)

5. AGENT-SPECIFIC:
   - What happens if two agents try to use the same tool simultaneously?
   - What happens if the orchestrator dispatches duplicate work?
   - What happens if an agent receives a message meant for another agent?

OUTPUT: Table of shared state with protection status + defect log for unprotected items.
```

#### Pass 7: API Contract & Schema Evolution Audit

**Objective:** Verify all API boundaries are versioned, backward-compatible, and contract-tested.

**Agent Prompt:**

```plaintext
PASS 7: API CONTRACT &amp; SCHEMA EVOLUTION AUDIT

Audit every API boundary in Super-Goose for contract safety.

API BOUNDARIES TO AUDIT:
- External HTTP/REST/GraphQL APIs
- Internal service-to-service APIs
- Agent-to-orchestrator communication protocol
- Orchestrator-to-agent dispatch protocol
- MCP tool schemas (input/output)
- WebSocket message formats
- CLI command interfaces
- Plugin/extension APIs
- Configuration file schemas
- Database query interfaces (if exposed)

FOR EACH BOUNDARY:

1. SCHEMA DOCUMENTATION:
   - Is the schema formally defined? (OpenAPI, JSON Schema, protobuf, TypeScript types)
   - Is the schema versioned?
   - Where is the schema source of truth? (file path)

2. BACKWARD COMPATIBILITY:
   - Can old clients talk to new servers?
   - Can old agents work with new orchestrator?
   - Are required fields ever added to existing endpoints? (breaking change)
   - Are field types ever changed? (breaking change)
   - Are enum values ever removed? (breaking change)

3. CONTRACT TESTS:
   - Is there a test that validates request/response against the schema?
   - Is there a test that sends an old-format request and confirms it still works?
   - Are serialization round-trips tested? (serialize → deserialize → compare)

4. MCP TOOL CONTRACTS (Super-Goose specific):
   - Every registered tool has a frozen schema snapshot
   - Tool input validation matches the declared schema
   - Tool output matches the declared response format
   - Error responses follow a consistent format

5. VERSIONING STRATEGY:
   - How are breaking changes communicated? (version bump, deprecation period)
   - Is there a migration guide for consumers?

OUTPUT: Contract inventory table + breaking change risk list + missing contract test list.
```

#### Pass 8: Configuration & Environment Drift Audit

**Objective:** Inventory every configuration key and prove correctness across environments.

**Agent Prompt:**

```plaintext
PASS 8: CONFIGURATION &amp; ENVIRONMENT DRIFT AUDIT

Audit every configuration key, feature flag, and environment-specific behavior.

CONFIGURATION INVENTORY:
For EVERY config key in the system:

| Key | Type | Default | Required? | Used In (file:line) | Validated? | What Breaks Without It |

CHECKS:

1. COMPLETENESS:
   - Every key used in code exists in .env.example / config schema
   - Every key in .env.example is actually used in code (no orphaned config)
   - Every key has a type (string, int, bool, url, path, etc.)
   - Every required key fails fast with a clear error on startup (not silent fallback)

2. DEFAULTS:
   - Every optional key has a sensible default
   - No key defaults to a production value in development (or vice versa)
   - No key defaults to a value that enables dangerous behavior

3. FEATURE FLAGS:
   - Every flag is documented (what it controls, why it exists)
   - Every flag is tested in BOTH states (on and off)
   - Every flag has an owner and expiry date
   - Flags that have been ON everywhere for &gt;90 days should be removed (tech debt)
   - Flags that are always OFF should be removed (dead code)

4. ENVIRONMENT DRIFT:
   - List every behavior that differs between dev/staging/prod
   - Verify each difference is intentional and documented
   - Check for environment-specific code paths (if env == "production") — these are fragile

5. SECRET HANDLING:
   - No secrets in code, config files, or version control
   - Every secret is sourced from env vars or a secret manager
   - Every secret has a rotation plan documented

OUTPUT: Config inventory table + flag audit table + drift risk list.
```

### Phase C: Evidence & Proof (Passes 9–12)

#### Pass 9: Test Evidence Audit

**Objective:** For every feature, prove test coverage exists and passes with real code paths.

**Agent Prompt:**

```plaintext
PASS 9: TEST EVIDENCE AUDIT

For every feature in the Feature Verification Matrix (Pass 2), verify test coverage.

REQUIREMENTS:
- Every feature must have at least ONE test that exercises the real implementation
- Tests using mocks must ALSO have a companion test using real dependencies
- "Test exists" is not enough — verify the test actually asserts the correct behavior

FOR EACH FEATURE:

| Feature | Unit Tests | Integration Tests | E2E Tests | Mock-Only? | Real-Path Tested? | Status |

TEST QUALITY CHECKS:

1. ASSERTION QUALITY:
   - Tests assert specific outcomes (not just "no error thrown")
   - Tests check return values, state changes, and side effects
   - Tests verify error cases (not just happy path)

2. MOCK POLICY COMPLIANCE:
   - List every mock/stub/fake in the test suite
   - For each mock: is there a corresponding real-path test?
   - Mocks of internal code are FORBIDDEN (only external services)

3. FIXTURE QUALITY:
   - Are test fixtures realistic? (not trivial "hello world" data)
   - Do fixtures represent real-world edge cases?
   - Are golden fixtures maintained and versioned?

4. FLAKE DETECTION:
   - Run test suite 3 times — any different results = flaky
   - List all tests with timing dependencies, random data, or network calls
   - Every flaky test is a bug, not a skip

5. COVERAGE GAPS:
   - List features with 0 tests
   - List features with only mock tests (no real-path proof)
   - List error/failure paths with no test coverage
   - List edge cases documented but not tested

OUTPUT: Test evidence matrix + mock audit table + coverage gap list + flake report.
```

#### Pass 10: Failure Mode Audit (Single-Fault Injection)

**Objective:** For each major flow, simulate individual failures and verify handling.

**Agent Prompt:**

```plaintext
PASS 10: FAILURE MODE AUDIT — Single-Fault Injection

For each major user/agent flow in Super-Goose, inject one failure at a time
and verify the system handles it correctly.

FAILURE TYPES TO INJECT:

| Failure | What to Test |
|---------|-------------|
| Network timeout | API call times out — does caller retry? Does it show error? Does it hang forever? |
| Server 500 | Backend returns error — does UI show meaningful message? Does agent retry? |
| Bad input | Invalid data submitted — does validation catch it? Is the error clear? |
| Auth expired | Token expires mid-session — does re-auth happen? Is work lost? |
| Disk full | Write operation fails — does it crash? Does it report? Does it retry? |
| Process crash | Agent/service dies — does orchestrator detect? Does it restart? Is state lost? |
| Dependency down | Database/cache/queue unavailable — does the system degrade or crash? |
| Malformed response | Upstream returns unexpected format — does parser crash or handle gracefully? |
| Slow response | Response takes 30+ seconds — does UI show progress? Can user cancel? |
| Concurrent conflict | Two operations on same resource — does one fail cleanly? |

FOR EACH MAJOR FLOW, DOCUMENT:

| Flow | Failure Injected | Expected Behavior | Actual Behavior | Error Shown to User | Recovery Action | Status |

STATUS: HANDLED / PARTIAL / UNHANDLED / CRASHES

Flag any flow where:
- The system hangs (no timeout)
- The error is swallowed (catch block with no action)
- The error message is generic ("Something went wrong")
- State is corrupted after recovery
- The user has no way to retry or recover
```

#### Pass 11: Chaos & Cascading Failure Audit

**Objective:** Verify behavior under multi-fault, resource exhaustion, and cascading failure scenarios.

**Agent Prompt:**

```plaintext
PASS 11: CHAOS &amp; CASCADING FAILURE AUDIT

Go beyond single-fault injection. Test what happens when multiple things fail
simultaneously or when failures cascade through the system.

CASCADING FAILURE SCENARIOS:

1. SERVICE CHAIN FAILURES:
   - Agent A depends on Service B which depends on Database C
   - Database C goes down → does Service B timeout? → does Agent A hang forever?
   - Verify: circuit breakers, fallbacks, degraded-mode behavior

2. THUNDERING HERD:
   - All agents lose connection simultaneously → all retry at once
   - Does the system survive the reconnection storm?
   - Are retries jittered? Is there backoff?

3. RESOURCE EXHAUSTION:
   - Max file descriptors reached → next connection fails → verify graceful error
   - Memory at 95% → verify OOM handling, not silent corruption
   - Disk at 100% → verify write failures are caught, not ignored
   - Thread/goroutine/async task pool exhausted → verify backpressure

4. PARTIAL DEGRADATION:
   - 1 of 3 database replicas is down → does the system continue?
   - 1 of N agents is stuck → does the orchestrator route around it?
   - Cache is unavailable → does the system fall back to DB (slowly but correctly)?

5. POISON PILL / BAD ACTOR:
   - One agent returns garbage data → does the orchestrator detect and quarantine?
   - One queue message is malformed → does the consumer skip or crash?
   - One API response is 10x larger than expected → does the parser handle it?

6. SPLIT BRAIN / NETWORK PARTITION:
   - Agent thinks it's the leader but the orchestrator already assigned another
   - Two agents both process the same task → is output idempotent or duplicated?

FOR EACH SCENARIO:

| Scenario | Components Involved | Expected Degradation | Actual Behavior | Recovery Time | Data Loss? | Status |

STATUS: RESILIENT / DEGRADES GRACEFULLY / PARTIAL FAILURE / CASCADING CRASH
```

#### Pass 12: Idempotency & Side-Effect Audit

**Objective:** Verify every operation is safe to retry and side effects are controlled.

**Agent Prompt:**

```plaintext
PASS 12: IDEMPOTENCY &amp; SIDE-EFFECT AUDIT

For a multi-agent system, retry safety is critical. If an agent crashes and
restarts, or if a message is delivered twice, the system must not corrupt state.

FOR EACH WRITE OPERATION / SIDE-EFFECT:

| Operation | Idempotent? | What Happens on Retry? | Duplicate Detection? | Compensation/Rollback? | Status |

CHECKS:

1. API IDEMPOTENCY:
   - POST requests: is there an idempotency key?
   - PUT requests: are they truly idempotent (same input → same state)?
   - DELETE requests: does deleting an already-deleted item error or no-op?

2. AGENT OPERATION REPLAY:
   - Agent sends an email → crashes → restarts → does it send again?
   - Agent writes to DB → crashes → restarts → does it write a duplicate?
   - Agent calls an external tool → crashes → restarts → does the tool run twice?

3. MESSAGE DELIVERY SEMANTICS:
   - What are the delivery guarantees? (at-most-once, at-least-once, exactly-once)
   - If at-least-once: are consumers idempotent?
   - If at-most-once: is data loss acceptable for this operation?

4. SIDE-EFFECT INVENTORY:
   List every operation that changes external state:
   | Operation | External System | Reversible? | Idempotent? | Retry-Safe? |

   External systems include: filesystem, database, network calls, emails,
   notifications, third-party APIs, user-visible state changes

5. CRASH RECOVERY:
   - For each agent: simulate crash at every stage of its main workflow
   - On restart: does it resume correctly? Does it corrupt state?
   - Is there a recovery log / WAL / checkpoint system?

OUTPUT: Side-effect inventory + idempotency status matrix + crash recovery analysis.
```

### Phase D: Security & Dependency Health (Passes 13–14)

#### Pass 13: Security Audit (STRIDE + Attack Surface)

**Objective:** Comprehensive security review using STRIDE threat modeling.

**Agent Prompt:**

```plaintext
PASS 13: SECURITY AUDIT — STRIDE + Attack Surface Analysis

Perform a comprehensive security audit of Super-Goose using the STRIDE framework.

STRIDE ANALYSIS:

| Threat | Category | Attack Vector | Component | Mitigation | Verified? |

CATEGORIES:

S — SPOOFING (Authentication):
- Can an agent impersonate another agent?
- Can a user bypass authentication?
- Are API keys/tokens validated on every request?
- Are JWTs verified (signature, expiry, issuer)?
- Is there session fixation/hijacking risk?

T — TAMPERING (Integrity):
- Can request data be modified in transit? (HTTPS? Message signing?)
- Can an agent tamper with another agent's state?
- Can config files be modified at runtime by untrusted input?
- Are database queries parameterized? (SQL injection)
- Are file paths validated? (Path traversal)

R — REPUDIATION (Logging):
- Are all security-relevant actions logged?
- Are logs tamper-proof? (Can an agent delete its own logs?)
- Is there an audit trail for who did what and when?
- Can actions be attributed to a specific agent/user?

I — INFORMATION DISCLOSURE:
- Are stack traces hidden from users? (No debug info in production)
- Are secrets ever logged? (Check log output for keys, tokens, passwords)
- Are error messages too detailed? (Revealing internal structure)
- Is sensitive data encrypted in transit and at rest?
- Are API responses scoped to authorized data only?

D — DENIAL OF SERVICE:
- Are there rate limits on API endpoints?
- Are there resource limits on agent operations? (CPU, memory, time)
- Can a malicious input cause unbounded computation?
- Are file upload sizes limited?
- Are request body sizes limited?

E — ELEVATION OF PRIVILEGE:
- Can a regular user access admin endpoints?
- Can an agent escalate its own capabilities?
- Are role checks enforced at the API layer (not just UI)?
- If the system executes user-supplied code: is it sandboxed?

ADDITIONAL CHECKS:
- Dependency vulnerability scan (npm audit / pip-audit / cargo audit)
- Secret scan (no secrets in code, git history, or config files)
- CORS configuration (not wildcard * in production)
- CSP headers (if web UI exists)
- Input validation on every entry point

OUTPUT: STRIDE threat table + attack surface inventory + vulnerability list + remediation plan.
```

#### Pass 14: Dependency Health Audit

**Objective:** Audit all dependencies beyond just vulnerability scanning.

**Agent Prompt:**

```plaintext
PASS 14: DEPENDENCY HEALTH AUDIT

Go beyond vulnerability scanning. Audit dependency health, maintainability,
and supply-chain risk.

FOR EACH DEPENDENCY (direct and significant transitive):

| Package | Version | Pinned? | Last Release | Maintainer Status | License | Alternatives | Risk |

CHECKS:

1. ABANDONMENT RISK:
   - Last commit date &gt; 12 months? → HIGH RISK
   - Single maintainer with no recent activity? → HIGH RISK
   - No response to issues/PRs for 6+ months? → MEDIUM RISK
   - Deprecated but still in use? → CRITICAL

2. VERSION PINNING:
   - Are all dependencies version-pinned? (exact version, not range)
   - Is there a lockfile? (package-lock.json, Pipfile.lock, Cargo.lock)
   - Does CI use the lockfile? (not re-resolving on every build)

3. LICENSE COMPATIBILITY:
   - List every dependency's license
   - Flag any copyleft (GPL, AGPL) in a non-copyleft project
   - Flag any unknown/custom licenses
   - Flag any license changes in recent versions

4. TRANSITIVE RISK:
   - How deep is the dependency tree?
   - Are there transitive dependencies with known vulnerabilities?
   - Are there transitive dependencies that are abandoned?
   - Is there a "left-pad" risk? (tiny critical dependency from unknown maintainer)

5. SUPPLY CHAIN:
   - Are dependencies fetched from official registries only?
   - Is there integrity verification? (checksums, signatures)
   - Are there any dependencies fetched from git URLs? (less auditable)
   - What happens if a dependency disappears from the registry?

6. UPDATE STRATEGY:
   - Is there a documented process for updating dependencies?
   - Are there automated dependency update PRs? (Dependabot, Renovate)
   - When was the last dependency audit performed?

OUTPUT: Dependency health matrix + risk-ranked list + recommended replacements/updates.
```

### Phase E: Performance & Operations (Passes 15–16)

#### Pass 15: Performance & Resource Lifecycle Audit

**Objective:** Identify memory leaks, resource leaks, CPU hotspots, and latency issues.

**Agent Prompt:**

```plaintext
PASS 15: PERFORMANCE &amp; RESOURCE LIFECYCLE AUDIT

Audit for resource leaks, performance issues, and unbounded growth.

RESOURCE LIFECYCLE (Every Acquire Must Have a Release):

| Resource | Acquired At (file:line) | Released At (file:line) | In Finally/Dispose? | Leak Risk |

Resources to track:
- File handles (open/close)
- Database connections (connect/disconnect, pool checkout/return)
- HTTP connections (request/response completion)
- WebSocket connections (open/close)
- Event listeners (add/remove)
- Timers/intervals (set/clear)
- Child processes (spawn/kill+wait)
- Temporary files (create/delete)
- Lock acquisitions (acquire/release)
- GPU/compute resources (allocate/free)
- Agent instances (create/destroy)

MEMORY LEAK DETECTION:

1. STATIC ANALYSIS:
   - Global variables that accumulate data without bounds
   - Caches without size limits or TTL
   - Event listeners added in loops without removal
   - Closures capturing large objects unnecessarily
   - Circular references preventing garbage collection

2. RUNTIME ANALYSIS PLAN:
   - Define heap snapshot comparison points (before workflow, after workflow)
   - Expected: heap returns to baseline after workflow completion
   - If not: identify retained objects and their retention path

PERFORMANCE HOTSPOTS:

1. LATENCY BUDGET:
   For each user-facing operation, define acceptable latency:
   | Operation | Target Latency | Measured Latency | Acceptable? |

2. CPU HOTSPOTS:
   - Synchronous operations on the main/UI thread
   - Regex on untrusted input (ReDoS risk)
   - JSON parsing of large payloads without streaming
   - Nested loops over large datasets
   - Recursive operations without depth limits

3. UNBOUNDED GROWTH:
   - Log files that grow forever
   - Queue backlogs with no backpressure
   - In-memory buffers with no size limit
   - History/undo stacks with no cap

OUTPUT: Resource lifecycle table + leak risk list + latency budget + hotspot list.
```

#### Pass 16: Observability & Operations Audit

**Objective:** Verify logging, metrics, health checks, and operational readiness.

**Agent Prompt:**

```plaintext
PASS 16: OBSERVABILITY &amp; OPERATIONS AUDIT

Verify the system is operable in production: visible, debuggable, recoverable.

LOGGING:
- Structured logging format? (JSON, not free-text)
- Log levels used correctly? (DEBUG/INFO/WARN/ERROR)
- Every error has: timestamp, correlation ID, component, message, stack trace
- No sensitive data in logs (secrets, PII, tokens)
- Log rotation configured? (not unbounded disk usage)
- Correlation IDs propagated across agent boundaries?

METRICS:
- System metrics: CPU, memory, disk, network
- Application metrics: request rate, error rate, latency (p50/p95/p99)
- Agent metrics: tasks dispatched, tasks completed, tasks failed, queue depth
- Business metrics: workflows completed, user actions per session
- Are metrics exportable? (Prometheus, StatsD, CloudWatch, etc.)

HEALTH CHECKS:
- /health or equivalent endpoint exists
- Health check verifies dependencies (DB, cache, queue — not just "process is alive")
- Readiness check (can accept traffic) vs liveness check (process is running)
- Health check response includes version, uptime, dependency status

ALERTING:
- Are there defined alert conditions? (error rate spike, latency spike, disk full)
- Are alerts documented with response procedures?
- Is there an on-call rotation or escalation path documented?

GRACEFUL SHUTDOWN:
- SIGTERM handler exists
- In-flight requests complete before shutdown
- Background tasks are drained or checkpointed
- Connections are closed cleanly
- Shutdown timeout exists (force-kill after N seconds)

STARTUP:
- Startup validates config before accepting traffic
- Startup waits for dependencies to be ready
- Startup logs its version, config (non-secret), and dependency status
- Startup fails fast on missing required config

RUNBOOKS:
- For each alert: documented diagnosis + remediation steps
- For common failures: step-by-step recovery procedures
- For deployment: rollback procedure documented
- For data issues: recovery/restore procedure documented

OUTPUT: Observability checklist (PASS/FAIL per item) + missing runbook list.
```

### Phase F: Documentation & Lifecycle (Passes 17–19)

#### Pass 17: Documentation Accuracy Audit

**Objective:** Verify every claim in documentation is actually true right now.

**Agent Prompt:**

```plaintext
PASS 17: DOCUMENTATION ACCURACY AUDIT

Docs that lie are worse than no docs. Verify every claim in the documentation.

README VERIFICATION:
- Run EVERY command in the README verbatim
- Does each command work? On a clean machine? With documented prerequisites?
- Are prerequisites listed completely? (runtime versions, system packages, etc.)
- Does "quick start" actually get a working system in &lt;5 minutes?

| README Section | Claim | Verified? | Actual Result | Fix Needed? |

ARCHITECTURE DOCS:
- Do architecture diagrams match actual code structure?
- Are all components in the diagram present in the codebase?
- Are all components in the codebase present in the diagram?
- Are data flow arrows correct? (does data actually flow that way?)
- Are technology choices current? (not listing a library that was replaced)

API DOCS:
- Does every documented endpoint exist?
- Do documented request/response schemas match actual behavior?
- Are documented error codes actually returned?
- Are there undocumented endpoints? (reverse traceability gap)
- Are code examples runnable?

CHANGELOG:
- Does the latest entry match what actually changed?
- Are breaking changes clearly marked?
- Are migration steps accurate and complete?

INLINE DOCS:
- Are function/class docstrings accurate?
- Do @param and @return types match actual signatures?
- Are "NOTE" and "WARNING" comments still relevant?

OUTPUT: Documentation accuracy table + list of lies/outdated claims + fix priority.
```

#### Pass 18: Upgrade & Migration Path Audit

**Objective:** Prove a user can upgrade from one version to the next without data loss.

**Agent Prompt:**

```plaintext
PASS 18: UPGRADE &amp; MIGRATION PATH AUDIT

Can a user on version N upgrade to version N+1 without losing data,
breaking their setup, or requiring undocumented manual steps?

MIGRATION PATH:

1. DATABASE MIGRATIONS:
   - Are migrations numbered/ordered and applied sequentially?
   - Does each migration run on a database in the previous version's state?
   - Are migrations idempotent? (running twice doesn't break anything)
   - Are migrations reversible? If not, is "no rollback" documented?
   - What happens to in-flight data during migration? (downtime required?)
   - Is there a backup step before migration?

2. CONFIGURATION MIGRATION:
   - Does the new version accept the old version's config file?
   - Are new required config keys documented?
   - Does the system provide a config migration tool or clear error on old config?
   - Are deprecated config keys still accepted (with warning)?

3. STATE MIGRATION:
   - Agent state files from v(N) → do they load in v(N+1)?
   - User preferences / settings from v(N) → preserved in v(N+1)?
   - Cache invalidation: does old cache cause errors or just misses?

4. API COMPATIBILITY:
   - Can v(N) clients talk to v(N+1) server? (backward compat)
   - Can v(N+1) clients talk to v(N) server? (forward compat for rolling deploys)

5. PLUGIN / EXTENSION COMPATIBILITY:
   - Do plugins written for v(N) work in v(N+1)?
   - Is there a plugin API version contract?

6. TESTING:
   - Is there a test that applies migrations from a known v(N) state?
   - Is there a test that loads v(N) config in v(N+1)?
   - Is there a test that loads v(N) state/data in v(N+1)?

UPGRADE DOCUMENTATION:
- Step-by-step upgrade guide exists?
- Breaking changes clearly listed?
- Backup instructions provided?
- Rollback instructions provided?
- Expected downtime documented?

OUTPUT: Migration path status table + breaking change list + missing migration tests.
```

#### Pass 19: Rollback & Recovery Audit

**Objective:** Prove the system can be safely rolled back to a previous version.

**Agent Prompt:**

```plaintext
PASS 19: ROLLBACK &amp; RECOVERY AUDIT

If a deployment goes wrong, can you undo it safely?

ROLLBACK SCENARIOS:

1. CODE ROLLBACK:
   - Can you deploy the previous version's binary/container/package?
   - Does the previous version work with the current infrastructure?
   - Are there any "forward-only" changes that prevent rollback?

2. DATABASE ROLLBACK:
   - Can migrations be reversed?
   - If not: does the previous code version work with the new schema?
   - Are there data transforms that are lossy? (can't undo)
   - Is there a point-in-time recovery option? (backup + replay)

3. STATE ROLLBACK:
   - Agent state: can you restore previous state snapshots?
   - User data: can you restore from backup without losing recent changes?
   - Configuration: can you revert config without side effects?

4. PARTIAL ROLLBACK:
   - Can you roll back one service while keeping others on new version?
   - Are there cross-service version dependencies that prevent partial rollback?

5. RECOVERY PROCEDURES:
   | Scenario | Recovery Steps | Estimated Time | Data Loss Risk | Documented? |

   Scenarios:
   - Bad deployment → rollback
   - Database corruption → restore from backup
   - Agent state corruption → reset agent
   - Full system failure → disaster recovery
   - Single component failure → component restart
   - Data accidentally deleted → recovery from backup

6. BACKUP VERIFICATION:
   - Are backups actually being created?
   - Are backups tested? (restore from backup and verify data)
   - What is the RPO? (Recovery Point Objective — how much data can you lose?)
   - What is the RTO? (Recovery Time Objective — how long to restore?)

OUTPUT: Rollback capability matrix + recovery procedure inventory + gap list.
```

### Phase G: Release Gate (Pass 20)

#### Pass 20: Release Gate Verification

**Objective:** Final go/no-go checklist — every gate must pass for release.

**Agent Prompt:**

```plaintext
PASS 20: RELEASE GATE VERIFICATION — Go/No-Go Decision

This is the final pass. Every gate must be GREEN for release approval.

BUILD GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| Clean clone builds successfully | | |
| One-command dev run works | | |
| Production build completes without errors | | |
| Docker build completes (if applicable) | | |
| All compiler/transpiler warnings resolved | | |

TEST GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| All unit tests pass | | |
| All integration tests pass | | |
| All E2E tests pass | | |
| No flaky tests | | |
| Test coverage meets minimum threshold | | |
| Smoke test on built artifact passes | | |

SECURITY GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| No critical/high vulnerabilities in dependencies | | |
| Secret scan passes (no secrets in code) | | |
| STRIDE threat model reviewed | | |
| Input validation on all entry points | | |
| Auth/authz enforced on all protected routes | | |

DOCUMENTATION GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| README accurate and commands work | | |
| ARCHITECTURE.md matches code | | |
| CHANGELOG.md updated | | |
| API docs match implementation | | |
| Upgrade/migration guide complete | | |

PACKAGING GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| Versioned artifact produced | | |
| Checksums generated | | |
| Installer/container/package works on clean machine | | |
| Release notes written | | |
| License file present and correct | | |

OPERATIONAL GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| Health checks work | | |
| Logging configured and verified | | |
| Graceful shutdown works | | |
| Rollback procedure documented and tested | | |
| Runbooks exist for common failures | | |

FEATURE COMPLETENESS GATES:
| Gate | Status | Evidence |
|------|--------|----------|
| Feature Verification Matrix: all VERIFIED | | |
| Reverse Traceability: no critical orphans | | |
| Wiring Audit: all UI actions wired | | |
| No TODO/FIXME/STUB in runtime code | | |

DECISION:
[ ] GO — All gates GREEN. Release approved.
[ ] NO-GO — Blocking issues listed below with severity and fix timeline.

BLOCKING ISSUES:
| Issue | Severity | Pass # | Fix Estimate | Owner |
```

## 5\. Super-Goose Agent-Specific Audit Modules

These additional modules address concerns unique to a multi-agent orchestration system.

### Module A: Agent Lifecycle Audit

```plaintext
AGENT LIFECYCLE AUDIT — Super-Goose Specific

For EACH agent type in the system:

| Agent | Start | Pause | Resume | Cancel | Terminate | Restart | Status |

VERIFY:
1. Agent can start cleanly from zero state
2. Agent can be paused mid-operation without data loss
3. Agent can resume from paused state and complete correctly
4. Agent can be cancelled mid-operation with cleanup
5. Agent can be terminated forcefully without corrupting shared state
6. Agent can restart after crash and recover to a consistent state
7. Orchestrator detects agent failure within acceptable time

EDGE CASES:
- What happens to in-flight work when the orchestrator dies?
- What happens if an agent is started twice? (duplicate instance)
- What happens if an agent receives work after termination signal?
- What is the maximum time an agent can be unresponsive before forced kill?
- Is there a dead letter queue for unprocessable agent tasks?
```

### Module B: Tool Registration & Invocation Audit

```plaintext
TOOL REGISTRATION AUDIT — Super-Goose Specific

For EACH registered tool (MCP or otherwise):

| Tool Name | Schema File | Registered By | Reachable? | Timeout | Retry Policy | Error Format | Tested? |

VERIFY:
1. Tool schema is formally defined and versioned
2. Tool is reachable from the agent that registers it
3. Tool has a defined timeout (not infinite wait)
4. Tool has a defined retry policy (or explicit "no retry" with justification)
5. Tool errors follow a consistent format parseable by agents
6. Tool input validation matches declared schema
7. Tool output matches declared response format
8. Tool is tested with valid input, invalid input, and timeout scenarios
9. Tool registration is idempotent (registering twice doesn't break anything)
10. Tool deregistration cleans up resources
```

### Module C: Agent Communication Audit

```plaintext
AGENT COMMUNICATION AUDIT — Super-Goose Specific

For EACH communication channel between agents:

| Channel | Sender(s) | Receiver(s) | Message Format | Ordering | Delivery | Serialization | Tested? |

VERIFY:
1. Message format is formally defined (schema/type)
2. Serialization round-trip works (serialize → deserialize → compare = equal)
3. Message ordering: is order guaranteed? Is it required?
4. Delivery semantics: at-most-once / at-least-once / exactly-once?
5. What happens when a receiver is offline? (buffered? dropped? dead-letter?)
6. What happens when a message is malformed? (logged? crashed? quarantined?)
7. What happens when a sender sends to a non-existent receiver?
8. Maximum message size defined and enforced?
9. Correlation IDs propagated for tracing across agent boundaries?
10. Backpressure: if receiver is slow, does sender slow down or overflow?
```

### Module D: Sandbox & Isolation Audit

```plaintext
SANDBOX &amp; ISOLATION AUDIT — Super-Goose Specific

If agents execute code, access filesystems, or interact with external systems:

| Agent | Execution Scope | Filesystem Access | Network Access | Resource Limits | Isolation Mechanism |

VERIFY:
1. Each agent runs in its own isolated context (process, container, namespace)
2. One agent cannot read/write another agent's state directly
3. One agent cannot crash another agent
4. One agent cannot exhaust resources for all other agents
5. Code execution (if any) is sandboxed:
   - No access to host filesystem beyond designated paths
   - No ability to install system packages
   - No ability to open network connections to arbitrary hosts
   - CPU and memory limits enforced
   - Execution time limits enforced
6. File access is scoped and validated:
   - Path traversal prevented
   - Symlink following restricted
   - Sensitive directories blocked
7. Network access is scoped:
   - Allowlist of permitted external hosts (if any)
   - No SSRF via agent-controlled URLs
```

## 6\. Specialized Auditor Agent Roles

For multi-agent audit execution, assign these specialized roles:

### Agent 1: Frontend Wiring Auditor

**Scope:** UI components, event handlers, navigation, rendering, client-side state

**Search Keywords:**

```plaintext
onClick, onSubmit, onChange, onInput, addEventListener, handleClick, handleSubmit,
useState, useEffect, useReducer, useContext, dispatch, action, reducer,
Router, Route, Link, navigate, redirect, Switch, Outlet,
fetch, axios, api., client., request, response,
disabled, hidden, visibility, display:none, v-if, v-show, *ngIf,
loading, spinner, skeleton, placeholder, "coming soon",
data-testid, aria-label, role=, className, classList
```

**Passes Owned:** 1 (UI portion), 2 (UI column), 3 (orphaned UI), 4 (full)

### Agent 2: Backend & API Auditor

**Scope:** Routes, controllers, services, middleware, request/response handling

**Search Keywords:**

```plaintext
@app.route, router., @Controller, @GetMapping, @PostMapping, @PutMapping,
@DeleteMapping, middleware, interceptor, guard, pipe, filter,
req.body, req.params, req.query, request.json, request.args,
res.json, res.send, response.json, return Response,
async def, await, Promise, .then, .catch,
validate, sanitize, serialize, deserialize,
try, catch, except, finally, throw, raise,
@auth, @login_required, @requires_auth, jwt, token, bearer,
cors, helmet, rate_limit, throttle
```

**Passes Owned:** 1 (API portion), 2 (API/handler columns), 3 (orphaned routes), 7 (contracts)

### Agent 3: Data & State Auditor

**Scope:** Database models, migrations, cache, state management, data flows

**Search Keywords:**

```plaintext
CREATE TABLE, ALTER TABLE, DROP TABLE, migration, Schema, Model,
@Entity, @Column, @PrimaryKey, @ForeignKey, @Index, @Unique,
INSERT, UPDATE, DELETE, SELECT, JOIN, WHERE, GROUP BY,
transaction, commit, rollback, BEGIN, SAVEPOINT,
cache, redis, memcached, get, set, del, ttl, expire,
queue, enqueue, dequeue, push, pop, subscribe, publish,
state, store, dispatch, reducer, atom, signal, observable,
.save, .create, .update, .delete, .find, .findOne, .aggregate
```

**Passes Owned:** 5 (full), 6 (shared state portion), 12 (idempotency)

### Agent 4: Agent Lifecycle & Orchestration Auditor

**Scope:** Agent classes, orchestrator, scheduler, message passing, tool registration

**Search Keywords:**

```plaintext
class.*Agent, class.*Orchestrator, class.*Scheduler, class.*Dispatcher,
register_tool, tool_registration, @tool, mcp, MCP_TOOL,
spawn, fork, exec, subprocess, child_process, worker_threads,
message, dispatch, send, receive, inbox, outbox, mailbox,
start, stop, pause, resume, cancel, terminate, kill, restart,
health, heartbeat, ping, pong, alive, dead, timeout,
retry, backoff, jitter, circuit_breaker, fallback,
queue, task, job, worker, pool, executor,
state_machine, transition, lifecycle, phase, stage
```

**Passes Owned:** Modules A–D (full), 6 (concurrency), 11 (cascading), 12 (side effects)

### Agent 5: Test Evidence Auditor

**Scope:** Test files, fixtures, mocks, coverage, CI test configuration

**Search Keywords:**

```plaintext
describe, it, test, expect, assert, should, toBe, toEqual,
@Test, @Before, @After, @BeforeEach, @AfterEach, setUp, tearDown,
mock, stub, fake, spy, jest.fn, sinon, unittest.mock, MagicMock, patch,
fixture, factory, seed, sample, golden, snapshot,
coverage, istanbul, nyc, pytest-cov, jacoco, lcov,
skip, xfail, pending, todo, flaky, intermittent, retry,
integration, e2e, smoke, sanity, acceptance, regression,
playwright, cypress, selenium, puppeteer, FlaUI, Appium,
docker-compose, testcontainers, setup_module, conftest
```

**Passes Owned:** 9 (full), plus verification of test evidence for all other passes

### Agent 6: Security & Dependency Auditor

**Scope:** Auth, input validation, secrets, dependencies, vulnerabilities

**Search Keywords:**

```plaintext
auth, login, logout, session, cookie, jwt, token, bearer, oauth, oidc,
password, hash, bcrypt, argon2, scrypt, salt, pepper,
validate, sanitize, escape, encode, decode, htmlspecialchars,
sql, query, exec, eval, exec, spawn, child_process, subprocess,
cors, csp, helmet, xss, csrf, ssrf, sqli, rce, lfi, rfi,
secret, key, api_key, password, credential, private_key,
.env, process.env, os.environ, config, settings,
npm audit, pip-audit, cargo audit, snyk, dependabot, renovate,
vulnerability, CVE, advisory, security, exploit,
sandbox, jail, chroot, namespace, seccomp, apparmor
```

**Passes Owned:** 13 (full), 14 (full), 10 (security-relevant failure modes)

### Agent 7: Operations & Performance Auditor

**Scope:** Logging, metrics, health checks, resource management, deployment

**Search Keywords:**

```plaintext
log, logger, logging, winston, pino, bunyan, logrus, slog,
console.log, console.error, console.warn, print, println, debug,
metric, counter, gauge, histogram, timer, prometheus, statsd,
health, ready, live, healthcheck, readiness, liveness,
shutdown, graceful, SIGTERM, SIGINT, process.on, signal,
timeout, retry, backoff, circuit_breaker, bulkhead, fallback,
open, close, connect, disconnect, dispose, cleanup, finalize,
memory, heap, gc, garbage, leak, retain, reference,
cpu, thread, worker, pool, queue, backpressure, buffer,
deploy, release, rollback, migrate, upgrade, downgrade, version
```

**Passes Owned:** 15 (full), 16 (full), 18 (upgrade), 19 (rollback), 20 (release gates)

## 7\. Hidden Gaps Detection System

### The Trick: Search for Incompleteness Signals

Add this to EVERY audit pass to catch work that was started but never finished:

```plaintext
HIDDEN GAP SCAN — Append to Every Pass

Search the ENTIRE codebase for these patterns and treat each as
HIGH-RISK INCOMPLETE WORK until proven otherwise:

CODE INCOMPLETENESS SIGNALS:
- TODO / FIXME / HACK / XXX / TEMP / TEMPORARY
- "not implemented" / "not yet" / "coming soon" / "placeholder"
- "stub" / "mock" / "fake" / "dummy" / "sample" / "example only"
- "remove this" / "delete this" / "clean up" / "refactor"
- empty function bodies (function that does nothing)
- empty catch/except blocks (swallowed errors)
- "return null" / "return None" / "return undefined" / "return {}"
- commented-out code blocks (&gt;5 lines)
- console.log / print statements in production code

FEATURE FLAG SIGNALS:
- Feature flags that are never toggled (always true or always false)
- Conditional compilation that makes code unreachable
- Environment checks that disable features silently
- "experimental" / "beta" / "alpha" labels on user-facing features

CONFIGURATION SIGNALS:
- Config keys with no consumer in code
- Config keys in code with no config file entry
- Hardcoded values that should be configurable
- Magic numbers without named constants

DEPENDENCY SIGNALS:
- Imported modules never used
- Declared dependencies never imported
- Dev dependencies used in production code
- Duplicate dependencies (same library, different versions)

UI SIGNALS:
- Buttons with no click handler
- Forms with no submit handler
- Links to "#" or "javascript:void(0)"
- Menu items that don't navigate anywhere
- Disabled controls with no enable condition
- "Loading..." states that never resolve
- Error states that never clear

For EACH finding:
| Pattern | File | Line | Context | Risk Level | Action Required |

Risk Levels:
- CRITICAL: In runtime code path, affects user-facing feature
- HIGH: In runtime code path, affects internal behavior
- MEDIUM: In test code or development tooling
- LOW: In comments, docs, or dead code
```

## 8\. Defect Log Format (Fagan-Style)

Every audit pass produces defects in this format:

```plaintext
## Defect Log — Pass [N]: [Pass Name]

| ID | Severity | Category | File | Line(s) | Description | Evidence | Fix Suggestion | Status |
|----|----------|----------|------|---------|-------------|----------|----------------|--------|
| D001 | CRITICAL | Wiring | src/ui/Dashboard.tsx | 45-52 | Button "Deploy Agent" has onClick handler that only logs to console, does not call API | `onClick={() =&gt; console.log("deploy")}` | Wire to `/api/agents/deploy` endpoint | OPEN |
| D002 | HIGH | Test | tests/agent.test.ts | 12-30 | Agent dispatch test uses mock orchestrator; no integration test with real orchestrator exists | Mock: `jest.fn()` at line 15 | Add integration test using test container | OPEN |
```

### Severity Definitions

| Severity | Definition | Release Impact |
| --- | --- | --- |
| **CRITICAL** | Feature broken, security vulnerability, data loss risk, crash | **Blocks release** |
| **HIGH** | Feature partially broken, missing error handling, no test coverage for critical path | **Blocks release** |
| **MEDIUM** | Non-critical feature incomplete, test gap for edge case, docs inaccuracy | **Should fix before release** |
| **LOW** | Code quality issue, minor docs gap, cleanup opportunity | **Fix in next cycle** |
| **INFO** | Observation, optimization opportunity, style suggestion | **Optional** |

### Category Definitions

| Category | Examples |
| --- | --- |
| **Wiring** | UI not connected to API, API not connected to service |
| **Test** | Missing test, mock-only test, flaky test |
| **Security** | Auth bypass, injection risk, secret in code |
| **Data** | Schema mismatch, migration error, consistency issue |
| **Concurrency** | Race condition, deadlock, unprotected shared state |
| **Contract** | API schema mismatch, breaking change, serialization error |
| **Config** | Missing default, orphaned key, undocumented requirement |
| **Performance** | Memory leak, resource leak, blocking operation |
| **Ops** | Missing health check, no graceful shutdown, no logging |
| **Docs** | Inaccurate claim, missing section, outdated example |
| **Lifecycle** | Agent can't restart, no rollback path, upgrade breaks data |
| **Orphan** | Dead code, unreachable UI, unused route |
| **Incomplete** | TODO, stub, placeholder, empty handler |

## 9\. Feature Verification Matrix Template

```plaintext
## Feature Verification Matrix — Super-Goose

| # | Feature | Sub-Feature | UI Entrypoint (file:line) | API Route (method path) | Handler (file:line) | Data Model (file:line) | Unit Test | Integration Test | E2E Test | Status |
|---|---------|-------------|--------------------------|------------------------|--------------------|-----------------------|-----------|-----------------|----------|--------|
| F001 | Agent Dispatch | Create agent | src/ui/AgentPanel.tsx:45 | POST /api/agents | src/api/agents.ts:23 | src/models/Agent.ts:5 | tests/unit/agent.test.ts:12 | tests/int/agent.int.test.ts:8 | tests/e2e/agent.e2e.test.ts:15 | VERIFIED |
| F002 | Agent Dispatch | Stop agent | src/ui/AgentPanel.tsx:67 | DELETE /api/agents/:id | src/api/agents.ts:45 | — | tests/unit/agent.test.ts:34 | MISSING | MISSING | PARTIAL |
| F003 | Tool Registry | Register tool | MISSING | POST /api/tools | src/api/tools.ts:10 | src/models/Tool.ts:3 | MISSING | MISSING | MISSING | NOT TESTED |
```

### Status Legend

| Status | Meaning |
| --- | --- |
| **VERIFIED** | All columns populated with real references, all tests pass |
| **PARTIAL** | Some implementation exists, but gaps in chain (listed as MISSING) |
| **NOT IMPLEMENTED** | Feature is documented/specified but no code exists |
| **NOT TESTED** | Code exists and appears wired, but no tests prove it works |
| **BROKEN** | Code exists but fails when executed |
| **MOCK ONLY** | Tests exist but only use mocks; no real-path verification |

## 10\. Go/No-Go Decision Framework

### Decision Matrix

```plaintext
RELEASE DECISION: [PROJECT] v[VERSION] — [DATE]

SUMMARY:
- Total features: ___
- VERIFIED: ___ (___%)
- PARTIAL: ___ (___%)
- NOT IMPLEMENTED: ___
- NOT TESTED: ___
- BROKEN: ___

DEFECT SUMMARY:
- CRITICAL: ___
- HIGH: ___
- MEDIUM: ___
- LOW: ___
- INFO: ___

GATE STATUS:
Phase A (Structural): [PASS/FAIL]
Phase B (Data &amp; State): [PASS/FAIL]
Phase C (Evidence &amp; Proof): [PASS/FAIL]
Phase D (Security &amp; Dependencies): [PASS/FAIL]
Phase E (Performance &amp; Operations): [PASS/FAIL]
Phase F (Documentation &amp; Lifecycle): [PASS/FAIL]
Phase G (Release Gate): [PASS/FAIL]

DECISION:
[ ] GO — All phases PASS, zero CRITICAL/HIGH defects
[ ] CONDITIONAL GO — All phases PASS, HIGH defects have documented workarounds
[ ] NO-GO — Any phase FAIL, or any CRITICAL defect unresolved

BLOCKING ISSUES (if NO-GO):
| Issue | Pass | Severity | Fix ETA | Owner |

CONDITIONS (if CONDITIONAL GO):
| Condition | Workaround | Risk | Follow-up Deadline |
```

### Decision Rules

1.  **Any CRITICAL defect** → automatic NO-GO
2.  **Any phase FAIL** → automatic NO-GO
3.  **HIGH defects with workarounds** → CONDITIONAL GO (max 5 HIGH defects)
4.  **All GREEN, ≤10 MEDIUM defects** → GO
5.  **Feature completeness \<90%** → automatic NO-GO
6.  **Test evidence coverage \<80%** → automatic NO-GO
7.  **Any security gate FAIL** → automatic NO-GO regardless of other gates

## 11\. Master Audit Prompts (Copy/Paste Ready)

### Master Prompt: Full 20-Pass Audit

```plaintext
=== SUPER-GOOSE: FULL RELEASE-READINESS AUDIT ===

You are performing a 20-pass bidirectional traceability audit with Fagan-style
defect logging on the Super-Goose multi-agent orchestration system.

METHODOLOGY:
1. Bidirectional traceability: spec→code AND code→spec
2. No credit without file/line evidence
3. Default status: NOT VERIFIED until proven
4. Every finding goes in the Fagan defect log

EXECUTE THESE 20 PASSES IN ORDER:

PHASE A — STRUCTURAL DISCOVERY:
Pass 1: Inventory (routes, agents, UI, data, config, background jobs)
Pass 2: Forward Feature Traceability (feature → implementation chain)
Pass 3: Reverse Traceability (code → feature; orphan detection)
Pass 4: Wiring Verification (UI → API → service → state → response)

PHASE B — DATA &amp; STATE:
Pass 5: Data Integrity (schema, migrations, consistency, lifecycle)
Pass 6: Concurrency (shared state inventory, protection mechanisms)
Pass 7: API Contracts (schema versioning, backward compat, contract tests)
Pass 8: Configuration (key inventory, defaults, flags, drift)

PHASE C — EVIDENCE &amp; PROOF:
Pass 9: Test Evidence (coverage, mock policy, fixture quality, flakes)
Pass 10: Failure Modes (single-fault injection per major flow)
Pass 11: Chaos &amp; Cascading (multi-fault, resource exhaustion, cascading)
Pass 12: Idempotency (retry safety, side-effect control, crash recovery)

PHASE D — SECURITY &amp; DEPENDENCIES:
Pass 13: Security (STRIDE threat model, attack surface, vuln scan)
Pass 14: Dependency Health (abandonment, licensing, supply chain)

PHASE E — PERFORMANCE &amp; OPERATIONS:
Pass 15: Performance (resource lifecycle, memory leaks, latency budgets)
Pass 16: Observability (logging, metrics, health checks, runbooks)

PHASE F — DOCUMENTATION &amp; LIFECYCLE:
Pass 17: Documentation Accuracy (verify every claim in docs)
Pass 18: Upgrade &amp; Migration (v(N) → v(N+1) path tested)
Pass 19: Rollback &amp; Recovery (undo deployment, restore from backup)

PHASE G — RELEASE:
Pass 20: Release Gate (all gates checklist, go/no-go decision)

AGENT-SPECIFIC MODULES (run alongside relevant passes):
Module A: Agent Lifecycle (start/stop/pause/resume/crash/restart)
Module B: Tool Registration (schema, reachability, timeout, retry)
Module C: Agent Communication (message format, ordering, delivery)
Module D: Sandbox &amp; Isolation (execution scope, resource limits)

HIDDEN GAP SCAN (run on every pass):
Search for: TODO, FIXME, HACK, stubs, placeholders, empty handlers,
commented-out code, unreachable conditions, orphaned exports,
feature flags stuck on/off, dead code paths.

OUTPUT REQUIREMENTS:
1. Feature Verification Matrix (Pass 2)
2. Fagan Defect Log (all passes)
3. Go/No-Go Decision (Pass 20)

No assumptions. If you cannot prove it, mark it NOT VERIFIED.
```

### Quick Prompt: Single-Pass Audit

```plaintext
Perform Pass [N] of the Super-Goose audit framework.

Follow the pass instructions exactly. Output:
1. Structured findings table per the pass template
2. Fagan defect log entries for all issues found
3. Pass status: PASS / FAIL / PARTIAL

Include the hidden gap scan. No credit without file:line evidence.
```

### Quick Prompt: Targeted Audit (Specific Component)

```plaintext
Perform a focused audit on [COMPONENT NAME] in Super-Goose.

Run these passes against ONLY this component:
- Pass 2 (feature traceability for this component's features)
- Pass 4 (wiring verification for this component's UI/API)
- Pass 9 (test evidence for this component)
- Pass 13 (security for this component's entry points)
- Hidden gap scan

Output a mini-defect log and component-level pass/fail.
```

## Appendix A: Strictness Enforcement Phrases

Use these phrases verbatim in prompts to prevent hand-waving:

| Phrase | What It Enforces |
| --- | --- |
| "Bidirectional traceability matrix" | Agent must map both spec→code and code→spec |
| "Feature verification matrix with evidence" | Agent must provide file:line for every claim |
| "No credit without file/line references" | Agent cannot claim something works without proof |
| "Prove with tests or runtime reproduction steps" | Agent must show how to verify each claim |
| "List orphaned UI / orphaned API / orphaned features" | Agent must find things that exist but serve no purpose |
| "List all feature flags and their default states" | Agent must inventory toggle-able behavior |
| "Enumerate routes and map each to a feature" | Agent must do reverse traceability on API layer |
| "Enumerate UI entrypoints and map each to behavior" | Agent must do reverse traceability on UI layer |
| "Defect log (Fagan-style): ID, severity, file, evidence, fix suggestion" | Agent must produce structured, actionable findings |
| "No assumptions — if you cannot prove it, mark NOT VERIFIED" | Agent cannot skip items or assume correctness |
| "Search for TODO/FIXME/HACK and treat as high-risk incomplete work" | Agent must hunt for hidden incompleteness |
| "Simulate crash at every stage and verify recovery" | Agent must test crash resilience systematically |
| "Verify every write has a corresponding read path" | Agent must check data flow completeness |
| "Enumerate shared mutable state and prove protection" | Agent must find concurrency risks |
| "Run every README command and confirm it works" | Agent must verify documentation accuracy |

## Appendix B: Anti-Pattern Detection Keywords

### Runtime Code (should not contain)

```plaintext
TODO, FIXME, HACK, XXX, TEMP, TEMPORARY, PLACEHOLDER, STUB, MOCK,
"not implemented", "not yet", "coming soon", "work in progress",
"remove this", "delete this", "clean up later", "refactor",
console.log (production), print (production), debugger,
"return null", "return None", "return undefined", "return {}",
"pass" (empty function body), "noop", "no-op",
"sample", "example", "demo", "test" (in production paths),
"fake", "dummy", "lorem ipsum"
```

### UI Code (signals of incomplete wiring)

```plaintext
disabled (without enable condition), hidden (without show condition),
"#" (href), "javascript:void(0)", onclick="" (empty handler),
"Loading..." (without loading state management),
"Error" (without error details), "Something went wrong" (generic),
"Coming soon", "Under construction", "Not available"
```

### Test Code (signals of insufficient testing)

```plaintext
.skip, .only, @skip, @ignore, xdescribe, xit, xtest,
"TODO: add test", "pending", "not implemented",
jest.fn() (without verify), mock (without real-path companion),
expect(true).toBe(true), assert True (trivial assertion),
# flaky, # intermittent, # sometimes fails
```

## Appendix C: Audit Pass Dependency Graph

```plaintext
graph TD
    P1[Pass 1: Inventory] --&gt; P2[Pass 2: Forward Traceability]
    P1 --&gt; P3[Pass 3: Reverse Traceability]
    P1 --&gt; P4[Pass 4: Wiring Verification]

    P2 --&gt; P9[Pass 9: Test Evidence]
    P3 --&gt; P9
    P4 --&gt; P9

    P1 --&gt; P5[Pass 5: Data Integrity]
    P1 --&gt; P6[Pass 6: Concurrency]
    P1 --&gt; P7[Pass 7: API Contracts]
    P1 --&gt; P8[Pass 8: Configuration]

    P4 --&gt; P10[Pass 10: Failure Modes]
    P6 --&gt; P11[Pass 11: Chaos &amp; Cascading]
    P5 --&gt; P12[Pass 12: Idempotency]
    P10 --&gt; P11

    P1 --&gt; P13[Pass 13: Security]
    P7 --&gt; P13
    P1 --&gt; P14[Pass 14: Dependency Health]

    P1 --&gt; P15[Pass 15: Performance]
    P6 --&gt; P15
    P1 --&gt; P16[Pass 16: Observability]

    P2 --&gt; P17[Pass 17: Documentation Accuracy]
    P5 --&gt; P18[Pass 18: Upgrade &amp; Migration]
    P18 --&gt; P19[Pass 19: Rollback &amp; Recovery]

    P9 --&gt; P20[Pass 20: Release Gate]
    P11 --&gt; P20
    P13 --&gt; P20
    P16 --&gt; P20
    P17 --&gt; P20
    P19 --&gt; P20

    MA[Module A: Agent Lifecycle] --&gt; P6
    MA --&gt; P11
    MB[Module B: Tool Registration] --&gt; P7
    MC[Module C: Agent Communication] --&gt; P6
    MC --&gt; P12
    MD[Module D: Sandbox &amp; Isolation] --&gt; P13

    style P20 fill:#f55,stroke:#333,stroke-width:3px,color:#fff
    style P1 fill:#4a9,stroke:#333,stroke-width:2px,color:#fff
```

### Execution Order

**Sequential Dependencies (must run in order):**

1.  Pass 1 → everything else (inventory is the foundation)
2.  Pass 10 → Pass 11 (single-fault before multi-fault)
3.  Pass 18 → Pass 19 (upgrade before rollback)
4.  All passes → Pass 20 (release gate is the final aggregation)

**Parallelizable Groups (can run simultaneously):**

*   Group 1: Passes 2, 3, 4 (structural discovery, after Pass 1)
*   Group 2: Passes 5, 6, 7, 8 (data & state, after Pass 1)
*   Group 3: Passes 13, 14 (security, after Pass 1)
*   Group 4: Passes 15, 16 (operations, after Pass 1)
*   Group 5: Modules A, B, C, D (agent-specific, after Pass 1)

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 2.0 | 2026-02-09 | Complete rewrite: expanded from 8 to 20 passes, added agent-specific modules, dependency graph, Go/No-Go framework, specialized auditor roles, hidden gap detection system |
| 1.0 | — | Original 8-pass framework with basic traceability |

_This document is a standing contract. Every release of Super-Goose must pass all 20 audit passes and all agent-specific modules before shipping._