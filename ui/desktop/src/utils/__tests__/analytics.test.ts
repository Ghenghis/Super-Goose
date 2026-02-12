import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setTelemetryEnabled,
  trackPageView,
  trackError,
  trackErrorWithContext,
  trackOnboardingStarted,
  trackOnboardingCompleted,
  trackOnboardingAbandoned,
  trackOnboardingProviderSelected,
  trackOnboardingSetupFailed,
  trackModelChanged,
  trackSettingsTabViewed,
  trackSettingToggled,
  trackTelemetryPreference,
  getErrorType,
  getStackSummary,
  trackExtensionAdded,
  trackExtensionEnabled,
  trackExtensionDisabled,
  trackExtensionDeleted,
  trackScheduleCreated,
  trackRecipeCreated,
  trackFileAttached,
  trackVoiceDictation,
  trackModeChanged,
  trackUpdateCheckStarted,
  trackUpdateDownloadStarted,
  trackUpdateDownloadProgress,
  trackUpdateDownloadCompleted,
} from '../analytics';

vi.mock('../../api', () => ({
  sendTelemetryEvent: vi.fn(() => Promise.resolve()),
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Disable telemetry for isolation, then re-enable as needed
    setTelemetryEnabled(false);
  });

  describe('getErrorType', () => {
    it('extracts Error name and first line of message', () => {
      const error = new TypeError('Cannot read property of undefined');
      const result = getErrorType(error);
      expect(result).toBe('TypeError: Cannot read property of undefined');
    });

    it('handles multi-line error messages (takes first line)', () => {
      const error = new Error('Line 1\nLine 2\nLine 3');
      expect(getErrorType(error)).toBe('Error: Line 1');
    });

    it('truncates very long error messages to 200 chars', () => {
      const longMsg = 'x'.repeat(300);
      const error = new Error(longMsg);
      const result = getErrorType(error);
      // 'Error: ' + 200 chars
      expect(result.length).toBeLessThanOrEqual(207);
    });

    it('converts non-Error values to string', () => {
      expect(getErrorType('string error')).toBe('string error');
      expect(getErrorType(42)).toBe('42');
    });
  });

  describe('getStackSummary', () => {
    it('returns undefined for non-Error values', () => {
      expect(getStackSummary('not an error')).toBeUndefined();
    });

    it('returns undefined for Error without stack', () => {
      const error = new Error('test');
      error.stack = undefined;
      expect(getStackSummary(error)).toBeUndefined();
    });

    it('extracts function names from stack frames', () => {
      const error = new Error('test');
      error.stack =
        'Error: test\n    at MyComponent (file.js:10:5)\n    at Object.render (react.js:20:3)';
      const result = getStackSummary(error);
      expect(result).toBe('MyComponent > Object.render');
    });
  });

  describe('telemetry gating', () => {
    it('does not send events when telemetry is disabled', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      setTelemetryEnabled(false);
      trackPageView('/test');
      expect(sendTelemetryEvent).not.toHaveBeenCalled();
    });

    it('sends events when telemetry is enabled', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      setTelemetryEnabled(true);
      trackPageView('/home');
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'page_view',
            properties: expect.objectContaining({ page: '/home' }),
          }),
        })
      );
    });
  });

  describe('trackTelemetryPreference', () => {
    it('sends when telemetry is enabled', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      setTelemetryEnabled(true);
      trackTelemetryPreference(true, 'settings');
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'telemetry_preference_set',
          }),
        })
      );
    });

    it('is gated by sendEvent when telemetry is disabled', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      setTelemetryEnabled(false);
      trackTelemetryPreference(false, 'onboarding');
      // The implementation routes through sendEvent() which checks canTrack()
      // Despite the intent comment, the event is gated when disabled
      expect(sendTelemetryEvent).not.toHaveBeenCalled();
    });
  });

  describe('tracking functions', () => {
    beforeEach(() => {
      setTelemetryEnabled(true);
    });

    it('trackError sends error_occurred event', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackError('NetworkError', { component: 'ChatView', recoverable: true });
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'error_occurred',
            properties: expect.objectContaining({
              error_type: 'NetworkError',
              component: 'ChatView',
              recoverable: true,
            }),
          }),
        })
      );
    });

    it('trackErrorWithContext extracts error type and stack', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      const err = new TypeError('fail');
      trackErrorWithContext(err, { component: 'App' });
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'error_occurred',
            properties: expect.objectContaining({
              error_type: expect.stringContaining('TypeError: fail'),
            }),
          }),
        })
      );
    });

    it('trackModelChanged sends model_changed event', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackModelChanged('openai', 'gpt-4');
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'model_changed',
            properties: { provider: 'openai', model: 'gpt-4' },
          }),
        })
      );
    });

    it('trackSettingsTabViewed sends settings_tab_viewed event', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackSettingsTabViewed('extensions');
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'settings_tab_viewed',
          }),
        })
      );
    });

    it('trackSettingToggled sends setting_toggled event', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackSettingToggled('darkMode', true);
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event_name: 'setting_toggled',
            properties: { setting: 'darkMode', enabled: true },
          }),
        })
      );
    });

    it('trackExtensionAdded does not include name for non-builtin', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackExtensionAdded('my-custom-ext', true, undefined, false);
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            properties: expect.objectContaining({
              extension_name: undefined,
              is_builtin: false,
            }),
          }),
        })
      );
    });

    it('trackExtensionAdded includes name for builtin', async () => {
      const { sendTelemetryEvent } = await import('../../api');
      trackExtensionAdded('developer', true, undefined, true);
      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            properties: expect.objectContaining({
              extension_name: 'developer',
              is_builtin: true,
            }),
          }),
        })
      );
    });
  });

  describe('onboarding tracking', () => {
    beforeEach(() => {
      setTelemetryEnabled(true);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('trackOnboardingCompleted calculates duration', async () => {
      const { sendTelemetryEvent } = await import('../../api');

      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      trackOnboardingStarted();

      vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
      trackOnboardingCompleted('openai', 'gpt-4');

      const calls = (sendTelemetryEvent as ReturnType<typeof vi.fn>).mock.calls;
      const completedCall = calls.find(
        (c: any[]) => c[0]?.body?.event_name === 'onboarding_completed'
      );
      expect(completedCall).toBeTruthy();
      expect(completedCall![0].body.properties.duration_seconds).toBe(30);
    });
  });
});
