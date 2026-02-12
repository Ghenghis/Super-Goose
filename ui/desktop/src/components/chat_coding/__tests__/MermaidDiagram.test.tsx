import { render, screen, waitFor } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import MermaidDiagram from '../MermaidDiagram';

vi.mock('lucide-react', () => lucideReactMock);

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg><text>mock diagram</text></svg>' }),
  },
}));

describe('MermaidDiagram', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MermaidDiagram code="flowchart TD\n  A --> B" />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('shows loading state initially', () => {
    render(<MermaidDiagram code="flowchart TD\n  A --> B" />);
    expect(screen.getByText('Rendering diagram...')).toBeInTheDocument();
  });

  it('detects diagram type from code', () => {
    render(<MermaidDiagram code="sequenceDiagram\n  A->>B: Hello" />);
    expect(screen.getByText(/Sequence Diagram/)).toBeInTheDocument();
  });

  it('uses custom title when provided', () => {
    render(<MermaidDiagram code="flowchart TD\n  A --> B" title="My Flow" />);
    expect(screen.getByText(/My Flow/)).toBeInTheDocument();
  });

  it('renders SVG content after mermaid resolves', async () => {
    render(<MermaidDiagram code="flowchart TD\n  A --> B" />);
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-diagram')).toBeInTheDocument();
    });
  });

  it('shows error state when mermaid render fails', async () => {
    const mermaid = (await import('mermaid')).default;
    (mermaid.render as any).mockRejectedValueOnce(new Error('Syntax error'));

    render(<MermaidDiagram code="invalid mermaid code" />);
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Diagram Error')).toBeInTheDocument();
  });
});
