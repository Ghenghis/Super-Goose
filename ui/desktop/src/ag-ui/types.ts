/**
 * AG-UI Protocol Types
 *
 * Complete TypeScript type definitions for the AG-UI (Agent-User Interaction)
 * protocol. Defines 28 event types across 7 categories for streaming
 * agent-to-frontend communication.
 *
 * @see https://github.com/ag-ui-protocol/ag-ui
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** All 28 AG-UI event types grouped by category. */
export enum AgUiEventType {
  // Lifecycle (5)
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED',
  RUN_ERROR = 'RUN_ERROR',
  STEP_STARTED = 'STEP_STARTED',
  STEP_FINISHED = 'STEP_FINISHED',

  // Text Messages (4)
  TEXT_MESSAGE_START = 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT = 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END = 'TEXT_MESSAGE_END',
  TEXT_MESSAGE_CHUNK = 'TEXT_MESSAGE_CHUNK',

  // Tool Calls (5)
  TOOL_CALL_START = 'TOOL_CALL_START',
  TOOL_CALL_ARGS = 'TOOL_CALL_ARGS',
  TOOL_CALL_END = 'TOOL_CALL_END',
  TOOL_CALL_RESULT = 'TOOL_CALL_RESULT',
  TOOL_CALL_CHUNK = 'TOOL_CALL_CHUNK',

  // State (3)
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',
  STATE_DELTA = 'STATE_DELTA',
  MESSAGES_SNAPSHOT = 'MESSAGES_SNAPSHOT',

  // Activity (2)
  ACTIVITY_SNAPSHOT = 'ACTIVITY_SNAPSHOT',
  ACTIVITY_DELTA = 'ACTIVITY_DELTA',

  // Reasoning (7)
  REASONING_START = 'REASONING_START',
  REASONING_MESSAGE_START = 'REASONING_MESSAGE_START',
  REASONING_MESSAGE_CONTENT = 'REASONING_MESSAGE_CONTENT',
  REASONING_MESSAGE_END = 'REASONING_MESSAGE_END',
  REASONING_MESSAGE_CHUNK = 'REASONING_MESSAGE_CHUNK',
  REASONING_END = 'REASONING_END',
  REASONING_ENCRYPTED_VALUE = 'REASONING_ENCRYPTED_VALUE',

  // Special (2)
  RAW = 'RAW',
  CUSTOM = 'CUSTOM',
}

/** Roles that can author a message. */
export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
  Tool = 'tool',
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

/**
 * A single JSON Patch operation per RFC 6902.
 * Used by STATE_DELTA and ACTIVITY_DELTA events.
 */
export interface JsonPatchOp {
  /** The operation to perform. */
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  /** JSON Pointer path to the target location. */
  path: string;
  /** The value to apply (required for add, replace, test). */
  value?: unknown;
  /** Source path for move/copy operations. */
  from?: string;
}

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

/** A tool call embedded within an assistant message. */
export interface ToolCall {
  /** Unique identifier for the tool call. */
  id: string;
  /** Name of the tool being invoked. */
  name: string;
  /** JSON-encoded arguments passed to the tool. */
  args: string;
}

/** A message sent by the user. */
export interface UserMessage {
  id: string;
  role: MessageRole.User;
  content: string;
}

/** A message sent by the assistant, optionally containing tool calls. */
export interface AssistantMessage {
  id: string;
  role: MessageRole.Assistant;
  content: string;
  toolCalls?: ToolCall[];
}

/** A message representing a tool invocation result. */
export interface ToolMessage {
  id: string;
  role: MessageRole.Tool;
  content: string;
  toolCallId: string;
}

/** A system-level message (instructions, context). */
export interface SystemMessage {
  id: string;
  role: MessageRole.System;
  content: string;
}

/** Union of all message shapes that can appear in a conversation. */
export type AgUiMessage =
  | UserMessage
  | AssistantMessage
  | ToolMessage
  | SystemMessage;

// ---------------------------------------------------------------------------
// Base Event
// ---------------------------------------------------------------------------

/** Fields shared by every AG-UI event. */
export interface BaseEvent {
  /** Discriminant identifying the event kind. */
  type: AgUiEventType;
  /** Unix epoch milliseconds when the event was emitted. */
  timestamp?: number;
  /** Optional raw/original event payload from the underlying provider. */
  rawEvent?: unknown;
}

