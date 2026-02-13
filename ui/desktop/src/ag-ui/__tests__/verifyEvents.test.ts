import { describe, it, expect, beforeEach } from 'vitest';
import { createEventVerifier, type EventVerifier } from '../verifyEvents';

describe('AG-UI Event Verifier', () => {
  let verifier: EventVerifier;

  beforeEach(() => {
    verifier = createEventVerifier();
  });

  // --- Valid sequences ---

  it('accepts valid lifecycle sequence', () => {
    expect(verifier.verify({ type: 'RUN_STARTED' })).toBeNull();
    expect(verifier.verify({ type: 'RUN_FINISHED' })).toBeNull();
  });

  it('accepts valid text message sequence', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'm1' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_END', messageId: 'm1' })).toBeNull();
  });

  it('accepts valid tool call sequence', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'TOOL_CALL_START', toolCallId: 'tc1' })).toBeNull();
    expect(verifier.verify({ type: 'TOOL_CALL_ARGS', toolCallId: 'tc1' })).toBeNull();
    expect(verifier.verify({ type: 'TOOL_CALL_END', toolCallId: 'tc1' })).toBeNull();
  });

  it('accepts valid reasoning sequence', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'REASONING_START' })).toBeNull();
    expect(verifier.verify({ type: 'REASONING_CONTENT' })).toBeNull();
    expect(verifier.verify({ type: 'REASONING_END' })).toBeNull();
  });

  it('accepts valid step sequence', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'STEP_STARTED', stepName: 'plan' })).toBeNull();
    expect(verifier.verify({ type: 'STEP_FINISHED', stepName: 'plan' })).toBeNull();
  });

  it('accepts chunk events without start/end', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'TEXT_MESSAGE_CHUNK' })).toBeNull();
    expect(verifier.verify({ type: 'TOOL_CALL_CHUNK' })).toBeNull();
    expect(verifier.verify({ type: 'TOOL_CALL_RESULT' })).toBeNull();
    expect(verifier.verify({ type: 'REASONING_MESSAGE_CHUNK' })).toBeNull();
  });

  it('accepts snapshot and delta events', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'STATE_SNAPSHOT' })).toBeNull();
    expect(verifier.verify({ type: 'STATE_DELTA' })).toBeNull();
    expect(verifier.verify({ type: 'MESSAGES_SNAPSHOT' })).toBeNull();
    expect(verifier.verify({ type: 'ACTIVITY_SNAPSHOT' })).toBeNull();
    expect(verifier.verify({ type: 'ACTIVITY_DELTA' })).toBeNull();
    expect(verifier.verify({ type: 'ACTIVITY' })).toBeNull();
  });

  it('accepts CUSTOM and RAW after run finished', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'RUN_FINISHED' });
    expect(verifier.verify({ type: 'CUSTOM' })).toBeNull();
    expect(verifier.verify({ type: 'RAW' })).toBeNull();
  });

  it('accepts multiple sequential runs', () => {
    expect(verifier.verify({ type: 'RUN_STARTED' })).toBeNull();
    expect(verifier.verify({ type: 'RUN_FINISHED' })).toBeNull();
    expect(verifier.verify({ type: 'RUN_STARTED' })).toBeNull();
    expect(verifier.verify({ type: 'RUN_FINISHED' })).toBeNull();
  });

  it('accepts concurrent text messages with different ids', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    expect(verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'a' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'b' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_END', messageId: 'a' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_END', messageId: 'b' })).toBeNull();
  });

  // --- Invalid sequences ---

  it('rejects events after RUN_FINISHED', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'RUN_FINISHED' });
    const err = verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'x' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('after_finish');
  });

  it('rejects events after RUN_ERROR', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'RUN_ERROR' });
    const err = verifier.verify({ type: 'TOOL_CALL_START', toolCallId: 'tc' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('after_finish');
  });

  it('rejects TEXT_MESSAGE_CONTENT without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'orphan' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
    expect(err!.message).toContain('orphan');
  });

  it('rejects TEXT_MESSAGE_END without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'TEXT_MESSAGE_END', messageId: 'gone' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
  });

  it('rejects TOOL_CALL_ARGS without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'TOOL_CALL_ARGS', toolCallId: 'missing' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
    expect(err!.message).toContain('missing');
  });

  it('rejects TOOL_CALL_END without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'TOOL_CALL_END', toolCallId: 'nope' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
  });

  it('rejects REASONING_CONTENT without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'REASONING_CONTENT' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
  });

  it('rejects REASONING_END without START', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'REASONING_END' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
  });

  it('rejects STEP_FINISHED without STEP_STARTED', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'STEP_FINISHED', stepName: 'unknown' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
    expect(err!.message).toContain('unknown');
  });

  it('rejects duplicate RUN_STARTED while run is active', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'RUN_STARTED' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('duplicate');
  });

  it('rejects duplicate TEXT_MESSAGE_START for same id', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'dup' });
    const err = verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'dup' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('duplicate');
  });

  it('rejects duplicate TOOL_CALL_START for same id', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'TOOL_CALL_START', toolCallId: 'dup' });
    const err = verifier.verify({ type: 'TOOL_CALL_START', toolCallId: 'dup' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('duplicate');
  });

  it('rejects RUN_FINISHED without RUN_STARTED', () => {
    const err = verifier.verify({ type: 'RUN_FINISHED' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('sequence');
  });

  it('rejects RUN_ERROR without RUN_STARTED', () => {
    const err = verifier.verify({ type: 'RUN_ERROR' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('sequence');
  });

  // --- Reset ---

  it('reset clears all state and allows a fresh run', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'RUN_FINISHED' });
    verifier.reset();
    expect(verifier.verify({ type: 'RUN_STARTED' })).toBeNull();
    expect(verifier.verify({ type: 'TEXT_MESSAGE_START', messageId: 'fresh' })).toBeNull();
    expect(verifier.verify({ type: 'RUN_FINISHED' })).toBeNull();
  });

  it('reset clears active tracking sets', () => {
    verifier.verify({ type: 'RUN_STARTED' });
    verifier.verify({ type: 'REASONING_START' });
    verifier.reset();
    // After reset, REASONING_CONTENT should fail (no active reasoning)
    verifier.verify({ type: 'RUN_STARTED' });
    const err = verifier.verify({ type: 'REASONING_CONTENT' });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('missing_start');
  });
});
