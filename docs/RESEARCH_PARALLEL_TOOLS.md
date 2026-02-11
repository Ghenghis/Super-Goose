# Research: Parallel Tool Execution for Super-Goose

**Date:** 2026-02-11
**Status:** Research Complete
**Author:** Claude Opus 4.6

---

## Executive Summary

When an LLM returns multiple `tool_use` blocks in a single response, Super-Goose currently
dispatches them **sequentially at the dispatch layer** but then consumes their result streams
**concurrently via `stream::select_all`**. The dispatch step (`dispatch_tool_call`) is called
in a `for` loop with `.await`, meaning each tool's initial setup (including the
`ExtensionManager` lock acquisition) happens one at a time. However, because
`dispatch_tool_call` returns a *future* (wrapped in `ToolCallResult`) rather than the final
result, the actual MCP network I/O is deferred. The result futures are then polled concurrently
through `stream::select_all`. **Despite this, true parallelism is blocked by a per-MCP-server
`Mutex` that serializes all calls to the same MCP connection.**

The primary opportunity is to parallelize tool calls that target **different** MCP servers,
and to restructure the MCP client locking so that calls to the **same** server can overlap
when the protocol supports it.

Expected improvement: **1.5x-3x latency reduction** for multi-tool responses where tools
span different MCP extensions, and **2x-5x** if same-server parallelism is also unlocked.

---

## 1. Current Execution Flow

### 1.1 High-Level Architecture

```
LLM Response (multiple tool_use blocks)
    |
    v
categorize_tool_requests()          [reply_parts.rs:333]
    |-- frontend_requests  (UI tools, handled sequentially)
    |-- remaining_requests (backend/MCP tools)
    v
tool_inspection_manager.inspect_tools()   [agent.rs:2337]
    |
    v
process_inspection_results_with_permission_inspector()
    |-- approved[]
    |-- needs_approval[]
    |-- denied[]
    v
handle_approved_and_denied_tools()   [agent.rs:531]  <-- SEQUENTIAL dispatch
    |
    v  (for each approved tool, sequentially)
dispatch_tool_call()                 [agent.rs:1074]
    |-- returns (request_id, ToolCallResult { future, notification_stream })
    v
handle_approval_tool_requests()      [tool_execution.rs:52]  <-- SEQUENTIAL (user interaction)
    |
    v
stream::select_all(tool_futures)     [agent.rs:2404]  <-- CONCURRENT result polling
    |
    v
Collect results into tool_response_messages[]
```

### 1.2 The Two Bottlenecks

**Bottleneck 1: Sequential Dispatch in `handle_approved_and_denied_tools`**

File: `crates/goose/src/agents/agent.rs`, lines 531-570

```rust
for request in &permission_check_result.approved {
    if let Ok(tool_call) = request.tool_call.clone() {
        let (req_id, tool_result) = self
            .dispatch_tool_call(
                tool_call,
                request.id.clone(),
                cancel_token.clone(),
                session,
            )
            .await;   // <-- BLOCKS until dispatch_tool_call completes

        tool_futures.push((req_id, /* stream */));
    }
}
```

The `dispatch_tool_call` method is `async` and is awaited inside a sequential loop.
For MCP tools, it calls `extension_manager.dispatch_tool_call_with_guard()` which:
1. Locks `extensions: Mutex<HashMap>` to find the client (quick)
2. Locks `client: McpClientBox` to subscribe to notifications (quick)
3. Creates a future capturing the `client` Arc for later execution

The dispatch itself is fast (it creates a future, does not await the MCP response), so this
bottleneck is **relatively minor** -- maybe 1-5ms per tool for setup overhead.

**Bottleneck 2: Per-MCP-Server Serialization via `McpClientBox` Mutex**

File: `crates/goose/src/agents/extension_manager.rs`, lines 1307-1330

```rust
let fut = async move {
    let client_guard = client.lock().await;  // <-- Holds lock for ENTIRE call
    client_guard
        .call_tool(&session_id, &tool_name, arguments, ...)
        .await   // <-- MCP round-trip happens under this lock
};
```

The `McpClientBox` is `Arc<Mutex<Box<dyn McpClientTrait>>>`. The future captures
`client.clone()` (cloning the `Arc`) and then locks the mutex for the entire duration of
`call_tool`, which includes the full MCP network round-trip.

