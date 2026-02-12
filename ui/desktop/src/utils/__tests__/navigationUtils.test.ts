import { createNavigationHandler, View } from '../navigationUtils';

describe('createNavigationHandler', () => {
  const mockNavigate = vi.fn();
  let handler: ReturnType<typeof createNavigationHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = createNavigationHandler(mockNavigate);
  });

  it('navigates to / for chat view', () => {
    handler('chat');
    expect(mockNavigate).toHaveBeenCalledWith('/', { state: undefined });
  });

  it('navigates to /pair for pair view', () => {
    handler('pair');
    expect(mockNavigate).toHaveBeenCalledWith('/pair', { state: undefined });
  });

  it('navigates to /pair with resumeSessionId in URL', () => {
    handler('pair', { resumeSessionId: 'abc-123' });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/pair?resumeSessionId=abc-123',
      expect.objectContaining({ state: expect.objectContaining({ resumeSessionId: 'abc-123' }) })
    );
  });

  it('navigates to /settings', () => {
    handler('settings');
    expect(mockNavigate).toHaveBeenCalledWith('/settings', { state: undefined });
  });

  it('navigates to /sessions', () => {
    handler('sessions');
    expect(mockNavigate).toHaveBeenCalledWith('/sessions', { state: undefined });
  });

  it('navigates to /schedules', () => {
    handler('schedules');
    expect(mockNavigate).toHaveBeenCalledWith('/schedules', { state: undefined });
  });

  it('navigates to /recipes', () => {
    handler('recipes');
    expect(mockNavigate).toHaveBeenCalledWith('/recipes', { state: undefined });
  });

  it('navigates to /permission', () => {
    handler('permission');
    expect(mockNavigate).toHaveBeenCalledWith('/permission', { state: undefined });
  });

  it('navigates to /configure-providers for ConfigureProviders', () => {
    handler('ConfigureProviders');
    expect(mockNavigate).toHaveBeenCalledWith('/configure-providers', { state: undefined });
  });

  it('navigates to /shared-session', () => {
    handler('sharedSession');
    expect(mockNavigate).toHaveBeenCalledWith('/shared-session', { state: undefined });
  });

  it('navigates to /welcome', () => {
    handler('welcome');
    expect(mockNavigate).toHaveBeenCalledWith('/welcome', { state: undefined });
  });

  it('navigates to /extensions', () => {
    handler('extensions');
    expect(mockNavigate).toHaveBeenCalledWith('/extensions', { state: undefined });
  });

  it('defaults to / for unknown views', () => {
    handler('loading' as View);
    expect(mockNavigate).toHaveBeenCalledWith('/', { state: undefined });
  });

  it('passes options as state', () => {
    const opts = { error: 'Something failed' };
    handler('settings', opts);
    expect(mockNavigate).toHaveBeenCalledWith('/settings', { state: opts });
  });
});
