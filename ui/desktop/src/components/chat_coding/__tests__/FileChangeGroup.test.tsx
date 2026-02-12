import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import FileChangeGroup from '../FileChangeGroup';
import type { FileChange } from '../FileChangeGroup';

vi.mock('lucide-react', () => lucideReactMock);

vi.mock('../ContentTypeIndicator', () => ({
  default: (props: any) => <span data-testid="content-type-indicator" />,
  detectContentType: () => 'code',
}));

const makeFile = (overrides: Partial<FileChange> = {}): FileChange => ({
  filePath: 'src/utils.ts',
  status: 'modified',
  additions: 5,
  deletions: 2,
  ...overrides,
});

describe('FileChangeGroup', () => {
  it('returns null when files array is empty', () => {
    const { container } = render(<FileChangeGroup files={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders file count', () => {
    const files = [makeFile(), makeFile({ filePath: 'src/other.ts' })];
    render(<FileChangeGroup files={files} />);
    expect(screen.getByText('2 files changed')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<FileChangeGroup files={[makeFile()]} title="API Routes" />);
    expect(screen.getByText('API Routes')).toBeInTheDocument();
  });

  it('shows total additions and deletions', () => {
    const files = [
      makeFile({ additions: 10, deletions: 3 }),
      makeFile({ filePath: 'b.ts', additions: 5, deletions: 2 }),
    ];
    render(<FileChangeGroup files={files} />);
    expect(screen.getByText('+15')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('collapses and expands the file list', () => {
    const files = [makeFile(), makeFile({ filePath: 'src/other.ts' })];
    const { container } = render(<FileChangeGroup files={files} collapsed={false} />);
    // File names should be visible when expanded
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
    expect(screen.getByText('other.ts')).toBeInTheDocument();
    // Click the header button to collapse - it's the first direct child button
    const headerButton = container.querySelector('button');
    if (headerButton) fireEvent.click(headerButton);
    // Content should be hidden (collapsed)
    expect(screen.queryByText('other.ts')).not.toBeInTheDocument();
  });

  it('shows diff toggle when files have diffs', () => {
    const files = [makeFile({ diff: '+new line\n-old line' })];
    render(<FileChangeGroup files={files} showDiffs />);
    expect(screen.getByText('Show all diffs')).toBeInTheDocument();
  });
});
