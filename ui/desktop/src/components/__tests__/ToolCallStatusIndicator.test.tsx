import { render, screen } from '@testing-library/react';
import {
  ToolCallStatusIndicator,
  ToolIconWithStatus,
  ToolCallStatus,
} from '../ToolCallStatusIndicator';

describe('ToolCallStatusIndicator', () => {
  it('renders with success status', () => {
    render(<ToolCallStatusIndicator status="success" />);
    const indicator = screen.getByLabelText('Tool status: success');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('bg-green-500');
  });

  it('renders with error status', () => {
    render(<ToolCallStatusIndicator status="error" />);
    const indicator = screen.getByLabelText('Tool status: error');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('bg-red-500');
  });

  it('renders with loading status and pulse animation', () => {
    render(<ToolCallStatusIndicator status="loading" />);
    const indicator = screen.getByLabelText('Tool status: loading');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('bg-yellow-500');
    expect(indicator.className).toContain('animate-pulse');
  });

  it('renders with pending status', () => {
    render(<ToolCallStatusIndicator status="pending" />);
    const indicator = screen.getByLabelText('Tool status: pending');
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('bg-gray-400');
  });

  it('applies custom className', () => {
    render(<ToolCallStatusIndicator status="success" className="custom-class" />);
    const indicator = screen.getByLabelText('Tool status: success');
    expect(indicator.className).toContain('custom-class');
  });
});

describe('ToolIconWithStatus', () => {
  const MockIcon = ({ className }: { className?: string }) => (
    <svg data-testid="mock-icon" className={className} />
  );

  it('renders the icon component', () => {
    render(<ToolIconWithStatus ToolIcon={MockIcon} status="success" />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('renders the status indicator alongside the icon', () => {
    render(<ToolIconWithStatus ToolIcon={MockIcon} status="error" />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
    expect(screen.getByLabelText('Tool status: error')).toBeInTheDocument();
  });

  it('applies custom className to wrapper', () => {
    const { container } = render(
      <ToolIconWithStatus ToolIcon={MockIcon} status="pending" className="my-wrapper" />
    );
    expect(container.firstElementChild?.className).toContain('my-wrapper');
  });

  it('renders different statuses correctly', () => {
    const statuses: ToolCallStatus[] = ['pending', 'loading', 'success', 'error'];
    statuses.forEach((status) => {
      const { unmount } = render(<ToolIconWithStatus ToolIcon={MockIcon} status={status} />);
      expect(screen.getByLabelText(`Tool status: ${status}`)).toBeInTheDocument();
      unmount();
    });
  });
});
