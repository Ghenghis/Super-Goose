import { getInitialWorkingDir } from '../workingDir';

describe('getInitialWorkingDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns working dir from appConfig', () => {
    (window as any).appConfig = {
      get: vi.fn((key: string) =>
        key === 'GOOSE_WORKING_DIR' ? '/home/user/project' : undefined
      ),
    };
    expect(getInitialWorkingDir()).toBe('/home/user/project');
  });

  it('returns empty string when appConfig has no GOOSE_WORKING_DIR', () => {
    (window as any).appConfig = {
      get: vi.fn(() => undefined),
    };
    expect(getInitialWorkingDir()).toBe('');
  });

  it('returns empty string when appConfig is undefined', () => {
    (window as any).appConfig = undefined;
    expect(getInitialWorkingDir()).toBe('');
  });

  it('returns empty string when appConfig.get returns null', () => {
    (window as any).appConfig = {
      get: vi.fn(() => null),
    };
    expect(getInitialWorkingDir()).toBe('');
  });

  it('calls appConfig.get with correct key', () => {
    const mockGet = vi.fn(() => '/tmp');
    (window as any).appConfig = { get: mockGet };
    getInitialWorkingDir();
    expect(mockGet).toHaveBeenCalledWith('GOOSE_WORKING_DIR');
  });
});
