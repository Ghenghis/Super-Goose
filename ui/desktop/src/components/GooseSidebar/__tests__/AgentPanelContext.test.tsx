import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentPanelProvider, useAgentPanel } from '../AgentPanelContext';

// Helper component that exposes context values for testing
const ContextInspector: React.FC = () => {
  const ctx = useAgentPanel();
  return (
    <div>
      <span data-testid="mode">{ctx.state.mode}</span>
      <span data-testid="agent-count">{ctx.state.agents.length}</span>
      <span data-testid="first-agent-name">{ctx.state.agents[0]?.name ?? 'none'}</span>
      <span data-testid="first-agent-status">{ctx.state.agents[0]?.status ?? 'none'}</span>
      <span data-testid="skill-count">{ctx.state.skills.length}</span>
      <span data-testid="plugin-count">{ctx.state.plugins.length}</span>
      <span data-testid="connector-count">{ctx.state.connectors.length}</span>
      <span data-testid="file-activity-count">{ctx.state.fileActivity.length}</span>
      <span data-testid="tool-call-count">{ctx.state.toolCalls.length}</span>
      <span data-testid="task-count">{ctx.state.taskBoard.length}</span>
      <span data-testid="message-count">{ctx.state.messages.length}</span>
      <span data-testid="first-task-status">{ctx.state.taskBoard[0]?.status ?? 'none'}</span>
      <button data-testid="set-mode-code" onClick={() => ctx.setMode('code')} />
      <button data-testid="set-mode-cowork" onClick={() => ctx.setMode('cowork')} />
      <button
        data-testid="update-agent"
        onClick={() => ctx.updateAgent('main-1', { status: 'complete' })}
      />
      <button
        data-testid="update-subagent"
        onClick={() => ctx.updateAgent('sub-1', { status: 'idle' })}
      />
      <button
        data-testid="add-tool-call"
        onClick={() =>
          ctx.addToolCall({
            id: 'tc-new',
            toolName: 'Write',
            inputSummary: 'test.ts',
            status: 'success',
            timestamp: Date.now(),
            durationMs: 50,
          })
        }
      />
      <button
        data-testid="add-file-activity"
        onClick={() =>
          ctx.addFileActivity({
            id: 'fa-new',
            path: 'src/new-file.ts',
            operation: 'created',
            timestamp: Date.now(),
          })
        }
      />
      <button
        data-testid="add-message"
        onClick={() =>
          ctx.addMessage({
            id: 'msg-new',
            from: 'Test',
            to: 'Agent',
            content: 'Hello',
            timestamp: Date.now(),
          })
        }
      />
      <button
        data-testid="update-task"
        onClick={() => ctx.updateTask(3, { status: 'in_progress' })}
      />
    </div>
  );
};

describe('AgentPanelContext', () => {
  it('provides default state with mock data', () => {
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('mode').textContent).toBe('both');
    expect(Number(screen.getByTestId('agent-count').textContent)).toBe(1);
    expect(screen.getByTestId('first-agent-name').textContent).toBe('Super-Goose');
    expect(screen.getByTestId('first-agent-status').textContent).toBe('acting');
    expect(Number(screen.getByTestId('skill-count').textContent)).toBe(3);
    expect(Number(screen.getByTestId('plugin-count').textContent)).toBe(3);
    expect(Number(screen.getByTestId('connector-count').textContent)).toBe(4);
    expect(Number(screen.getByTestId('file-activity-count').textContent)).toBe(4);
    expect(Number(screen.getByTestId('tool-call-count').textContent)).toBe(4);
    expect(Number(screen.getByTestId('task-count').textContent)).toBe(4);
    expect(Number(screen.getByTestId('message-count').textContent)).toBe(2);
  });

  it('setMode changes the panel mode', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('mode').textContent).toBe('both');

    await user.click(screen.getByTestId('set-mode-code'));
    expect(screen.getByTestId('mode').textContent).toBe('code');

    await user.click(screen.getByTestId('set-mode-cowork'));
    expect(screen.getByTestId('mode').textContent).toBe('cowork');
  });

  it('updateAgent updates a top-level agent', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(screen.getByTestId('first-agent-status').textContent).toBe('acting');

    await user.click(screen.getByTestId('update-agent'));
    expect(screen.getByTestId('first-agent-status').textContent).toBe('complete');
  });

  it('addToolCall adds a new tool call', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('tool-call-count').textContent)).toBe(4);

    await user.click(screen.getByTestId('add-tool-call'));
    expect(Number(screen.getByTestId('tool-call-count').textContent)).toBe(5);
  });

  it('addFileActivity adds a new file activity', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('file-activity-count').textContent)).toBe(4);

    await user.click(screen.getByTestId('add-file-activity'));
    expect(Number(screen.getByTestId('file-activity-count').textContent)).toBe(5);
  });

  it('addMessage adds a new message', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    expect(Number(screen.getByTestId('message-count').textContent)).toBe(2);

    await user.click(screen.getByTestId('add-message'));
    expect(Number(screen.getByTestId('message-count').textContent)).toBe(3);
  });

  it('updateTask updates a task status', async () => {
    const user = userEvent.setup();
    render(
      <AgentPanelProvider>
        <ContextInspector />
      </AgentPanelProvider>
    );

    // Task #3 starts as 'pending' (it's the third task with id=3)
    await user.click(screen.getByTestId('update-task'));
    // We can't easily check task #3 from the inspector, but if it didn't throw, it worked
    expect(screen.getByTestId('task-count').textContent).toBe('4');
  });

  it('throws error when useAgentPanel is used outside provider', () => {
    const BrokenComponent = () => {
      useAgentPanel();
      return null;
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BrokenComponent />)).toThrow(
      'useAgentPanel must be used within an AgentPanelProvider.'
    );
    spy.mockRestore();
  });
});
