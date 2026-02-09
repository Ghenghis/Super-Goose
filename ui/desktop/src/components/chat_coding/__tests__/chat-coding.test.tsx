/**
 * Unit tests for chat_coding components
 * Tests barrel exports, pure utility functions, and component rendering
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// ============================================================================
// Mock ALL external dependencies before component imports
// ============================================================================

// Mock lucide-react using importOriginal to preserve exports
vi.mock(import('lucide-react'), async (importOriginal) => {
  const actual = await importOriginal();
  const Icon = React.forwardRef((props: any, ref: any) =>
    React.createElement('span', { ...props, ref, 'data-testid': 'mock-icon' })
  );
  // Override every export with a mock icon component
  const mocked: Record<string, any> = {};
  const actualObj = actual as Record<string, unknown>;
  for (const key of Object.keys(actualObj)) {
    mocked[key] = typeof actualObj[key] === 'function' ? Icon : actualObj[key];
  }
  return mocked;
});

vi.mock('react-syntax-highlighter', () => ({
  Prism: (props: any) => React.createElement('pre', { 'data-testid': 'syntax-hl' }, props.children),
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: (props: any) => React.createElement('div', null, props.children),
  BarChart: (props: any) => React.createElement('div', null, props.children),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: (props: any) => React.createElement('div', null, props.children),
  Pie: () => null,
  Cell: () => null,
  LineChart: (props: any) => React.createElement('div', null, props.children),
  Line: () => null,
  AreaChart: (props: any) => React.createElement('div', null, props.children),
  Area: () => null,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}));

// ============================================================================
// Tests
// ============================================================================

describe('chat_coding barrel exports', () => {
  it('exports all Phase 1 core code components', async () => {
    const mod = await import('../index');
    expect(mod.EnhancedCodeBlock).toBeDefined();
    expect(mod.DiffCard).toBeDefined();
    expect(mod.parseDiffText).toBeDefined();
    expect(mod.TaskCard).toBeDefined();
    expect(mod.TaskCardGroup).toBeDefined();
    expect(mod.FileChangeGroup).toBeDefined();
    expect(mod.CodeActionBar).toBeDefined();
    expect(mod.LANGUAGE_META).toBeDefined();
    expect(mod.ToolResultCodeBlock).toBeDefined();
    expect(mod.detectLanguageFromPath).toBeDefined();
    expect(mod.looksLikeCode).toBeDefined();
  });

  it('exports all Phase 2 navigation components', async () => {
    const mod = await import('../index');
    expect(mod.CodeSearch).toBeDefined();
    expect(mod.findMatches).toBeDefined();
    expect(mod.CodeMinimap).toBeDefined();
    expect(mod.BreadcrumbPath).toBeDefined();
  });

  it('exports all Phase 3 thinking & media components', async () => {
    const mod = await import('../index');
    expect(mod.ThinkingBlock).toBeDefined();
    expect(mod.ImagePreviewCard).toBeDefined();
    expect(mod.AudioPlayer).toBeDefined();
    expect(mod.ContentTypeIndicator).toBeDefined();
  });

  it('exports all Phase 4 multi-agent components', async () => {
    const mod = await import('../index');
    expect(mod.SwarmOverview).toBeDefined();
    expect(mod.SubagentTrace).toBeDefined();
    expect(mod.AgentCommunication).toBeDefined();
    expect(mod.SwarmProgress).toBeDefined();
  });

  it('exports all Phase 5 task & workflow components', async () => {
    const mod = await import('../index');
    expect(mod.TaskGraph).toBeDefined();
    expect(mod.BatchProgress).toBeDefined();
    expect(mod.SkillCard).toBeDefined();
    expect(mod.CompactionIndicator).toBeDefined();
    expect(mod.BatchProgressPanel).toBeDefined();
  });

  it('exports all Phase 6 diagram & chart components', async () => {
    const mod = await import('../index');
    expect(mod.MermaidDiagram).toBeDefined();
    expect(mod.detectContentType).toBeDefined();
    expect(mod.RechartsWrapper).toBeDefined();
  });
});

describe('parseDiffText utility', () => {
  it('parses unified diff format', async () => {
    const { parseDiffText } = await import('../DiffCard');
    const diffText = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 context line
-old line
+new line`;
    const result = parseDiffText(diffText);
    expect(result.filePath).toBe('file.ts');
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some(l => l.type === 'add')).toBe(true);
    expect(result.lines.some(l => l.type === 'remove')).toBe(true);
    expect(result.lines.some(l => l.type === 'context')).toBe(true);
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
  });

  it('handles empty diff text', async () => {
    const { parseDiffText } = await import('../DiffCard');
    const result = parseDiffText('');
    expect(result).toBeDefined();
    expect(result.filePath).toBe('');
    expect(Array.isArray(result.lines)).toBe(true);
  });
});

describe('detectContentType utility', () => {
  it('detects TypeScript/React files', async () => {
    const { detectContentType } = await import('../ContentTypeIndicator');
    const result = detectContentType('component.tsx');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('detects CSS files', async () => {
    const { detectContentType } = await import('../ContentTypeIndicator');
    const result = detectContentType('styles.css');
    expect(result).toBeDefined();
  });

  it('detects JSON files', async () => {
    const { detectContentType } = await import('../ContentTypeIndicator');
    const result = detectContentType('config.json');
    expect(result).toBeDefined();
  });

  it('detects Python files', async () => {
    const { detectContentType } = await import('../ContentTypeIndicator');
    const result = detectContentType('script.py');
    expect(result).toBeDefined();
  });
});

describe('detectLanguageFromPath utility', () => {
  it('detects language from file extension', async () => {
    const { detectLanguageFromPath } = await import('../ToolResultCodeBlock');
    expect(detectLanguageFromPath('file.ts')).toBe('typescript');
    expect(detectLanguageFromPath('file.tsx')).toBe('tsx');
    expect(detectLanguageFromPath('file.py')).toBe('python');
    expect(detectLanguageFromPath('file.js')).toBe('javascript');
  });
});

describe('looksLikeCode utility', () => {
  it('identifies code-like content', async () => {
    const { looksLikeCode } = await import('../ToolResultCodeBlock');
    // looksLikeCode requires >= 3 lines and code indicators
    const codeContent = `import React from 'react';
const App = () => {
  return <div>Hello</div>;
};
export default App;`;
    expect(looksLikeCode(codeContent)).toBe(true);
  });

  it('identifies non-code content', async () => {
    const { looksLikeCode } = await import('../ToolResultCodeBlock');
    expect(looksLikeCode('Hello, how are you today?')).toBe(false);
  });
});

describe('findMatches utility', () => {
  it('finds text matches in content', async () => {
    const { findMatches } = await import('../CodeSearch');
    const content = 'Hello world\nfoo bar\nHello again';
    const matches = findMatches(content, 'Hello', false);
    expect(matches.length).toBe(2);
  });

  it('returns empty for no matches', async () => {
    const { findMatches } = await import('../CodeSearch');
    const content = 'Hello world';
    const matches = findMatches(content, 'xyz', false);
    expect(matches.length).toBe(0);
  });
});

describe('Component rendering', () => {
  it('ThinkingBlock renders without crashing', async () => {
    const { render } = await import('@testing-library/react');
    const mod = await import('../ThinkingBlock');
    const ThinkingBlock = mod.default;
    const { container } = render(
      React.createElement(ThinkingBlock, { content: 'Test thinking' })
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('CompactionIndicator renders compacting state', async () => {
    const { render } = await import('@testing-library/react');
    const mod = await import('../CompactionIndicator');
    const CompactionIndicator = mod.CompactionIndicator;
    const { container } = render(
      React.createElement(CompactionIndicator, { isCompacting: true })
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('DiffCard renders with lines', async () => {
    const { render } = await import('@testing-library/react');
    const mod = await import('../DiffCard');
    const DiffCard = mod.default;
    const lines = [
      { type: 'context' as const, content: 'line', oldLineNum: 1, newLineNum: 1 },
    ];
    const { container } = render(
      React.createElement(DiffCard, {
        filePath: 'test.ts',
        status: 'modified' as const,
        additions: 0,
        deletions: 0,
        lines,
      })
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('ImagePreviewCard renders with src', async () => {
    const { render } = await import('@testing-library/react');
    const mod = await import('../ImagePreviewCard');
    const ImagePreviewCard = mod.default;
    const { container } = render(
      React.createElement(ImagePreviewCard, {
        src: 'https://example.com/img.png',
        alt: 'test',
      })
    );
    expect(container.firstChild).toBeTruthy();
  });
});
