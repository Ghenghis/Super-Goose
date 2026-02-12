import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardEventHandler, type EventAuditContext } from '../eventAudit';

vi.mock('../analytics', () => ({
  trackErrorWithContext: vi.fn(),
}));

describe('eventAudit', () => {
  const context: EventAuditContext = {
    component: 'TestComponent',
    action: 'click_handler',
    recoverable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when handler is undefined', () => {
    const result = guardEventHandler(undefined, context);
    expect(result).toBeUndefined();
  });

  it('wraps a synchronous handler and calls it', () => {
    const handler = vi.fn();
    const guarded = guardEventHandler(handler, context)!;

    const event = { type: 'click' };
    guarded(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('catches synchronous errors and tracks them', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const error = new Error('sync failure');
    const handler = vi.fn(() => {
      throw error;
    });

    const guarded = guardEventHandler(handler, context)!;
    guarded('test-event');

    expect(trackErrorWithContext).toHaveBeenCalledWith(error, {
      component: 'TestComponent',
      action: 'click_handler',
      recoverable: true,
    });
  });

  it('catches async rejections and tracks them', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const error = new Error('async failure');
    const handler = vi.fn(() => Promise.reject(error));

    const guarded = guardEventHandler(handler, context)!;
    guarded('test-event');

    // Wait for the microtask to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(trackErrorWithContext).toHaveBeenCalledWith(error, {
      component: 'TestComponent',
      action: 'click_handler',
      recoverable: true,
    });
  });

  it('uses default action "event_handler" when action is not provided', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const error = new Error('test');
    const handler = vi.fn(() => {
      throw error;
    });

    const guarded = guardEventHandler(handler, { component: 'MyComp' })!;
    guarded('event');

    expect(trackErrorWithContext).toHaveBeenCalledWith(error, {
      component: 'MyComp',
      action: 'event_handler',
      recoverable: true,
    });
  });

  it('uses default recoverable=true when not provided', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const error = new Error('test');
    const handler = vi.fn(() => {
      throw error;
    });

    const guarded = guardEventHandler(handler, { component: 'MyComp' })!;
    guarded('event');

    expect(trackErrorWithContext).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ recoverable: true })
    );
  });

  it('passes through recoverable=false from context', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const error = new Error('fatal');
    const handler = vi.fn(() => {
      throw error;
    });

    const guarded = guardEventHandler(handler, {
      component: 'Critical',
      recoverable: false,
    })!;
    guarded('event');

    expect(trackErrorWithContext).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ recoverable: false })
    );
  });

  it('does not track when handler succeeds synchronously', async () => {
    const { trackErrorWithContext } = await import('../analytics');
    const handler = vi.fn();

    const guarded = guardEventHandler(handler, context)!;
    guarded('event');

    expect(trackErrorWithContext).not.toHaveBeenCalled();
  });
});
