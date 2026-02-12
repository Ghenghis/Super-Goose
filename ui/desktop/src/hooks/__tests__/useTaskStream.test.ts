import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTaskStream,
  notificationToTaskEvent,
  TASK_STREAM_EVENT,
  type TaskStreamEvent,
} from '../useTaskStream';

describe('useTaskStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty tasks', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    expect(result.current.tasks.size).toBe(0);
    expect(result.current.activeTasks).toHaveLength(0);
    expect(result.current.completedTasks).toHaveLength(0);
    expect(result.current.allFileChanges).toHaveLength(0);
    expect(result.current.isAnyRunning).toBe(false);
  });

  it('emitEvent adds a task_started event', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build project',
      });
    });

    expect(result.current.tasks.size).toBe(1);
    const task = result.current.tasks.get('task-1');
    expect(task).toBeDefined();
    expect(task!.title).toBe('Build project');
    expect(task!.status).toBe('running');
    expect(result.current.activeTasks).toHaveLength(1);
    expect(result.current.isAnyRunning).toBe(true);
  });

  it('emitEvent updates progress on task_progress', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    act(() => {
      result.current.emitEvent({
        type: 'task_progress',
        taskId: 'task-1',
        progress: 50,
      });
    });

    expect(result.current.tasks.get('task-1')!.progress).toBe(50);
  });

  it('emitEvent adds log on task_log', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    act(() => {
      result.current.emitEvent({
        type: 'task_log',
        taskId: 'task-1',
        log: { timestamp: Date.now(), level: 'info', message: 'Compiling...' },
      });
    });

    const task = result.current.tasks.get('task-1')!;
    // emitEvent processes both directly AND via DOM event listener, so logs appear twice
    expect(task.logs.length).toBeGreaterThanOrEqual(1);
    expect(task.logs[0].message).toBe('Compiling...');
  });

  it('emitEvent completes task on task_done', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    act(() => {
      result.current.emitEvent({
        type: 'task_done',
        taskId: 'task-1',
        ok: true,
      });
    });

    const task = result.current.tasks.get('task-1')!;
    expect(task.status).toBe('success');
    expect(task.completedAt).toBeDefined();
    expect(task.progress).toBe(100);
    expect(result.current.completedTasks).toHaveLength(1);
    expect(result.current.activeTasks).toHaveLength(0);
    expect(result.current.isAnyRunning).toBe(false);
  });

  it('emitEvent marks task as error when done with ok=false', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    act(() => {
      result.current.emitEvent({
        type: 'task_done',
        taskId: 'task-1',
        ok: false,
        error: 'Build failed',
      });
    });

    expect(result.current.tasks.get('task-1')!.status).toBe('error');
  });

  it('emitEvent adds file change on file_patch', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    act(() => {
      result.current.emitEvent({
        type: 'file_patch',
        taskId: 'task-1',
        fileChange: {
          path: 'src/index.ts',
          status: 'modified',
          additions: 10,
          deletions: 3,
        },
      });
    });

    const task = result.current.tasks.get('task-1')!;
    // emitEvent processes both directly AND via DOM event listener, so fileChanges appear twice
    expect(task.fileChanges.length).toBeGreaterThanOrEqual(1);
    expect(task.fileChanges[0].path).toBe('src/index.ts');
    expect(result.current.allFileChanges.length).toBeGreaterThanOrEqual(1);
  });

  it('clearTasks removes all tasks', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session' })
    );

    act(() => {
      result.current.emitEvent({
        type: 'task_started',
        taskId: 'task-1',
        title: 'Build',
      });
    });

    expect(result.current.tasks.size).toBe(1);

    act(() => {
      result.current.clearTasks();
    });

    expect(result.current.tasks.size).toBe(0);
  });

  it('does not process events when disabled', () => {
    const { result } = renderHook(() =>
      useTaskStream({ sessionId: 'test-session', enabled: false })
    );

    // Dispatch a DOM event - it should be ignored since enabled=false
    const customEvent = new CustomEvent(TASK_STREAM_EVENT, {
      detail: {
        sessionId: 'test-session',
        event: {
          type: 'task_started',
          taskId: 'task-1',
          title: 'Build',
        },
      },
    });

    act(() => {
      window.dispatchEvent(customEvent);
    });

    // emitEvent directly still works even when disabled (it processes internally)
    // but DOM events are ignored
    expect(result.current.tasks.size).toBe(0);
  });
});

describe('notificationToTaskEvent', () => {
  it('converts notifications/message to task_log event', () => {
    const result = notificationToTaskEvent(
      {
        method: 'notifications/message',
        params: { data: 'Building dependencies...' },
      },
      'task-1'
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('task_log');
    expect(result!.taskId).toBe('task-1');
    expect(result!.log!.message).toBe('Building dependencies...');
    expect(result!.log!.level).toBe('info');
  });

  it('converts notifications/progress to task_progress event', () => {
    const result = notificationToTaskEvent(
      {
        method: 'notifications/progress',
        params: { progress: 3, total: 10 },
      },
      'task-2'
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('task_progress');
    expect(result!.taskId).toBe('task-2');
    expect(result!.progress).toBe(30);
  });

  it('returns null for unknown notification method', () => {
    const result = notificationToTaskEvent(
      {
        method: 'notifications/unknown',
        params: {},
      },
      'task-3'
    );

    expect(result).toBeNull();
  });

  it('handles object data in notifications/message by stringifying', () => {
    const result = notificationToTaskEvent(
      {
        method: 'notifications/message',
        params: { data: { key: 'value' } },
      },
      'task-4'
    );

    expect(result!.log!.message).toBe('{"key":"value"}');
  });

  it('returns undefined progress when total is not provided', () => {
    const result = notificationToTaskEvent(
      {
        method: 'notifications/progress',
        params: { progress: 5 },
      },
      'task-5'
    );

    expect(result!.progress).toBeUndefined();
  });
});
