import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeatureToggles } from '../FeatureToggles';

// Mock window.electron used by useFeatureSettings
const mockGetSettings = window.electron.getSettings as ReturnType<typeof vi.fn>;
const mockSaveSettings = window.electron.saveSettings as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  // Default: return settings with featureSettings
  mockGetSettings.mockResolvedValue({
    featureSettings: {
      reflexionEnabled: true,
      guardrailsEnabled: true,
      costTrackingEnabled: true,
      bookmarksEnabled: true,
      compactionEnabled: true,
      searchEnabled: true,
      projectAutoDetection: true,
      modelHotSwitch: true,
    },
  });

  mockSaveSettings.mockResolvedValue(true);
});

describe('FeatureToggles', () => {
  it('renders the Feature Toggles heading', () => {
    render(<FeatureToggles />);
    expect(screen.getByText('Feature Toggles')).toBeDefined();
  });

  it('renders all 8 feature toggle labels', async () => {
    render(<FeatureToggles />);

    await waitFor(() => {
      expect(screen.getByText('Reflexion')).toBeDefined();
      expect(screen.getByText('Guardrails')).toBeDefined();
      expect(screen.getByText('Cost Tracking')).toBeDefined();
      expect(screen.getByText('Bookmarks')).toBeDefined();
      expect(screen.getByText('Auto-Compaction')).toBeDefined();
      expect(screen.getByText('Cross-Session Search')).toBeDefined();
      expect(screen.getByText('Project Detection')).toBeDefined();
      expect(screen.getByText('Model Hot-Switch')).toBeDefined();
    });
  });

  it('renders feature descriptions', async () => {
    render(<FeatureToggles />);

    await waitFor(() => {
      expect(screen.getByText('Learn from past failures to improve responses')).toBeDefined();
      expect(screen.getByText('Scan messages for secrets, PII, and prompt injection')).toBeDefined();
      expect(screen.getByText('Track per-message model pricing and usage costs')).toBeDefined();
    });
  });

  it('loads feature states from settings', async () => {
    mockGetSettings.mockResolvedValue({
      featureSettings: {
        reflexionEnabled: false,
        guardrailsEnabled: true,
        costTrackingEnabled: false,
        bookmarksEnabled: true,
        compactionEnabled: true,
        searchEnabled: true,
        projectAutoDetection: true,
        modelHotSwitch: true,
      },
    });

    render(<FeatureToggles />);

    await waitFor(() => {
      const reflexionToggle = screen.getByTestId('toggle-reflexionEnabled');
      expect(reflexionToggle.getAttribute('data-state')).toBe('unchecked');

      const guardrailsToggle = screen.getByTestId('toggle-guardrailsEnabled');
      expect(guardrailsToggle.getAttribute('data-state')).toBe('checked');

      const costToggle = screen.getByTestId('toggle-costTrackingEnabled');
      expect(costToggle.getAttribute('data-state')).toBe('unchecked');
    });
  });

  it('toggles a feature and persists', async () => {
    render(<FeatureToggles />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-reflexionEnabled')).toBeDefined();
    });

    const reflexionToggle = screen.getByTestId('toggle-reflexionEnabled');
    fireEvent.click(reflexionToggle);

    await waitFor(() => {
      // Should call saveSettings with the updated value
      expect(mockSaveSettings).toHaveBeenCalled();
    });
  });

  it('renders all 8 toggle switches', async () => {
    render(<FeatureToggles />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-reflexionEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-guardrailsEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-costTrackingEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-bookmarksEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-compactionEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-searchEnabled')).toBeDefined();
      expect(screen.getByTestId('toggle-projectAutoDetection')).toBeDefined();
      expect(screen.getByTestId('toggle-modelHotSwitch')).toBeDefined();
    });
  });

  it('handles failed settings load gracefully', async () => {
    mockGetSettings.mockRejectedValue(new Error('Settings unavailable'));

    render(<FeatureToggles />);

    // Should still render with defaults (all true)
    await waitFor(() => {
      const reflexionToggle = screen.getByTestId('toggle-reflexionEnabled');
      expect(reflexionToggle.getAttribute('data-state')).toBe('checked');
    });
  });

  it('all toggles default to checked', async () => {
    // Return empty featureSettings so defaults apply
    mockGetSettings.mockResolvedValue({});

    render(<FeatureToggles />);

    await waitFor(() => {
      const reflexionToggle = screen.getByTestId('toggle-reflexionEnabled');
      expect(reflexionToggle.getAttribute('data-state')).toBe('checked');

      const guardrailsToggle = screen.getByTestId('toggle-guardrailsEnabled');
      expect(guardrailsToggle.getAttribute('data-state')).toBe('checked');
    });
  });
});
