import { renderHook, act } from '@testing-library/react';

vi.mock('../../api', () => ({
  transcribeDictation: vi.fn(() => Promise.resolve({ data: { text: 'hello world' } })),
  getDictationConfig: vi.fn(() =>
    Promise.resolve({ data: { google: { configured: true } } })
  ),
}));

vi.mock('../../components/ConfigContext', () => ({
  useConfig: () => ({
    read: vi.fn(() => Promise.resolve('google')),
    config: {},
  }),
}));

vi.mock('../../utils/conversionUtils', () => ({
  errorMessage: (err: any) => err?.message || String(err),
}));

import { useAudioRecorder } from '../useAudioRecorder';

describe('useAudioRecorder', () => {
  const onTranscription = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onTranscription, onError })
    );

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
  });

  it('returns startRecording and stopRecording functions', () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onTranscription, onError })
    );

    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
  });

  it('returns dictation provider from config', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onTranscription, onError })
    );

    // The hook checks config asynchronously
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // After async check, provider should be set
    expect(result.current.dictationProvider).toBeDefined();
  });

  it('calls onError if startRecording fails without enabled', async () => {
    // Disable dictation by making read return null
    vi.mocked(await import('../../components/ConfigContext')).useConfig = () => ({
      read: vi.fn(() => Promise.resolve(null)),
      config: {},
    }) as any;

    const { result } = renderHook(() =>
      useAudioRecorder({ onTranscription, onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith('Voice dictation is not enabled');
  });
});
