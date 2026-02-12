import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import CodeMinimap from '../CodeMinimap';

vi.mock('lucide-react', () => lucideReactMock);

describe('CodeMinimap', () => {
  const defaultProps = {
    code: Array.from({ length: 20 }, (_, i) => `const line${i} = ${i};`).join('\n'),
    visibleRange: [0, 10] as [number, number],
    totalLines: 20,
    onClick: vi.fn(),
  };

  it('renders nothing for code under 10 lines', () => {
    const { container } = render(
      <CodeMinimap
        code="line1\nline2\nline3"
        visibleRange={[0, 2]}
        totalLines={3}
        onClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders minimap for 20+ line code', () => {
    render(<CodeMinimap {...defaultProps} />);
    const minimap = screen.getByRole('slider', { name: /Code minimap/ });
    expect(minimap).toBeInTheDocument();
  });

  it('sets correct aria attributes', () => {
    render(<CodeMinimap {...defaultProps} />);
    const minimap = screen.getByRole('slider');
    expect(minimap).toHaveAttribute('aria-valuemin', '0');
    expect(minimap).toHaveAttribute('aria-valuemax', '19');
    expect(minimap).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders line elements for each code line', () => {
    const { container } = render(<CodeMinimap {...defaultProps} />);
    // Each line gets a div with absolute positioning inside the minimap
    const lineDivs = container.querySelectorAll('.absolute.left-1');
    expect(lineDivs.length).toBe(20);
  });

  it('applies custom className', () => {
    const { container } = render(
      <CodeMinimap {...defaultProps} className="my-minimap" />
    );
    expect(container.firstChild).toHaveClass('my-minimap');
  });
});
