import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import EnhancedCodeBlock from '../EnhancedCodeBlock';

vi.mock('lucide-react', () => lucideReactMock);

vi.mock('react-syntax-highlighter', () => ({
  Prism: (props: any) => <pre data-testid="syntax-hl">{props.children}</pre>,
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}));

// Mock sub-components to avoid deep dependency issues
vi.mock('../ContentTypeIndicator', () => ({
  default: (props: any) => <span data-testid="content-type">{props.type}</span>,
  detectContentType: (_path: string) => 'code',
}));

vi.mock('../CodeSearch', () => ({
  default: (_props: any) => <div data-testid="code-search" />,
}));

vi.mock('../CodeMinimap', () => ({
  default: () => null,
}));

vi.mock('../BreadcrumbPath', () => ({
  default: (props: any) => <span data-testid="breadcrumb">{props.filePath}</span>,
}));

describe('EnhancedCodeBlock', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <EnhancedCodeBlock code="const x = 1;" language="typescript" />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders syntax highlighted code', () => {
    render(<EnhancedCodeBlock code="const x = 1;" language="typescript" />);
    expect(screen.getByTestId('syntax-hl')).toBeInTheDocument();
  });

  it('shows language display name in header', () => {
    render(<EnhancedCodeBlock code="const x = 1;" language="ts" />);
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows line count', () => {
    render(<EnhancedCodeBlock code={"line1\nline2\nline3"} />);
    expect(screen.getByText('3 lines')).toBeInTheDocument();
  });

  it('shows singular "line" for single line', () => {
    render(<EnhancedCodeBlock code={"single line"} />);
    expect(screen.getByText('1 line')).toBeInTheDocument();
  });

  it('renders copy button', () => {
    render(<EnhancedCodeBlock code="code" />);
    expect(screen.getByLabelText('Copy code')).toBeInTheDocument();
  });

  it('renders word wrap toggle', () => {
    render(<EnhancedCodeBlock code="code" />);
    expect(screen.getByLabelText('Enable word wrap')).toBeInTheDocument();
  });
});
