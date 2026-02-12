import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import DiffCard, { parseDiffText } from '../DiffCard';
import type { DiffLine } from '../DiffCard';

vi.mock('lucide-react', () => lucideReactMock);

const sampleLines: DiffLine[] = [
  { type: 'context', content: 'const x = 1;', oldLineNum: 1, newLineNum: 1 },
  { type: 'remove', content: 'const y = 2;', oldLineNum: 2 },
  { type: 'add', content: 'const y = 3;', newLineNum: 2 },
];

describe('DiffCard', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <DiffCard
        filePath="src/utils.ts"
        status="modified"
        additions={1}
        deletions={1}
        lines={sampleLines}
      />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('displays file name from path', () => {
    render(
      <DiffCard
        filePath="src/deep/utils.ts"
        status="modified"
        additions={0}
        deletions={0}
        lines={[]}
      />
    );
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
  });

  it('shows status badge for "added"', () => {
    render(
      <DiffCard
        filePath="new-file.ts"
        status="added"
        additions={5}
        deletions={0}
        lines={[]}
      />
    );
    expect(screen.getByText('Added')).toBeInTheDocument();
  });

  it('shows addition and deletion counts', () => {
    render(
      <DiffCard
        filePath="file.ts"
        status="modified"
        additions={3}
        deletions={2}
        lines={sampleLines}
      />
    );
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('shows "No changes" when lines array is empty and expanded', () => {
    render(
      <DiffCard
        filePath="file.ts"
        status="modified"
        additions={0}
        deletions={0}
        lines={[]}
        collapsed={false}
      />
    );
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });
});

describe('parseDiffText', () => {
  it('parses added file status from +++ /dev/null', () => {
    const result = parseDiffText('--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1,1 @@\n+hello');
    expect(result.status).toBe('added');
    expect(result.additions).toBe(1);
  });

  it('parses renamed file from diff header', () => {
    const result = parseDiffText('diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts');
    expect(result.status).toBe('renamed');
    expect(result.filePath).toBe('new.ts');
  });

  it('counts additions and deletions correctly', () => {
    const diff = `--- a/f.ts\n+++ b/f.ts\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n-old2\n+new2`;
    const result = parseDiffText(diff);
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(2);
  });
});