// ---------------------------------------------------------------------------
// Lifecycle Events (5)
// ---------------------------------------------------------------------------

/** Emitted when an agent run begins. */
export interface RunStartedEvent extends BaseEvent {
  type: AgUiEventType.RUN_STARTED;
  /** Conversation thread identifier. */
  threadId: string;
  /** Unique run identifier. */
  runId: string;
}

/** Emitted when an agent run completes successfully. */
export interface RunFinishedEvent extends BaseEvent {
  type: AgUiEventType.RUN_FINISHED;
  threadId: string;
  runId: string;
  /** Optional result payload from the run. */
  result?: unknown;
}

/** Emitted when an agent run fails with an error. */
export interface RunErrorEvent extends BaseEvent {
  type: AgUiEventType.RUN_ERROR;
  /** Human-readable error description. */
  message: string;
  /** Machine-readable error code. */
  code?: string;
}

/** Emitted when a discrete step within a run begins. */
export interface StepStartedEvent extends BaseEvent {
  type: AgUiEventType.STEP_STARTED;
  /** Name or label identifying the step. */
  stepName: string;
}

/** Emitted when a discrete step within a run completes. */
export interface StepFinishedEvent extends BaseEvent {
  type: AgUiEventType.STEP_FINISHED;
  stepName: string;
}

// ---------------------------------------------------------------------------
// Text Message Events (4)
// ---------------------------------------------------------------------------

/** Signals the start of a new text message from the assistant. */
export interface TextMessageStartEvent extends BaseEvent {
  type: AgUiEventType.TEXT_MESSAGE_START;
  /** Unique identifier for this message. */
  messageId: string;
  /** Always 'assistant' for text message starts. */
  role: 'assistant';
}

/** A streaming content delta for an in-progress text message. */
export interface TextMessageContentEvent extends BaseEvent {
  type: AgUiEventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  /** Incremental text content to append. */
  delta: string;
}

/** Signals the end of a text message. */
export interface TextMessageEndEvent extends BaseEvent {
  type: AgUiEventType.TEXT_MESSAGE_END;
  messageId: string;
}

/**
 * A self-contained text message chunk (alternative to the
 * start/content/end triple for simpler consumers).
 */
export interface TextMessageChunkEvent extends BaseEvent {
  type: AgUiEventType.TEXT_MESSAGE_CHUNK;
  messageId: string;
  /** The text content of this chunk. */
  delta: string;
  role: 'assistant';
}

// ---------------------------------------------------------------------------
// Tool Call Events (5)
// ---------------------------------------------------------------------------

/** Signals the start of a tool call. */
export interface ToolCallStartEvent extends BaseEvent {
  type: AgUiEventType.TOOL_CALL_START;
  /** Unique identifier for this tool call. */
  toolCallId: string;
  /** Name of the tool being invoked. */
  toolCallName: string;
  /** The message that initiated this tool call. */
  parentMessageId?: string;
}

/** Streaming argument delta for a tool call in progress. */
export interface ToolCallArgsEvent extends BaseEvent {
  type: AgUiEventType.TOOL_CALL_ARGS;
  toolCallId: string;
  /** Incremental JSON argument content to append. */
  delta: string;
}

/** Signals the end of a tool call invocation. */
export interface ToolCallEndEvent extends BaseEvent {
  type: AgUiEventType.TOOL_CALL_END;
  toolCallId: string;
}

/** Contains the result returned by a tool. */
export interface ToolCallResultEvent extends BaseEvent {
  type: AgUiEventType.TOOL_CALL_RESULT;
  /** Message ID for the result message. */
  messageId: string;
  /** The tool call this result corresponds to. */
  toolCallId: string;
  /** Serialized result content. */
  content: string;
  /** Role of the result message (defaults to 'tool'). */
  role?: string;
}

/**
 * A self-contained tool call chunk (alternative to the
 * start/args/end triple for simpler consumers).
 */
export interface ToolCallChunkEvent extends BaseEvent {
  type: AgUiEventType.TOOL_CALL_CHUNK;
  toolCallId: string;
  toolCallName: string;
  /** Incremental JSON argument content. */
  delta: string;
  parentMessageId?: string;
}

// ---------------------------------------------------------------------------
// State Events (3)
// ---------------------------------------------------------------------------

