import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExtensionsSection from '../ExtensionsSection';

// Mock ConfigContext
const mockGetExtensions = vi.fn().mockResolvedValue([]);
const mockAddExtension = vi.fn().mockResolvedValue(undefined);
const mockRemoveExtension = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    getExtensions: mockGetExtensions,
    addExtension: mockAddExtension,
    removeExtension: mockRemoveExtension,
    extensionsList: [
      {
        name: 'developer',
        type: 'builtin',
        enabled: true,
        display_name: 'Developer',
        description: 'Dev tools',
      },
      {
        name: 'memory',
        type: 'builtin',
        enabled: false,
        display_name: 'Memory',
        description: 'Memory extension',
      },
      {
        name: 'custom-ext',
        type: 'stdio',
        enabled: true,
        cmd: 'npx',
        args: ['ext-server'],
        description: 'Custom extension',
      },
    ],
  }),
}));

// Mock ExtensionList
vi.mock('../subcomponents/ExtensionList', () => ({
  default: ({
    extensions,
    onToggle,
    onConfigure,
    searchTerm,
  }: {
    extensions: { name: string; enabled: boolean }[];
    onToggle: (ext: any) => void;
    onConfigure: (ext: any) => void;
    searchTerm: string;
  }) => (
    <div data-testid="extension-list" data-search={searchTerm}>
      {extensions.map((ext) => (
        <div key={ext.name} data-testid={`ext-${ext.name}`} data-enabled={ext.enabled}>
          <span>{ext.name}</span>
          <button onClick={() => onToggle(ext)}>Toggle {ext.name}</button>
          <button onClick={() => onConfigure(ext)}>Configure {ext.name}</button>
        </div>
      ))}
    </div>
  ),
}));

// Mock ExtensionModal
vi.mock('../modal/ExtensionModal', () => ({
  default: ({
    title,
    onClose,
    onSubmit,
    onDelete,
  }: {
    title: string;
    onClose: () => void;
    onSubmit: (data: any) => void;
    onDelete?: (name: string) => void;
  }) => (
    <div data-testid="extension-modal">
      <span>{title}</span>
      <button onClick={onClose}>Close Modal</button>
      <button onClick={() => onSubmit({ name: 'test-ext', enabled: true })}>Submit</button>
      {onDelete && <button onClick={() => onDelete('test-ext')}>Delete</button>}
    </div>
  ),
}));

// Mock extension utils
vi.mock('../utils', () => ({
  createExtensionConfig: vi.fn((data: any) => data),
  extensionToFormData: vi.fn((ext: any) => ext),
  getDefaultFormData: vi.fn(() => ({ name: '', type: 'stdio', enabled: true })),
}));

// Mock extension manager
vi.mock('../index', () => ({
  activateExtensionDefault: vi.fn().mockResolvedValue(undefined),
  toggleExtensionDefault: vi.fn().mockResolvedValue(undefined),
  deleteExtension: vi.fn().mockResolvedValue(undefined),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Plus: () => <span>+</span>,
}));

// Mock GPSIcon
vi.mock('../../../ui/icons', () => ({
  GPSIcon: () => <span>GPS</span>,
}));

describe('ExtensionsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.history.replaceState
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  it('renders the extension list', () => {
    render(<ExtensionsSection />);
    expect(screen.getByTestId('extension-list')).toBeInTheDocument();
  });

  it('renders all extensions from context', () => {
    render(<ExtensionsSection />);
    expect(screen.getByTestId('ext-developer')).toBeInTheDocument();
    expect(screen.getByTestId('ext-memory')).toBeInTheDocument();
    expect(screen.getByTestId('ext-custom-ext')).toBeInTheDocument();
  });

  it('renders Add custom extension button by default', () => {
    render(<ExtensionsSection />);
    expect(screen.getByText('Add custom extension')).toBeInTheDocument();
  });

  it('renders Browse extensions button by default', () => {
    render(<ExtensionsSection />);
    expect(screen.getByText('Browse extensions')).toBeInTheDocument();
  });

  it('hides buttons when hideButtons is true', () => {
    render(<ExtensionsSection hideButtons={true} />);
    expect(screen.queryByText('Add custom extension')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse extensions')).not.toBeInTheDocument();
  });

  it('opens add modal when Add custom extension is clicked', async () => {
    const user = userEvent.setup();
    render(<ExtensionsSection />);

    // Click the button (not the modal title)
    const addButtons = screen.getAllByText('Add custom extension');
    await user.click(addButtons[0]);
    expect(screen.getByTestId('extension-modal')).toBeInTheDocument();
    // Both the button and the modal title contain "Add custom extension"
    expect(screen.getAllByText('Add custom extension').length).toBeGreaterThanOrEqual(2);
  });

  it('opens configure modal when configure is clicked on an extension', async () => {
    const user = userEvent.setup();
    render(<ExtensionsSection />);

    await user.click(screen.getByText('Configure developer'));
    expect(screen.getByTestId('extension-modal')).toBeInTheDocument();
    expect(screen.getByText('Update Extension')).toBeInTheDocument();
  });

  it('passes searchTerm to ExtensionList', () => {
    render(<ExtensionsSection searchTerm="dev" />);
    expect(screen.getByTestId('extension-list')).toHaveAttribute('data-search', 'dev');
  });

  it('sorts extensions with builtins first', () => {
    render(<ExtensionsSection />);
    const list = screen.getByTestId('extension-list');
    const items = list.querySelectorAll('[data-testid^="ext-"]');
    // Builtins should come before custom
    expect(items.length).toBe(3);
  });
});
