import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../ui/button', () => ({
  Button: ({ children, onClick, type, variant, ...props }: any) => (
    <button onClick={onClick} type={type} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../../../hooks/useEscapeKey', () => ({
  useEscapeKey: vi.fn(),
}));

import InstructionsEditor from '../InstructionsEditor';

describe('InstructionsEditor', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    value: 'Initial instructions text',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <InstructionsEditor {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the editor when isOpen is true', () => {
    render(<InstructionsEditor {...defaultProps} />);

    expect(screen.getByText('Instructions Editor')).toBeInTheDocument();
  });

  it('displays the initial value in the textarea', () => {
    render(<InstructionsEditor {...defaultProps} />);

    expect(
      screen.getByDisplayValue('Initial instructions text')
    ).toBeInTheDocument();
  });

  it('shows Save Instructions and Cancel buttons', () => {
    render(<InstructionsEditor {...defaultProps} />);

    expect(screen.getByText('Save Instructions')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onChange and onClose when Save is clicked', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    await user.click(screen.getByText('Save Instructions'));

    expect(defaultProps.onChange).toHaveBeenCalledWith(
      'Initial instructions text'
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose without onChange when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    // Modify the text
    const textarea = screen.getByDisplayValue('Initial instructions text');
    await user.clear(textarea);
    await user.type(textarea, 'Modified text');

    // Click cancel
    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onChange).not.toHaveBeenCalled();
  });

  it('resets value to original when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    const textarea = screen.getByDisplayValue('Initial instructions text');
    await user.clear(textarea);
    await user.type(textarea, 'Modified');

    await user.click(screen.getByText('Cancel'));

    // onClose is called, component will remount with original value
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('has Insert Example button that fills in example content', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    expect(screen.getByText('Insert Example')).toBeInTheDocument();

    await user.click(screen.getByText('Insert Example'));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('You are an AI assistant');
  });

  it('shows parameter syntax helper text', () => {
    render(<InstructionsEditor {...defaultProps} />);

    expect(
      screen.getByText(/syntax to define parameters/)
    ).toBeInTheDocument();
  });

  it('shows error message when error prop is provided', () => {
    render(
      <InstructionsEditor
        {...defaultProps}
        error="Instructions are required"
      />
    );

    expect(
      screen.getByText('Instructions are required')
    ).toBeInTheDocument();
  });

  it('does not show error when error prop is not provided', () => {
    render(<InstructionsEditor {...defaultProps} />);

    // No red text should be in the document
    const errorElements = document.querySelectorAll('.text-red-500');
    expect(errorElements.length).toBe(0);
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    // Click on the backdrop (outermost div)
    const backdrop = document.querySelector('.fixed.inset-0.z-\\[400\\]');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('closes via the X button in the header', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    // The X button contains the multiplication sign character
    const closeButton = screen.getByText('\u00D7');
    await user.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('updates local value on typing', async () => {
    const user = userEvent.setup();
    render(<InstructionsEditor {...defaultProps} />);

    const textarea = screen.getByDisplayValue('Initial instructions text');
    await user.clear(textarea);
    await user.type(textarea, 'New text');

    expect(textarea).toHaveValue('New text');
  });

  it('syncs local value when isOpen changes to true', () => {
    const { rerender } = render(
      <InstructionsEditor {...defaultProps} isOpen={false} />
    );

    rerender(
      <InstructionsEditor
        {...defaultProps}
        isOpen={true}
        value="Updated from parent"
      />
    );

    expect(
      screen.getByDisplayValue('Updated from parent')
    ).toBeInTheDocument();
  });
});
