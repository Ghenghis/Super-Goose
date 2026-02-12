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

import JsonSchemaEditor from '../JsonSchemaEditor';

describe('JsonSchemaEditor', () => {
  const validJson = JSON.stringify(
    { type: 'object', properties: { result: { type: 'string' } } },
    null,
    2
  );

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    value: validJson,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <JsonSchemaEditor {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the editor when isOpen is true', () => {
    render(<JsonSchemaEditor {...defaultProps} />);

    expect(screen.getByText('JSON Schema Editor')).toBeInTheDocument();
  });

  it('displays the initial value in the textarea', () => {
    render(<JsonSchemaEditor {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(validJson);
  });

  it('shows Save Schema and Cancel buttons', () => {
    render(<JsonSchemaEditor {...defaultProps} />);

    expect(screen.getByText('Save Schema')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onChange and onClose when Save is clicked with valid JSON', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} />);

    await user.click(screen.getByText('Save Schema'));

    expect(defaultProps.onChange).toHaveBeenCalledWith(validJson);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows validation error when saving invalid JSON', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} value="" />);

    // Use fireEvent.change to avoid userEvent parsing issues with curly braces
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'not valid json' } });

    await user.click(screen.getByText('Save Schema'));

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
    });

    expect(defaultProps.onChange).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('allows saving empty schema (no validation error)', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} value="" />);

    await user.click(screen.getByText('Save Schema'));

    expect(defaultProps.onChange).toHaveBeenCalledWith('');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose without onChange when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} />);

    // Use fireEvent to avoid userEvent curly brace parsing
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'modified content' } });

    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onChange).not.toHaveBeenCalled();
  });

  it('has Insert Example button', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} value="" />);

    expect(screen.getByText('Insert Example')).toBeInTheDocument();

    await user.click(screen.getByText('Insert Example'));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"type": "object"');
    expect(textarea.value).toContain('"required"');
  });

  it('shows helper description text', () => {
    render(<JsonSchemaEditor {...defaultProps} />);

    expect(
      screen.getByText(
        "Define the expected structure of the AI's response using JSON Schema format"
      )
    ).toBeInTheDocument();
  });

  it('shows external error prop', () => {
    render(
      <JsonSchemaEditor {...defaultProps} error="Schema has issues" />
    );

    expect(screen.getByText('Schema has issues')).toBeInTheDocument();
  });

  it('clears local error when typing new content', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} value="" />);

    const textarea = screen.getByRole('textbox');
    // Set invalid JSON
    fireEvent.change(textarea, { target: { value: 'not json' } });
    await user.click(screen.getByText('Save Schema'));

    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();

    // Now type something -- error should clear
    fireEvent.change(textarea, { target: { value: 'valid now' } });

    expect(
      screen.queryByText('Invalid JSON format')
    ).not.toBeInTheDocument();
  });

  it('closes on backdrop click', () => {
    render(<JsonSchemaEditor {...defaultProps} />);

    const backdrop = document.querySelector('.fixed.inset-0.z-\\[400\\]');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('closes via X button', async () => {
    const user = userEvent.setup();
    render(<JsonSchemaEditor {...defaultProps} />);

    const closeButton = screen.getByText('\u00D7');
    await user.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('resets local value when reopened', () => {
    const { rerender } = render(
      <JsonSchemaEditor {...defaultProps} isOpen={false} />
    );

    rerender(
      <JsonSchemaEditor
        {...defaultProps}
        isOpen={true}
        value='{"new": "schema"}'
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('{"new": "schema"}');
  });

  it('shows placeholder text when value is empty', () => {
    render(<JsonSchemaEditor {...defaultProps} value="" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.placeholder).toContain('"type": "object"');
  });
});
