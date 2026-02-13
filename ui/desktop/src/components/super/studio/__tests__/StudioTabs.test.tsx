import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanTab } from '../PlanTab';
import { CodeTab } from '../CodeTab';
import { TestTab } from '../TestTab';
import { BuildTab } from '../BuildTab';
import { DeployTab } from '../DeployTab';
import { MonitorTab } from '../MonitorTab';

// ═══════════════════════════════════════════════════════════════════
// PlanTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('PlanTab', () => {
  it('renders the plan-tab test id container', () => {
    const { container } = render(<PlanTab />);
    const root = container.querySelector('[data-testid="plan-tab"]');
    expect(root).not.toBeNull();
  });

  it('shows empty state when steps is an empty array', () => {
    render(<PlanTab steps={[]} />);
    expect(screen.getByText(/No active plan/)).toBeDefined();
  });

  it('shows reasoning without steps', () => {
    render(<PlanTab reasoning="Analyzing files" />);
    expect(screen.getByText('Analyzing files')).toBeDefined();
    expect(screen.queryByText('Steps')).toBeNull();
  });

  it('shows both reasoning and steps simultaneously', () => {
    render(<PlanTab reasoning="Main reasoning" steps={['Step A', 'Step B']} />);
    expect(screen.getByText('Main reasoning')).toBeDefined();
    expect(screen.getByText('Steps')).toBeDefined();
    expect(screen.getByText('Step A')).toBeDefined();
    expect(screen.getByText('Step B')).toBeDefined();
  });

  it('renders correct number of list items for steps', () => {
    const { container } = render(<PlanTab steps={['One', 'Two', 'Three', 'Four']} />);
    const items = container.querySelectorAll('ol > li');
    expect(items.length).toBe(4);
  });

  it('displays status-dot element for each status', () => {
    const { container: c1 } = render(<PlanTab status="idle" />);
    expect(c1.querySelector('.sg-status-dot')).not.toBeNull();

    const { container: c2 } = render(<PlanTab status="running" />);
    expect(c2.querySelector('.sg-status-dot')).not.toBeNull();

    const { container: c3 } = render(<PlanTab status="success" />);
    expect(c3.querySelector('.sg-status-dot')).not.toBeNull();

    const { container: c4 } = render(<PlanTab status="error" />);
    expect(c4.querySelector('.sg-status-dot')).not.toBeNull();
  });

  it('hides empty-state card when reasoning is provided', () => {
    render(<PlanTab reasoning="Some reasoning" />);
    expect(screen.queryByText(/No active plan/)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CodeTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('CodeTab', () => {
  it('renders the code-tab test id container', () => {
    const { container } = render(<CodeTab />);
    const root = container.querySelector('[data-testid="code-tab"]');
    expect(root).not.toBeNull();
  });

  it('shows empty state when changes is an empty array', () => {
    render(<CodeTab changes={[]} />);
    expect(screen.getByText(/No code changes/)).toBeDefined();
  });

  it('renders multiple code changes', () => {
    render(
      <CodeTab
        changes={[
          { file: 'a.ts', language: 'typescript', action: 'create' },
          { file: 'b.rs', language: 'rust', action: 'edit' },
          { file: 'c.py', language: 'python', action: 'delete' },
        ]}
      />
    );
    expect(screen.getByText('a.ts')).toBeDefined();
    expect(screen.getByText('b.rs')).toBeDefined();
    expect(screen.getByText('c.py')).toBeDefined();
    expect(screen.getByText('NEW')).toBeDefined();
    expect(screen.getByText('EDIT')).toBeDefined();
    expect(screen.getByText('DEL')).toBeDefined();
  });

  it('renders diff in a pre element', () => {
    const { container } = render(
      <CodeTab changes={[{ file: 'x.ts', language: 'ts', action: 'edit', diff: '+ new line\n- old line' }]} />
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('+ new line');
    expect(pre!.textContent).toContain('- old line');
  });

  it('does not render pre element when diff is absent', () => {
    const { container } = render(
      <CodeTab changes={[{ file: 'x.ts', language: 'ts', action: 'create' }]} />
    );
    const pre = container.querySelector('pre');
    expect(pre).toBeNull();
  });

  it('shows language label for each change', () => {
    render(
      <CodeTab changes={[{ file: 'f.rs', language: 'rust', action: 'edit' }]} />
    );
    expect(screen.getByText('rust')).toBeDefined();
  });

  it('renders complete status label', () => {
    render(<CodeTab status="success" />);
    expect(screen.getByText('Complete')).toBeDefined();
  });

  it('renders error status label', () => {
    render(<CodeTab status="error" />);
    expect(screen.getByText('Error')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TestTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('TestTab', () => {
  it('renders the test-tab test id container', () => {
    const { container } = render(<TestTab />);
    const root = container.querySelector('[data-testid="test-tab"]');
    expect(root).not.toBeNull();
  });

  it('does not show skipped count when zero', () => {
    render(<TestTab summary={{ total: 5, passed: 5, failed: 0, skipped: 0 }} />);
    expect(screen.queryByText('skipped')).toBeNull();
  });

  it('renders test result durations', () => {
    render(
      <TestTab
        results={[
          { name: 'fast test', passed: true, duration: 3 },
          { name: 'slow test', passed: true, duration: 250 },
        ]}
      />
    );
    expect(screen.getByText('3ms')).toBeDefined();
    expect(screen.getByText('250ms')).toBeDefined();
  });

  it('does not show duration when not provided', () => {
    render(<TestTab results={[{ name: 'no-duration', passed: true }]} />);
    // The name should render but no "ms" text should appear
    expect(screen.getByText('no-duration')).toBeDefined();
    expect(screen.queryByText(/ms$/)).toBeNull();
  });

  it('renders both checkmarks and X marks in mixed results', () => {
    render(
      <TestTab
        results={[
          { name: 'pass1', passed: true },
          { name: 'fail1', passed: false },
          { name: 'pass2', passed: true },
        ]}
      />
    );
    const checks = screen.getAllByText('\u2713');
    const crosses = screen.getAllByText('\u2717');
    expect(checks.length).toBe(2);
    expect(crosses.length).toBe(1);
  });

  it('renders progress bar with green when no failures', () => {
    const { container } = render(
      <TestTab summary={{ total: 10, passed: 10, failed: 0, skipped: 0 }} />
    );
    const bar = container.querySelector('.sg-progress-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.width).toBe('100%');
  });

  it('does not render progress bar when total is zero', () => {
    const { container } = render(
      <TestTab summary={{ total: 0, passed: 0, failed: 0, skipped: 0 }} />
    );
    const bar = container.querySelector('.sg-progress-bar');
    expect(bar).toBeNull();
  });

  it('shows All passed status on success', () => {
    render(<TestTab status="success" />);
    expect(screen.getByText('All passed')).toBeDefined();
  });

  it('shows Failures detected status on error', () => {
    render(<TestTab status="error" />);
    expect(screen.getByText('Failures detected')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// BuildTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('BuildTab', () => {
  it('renders the build-tab test id container', () => {
    const { container } = render(<BuildTab />);
    const root = container.querySelector('[data-testid="build-tab"]');
    expect(root).not.toBeNull();
  });

  it('shows build command with dollar sign prefix', () => {
    render(<BuildTab command="npm run build" />);
    expect(screen.getByText('$')).toBeDefined();
    expect(screen.getByText(/npm run build/)).toBeDefined();
  });

  it('renders PENDING badge for idle steps', () => {
    render(<BuildTab steps={[{ name: 'Lint', status: 'idle' }]} />);
    expect(screen.getByText('PENDING')).toBeDefined();
  });

  it('renders FAIL badge for error steps', () => {
    render(<BuildTab steps={[{ name: 'Compile', status: 'error' }]} />);
    expect(screen.getByText('FAIL')).toBeDefined();
  });

  it('renders step output in a pre element', () => {
    const { container } = render(
      <BuildTab steps={[{ name: 'Compile', status: 'error', output: 'error: type mismatch' }]} />
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('error: type mismatch');
  });

  it('shows raw output in pre when no steps provided', () => {
    const { container } = render(<BuildTab output="Compiling 42 crates..." />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('Compiling 42 crates...');
  });

  it('shows success status label', () => {
    render(<BuildTab status="success" />);
    expect(screen.getByText('Build succeeded')).toBeDefined();
  });

  it('shows failed status label', () => {
    render(<BuildTab status="error" />);
    expect(screen.getByText('Build failed')).toBeDefined();
  });

  it('renders multiple build steps with different statuses', () => {
    render(
      <BuildTab
        steps={[
          { name: 'Install deps', status: 'success', duration: 800 },
          { name: 'Compile', status: 'success', duration: 2400 },
          { name: 'Bundle', status: 'running', duration: 100 },
          { name: 'Optimize', status: 'idle' },
        ]}
      />
    );
    expect(screen.getByText('Install deps')).toBeDefined();
    expect(screen.getByText('Compile')).toBeDefined();
    expect(screen.getByText('Bundle')).toBeDefined();
    expect(screen.getByText('Optimize')).toBeDefined();
    expect(screen.getByText('800ms')).toBeDefined();
    expect(screen.getByText('2.4s')).toBeDefined();
    expect(screen.getByText('100ms')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// DeployTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('DeployTab', () => {
  it('renders the deploy-tab test id container', () => {
    const { container } = render(<DeployTab />);
    const root = container.querySelector('[data-testid="deploy-tab"]');
    expect(root).not.toBeNull();
  });

  it('shows empty state with empty targets array', () => {
    render(<DeployTab targets={[]} />);
    expect(screen.getByText(/No deployments/)).toBeDefined();
  });

  it('renders deploy target with status dot', () => {
    const { container } = render(
      <DeployTab targets={[{ name: 'API', environment: 'production', status: 'success' }]} />
    );
    const dots = container.querySelectorAll('.sg-status-dot');
    // One for the tab-level status, one for the target
    expect(dots.length).toBe(2);
  });

  it('renders environment badge in uppercase', () => {
    render(
      <DeployTab targets={[{ name: 'Web', environment: 'development', status: 'idle' }]} />
    );
    expect(screen.getByText('DEVELOPMENT')).toBeDefined();
  });

  it('renders timestamp when provided', () => {
    // Use a fixed timestamp to avoid locale issues
    const ts = new Date('2026-01-15T14:30:00Z').getTime();
    render(
      <DeployTab targets={[{ name: 'App', environment: 'staging', status: 'success', timestamp: ts }]} />
    );
    // The exact text depends on locale, but the element should exist
    const tabEl = screen.getByTestId('deploy-tab');
    expect(tabEl.textContent).toContain(':');
  });

  it('shows deploy failed status label', () => {
    render(<DeployTab status="error" />);
    expect(screen.getByText('Deploy failed')).toBeDefined();
  });

  it('shows idle status label', () => {
    render(<DeployTab status="idle" />);
    expect(screen.getByText('Idle')).toBeDefined();
  });

  it('renders multiple deploy targets', () => {
    render(
      <DeployTab
        targets={[
          { name: 'Frontend', environment: 'staging', status: 'success' },
          { name: 'Backend', environment: 'staging', status: 'success' },
          { name: 'Worker', environment: 'production', status: 'running' },
        ]}
      />
    );
    expect(screen.getByText('Frontend')).toBeDefined();
    expect(screen.getByText('Backend')).toBeDefined();
    expect(screen.getByText('Worker')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// MonitorTab — additional coverage
// ═══════════════════════════════════════════════════════════════════

describe('MonitorTab', () => {
  it('renders the monitor-tab test id container', () => {
    const { container } = render(<MonitorTab />);
    const root = container.querySelector('[data-testid="monitor-tab"]');
    expect(root).not.toBeNull();
  });

  it('shows empty state with empty metrics and no logs', () => {
    render(<MonitorTab metrics={[]} logs={[]} />);
    expect(screen.getByText(/No monitoring data/)).toBeDefined();
  });

  it('formats uptime in seconds when under a minute', () => {
    render(
      <MonitorTab uptime={45000} metrics={[{ label: 'CPU', value: '5', status: 'success' }]} />
    );
    expect(screen.getByText('Uptime: 45s')).toBeDefined();
  });

  it('formats uptime in hours and minutes', () => {
    // 2 hours and 15 minutes = 2*3600*1000 + 15*60*1000 = 8_100_000
    render(
      <MonitorTab uptime={8_100_000} metrics={[{ label: 'CPU', value: '5', status: 'success' }]} />
    );
    expect(screen.getByText('Uptime: 2h 15m')).toBeDefined();
  });

  it('renders metric unit when provided', () => {
    render(
      <MonitorTab metrics={[{ label: 'Latency', value: '42', status: 'success', unit: 'ms' }]} />
    );
    expect(screen.getByText('ms')).toBeDefined();
  });

  it('does not render unit when not provided', () => {
    render(
      <MonitorTab metrics={[{ label: 'Requests', value: '1200', status: 'success' }]} />
    );
    expect(screen.getByText('Requests')).toBeDefined();
    expect(screen.getByText('1200')).toBeDefined();
  });

  it('renders log level labels in uppercase', () => {
    const now = Date.now();
    render(
      <MonitorTab
        logs={[
          { timestamp: now, level: 'info', message: 'info msg' },
          { timestamp: now, level: 'warn', message: 'warn msg' },
          { timestamp: now, level: 'error', message: 'err msg' },
        ]}
      />
    );
    expect(screen.getByText('INFO')).toBeDefined();
    expect(screen.getByText('WARN')).toBeDefined();
    expect(screen.getByText('ERROR')).toBeDefined();
  });

  it('renders Logs section header when logs are present', () => {
    const now = Date.now();
    render(
      <MonitorTab logs={[{ timestamp: now, level: 'info', message: 'hello' }]} />
    );
    expect(screen.getByText('Logs')).toBeDefined();
  });

  it('renders metrics grid with correct count', () => {
    const { container } = render(
      <MonitorTab
        metrics={[
          { label: 'CPU', value: '10', status: 'success' },
          { label: 'Mem', value: '2', status: 'success' },
          { label: 'Disk', value: '50', status: 'running' },
        ]}
      />
    );
    // Each metric is in an sg-card inside the grid
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    const cards = grid!.querySelectorAll('.sg-card');
    expect(cards.length).toBe(3);
  });

  it('shows content when only logs are provided (no metrics)', () => {
    const now = Date.now();
    render(
      <MonitorTab logs={[{ timestamp: now, level: 'info', message: 'log only' }]} />
    );
    expect(screen.getByText('log only')).toBeDefined();
    expect(screen.queryByText(/No monitoring data/)).toBeNull();
  });

  it('shows content when only metrics are provided (no logs)', () => {
    render(
      <MonitorTab metrics={[{ label: 'Disk', value: '80', status: 'error', unit: '%' }]} />
    );
    expect(screen.getByText('Disk')).toBeDefined();
    expect(screen.queryByText('Logs')).toBeNull();
    expect(screen.queryByText(/No monitoring data/)).toBeNull();
  });
});
