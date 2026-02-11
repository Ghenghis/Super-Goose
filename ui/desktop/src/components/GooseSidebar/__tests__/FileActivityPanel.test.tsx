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

import FileActivityPanel from '../FileActivityPanel';

describe('FileActivityPanel', () => {
  beforeEach(() => {
    mockState = {
      mode: 'both',
      agents: [],
      skills: [],
      plugins: [],
      connectors: [],
      fileActivity: [
        { id: 'fa-1', path: 'src/components/GooseSidebar/AppSidebar.tsx', operation: 'modified', timestamp: Date.now() - 5000 },
        { id: 'fa-2', path: 'src/components/GooseSidebar/AgentPanelContext.tsx', operation: 'created', timestamp: Date.now() - 12000 },
        { id: 'fa-3', path: 'src/components/ui/sidebar.tsx', operation: 'read', timestamp: Date.now() - 30000 },
        { id: 'fa-4', path: 'src/old-unused-file.ts', operation: 'deleted', timestamp: Date.now() - 60000 },
      ],
      toolCalls: [],
      taskBoard: [],
      messages: [],
    };
  });

  it('renders the Files heading', () => {
    render(<FileActivityPanel />);
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('displays the file activity count', () => {
    render(<FileActivityPanel />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders file names extracted from paths', () => {
    render(<FileActivityPanel />);
    expect(screen.getByText('AppSidebar.tsx')).toBeInTheDocument();
    expect(screen.getByText('AgentPanelContext.tsx')).toBeInTheDocument();
    expect(screen.getByText('sidebar.tsx')).toBeInTheDocument();
    expect(screen.getByText('old-unused-file.ts')).toBeInTheDocument();
  });

  it('renders parent directory paths', () => {
    render(<FileActivityPanel />);
    // Two files share the GooseSidebar parent directory
    const gooseSidebarDirs = screen.getAllByText('src/components/GooseSidebar');
    expect(gooseSidebarDirs.length).toBe(2);
    expect(screen.getByText('src/components/ui')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
  });

  it('renders aria-labels for operations', () => {
    render(<FileActivityPanel />);
    expect(screen.getByLabelText('Modified')).toBeInTheDocument();
    expect(screen.getByLabelText('Created')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
    expect(screen.getByLabelText('Deleted')).toBeInTheDocument();
  });

  it('shows "No file activity" when list is empty', () => {
    mockState.fileActivity = [];
    render(<FileActivityPanel />);
    expect(screen.getByText('No file activity')).toBeInTheDocument();
  });

  it('displays count 0 when empty', () => {
    mockState.fileActivity = [];
    render(<FileActivityPanel />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
