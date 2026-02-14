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

import ConnectorStatusPanel from '../ConnectorStatusPanel';

describe('ConnectorStatusPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [],
      plugins: [],
      connectors: [
        { id: 'cn-1', name: 'GitHub', state: 'connected', description: 'Repository access' },
        { id: 'cn-2', name: 'Jira', state: 'available', description: 'Issue tracking' },
        { id: 'cn-3', name: 'Slack', state: 'error', description: 'Team messaging' },
        { id: 'cn-4', name: 'PostgreSQL', state: 'connected', description: 'Database access' },
      ],
      fileActivity: [],
      toolCalls: [],
      taskBoard: [],
      messages: [],
    };
  });

  it('renders the Connectors heading', () => {
    render(<ConnectorStatusPanel />);
    expect(screen.getByText('Connectors')).toBeInTheDocument();
  });

  it('displays the connected/total count', () => {
    render(<ConnectorStatusPanel />);
    // 2 connected out of 4 total
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('renders all connector names', () => {
    render(<ConnectorStatusPanel />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });

  it('renders state labels for each connector', () => {
    render(<ConnectorStatusPanel />);
    // "Connected" appears for GitHub and PostgreSQL as state labels, and also in aria-labels
    const connectedElements = screen.getAllByText('Connected');
    expect(connectedElements.length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders aria-labels for connector states', () => {
    render(<ConnectorStatusPanel />);
    const connectedLabels = screen.getAllByLabelText('Connected');
    expect(connectedLabels.length).toBe(2);
    expect(screen.getByLabelText('Available')).toBeInTheDocument();
    expect(screen.getByLabelText('Error')).toBeInTheDocument();
  });

  it('shows "No connectors" when list is empty', () => {
    mockState.connectors = [];
    render(<ConnectorStatusPanel />);
    expect(screen.getByText('No connectors')).toBeInTheDocument();
  });

  it('displays 0/0 count when empty', () => {
    mockState.connectors = [];
    render(<ConnectorStatusPanel />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('renders extension-derived connectors with well-known fallbacks', () => {
    mockState.connectors = [
      { id: 'ext-developer', name: 'Developer', state: 'connected', description: 'builtin' },
      { id: 'ext-memory', name: 'Memory', state: 'available', description: 'stdio' },
      { id: 'wk-github', name: 'GitHub', state: 'available', description: 'Repository hosting' },
      { id: 'wk-docker-hub', name: 'Docker Hub', state: 'available', description: 'Container registry' },
      { id: 'wk-ollama', name: 'Ollama', state: 'available', description: 'Local model runtime' },
    ];
    render(<ConnectorStatusPanel />);

    // 1 connected out of 5 total
    expect(screen.getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Docker Hub')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
  });

  it('shows only well-known connectors as available when no extensions match', () => {
    mockState.connectors = [
      { id: 'wk-github', name: 'GitHub', state: 'available', description: 'Repository hosting' },
      { id: 'wk-docker-hub', name: 'Docker Hub', state: 'available', description: 'Container registry' },
      { id: 'wk-ollama', name: 'Ollama', state: 'available', description: 'Local model runtime' },
      { id: 'wk-claude-api', name: 'Claude API', state: 'available', description: 'Anthropic API' },
      { id: 'wk-openai', name: 'OpenAI', state: 'available', description: 'OpenAI API' },
    ];
    render(<ConnectorStatusPanel />);

    // 0 connected out of 5 total
    expect(screen.getByText('0/5')).toBeInTheDocument();

    // All should show "Available" label — 5 text labels + 5 aria-labels
    const availableLabels = screen.getAllByText('Available');
    expect(availableLabels).toHaveLength(5);
  });

  it('shows all connectors as connected when extensions are all enabled', () => {
    mockState.connectors = [
      { id: 'ext-a', name: 'ExtA', state: 'connected', description: 'builtin' },
      { id: 'ext-b', name: 'ExtB', state: 'connected', description: 'stdio' },
    ];
    render(<ConnectorStatusPanel />);

    expect(screen.getByText('2/2')).toBeInTheDocument();
    const connectedLabels = screen.getAllByText('Connected');
    expect(connectedLabels.length).toBeGreaterThanOrEqual(2);
  });
});
