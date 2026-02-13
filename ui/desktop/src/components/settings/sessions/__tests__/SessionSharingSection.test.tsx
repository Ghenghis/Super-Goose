import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionSharingSection from '../SessionSharingSection';

// Track mock setters
const mockSetSharingEnabled = vi.fn();
const mockSetSharingBaseUrl = vi.fn();

// Mutable state that tests can override
let mockSharingEnabled = false;
let mockSharingBaseUrl = '';

vi.mock('../../../../utils/settingsBridge', () => ({
  useSettingsBridge: (key: string, defaultValue: unknown) => {
    if (key === 'sessionSharingEnabled') {
      return { value: mockSharingEnabled, setValue: mockSetSharingEnabled, isLoading: false };
    }
    if (key === 'sessionSharingBaseUrl') {
      return { value: mockSharingBaseUrl, setValue: mockSetSharingBaseUrl, isLoading: false };
    }
    return { value: defaultValue, setValue: vi.fn(), isLoading: false };
  },
  SettingsKeys: {
    SessionSharingEnabled: 'sessionSharingEnabled',
    SessionSharingBaseUrl: 'sessionSharingBaseUrl',
  },
}));

// Mock dependencies
vi.mock('../../../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="url-input" {...props} />
  ),
}));

vi.mock('../../../ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked: boolean;
    onCheckedChange?: (val: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="switch"
      data-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      Toggle
    </button>
  ),
}));

vi.mock('../../../ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="card-description">{children}</p>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title">{children}</h3>
  ),
}));

vi.mock('../../../../utils/analytics', () => ({
  trackSettingToggled: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span>Check</span>,
  Lock: () => <span data-testid="lock-icon">Lock</span>,
  Loader2: () => <span>Loader</span>,
  AlertCircle: () => <span>Alert</span>,
}));

describe('SessionSharingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    mockSharingEnabled = false;
    mockSharingBaseUrl = '';

    // Mock window.appConfig
    Object.defineProperty(window, 'appConfig', {
      writable: true,
      value: {
        get: vi.fn(() => undefined),
      },
    });
  });

  it('renders the Session Sharing title', () => {
    render(<SessionSharingSection />);
    expect(screen.getByTestId('card-title')).toHaveTextContent('Session Sharing');
  });

  it('renders the description text', () => {
    render(<SessionSharingSection />);
    expect(screen.getByTestId('card-description')).toHaveTextContent(
      'You can enable session sharing'
    );
  });

  it('renders the enable toggle', () => {
    render(<SessionSharingSection />);
    expect(screen.getByText('Enable session sharing')).toBeInTheDocument();
  });

  it('renders the toggle switch', () => {
    render(<SessionSharingSection />);
    expect(screen.getByTestId('switch')).toBeInTheDocument();
  });

  it('toggle starts unchecked by default', () => {
    render(<SessionSharingSection />);
    const toggle = screen.getByTestId('switch');
    expect(toggle).toHaveAttribute('data-checked', 'false');
  });

  it('shows lock icon when env var is set', () => {
    Object.defineProperty(window, 'appConfig', {
      writable: true,
      value: {
        get: vi.fn(() => 'https://example.com/share'),
      },
    });

    render(<SessionSharingSection />);
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('loads saved config from settings bridge', () => {
    mockSharingEnabled = true;
    mockSharingBaseUrl = 'https://saved.example.com';

    render(<SessionSharingSection />);
    const toggle = screen.getByTestId('switch');
    expect(toggle).toHaveAttribute('data-checked', 'true');
  });
});
