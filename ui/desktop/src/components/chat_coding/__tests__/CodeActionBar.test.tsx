import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import CodeActionBar from '../CodeActionBar';

vi.mock('lucide-react', () => lucideReactMock);

describe('CodeActionBar', () => {
  const defaultProps = {
    lineCount: 42,
    code: 'const x = 1;',
  };

  it('renders without crashing', () => {
    const { container } = render(<CodeActionBar {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('displays line count', () => {
    render(<CodeActionBar {...defaultProps} lineCount={10} />);
    expect(screen.getByText('10 lines')).toBeInTheDocument();
  });

  it('displays language badge when language is provided', () => {
    render(<CodeActionBar {...defaultProps} language="typescript" />);
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows file name from file path', () => {
    render(<CodeActionBar {...defaultProps} filePath="src/components/App.tsx" />);
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  it('copies code on copy button click', () => {
    render(<CodeActionBar {...defaultProps} code="hello world" />);
    const copyBtn = screen.getByTitle('Copy code');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('shows Apply button when showApply and onApply are provided', () => {
    const onApply = vi.fn();
    render(<CodeActionBar {...defaultProps} showApply onApply={onApply} />);
    const applyBtn = screen.getByTitle('Apply to file');
    expect(applyBtn).toBeInTheDocument();
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows collapse/expand toggle when onToggleCollapse is provided', () => {
    const onToggle = vi.fn();
    render(
      <CodeActionBar {...defaultProps} onToggleCollapse={onToggle} isCollapsed={false} />
    );
    const toggleBtn = screen.getByTitle('Collapse code');
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
