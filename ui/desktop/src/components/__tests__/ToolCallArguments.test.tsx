import { render, screen, fireEvent } from '@testing-library/react';

// Mock MarkdownContent since it has complex rendering
vi.mock('../MarkdownContent', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

// Mock Expand component
vi.mock('../ui/Expand', () => ({
  default: ({ isExpanded }: { isExpanded: boolean }) => (
    <span data-testid="expand-icon">{isExpanded ? 'collapse' : 'expand'}</span>
  ),
}));

import { ToolCallArguments } from '../ToolCallArguments';

describe('ToolCallArguments', () => {
  it('renders short string values inline without expand', () => {
    render(<ToolCallArguments args={{ path: '/src/file.ts' }} />);
    expect(screen.getByText('path')).toBeInTheDocument();
    expect(screen.getByText('/src/file.ts')).toBeInTheDocument();
    // Short values should not have expand icon
    expect(screen.queryByTestId('expand-icon')).not.toBeInTheDocument();
  });

  it('renders long string values with expand button', () => {
    const longValue = 'a'.repeat(100);
    render(<ToolCallArguments args={{ content: longValue }} />);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByTestId('expand-icon')).toBeInTheDocument();
    expect(screen.getByTestId('expand-icon').textContent).toBe('expand');
  });

  it('toggles expansion on click for long strings', () => {
    const longValue = 'This is a long string that exceeds sixty characters and should trigger the expansion behavior.';
    render(<ToolCallArguments args={{ content: longValue }} />);

    // Click the key button to expand
    const keyButton = screen.getByText('content');
    fireEvent.click(keyButton);

    // After expanding, MarkdownContent should be rendered
    expect(screen.getByTestId('markdown')).toBeInTheDocument();
  });

  it('renders non-string values as JSON', () => {
    render(<ToolCallArguments args={{ count: 42 as any }} />);
    expect(screen.getByText('count')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders array values as numbered list', () => {
    render(<ToolCallArguments args={{ items: ['one', 'two'] as any }} />);
    expect(screen.getByText('items')).toBeInTheDocument();
    expect(screen.getByText(/1\. "one"/)).toBeInTheDocument();
  });

  it('renders object values as JSON', () => {
    render(<ToolCallArguments args={{ config: { key: 'val' } as any }} />);
    expect(screen.getByText('config')).toBeInTheDocument();
    // The pre should contain JSON stringified content
    expect(screen.getByText(/"key": "val"/)).toBeInTheDocument();
  });

  it('renders multiple arguments', () => {
    render(<ToolCallArguments args={{ path: '/a.ts', command: 'view' }} />);
    expect(screen.getByText('path')).toBeInTheDocument();
    expect(screen.getByText('command')).toBeInTheDocument();
  });

  it('renders null value as string', () => {
    render(<ToolCallArguments args={{ value: null }} />);
    expect(screen.getByText('value')).toBeInTheDocument();
    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
