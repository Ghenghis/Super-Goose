import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, variant, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

import RecipeInfoModal from '../RecipeInfoModal';

describe('RecipeInfoModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    infoLabel: 'Instructions',
    originalValue: 'Some original instructions',
    onSaveValue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <RecipeInfoModal {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when isOpen is true', () => {
    render(<RecipeInfoModal {...defaultProps} />);

    expect(screen.getByText('Edit Instructions')).toBeInTheDocument();
  });

  it('displays the original value in the textarea', () => {
    render(<RecipeInfoModal {...defaultProps} />);

    const textarea = screen.getByDisplayValue('Some original instructions');
    expect(textarea).toBeInTheDocument();
  });

  it('shows Save Changes and Cancel buttons', () => {
    render(<RecipeInfoModal {...defaultProps} />);

    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('allows editing the text', async () => {
    const user = userEvent.setup();
    render(<RecipeInfoModal {...defaultProps} />);

    const textarea = screen.getByDisplayValue('Some original instructions');
    await user.clear(textarea);
    await user.type(textarea, 'Updated instructions');

    expect(screen.getByDisplayValue('Updated instructions')).toBeInTheDocument();
  });

  it('calls onSaveValue and onClose when Save Changes is clicked', async () => {
    const user = userEvent.setup();
    render(<RecipeInfoModal {...defaultProps} />);

    const textarea = screen.getByDisplayValue('Some original instructions');
    await user.clear(textarea);
    await user.type(textarea, 'New value');

    await user.click(screen.getByText('Save Changes'));

    expect(defaultProps.onSaveValue).toHaveBeenCalledWith('New value');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<RecipeInfoModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onSaveValue).not.toHaveBeenCalled();
  });

  it('resets value to original when reopened', () => {
    const { rerender } = render(
      <RecipeInfoModal {...defaultProps} isOpen={false} />
    );

    rerender(<RecipeInfoModal {...defaultProps} isOpen={true} />);

    expect(
      screen.getByDisplayValue('Some original instructions')
    ).toBeInTheDocument();
  });

  it('uses infoLabel in heading and placeholder', () => {
    render(<RecipeInfoModal {...defaultProps} infoLabel="Prompt" />);

    expect(screen.getByText('Edit Prompt')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter prompt...')).toBeInTheDocument();
  });

  it('handles empty originalValue', () => {
    render(
      <RecipeInfoModal {...defaultProps} originalValue="" infoLabel="Notes" />
    );

    expect(screen.getByText('Edit Notes')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('Enter notes...');
    expect(textarea).toHaveValue('');
  });

  it('uses default infoLabel when not provided', () => {
    render(
      <RecipeInfoModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Default infoLabel is ''
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});
