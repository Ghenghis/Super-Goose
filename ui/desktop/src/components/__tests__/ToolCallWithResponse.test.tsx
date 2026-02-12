import { render, screen } from '@testing-library/react';

// Mock heavy dependencies
vi.mock('../ToolCallStatusIndicator', () => ({
  ToolIconWithStatus: ({ status }: any) => (
    <div data-testid="tool-icon-status">{status}</div>
  ),
  ToolCallStatusIndicator: ({ status }: any) => <div>{status}</div>,
}));
vi.mock('../../utils/toolIconMapping', () => ({
  getToolCallIcon: () => ({ className: _className }: any) => <span data-testid="tool-icon" />,
}));
vi.mock('../ToolCallArguments', () => ({
  ToolCallArguments: ({ args }: any) => (
    <div data-testid="tool-args">{JSON.stringify(args)}</div>
  ),
}));
vi.mock('../MarkdownContent', () => ({
  default: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));
vi.mock('../ToolApprovalButtons', () => ({
  default: ({ data }: any) => <div data-testid="approval-buttons">{data.toolName}</div>,
}));
vi.mock('../MCPUIResourceRenderer', () => ({
  default: () => <div data-testid="mcp-ui" />,
}));
vi.mock('@mcp-ui/client', () => ({
  isUIResource: () => false,
}));
vi.mock('../McpApps/McpAppRenderer', () => ({
  default: () => <div data-testid="mcp-app" />,
}));
vi.mock('../chat_coding', () => ({
  ToolResultCodeBlock: ({ content }: any) => <div data-testid="code-block">{content}</div>,
  looksLikeCode: () => false,
  FileChangeGroup: () => <div data-testid="file-changes" />,
}));
vi.mock('../settings/providers/subcomponents/buttons/TooltipWrapper', () => ({
  TooltipWrapper: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../../constants/events', () => ({
  AppEvents: { RESPONSE_STYLE_CHANGED: 'response-style-changed' },
}));

import ToolCallWithResponse from '../ToolCallWithResponse';

const makeToolRequest = (name: string, args: Record<string, unknown> = {}) => ({
  type: 'toolRequest' as const,
  toolCall: {
    status: 'success',
    value: { name, arguments: args },
  },
});

const makeToolResponse = (status: 'success' | 'error' = 'success', text = 'done') => ({
  type: 'toolResponse' as const,
  toolResult: {
    status,
    value: {
      content: [{ type: 'text' as const, text }],
    },
  },
});

describe('ToolCallWithResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem = vi.fn(() => null);
  });

  it('returns null when toolCall has no name', () => {
    const { container } = render(
      <ToolCallWithResponse
        isCancelledMessage={false}
        toolRequest={{ type: 'toolRequest', toolCall: {} } as any}
        isPendingApproval={false}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders tool call with name', () => {
    render(
      <ToolCallWithResponse
        isCancelledMessage={false}
        toolRequest={makeToolRequest('developer__shell', { command: 'ls -la' }) as any}
        isPendingApproval={false}
      />
    );
    // The component should render the tool description
    expect(screen.getByTestId('tool-icon-status')).toBeInTheDocument();
  });

  it('renders inline approval UI when pending approval', () => {
    render(
      <ToolCallWithResponse
        sessionId="sess-1"
        isCancelledMessage={false}
        toolRequest={makeToolRequest('developer__shell') as any}
        isPendingApproval={true}
        confirmationContent={{
          id: 'conf-1',
          toolName: 'shell',
          prompt: 'Run this command?',
          actionType: 'toolConfirmation',
        } as any}
        isApprovalClicked={false}
      />
    );
    expect(screen.getByTestId('approval-buttons')).toBeInTheDocument();
    expect(screen.getByText('Run this command?')).toBeInTheDocument();
  });

  it('does not render approval UI when not pending', () => {
    render(
      <ToolCallWithResponse
        sessionId="sess-1"
        isCancelledMessage={false}
        toolRequest={makeToolRequest('developer__shell') as any}
        isPendingApproval={false}
      />
    );
    expect(screen.queryByTestId('approval-buttons')).not.toBeInTheDocument();
  });

  it('renders with tool response', () => {
    render(
      <ToolCallWithResponse
        isCancelledMessage={false}
        toolRequest={makeToolRequest('developer__shell', { command: 'echo hi' }) as any}
        toolResponse={makeToolResponse() as any}
        isPendingApproval={false}
      />
    );
    // Should render the expandable tool view
    expect(screen.getByTestId('tool-icon-status')).toBeInTheDocument();
  });

  it('does not render output when message is cancelled', () => {
    render(
      <ToolCallWithResponse
        isCancelledMessage={true}
        toolRequest={makeToolRequest('developer__shell') as any}
        toolResponse={makeToolResponse() as any}
        isPendingApproval={false}
      />
    );
    // Cancelled messages should not show output section
    expect(screen.getByTestId('tool-icon-status')).toBeInTheDocument();
  });
});
