# AG-UI Protocol Adoption Plan for Super-Goose

## Overview

This document maps Super-Goose's current custom IPC layer to the AG-UI protocol,
enabling standardized agent-user communication that is interoperable with the
CopilotKit/LangGraph/CrewAI ecosystem.

## Protocol Stack

```
User <──[AG-UI]──> Electron/React Frontend <──[AG-UI SSE]──> Rust Backend (goosed)
                                                              ├──[MCP]──> Tools/Extensions
                                                              ├──[A2A]──> Peer Agents (future)
                                                              └──[A2UI]──> Generative UI (future)
```

## Current → AG-UI Event Mapping

### Lifecycle Events

| Current | AG-UI | Fields |
|---------|-------|--------|
| (none - implicit) | `RUN_STARTED` | `threadId`, `runId` |
| (none - implicit) | `RUN_FINISHED` | `threadId`, `runId`, `result` |
| (none) | `RUN_ERROR` | `message`, `code` |
| (none) | `STEP_STARTED` | `stepName` (maps to pipeline stages) |
| (none) | `STEP_FINISHED` | `stepName` |

### Text Message Events (Chat Stream → AG-UI)

| Current (useChatStream) | AG-UI | Notes |
|--------------------------|-------|-------|
| `Message` (start) | `TEXT_MESSAGE_START` | `messageId`, `role: "assistant"` |
| `Message` (content) | `TEXT_MESSAGE_CONTENT` | `messageId`, `delta: string` |
| `Finish` | `TEXT_MESSAGE_END` | `messageId` |

### Tool Call Events

| Current | AG-UI | Notes |
|---------|-------|-------|
| `ToolCalled` (SSE) | `TOOL_CALL_START` | `toolCallId`, `toolCallName` |
| (not streamed) | `TOOL_CALL_ARGS` | Incremental args (new capability) |
| (not streamed) | `TOOL_CALL_END` | Completion marker |
| (not available) | `TOOL_CALL_RESULT` | Tool output to frontend (new) |

### State Events

| Current | AG-UI | Notes |
|---------|-------|-------|
| `AgentStatus` (SSE) | `STATE_SNAPSHOT` | Full agent state object |
| `CoreSwitched` (SSE) | `STATE_DELTA` | JSON Patch: `{op:"replace", path:"/core_type", value:"..."}` |
| `ExperienceRecorded` (SSE) | `STATE_DELTA` | JSON Patch: `{op:"replace", path:"/total_experiences", value:N}` |
| Polling (useSuperGooseData) | `STATE_SNAPSHOT` | Replace 5s polling with push events |

### Activity Events

| Current | AG-UI | Notes |
|---------|-------|-------|
| `TaskUpdate` (SSE) | `ACTIVITY_SNAPSHOT` | `activityType: "TASK"` |
| OTA `build-status` (polling) | `ACTIVITY_SNAPSHOT` | `activityType: "OTA_BUILD"` |
| Autonomous status (polling) | `ACTIVITY_SNAPSHOT` | `activityType: "AUTONOMOUS"` |

### Reasoning Events (NEW - enables CoT stream)

| Current | AG-UI | Notes |
|---------|-------|-------|
| (none) | `REASONING_START` | Chain-of-thought begins |
| (none) | `REASONING_MESSAGE_CONTENT` | Streaming reasoning text |
| (none) | `REASONING_END` | Chain-of-thought complete |

### Custom Events (Super-Goose specific)

| Current | AG-UI | Notes |
|---------|-------|-------|
| `Heartbeat` (SSE) | `CUSTOM` | `name: "heartbeat"` |
| OTA restart detection | `CUSTOM` | `name: "ota_restart"` |
| Pipeline stage change | `CUSTOM` | `name: "pipeline_stage"` |
| Safety alert | `CUSTOM` | `name: "safety_alert"` |
| Cost update | `CUSTOM` | `name: "cost_update"` |

### HITL (Human-in-the-Loop) via Tool Call Pattern

AG-UI models approval gates as special tool calls:

```
TOOL_CALL_START  { toolCallId: "...", toolCallName: "request_approval" }
TOOL_CALL_ARGS   { toolCallId: "...", delta: '{"action":"delete files","risk":"high"}' }
TOOL_CALL_END    { toolCallId: "..." }
  -- frontend shows approval UI --
TOOL_CALL_RESULT { toolCallId: "...", content: '{"approved": true}' }
```

This replaces custom SGApprovalGate wiring with a protocol-level pattern.

## Implementation Architecture

### Backend (Rust): `ag_ui_stream.rs`

New SSE endpoint: `GET /api/ag-ui/stream`

```rust
// AG-UI event types
enum AgUiEventType {
    RunStarted, RunFinished, RunError,
    StepStarted, StepFinished,
    TextMessageStart, TextMessageContent, TextMessageEnd,
    ToolCallStart, ToolCallArgs, ToolCallEnd, ToolCallResult,
    StateSnapshot, StateDelta, MessagesSnapshot,
    ActivitySnapshot, ActivityDelta,
    ReasoningStart, ReasoningMessageStart, ReasoningMessageContent,
    ReasoningMessageEnd, ReasoningEnd,
    Custom,
}

// Each event is a JSON object with `type` field + payload
struct AgUiEvent {
    r#type: AgUiEventType,
    timestamp: Option<i64>,
    // ... variant-specific fields via serde enum
}
```

### Frontend (React): `useAgUi.ts`

New hook replacing `useAgentStream` + `useSuperGooseData`:

```typescript
import { AgUiEvent, EventType } from './ag-ui-types';

interface UseAgUiReturn {
  // Lifecycle
  runId: string | null;
  isRunning: boolean;
  currentStep: string | null;

  // Messages
  messages: AgUiMessage[];

  // State (replaces polling)
  agentState: AgentState;

  // Tool calls (with HITL)
  pendingApprovals: ToolCallApproval[];
  approveToolCall: (toolCallId: string) => void;
  rejectToolCall: (toolCallId: string) => void;

  // Activity
  activities: ActivityMessage[];

  // Reasoning (CoT stream)
  reasoning: ReasoningMessage[];

  // Custom events
  customEvents: CustomEvent[];

  // Connection
  connected: boolean;
  error: Error | null;
}
```

## Phase Plan

### Phase 0: Types & Transport (this PR)
1. Define AG-UI TypeScript types (`ag-ui-types.ts`)
2. Define AG-UI Rust event enum (`ag_ui_stream.rs`)
3. Create SSE endpoint `GET /api/ag-ui/stream`
4. Create `useAgUi` React hook consuming the stream
5. Tests for all new code

### Phase 1: Wire Existing Events
- Map `AgentStatus` → `STATE_SNAPSHOT`
- Map `ToolCalled` → `TOOL_CALL_START/END`
- Map `CoreSwitched` → `STATE_DELTA`
- Map `Heartbeat` → `CUSTOM`
- Replace `useSuperGooseData` polling with push events

### Phase 2: New Capabilities
- Wire chat stream → `TEXT_MESSAGE_*` events
- Wire reasoning → `REASONING_*` events
- Wire HITL approvals → tool call pattern
- Wire pipeline stages → `STEP_STARTED/FINISHED`

### Phase 3: Replace Custom IPC
- Deprecate `/api/agent-stream` in favor of `/api/ag-ui/stream`
- Update all panels to consume `useAgUi` hook
- Remove polling from `useSuperGooseData`

### Phase 4: Ecosystem Interop
- Expose AG-UI endpoint for external CopilotKit frontends
- Add A2A Agent Card at `/.well-known/agent-card.json`
- Support A2UI component rendering via CUSTOM events