/** A complete snapshot of the agent's shared state. */
export interface StateSnapshotEvent extends BaseEvent {
  type: AgUiEventType.STATE_SNAPSHOT;
  /** Full state object. */
  snapshot: unknown;
}

/** An incremental update to the agent's shared state via JSON Patch. */
export interface StateDeltaEvent extends BaseEvent {
  type: AgUiEventType.STATE_DELTA;
  /** Array of JSON Patch operations to apply to the current state. */
  delta: JsonPatchOp[];
}

/** A complete snapshot of the conversation messages. */
export interface MessagesSnapshotEvent extends BaseEvent {
  type: AgUiEventType.MESSAGES_SNAPSHOT;
  /** All messages in the current conversation. */
  messages: AgUiMessage[];
}

// ---------------------------------------------------------------------------
// Activity Events (2)
// ---------------------------------------------------------------------------

/** A snapshot of an ongoing activity (e.g. progress indicator). */
export interface ActivitySnapshotEvent extends BaseEvent {
  type: AgUiEventType.ACTIVITY_SNAPSHOT;
  /** The message this activity is associated with. */
  messageId: string;
  /** Discriminator for the activity kind (e.g. 'thinking', 'searching'). */
  activityType: string;
  /** Arbitrary structured content for the activity. */
  content: Record<string, unknown>;
  /** If true, replaces any previous activity of the same type on this message. */
  replace?: boolean;
}

/** An incremental update to an ongoing activity via JSON Patch. */
export interface ActivityDeltaEvent extends BaseEvent {
  type: AgUiEventType.ACTIVITY_DELTA;
  messageId: string;
  activityType: string;
  /** JSON Patch operations to apply to the activity content. */
  patch: JsonPatchOp[];
}

// ---------------------------------------------------------------------------
// Reasoning Events (7)
// ---------------------------------------------------------------------------

/** Signals that the agent is beginning a reasoning phase. */
export interface ReasoningStartEvent extends BaseEvent {
  type: AgUiEventType.REASONING_START;
  messageId: string;
}

/** Signals the start of a reasoning message from the assistant. */
export interface ReasoningMessageStartEvent extends BaseEvent {
  type: AgUiEventType.REASONING_MESSAGE_START;
  messageId: string;
  role: 'assistant';
}

/** A streaming content delta for an in-progress reasoning message. */
export interface ReasoningMessageContentEvent extends BaseEvent {
  type: AgUiEventType.REASONING_MESSAGE_CONTENT;
  messageId: string;
  /** Incremental reasoning text to append. */
  delta: string;
}

/** Signals the end of a reasoning message. */
export interface ReasoningMessageEndEvent extends BaseEvent {
  type: AgUiEventType.REASONING_MESSAGE_END;
  messageId: string;
}

/**
 * A self-contained reasoning message chunk (alternative to the
 * start/content/end triple).
 */
export interface ReasoningMessageChunkEvent extends BaseEvent {
  type: AgUiEventType.REASONING_MESSAGE_CHUNK;
  messageId: string;
  delta: string;
  role: 'assistant';
}

/** Signals that the reasoning phase has ended. */
export interface ReasoningEndEvent extends BaseEvent {
  type: AgUiEventType.REASONING_END;
  messageId: string;
}

/** Carries an encrypted reasoning value (for providers that encrypt CoT). */
export interface ReasoningEncryptedValueEvent extends BaseEvent {
  type: AgUiEventType.REASONING_ENCRYPTED_VALUE;
  messageId: string;
  /** Base64-encoded encrypted reasoning data. */
  data: string;
}

// ---------------------------------------------------------------------------
// Special Events (2)
// ---------------------------------------------------------------------------

/** A raw, unprocessed event from the underlying provider. */
export interface RawEvent extends BaseEvent {
  type: AgUiEventType.RAW;
  /** The raw event payload. */
  event: unknown;
  /** Identifies the originating provider or system. */
  source?: string;
}

/** An application-defined custom event. */
export interface CustomEvent extends BaseEvent {
  type: AgUiEventType.CUSTOM;
  /** Application-specific event name. */
  name: string;
  /** Arbitrary event payload. */
  value: unknown;
}

// ---------------------------------------------------------------------------
// Frontend Tool Definitions & Run Input
// ---------------------------------------------------------------------------

