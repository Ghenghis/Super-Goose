import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExtensionList, {
  formatExtensionName,
  getFriendlyTitle,
  getSubtitle,
} from '../ExtensionList';

// Mock ExtensionItem
vi.mock('../ExtensionItem', () => ({
  default: ({
    extension,
    onToggle,
    onConfigure,
    isStatic,
  }: {
    extension: { name: string; enabled: boolean };
    onToggle: () => void;
    onConfigure: () => void;
    isStatic?: boolean;
  }) => (
    <div
      data-testid={`extension-item-${extension.name}`}
      data-enabled={extension.enabled}
      data-static={isStatic}
    >
      <span>{extension.name}</span>
      <button onClick={onToggle}>Toggle</button>
      <button onClick={onConfigure}>Configure</button>
    </div>
  ),
}));

// Mock built-in extensions data
vi.mock('../../../../../built-in-extensions.json', () => ({
  default: [
    { name: 'Developer', description: 'General development tools useful for software engineering.' },
    { name: 'Memory', description: 'Memory and context management extension.' },
  ],
}));

const createExtension = (overrides = {}) => ({
  name: 'test-ext',
  type: 'stdio' as const,
  enabled: true,
  description: 'A test extension',
  cmd: 'node',
  args: ['server.js'],
  ...overrides,
});

describe('ExtensionList', () => {
  const defaultProps = {
    extensions: [
      createExtension({ name: 'alpha-ext', enabled: true }),
      createExtension({ name: 'beta-ext', enabled: false }),
      createExtension({ name: 'gamma-ext', enabled: true }),
    ] as any[],
    onToggle: vi.fn(),
    onConfigure: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders enabled extensions under Default Extensions heading', () => {
    render(<ExtensionList {...defaultProps} />);
    expect(screen.getByText(/Default Extensions/)).toBeInTheDocument();
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
  });

  it('renders disabled extensions under Available Extensions heading', () => {
    render(<ExtensionList {...defaultProps} />);
    expect(screen.getByText(/Available Extensions/)).toBeInTheDocument();
    expect(screen.getByText(/\(1\)/)).toBeInTheDocument();
  });

  it('renders individual extension items', () => {
    render(<ExtensionList {...defaultProps} />);
    expect(screen.getByTestId('extension-item-alpha-ext')).toBeInTheDocument();
    expect(screen.getByTestId('extension-item-beta-ext')).toBeInTheDocument();
    expect(screen.getByTestId('extension-item-gamma-ext')).toBeInTheDocument();
  });

  it('shows "No extensions available" when list is empty', () => {
    render(<ExtensionList {...defaultProps} extensions={[]} />);
    expect(screen.getByText('No extensions available')).toBeInTheDocument();
  });

  it('does not show Default Extensions heading when no enabled extensions', () => {
    const extensions = [createExtension({ name: 'ext-a', enabled: false })];
    render(<ExtensionList {...defaultProps} extensions={extensions as any[]} />);
    expect(screen.queryByText(/Default Extensions/)).not.toBeInTheDocument();
  });

  it('does not show Available Extensions heading when no disabled extensions', () => {
    const extensions = [createExtension({ name: 'ext-a', enabled: true })];
    render(<ExtensionList {...defaultProps} extensions={extensions as any[]} />);
    expect(screen.queryByText(/Available Extensions/)).not.toBeInTheDocument();
  });

  it('filters extensions by search term matching name', () => {
    render(<ExtensionList {...defaultProps} searchTerm="alpha" />);
    expect(screen.getByTestId('extension-item-alpha-ext')).toBeInTheDocument();
    expect(screen.queryByTestId('extension-item-beta-ext')).not.toBeInTheDocument();
    expect(screen.queryByTestId('extension-item-gamma-ext')).not.toBeInTheDocument();
  });

  it('passes isStatic prop to extension items', () => {
    render(<ExtensionList {...defaultProps} isStatic={true} />);
    const item = screen.getByTestId('extension-item-alpha-ext');
    expect(item).toHaveAttribute('data-static', 'true');
  });

  it('search is case insensitive', () => {
    render(<ExtensionList {...defaultProps} searchTerm="ALPHA" />);
    expect(screen.getByTestId('extension-item-alpha-ext')).toBeInTheDocument();
  });
});

describe('formatExtensionName', () => {
  it('capitalizes words and replaces hyphens with spaces', () => {
    expect(formatExtensionName('my-extension')).toBe('My Extension');
  });

  it('capitalizes words and replaces underscores with spaces', () => {
    expect(formatExtensionName('my_extension')).toBe('My Extension');
  });

  it('handles single word', () => {
    expect(formatExtensionName('developer')).toBe('Developer');
  });

  it('handles mixed separators', () => {
    expect(formatExtensionName('my-cool_extension')).toBe('My Cool Extension');
  });
});

describe('getFriendlyTitle', () => {
  it('uses display_name for builtin extensions', () => {
    const ext = { name: 'dev', type: 'builtin' as const, display_name: 'Developer Tools', enabled: true };
    expect(getFriendlyTitle(ext as any)).toBe('Developer Tools');
  });

  it('uses name for non-builtin extensions', () => {
    const ext = { name: 'my-custom-ext', type: 'stdio' as const, enabled: true };
    expect(getFriendlyTitle(ext as any)).toBe('My Custom Ext');
  });

  it('uses display_name for platform extensions', () => {
    const ext = { name: 'plat', type: 'platform' as const, display_name: 'Platform Tool', enabled: true };
    expect(getFriendlyTitle(ext as any)).toBe('Platform Tool');
  });
});

describe('getSubtitle', () => {
  it('returns built-in description from data file for builtin extensions', () => {
    const ext = { name: 'Developer', type: 'builtin' as const, enabled: true };
    const result = getSubtitle(ext as any);
    expect(result.description).toBe('General development tools useful for software engineering.');
    expect(result.command).toBeNull();
  });

  it('returns fallback description for unknown builtin', () => {
    const ext = { name: 'unknown-builtin', type: 'builtin' as const, enabled: true };
    const result = getSubtitle(ext as any);
    expect(result.description).toBe('Built-in extension');
  });

  it('returns description and command for stdio extensions', () => {
    const ext = {
      name: 'my-ext',
      type: 'stdio' as const,
      description: 'My extension',
      cmd: 'npx',
      args: ['server'],
      enabled: true,
    };
    const result = getSubtitle(ext as any);
    expect(result.description).toBe('My extension');
    expect(result.command).toBe('npx server');
  });

  it('returns SSE description for sse extensions', () => {
    const ext = {
      name: 'remote-ext',
      type: 'sse' as const,
      uri: 'https://example.com/sse',
      enabled: true,
    };
    const result = getSubtitle(ext as any);
    expect(result.description).toContain('SSE extension');
    expect(result.command).toBe('https://example.com/sse');
  });

  it('returns STREAMABLE HTTP description for streamable_http extensions', () => {
    const ext = {
      name: 'stream-ext',
      type: 'streamable_http' as const,
      uri: 'https://example.com/stream',
      description: 'Streaming ext',
      enabled: true,
    };
    const result = getSubtitle(ext as any);
    expect(result.description).toContain('STREAMABLE HTTP extension');
    expect(result.description).toContain('Streaming ext');
  });
});
