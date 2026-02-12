import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../ui/card', () => ({
  Card: ({ children, onClick, title, className }: any) => (
    <div onClick={onClick} title={title} className={className} data-testid="activity-card">
      {children}
    </div>
  ),
}));

vi.mock('../../GooseLogo', () => ({
  default: ({ size, hover }: any) => (
    <div data-testid="goose-logo" data-size={size} data-hover={hover} />
  ),
}));

vi.mock('../../MarkdownContent', () => ({
  default: ({ content, className }: { content: string; className?: string }) => (
    <div data-testid="markdown-content" className={className}>
      {content}
    </div>
  ),
}));

vi.mock('../../../utils/providerUtils', () => ({
  substituteParameters: vi.fn(
    (text: string, params: Record<string, string>) => {
      let result = text;
      for (const key of Object.keys(params)) {
        result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), params[key]);
      }
      return result;
    }
  ),
}));

import RecipeActivities from '../RecipeActivities';

describe('RecipeActivities', () => {
  const mockAppend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when activities is null', () => {
    const { container } = render(
      <RecipeActivities append={mockAppend} activities={null} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when activities is empty array', () => {
    const { container } = render(
      <RecipeActivities append={mockAppend} activities={[]} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders activity pills when activities are provided', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['Run tests', 'Deploy code', 'Review PR']}
      />
    );

    expect(screen.getByText('Run tests')).toBeInTheDocument();
    expect(screen.getByText('Deploy code')).toBeInTheDocument();
    expect(screen.getByText('Review PR')).toBeInTheDocument();
  });

  it('calls append with activity text when a pill is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['Run tests', 'Deploy code']}
      />
    );

    await user.click(screen.getByText('Run tests'));

    expect(mockAppend).toHaveBeenCalledWith('Run tests');
  });

  it('renders the GooseLogo', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['Some activity']}
      />
    );

    expect(screen.getByTestId('goose-logo')).toBeInTheDocument();
  });

  it('extracts and renders message pill separately', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={[
          'message:Welcome to the recipe!',
          'Run tests',
          'Build project',
        ]}
      />
    );

    // Message pill should be rendered as markdown content
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    expect(screen.getByText('Welcome to the recipe!')).toBeInTheDocument();

    // Other activities should still render as pills
    expect(screen.getByText('Run tests')).toBeInTheDocument();
    expect(screen.getByText('Build project')).toBeInTheDocument();
  });

  it('substitutes parameters in activity text', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['Run {{task}} for {{user}}']}
        parameterValues={{ task: 'deployment', user: 'Alice' }}
      />
    );

    expect(screen.getByText('Run deployment for Alice')).toBeInTheDocument();
  });

  it('substitutes parameters in message pills', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['message:Hello {{user}}!']}
        parameterValues={{ user: 'Bob' }}
      />
    );

    expect(screen.getByText('Hello Bob!')).toBeInTheDocument();
  });

  it('truncates long activity text to 60 characters', () => {
    const longText = 'A'.repeat(80);
    render(
      <RecipeActivities
        append={mockAppend}
        activities={[longText]}
      />
    );

    const truncated = 'A'.repeat(60) + '...';
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it('shows title attribute for long activities', () => {
    const longText = 'B'.repeat(80);
    render(
      <RecipeActivities
        append={mockAppend}
        activities={[longText]}
      />
    );

    const card = screen.getByTestId('activity-card');
    expect(card).toHaveAttribute('title', longText);
  });

  it('does not truncate short activity text', () => {
    render(
      <RecipeActivities
        append={mockAppend}
        activities={['Short text']}
      />
    );

    expect(screen.getByText('Short text')).toBeInTheDocument();
  });
});
