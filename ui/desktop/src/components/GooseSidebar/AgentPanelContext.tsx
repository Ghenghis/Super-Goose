import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useAgUi } from '../../ag-ui/useAgUi';
import type { ToolCallState, ActivityItem, AgUiTextMessage, CustomEventItem } from '../../ag-ui/useAgUi';
import { backendApi } from '../../utils/backendApi';
import type { ExtensionInfo, LearningSkill } from '../../utils/backendApi';

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

// ---------------------------------------------------------------------------
// Helpers: derive panel data from AG-UI stream
// ---------------------------------------------------------------------------

function mapToolCalls(calls: Map<string, ToolCallState>): ToolCall[] {
  return Array.from(calls.values())
    .map((tc) => ({
      id: tc.toolCallId,
      toolName: tc.toolCallName,
      inputSummary: tc.args.length > 60 ? tc.args.slice(0, 57) + '...' : tc.args,
      status: (tc.status === 'active' ? 'running' : tc.status) as ToolCallStatus,
      timestamp: tc.timestamp,
      durationMs: tc.status !== 'active' ? Date.now() - tc.timestamp : undefined,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);
}

function extractFileActivity(activities: ActivityItem[]): FileActivity[] {
  const FILE_OPS: Record<string, FileOp> = {
    modified: 'modified', created: 'created', read: 'read', deleted: 'deleted',
    edit: 'modified', write: 'created', create: 'created',
  };

  return activities
    .filter((a) => {
      if (a.metadata && typeof a.metadata.file_path === 'string') return true;
      return /[\w./\\-]+\.(tsx?|jsx?|rs|py|json|css|html|md|toml|yaml|yml)\b/.test(a.message);
    })
    .map((a, i) => {
      const meta = a.metadata || {};
      const filePath = (meta.file_path as string) || extractPathFromMessage(a.message);
      const op = FILE_OPS[(meta.operation as string) || ''] || inferOpFromMessage(a.message);
      return { id: a.id || `fa-${i}`, path: filePath, operation: op, timestamp: a.timestamp };
    })
    .slice(0, 50);
}

function extractPathFromMessage(msg: string): string {
  const match = msg.match(/[\w./\\-]+\.(tsx?|jsx?|rs|py|json|css|html|md|toml|yaml|yml)/);
  return match ? match[0] : 'unknown';
}

function inferOpFromMessage(msg: string): FileOp {
  const lower = msg.toLowerCase();
  if (lower.includes('creat') || lower.includes('wrote')) return 'created';
  if (lower.includes('delet') || lower.includes('remov')) return 'deleted';
  if (lower.includes('edit') || lower.includes('modif') || lower.includes('updat')) return 'modified';
  return 'read';
}

function mapMessages(msgs: AgUiTextMessage[]): InboxMessage[] {
  return msgs
    .filter((m) => !m.streaming)
    .map((m) => ({
      id: m.messageId,
      from: m.role === 'agent' ? 'Super-Goose' : m.role === 'user' ? 'You' : 'System',
      to: m.role === 'agent' ? 'You' : 'Super-Goose',
      content: m.content.length > 200 ? m.content.slice(0, 197) + '...' : m.content,
      timestamp: m.timestamp,
    }))
    .slice(-50);
}

function buildAgentStatus(
  agentState: Record<string, unknown>,
  isRunning: boolean,
  currentStep: string | null,
  connected: boolean,
): AgentStatus[] {
  const coreType = (agentState.core_type as string) || 'default';
  const model = (agentState.model as string) || 'unknown';
  const contextPct = typeof agentState.context_usage === 'number' ? agentState.context_usage : 0;

  let status: AgentState = 'idle';
  if (!connected) status = 'idle';
  else if (isRunning) status = 'acting';
  else status = 'complete';

  return [{
    id: 'main-1',
    name: `Super-Goose (${coreType})`,
    type: 'main' as AgentType,
    status,
    contextUsage: contextPct,
    model,
    currentAction: currentStep || undefined,
  }];
}

// ---------------------------------------------------------------------------
// Helpers: derive tasks from AG-UI activity + custom events
// ---------------------------------------------------------------------------

/** Maps backend task status strings to TaskStatus values. */
const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  created: 'pending',
  pending: 'pending',
  in_progress: 'in_progress',
  running: 'in_progress',
  completed: 'completed',
  done: 'completed',
  failed: 'blocked',
  blocked: 'blocked',
  error: 'blocked',
};

/**
 * Extracts TaskItem[] from a combination of AG-UI activities and custom events.
 * De-duplicates by task_id, keeping the most recent update by timestamp.
 */
export function extractTasksFromStream(
  activities: ActivityItem[],
  customEvents: CustomEventItem[],
): TaskItem[] {
  // Collect raw task entries from both sources
  const rawTasks: Array<{
    taskId: number;
    title: string;
    status: TaskStatus;
    owner?: string;
    blockedBy?: number[];
    timestamp: number;
  }> = [];

  // Source 1: activities with metadata.activity_type === 'task_update'
  for (const a of activities) {
    if (a.metadata?.activity_type === 'task_update') {
      const meta = a.metadata;
      const taskId = typeof meta.task_id === 'number' ? meta.task_id : parseInt(String(meta.task_id), 10);
      if (isNaN(taskId)) continue;

      const rawStatus = String(meta.status || 'pending').toLowerCase();
      const status = TASK_STATUS_MAP[rawStatus] || 'pending';
      const title = (meta.title as string) || a.message || `Task #${taskId}`;
      const owner = meta.owner as string | undefined;
      const blockedBy = Array.isArray(meta.blocked_by) ? meta.blocked_by.map(Number).filter((n) => !isNaN(n)) : undefined;

      rawTasks.push({ taskId, title, status, owner, blockedBy, timestamp: a.timestamp });
    }
  }

  // Source 2: customEvents with name === 'task_update'
  for (const ce of customEvents) {
    if (ce.name === 'task_update' && ce.value && typeof ce.value === 'object') {
      const v = ce.value as Record<string, unknown>;
      const taskId = typeof v.task_id === 'number' ? v.task_id : parseInt(String(v.task_id), 10);
      if (isNaN(taskId)) continue;

      const rawStatus = String(v.status || 'pending').toLowerCase();
      const status = TASK_STATUS_MAP[rawStatus] || 'pending';
      const title = (v.title as string) || `Task #${taskId}`;
      const owner = v.owner as string | undefined;
      const blockedBy = Array.isArray(v.blocked_by) ? v.blocked_by.map(Number).filter((n) => !isNaN(n)) : undefined;

      rawTasks.push({ taskId, title, status, owner, blockedBy, timestamp: ce.timestamp });
    }
  }

  // De-duplicate: keep most recent by timestamp per taskId
  const taskMap = new Map<number, typeof rawTasks[number]>();
  for (const entry of rawTasks) {
    const existing = taskMap.get(entry.taskId);
    if (!existing || entry.timestamp > existing.timestamp) {
      taskMap.set(entry.taskId, entry);
    }
  }

  // Convert to TaskItem[]
  return Array.from(taskMap.values())
    .sort((a, b) => a.taskId - b.taskId)
    .map((t) => ({
      id: t.taskId,
      title: t.title,
      status: t.status,
      owner: t.owner,
      blockedBy: t.blockedBy,
    }));
}

// ---------------------------------------------------------------------------
// Helpers: map backend API responses to panel types
// ---------------------------------------------------------------------------

function mapExtensionToPlugin(ext: ExtensionInfo): PluginStatus {
  return {
    id: ext.key || ext.name,
    name: ext.name,
    commands: [ext.type || 'tool'],
    active: ext.enabled,
  };
}

function mapLearningSkillToSkill(skill: LearningSkill): SkillStatus {
  return {
    id: skill.id || skill.name,
    name: skill.name,
    command: skill.name,
    enabled: skill.verified ?? true,
  };
}

// ---------------------------------------------------------------------------
// Helpers: connectors — map extensions + well-known fallbacks
// ---------------------------------------------------------------------------

/** Well-known connectors shown as 'available' fallbacks when no matching extension exists. */
export const WELL_KNOWN_CONNECTORS: ConnectorStatus[] = [
  { id: 'wk-github',     name: 'GitHub',     state: 'available', description: 'Repository hosting' },
  { id: 'wk-docker-hub', name: 'Docker Hub', state: 'available', description: 'Container registry' },
  { id: 'wk-ollama',     name: 'Ollama',     state: 'available', description: 'Local model runtime' },
  { id: 'wk-claude-api', name: 'Claude API', state: 'available', description: 'Anthropic API' },
  { id: 'wk-openai',     name: 'OpenAI',     state: 'available', description: 'OpenAI API' },
];

function mapExtensionToConnector(ext: ExtensionInfo): ConnectorStatus {
  return {
    id: `ext-${ext.key || ext.name}`,
    name: ext.name,
    state: ext.enabled ? 'connected' : 'available',
    description: ext.type || undefined,
  };
}

/**
 * Merge extension-derived connectors with well-known static fallbacks.
 * Extension entries override static entries when names match (case-insensitive).
 */
export function buildConnectors(extensions: ExtensionInfo[]): ConnectorStatus[] {
  const extConnectors = extensions.map(mapExtensionToConnector);

  // Build a set of lowercase names from the extension-derived connectors
  const extNames = new Set(extConnectors.map((c) => c.name.toLowerCase()));

  // Keep only well-known entries whose name does NOT appear in extensions
  const fallbacks = WELL_KNOWN_CONNECTORS.filter(
    (wk) => !extNames.has(wk.name.toLowerCase())
  );

  // Extension-derived first, then remaining fallbacks
  return [...extConnectors, ...fallbacks];
}

// --- Context ---

interface AgentPanelContextValue {
  state: AgentPanelState;
  connected: boolean;
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
  const {
    connected,
    isRunning,
    currentStep,
    agentState,
    activeToolCalls,
    activities,
    customEvents,
    messages: agUiMessages,
  } = useAgUi();

  const [mode, setMode] = useState<PanelMode>('both');

  // Manual task overrides (from updateTask / external callers)
  const [manualTaskOverrides, setManualTaskOverrides] = useState<Map<number, Partial<TaskItem>>>(new Map());

  // Derive panel data from AG-UI stream
  const agents = useMemo(
    () => buildAgentStatus(agentState, isRunning, currentStep, connected),
    [agentState, isRunning, currentStep, connected]
  );

  const toolCalls = useMemo(() => mapToolCalls(activeToolCalls), [activeToolCalls]);
  const fileActivity = useMemo(() => extractFileActivity(activities), [activities]);
  const messages = useMemo(() => mapMessages(agUiMessages), [agUiMessages]);

  // Derive tasks from AG-UI activities + custom events, merging with manual overrides
  const taskBoard = useMemo(() => {
    const derived = extractTasksFromStream(activities, customEvents);

    // Merge manual overrides on top of derived tasks
    if (manualTaskOverrides.size === 0) return derived;

    return derived.map((task) => {
      const override = manualTaskOverrides.get(task.id);
      return override ? { ...task, ...override } : task;
    });
  }, [activities, customEvents, manualTaskOverrides]);

  // --- Fetch extensions (plugins + connectors) from backend API ---
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [rawExtensions, setRawExtensions] = useState<ExtensionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchExtensions = async () => {
      try {
        const exts = await backendApi.getExtensions();
        if (!cancelled && exts) {
          setPlugins(exts.map(mapExtensionToPlugin));
          setRawExtensions(exts);
        }
      } catch {
        // On error, keep existing data — don't clear to empty
      }
    };

    fetchExtensions();
    const interval = setInterval(fetchExtensions, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // --- Fetch learning skills from backend API ---
  const [skills, setSkills] = useState<SkillStatus[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchSkills = async () => {
      try {
        const result = await backendApi.getLearningSkills();
        if (!cancelled && result) {
          setSkills(result.map(mapLearningSkillToSkill));
        }
      } catch {
        // On error, keep existing data — don't clear to empty
      }
    };

    fetchSkills();
    const interval = setInterval(fetchSkills, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // --- Connectors: derived from extensions + well-known fallbacks ---
  const connectors = useMemo<ConnectorStatus[]>(
    () => buildConnectors(rawExtensions),
    [rawExtensions]
  );

  // Legacy mutation methods — no-ops now that data comes from AG-UI stream
  const updateAgent = useCallback((_id: string, _updates: Partial<AgentStatus>) => {}, []);
  const addToolCall = useCallback((_call: ToolCall) => {}, []);
  const addFileActivity = useCallback((_activity: FileActivity) => {}, []);
  const addMessage = useCallback((_message: InboxMessage) => {}, []);

  const updateTask = useCallback((id: number, updates: Partial<TaskItem>) => {
    setManualTaskOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) || {};
      next.set(id, { ...existing, ...updates });
      return next;
    });
  }, []);

  const state: AgentPanelState = useMemo(
    () => ({ mode, agents, skills, plugins, connectors, fileActivity, toolCalls, taskBoard, messages }),
    [mode, agents, skills, plugins, connectors, fileActivity, toolCalls, taskBoard, messages]
  );

  const value: AgentPanelContextValue = useMemo(
    () => ({ state, connected, setMode, updateAgent, addToolCall, addFileActivity, addMessage, updateTask }),
    [state, connected, setMode, updateAgent, addToolCall, addFileActivity, addMessage, updateTask]
  );

  return (
    <AgentPanelContext.Provider value={value}>
      {children}
    </AgentPanelContext.Provider>
  );
};

export default AgentPanelProvider;
