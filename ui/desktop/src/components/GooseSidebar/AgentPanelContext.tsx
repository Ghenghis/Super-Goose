import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// --- Type Definitions ---

export type AgentState = 'idle' | 'gathering' | 'acting' | 'verifying' | 'complete' | 'error';
export type AgentType = 'main' | 'subagent' | 'teammate';

export interface AgentStatus {
  id: string;
  name: string;
  type: AgentType;
  status: AgentState;
  contextUsage: number; // 0-100
  model: string;
  currentAction?: string;
  children?: AgentStatus[];
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface TaskItem {
  id: number;
  title: string;
  status: TaskStatus;
  owner?: string;
  blockedBy?: number[];
}

export interface SkillStatus {
  id: string;
  name: string;
  command: string;
  enabled: boolean;
}

export interface PluginStatus {
  id: string;
  name: string;
  commands: string[];
  active: boolean;
}

export interface ConnectorStatus {
  id: string;
  name: string;
  state: 'connected' | 'available' | 'error';
  description?: string;
}

export type FileOp = 'modified' | 'created' | 'read' | 'deleted';

export interface FileActivity {
  id: string;
  path: string;
  operation: FileOp;
  timestamp: number;
}

export type ToolCallStatus = 'running' | 'success' | 'error';

export interface ToolCall {
  id: string;
  toolName: string;
  inputSummary: string;
  status: ToolCallStatus;
  timestamp: number;
  durationMs?: number;
}

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export type PanelMode = 'code' | 'cowork' | 'both';

export interface AgentPanelState {
  mode: PanelMode;
  agents: AgentStatus[];
  skills: SkillStatus[];
  plugins: PluginStatus[];
  connectors: ConnectorStatus[];
  fileActivity: FileActivity[];
  toolCalls: ToolCall[];
  taskBoard: TaskItem[];
  messages: InboxMessage[];
}

// --- Mock Data ---

const MOCK_AGENTS: AgentStatus[] = [
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
      {
        id: 'sub-2',
        name: 'Test Runner',
        type: 'subagent',
        status: 'idle',
        contextUsage: 5,
        model: 'claude-sonnet-4-20250514',
      },
    ],
  },
];

const MOCK_TASKS: TaskItem[] = [
  { id: 1, title: 'Create AgentPanelContext', status: 'completed', owner: 'Super-Goose' },
  { id: 2, title: 'Build AgentStatusPanel', status: 'in_progress', owner: 'Code Analyst' },
  { id: 3, title: 'Implement TaskBoard UI', status: 'pending' },
  { id: 4, title: 'Wire up connector status', status: 'blocked', blockedBy: [2] },
];

const MOCK_SKILLS: SkillStatus[] = [
  { id: 'sk-1', name: 'commit', command: '/commit', enabled: true },
  { id: 'sk-2', name: 'review-pr', command: '/review-pr', enabled: true },
  { id: 'sk-3', name: 'pdf', command: '/pdf', enabled: false },
];

const MOCK_PLUGINS: PluginStatus[] = [
  { id: 'pl-1', name: 'Developer', commands: ['shell', 'edit', 'read'], active: true },
  { id: 'pl-2', name: 'Memory', commands: ['remember', 'recall'], active: true },
  { id: 'pl-3', name: 'Browser', commands: ['navigate', 'screenshot'], active: false },
];

const MOCK_CONNECTORS: ConnectorStatus[] = [
  { id: 'cn-1', name: 'GitHub', state: 'connected', description: 'Repository access' },
  { id: 'cn-2', name: 'Jira', state: 'available', description: 'Issue tracking' },
  { id: 'cn-3', name: 'Slack', state: 'error', description: 'Team messaging' },
  { id: 'cn-4', name: 'PostgreSQL', state: 'connected', description: 'Database access' },
];

const MOCK_FILE_ACTIVITY: FileActivity[] = [
  { id: 'fa-1', path: 'src/components/GooseSidebar/AppSidebar.tsx', operation: 'modified', timestamp: Date.now() - 5000 },
  { id: 'fa-2', path: 'src/components/GooseSidebar/AgentPanelContext.tsx', operation: 'created', timestamp: Date.now() - 12000 },
  { id: 'fa-3', path: 'src/components/ui/sidebar.tsx', operation: 'read', timestamp: Date.now() - 30000 },
  { id: 'fa-4', path: 'src/old-unused-file.ts', operation: 'deleted', timestamp: Date.now() - 60000 },
];

