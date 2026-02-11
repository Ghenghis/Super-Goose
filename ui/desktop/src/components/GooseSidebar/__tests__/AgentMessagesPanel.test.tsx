import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AgentPanelState } from '../AgentPanelContext';

let mockState: AgentPanelState;

vi.mock('../AgentPanelContext', () => ({
  useAgentPanel: () => ({
    state: mockState,
    setMode: vi.fn(),
    updateAgent: vi.fn(),
    addToolCall: vi.fn(),
    addFileActivity: vi.fn(),
    addMessage: vi.fn(),
    updateTask: vi.fn(),
  }),
}));

vi.mock('../../ui/collapsible', () => ({
  Collapsible: ({ children, ...props }: any) => <div data-testid="collapsible" {...props}>{children}</div>,
  CollapsibleTrigger: ({ children, ...props }: any) => <div data-testid="collapsible-trigger" {...props}>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div data-testid="collapsible-content">{children}</div>,
}));

vi.mock('../../ui/sidebar', () => ({
  SidebarGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarGroupContent: ({ children }: any) => <div>{children}</div>,
}));

import AgentMessagesPanel from '../AgentMessagesPanel';

describe('AgentMessagesPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [],
      plugins: [],
      connectors: [],
      fileActivity: [],
      toolCalls: [],
      taskBoard: [],
      messages: [
        {
          id: 'msg-1',
          from: 'Super-Goose',
          to: 'Code Analyst',
          content: 'Analyze the sidebar patterns and report back.',
          timestamp: Date.now() - 30000,
        },
        {
          id: 'msg-2',
          from: 'Code Analyst',
          to: 'Super-Goose',
          content: 'Found 3 sidebar components.',
          timestamp: Date.now() - 15000,
        },
      ],
    };
  });

  it('renders the Messages heading', () => {
    render(<AgentMessagesPanel />);
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('displays the message count', () => {
    render(<AgentMessagesPanel />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders sender names', () => {
    render(<AgentMessagesPanel />);
    expect(screen.getAllByText('Super-Goose').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Code Analyst').length).toBeGreaterThanOrEqual(1);
  });

  it('renders message content', () => {
    render(<AgentMessagesPanel />);
    expect(screen.getByText('Analyze the sidebar patterns and report back.')).toBeInTheDocument();
    expect(screen.getByText('Found 3 sidebar components.')).toBeInTheDocument();
  });

  it('shows "No messages" when message list is empty', () => {
    mockState.messages = [];
    render(<AgentMessagesPanel />);
    expect(screen.getByText('No messages')).toBeInTheDocument();
  });

  it('displays message count as 0 when empty', () => {
    mockState.messages = [];
    render(<AgentMessagesPanel />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