Inside `McpClient::send_request_with_context` (mcp_client.rs:388-421):
```rust
let handle = {
    let client = self.client.lock().await;       // Lock RunningService
    client.service().set_current_session_id(session_id).await;
    client.send_cancellable_request(request, ...).await
};  // RunningService lock released here

let result = await_response(handle, ...).await;  // Wait for response (unlocked)

let client = self.client.lock().await;           // Re-lock to clear session
client.service().clear_current_session_id().await;
```

The inner `RunningService` lock is released before `await_response`, but:
- The **outer** `McpClientBox` mutex (from extension_manager) is held during the entire
  `call_tool` call, including `await_response`
- The `current_session_id` single-slot design also enforces serialization
- **Result: Two tools targeting the same MCP server CANNOT run concurrently**

### 1.3 Where Concurrency Already Exists

After all dispatches complete, `stream::select_all` (agent.rs:2404) polls all tool streams
concurrently. Since the underlying futures are lazy, the actual MCP calls happen here.
However, because tools sharing the same MCP server contend on the same `McpClientBox` mutex,
they effectively serialize at this point.

Tools targeting **different** MCP servers already benefit from `select_all` since they hold
different mutexes and can truly run concurrently. The dispatch loop's sequential nature adds
a small constant overhead per tool (future construction time).

---

## 2. Exact Code Locations for Parallelization

### 2.1 Dispatch Loop Parallelization (Low Hanging Fruit)

**File:** `crates/goose/src/agents/agent.rs`
**Function:** `handle_approved_and_denied_tools` (line 531)
**Change:** Replace sequential `for` loop with parallel dispatch using `futures::future::join_all`

Current:
```rust
for request in &permission_check_result.approved {
    let (req_id, tool_result) = self.dispatch_tool_call(...).await;
    tool_futures.push(...);
}
```

Proposed:
```rust
let dispatch_futures: Vec<_> = permission_check_result.approved.iter()
    .filter_map(|request| {
        request.tool_call.clone().ok().map(|tool_call| {
            let request_id = request.id.clone();
            let cancel = cancel_token.clone();
            async move {
                self.dispatch_tool_call(tool_call, request_id, cancel, session).await
            }
        })
    })
    .collect();

let dispatched = futures::future::join_all(dispatch_futures).await;
for (req_id, tool_result) in dispatched {
    tool_futures.push((req_id, /* build stream */));
}
```

**Impact:** Minor improvement (~1-5ms saved per additional tool). The dispatch itself is fast
since it only creates futures. This is still worth doing for correctness of intent.

### 2.2 MCP Client Lock Restructuring (High Impact)

**File:** `crates/goose/src/agents/extension_manager.rs`
**Function:** `dispatch_tool_call_with_guard` (line 1202)
**Change:** Move the `McpClientBox` lock inside a narrower scope so it's only held during
the `send_cancellable_request` call, not during `await_response`.

Current (line 1314):
```rust
let fut = async move {
    let client_guard = client.lock().await;  // Lock held for entire round-trip
    client_guard.call_tool(...).await
};
```

This requires changing `McpClientTrait::call_tool` or introducing a new method that returns
a handle/oneshot receiver, allowing the lock to be released before waiting for the response.

**File:** `crates/goose/src/agents/mcp_client.rs`
**Function:** `send_request_with_context` (line 388)
**Change:** The `current_session_id` single-slot pattern must be replaced with a per-request
session ID mechanism (e.g., using the MCP `_meta` extensions field which already carries the
session ID).

### 2.3 Approval Flow Parallelization (Medium Impact)

**File:** `crates/goose/src/agents/tool_execution.rs`
**Function:** `handle_approval_tool_requests` (line 52)
**Change:** This is inherently sequential because it waits for user input per tool. However,
tools that have already been approved (via `AlwaysAllow`) could be dispatched immediately
without entering the approval loop. The current code handles this via
`handle_approved_and_denied_tools` for pre-approved tools, so this is already partially
optimized.

---

## 3. Safety Analysis: Which Tools Can Be Parallelized

### 3.1 Safe to Parallelize (Read-Only / Independent)

| Tool Category | Example Tools | Rationale |
|---|---|---|
| File reading | `read_file`, `list_dir` | No side effects, idempotent |
| Search | `ripgrep`, `grep`, `find` | Read-only operations |
| Resource listing | MCP `list_resources`, `list_tools` | Server-side read-only |
| Information retrieval | `web_search`, `fetch_url` | No local side effects |
| Code analysis | `get_symbols`, `find_references` | Read-only |

### 3.2 Conditionally Safe (With Constraints)

| Tool Category | Example Tools | Constraint |
|---|---|---|
| File writes to **different files** | `write_file`, `create_file` | Different paths = safe |
| Shell commands (read-only) | `bash -c "ls"`, `git status` | Must verify command intent |
| MCP tools on **different servers** | tools from different extensions | Already independent |

