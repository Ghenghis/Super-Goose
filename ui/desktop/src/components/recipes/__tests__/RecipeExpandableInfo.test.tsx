import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import RecipeExpandableInfo from '../RecipeExpandableInfo';

describe('RecipeExpandableInfo', () => {
  const defaultProps = {
    infoLabel: 'Instructions',
    infoValue: 'Some instruction text here',
    onClickEdit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the label', () => {
    render(<RecipeExpandableInfo {...defaultProps} />);

    expect(screen.getByText('Instructions')).toBeInTheDocument();
  });

  it('displays the info value text', () => {
    render(<RecipeExpandableInfo {...defaultProps} />);

    // Text appears in both the hidden measure div and visible paragraph
    const elements = screen.getAllByText('Some instruction text here');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows required asterisk when required is true', () => {
    render(<RecipeExpandableInfo {...defaultProps} required={true} />);

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not show required asterisk when required is false', () => {
    render(<RecipeExpandableInfo {...defaultProps} required={false} />);

    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('shows "Edit instructions" button when infoValue exists', () => {
    render(<RecipeExpandableInfo {...defaultProps} />);

    expect(
      screen.getByText('Edit instructions')
    ).toBeInTheDocument();
  });

  it('shows "Add instructions" button when infoValue is empty', () => {
    render(<RecipeExpandableInfo {...defaultProps} infoValue="" />);

    expect(
      screen.getByText('Add instructions')
    ).toBeInTheDocument();
  });

  it('calls onClickEdit when Edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecipeExpandableInfo {...defaultProps} />);

    await user.click(screen.getByText('Edit instructions'));

    expect(defaultProps.onClickEdit).toHaveBeenCalled();
  });

  it('does not show expand/collapse button when text is short', () => {
    render(<RecipeExpandableInfo {...defaultProps} infoValue="Short text" />);

    // No expand button should be present since text is short
    expect(
      screen.queryByRole('button', { name: /expand|collapse/i })
    ).not.toBeInTheDocument();
  });

  it('renders without crashing for empty infoValue', () => {
    const { container } = render(
      <RecipeExpandableInfo {...defaultProps} infoValue="" />
    );

    expect(container).toBeDefined();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
  });

  it('uses lowercase label in button text', () => {
    render(
      <RecipeExpandableInfo
        {...defaultProps}
        infoLabel="Prompt"
        infoValue="Some prompt"
      />
    );

    expect(screen.getByText('Edit prompt')).toBeInTheDocument();
  });
});
