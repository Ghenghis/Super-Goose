/**
 * AG-UI Protocol
 *
 * Re-exports all AG-UI types, enums, and type guards for convenient
 * single-import usage:
 *
 *   import { AgUiEventType, AgUiEvent, isToolCallEvent } from '../ag-ui';
 */
export {
  // Enums
  AgUiEventType,
  MessageRole,

  // Utility types
  type JsonPatchOp,

  // Message types
  type ToolCall,
  type UserMessage,
  type AssistantMessage,
  type ToolMessage,
  type SystemMessage,
  type AgUiMessage,

  // Base
  type BaseEvent,

  // Lifecycle events
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
  type StepStartedEvent,
  type StepFinishedEvent,

  // Text message events
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageChunkEvent,

  // Tool call events
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallChunkEvent,

  // State events
  type StateSnapshotEvent,
  type StateDeltaEvent,
  type MessagesSnapshotEvent,

  // Activity events
  type ActivitySnapshotEvent,
  type ActivityDeltaEvent,

  // Reasoning events
  type ReasoningStartEvent,
  type ReasoningMessageStartEvent,
  type ReasoningMessageContentEvent,
  type ReasoningMessageEndEvent,
  type ReasoningMessageChunkEvent,
  type ReasoningEndEvent,
  type ReasoningEncryptedValueEvent,

  // Special events
  type RawEvent,
  type CustomEvent,

  // Frontend tool definitions & run input
  type FrontendToolDefinition,
  type RunAgentInput,

  // Subscriber & middleware
  type AgUiSubscriber,
  type AgUiMiddleware,

  // Discriminated union
  type AgUiEvent,

  // Type guards
  isLifecycleEvent,
  isTextMessageEvent,
  isToolCallEvent,
  isStateEvent,
  isReasoningEvent,
} from './types';
