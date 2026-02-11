import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VoiceStatusBadge } from '../VoiceStatusBadge';

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Mic: ({ className }: { className?: string }) => (
    <span data-testid="mic-icon" className={className}>
      Mic
    </span>
  ),
}));

describe('VoiceStatusBadge', () => {
  const mockSetView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when endpoint not available', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Not found')));

    const { container } = render(<VoiceStatusBadge setView={mockSetView} />);
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders when voice is active', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: true, personality: 'Professional' }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const button = await screen.findByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Voice status');
  });

  it('shows personality name when active', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: true, personality: 'Professional' }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('Voice: Professional');
  });

  it('shows "Voice: Active" when active without personality', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('Voice: Active');
  });

  it('shows "Voice: Off" when inactive', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: false }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const tooltip = await screen.findByTestId('tooltip-content');
    expect(tooltip).toHaveTextContent('Voice: Off');
  });

  it('displays personality name as text', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: true, personality: 'Casual' }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const text = await screen.findByText('Casual');
    expect(text).toBeInTheDocument();
  });

  it('displays "Off" text when inactive', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: false }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const text = await screen.findByText('Off');
    expect(text).toBeInTheDocument();
  });

  it('renders the mic icon', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      } as Response)
    );

    render(<VoiceStatusBadge setView={mockSetView} />);
    const icon = await screen.findByTestId('mic-icon');
    expect(icon).toBeInTheDocument();
  });
});