### 3.3 Unsafe to Parallelize

| Tool Category | Example Tools | Risk |
|---|---|---|
| File writes to **same file** | Multiple `write_file` to same path | Race condition, data corruption |
| Shell commands with side effects | `git commit`, `npm install` | Ordering matters |
| Stateful MCP tools on **same server** | Consecutive DB operations | Server-side state dependencies |
| Subagent execution | `subagent_tool` | Creates child agents, resource-heavy |
| Extension management | `manage_extensions` | Modifies tool registry |
| Schedule management | `manage_schedule` | Modifies system state |

### 3.4 MCP Protocol Considerations

The MCP protocol itself supports concurrent requests per connection. The `rmcp` library
uses `send_cancellable_request` which sends the request and returns a `RequestHandle` with
a `oneshot::Receiver`. The underlying transport (stdio or SSE) multiplexes request/response
pairs using JSON-RPC `id` fields. **The serialization is imposed by Super-Goose's locking,
not by the protocol.**

However, some MCP servers may not handle concurrent requests well:
- **stdio-based servers** (single process): May serialize internally
- **SSE/HTTP servers**: Generally handle concurrency well
- **Servers with rate limits**: Need backpressure (already partially implemented)

---

## 4. Implementation Plan

### Phase 1: Cross-Extension Parallelism (Low Risk, Medium Impact)

**Goal:** Allow tools targeting different MCP servers to run truly in parallel.

**Changes:**

1. **`agent.rs::handle_approved_and_denied_tools`** -- Replace sequential dispatch loop with
   `futures::future::join_all` for approved tools. Since `dispatch_tool_call` mostly constructs
   futures (not awaiting MCP responses), this is a small change:

   ```rust
   // Group by extension name for awareness, but dispatch all in parallel
   let dispatch_futs: Vec<_> = permission_check_result.approved.iter()
       .filter_map(|req| { /* ... */ })
       .collect();
   let results = futures::future::join_all(dispatch_futs).await;
   ```

2. **`tool_execution.rs::handle_approval_tool_requests`** -- Same pattern for the approval
   flow: after user approves, dispatch immediately and push to tool_futures.

3. **No changes to MCP client or extension_manager** -- The existing `stream::select_all`
   already provides cross-extension concurrency for the result phase.

**Estimated Effort:** 1-2 days
**Risk:** Very low -- dispatch is already mostly non-blocking
**Performance Gain:** ~10-20% for multi-tool responses (dispatch overhead reduction)

### Phase 2: Same-Extension Parallelism (Medium Risk, High Impact)

**Goal:** Allow multiple tools targeting the same MCP server to execute concurrently.

**Changes:**

1. **`extension_manager.rs::dispatch_tool_call_with_guard`** -- Restructure the future to
   acquire and release the `McpClientBox` lock before awaiting the response:

   ```rust
   let fut = async move {
       // Acquire lock only for sending
       let handle = {
           let client_guard = client.lock().await;
           client_guard.start_call_tool(session_id, tool_name, arguments, cancel_token).await
       }; // Lock released here

       // Wait for response without holding the lock
       handle.await
   };
   ```

2. **`mcp_client.rs`** -- Add a `start_call_tool` method that sends the request and returns
   a response handle without waiting:

   ```rust
   async fn start_call_tool(
       &self,
       session_id: &str,
       name: &str,
       arguments: Option<JsonObject>,
       working_dir: Option<&str>,
       cancel_token: CancellationToken,
   ) -> Result<ResponseHandle, Error> {
       // send_request returns handle, caller awaits result
   }
   ```

3. **`mcp_client.rs::current_session_id`** -- Replace single-slot with per-request session ID.
   The `_meta` extensions field already carries the session ID, so the callback resolution can
   use that instead of the single-slot `current_session_id`.

4. **`McpClientTrait`** -- Add `start_call_tool` to the trait, with a default implementation
   that falls back to the current `call_tool` behavior.

**Estimated Effort:** 3-5 days
**Risk:** Medium -- changes MCP client internals; needs thorough testing
**Performance Gain:** 2x-5x for multi-tool responses targeting the same extension

### Phase 3: Smart Parallelism with Safety Analysis (Medium Risk, Medium Impact)

**Goal:** Automatically determine which tools can safely run in parallel.

**Changes:**

