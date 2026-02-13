import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudioPipeline } from '../StudioPipeline';
import { PlanTab } from '../PlanTab';
import { CodeTab } from '../CodeTab';
import { TestTab } from '../TestTab';
import { BuildTab } from '../BuildTab';
import { DeployTab } from '../DeployTab';
import { MonitorTab } from '../MonitorTab';

// ═══════════════════════════════════════════════════════════════════
// StudioPipeline container tests
// ═══════════════════════════════════════════════════════════════════

describe('StudioPipeline', () => {
  it('renders the main container', () => {
    render(<StudioPipeline />);
    expect(screen.getByTestId('studio-pipeline')).toBeDefined();
  });

  it('renders all 6 tabs', () => {
    render(<StudioPipeline />);
    expect(screen.getByTestId('studio-tab-plan')).toBeDefined();
    expect(screen.getByTestId('studio-tab-code')).toBeDefined();
    expect(screen.getByTestId('studio-tab-test')).toBeDefined();
    expect(screen.getByTestId('studio-tab-build')).toBeDefined();
    expect(screen.getByTestId('studio-tab-deploy')).toBeDefined();
    expect(screen.getByTestId('studio-tab-monitor')).toBeDefined();
  });

  it('shows Plan tab content by default', () => {
    render(<StudioPipeline />);
    expect(screen.getByTestId('plan-tab')).toBeDefined();
  });

  it('switches to Code tab on click', () => {
    render(<StudioPipeline />);
    fireEvent.click(screen.getByTestId('studio-tab-code'));
    expect(screen.getByTestId('code-tab')).toBeDefined();
  });

  it('switches to Test tab on click', () => {
    render(<StudioPipeline />);
    fireEvent.click(screen.getByTestId('studio-tab-test'));
    expect(screen.getByTestId('test-tab')).toBeDefined();
  });

  it('switches to Build tab on click', () => {
    render(<StudioPipeline />);
    fireEvent.click(screen.getByTestId('studio-tab-build'));
    expect(screen.getByTestId('build-tab')).toBeDefined();
  });

  it('switches to Deploy tab on click', () => {
    render(<StudioPipeline />);
    fireEvent.click(screen.getByTestId('studio-tab-deploy'));
    expect(screen.getByTestId('deploy-tab')).toBeDefined();
  });

  it('switches to Monitor tab on click', () => {
    render(<StudioPipeline />);
    fireEvent.click(screen.getByTestId('studio-tab-monitor'));
    expect(screen.getByTestId('monitor-tab')).toBeDefined();
  });

  it('respects defaultTab prop', () => {
    render(<StudioPipeline defaultTab="build" />);
    expect(screen.getByTestId('build-tab')).toBeDefined();
  });

  it('shows tab status indicators when provided', () => {
    render(<StudioPipeline tabStatuses={{ plan: 'running', test: 'error' }} />);
    expect(screen.getByTestId('studio-tab-status-plan')).toBeDefined();
    expect(screen.getByTestId('studio-tab-status-test')).toBeDefined();
  });

  it('does not show status indicator for idle tabs', () => {
    render(<StudioPipeline tabStatuses={{ plan: 'idle' }} />);
    expect(screen.queryByTestId('studio-tab-status-plan')).toBeNull();
  });

  it('applies active class to selected tab', () => {
    render(<StudioPipeline />);
    const planTab = screen.getByTestId('studio-tab-plan');
    expect(planTab.className).toContain('active');

    fireEvent.click(screen.getByTestId('studio-tab-code'));
    expect(planTab.className).not.toContain('active');
    expect(screen.getByTestId('studio-tab-code').className).toContain('active');
  });

  it('has proper ARIA attributes', () => {
    render(<StudioPipeline />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toBeDefined();
  });

  it('passes props through to Plan tab', () => {
    render(<StudioPipeline plan={{ reasoning: 'Testing plan data', status: 'running' }} />);
    expect(screen.getByText('Testing plan data')).toBeDefined();
  });

  it('passes props through to Code tab', () => {
    render(
      <StudioPipeline
        defaultTab="code"
        code={{ changes: [{ file: 'test.ts', language: 'typescript', action: 'create' }] }}
      />
    );
    expect(screen.getByText('test.ts')).toBeDefined();
  });

  it('passes props through to Test tab', () => {
    render(
      <StudioPipeline
        defaultTab="test"
        test={{ summary: { total: 10, passed: 9, failed: 1, skipped: 0 } }}
      />
    );
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// PlanTab tests
// ═══════════════════════════════════════════════════════════════════

describe('PlanTab', () => {
  it('renders empty state when no data', () => {
    render(<PlanTab />);
    expect(screen.getByText(/No active plan/)).toBeDefined();
  });

  it('renders with idle status by default', () => {
    render(<PlanTab />);
    expect(screen.getByText('Idle')).toBeDefined();
  });

  it('renders running status', () => {
    render(<PlanTab status="running" />);
    expect(screen.getByText('Planning...')).toBeDefined();
  });

  it('renders success status', () => {
    render(<PlanTab status="success" />);
    expect(screen.getByText('Complete')).toBeDefined();
  });

  it('renders error status', () => {
    render(<PlanTab status="error" />);
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('shows reasoning text', () => {
    render(<PlanTab reasoning="Analyze the codebase for bugs" />);
    expect(screen.getByText('Analyze the codebase for bugs')).toBeDefined();
  });

  it('shows steps list', () => {
    render(<PlanTab steps={['Read files', 'Identify patterns', 'Generate fix']} />);
    expect(screen.getByText('Read files')).toBeDefined();
    expect(screen.getByText('Identify patterns')).toBeDefined();
    expect(screen.getByText('Generate fix')).toBeDefined();
    expect(screen.getByText('Steps')).toBeDefined();
  });

  it('renders steps as ordered list', () => {
    const { container } = render(<PlanTab steps={['Step 1', 'Step 2']} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeDefined();
    expect(ol).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CodeTab tests
// ═══════════════════════════════════════════════════════════════════

describe('CodeTab', () => {
  it('renders empty state when no data', () => {
    render(<CodeTab />);
    expect(screen.getByText(/No code changes/)).toBeDefined();
  });

  it('shows code changes', () => {
    render(<CodeTab changes={[{ file: 'src/app.ts', language: 'typescript', action: 'edit' }]} />);
    expect(screen.getByText('src/app.ts')).toBeDefined();
    expect(screen.getByText('typescript')).toBeDefined();
    expect(screen.getByText('EDIT')).toBeDefined();
  });

  it('shows NEW badge for create action', () => {
    render(<CodeTab changes={[{ file: 'new.ts', language: 'typescript', action: 'create' }]} />);
    expect(screen.getByText('NEW')).toBeDefined();
  });

  it('shows DEL badge for delete action', () => {
    render(<CodeTab changes={[{ file: 'old.ts', language: 'typescript', action: 'delete' }]} />);
    expect(screen.getByText('DEL')).toBeDefined();
  });

  it('renders diff when provided', () => {
    render(<CodeTab changes={[{ file: 'a.ts', language: 'ts', action: 'edit', diff: '+ added line' }]} />);
    expect(screen.getByText('+ added line')).toBeDefined();
  });

  it('shows active file in header', () => {
    render(<CodeTab activeFile="src/main.ts" />);
    expect(screen.getByText('src/main.ts')).toBeDefined();
  });

  it('shows generating status', () => {
    render(<CodeTab status="running" />);
    expect(screen.getByText('Generating...')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TestTab tests
// ═══════════════════════════════════════════════════════════════════

describe('TestTab', () => {
  it('renders empty state when no data', () => {
    render(<TestTab />);
    expect(screen.getByText(/No test results/)).toBeDefined();
  });

  it('shows summary bar', () => {
    render(<TestTab summary={{ total: 42, passed: 40, failed: 2, skipped: 0 }} />);
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('40')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows skipped count when non-zero', () => {
    render(<TestTab summary={{ total: 10, passed: 8, failed: 0, skipped: 2 }} />);
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('skipped')).toBeDefined();
  });

  it('renders test results list', () => {
    render(<TestTab results={[
      { name: 'should add numbers', passed: true, duration: 5 },
      { name: 'should handle errors', passed: false, duration: 12 },
    ]} />);
    expect(screen.getByText('should add numbers')).toBeDefined();
    expect(screen.getByText('should handle errors')).toBeDefined();
  });

  it('shows checkmark for passing tests', () => {
    render(<TestTab results={[{ name: 'passes', passed: true }]} />);
    expect(screen.getByText('\u2713')).toBeDefined();
  });

  it('shows X mark for failing tests', () => {
    render(<TestTab results={[{ name: 'fails', passed: false }]} />);
    expect(screen.getByText('\u2717')).toBeDefined();
  });

  it('shows test suite prefix when provided', () => {
    render(<TestTab results={[{ name: 'test1', suite: 'MathUtils', passed: true }]} />);
    expect(screen.getByText(/MathUtils/)).toBeDefined();
  });

  it('shows running status', () => {
    render(<TestTab status="running" />);
    expect(screen.getByText('Running tests...')).toBeDefined();
  });

  it('shows progress bar when summary provided', () => {
    const { container } = render(<TestTab summary={{ total: 10, passed: 8, failed: 2, skipped: 0 }} />);
    const progressBar = container.querySelector('.sg-progress-bar');
    expect(progressBar).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// BuildTab tests
// ═══════════════════════════════════════════════════════════════════

describe('BuildTab', () => {
  it('renders empty state when no data', () => {
    render(<BuildTab />);
    expect(screen.getByText(/No build activity/)).toBeDefined();
  });

  it('shows build command', () => {
    render(<BuildTab command="cargo build --release" />);
    expect(screen.getByText(/cargo build --release/)).toBeDefined();
  });

  it('shows build steps', () => {
    render(<BuildTab steps={[
      { name: 'Compile', status: 'success', duration: 3200 },
      { name: 'Link', status: 'running', duration: 500 },
    ]} />);
    expect(screen.getByText('Compile')).toBeDefined();
    expect(screen.getByText('Link')).toBeDefined();
    expect(screen.getByText('DONE')).toBeDefined();
    expect(screen.getByText('RUNNING')).toBeDefined();
  });

  it('shows step output when provided', () => {
    render(<BuildTab steps={[{ name: 'Test', status: 'error', output: 'assertion failed at line 42' }]} />);
    expect(screen.getByText('assertion failed at line 42')).toBeDefined();
  });

  it('shows raw output when no steps but output provided', () => {
    render(<BuildTab output="Building project..." />);
    expect(screen.getByText('Building project...')).toBeDefined();
  });

  it('shows building status', () => {
    render(<BuildTab status="running" />);
    expect(screen.getByText('Building...')).toBeDefined();
  });

  it('formats duration in seconds', () => {
    render(<BuildTab steps={[{ name: 'Step', status: 'success', duration: 3500 }]} />);
    expect(screen.getByText('3.5s')).toBeDefined();
  });

  it('formats duration in milliseconds for small values', () => {
    render(<BuildTab steps={[{ name: 'Step', status: 'success', duration: 120 }]} />);
    expect(screen.getByText('120ms')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// DeployTab tests
// ═══════════════════════════════════════════════════════════════════

describe('DeployTab', () => {
  it('renders empty state when no data', () => {
    render(<DeployTab />);
    expect(screen.getByText(/No deployments/)).toBeDefined();
  });

  it('shows deploy targets', () => {
    render(<DeployTab targets={[
      { name: 'Frontend', environment: 'staging', status: 'success' },
      { name: 'Backend', environment: 'production', status: 'running' },
    ]} />);
    expect(screen.getByText('Frontend')).toBeDefined();
    expect(screen.getByText('Backend')).toBeDefined();
    expect(screen.getByText('STAGING')).toBeDefined();
    expect(screen.getByText('PRODUCTION')).toBeDefined();
  });

  it('shows target URL when provided', () => {
    render(<DeployTab targets={[
      { name: 'App', environment: 'staging', status: 'success', url: 'https://staging.example.com' },
    ]} />);
    expect(screen.getByText('https://staging.example.com')).toBeDefined();
  });

  it('shows current environment badge', () => {
    render(<DeployTab currentEnvironment="production" />);
    expect(screen.getByText('PRODUCTION')).toBeDefined();
  });

  it('shows deploying status', () => {
    render(<DeployTab status="running" />);
    expect(screen.getByText('Deploying...')).toBeDefined();
  });

  it('shows deployed status on success', () => {
    render(<DeployTab status="success" />);
    expect(screen.getByText('Deployed')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// MonitorTab tests
// ═══════════════════════════════════════════════════════════════════

describe('MonitorTab', () => {
  it('renders empty state when no data', () => {
    render(<MonitorTab />);
    expect(screen.getByText(/No monitoring data/)).toBeDefined();
  });

  it('shows health metrics grid', () => {
    render(<MonitorTab metrics={[
      { label: 'CPU', value: '42', status: 'success', unit: '%' },
      { label: 'Memory', value: '1.2', status: 'running', unit: 'GB' },
    ]} />);
    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('%')).toBeDefined();
    expect(screen.getByText('Memory')).toBeDefined();
    expect(screen.getByText('1.2')).toBeDefined();
    expect(screen.getByText('GB')).toBeDefined();
  });

  it('shows log entries', () => {
    const now = Date.now();
    render(<MonitorTab logs={[
      { timestamp: now, level: 'info', message: 'Server started' },
      { timestamp: now + 1000, level: 'error', message: 'Connection timeout' },
    ]} />);
    expect(screen.getByText('Server started')).toBeDefined();
    expect(screen.getByText('Connection timeout')).toBeDefined();
    expect(screen.getByText('INFO')).toBeDefined();
    expect(screen.getByText('ERROR')).toBeDefined();
  });

  it('shows uptime when provided', () => {
    render(<MonitorTab uptime={125000} metrics={[{ label: 'CPU', value: '10', status: 'success' }]} />);
    expect(screen.getByText('Uptime: 2m 5s')).toBeDefined();
  });

  it('shows offline status by default', () => {
    render(<MonitorTab />);
    expect(screen.getByText('Offline')).toBeDefined();
  });

  it('shows healthy status on success', () => {
    render(<MonitorTab status="success" />);
    expect(screen.getByText('Healthy')).toBeDefined();
  });

  it('shows monitoring status when running', () => {
    render(<MonitorTab status="running" />);
    expect(screen.getByText('Monitoring...')).toBeDefined();
  });

  it('shows issues status on error', () => {
    render(<MonitorTab status="error" />);
    expect(screen.getByText('Issues detected')).toBeDefined();
  });

  it('renders logs section header', () => {
    const now = Date.now();
    render(<MonitorTab logs={[{ timestamp: now, level: 'info', message: 'test' }]} />);
    expect(screen.getByText('Logs')).toBeDefined();
  });
});
