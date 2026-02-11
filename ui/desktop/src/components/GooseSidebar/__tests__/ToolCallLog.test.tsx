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

import ToolCallLog from '../ToolCallLog';

describe('ToolCallLog', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [],
      plugins: [],
      connectors: [],
      fileActivity: [],
      toolCalls: [
        { id: 'tc-1', toolName: 'Read', inputSummary: 'AppSidebar.tsx', status: 'success', timestamp: Date.now() - 8000, durationMs: 120 },
        { id: 'tc-2', toolName: 'Edit', inputSummary: 'AgentPanelContext.tsx:42', status: 'running', timestamp: Date.now() - 2000 },
        { id: 'tc-3', toolName: 'Bash', inputSummary: 'npm run build', status: 'error', timestamp: Date.now() - 15000, durationMs: 4500 },
        { id: 'tc-4', toolName: 'Grep', inputSummary: '"lucide-react" in src/', status: 'success', timestamp: Date.now() - 20000, durationMs: 340 },
      ],
      taskBoard: [],
      messages: [],
    };
  });

  it('renders the Tool Calls heading', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
  });

  it('displays the total tool call count', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows running count when there are running tool calls', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('1 running')).toBeInTheDocument();
  });

  it('renders tool names', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText('Grep')).toBeInTheDocument();
  });

  it('renders input summaries', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('AppSidebar.tsx')).toBeInTheDocument();
    expect(screen.getByText('AgentPanelContext.tsx:42')).toBeInTheDocument();
    expect(screen.getByText('npm run build')).toBeInTheDocument();
    expect(screen.getByText('"lucide-react" in src/')).toBeInTheDocument();
  });

  it('renders formatted durations for completed calls', () => {
    render(<ToolCallLog />);
    expect(screen.getByText('120ms')).toBeInTheDocument();
    expect(screen.getByText('4.5s')).toBeInTheDocument();
    expect(screen.getByText('340ms')).toBeInTheDocument();
  });

  it('renders aria-labels for status icons', () => {
    render(<ToolCallLog />);
    const successLabels = screen.getAllByLabelText('success');
    expect(successLabels.length).toBe(2);
    expect(screen.getByLabelText('running')).toBeInTheDocument();
    expect(screen.getByLabelText('error')).toBeInTheDocument();
  });

  it('shows "No tool calls" when list is empty', () => {
    mockState.toolCalls = [];
    render(<ToolCallLog />);
    expect(screen.getByText('No tool calls')).toBeInTheDocument();
  });

  it('does not show running count when no running calls', () => {
    mockState.toolCalls = [
      { id: 'tc-1', toolName: 'Read', inputSummary: 'file.ts', status: 'success', timestamp: Date.now(), durationMs: 100 },
    ];
    render(<ToolCallLog />);
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });
});
