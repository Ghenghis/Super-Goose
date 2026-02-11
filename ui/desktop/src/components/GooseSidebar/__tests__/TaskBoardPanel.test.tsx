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

import TaskBoardPanel from '../TaskBoardPanel';

describe('TaskBoardPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [],
      plugins: [],
      connectors: [],
      fileActivity: [],
      toolCalls: [],
      taskBoard: [
        { id: 1, title: 'Create AgentPanelContext', status: 'completed', owner: 'Super-Goose' },
        { id: 2, title: 'Build AgentStatusPanel', status: 'in_progress', owner: 'Code Analyst' },
        { id: 3, title: 'Implement TaskBoard UI', status: 'pending' },
        { id: 4, title: 'Wire up connector status', status: 'blocked', blockedBy: [2] },
      ],
      messages: [],
    };
  });

  it('renders the Tasks heading', () => {
    render(<TaskBoardPanel />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('displays the completed/total count', () => {
    render(<TaskBoardPanel />);
    // 1 completed out of 4 total
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  it('renders all task titles', () => {
    render(<TaskBoardPanel />);
    expect(screen.getByText('Create AgentPanelContext')).toBeInTheDocument();
    expect(screen.getByText('Build AgentStatusPanel')).toBeInTheDocument();
    expect(screen.getByText('Implement TaskBoard UI')).toBeInTheDocument();
    expect(screen.getByText('Wire up connector status')).toBeInTheDocument();
  });

  it('renders task IDs', () => {
    render(<TaskBoardPanel />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('#4')).toBeInTheDocument();
  });

  it('renders task owners', () => {
    render(<TaskBoardPanel />);
    expect(screen.getByText('Super-Goose')).toBeInTheDocument();
    expect(screen.getByText('Code Analyst')).toBeInTheDocument();
  });

  it('shows "No tasks" when task list is empty', () => {
    mockState.taskBoard = [];
    render(<TaskBoardPanel />);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('displays 0/0 count when empty', () => {
    mockState.taskBoard = [];
    render(<TaskBoardPanel />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});