const MOCK_TOOL_CALLS: ToolCall[] = [
  { id: 'tc-1', toolName: 'Read', inputSummary: 'AppSidebar.tsx', status: 'success', timestamp: Date.now() - 8000, durationMs: 120 },
  { id: 'tc-2', toolName: 'Edit', inputSummary: 'AgentPanelContext.tsx:42', status: 'running', timestamp: Date.now() - 2000 },
  { id: 'tc-3', toolName: 'Bash', inputSummary: 'npm run build', status: 'error', timestamp: Date.now() - 15000, durationMs: 4500 },
  { id: 'tc-4', toolName: 'Grep', inputSummary: '"lucide-react" in src/', status: 'success', timestamp: Date.now() - 20000, durationMs: 340 },
];

const MOCK_MESSAGES: InboxMessage[] = [
  { id: 'msg-1', from: 'Super-Goose', to: 'Code Analyst', content: 'Analyze the sidebar patterns and report back.', timestamp: Date.now() - 30000 },
  { id: 'msg-2', from: 'Code Analyst', to: 'Super-Goose', content: 'Found 3 sidebar components using Collapsible + SidebarGroup patterns.', timestamp: Date.now() - 15000 },
];

// --- Context ---

interface AgentPanelContextValue {
  state: AgentPanelState;
  setMode: (mode: PanelMode) => void;
  updateAgent: (id: string, updates: Partial<AgentStatus>) => void;
  addToolCall: (call: ToolCall) => void;
  addFileActivity: (activity: FileActivity) => void;
  addMessage: (message: InboxMessage) => void;
  updateTask: (id: number, updates: Partial<TaskItem>) => void;
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null);

export function useAgentPanel(): AgentPanelContextValue {
  const ctx = useContext(AgentPanelContext);
  if (!ctx) {
    throw new Error('useAgentPanel must be used within an AgentPanelProvider.');
  }
  return ctx;
}

// --- Provider ---

export const AgentPanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<PanelMode>('both');
  const [agents, setAgents] = useState<AgentStatus[]>(MOCK_AGENTS);
  const [skills] = useState<SkillStatus[]>(MOCK_SKILLS);
  const [plugins] = useState<PluginStatus[]>(MOCK_PLUGINS);
  const [connectors] = useState<ConnectorStatus[]>(MOCK_CONNECTORS);
  const [fileActivity, setFileActivity] = useState<FileActivity[]>(MOCK_FILE_ACTIVITY);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>(MOCK_TOOL_CALLS);
  const [taskBoard, setTaskBoard] = useState<TaskItem[]>(MOCK_TASKS);
  const [messages, setMessages] = useState<InboxMessage[]>(MOCK_MESSAGES);

  const updateAgent = useCallback((id: string, updates: Partial<AgentStatus>) => {
    setAgents((prev) => {
      const updateRecursive = (agents: AgentStatus[]): AgentStatus[] =>
        agents.map((a) => {
          if (a.id === id) return { ...a, ...updates };
          if (a.children) return { ...a, children: updateRecursive(a.children) };
          return a;
        });
      return updateRecursive(prev);
    });
  }, []);

  const addToolCall = useCallback((call: ToolCall) => {
    setToolCalls((prev) => [call, ...prev].slice(0, 50));
  }, []);

  const addFileActivity = useCallback((activity: FileActivity) => {
    setFileActivity((prev) => [activity, ...prev].slice(0, 50));
  }, []);

  const addMessage = useCallback((message: InboxMessage) => {
    setMessages((prev) => [message, ...prev].slice(0, 50));
  }, []);

  const updateTask = useCallback((id: number, updates: Partial<TaskItem>) => {
    setTaskBoard((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const state: AgentPanelState = useMemo(
    () => ({ mode, agents, skills, plugins, connectors, fileActivity, toolCalls, taskBoard, messages }),
    [mode, agents, skills, plugins, connectors, fileActivity, toolCalls, taskBoard, messages]
  );

  const value: AgentPanelContextValue = useMemo(
    () => ({ state, setMode, updateAgent, addToolCall, addFileActivity, addMessage, updateTask }),
    [state, setMode, updateAgent, addToolCall, addFileActivity, addMessage, updateTask]
  );

  return (
    <AgentPanelContext.Provider value={value}>
      {children}
    </AgentPanelContext.Provider>
  );
};

export default AgentPanelProvider;
