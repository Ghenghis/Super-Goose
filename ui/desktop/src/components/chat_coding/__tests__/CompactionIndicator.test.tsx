import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import { CompactionIndicator } from '../CompactionIndicator';

vi.mock('lucide-react', () => lucideReactMock);

describe('CompactionIndicator', () => {
  it('renders compacting state', () => {
    render(<CompactionIndicator isCompacting={true} />);
    expect(screen.getByText('Compacting context')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Compacting context');
  });

  it('renders completed state', () => {
    render(
      <CompactionIndicator
        isCompacting={false}
        beforeTokens={10000}
        afterTokens={3000}
      />
    );
    expect(screen.getByText('Context compacted')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Context compacted');
  });

  it('shows token counts when provided', () => {
    render(
      <CompactionIndicator
        isCompacting={false}
        beforeTokens={12300}
        afterTokens={4100}
      />
    );
    expect(screen.getByText('12.3k')).toBeInTheDocument();
    expect(screen.getByText('4.1k')).toBeInTheDocument();
  });

  it('shows reduction percentage badge when complete', () => {
    render(
      <CompactionIndicator
        isCompacting={false}
        beforeTokens={10000}
        afterTokens={3000}
      />
    );
    expect(screen.getByText('-70%')).toBeInTheDocument();
  });

  it('shows animated dots while compacting', () => {
    render(<CompactionIndicator isCompacting={true} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CompactionIndicator isCompacting={false} className="my-class" />
    );
    expect(container.firstChild).toHaveClass('my-class');
  });
});