1. **New module: `crates/goose/src/agents/parallel_safety.rs`**
   - Analyze tool names and arguments to determine parallelizability
   - Check for file path conflicts (two writes to the same file)
   - Check for known stateful tool patterns (git operations, package managers)
   - Expose `ParallelizationPlan` struct with groups of tools that can run together

2. **Tool metadata** -- Extend `ToolInfo` or MCP tool annotations to include:
   - `readonly: bool`
   - `side_effect_scope: Option<String>` (e.g., file path, git repo)
   - `supports_concurrent: bool`

3. **Integration with rate limiting** -- The existing `tool_call_counts` rate limiter
   (agent.rs:2279) applies backpressure per-tool. This should be extended to consider
   parallel execution:
   ```rust
   // Current: per-tool rate limiting with 50 calls/minute/tool
   // New: also track concurrent execution count per extension
   ```

**Estimated Effort:** 5-8 days
**Risk:** Medium -- requires heuristics for safety classification
**Performance Gain:** Enables confident parallelization in more scenarios

---

## 5. Risk Assessment

### 5.1 Race Conditions

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Two tools write to same file | Medium | High | Check file paths before parallel dispatch |
| Two tools modify same git state | Medium | High | Serialize git-related tools |
| MCP server can't handle concurrent requests | Low | Medium | Per-extension concurrency limit config |
| Notification stream interleaving | Low | Low | Notifications already tagged with request ID |
| Tool result ordering changes | High | Low | `select_all` already has non-deterministic ordering |

### 5.2 Ordering Guarantees

**Current behavior:** Tools from a single LLM response are dispatched in order but their
results may arrive out of order (via `select_all`). The conversation history preserves the
original tool_use ordering (from the assistant message), and each tool_response is matched
by ID, not by position.

**With parallel execution:** Same guarantees -- results are matched by ID. The LLM already
handles out-of-order tool results correctly since providers match `tool_use_id` to
`tool_result_id`.

**Important:** The code at agent.rs:2497-2513 iterates through tool requests in order to
build `messages_to_add`. This preserves ordering in the conversation regardless of when
results arrive.

### 5.3 Error Handling

If one parallel tool fails, the others should continue. This is already the behavior with
`select_all` -- each stream produces its own result independently. The reflexion agent
(agent.rs:2543) correctly handles partial failures.

### 5.4 Cancellation

The `CancellationToken` is already cloned per-tool (cancel_token.clone() at line 547).
Cancelling one tool doesn't cancel others. This is correct for parallel execution.

---

## 6. Performance Estimates

### Scenario: 3 tools from 3 different extensions

| Metric | Sequential | Parallel (Phase 1+2) | Speedup |
|---|---|---|---|
| Dispatch overhead | 3 * 5ms = 15ms | 5ms (parallel) | 3x |
| MCP round-trip (if independent) | 3 * 200ms = 600ms | 200ms (parallel) | 3x |
| **Total tool phase** | **615ms** | **205ms** | **3x** |

### Scenario: 3 tools from same extension

| Metric | Sequential | Phase 1 only | Phase 2 | Speedup |
|---|---|---|---|---|
| Dispatch overhead | 15ms | 5ms | 5ms | -- |
| MCP round-trips | 600ms | 600ms (serialized by lock) | 200ms | 3x |
| **Total** | **615ms** | **605ms** | **205ms** | **3x** |

### Scenario: 5 tools, mix of 2 extensions (3 from ext A, 2 from ext B)

| Metric | Sequential | Phase 1+2 |
|---|---|---|
| Dispatch | 25ms | 5ms |
| MCP round-trips | 1000ms | max(600ms, 400ms) = 600ms with Phase 1; 200ms with Phase 2 |
| **Total** | **1025ms** | **205ms (Phase 2)** / **605ms (Phase 1)** |

### Real-World Impact

Claude Code and Cursor reportedly execute tools in parallel, achieving 2-5x latency
improvements. For Super-Goose, the most common multi-tool patterns are:
- **Read multiple files** (same extension, read-only): Phase 2 needed for full benefit
- **Read file + search** (different extensions): Phase 1 sufficient
- **Write file + run test** (sequential dependency): Cannot parallelize
- **Multiple search queries** (same extension): Phase 2 needed

---

## 7. Integration with Existing Rate Limiting

### 7.1 Current Rate Limiting (agent.rs:2277-2303)

```rust
let mut counts = self.tool_call_counts.lock().await;
let window = Duration::from_secs(60);
let max_calls_per_tool: u32 = 50;

for req in remaining_requests.iter() {
    if let Ok(ref tc) = req.tool_call {
        let entry = counts.entry(tc.name.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) > window {
            *entry = (1, now);
        } else {
            entry.0 += 1;
            if entry.0 > max_calls_per_tool {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
}
```

