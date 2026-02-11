# Anthropic Prompt Caching — Implementation Plan

## Status: IMPLEMENTED (v1.24.06)

## Executive Summary

Anthropic prompt caching allows marking parts of API requests (system prompts, tool
definitions, conversation history) with `cache_control: {"type": "ephemeral"}` breakpoints.
Cached prefixes are stored server-side for 5 minutes (extended on each hit), and subsequent
requests that share the same prefix pay reduced token costs:

| Token Type               | Pricing vs Base Input |
|--------------------------|-----------------------|
| `input_tokens`           | 1.0x (base rate)      |
| `cache_creation_input_tokens` | 1.25x (write penalty) |
| `cache_read_input_tokens`     | 0.10x (90% savings)  |

For multi-turn coding sessions with large system prompts and many tools (typical Super-Goose
usage), cache reads dominate after the first turn, yielding **~80-90% input cost reduction**.

---

## Pre-Existing Implementation (Already in Codebase)

The following was already implemented in the upstream `block/goose` codebase:

### Request Building (`crates/goose/src/providers/formats/anthropic.rs`)

1. **`format_system()`** — Already adds `cache_control: {"type": "ephemeral"}` to the
   system prompt text block.

2. **`format_tools()`** — Already adds `cache_control: {"type": "ephemeral"}` to the
   **last** tool definition (caching all tools as a single prefix).

3. **`format_messages()`** — Already adds `cache_control` to the last content block of the
   **last 2 user messages** (enabling incremental conversation caching).

### Response Parsing (`get_usage()`)

Already parses `cache_creation_input_tokens` and `cache_read_input_tokens` from both
the `usage` object and direct `message_delta` events. However, these values are
**collapsed** into a single `input_tokens` sum in the `Usage` struct.

### CostTracker (`crates/goose/src/agents/observability.rs`)

The `TokenUsage` struct already has a `cached_tokens: u64` field and `with_cached()`
builder. The `ModelPricing` struct has `cached_per_million` for discounted pricing.

---

## Gaps Identified and Fixed

### Gap 1: `Usage` struct lacks cache-specific fields

**File:** `crates/goose/src/providers/base.rs`

The `Usage` struct only had `input_tokens`, `output_tokens`, `total_tokens`. Cache token
counts were lost after `get_usage()` summed them.

**Fix:** Added `cache_creation_input_tokens` and `cache_read_input_tokens` as `Option<i32>`
fields to the `Usage` struct, preserving them through the provider pipeline.

### Gap 2: `get_usage()` doesn't expose cache breakdown

**File:** `crates/goose/src/providers/formats/anthropic.rs`

The function parsed cache tokens but only used them to compute total input. Individual
counts were discarded.

**Fix:** `get_usage()` now populates the new `Usage` cache fields AND logs cache hit/miss
rates at `info` level for visibility.

### Gap 3: Agent cost wiring ignores cache tokens

**File:** `crates/goose/src/agents/agent.rs` (line ~2205)

The agent created `TokenUsage::new(input, output)` which always set `cached_tokens = 0`.

**Fix:** The wiring now reads `cache_read_input_tokens` from the `Usage` struct and passes
it through via `TokenUsage::new(input, output).with_cached(cached)`.

### Gap 4: `AnthropicProvider` doesn't override `supports_cache_control()`

**File:** `crates/goose/src/providers/anthropic.rs`

The provider trait method defaulted to `false`, meaning downstream code that gates on
`supports_cache_control()` wouldn't know Anthropic supports it.

**Fix:** Added `async fn supports_cache_control(&self) -> bool { true }` to the
`AnthropicProvider`'s `Provider` impl.

---

## JSON Format Reference

### Request: Cache Control Breakpoints

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 64000,
  "system": [
    {
      "type": "text",
      "text": "You are a helpful coding assistant...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "tools": [
    {"name": "tool_a", "description": "...", "input_schema": {...}},
    {
      "name": "tool_z",
      "description": "...",
      "input_schema": {...},
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "First message",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    },
    {"role": "assistant", "content": [...]},
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Latest message",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    }
  ]
}
```

### Response: Usage with Cache Metrics

```json
{
  "usage": {
    "input_tokens": 42,
    "output_tokens": 350,
    "cache_creation_input_tokens": 15000,
    "cache_read_input_tokens": 0
  }
}
```

On subsequent turns (cache hit):
```json
{
  "usage": {
    "input_tokens": 58,
    "output_tokens": 280,
    "cache_creation_input_tokens": 200,
    "cache_read_input_tokens": 14800
  }
}
```

---

## Edge Cases

### Model Switching
When the user hot-switches models via `/model`, the cache prefix becomes invalid because
Anthropic caches are model-specific. The 5-minute TTL handles this gracefully — the old
cache expires and a new one is created for the new model.

### Tool List Changes
Adding or removing MCP extensions changes the tool definitions, invalidating the tool
prefix cache. The `format_tools()` function always marks the last tool with
`cache_control`, so the new tool set gets cached on the next request. Cache creation
tokens will appear for one turn, then reads resume.

### Minimum Cacheable Length
Anthropic requires a minimum of 1,024 tokens in a cacheable prefix for Claude 3.5 Sonnet
and 2,048 for Claude 3 Opus. Short system prompts may not benefit. Super-Goose's system
prompts are typically 2,000-10,000 tokens, well above the threshold.

### Streaming vs Non-Streaming
Cache metrics appear in different events:
- **Non-streaming:** In the response `usage` object
- **Streaming:** In the `message_start` event's `usage` field (input + cache tokens) and
  `message_delta` event's `usage` field (output tokens)

Both paths are handled by the existing `get_usage()` parser.

### Cost Calculation Accuracy
The `CostTracker` in `observability.rs` uses `cached_per_million` pricing (default 50% of
input price). Anthropic's actual cache read pricing is 10% of input. The pricing should be
updated to reflect this, but that's a pricing database concern, not a caching implementation
concern.

---

## Estimated Cost Savings

For a typical Super-Goose coding session:
- System prompt: ~3,000 tokens (cached after turn 1)
- Tool definitions: ~8,000 tokens for 20 tools (cached after turn 1)
- Conversation history: grows per turn, last 2 user msgs cached

| Turn | Fresh Input | Cache Write | Cache Read | Effective Input Cost |
|------|-------------|-------------|------------|---------------------|
| 1    | 11,000      | 11,000      | 0          | 1.25x base          |
| 2    | 500         | 500         | 11,000     | ~0.14x base         |
| 3    | 500         | 500         | 11,500     | ~0.13x base         |
| 10   | 500         | 500         | 15,000     | ~0.12x base         |

**Net savings over a 10-turn session: ~75-85% on input token costs.**

For Claude Sonnet 4.5 at $3/MTok input:
- Without caching: ~$0.15 for 50K input tokens
- With caching: ~$0.03 for same content
- **Savings: ~$0.12 per session**

At scale (100 sessions/day): ~$12/day saved, ~$360/month.

---

## Files Changed

| File | Change |
|------|--------|
| `crates/goose/src/providers/base.rs` | Added `cache_creation_input_tokens`, `cache_read_input_tokens` to `Usage` |
| `crates/goose/src/providers/formats/anthropic.rs` | Enhanced `get_usage()` to populate cache fields + logging |
| `crates/goose/src/providers/anthropic.rs` | Override `supports_cache_control()` to return `true` |
| `crates/goose/src/agents/agent.rs` | Wire cache tokens from `Usage` into `TokenUsage` for CostTracker |
