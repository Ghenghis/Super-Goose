import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, disabled, type, form, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} type={type} form={form} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../ui/input', () => ({
  Input: ({ value, onChange, placeholder, type, id, className, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      id={id}
      className={className}
      {...props}
    />
  ),
}));

vi.mock('../CronPicker', () => ({
  CronPicker: ({ schedule, onChange, isValid }: any) => {
    // Immediately signal valid
    if (isValid) isValid(true);
    return (
      <div data-testid="cron-picker">
        <input
          data-testid="cron-input"
          defaultValue="0 0 14 * * *"
          onChange={(e: any) => onChange(e.target.value)}
        />
      </div>
    );
  },
}));

vi.mock('../../../recipe', () => ({
  parseDeeplink: vi.fn(() =>
    Promise.resolve({
      title: 'Test Recipe',
      description: 'A test recipe',
      instructions: 'Do the thing',
    })
  ),
  parseRecipeFromFile: vi.fn(),
}));

vi.mock('../../../recipe/recipe_management', () => ({
  getStorageDirectory: vi.fn(() => '/test/recipes'),
}));

vi.mock('../../../assets/clock-icon.svg', () => ({
  default: 'clock-icon.svg',
}));

import { ScheduleModal } from '../ScheduleModal';

describe('ScheduleModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(() => Promise.resolve()),
    schedule: null,
    isLoadingExternally: false,
    apiErrorExternally: null,
    initialDeepLink: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (window.electron as any).selectFileOrDirectory = vi.fn();
    (window.electron as any).readFile = vi.fn();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ScheduleModal {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders "Create New Schedule" title in create mode', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(screen.getByText('Create New Schedule')).toBeInTheDocument();
  });

  it('renders "Edit Schedule" title in edit mode', () => {
    render(
      <ScheduleModal
        {...defaultProps}
        schedule={{ id: 'test-job', cron: '0 0 14 * * *' } as any}
      />
    );

    expect(screen.getByText('Edit Schedule')).toBeInTheDocument();
  });

  it('shows the Name input in create mode', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(screen.getByLabelText('Name:')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('e.g., daily-summary-job')
    ).toBeInTheDocument();
  });

  it('does not show Name input in edit mode', () => {
    render(
      <ScheduleModal
        {...defaultProps}
        schedule={{ id: 'test-job', cron: '0 0 14 * * *' } as any}
      />
    );

    expect(screen.queryByLabelText('Name:')).not.toBeInTheDocument();
  });

  it('shows source type toggle between YAML and Deep link', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(screen.getByText('YAML')).toBeInTheDocument();
    expect(screen.getByText('Deep link')).toBeInTheDocument();
  });

  it('shows Browse button in YAML source mode', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(
      screen.getByText('Browse for YAML file...')
    ).toBeInTheDocument();
  });

  it('switches to deeplink source type on click', async () => {
    const user = userEvent.setup();
    render(<ScheduleModal {...defaultProps} />);

    await user.click(screen.getByText('Deep link'));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Paste goose://recipe link here...')
      ).toBeInTheDocument();
    });
  });

  it('shows Cancel and Create Schedule buttons', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create Schedule')).toBeInTheDocument();
  });

  it('shows "Update Schedule" button in edit mode', () => {
    render(
      <ScheduleModal
        {...defaultProps}
        schedule={{ id: 'test-job', cron: '0 0 14 * * *' } as any}
      />
    );

    expect(screen.getByText('Update Schedule')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ScheduleModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('disables buttons when loading externally', () => {
    render(
      <ScheduleModal {...defaultProps} isLoadingExternally={true} />
    );

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Creating...')).toBeDisabled();
  });

  it('shows "Updating..." text when loading in edit mode', () => {
    render(
      <ScheduleModal
        {...defaultProps}
        isLoadingExternally={true}
        schedule={{ id: 'test-job', cron: '0 0 14 * * *' } as any}
      />
    );

    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });

  it('displays API error when provided', () => {
    render(
      <ScheduleModal
        {...defaultProps}
        apiErrorExternally="Something went wrong"
      />
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows validation error when submitting with ID but no recipe', async () => {
    const user = userEvent.setup();
    render(<ScheduleModal {...defaultProps} />);

    // Fill in schedule ID but don't provide a recipe source
    const nameInput = screen.getByPlaceholderText('e.g., daily-summary-job');
    await user.type(nameInput, 'my-schedule');

    const submitButton = screen.getByText('Create Schedule');
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Please provide a valid recipe source.')
      ).toBeInTheDocument();
    });
  });

  it('renders CronPicker component', () => {
    render(<ScheduleModal {...defaultProps} />);

    expect(screen.getByTestId('cron-picker')).toBeInTheDocument();
  });
});