This rate limiting runs **before** tool dispatch, counting all tool calls in the current
response. It applies a 500ms backpressure sleep when a single tool exceeds 50 calls per
minute.

### 7.2 Changes Needed for Parallel Execution

1. **Concurrent execution count tracking**: Add a per-extension semaphore to limit how many
   tools execute simultaneously on the same MCP server:
   ```rust
   // In ExtensionManager or a new ParallelExecutor
   extension_semaphores: HashMap<String, Arc<Semaphore>>
   // Default: 4 concurrent calls per extension, configurable per extension
   ```

2. **Rate limit check must happen before dispatch, not during**: The current approach checks
   all tools in the batch before dispatching any. This is compatible with parallel execution
   since the check is a pre-pass.

3. **Backpressure integration**: The 500ms sleep should apply per-tool, not globally. With
   parallel execution, only the rate-limited tool should sleep, not all tools:
   ```rust
   // Instead of sleeping in the pre-check, apply per-tool semaphore with timeout
   let permit = extension_semaphores[&ext_name]
       .acquire_timeout(Duration::from_millis(500))
       .await;
   ```

### 7.3 RepetitionInspector

The `RepetitionInspector` (tool_monitor.rs) checks for repetitive tool call patterns across
turns. It operates on the conversation history, not on the current batch. Parallel execution
does not affect this inspector since it examines historical patterns.

---

## 8. Key Files Reference

| File | Relevance |
|---|---|
| `crates/goose/src/agents/agent.rs:531-570` | `handle_approved_and_denied_tools` -- sequential dispatch loop |
| `crates/goose/src/agents/agent.rs:1074-1221` | `dispatch_tool_call` -- routes to MCP/subagent/platform |
| `crates/goose/src/agents/agent.rs:2370-2467` | Main tool execution loop with `select_all` |
| `crates/goose/src/agents/tool_execution.rs:52-147` | Approval flow (sequential by necessity) |
| `crates/goose/src/agents/extension_manager.rs:1202-1336` | `dispatch_tool_call_with_guard` -- creates MCP future |
| `crates/goose/src/agents/extension_manager.rs:53` | `McpClientBox` type definition |
| `crates/goose/src/agents/extension_manager.rs:919-926` | `get_client_for_tool` -- maps tool name to MCP client |
| `crates/goose/src/agents/mcp_client.rs:336-342` | `McpClient` struct with inner `Mutex<RunningService>` |
| `crates/goose/src/agents/mcp_client.rs:388-421` | `send_request_with_context` -- lock/send/unlock/await pattern |
| `crates/goose/src/agents/mcp_client.rs:109` | `current_session_id` single-slot comment |
| `crates/goose/src/agents/reply_parts.rs:333` | `categorize_tool_requests` -- frontend vs backend split |
| `crates/goose/src/tool_monitor.rs` | `RepetitionInspector` -- repetitive pattern detection |

---

## 9. Recommended Implementation Order

1. **Phase 1** (1-2 days): Parallelize dispatch loop. Low risk, enables cross-extension
   concurrency that was always theoretically possible.

2. **Phase 2** (3-5 days): Restructure MCP client locking. This is the high-impact change
   that unlocks same-server parallelism. Requires careful testing of the `current_session_id`
   replacement.

3. **Phase 3** (5-8 days): Smart safety analysis. Build heuristics for automatically
   classifying tool parallelizability. Consider making this opt-in with a config flag.

4. **Phase 4** (optional, 2-3 days): Extension-level concurrency configuration. Allow MCP
   extension configs to specify `max_concurrent_calls` and `supports_parallel: bool`.

---

## 10. Open Questions

1. **Should the LLM be informed about parallel execution?** Some models might generate
   better tool calls if they know tools will run in parallel (e.g., avoid file conflicts).

2. **Should we add a `--parallel-tools` CLI flag?** For backward compatibility, parallel
   execution could be opt-in initially.

3. **How do MCP server notifications interact with parallel calls?** Currently, notifications
   are broadcast to all subscribers. With parallel execution, notification routing may need
   to be per-request rather than per-connection.

4. **What about the subagent tool?** The code already prevents subagents from nesting
   (agent.rs:1083). Should subagent execution be excluded from parallelization entirely?
   It creates child agents which are resource-intensive.

5. **Impact on the CompactionManager?** Parallel tool execution means more tool results
   arrive at once, potentially triggering compaction more aggressively. The
   `check_if_compaction_needed` call should account for batch sizes.
