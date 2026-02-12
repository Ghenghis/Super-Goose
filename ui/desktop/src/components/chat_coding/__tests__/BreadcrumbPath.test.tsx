import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import BreadcrumbPath from '../BreadcrumbPath';

vi.mock('lucide-react', () => lucideReactMock);

describe('BreadcrumbPath', () => {
  it('returns null for empty filePath', () => {
    const { container } = render(<BreadcrumbPath filePath="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders simple file path segments', () => {
    render(<BreadcrumbPath filePath="src/components/App.tsx" />);
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  it('truncates long paths with ellipsis', () => {
    render(<BreadcrumbPath filePath="a/b/c/d/e/f/g.ts" />);
    // Should show ellipsis for paths > 5 segments
    const ellipsis = screen.getByText('\u2026');
    expect(ellipsis).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<BreadcrumbPath filePath="src/file.ts" />);
    expect(screen.getByLabelText('Copy full path')).toBeInTheDocument();
  });

  it('copies path when copy button is clicked', async () => {
    render(<BreadcrumbPath filePath="src/file.ts" />);
    const copyBtn = screen.getByLabelText('Copy full path');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('src/file.ts');
  });

  it('applies custom className', () => {
    const { container } = render(
      <BreadcrumbPath filePath="src/file.ts" className="my-class" />
    );
    expect(container.firstChild).toHaveClass('my-class');
  });
});
