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

import AgentStatusPanel from '../AgentStatusPanel';

describe('AgentStatusPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [
        {
          id: 'main-1',
          name: 'Super-Goose',
          type: 'main',
          status: 'acting',
          contextUsage: 42,
          model: 'claude-opus-4-6',
          currentAction: 'Editing AppSidebar.tsx',
          children: [
            {
              id: 'sub-1',
              name: 'Code Analyst',
              type: 'subagent',
              status: 'gathering',
              contextUsage: 18,
              model: 'claude-sonnet-4-20250514',
              currentAction: 'Reading project structure',
            },
          ],
        },
      ],
      skills: [],
      plugins: [],
      connectors: [],
      fileActivity: [],
      toolCalls: [],
      taskBoard: [],
      messages: [],
    };
  });

  it('renders the Agents heading', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });

  it('displays the agent count', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders the main agent name', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('Super-Goose')).toBeInTheDocument();
  });

  it('renders child agent name', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('Code Analyst')).toBeInTheDocument();
  });

  it('renders the current action for the main agent', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('Editing AppSidebar.tsx')).toBeInTheDocument();
  });

  it('renders the current action for the child agent', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('Reading project structure')).toBeInTheDocument();
  });

  it('renders context usage percentages', () => {
    render(<AgentStatusPanel />);
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
  });

  it('renders with empty agents list', () => {
    mockState.agents = [];
    render(<AgentStatusPanel />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
