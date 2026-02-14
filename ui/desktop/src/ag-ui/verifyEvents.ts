/**
 * AG-UI Event Verification Pipeline
 *
 * Validates that events arrive in correct sequences:
 * - RUN_STARTED must come first
 * - No events after RUN_FINISHED/RUN_ERROR
 * - TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT/END
 * - TOOL_CALL_START before TOOL_CALL_ARGS/END
 * - REASONING_START before REASONING_MESSAGE_CONTENT/REASONING_MESSAGE_END/REASONING_END
 * - STEP_STARTED before STEP_FINISHED
 */

export interface VerificationError {
  type: 'sequence' | 'missing_start' | 'duplicate' | 'after_finish';
  message: string;
  event: unknown;
}

export interface EventVerifier {
  /** Verify an event. Returns null if valid, or error details if invalid. */
  verify(event: { type: string; [key: string]: unknown }): VerificationError | null;
  /** Reset verifier state. */
  reset(): void;
}

export function createEventVerifier(): EventVerifier {
  let runStarted = false;
  let runFinished = false;
  const activeMessages = new Set<string>();
  const activeToolCalls = new Set<string>();
  const activeSteps = new Set<string>();
  let reasoningActive = false;

  return {
    verify(event) {
      const { type } = event;

      // After RUN_FINISHED/RUN_ERROR, only CUSTOM and RAW are allowed
      if (runFinished && type !== 'CUSTOM' && type !== 'RAW' && type !== 'RUN_STARTED') {
        return { type: 'after_finish', message: `Event ${type} received after run finished`, event };
      }

      switch (type) {
        case 'RUN_STARTED':
          if (runStarted && !runFinished) {
            return { type: 'duplicate', message: 'RUN_STARTED while run already active', event };
          }
          runStarted = true;
          runFinished = false;
          activeMessages.clear();
          activeToolCalls.clear();
          activeSteps.clear();
          reasoningActive = false;
          break;

        case 'RUN_FINISHED':
        case 'RUN_ERROR':
          if (!runStarted) {
            return { type: 'sequence', message: `${type} without RUN_STARTED`, event };
          }
          runFinished = true;
          break;

        case 'TEXT_MESSAGE_START': {
          const mid = (event as Record<string, unknown>).messageId as string | undefined;
          if (mid && activeMessages.has(mid)) {
            return { type: 'duplicate', message: `Duplicate TEXT_MESSAGE_START for ${mid}`, event };
          }
          if (mid) activeMessages.add(mid);
          break;
        }

        case 'TEXT_MESSAGE_CONTENT':
        case 'TEXT_MESSAGE_END': {
          const mid = (event as Record<string, unknown>).messageId as string | undefined;
          if (mid && !activeMessages.has(mid)) {
            return { type: 'missing_start', message: `${type} without TEXT_MESSAGE_START for ${mid}`, event };
          }
          if (type === 'TEXT_MESSAGE_END' && mid) {
            activeMessages.delete(mid);
          }
          break;
        }

        case 'TOOL_CALL_START': {
          const tcId = (event as Record<string, unknown>).toolCallId as string | undefined;
          if (tcId && activeToolCalls.has(tcId)) {
            return { type: 'duplicate', message: `Duplicate TOOL_CALL_START for ${tcId}`, event };
          }
          if (tcId) activeToolCalls.add(tcId);
          break;
        }

        case 'TOOL_CALL_ARGS':
        case 'TOOL_CALL_END': {
          const tcId = (event as Record<string, unknown>).toolCallId as string | undefined;
          if (tcId && !activeToolCalls.has(tcId)) {
            return { type: 'missing_start', message: `${type} without TOOL_CALL_START for ${tcId}`, event };
          }
          if (type === 'TOOL_CALL_END' && tcId) {
            activeToolCalls.delete(tcId);
          }
          break;
        }

        case 'STEP_STARTED': {
          const name = (event as Record<string, unknown>).stepName as string | undefined;
          if (name) activeSteps.add(name);
          break;
        }

        case 'STEP_FINISHED': {
          const name = (event as Record<string, unknown>).stepName as string | undefined;
          if (name && !activeSteps.has(name)) {
            return { type: 'missing_start', message: `STEP_FINISHED without STEP_STARTED for ${name}`, event };
          }
          if (name) activeSteps.delete(name);
          break;
        }

        case 'REASONING_START':
          reasoningActive = true;
          break;

        case 'REASONING_MESSAGE_CONTENT':
        case 'REASONING_MESSAGE_END':
          if (!reasoningActive) {
            return { type: 'missing_start', message: `${type} without REASONING_START`, event };
          }
          break;

        case 'REASONING_END':
          if (!reasoningActive) {
            return { type: 'missing_start', message: `${type} without REASONING_START`, event };
          }
          reasoningActive = false;
          break;

        // Chunk events, snapshots, custom, raw -- always valid
        case 'TEXT_MESSAGE_CHUNK':
        case 'TOOL_CALL_CHUNK':
        case 'TOOL_CALL_RESULT':
        case 'REASONING_MESSAGE_START':
        case 'REASONING_MESSAGE_CHUNK':
        case 'REASONING_ENCRYPTED_VALUE':
        case 'STATE_SNAPSHOT':
        case 'STATE_DELTA':
        case 'MESSAGES_SNAPSHOT':
        case 'ACTIVITY_SNAPSHOT':
        case 'ACTIVITY_DELTA':
        case 'CUSTOM':
        case 'RAW':
        case 'ACTIVITY':
          break;
      }

      return null;
    },

    reset() {
      runStarted = false;
      runFinished = false;
      activeMessages.clear();
      activeToolCalls.clear();
      activeSteps.clear();
      reasoningActive = false;
    },
  };
}
