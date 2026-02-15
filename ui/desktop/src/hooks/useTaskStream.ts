/**
 * useTaskStream - Real-time task/agent event streaming hook
 *
 * Manages SSE/WebSocket events for agent swarm activities,
 * providing live updates to TaskCard components in chat.
 *
 * Event types:
 * - task_started: Agent begins work
 * - task_progress: Progress update with optional percentage
 * - task_log: Log line from agent
 * - task_done: Agent completed (success/error)
 * - file_patch: File was modified (triggers DiffCard)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface TaskLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  diff?: string;
  language?: string;
}

export interface TaskState {
  id: string;
  title: string;
  status: TaskStatus;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  logs: TaskLog[];
  fileChanges: FileChange[];
  subtasks: TaskState[];
}

export interface TaskStreamEvent {
  type:
    | 'task_started'
    | 'task_progress'
    | 'task_log'
    | 'task_done'
    | 'file_patch'
    | 'subtask_started'
    | 'subtask_done';
  taskId: string;
  parentId?: string;
  title?: string;
  status?: TaskStatus;
  progress?: number;
  log?: TaskLog;
  fileChange?: FileChange;
  ok?: boolean;
  error?: string;
}

// Custom event name for broadcasting task events through the app
export const TASK_STREAM_EVENT = 'goose:task-stream';

interface UseTaskStreamOptions {
  sessionId: string;
  enabled?: boolean;
}

interface UseTaskStreamReturn {
  tasks: Map<string, TaskState>;
  activeTasks: TaskState[];
  completedTasks: TaskState[];
  allFileChanges: FileChange[];
  isAnyRunning: boolean;
  clearTasks: () => void;
  emitEvent: (event: TaskStreamEvent) => void;
}

/**
 * Hook that manages real-time task state from agent activities.
 * Listens for task events dispatched via custom DOM events and
 * also from the existing notification system in useChatStream.
 */
export function useTaskStream({
  sessionId,
  enabled = true,
}: UseTaskStreamOptions): UseTaskStreamReturn {
  const [tasks, setTasks] = useState<Map<string, TaskState>>(new Map());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Process a single task event
  const processEvent = useCallback((event: TaskStreamEvent) => {
    setTasks((prev) => {
      const next = new Map(prev);

      switch (event.type) {
        case 'task_started': {
          const task: TaskState = {
            id: event.taskId,
            title: event.title || event.taskId,
            status: 'running',
            startedAt: Date.now(),
            logs: [],
            fileChanges: [],
            subtasks: [],
          };
          next.set(event.taskId, task);
          break;
        }

        case 'task_progress': {
          const task = next.get(event.taskId);
          if (task) {
            next.set(event.taskId, {
              ...task,
              progress: event.progress,
            });
          }
          break;
        }

        case 'task_log': {
          const task = next.get(event.taskId);
          if (task && event.log) {
            next.set(event.taskId, {
              ...task,
              logs: [...task.logs, event.log],
            });
          }
          break;
        }

        case 'task_done': {
          const task = next.get(event.taskId);
          if (task) {
            next.set(event.taskId, {
              ...task,
              status: event.ok ? 'success' : 'error',
              completedAt: Date.now(),
              progress: event.ok ? 100 : task.progress,
            });
          }
          break;
        }

        case 'file_patch': {
          const task = next.get(event.taskId);
          if (task && event.fileChange) {
            next.set(event.taskId, {
              ...task,
              fileChanges: [...task.fileChanges, event.fileChange],
            });
          }
          break;
        }

        case 'subtask_started': {
          const parent = event.parentId ? next.get(event.parentId) : undefined;
          if (parent) {
            const subtask: TaskState = {
              id: event.taskId,
              title: event.title || event.taskId,
              status: 'running',
              startedAt: Date.now(),
              logs: [],
              fileChanges: [],
              subtasks: [],
            };
            next.set(event.parentId!, {
              ...parent,
              subtasks: [...parent.subtasks, subtask],
            });
          }
          break;
        }

        case 'subtask_done': {
          const parent = event.parentId ? next.get(event.parentId) : undefined;
          if (parent) {
            next.set(event.parentId!, {
              ...parent,
              subtasks: parent.subtasks.map((st) =>
                st.id === event.taskId
                  ? {
                      ...st,
                      status: event.ok ? 'success' : ('error' as TaskStatus),
                      completedAt: Date.now(),
                    }
                  : st
              ),
            });
          }
          break;
        }
      }

      return next;
    });
  }, []);

  // Public emit function for programmatic event dispatch
  const emitEvent = useCallback(
    (event: TaskStreamEvent) => {
      processEvent(event);
      // Also broadcast to other listeners
      window.dispatchEvent(
        new CustomEvent(TASK_STREAM_EVENT, { detail: { sessionId, event } })
      );
    },
    [processEvent, sessionId]
  );

  // Listen for DOM-level task events
  useEffect(() => {
    if (!enabled) return;

    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        sessionId: string;
        event: TaskStreamEvent;
      }>;
      if (customEvent.detail.sessionId === sessionId) {
        processEvent(customEvent.detail.event);
      }
    };

    window.addEventListener(TASK_STREAM_EVENT, handleEvent);
    return () => window.removeEventListener(TASK_STREAM_EVENT, handleEvent);
  }, [enabled, sessionId, processEvent]);

  // Derived state (memoized to avoid re-computing on every render)
  const activeTasks = useMemo(
    () => Array.from(tasks.values()).filter(
      (t) => t.status === 'running' || t.status === 'pending'
    ),
    [tasks]
  );

  const completedTasks = useMemo(
    () => Array.from(tasks.values()).filter(
      (t) => t.status === 'success' || t.status === 'error' || t.status === 'cancelled'
    ),
    [tasks]
  );

  const allFileChanges = useMemo(
    () => Array.from(tasks.values()).flatMap((t) => t.fileChanges),
    [tasks]
  );

  const isAnyRunning = activeTasks.length > 0;

  const clearTasks = useCallback(() => {
    setTasks(new Map());
  }, []);

  return {
    tasks,
    activeTasks,
    completedTasks,
    allFileChanges,
    isAnyRunning,
    clearTasks,
    emitEvent,
  };
}

/**
 * Helper to convert notification log messages from useChatStream
 * into TaskStreamEvents that this hook can consume.
 */
export function notificationToTaskEvent(
  notification: { method: string; params: Record<string, unknown> },
  taskId: string
): TaskStreamEvent | null {
  if (notification.method === 'notifications/message') {
    const data = notification.params.data;
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    return {
      type: 'task_log',
      taskId,
      log: {
        timestamp: Date.now(),
        level: 'info',
        message,
      },
    };
  }

  if (notification.method === 'notifications/progress') {
    const params = notification.params as {
      progress: number;
      total?: number;
    };
    const progress = params.total
      ? Math.round((params.progress / params.total) * 100)
      : undefined;
    return {
      type: 'task_progress',
      taskId,
      progress,
    };
  }

  return null;
}
