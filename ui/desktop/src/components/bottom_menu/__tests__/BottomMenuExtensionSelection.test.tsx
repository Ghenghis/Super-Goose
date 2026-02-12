import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../constants/events', () => ({
  AppEvents: {
    SESSION_CREATED: 'session-created',
    MESSAGE_STREAM_FINISHED: 'message-stream-finished',
  },
}));
vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
}));
vi.mock('../../ui/input', () => ({
  Input: (props: any) => <input data-testid="search-input" {...props} />,
}));
vi.mock('../../ui/switch', () => ({
  Switch: ({ checked }: any) => (
    <button data-testid="switch" role="switch" aria-checked={checked}>
      {checked ? 'on' : 'off'}
    </button>
  ),
}));
vi.mock('../../ConfigContext', () => ({
  useConfig: () => ({
    extensionsList: [
      { name: 'developer', enabled: true, description: 'Developer tools' },
      { name: 'memory', enabled: false, description: 'Memory extension' },
    ],
  }),
}));
vi.mock('../../../toasts', () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../settings/extensions/subcomponents/ExtensionList', () => ({
  formatExtensionName: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
}));
vi.mock('../../../api', () => ({
  getSessionExtensions: vi.fn(() =>
    Promise.resolve({ data: { extensions: [{ name: 'developer' }] } })
  ),
}));
vi.mock('../../settings/extensions/agent-api', () => ({
  addToAgent: vi.fn(),
  removeFromAgent: vi.fn(),
}));
vi.mock('../../../store/extensionOverrides', () => ({
  setExtensionOverride: vi.fn(),
  getExtensionOverride: vi.fn(() => null),
  getExtensionOverrides: vi.fn(() => new Map()),
}));

import { BottomMenuExtensionSelection } from '../BottomMenuExtensionSelection';

describe('BottomMenuExtensionSelection', () => {
  it('renders the trigger button with active count', async () => {
    render(<BottomMenuExtensionSelection sessionId="sess-1" />);
    // The trigger shows count of enabled extensions (1 from mock)
    // Count updates asynchronously after getSessionExtensions resolves
    const trigger = screen.getByTestId('dropdown-trigger');
    expect(trigger).toBeInTheDocument();
    await waitFor(() => {
      expect(trigger.textContent).toContain('1');
    });
  });

  it('renders trigger with manage extensions title', () => {
    render(<BottomMenuExtensionSelection sessionId="sess-1" />);
    const button = screen.getByTitle('manage extensions');
    expect(button).toBeInTheDocument();
  });

  it('renders for hub view when sessionId is null', () => {
    render(<BottomMenuExtensionSelection sessionId={null} />);
    const trigger = screen.getByTestId('dropdown-trigger');
    expect(trigger).toBeInTheDocument();
  });

  it('shows correct count for all enabled extensions', () => {
    render(<BottomMenuExtensionSelection sessionId={null} />);
    // From mock: developer is enabled (1), memory is disabled
    const trigger = screen.getByTestId('dropdown-trigger');
    expect(trigger.textContent).toContain('1');
  });
});
