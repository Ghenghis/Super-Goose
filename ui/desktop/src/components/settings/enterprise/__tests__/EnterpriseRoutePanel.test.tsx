import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnterpriseRoutePanel from '../EnterpriseRoutePanel';

// Mock all sub-panel components — they make fetch calls to backend
vi.mock('../GuardrailsPanel', () => ({
  default: () => <div data-testid="guardrails-panel">GuardrailsPanel Content</div>,
}));

vi.mock('../GatewayPanel', () => ({
  default: () => <div data-testid="gateway-panel">GatewayPanel Content</div>,
}));

vi.mock('../ObservabilityPanel', () => ({
  default: () => <div data-testid="observability-panel">ObservabilityPanel Content</div>,
}));

vi.mock('../PoliciesPanel', () => ({
  default: () => <div data-testid="policies-panel">PoliciesPanel Content</div>,
}));

vi.mock('../HooksPanel', () => ({
  default: () => <div data-testid="hooks-panel">HooksPanel Content</div>,
}));

vi.mock('../MemoryPanel', () => ({
  default: () => <div data-testid="memory-panel">MemoryPanel Content</div>,
}));

describe('EnterpriseRoutePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Grid view', () => {
    it('should render the Enterprise Settings header', () => {
      render(<EnterpriseRoutePanel />);
      expect(screen.getByText('Enterprise Settings')).toBeInTheDocument();
    });

    it('should render the description', () => {
      render(<EnterpriseRoutePanel />);
      expect(
        screen.getByText('Security, governance, and infrastructure configuration')
      ).toBeInTheDocument();
    });

    it('should render all 6 enterprise cards', () => {
      render(<EnterpriseRoutePanel />);
      expect(screen.getByText('Guardrails')).toBeInTheDocument();
      expect(screen.getByText('Gateway')).toBeInTheDocument();
      expect(screen.getByText('Observability')).toBeInTheDocument();
      expect(screen.getByText('Policies')).toBeInTheDocument();
      expect(screen.getByText('Hooks')).toBeInTheDocument();
      // Memory is the 6th card
      expect(screen.getByText('Memory')).toBeInTheDocument();
    });

    it('should render card descriptions', () => {
      render(<EnterpriseRoutePanel />);
      expect(screen.getByText('Input/output scanning and safety rules')).toBeInTheDocument();
      expect(screen.getByText('Multi-provider routing and failover')).toBeInTheDocument();
      expect(screen.getByText('Tracing, metrics, and monitoring')).toBeInTheDocument();
      expect(screen.getByText('Approval workflows and compliance')).toBeInTheDocument();
      expect(screen.getByText('Lifecycle hook configuration')).toBeInTheDocument();
      expect(screen.getByText('Memory system and retrieval settings')).toBeInTheDocument();
    });

    it('should render 6 Configure buttons', () => {
      render(<EnterpriseRoutePanel />);
      const configureButtons = screen.getAllByText('Configure');
      expect(configureButtons).toHaveLength(6);
    });
  });

  describe('Navigation to sub-panel', () => {
    it('should open Guardrails panel when Guardrails card is clicked', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      // Click the card (not the Configure button)
      await user.click(screen.getByText('Guardrails'));

      expect(screen.getByTestId('guardrails-panel')).toBeInTheDocument();
      expect(screen.getByText('Back to Enterprise Settings')).toBeInTheDocument();
    });

    it('should open Gateway panel when Gateway Configure button is clicked', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      // Find the Gateway card's Configure button
      const configureButtons = screen.getAllByText('Configure');
      // Gateway is the 2nd panel (index 1)
      await user.click(configureButtons[1]);

      expect(screen.getByTestId('gateway-panel')).toBeInTheDocument();
    });

    it('should open Observability panel', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Observability'));
      expect(screen.getByTestId('observability-panel')).toBeInTheDocument();
    });

    it('should open Policies panel', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Policies'));
      expect(screen.getByTestId('policies-panel')).toBeInTheDocument();
    });

    it('should open Hooks panel', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Hooks'));
      expect(screen.getByTestId('hooks-panel')).toBeInTheDocument();
    });

    it('should open Memory panel', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Memory'));
      expect(screen.getByTestId('memory-panel')).toBeInTheDocument();
    });
  });

  describe('Back button', () => {
    it('should return to grid when Back button is clicked', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      // Navigate to a sub-panel
      await user.click(screen.getByText('Guardrails'));
      expect(screen.getByTestId('guardrails-panel')).toBeInTheDocument();

      // Click back
      await user.click(screen.getByText('Back to Enterprise Settings'));

      // Should see the grid again
      expect(screen.getByText('Enterprise Settings')).toBeInTheDocument();
      expect(screen.getAllByText('Configure')).toHaveLength(6);
    });

    it('should show panel title and description in detail view', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Observability'));
      // In detail view, header shows the label and description
      expect(screen.getByText('Observability')).toBeInTheDocument();
      expect(screen.getByText('Tracing, metrics, and monitoring')).toBeInTheDocument();
    });

    it('should hide grid cards when viewing a sub-panel', async () => {
      const user = userEvent.setup();
      render(<EnterpriseRoutePanel />);

      await user.click(screen.getByText('Guardrails'));

      // Grid should no longer be visible
      expect(screen.queryByText('Gateway')).not.toBeInTheDocument();
      expect(screen.queryAllByText('Configure')).toHaveLength(0);
    });
  });
});
