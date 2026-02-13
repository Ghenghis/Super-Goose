# Native Extended Thinking Implementation Plan

## Overview

This document describes the implementation of native Anthropic Extended Thinking
support in Super-Goose. The feature passes the `thinking` parameter to the
Anthropic Messages API, enabling Claude to use internal chain-of-thought
reasoning ("thinking blocks") before generating a response.

## Anthropic API `thinking` Parameter

### Request Format

When extended thinking is enabled, the request body includes:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 16000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  },
  "messages": [...]
}
```

Key constraints from the Anthropic API:
- `budget_tokens` minimum is 1024, maximum is bounded by `max_tokens`
- When thinking is enabled, `max_tokens` must be large enough to accommodate
  both `budget_tokens` and the expected output
- `temperature` must NOT be set when thinking is enabled (API returns 400)
- The `anthropic-beta: output-128k-2025-02-19` header may be needed for
  large output windows

### Response Format

Thinking blocks appear in the `content` array before text/tool_use blocks:

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me analyze this step by step...",
      "signature": "EuYBCkQ..."
    },
    {
      "type": "redacted_thinking",
      "data": "EmwKAhgB..."
    },
    {
      "type": "text",
      "text": "Here is my answer..."
    }
  ]
}
```

### Streaming Format

In streaming mode, thinking blocks arrive as:
- `content_block_start` with `type: "thinking"`
- `content_block_delta` with `type: "thinking_delta"` containing `thinking` text
- `content_block_stop`

Signatures arrive at the end of the thinking block.

## Implementation Changes

### 1. ModelConfig (model.rs)

Add two fields to `ModelConfig`:
- `thinking_enabled: bool` -- whether to send the `thinking` parameter
- `thinking_budget: Option<i32>` -- the `budget_tokens` value

These are parsed from environment variables `GOOSE_THINKING` and
`GOOSE_THINKING_BUDGET` as well as the `--thinking` CLI flag.

### 2. Anthropic Request Builder (providers/formats/anthropic.rs)

Refactor `create_request()` to read thinking config from `ModelConfig` instead
of raw environment variables. When thinking is enabled:
- Add `thinking: { type: "enabled", budget_tokens: N }` to payload
- Increase `max_tokens` by `budget_tokens`
- Remove `temperature` from payload (API constraint)

### 3. Anthropic Provider Headers (providers/anthropic.rs)

Refactor `get_conditional_headers()` to check `ModelConfig.thinking_enabled`
instead of raw environment variable.

### 4. Streaming Response Handler (providers/formats/anthropic.rs)

Update `response_to_streaming_message()` to handle:
- `content_block_start` with `type: "thinking"` -- begin accumulating thinking
- `content_block_delta` with `type: "thinking_delta"` -- accumulate text
- `content_block_stop` for thinking blocks -- yield thinking message
- `content_block_start` with `type: "redacted_thinking"` -- yield redacted

### 5. CLI Flag (goose-cli/src/cli.rs)

Add `--thinking` flag with optional budget value to the `Session` command.
Set the environment variables so they flow through to `ModelConfig`.

### Integration with Existing Modules

- `extended_thinking.rs` -- app-level thinking (decomposition, evaluation, etc.)
  This is an agent-level reasoning framework, NOT the native API feature.
  The two are independent. Native thinking happens inside Claude; app-level
  thinking is orchestrated by the agent.

- `reasoning.rs` -- ReAct/CoT/ToT modes. Also independent. These inject
  reasoning prompts into the system message. Native thinking is complementary.

- `message.rs` -- Already has `Thinking` and `RedactedThinking` variants in
  `MessageContent`, plus `with_thinking()` and `with_redacted_thinking()` on
  `Message`. The non-streaming response parser already handles these.

### Thinking + Tool Use

When thinking is enabled and the model makes tool calls, the API returns:
1. thinking block(s) first
2. then tool_use block(s)

The existing message flow already handles this ordering because thinking
blocks are parsed before tool_use blocks in `response_to_message()`.
