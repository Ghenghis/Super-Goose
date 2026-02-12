import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../shared/RecipeFormFields', () => ({
  RecipeFormFields: ({ form }: any) => (
    <div data-testid="recipe-form-fields">
      <input
        data-testid="title-input"
        value={form.state.values.title}
        onChange={(e: any) => form.setFieldValue('title', e.target.value)}
      />
      <input
        data-testid="description-input"
        value={form.state.values.description}
        onChange={(e: any) => form.setFieldValue('description', e.target.value)}
      />
      <input
        data-testid="instructions-input"
        value={form.state.values.instructions}
        onChange={(e: any) => form.setFieldValue('instructions', e.target.value)}
      />
    </div>
  ),
}));

vi.mock('../../../recipe', () => ({
  generateDeepLink: vi.fn(() => Promise.resolve('goose://recipe?config=abc123')),
}));

vi.mock('../../../recipe/recipe_management', () => ({
  saveRecipe: vi.fn(() => Promise.resolve('recipe-id-1')),
}));

vi.mock('../../../toasts', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../utils/conversionUtils', () => ({
  errorMessage: vi.fn((err: any, fallback?: string) =>
    err?.message || fallback || 'Unknown error'
  ),
}));

vi.mock('../../icons/Geese', () => ({
  Geese: ({ className }: any) => <div data-testid="geese-icon" className={className} />,
}));

vi.mock('../../icons/Copy', () => ({
  default: ({ className }: any) => <div data-testid="copy-icon" className={className} />,
}));

import CreateEditRecipeModal from '../CreateEditRecipeModal';

describe('CreateEditRecipeModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CreateEditRecipeModal {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when isOpen is true', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    expect(screen.getByText('View/edit recipe')).toBeInTheDocument();
  });

  it('shows "Create Recipe" title in create mode', () => {
    render(<CreateEditRecipeModal {...defaultProps} isCreateMode={true} />);

    expect(screen.getByText('Create Recipe')).toBeInTheDocument();
  });

  it('shows "View/edit recipe" title in edit mode', () => {
    render(<CreateEditRecipeModal {...defaultProps} isCreateMode={false} />);

    expect(screen.getByText('View/edit recipe')).toBeInTheDocument();
  });

  it('renders RecipeFormFields component', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    expect(screen.getByTestId('recipe-form-fields')).toBeInTheDocument();
  });

  it('renders close button that calls onClose with false', async () => {
    const user = userEvent.setup();
    render(<CreateEditRecipeModal {...defaultProps} />);

    // Click the X button in the header
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(
      (btn) => btn.querySelector('svg') || btn.textContent === ''
    );

    // Click the "Close" text button in footer
    await user.click(screen.getByText('Close'));

    expect(defaultProps.onClose).toHaveBeenCalledWith(false);
  });

  it('renders Save Recipe and Save & Run Recipe buttons', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    expect(screen.getByText('Save Recipe')).toBeInTheDocument();
    expect(screen.getByText('Save & Run Recipe')).toBeInTheDocument();
  });

  it('disables save buttons when required fields are empty', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    const saveButton = screen.getByText('Save Recipe');
    const saveAndRunButton = screen.getByText('Save & Run Recipe');

    expect(saveButton).toBeDisabled();
    expect(saveAndRunButton).toBeDisabled();
  });

  it('pre-fills form with recipe data when recipe prop is provided', () => {
    const recipe = {
      title: 'Test Recipe',
      description: 'A test recipe',
      instructions: 'Do something helpful',
      prompt: 'Hello',
      activities: ['activity1'],
      parameters: [],
    };

    render(
      <CreateEditRecipeModal {...defaultProps} recipe={recipe as any} />
    );

    expect(screen.getByTestId('title-input')).toHaveValue('Test Recipe');
    expect(screen.getByTestId('description-input')).toHaveValue('A test recipe');
    expect(screen.getByTestId('instructions-input')).toHaveValue(
      'Do something helpful'
    );
  });

  it('shows "Learn more" link pointing to docs', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    const learnMoreLink = screen.getByText('Learn more');
    expect(learnMoreLink).toBeInTheDocument();
    expect(learnMoreLink.closest('a')).toHaveAttribute(
      'href',
      'https://ghenghis.github.io/Super-Goose/docs/guides/recipes/'
    );
  });

  it('shows the Geese icon in the header', () => {
    render(<CreateEditRecipeModal {...defaultProps} />);

    expect(screen.getByTestId('geese-icon')).toBeInTheDocument();
  });
});
