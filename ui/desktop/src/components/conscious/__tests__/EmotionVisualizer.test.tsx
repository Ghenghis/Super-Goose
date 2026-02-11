import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import EmotionVisualizer from '../EmotionVisualizer';

describe('EmotionVisualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render loading state initially', () => {
    // Never-resolving fetch to keep it in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<EmotionVisualizer />);
    expect(screen.getByText('Loading emotion data...')).toBeInTheDocument();
  });

  it('should have role="status" on loading state', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<EmotionVisualizer />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should render disabled state when enabled is false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ enabled: false }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByText('Emotion engine disabled')).toBeInTheDocument();
    });
  });

  it('should render disabled state when data is null (fetch fails)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.queryByText('Loading emotion data...')).not.toBeInTheDocument();
    });
    // When data is null, it shows disabled state
    expect(screen.getByText('Emotion engine disabled')).toBeInTheDocument();
  });

  it('should render emotion data with dominant emotion', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'happy',
            trend: 'improving',
            avg_valence: 0.75,
            history: [],
          },
          latest: { emotion: 'happy', confidence: 0.92, intensity: 0.8 },
          should_offer_break: false,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByText('happy')).toBeInTheDocument();
    });
  });

  it('should render confidence percentage', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'neutral',
            trend: 'stable',
            avg_valence: 0.5,
            history: [],
          },
          latest: { emotion: 'neutral', confidence: 0.85, intensity: 0.5 },
          should_offer_break: false,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });

  it('should render valence progress bar', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'happy',
            trend: 'improving',
            avg_valence: 0.8,
            history: [],
          },
          latest: { emotion: 'happy', confidence: 0.9, intensity: 0.8 },
          should_offer_break: false,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '80');
      expect(progressBar).toHaveAttribute('aria-label', 'Emotional valence: 80%');
    });
  });

  it('should render Negative and Positive labels under valence bar', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'neutral',
            trend: 'stable',
            avg_valence: 0.5,
            history: [],
          },
          latest: null,
          should_offer_break: false,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByText('Negative')).toBeInTheDocument();
      expect(screen.getByText('Positive')).toBeInTheDocument();
    });
  });

  it('should render break suggestion when should_offer_break is true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'frustrated',
            trend: 'declining',
            avg_valence: 0.2,
            history: [],
          },
          latest: { emotion: 'frustrated', confidence: 0.88, intensity: 0.9 },
          should_offer_break: true,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/want to take a break/i)).toBeInTheDocument();
    });
  });

  it('should render trend direction text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          enabled: true,
          model_loaded: true,
          mood: {
            dominant_emotion: 'happy',
            trend: 'improving',
            avg_valence: 0.7,
            history: [],
          },
          latest: null,
          should_offer_break: false,
        }),
    });

    render(<EmotionVisualizer />);

    await waitFor(() => {
      expect(screen.getByText('improving')).toBeInTheDocument();
    });
  });
});