/** A tool defined on the frontend that the agent can invoke. */
export interface FrontendToolDefinition {
  /** Unique tool name. */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** JSON Schema describing the tool's parameters. */
  parameters?: Record<string, unknown>;
}

/** Input parameters for starting an agent run. */
export interface RunAgentInput {
  /** Thread/conversation identifier. */
  threadId?: string;
  /** Run identifier (generated if not provided). */
  runId?: string;
  /** Initial messages to seed the conversation. */
  messages?: AgUiMessage[];
  /** Initial shared state. */
  state?: Record<string, unknown>;
  /** Frontend tool definitions available to the agent. */
  tools?: FrontendToolDefinition[];
  /** Additional context passed to the agent. */
  context?: Record<string, unknown>;
  /** Whether to forward tool call results automatically. */
  forwardedProps?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Subscriber & Middleware
// ---------------------------------------------------------------------------

/**
 * A subscriber that receives AG-UI events.
 * Return false to stop propagation to subsequent subscribers.
 */
export type AgUiSubscriber = (event: AgUiEvent) => boolean | void;

/**
 * A middleware function that can transform events in the AG-UI pipeline.
 * Receives the event and a next function to call for default processing.
 */
export type AgUiMiddleware = (
  event: AgUiEvent,
  next: (event: AgUiEvent) => void,
) => void;

// ---------------------------------------------------------------------------
// Discriminated Union
// ---------------------------------------------------------------------------

/** Discriminated union of all AG-UI event types. */
export type AgUiEvent =
  // Lifecycle
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  // Text Messages
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | TextMessageChunkEvent
  // Tool Calls
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | ToolCallChunkEvent
  // State
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  // Activity
  | ActivitySnapshotEvent
  | ActivityDeltaEvent
  // Reasoning
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningMessageChunkEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent
  // Special
  | RawEvent
  | CustomEvent;

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/** Returns true if the event is a lifecycle event. */
export function isLifecycleEvent(
  event: AgUiEvent,
): event is
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent {
  return [
    AgUiEventType.RUN_STARTED,
    AgUiEventType.RUN_FINISHED,
    AgUiEventType.RUN_ERROR,
    AgUiEventType.STEP_STARTED,
    AgUiEventType.STEP_FINISHED,
  ].includes(event.type);
}

/** Returns true if the event is a text message event. */
export function isTextMessageEvent(
  event: AgUiEvent,
): event is
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | TextMessageChunkEvent {
  return [
    AgUiEventType.TEXT_MESSAGE_START,
    AgUiEventType.TEXT_MESSAGE_CONTENT,
    AgUiEventType.TEXT_MESSAGE_END,
    AgUiEventType.TEXT_MESSAGE_CHUNK,
  ].includes(event.type);
}

/** Returns true if the event is a tool call event. */
export function isToolCallEvent(
  event: AgUiEvent,
): event is
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | ToolCallChunkEvent {
  return [
    AgUiEventType.TOOL_CALL_START,
    AgUiEventType.TOOL_CALL_ARGS,
    AgUiEventType.TOOL_CALL_END,
    AgUiEventType.TOOL_CALL_RESULT,
    AgUiEventType.TOOL_CALL_CHUNK,
  ].includes(event.type);
}

/** Returns true if the event is a state event. */
export function isStateEvent(
  event: AgUiEvent,
): event is StateSnapshotEvent | StateDeltaEvent | MessagesSnapshotEvent {
  return [
    AgUiEventType.STATE_SNAPSHOT,
    AgUiEventType.STATE_DELTA,
    AgUiEventType.MESSAGES_SNAPSHOT,
  ].includes(event.type);
}

/** Returns true if the event is a reasoning event. */
export function isReasoningEvent(
  event: AgUiEvent,
): event is
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningMessageChunkEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent {
  return [
    AgUiEventType.REASONING_START,
    AgUiEventType.REASONING_MESSAGE_START,
    AgUiEventType.REASONING_MESSAGE_CONTENT,
    AgUiEventType.REASONING_MESSAGE_END,
    AgUiEventType.REASONING_MESSAGE_CHUNK,
    AgUiEventType.REASONING_END,
    AgUiEventType.REASONING_ENCRYPTED_VALUE,
  ].includes(event.type);
}
