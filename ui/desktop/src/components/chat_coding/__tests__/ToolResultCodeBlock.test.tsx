import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import ToolResultCodeBlock, {
  detectLanguageFromPath,
  looksLikeCode,
} from '../ToolResultCodeBlock';

vi.mock('lucide-react', () => lucideReactMock);

vi.mock('../CodeActionBar', () => ({
  default: (props: any) => (
    <div data-testid="code-action-bar">
      <span>{props.language}</span>
      <span>{props.lineCount} lines</span>
    </div>
  ),
}));

describe('ToolResultCodeBlock', () => {
  it('renders plain text when content does not look like code', () => {
    render(
      <ToolResultCodeBlock
        toolName="other"
        content="Just a simple message"
      />
    );
    expect(screen.getByText('Just a simple message')).toBeInTheDocument();
  });

  it('renders shell output with command header', () => {
    render(
      <ToolResultCodeBlock
        toolName="developer__shell"
        toolArgs={{ command: 'ls -la' }}
        content="total 42\ndrwxr-xr-x 5 user"
      />
    );
    expect(screen.getByText('ls -la')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('renders code action bar for detected code', () => {
    render(
      <ToolResultCodeBlock
        toolName="developer__text_editor"
        toolArgs={{ path: '/src/app.ts' }}
        content="const x = 1;\nconst y = 2;"
      />
    );
    expect(screen.getByTestId('code-action-bar')).toBeInTheDocument();
  });

  it('detects file path from tool args', () => {
    render(
      <ToolResultCodeBlock
        toolName="developer__read_file"
        toolArgs={{ file_path: '/src/main.py' }}
        content="import os\nprint('hello')"
      />
    );
    expect(screen.getByTestId('code-action-bar')).toBeInTheDocument();
  });

  it('shows collapsed indicator for long content', () => {
    const longContent = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    render(
      <ToolResultCodeBlock
        toolName="developer__shell"
        toolArgs={{ command: 'test' }}
        content={longContent}
      />
    );
    expect(screen.getByText(/Click to expand 30 lines/)).toBeInTheDocument();
  });
});

describe('detectLanguageFromPath', () => {
  it('detects TypeScript', () => {
    expect(detectLanguageFromPath('app.ts')).toBe('typescript');
  });

  it('detects Python', () => {
    expect(detectLanguageFromPath('script.py')).toBe('python');
  });

  it('detects Rust', () => {
    expect(detectLanguageFromPath('main.rs')).toBe('rust');
  });

  it('returns undefined for unknown extension', () => {
    expect(detectLanguageFromPath('data.xyz')).toBeUndefined();
  });
});

describe('looksLikeCode', () => {
  it('identifies code with imports and functions', () => {
    const code = `import React from 'react';
const App = () => {
  return <div>Hello</div>;
};
export default App;`;
    expect(looksLikeCode(code)).toBe(true);
  });

  it('rejects plain text', () => {
    expect(looksLikeCode('Hello world')).toBe(false);
  });

  it('rejects content under 3 lines', () => {
    expect(looksLikeCode('import x\nfrom y')).toBe(false);
  });
});
