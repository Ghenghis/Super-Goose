import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../utils/workingDir', () => ({
  getInitialWorkingDir: vi.fn(() => '/test/dir'),
}));

import ParameterInputModal from '../ParameterInputModal';
import type { Parameter } from '../../recipe/index';

describe('ParameterInputModal', () => {
  const mockOnSubmit = vi.fn();
  const mockOnClose = vi.fn();

  const requiredTextParam: Parameter = {
    key: 'name',
    input_type: 'string',
    requirement: 'required',
    description: 'Your name',
  };

  const optionalTextParam: Parameter = {
    key: 'greeting',
    input_type: 'string',
    requirement: 'optional',
    description: 'Custom greeting',
    default: 'Hello',
  };

  const booleanParam: Parameter = {
    key: 'verbose',
    input_type: 'boolean',
    requirement: 'required',
    description: 'Enable verbose output',
  };

  const selectParam: Parameter = {
    key: 'format',
    input_type: 'select',
    requirement: 'required',
    description: 'Output format',
    options: ['json', 'csv', 'xml'],
  };

  const numberParam: Parameter = {
    key: 'count',
    input_type: 'number',
    requirement: 'required',
    description: 'Number of items',
  };

  const defaultProps = {
    parameters: [requiredTextParam, optionalTextParam],
    onSubmit: mockOnSubmit,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with title "Recipe Parameters"', () => {
    render(<ParameterInputModal {...defaultProps} />);

    expect(screen.getByText('Recipe Parameters')).toBeInTheDocument();
  });

  it('renders text input for string parameters', () => {
    render(<ParameterInputModal {...defaultProps} />);

    expect(screen.getByText('Your name')).toBeInTheDocument();
    // Required param shows asterisk
    const labels = screen.getAllByText('*');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('pre-fills optional parameters with default values', async () => {
    render(<ParameterInputModal {...defaultProps} />);

    await waitFor(() => {
      const greetingInput = screen.getByDisplayValue('Hello');
      expect(greetingInput).toBeInTheDocument();
    });
  });

  it('pre-fills with initialValues when provided', async () => {
    render(
      <ParameterInputModal
        {...defaultProps}
        initialValues={{ name: 'Alice', greeting: 'Hi there' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Hi there')).toBeInTheDocument();
    });
  });

  it('shows validation error when required field is empty on submit', async () => {
    const user = userEvent.setup();
    render(<ParameterInputModal {...defaultProps} />);

    await user.click(screen.getByText('Start Recipe'));

    await waitFor(() => {
      expect(screen.getByText('Your name is required')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with values when form is valid', async () => {
    const user = userEvent.setup();
    render(<ParameterInputModal {...defaultProps} />);

    const nameInput = screen.getByPlaceholderText('Enter value for name...');
    await user.type(nameInput, 'Alice');

    await user.click(screen.getByText('Start Recipe'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alice',
          greeting: 'Hello',
        })
      );
    });
  });

  it('renders select dropdown for select parameters', () => {
    render(
      <ParameterInputModal
        parameters={[selectParam]}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Select an option...')).toBeInTheDocument();
    expect(screen.getByText('json')).toBeInTheDocument();
    expect(screen.getByText('csv')).toBeInTheDocument();
    expect(screen.getByText('xml')).toBeInTheDocument();
  });

  it('renders boolean select for boolean parameters', () => {
    render(
      <ParameterInputModal
        parameters={[booleanParam]}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Select...')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('False')).toBeInTheDocument();
  });

  it('renders number input for number parameters', () => {
    render(
      <ParameterInputModal
        parameters={[numberParam]}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    );

    const numInput = screen.getByPlaceholderText('Enter value for count...');
    expect(numInput).toHaveAttribute('type', 'number');
  });

  it('shows cancel options when Cancel is clicked with parameters', async () => {
    const user = userEvent.setup();
    render(<ParameterInputModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.getByText('Cancel Recipe Setup')).toBeInTheDocument();
      expect(screen.getByText('Back to Parameter Form')).toBeInTheDocument();
      expect(screen.getByText('Start New Chat (No Recipe)')).toBeInTheDocument();
    });
  });

  it('returns to form when "Back to Parameter Form" is clicked', async () => {
    const user = userEvent.setup();
    render(<ParameterInputModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    await user.click(screen.getByText('Back to Parameter Form'));

    await waitFor(() => {
      expect(screen.getByText('Recipe Parameters')).toBeInTheDocument();
    });
  });

  it('creates new chat window when "Start New Chat" is clicked', async () => {
    const user = userEvent.setup();
    (window.electron as any).createChatWindow = vi.fn();
    (window.electron as any).hideWindow = vi.fn();

    render(<ParameterInputModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    await user.click(screen.getByText('Start New Chat (No Recipe)'));

    expect((window.electron as any).createChatWindow).toHaveBeenCalled();
    expect((window.electron as any).hideWindow).toHaveBeenCalled();
  });
});
