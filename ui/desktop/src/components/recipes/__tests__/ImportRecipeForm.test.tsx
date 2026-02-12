import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, disabled, type, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} type={type} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('../../../recipe', () => ({
  parseDeeplink: vi.fn(() =>
    Promise.resolve({
      title: 'Parsed Recipe',
      description: 'A parsed recipe',
      instructions: 'Do things',
    })
  ),
  parseRecipeFromFile: vi.fn(() =>
    Promise.resolve({
      title: 'File Recipe',
      description: 'From file',
      instructions: 'Instructions from file',
    })
  ),
}));

vi.mock('../../../toasts', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../hooks/useEscapeKey', () => ({
  useEscapeKey: vi.fn(),
}));

vi.mock('../../../recipe/validation', () => ({
  getRecipeJsonSchema: vi.fn(() => ({
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['title', 'description'],
  })),
}));

vi.mock('../../../recipe/recipe_management', () => ({
  saveRecipe: vi.fn(() => Promise.resolve('recipe-123')),
}));

vi.mock('../../../utils/conversionUtils', () => ({
  errorMessage: vi.fn((err: any, fallback?: string) =>
    err?.message || fallback || 'Unknown error'
  ),
}));

import ImportRecipeForm, { ImportRecipeButton } from '../ImportRecipeForm';

describe('ImportRecipeForm', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ImportRecipeForm {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the import form when isOpen is true', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    // "Import Recipe" appears in both the heading and the submit button
    const elements = screen.getAllByText('Import Recipe');
    expect(elements.length).toBe(2); // heading + button
    // Verify the heading specifically
    expect(elements[0].tagName).toBe('H3');
  });

  it('shows deeplink textarea input', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(screen.getByText('Recipe Deeplink')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        'Paste your goose://recipe?config=... deeplink here'
      )
    ).toBeInTheDocument();
  });

  it('shows file upload input', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(screen.getByText('Recipe File')).toBeInTheDocument();
  });

  it('shows OR divider between deeplink and file inputs', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(screen.getByText('OR')).toBeInTheDocument();
  });

  it('shows Cancel and Import Recipe buttons', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    // The submit button text
    expect(
      screen.getByRole('button', { name: 'Import Recipe' })
    ).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ImportRecipeForm {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows helper text for deeplink format', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(
      screen.getByText(/Paste a recipe deeplink starting with/)
    ).toBeInTheDocument();
  });

  it('shows helper text for file upload', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(
      screen.getByText(/Upload a YAML or JSON file/)
    ).toBeInTheDocument();
  });

  it('shows "example" link that opens schema modal', async () => {
    const user = userEvent.setup();
    render(<ImportRecipeForm {...defaultProps} />);

    const exampleLink = screen.getByText('example');
    expect(exampleLink).toBeInTheDocument();

    await user.click(exampleLink);

    await waitFor(() => {
      expect(
        screen.getByText('Expected Recipe Structure')
      ).toBeInTheDocument();
    });
  });

  it('shows security warning text', () => {
    render(<ImportRecipeForm {...defaultProps} />);

    expect(
      screen.getByText(/Ensure you review contents of recipe files/)
    ).toBeInTheDocument();
  });
});

describe('ImportRecipeButton', () => {
  it('renders the import button with icon and text', () => {
    const onClick = vi.fn();
    render(<ImportRecipeButton onClick={onClick} />);

    expect(
      screen.getByRole('button', { name: /Import Recipe/i })
    ).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ImportRecipeButton onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /Import Recipe/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
