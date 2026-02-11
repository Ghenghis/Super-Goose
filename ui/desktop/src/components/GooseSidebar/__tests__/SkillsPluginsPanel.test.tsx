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

import SkillsPluginsPanel from '../SkillsPluginsPanel';

describe('SkillsPluginsPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [
        { id: 'sk-1', name: 'commit', command: '/commit', enabled: true },
        { id: 'sk-2', name: 'review-pr', command: '/review-pr', enabled: true },
        { id: 'sk-3', name: 'pdf', command: '/pdf', enabled: false },
      ],
      plugins: [
        { id: 'pl-1', name: 'Developer', commands: ['shell', 'edit', 'read'], active: true },
        { id: 'pl-2', name: 'Memory', commands: ['remember', 'recall'], active: true },
        { id: 'pl-3', name: 'Browser', commands: ['navigate', 'screenshot'], active: false },
      ],
      connectors: [],
      fileActivity: [],
      toolCalls: [],
      taskBoard: [],
      messages: [],
    };
  });

  it('renders the Skills & Plugins heading', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('Skills & Plugins')).toBeInTheDocument();
  });

  it('displays combined count of enabled skills + active plugins', () => {
    render(<SkillsPluginsPanel />);
    // 2 enabled skills + 2 active plugins = 4
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders the Skills section heading', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('renders the Plugins section heading', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('renders skill commands', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('/commit')).toBeInTheDocument();
    expect(screen.getByText('/review-pr')).toBeInTheDocument();
    expect(screen.getByText('/pdf')).toBeInTheDocument();
  });

  it('renders plugin names', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('renders plugin command lists', () => {
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('shell, edit, read')).toBeInTheDocument();
    expect(screen.getByText('remember, recall')).toBeInTheDocument();
    expect(screen.getByText('navigate, screenshot')).toBeInTheDocument();
  });

  it('shows empty state when no skills or plugins', () => {
    mockState.skills = [];
    mockState.plugins = [];
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('No skills or plugins loaded')).toBeInTheDocument();
  });

  it('displays count 0 when no active skills or plugins', () => {
    mockState.skills = [];
    mockState.plugins = [];
    render(<SkillsPluginsPanel />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
