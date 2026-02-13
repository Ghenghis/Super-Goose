/**
 * AG-UI Protocol — Type validation tests
 *
 * Validates the AG-UI type system: enum completeness, interface structure,
 * JSON serialization roundtrips, JsonPatchOp validation, discriminated union
 * narrowing, custom event structure, message type unions, and type guards.
 */
import { describe, it, expect } from 'vitest';
import {
  AgUiEventType,
  MessageRole,
  isLifecycleEvent,
  isTextMessageEvent,
  isToolCallEvent,
  isStateEvent,
  isReasoningEvent,
} from '../types';
import type {
  JsonPatchOp,
  ToolCall,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  SystemMessage,
  AgUiMessage,
  BaseEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StepStartedEvent,
  StepFinishedEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageChunkEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallChunkEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
  MessagesSnapshotEvent,
  ActivitySnapshotEvent,
  ActivityDeltaEvent,
  ReasoningStartEvent,
  ReasoningMessageStartEvent,
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageChunkEvent,
  ReasoningEndEvent,
  ReasoningEncryptedValueEvent,
  RawEvent,
  CustomEvent,
  AgUiEvent,
} from '../types';

// ---------------------------------------------------------------------------
// 1. All 28 event types exist in the enum
// ---------------------------------------------------------------------------
describe('AgUiEventType enum', () => {
  const ALL_EVENT_TYPES: string[] = [
    // Lifecycle (5)
    'RUN_STARTED',
    'RUN_FINISHED',
    'RUN_ERROR',
    'STEP_STARTED',
    'STEP_FINISHED',
    // Text Messages (4)
    'TEXT_MESSAGE_START',
    'TEXT_MESSAGE_CONTENT',
    'TEXT_MESSAGE_END',
    'TEXT_MESSAGE_CHUNK',
    // Tool Calls (5)
    'TOOL_CALL_START',
    'TOOL_CALL_ARGS',
    'TOOL_CALL_END',
    'TOOL_CALL_RESULT',
    'TOOL_CALL_CHUNK',
    // State (3)
    'STATE_SNAPSHOT',
    'STATE_DELTA',
    'MESSAGES_SNAPSHOT',
    // Activity (2)
    'ACTIVITY_SNAPSHOT',
    'ACTIVITY_DELTA',
    // Reasoning (7)
    'REASONING_START',
    'REASONING_MESSAGE_START',
    'REASONING_MESSAGE_CONTENT',
    'REASONING_MESSAGE_END',
    'REASONING_MESSAGE_CHUNK',
    'REASONING_END',
    'REASONING_ENCRYPTED_VALUE',
    // Special (2)
    'RAW',
    'CUSTOM',
  ];

  it('contains exactly 28 event types', () => {
    const enumValues = Object.values(AgUiEventType);
    expect(enumValues).toHaveLength(28);
  });

  it.each(ALL_EVENT_TYPES)('has member %s', (name) => {
    expect(AgUiEventType[name as keyof typeof AgUiEventType]).toBe(name);
  });

  it('enum values match their keys (string enum identity)', () => {
    for (const key of Object.keys(AgUiEventType)) {
      expect(AgUiEventType[key as keyof typeof AgUiEventType]).toBe(key);
    }
  });

  it('has no duplicate values', () => {
    const values = Object.values(AgUiEventType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ---------------------------------------------------------------------------
// 2. MessageRole enum
// ---------------------------------------------------------------------------
describe('MessageRole enum', () => {
  it('has four roles', () => {
    expect(Object.values(MessageRole)).toHaveLength(4);
  });

  it('maps to lowercase string values', () => {
    expect(MessageRole.User).toBe('user');
    expect(MessageRole.Assistant).toBe('assistant');
    expect(MessageRole.System).toBe('system');
    expect(MessageRole.Tool).toBe('tool');
  });
});

// ---------------------------------------------------------------------------
// 3. Event interfaces have correct required/optional fields
// ---------------------------------------------------------------------------
describe('Event interface field validation', () => {
  it('RunStartedEvent requires threadId and runId', () => {
    const event: RunStartedEvent = {
      type: AgUiEventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
    };
    expect(event.type).toBe('RUN_STARTED');
    expect(event.threadId).toBe('thread-1');
    expect(event.runId).toBe('run-1');
    // timestamp and rawEvent are optional (from BaseEvent)
    expect(event.timestamp).toBeUndefined();
    expect(event.rawEvent).toBeUndefined();
  });

  it('RunFinishedEvent has optional result', () => {
    const withResult: RunFinishedEvent = {
      type: AgUiEventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'r-1',
      result: { output: 'done' },
    };
    expect(withResult.result).toEqual({ output: 'done' });

    const withoutResult: RunFinishedEvent = {
      type: AgUiEventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'r-1',
    };
    expect(withoutResult.result).toBeUndefined();
  });

  it('RunErrorEvent requires message, optional code', () => {
    const event: RunErrorEvent = {
      type: AgUiEventType.RUN_ERROR,
      message: 'Something went wrong',
      code: 'TIMEOUT',
    };
    expect(event.message).toBe('Something went wrong');
    expect(event.code).toBe('TIMEOUT');
  });

  it('StepStartedEvent and StepFinishedEvent require stepName', () => {
    const started: StepStartedEvent = {
      type: AgUiEventType.STEP_STARTED,
      stepName: 'data-fetch',
    };
    const finished: StepFinishedEvent = {
      type: AgUiEventType.STEP_FINISHED,
      stepName: 'data-fetch',
    };
    expect(started.stepName).toBe('data-fetch');
    expect(finished.stepName).toBe('data-fetch');
  });

  it('TextMessageStartEvent requires messageId and role', () => {
    const event: TextMessageStartEvent = {
      type: AgUiEventType.TEXT_MESSAGE_START,
      messageId: 'msg-1',
      role: 'assistant',
    };
    expect(event.messageId).toBe('msg-1');
    expect(event.role).toBe('assistant');
  });

  it('TextMessageContentEvent requires messageId and delta', () => {
    const event: TextMessageContentEvent = {
      type: AgUiEventType.TEXT_MESSAGE_CONTENT,
      messageId: 'msg-1',
      delta: 'Hello ',
    };
    expect(event.delta).toBe('Hello ');
  });

  it('TextMessageEndEvent requires only messageId', () => {
    const event: TextMessageEndEvent = {
      type: AgUiEventType.TEXT_MESSAGE_END,
      messageId: 'msg-1',
    };
    expect(event.messageId).toBe('msg-1');
  });

  it('TextMessageChunkEvent requires messageId, delta, role', () => {
    const event: TextMessageChunkEvent = {
      type: AgUiEventType.TEXT_MESSAGE_CHUNK,
      messageId: 'msg-2',
      delta: 'chunk text',
      role: 'assistant',
    };
    expect(event.delta).toBe('chunk text');
    expect(event.role).toBe('assistant');
  });

  it('ToolCallStartEvent has optional parentMessageId', () => {
    const event: ToolCallStartEvent = {
      type: AgUiEventType.TOOL_CALL_START,
      toolCallId: 'tc-1',
      toolCallName: 'developer',
      parentMessageId: 'msg-1',
    };
    expect(event.toolCallId).toBe('tc-1');
    expect(event.toolCallName).toBe('developer');
    expect(event.parentMessageId).toBe('msg-1');
  });

  it('ToolCallArgsEvent requires toolCallId and delta', () => {
    const event: ToolCallArgsEvent = {
      type: AgUiEventType.TOOL_CALL_ARGS,
      toolCallId: 'tc-1',
      delta: '{"file": "main.rs"}',
    };
    expect(event.delta).toBe('{"file": "main.rs"}');
  });

  it('ToolCallEndEvent requires only toolCallId', () => {
    const event: ToolCallEndEvent = {
      type: AgUiEventType.TOOL_CALL_END,
      toolCallId: 'tc-1',
    };
    expect(event.toolCallId).toBe('tc-1');
  });

  it('ToolCallResultEvent requires messageId, toolCallId, content', () => {
    const event: ToolCallResultEvent = {
      type: AgUiEventType.TOOL_CALL_RESULT,
      messageId: 'msg-result-1',
      toolCallId: 'tc-1',
      content: 'File created successfully',
      role: 'tool',
    };
    expect(event.content).toBe('File created successfully');
    expect(event.role).toBe('tool');
  });

  it('ToolCallChunkEvent has all required fields', () => {
    const event: ToolCallChunkEvent = {
      type: AgUiEventType.TOOL_CALL_CHUNK,
      toolCallId: 'tc-2',
      toolCallName: 'read_file',
      delta: '{"path": "/tmp"}',
    };
    expect(event.toolCallName).toBe('read_file');
  });

  it('StateSnapshotEvent has snapshot of unknown type', () => {
    const event: StateSnapshotEvent = {
      type: AgUiEventType.STATE_SNAPSHOT,
      snapshot: { count: 5, status: 'active' },
    };
    expect(event.snapshot).toEqual({ count: 5, status: 'active' });
  });

  it('StateDeltaEvent has array of JsonPatchOp', () => {
    const event: StateDeltaEvent = {
      type: AgUiEventType.STATE_DELTA,
      delta: [
        { op: 'replace', path: '/count', value: 10 },
        { op: 'add', path: '/newKey', value: 'hello' },
      ],
    };
    expect(event.delta).toHaveLength(2);
    expect(event.delta[0].op).toBe('replace');
  });

  it('MessagesSnapshotEvent holds an array of AgUiMessage', () => {
    const event: MessagesSnapshotEvent = {
      type: AgUiEventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: 'u1', role: MessageRole.User, content: 'Hello' },
        { id: 'a1', role: MessageRole.Assistant, content: 'Hi there!' },
      ],
    };
    expect(event.messages).toHaveLength(2);
  });

  it('ActivitySnapshotEvent requires messageId, activityType, content', () => {
    const event: ActivitySnapshotEvent = {
      type: AgUiEventType.ACTIVITY_SNAPSHOT,
      messageId: 'msg-3',
      activityType: 'thinking',
      content: { progress: 0.5 },
      replace: true,
    };
    expect(event.activityType).toBe('thinking');
    expect(event.replace).toBe(true);
  });

  it('ActivityDeltaEvent requires messageId, activityType, patch', () => {
    const event: ActivityDeltaEvent = {
      type: AgUiEventType.ACTIVITY_DELTA,
      messageId: 'msg-3',
      activityType: 'thinking',
      patch: [{ op: 'replace', path: '/progress', value: 0.8 }],
    };
    expect(event.patch).toHaveLength(1);
  });

  it('ReasoningStartEvent and ReasoningEndEvent require messageId', () => {
    const start: ReasoningStartEvent = {
      type: AgUiEventType.REASONING_START,
      messageId: 'r-1',
    };
    const end: ReasoningEndEvent = {
      type: AgUiEventType.REASONING_END,
      messageId: 'r-1',
    };
    expect(start.messageId).toBe('r-1');
    expect(end.messageId).toBe('r-1');
  });

  it('ReasoningMessageStartEvent requires messageId and role', () => {
    const event: ReasoningMessageStartEvent = {
      type: AgUiEventType.REASONING_MESSAGE_START,
      messageId: 'rm-1',
      role: 'assistant',
    };
    expect(event.role).toBe('assistant');
  });

  it('ReasoningMessageContentEvent requires messageId and delta', () => {
    const event: ReasoningMessageContentEvent = {
      type: AgUiEventType.REASONING_MESSAGE_CONTENT,
      messageId: 'rm-1',
      delta: 'Let me think...',
    };
    expect(event.delta).toBe('Let me think...');
  });

  it('ReasoningMessageEndEvent requires messageId', () => {
    const event: ReasoningMessageEndEvent = {
      type: AgUiEventType.REASONING_MESSAGE_END,
      messageId: 'rm-1',
    };
    expect(event.messageId).toBe('rm-1');
  });

  it('ReasoningMessageChunkEvent has messageId, delta, role', () => {
    const event: ReasoningMessageChunkEvent = {
      type: AgUiEventType.REASONING_MESSAGE_CHUNK,
      messageId: 'rm-2',
      delta: 'reasoning chunk',
      role: 'assistant',
    };
    expect(event.delta).toBe('reasoning chunk');
  });

  it('ReasoningEncryptedValueEvent has messageId and data', () => {
    const event: ReasoningEncryptedValueEvent = {
      type: AgUiEventType.REASONING_ENCRYPTED_VALUE,
      messageId: 'rm-3',
      data: 'dGhpcyBpcyBiYXNlNjQ=',
    };
    expect(event.data).toBe('dGhpcyBpcyBiYXNlNjQ=');
  });

  it('RawEvent has event payload and optional source', () => {
    const event: RawEvent = {
      type: AgUiEventType.RAW,
      event: { raw: 'data' },
      source: 'openai',
    };
    expect(event.event).toEqual({ raw: 'data' });
    expect(event.source).toBe('openai');
  });

  it('CustomEvent has name and value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'my-custom-event',
      value: { foo: 'bar' },
    };
    expect(event.name).toBe('my-custom-event');
    expect(event.value).toEqual({ foo: 'bar' });
  });

  it('BaseEvent has optional timestamp and rawEvent', () => {
    const event: BaseEvent = {
      type: AgUiEventType.RUN_STARTED,
      timestamp: 1700000000000,
      rawEvent: { original: true },
    };
    expect(event.timestamp).toBe(1700000000000);
    expect(event.rawEvent).toEqual({ original: true });
  });
});

// ---------------------------------------------------------------------------
// 4. JSON serialization roundtrip
// ---------------------------------------------------------------------------
describe('JSON serialization roundtrip', () => {
  const eventSamples: Array<{ label: string; event: AgUiEvent }> = [
    {
      label: 'RunStartedEvent',
      event: { type: AgUiEventType.RUN_STARTED, threadId: 't-1', runId: 'r-1' },
    },
    {
      label: 'RunFinishedEvent',
      event: { type: AgUiEventType.RUN_FINISHED, threadId: 't-1', runId: 'r-1', result: { ok: true } },
    },
    {
      label: 'RunErrorEvent',
      event: { type: AgUiEventType.RUN_ERROR, message: 'fail', code: 'ERR_01' },
    },
    {
      label: 'StepStartedEvent',
      event: { type: AgUiEventType.STEP_STARTED, stepName: 'init' },
    },
    {
      label: 'StepFinishedEvent',
      event: { type: AgUiEventType.STEP_FINISHED, stepName: 'init' },
    },
    {
      label: 'TextMessageStartEvent',
      event: { type: AgUiEventType.TEXT_MESSAGE_START, messageId: 'm-1', role: 'assistant' as const },
    },
    {
      label: 'TextMessageContentEvent',
      event: { type: AgUiEventType.TEXT_MESSAGE_CONTENT, messageId: 'm-1', delta: 'Hello' },
    },
    {
      label: 'TextMessageEndEvent',
      event: { type: AgUiEventType.TEXT_MESSAGE_END, messageId: 'm-1' },
    },
    {
      label: 'TextMessageChunkEvent',
      event: { type: AgUiEventType.TEXT_MESSAGE_CHUNK, messageId: 'm-2', delta: 'chunk', role: 'assistant' as const },
    },
    {
      label: 'ToolCallStartEvent',
      event: { type: AgUiEventType.TOOL_CALL_START, toolCallId: 'tc-1', toolCallName: 'dev' },
    },
    {
      label: 'ToolCallArgsEvent',
      event: { type: AgUiEventType.TOOL_CALL_ARGS, toolCallId: 'tc-1', delta: '{}' },
    },
    {
      label: 'ToolCallEndEvent',
      event: { type: AgUiEventType.TOOL_CALL_END, toolCallId: 'tc-1' },
    },
    {
      label: 'ToolCallResultEvent',
      event: { type: AgUiEventType.TOOL_CALL_RESULT, messageId: 'mr-1', toolCallId: 'tc-1', content: 'ok' },
    },
    {
      label: 'ToolCallChunkEvent',
      event: { type: AgUiEventType.TOOL_CALL_CHUNK, toolCallId: 'tc-2', toolCallName: 'read', delta: '{}' },
    },
    {
      label: 'StateSnapshotEvent',
      event: { type: AgUiEventType.STATE_SNAPSHOT, snapshot: { key: 'val' } },
    },
    {
      label: 'StateDeltaEvent',
      event: { type: AgUiEventType.STATE_DELTA, delta: [{ op: 'add' as const, path: '/x', value: 1 }] },
    },
    {
      label: 'MessagesSnapshotEvent',
      event: { type: AgUiEventType.MESSAGES_SNAPSHOT, messages: [] },
    },
    {
      label: 'ActivitySnapshotEvent',
      event: {
        type: AgUiEventType.ACTIVITY_SNAPSHOT,
        messageId: 'm-3',
        activityType: 'search',
        content: {},
      },
    },
    {
      label: 'ActivityDeltaEvent',
      event: {
        type: AgUiEventType.ACTIVITY_DELTA,
        messageId: 'm-3',
        activityType: 'search',
        patch: [{ op: 'replace' as const, path: '/done', value: true }],
      },
    },
    {
      label: 'ReasoningStartEvent',
      event: { type: AgUiEventType.REASONING_START, messageId: 'r-1' },
    },
    {
      label: 'ReasoningMessageStartEvent',
      event: { type: AgUiEventType.REASONING_MESSAGE_START, messageId: 'rm-1', role: 'assistant' as const },
    },
    {
      label: 'ReasoningMessageContentEvent',
      event: { type: AgUiEventType.REASONING_MESSAGE_CONTENT, messageId: 'rm-1', delta: 'thinking...' },
    },
    {
      label: 'ReasoningMessageEndEvent',
      event: { type: AgUiEventType.REASONING_MESSAGE_END, messageId: 'rm-1' },
    },
    {
      label: 'ReasoningMessageChunkEvent',
      event: { type: AgUiEventType.REASONING_MESSAGE_CHUNK, messageId: 'rm-2', delta: 'cot', role: 'assistant' as const },
    },
    {
      label: 'ReasoningEndEvent',
      event: { type: AgUiEventType.REASONING_END, messageId: 'r-1' },
    },
    {
      label: 'ReasoningEncryptedValueEvent',
      event: { type: AgUiEventType.REASONING_ENCRYPTED_VALUE, messageId: 'rm-3', data: 'abc123==' },
    },
    {
      label: 'RawEvent',
      event: { type: AgUiEventType.RAW, event: { raw: true } },
    },
    {
      label: 'CustomEvent',
      event: { type: AgUiEventType.CUSTOM, name: 'test', value: 42 },
    },
  ];

  it('covers all 28 event types', () => {
    const types = new Set(eventSamples.map((s) => s.event.type));
    expect(types.size).toBe(28);
  });

  it.each(eventSamples)('$label survives JSON roundtrip', ({ event }) => {
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json) as AgUiEvent;
    expect(parsed.type).toBe(event.type);
    // Deep equality check
    expect(parsed).toEqual(event);
  });

  it('preserves nested objects through roundtrip', () => {
    const event: StateSnapshotEvent = {
      type: AgUiEventType.STATE_SNAPSHOT,
      snapshot: {
        nested: { deeply: { value: [1, 2, 3] } },
        flag: true,
        count: 99,
      },
    };
    const parsed = JSON.parse(JSON.stringify(event)) as StateSnapshotEvent;
    expect(parsed.snapshot).toEqual(event.snapshot);
  });

  it('preserves null and undefined semantics in roundtrip', () => {
    const event: RunFinishedEvent = {
      type: AgUiEventType.RUN_FINISHED,
      threadId: 't-1',
      runId: 'r-1',
      result: null,
    };
    const parsed = JSON.parse(JSON.stringify(event)) as RunFinishedEvent;
    expect(parsed.result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. JsonPatchOp validation
// ---------------------------------------------------------------------------
describe('JsonPatchOp', () => {
  const validOps: JsonPatchOp['op'][] = ['add', 'remove', 'replace', 'move', 'copy', 'test'];

  it.each(validOps)('accepts op type "%s"', (opType) => {
    const op: JsonPatchOp = { op: opType, path: '/foo' };
    expect(op.op).toBe(opType);
  });

  it('path follows JSON Pointer format', () => {
    const op: JsonPatchOp = { op: 'add', path: '/root/child/0', value: 'x' };
    // JSON Pointer paths start with /
    expect(op.path).toMatch(/^\//);
    // Segments separated by /
    const segments = op.path.split('/').slice(1);
    expect(segments).toEqual(['root', 'child', '0']);
  });

  it('value is optional (not required for remove)', () => {
    const op: JsonPatchOp = { op: 'remove', path: '/old' };
    expect(op.value).toBeUndefined();
  });

  it('from is optional (used for move/copy)', () => {
    const moveOp: JsonPatchOp = { op: 'move', path: '/dest', from: '/source' };
    expect(moveOp.from).toBe('/source');

    const copyOp: JsonPatchOp = { op: 'copy', path: '/dest', from: '/source' };
    expect(copyOp.from).toBe('/source');
  });

  it('test op carries value for comparison', () => {
    const op: JsonPatchOp = { op: 'test', path: '/count', value: 42 };
    expect(op.value).toBe(42);
  });

  it('works with complex values', () => {
    const op: JsonPatchOp = {
      op: 'add',
      path: '/config/items/-',
      value: { name: 'new-item', enabled: true, tags: ['a', 'b'] },
    };
    expect(op.value).toEqual({ name: 'new-item', enabled: true, tags: ['a', 'b'] });
  });

  it('works with root path', () => {
    const op: JsonPatchOp = { op: 'replace', path: '', value: {} };
    expect(op.path).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 6. AgUiEvent discriminated union narrowing
// ---------------------------------------------------------------------------
describe('AgUiEvent discriminated union', () => {
  it('narrows to RunStartedEvent when type is RUN_STARTED', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.RUN_STARTED,
      threadId: 't-1',
      runId: 'r-1',
    };

    if (event.type === AgUiEventType.RUN_STARTED) {
      // TypeScript should narrow this to RunStartedEvent
      expect(event.threadId).toBe('t-1');
      expect(event.runId).toBe('r-1');
    } else {
      // Should not reach here
      expect.unreachable('Expected RUN_STARTED type');
    }
  });

  it('narrows to TextMessageContentEvent when type is TEXT_MESSAGE_CONTENT', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm-1',
      delta: 'test content',
    };

    if (event.type === AgUiEventType.TEXT_MESSAGE_CONTENT) {
      expect(event.delta).toBe('test content');
      expect(event.messageId).toBe('m-1');
    } else {
      expect.unreachable('Expected TEXT_MESSAGE_CONTENT type');
    }
  });

  it('narrows to ToolCallStartEvent correctly', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.TOOL_CALL_START,
      toolCallId: 'tc-1',
      toolCallName: 'search',
    };

    if (event.type === AgUiEventType.TOOL_CALL_START) {
      expect(event.toolCallName).toBe('search');
    } else {
      expect.unreachable('Expected TOOL_CALL_START type');
    }
  });

  it('narrows to StateDeltaEvent correctly', () => {
    const ops: JsonPatchOp[] = [{ op: 'replace', path: '/status', value: 'done' }];
    const event: AgUiEvent = {
      type: AgUiEventType.STATE_DELTA,
      delta: ops,
    };

    if (event.type === AgUiEventType.STATE_DELTA) {
      expect(event.delta).toHaveLength(1);
      expect(event.delta[0].op).toBe('replace');
    } else {
      expect.unreachable('Expected STATE_DELTA type');
    }
  });

  it('narrows to CustomEvent correctly', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'telemetry',
      value: { latency: 42 },
    };

    if (event.type === AgUiEventType.CUSTOM) {
      expect(event.name).toBe('telemetry');
      expect(event.value).toEqual({ latency: 42 });
    } else {
      expect.unreachable('Expected CUSTOM type');
    }
  });

  it('supports switch-case exhaustive pattern', () => {
    function describeEvent(event: AgUiEvent): string {
      switch (event.type) {
        case AgUiEventType.RUN_STARTED:
          return `run ${event.runId} started`;
        case AgUiEventType.RUN_FINISHED:
          return `run ${event.runId} finished`;
        case AgUiEventType.RUN_ERROR:
          return `error: ${event.message}`;
        case AgUiEventType.TEXT_MESSAGE_CONTENT:
          return `content: ${event.delta}`;
        case AgUiEventType.CUSTOM:
          return `custom: ${event.name}`;
        default:
          return `event: ${event.type}`;
      }
    }

    expect(
      describeEvent({ type: AgUiEventType.RUN_STARTED, threadId: 't', runId: 'r-42' }),
    ).toBe('run r-42 started');

    expect(
      describeEvent({ type: AgUiEventType.RUN_ERROR, message: 'timeout' }),
    ).toBe('error: timeout');

    expect(
      describeEvent({ type: AgUiEventType.CUSTOM, name: 'ping', value: null }),
    ).toBe('custom: ping');
  });
});

// ---------------------------------------------------------------------------
// 7. Custom event name/value structure
// ---------------------------------------------------------------------------
describe('CustomEvent structure', () => {
  it('accepts string value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'notification',
      value: 'Task completed',
    };
    expect(typeof event.value).toBe('string');
  });

  it('accepts number value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'progress',
      value: 0.75,
    };
    expect(typeof event.value).toBe('number');
  });

  it('accepts object value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'metrics',
      value: { latency: 42, throughput: 100 },
    };
    expect(event.value).toEqual({ latency: 42, throughput: 100 });
  });

  it('accepts array value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'tags',
      value: ['important', 'urgent'],
    };
    expect(event.value).toEqual(['important', 'urgent']);
  });

  it('accepts null value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'reset',
      value: null,
    };
    expect(event.value).toBeNull();
  });

  it('accepts boolean value', () => {
    const event: CustomEvent = {
      type: AgUiEventType.CUSTOM,
      name: 'toggle',
      value: true,
    };
    expect(event.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Message types union (AgUiMessage)
// ---------------------------------------------------------------------------
describe('AgUiMessage union', () => {
  it('UserMessage has role User and content', () => {
    const msg: UserMessage = {
      id: 'u-1',
      role: MessageRole.User,
      content: 'What time is it?',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('What time is it?');
  });

  it('AssistantMessage has optional toolCalls', () => {
    const tc: ToolCall = { id: 'tc-1', name: 'clock', args: '{}' };
    const msg: AssistantMessage = {
      id: 'a-1',
      role: MessageRole.Assistant,
      content: 'Let me check...',
      toolCalls: [tc],
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe('clock');
  });

  it('AssistantMessage works without toolCalls', () => {
    const msg: AssistantMessage = {
      id: 'a-2',
      role: MessageRole.Assistant,
      content: 'It is 3pm.',
    };
    expect(msg.toolCalls).toBeUndefined();
  });

  it('ToolMessage has toolCallId', () => {
    const msg: ToolMessage = {
      id: 't-1',
      role: MessageRole.Tool,
      content: '15:00 UTC',
      toolCallId: 'tc-1',
    };
    expect(msg.toolCallId).toBe('tc-1');
  });

  it('SystemMessage has system role', () => {
    const msg: SystemMessage = {
      id: 's-1',
      role: MessageRole.System,
      content: 'You are a helpful assistant.',
    };
    expect(msg.role).toBe('system');
  });

  it('AgUiMessage union accepts all four message types', () => {
    const messages: AgUiMessage[] = [
      { id: 's-1', role: MessageRole.System, content: 'System prompt' },
      { id: 'u-1', role: MessageRole.User, content: 'Hello' },
      { id: 'a-1', role: MessageRole.Assistant, content: 'Hi!' },
      { id: 't-1', role: MessageRole.Tool, content: 'result', toolCallId: 'tc-1' },
    ];
    expect(messages).toHaveLength(4);
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
  });

  it('ToolCall has id, name, and JSON-encoded args', () => {
    const tc: ToolCall = {
      id: 'call-1',
      name: 'read_file',
      args: JSON.stringify({ path: '/tmp/test.txt' }),
    };
    expect(tc.id).toBe('call-1');
    expect(JSON.parse(tc.args)).toEqual({ path: '/tmp/test.txt' });
  });
});

// ---------------------------------------------------------------------------
// 9. Type guards
// ---------------------------------------------------------------------------
describe('Type guards', () => {
  it('isLifecycleEvent returns true for lifecycle events', () => {
    const events: AgUiEvent[] = [
      { type: AgUiEventType.RUN_STARTED, threadId: 't', runId: 'r' },
      { type: AgUiEventType.RUN_FINISHED, threadId: 't', runId: 'r' },
      { type: AgUiEventType.RUN_ERROR, message: 'err' },
      { type: AgUiEventType.STEP_STARTED, stepName: 's' },
      { type: AgUiEventType.STEP_FINISHED, stepName: 's' },
    ];
    for (const event of events) {
      expect(isLifecycleEvent(event)).toBe(true);
    }
  });

  it('isLifecycleEvent returns false for non-lifecycle events', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.TEXT_MESSAGE_START,
      messageId: 'm-1',
      role: 'assistant',
    };
    expect(isLifecycleEvent(event)).toBe(false);
  });

  it('isTextMessageEvent returns true for text message events', () => {
    const events: AgUiEvent[] = [
      { type: AgUiEventType.TEXT_MESSAGE_START, messageId: 'm', role: 'assistant' as const },
      { type: AgUiEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'x' },
      { type: AgUiEventType.TEXT_MESSAGE_END, messageId: 'm' },
      { type: AgUiEventType.TEXT_MESSAGE_CHUNK, messageId: 'm', delta: 'x', role: 'assistant' as const },
    ];
    for (const event of events) {
      expect(isTextMessageEvent(event)).toBe(true);
    }
  });

  it('isTextMessageEvent returns false for tool call events', () => {
    const event: AgUiEvent = {
      type: AgUiEventType.TOOL_CALL_START,
      toolCallId: 'tc',
      toolCallName: 'dev',
    };
    expect(isTextMessageEvent(event)).toBe(false);
  });

  it('isToolCallEvent returns true for all tool call types', () => {
    const events: AgUiEvent[] = [
      { type: AgUiEventType.TOOL_CALL_START, toolCallId: 'tc', toolCallName: 'dev' },
      { type: AgUiEventType.TOOL_CALL_ARGS, toolCallId: 'tc', delta: '{}' },
      { type: AgUiEventType.TOOL_CALL_END, toolCallId: 'tc' },
      { type: AgUiEventType.TOOL_CALL_RESULT, messageId: 'm', toolCallId: 'tc', content: 'ok' },
      { type: AgUiEventType.TOOL_CALL_CHUNK, toolCallId: 'tc', toolCallName: 'dev', delta: '{}' },
    ];
    for (const event of events) {
      expect(isToolCallEvent(event)).toBe(true);
    }
  });

  it('isStateEvent returns true for state events', () => {
    const events: AgUiEvent[] = [
      { type: AgUiEventType.STATE_SNAPSHOT, snapshot: {} },
      { type: AgUiEventType.STATE_DELTA, delta: [] },
      { type: AgUiEventType.MESSAGES_SNAPSHOT, messages: [] },
    ];
    for (const event of events) {
      expect(isStateEvent(event)).toBe(true);
    }
  });

  it('isReasoningEvent returns true for all 7 reasoning types', () => {
    const events: AgUiEvent[] = [
      { type: AgUiEventType.REASONING_START, messageId: 'r' },
      { type: AgUiEventType.REASONING_MESSAGE_START, messageId: 'r', role: 'assistant' as const },
      { type: AgUiEventType.REASONING_MESSAGE_CONTENT, messageId: 'r', delta: 'x' },
      { type: AgUiEventType.REASONING_MESSAGE_END, messageId: 'r' },
      { type: AgUiEventType.REASONING_MESSAGE_CHUNK, messageId: 'r', delta: 'x', role: 'assistant' as const },
      { type: AgUiEventType.REASONING_END, messageId: 'r' },
      { type: AgUiEventType.REASONING_ENCRYPTED_VALUE, messageId: 'r', data: 'enc' },
    ];
    for (const event of events) {
      expect(isReasoningEvent(event)).toBe(true);
    }
  });

  it('isReasoningEvent returns false for non-reasoning events', () => {
    const event: AgUiEvent = { type: AgUiEventType.CUSTOM, name: 'x', value: null };
    expect(isReasoningEvent(event)).toBe(false);
  });

  it('type guards are mutually exclusive for cross-category events', () => {
    const lifecycleEvent: AgUiEvent = {
      type: AgUiEventType.RUN_STARTED,
      threadId: 't',
      runId: 'r',
    };
    expect(isLifecycleEvent(lifecycleEvent)).toBe(true);
    expect(isTextMessageEvent(lifecycleEvent)).toBe(false);
    expect(isToolCallEvent(lifecycleEvent)).toBe(false);
    expect(isStateEvent(lifecycleEvent)).toBe(false);
    expect(isReasoningEvent(lifecycleEvent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('event with extra fields still type-checks via BaseEvent', () => {
    // The BaseEvent extends pattern means extra fields from the wire are safe
    const wireEvent = {
      type: AgUiEventType.RUN_STARTED,
      threadId: 't-1',
      runId: 'r-1',
      extra_field: 'should be ignored by consumers',
    };
    // It can still be used as a RunStartedEvent
    expect(wireEvent.type).toBe('RUN_STARTED');
    expect(wireEvent.threadId).toBe('t-1');
  });

  it('empty delta array in StateDeltaEvent is valid', () => {
    const event: StateDeltaEvent = {
      type: AgUiEventType.STATE_DELTA,
      delta: [],
    };
    expect(event.delta).toHaveLength(0);
  });

  it('empty messages array in MessagesSnapshotEvent is valid', () => {
    const event: MessagesSnapshotEvent = {
      type: AgUiEventType.MESSAGES_SNAPSHOT,
      messages: [],
    };
    expect(event.messages).toHaveLength(0);
  });

  it('unicode content in text messages', () => {
    const event: TextMessageContentEvent = {
      type: AgUiEventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm-1',
      delta: 'Hello\n\t\u2603 \uD83D\uDE00',
    };
    const roundtripped = JSON.parse(JSON.stringify(event)) as TextMessageContentEvent;
    expect(roundtripped.delta).toBe(event.delta);
  });

  it('very large snapshot value survives roundtrip', () => {
    const bigObj: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      bigObj[`key_${i}`] = { value: i, nested: { arr: [i, i + 1] } };
    }
    const event: StateSnapshotEvent = {
      type: AgUiEventType.STATE_SNAPSHOT,
      snapshot: bigObj,
    };
    const parsed = JSON.parse(JSON.stringify(event)) as StateSnapshotEvent;
    expect(Object.keys(parsed.snapshot as object)).toHaveLength(1000);
  });
});
