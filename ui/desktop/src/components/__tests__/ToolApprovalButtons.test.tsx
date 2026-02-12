import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the api module
vi.mock('../../api', () => ({
  confirmToolAction: vi.fn(() => Promise.resolve({ error: null })),
}));

import ToolApprovalButtons, { ToolApprovalData } from '../ToolApprovalButtons';
import { confirmToolAction } from '../../api';

const mockConfirmToolAction = vi.mocked(confirmToolAction);

// Use unique IDs per test to avoid globalApprovalState leaking between tests
let testCounter = 0;
const makeData = (overrides: Partial<ToolApprovalData> = {}): ToolApprovalData => ({
  id: `tool-${++testCounter}`,
  toolName: 'shell',
  sessionId: 'session-abc',
  ...overrides,
});

describe('ToolApprovalButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Allow Once, Always Allow, and Deny buttons', () => {
    render(<ToolApprovalButtons data={makeData()} />);
    expect(screen.getByText('Allow Once')).toBeInTheDocument();
    expect(screen.getByText('Always Allow')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('hides Always Allow when prompt is set', () => {
    render(<ToolApprovalButtons data={makeData({ prompt: 'Are you sure?' })} />);
    expect(screen.getByText('Allow Once')).toBeInTheDocument();
    expect(screen.queryByText('Always Allow')).not.toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('calls confirmToolAction with allow_once when Allow Once is clicked', async () => {
    const data = makeData();
    render(<ToolApprovalButtons data={data} />);
    fireEvent.click(screen.getByText('Allow Once'));

    await waitFor(() => {
      expect(mockConfirmToolAction).toHaveBeenCalledWith({
        body: {
          sessionId: 'session-abc',
          id: data.id,
          action: 'allow_once',
          principalType: 'Tool',
        },
      });
    });
  });

  it('shows status message after decision is made', async () => {
    render(<ToolApprovalButtons data={makeData()} />);
    fireEvent.click(screen.getByText('Allow Once'));

    await waitFor(() => {
      expect(screen.getByText('shell - Allowed once')).toBeInTheDocument();
    });
    // Buttons should no longer be visible
    expect(screen.queryByText('Allow Once')).not.toBeInTheDocument();
  });

  it('shows "Always allowed" message when Always Allow is clicked', async () => {
    render(<ToolApprovalButtons data={makeData()} />);
    fireEvent.click(screen.getByText('Always Allow'));

    await waitFor(() => {
      expect(screen.getByText('shell - Always allowed')).toBeInTheDocument();
    });
  });

  it('shows "Denied once" message when Deny is clicked', async () => {
    render(<ToolApprovalButtons data={makeData()} />);
    fireEvent.click(screen.getByText('Deny'));

    await waitFor(() => {
      expect(screen.getByText('shell - Denied once')).toBeInTheDocument();
    });
  });

  it('renders status message when isClicked is initially true with existing global state', () => {
    // Use a specific ID and render+click to populate globalApprovalState
    const sharedId = `tool-shared-${++testCounter}`;
    const data1 = makeData({ id: sharedId });
    const { unmount } = render(<ToolApprovalButtons data={data1} />);
    fireEvent.click(screen.getByText('Allow Once'));
    unmount();

    // Re-render with same id should show status from global state
    render(<ToolApprovalButtons data={makeData({ id: sharedId, isClicked: true })} />);
    expect(screen.getByText('shell - Allowed once')).toBeInTheDocument();
  });
});
