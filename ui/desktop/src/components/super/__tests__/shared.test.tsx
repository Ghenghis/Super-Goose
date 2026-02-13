import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SGCard, SGBadge, SGMetricCard, SGEmptyState, SGStatusDot } from '../shared';

// ---------------------------------------------------------------------------
// SGCard
// ---------------------------------------------------------------------------
describe('SGCard', () => {
  it('renders children inside sg-card', () => {
    render(<SGCard>Card content here</SGCard>);
    expect(screen.getByText('Card content here')).toBeDefined();
  });

  it('applies additional className', () => {
    const { container } = render(<SGCard className="extra-class">Test</SGCard>);
    const card = container.querySelector('.sg-card.extra-class');
    expect(card).not.toBeNull();
  });

  it('passes through style prop', () => {
    const { container } = render(<SGCard style={{ padding: '2rem' }}>Styled</SGCard>);
    const card = container.querySelector('.sg-card') as HTMLElement;
    expect(card.style.padding).toBe('2rem');
  });

  it('renders as a div element', () => {
    const { container } = render(<SGCard>Div check</SGCard>);
    const card = container.querySelector('.sg-card');
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe('DIV');
  });

  it('always has the sg-card base class even without extra className', () => {
    const { container } = render(<SGCard>Base only</SGCard>);
    const card = container.querySelector('.sg-card');
    expect(card).not.toBeNull();
    expect(card!.className).toContain('sg-card');
  });

  it('renders JSX children, not only text', () => {
    render(
      <SGCard>
        <span data-testid="inner-span">Nested</span>
      </SGCard>
    );
    expect(screen.getByTestId('inner-span')).toBeDefined();
    expect(screen.getByText('Nested')).toBeDefined();
  });

  it('handles empty string className gracefully', () => {
    const { container } = render(<SGCard className="">Content</SGCard>);
    const card = container.querySelector('.sg-card');
    expect(card).not.toBeNull();
  });

  it('applies multiple style properties', () => {
    const { container } = render(
      <SGCard style={{ margin: '1rem', background: 'red' }}>Multi-style</SGCard>
    );
    const card = container.querySelector('.sg-card') as HTMLElement;
    expect(card.style.margin).toBe('1rem');
    expect(card.style.background).toBe('red');
  });

  it('renders without style prop', () => {
    const { container } = render(<SGCard>No style</SGCard>);
    const card = container.querySelector('.sg-card') as HTMLElement;
    // style attribute should be empty / not set
    expect(card.style.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SGBadge
// ---------------------------------------------------------------------------
describe('SGBadge', () => {
  it('renders children text', () => {
    render(<SGBadge variant="gold">Golden</SGBadge>);
    expect(screen.getByText('Golden')).toBeDefined();
  });

  it('always has the sg-badge base class', () => {
    const { container } = render(<SGBadge variant="gold">Base</SGBadge>);
    const badge = container.querySelector('.sg-badge');
    expect(badge).not.toBeNull();
  });

  it('renders as a span element', () => {
    const { container } = render(<SGBadge variant="gold">Span</SGBadge>);
    const badge = container.querySelector('.sg-badge');
    expect(badge).not.toBeNull();
    expect(badge!.tagName).toBe('SPAN');
  });

  it('applies gold variant correctly', () => {
    const { container } = render(<SGBadge variant="gold">Gold</SGBadge>);
    const badge = container.querySelector('.sg-badge-gold');
    expect(badge).not.toBeNull();
  });

  it('applies emerald variant correctly', () => {
    const { container } = render(<SGBadge variant="emerald">Status</SGBadge>);
    const badge = container.querySelector('.sg-badge-emerald');
    expect(badge).not.toBeNull();
  });

  it('applies indigo variant correctly', () => {
    const { container } = render(<SGBadge variant="indigo">Indigo</SGBadge>);
    const badge = container.querySelector('.sg-badge-indigo');
    expect(badge).not.toBeNull();
  });

  it('applies red variant correctly', () => {
    const { container } = render(<SGBadge variant="red">Error</SGBadge>);
    const badge = container.querySelector('.sg-badge-red');
    expect(badge).not.toBeNull();
  });

  it('applies violet variant correctly', () => {
    const { container } = render(<SGBadge variant="violet">Violet</SGBadge>);
    const badge = container.querySelector('.sg-badge-violet');
    expect(badge).not.toBeNull();
  });

  it('applies sky variant correctly', () => {
    const { container } = render(<SGBadge variant="sky">Sky</SGBadge>);
    const badge = container.querySelector('.sg-badge-sky');
    expect(badge).not.toBeNull();
  });

  it('applies amber variant correctly', () => {
    const { container } = render(<SGBadge variant="amber">Amber</SGBadge>);
    const badge = container.querySelector('.sg-badge-amber');
    expect(badge).not.toBeNull();
  });

  it('applies custom className alongside variant', () => {
    const { container } = render(
      <SGBadge variant="gold" className="custom-badge">Custom</SGBadge>
    );
    const badge = container.querySelector('.sg-badge.sg-badge-gold.custom-badge');
    expect(badge).not.toBeNull();
  });

  it('handles empty string className gracefully', () => {
    const { container } = render(
      <SGBadge variant="emerald" className="">EmptyClass</SGBadge>
    );
    const badge = container.querySelector('.sg-badge.sg-badge-emerald');
    expect(badge).not.toBeNull();
  });

  it('renders JSX children', () => {
    render(
      <SGBadge variant="indigo">
        <strong data-testid="bold-child">Bold</strong>
      </SGBadge>
    );
    expect(screen.getByTestId('bold-child')).toBeDefined();
  });

  it('has both base and variant classes in className', () => {
    const { container } = render(<SGBadge variant="red">Check</SGBadge>);
    const badge = container.querySelector('.sg-badge') as HTMLElement;
    expect(badge.className).toContain('sg-badge');
    expect(badge.className).toContain('sg-badge-red');
  });
});

// ---------------------------------------------------------------------------
// SGStatusDot
// ---------------------------------------------------------------------------
describe('SGStatusDot', () => {
  it('shows Connected label by default when connected', () => {
    render(<SGStatusDot status="connected" />);
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows Disconnected label by default when disconnected', () => {
    render(<SGStatusDot status="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('shows Idle label by default when idle', () => {
    render(<SGStatusDot status="idle" />);
    expect(screen.getByText('Idle')).toBeDefined();
  });

  it('shows Error label by default when error', () => {
    render(<SGStatusDot status="error" />);
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('uses custom label when provided', () => {
    render(<SGStatusDot status="connected" label="Active" />);
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('custom label replaces default label for connected', () => {
    const { container } = render(<SGStatusDot status="connected" label="Online" />);
    expect(screen.getByText('Online')).toBeDefined();
    expect(container.textContent).not.toContain('Connected');
  });

  it('custom label replaces default label for error', () => {
    const { container } = render(<SGStatusDot status="error" label="Failed" />);
    expect(screen.getByText('Failed')).toBeDefined();
    expect(container.textContent).not.toContain('Error');
  });

  it('renders the active CSS class for connected status', () => {
    const { container } = render(<SGStatusDot status="connected" />);
    const dot = container.querySelector('.sg-status-active');
    expect(dot).not.toBeNull();
  });

  it('renders the idle CSS class for disconnected status', () => {
    const { container } = render(<SGStatusDot status="disconnected" />);
    const dot = container.querySelector('.sg-status-idle');
    expect(dot).not.toBeNull();
  });

  it('renders the idle CSS class for idle status', () => {
    const { container } = render(<SGStatusDot status="idle" />);
    const dot = container.querySelector('.sg-status-idle');
    expect(dot).not.toBeNull();
  });

  it('renders the error CSS class for error status', () => {
    const { container } = render(<SGStatusDot status="error" />);
    const dot = container.querySelector('.sg-status-error');
    expect(dot).not.toBeNull();
  });

  it('dot element always has sg-status-dot base class', () => {
    const { container } = render(<SGStatusDot status="connected" />);
    const dot = container.querySelector('.sg-status-dot');
    expect(dot).not.toBeNull();
  });

  it('outer wrapper is an inline-flex span', () => {
    const { container } = render(<SGStatusDot status="connected" />);
    const wrapper = container.querySelector('.inline-flex.items-center.gap-1\\.5');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.tagName).toBe('SPAN');
  });

  it('renders exactly two child spans inside the wrapper', () => {
    const { container } = render(<SGStatusDot status="connected" />);
    const wrapper = container.firstElementChild as HTMLElement;
    // wrapper itself is a span, plus 2 children = 3 total
    // but direct children should be 2
    expect(wrapper.children.length).toBe(2);
  });

  it('label span uses sg-text-3 color variable', () => {
    const { container } = render(<SGStatusDot status="idle" />);
    const labelSpan = container.querySelector('.inline-flex > span:last-child') as HTMLElement;
    expect(labelSpan.style.color).toBe('var(--sg-text-3)');
  });

  it('uses empty string label when provided', () => {
    const { container } = render(<SGStatusDot status="connected" label="" />);
    // Empty string label should still render, replacing the default
    expect(container.textContent).not.toContain('Connected');
  });
});

// ---------------------------------------------------------------------------
// SGMetricCard
// ---------------------------------------------------------------------------
describe('SGMetricCard', () => {
  it('displays the label', () => {
    render(<SGMetricCard label="Active Agents" value="5" />);
    expect(screen.getByText('Active Agents')).toBeDefined();
  });

  it('displays the value', () => {
    render(<SGMetricCard label="Cost" value="$1.23" />);
    expect(screen.getByText('$1.23')).toBeDefined();
  });

  it('wraps in a div with sg-card class', () => {
    const { container } = render(<SGMetricCard label="Wrap" value="1" />);
    const card = container.querySelector('.sg-card');
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe('DIV');
  });

  it('applies default color var(--sg-text-1) when no color prop', () => {
    const { container } = render(<SGMetricCard label="Default Color" value="99" />);
    const valueEl = container.querySelector('.text-2xl') as HTMLElement;
    expect(valueEl.style.color).toBe('var(--sg-text-1)');
  });

  it('applies custom color to the value', () => {
    const { container } = render(<SGMetricCard label="Test" value="42" color="var(--sg-gold)" />);
    const valueEl = container.querySelector('.text-2xl') as HTMLElement;
    expect(valueEl.style.color).toBe('var(--sg-gold)');
  });

  it('shows up trend arrow', () => {
    render(<SGMetricCard label="Rate" value="95%" trend="up" />);
    const arrow = screen.getByText('\u2191');
    expect(arrow).toBeDefined();
  });

  it('shows down trend arrow', () => {
    render(<SGMetricCard label="Errors" value="3" trend="down" />);
    const arrow = screen.getByText('\u2193');
    expect(arrow).toBeDefined();
  });

  it('shows flat trend arrow', () => {
    render(<SGMetricCard label="Stable" value="10" trend="flat" />);
    const arrow = screen.getByText('\u2192');
    expect(arrow).toBeDefined();
  });

  it('does not show trend arrow when no trend is set', () => {
    const { container } = render(<SGMetricCard label="NoTrend" value="7" />);
    expect(container.textContent).not.toContain('\u2191');
    expect(container.textContent).not.toContain('\u2193');
    expect(container.textContent).not.toContain('\u2192');
  });

  it('up trend arrow uses emerald color', () => {
    render(<SGMetricCard label="Up" value="1" trend="up" />);
    const arrow = screen.getByText('\u2191');
    expect(arrow.style.color).toBe('var(--sg-emerald)');
  });

  it('down trend arrow uses red color', () => {
    render(<SGMetricCard label="Down" value="1" trend="down" />);
    const arrow = screen.getByText('\u2193');
    expect(arrow.style.color).toBe('var(--sg-red)');
  });

  it('flat trend arrow uses text-4 color', () => {
    render(<SGMetricCard label="Flat" value="1" trend="flat" />);
    const arrow = screen.getByText('\u2192');
    expect(arrow.style.color).toBe('var(--sg-text-4)');
  });

  it('label uses text-xs class', () => {
    const { container } = render(<SGMetricCard label="Small Label" value="0" />);
    const labelEl = container.querySelector('.text-xs');
    expect(labelEl).not.toBeNull();
    expect(labelEl!.textContent).toBe('Small Label');
  });

  it('label uses sg-text-4 color variable', () => {
    const { container } = render(<SGMetricCard label="Color check" value="0" />);
    const labelEl = container.querySelector('.text-xs') as HTMLElement;
    expect(labelEl.style.color).toBe('var(--sg-text-4)');
  });

  it('value has font-bold class', () => {
    const { container } = render(<SGMetricCard label="Bold" value="42" />);
    const valueEl = container.querySelector('.font-bold');
    expect(valueEl).not.toBeNull();
    expect(valueEl!.textContent).toBe('42');
  });

  it('renders with empty string value', () => {
    render(<SGMetricCard label="Empty" value="" />);
    expect(screen.getByText('Empty')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SGEmptyState
// ---------------------------------------------------------------------------
describe('SGEmptyState', () => {
  it('displays the provided message', () => {
    render(<SGEmptyState message="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeDefined();
  });

  it('uses the default icon when none is provided', () => {
    const { container } = render(<SGEmptyState message="Empty" />);
    expect(container.textContent).toContain('\uD83D\uDCED');
  });

  it('uses a custom icon when provided', () => {
    const { container } = render(<SGEmptyState icon={'\uD83D\uDD27'} message="Maintenance" />);
    expect(container.textContent).toContain('\uD83D\uDD27');
    expect(container.textContent).not.toContain('\uD83D\uDCED');
  });

  it('wraps in a div with sg-card class', () => {
    const { container } = render(<SGEmptyState message="Card wrapper" />);
    const card = container.querySelector('.sg-card');
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe('DIV');
  });

  it('has center text alignment', () => {
    const { container } = render(<SGEmptyState message="Centered" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    expect(card.style.textAlign).toBe('center');
  });

  it('has 2rem padding', () => {
    const { container } = render(<SGEmptyState message="Padded" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    expect(card.style.padding).toBe('2rem');
  });

  it('uses sg-text-4 color', () => {
    const { container } = render(<SGEmptyState message="Color" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    expect(card.style.color).toBe('var(--sg-text-4)');
  });

  it('icon is rendered in a separate div above the message', () => {
    const { container } = render(<SGEmptyState message="Below icon" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    const children = card.children;
    expect(children.length).toBe(2);
    // First child is the icon div, second is the message div
    expect(children[0].textContent).toContain('\uD83D\uDCED');
    expect(children[1].textContent).toBe('Below icon');
  });

  it('icon div has larger font size', () => {
    const { container } = render(<SGEmptyState message="Icon size" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    const iconDiv = card.children[0] as HTMLElement;
    expect(iconDiv.style.fontSize).toBe('1.5rem');
  });

  it('icon div has bottom margin', () => {
    const { container } = render(<SGEmptyState message="Margin" />);
    const card = container.querySelector('.sg-card') as HTMLElement;
    const iconDiv = card.children[0] as HTMLElement;
    expect(iconDiv.style.marginBottom).toBe('0.5rem');
  });

  it('displays custom icon text', () => {
    render(<SGEmptyState icon="!" message="Alert" />);
    const { container } = render(<SGEmptyState icon="*" message="Star" />);
    expect(container.textContent).toContain('*');
    expect(container.textContent).toContain('Star');
  });

  it('renders with a long message string', () => {
    const longMsg = 'A'.repeat(200);
    render(<SGEmptyState message={longMsg} />);
    expect(screen.getByText(longMsg)).toBeDefined();
  });
});
