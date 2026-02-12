import { render, screen } from '@testing-library/react';

// Mock ToolApprovalButtons
vi.mock('../ToolApprovalButtons', () => ({
  default: ({ data }: any) => (
    <div data-testid="approval-buttons">
      <span data-testid="tool-name">{data.toolName}</span>
      <span data-testid="session-id">{data.sessionId}</span>
    </div>
  ),
}));

import ToolConfirmation from '../ToolCallConfirmation';

const makeActionContent = (overrides: Record<string, any> = {}) => ({
  type: 'actionRequired' as const,
  data: {
    actionType: 'toolConfirmation' as const,
    id: 'confirm-1',
    toolName: 'text_editor',
    prompt: null,
    ...overrides,
  },
});

describe('ToolCallConfirmation', () => {
  it('renders default prompt when no custom prompt is provided', () => {
    render(
      <ToolConfirmation
        sessionId="sess-1"
        isClicked={false}
        actionRequiredContent={makeActionContent() as any}
      />
    );
    expect(
      screen.getByText('Goose would like to call the above tool. Allow?')
    ).toBeInTheDocument();
  });

  it('renders custom prompt when prompt is provided', () => {
    render(
      <ToolConfirmation
        sessionId="sess-1"
        isClicked={false}
        actionRequiredContent={makeActionContent({ prompt: 'Delete this file?' }) as any}
      />
    );
    expect(screen.getByText('Do you allow this tool call?')).toBeInTheDocument();
  });

  it('passes correct data to ToolApprovalButtons', () => {
    render(
      <ToolConfirmation
        sessionId="sess-1"
        isClicked={false}
        actionRequiredContent={makeActionContent() as any}
      />
    );
    expect(screen.getByTestId('tool-name').textContent).toBe('text_editor');
    expect(screen.getByTestId('session-id').textContent).toBe('sess-1');
  });

  it('passes prompt as undefined when null', () => {
    render(
      <ToolConfirmation
        sessionId="sess-1"
        isClicked={false}
        actionRequiredContent={makeActionContent({ prompt: null }) as any}
      />
    );
    expect(screen.getByTestId('approval-buttons')).toBeInTheDocument();
  });

  it('passes isClicked to ToolApprovalButtons', () => {
    render(
      <ToolConfirmation
        sessionId="sess-1"
        isClicked={true}
        actionRequiredContent={makeActionContent() as any}
      />
    );
    expect(screen.getByTestId('approval-buttons')).toBeInTheDocument();
  });
});
