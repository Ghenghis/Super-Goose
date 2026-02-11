import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BudgetPanel from '../BudgetPanel';

// Mock the MainPanelLayout to simply render children
vi.mock('../../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('BudgetPanel', () => {
  describe('Rendering', () => {
    it('renders the Budget & Costs heading', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Budget & Costs')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<BudgetPanel />);
      expect(
        screen.getByText('Track spending across models and providers with configurable budget limits.')
      ).toBeInTheDocument();
    });

    it('renders Current Session Cost label', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Current Session Cost')).toBeInTheDocument();
    });

    it('renders total cost', () => {
      render(<BudgetPanel />);
      // Total: 1.47 + 1.12 + 0.39 + 0.18 = 3.16
      // "$3.16" appears in both the large cost display and the budget bar,
      // so use getAllByText to verify at least one is present.
      const costElements = screen.getAllByText('$3.16');
      expect(costElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders budget limit display', () => {
      render(<BudgetPanel />);
      // Default budget is $10.00
      expect(screen.getByText(/Budget: \$10.00 per session/)).toBeInTheDocument();
    });
  });

  describe('Budget Bar', () => {
    it('renders budget progress bar text', () => {
      render(<BudgetPanel />);
      // "$3.16 of $10.00 budget"
      expect(screen.getByText('$3.16 of $10.00 budget')).toBeInTheDocument();
    });

    it('renders budget percentage', () => {
      render(<BudgetPanel />);
      // 3.16 / 10 * 100 = 31.6, rounded to 32%
      expect(screen.getByText('32%')).toBeInTheDocument();
    });
  });

  describe('Budget Editing', () => {
    it('enters editing mode when budget text is clicked', async () => {
      const user = userEvent.setup();
      render(<BudgetPanel />);

      const budgetButton = screen.getByText(/Budget: \$10.00 per session/);
      await user.click(budgetButton);

      // Should show input field and Save button
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10.00')).toBeInTheDocument();
    });

    it('saves budget when Save button is clicked', async () => {
      const user = userEvent.setup();
      render(<BudgetPanel />);

      const budgetButton = screen.getByText(/Budget: \$10.00 per session/);
      await user.click(budgetButton);

      // Change the value using fireEvent for controlled number input
      const input = screen.getByDisplayValue('10.00');
      fireEvent.change(input, { target: { value: '5.00' } });

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      // Should exit editing mode
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
      expect(screen.getByText(/Budget: \$5\.00 per session/)).toBeInTheDocument();
    });

    it('updates budget bar when budget is changed', async () => {
      const user = userEvent.setup();
      render(<BudgetPanel />);

      const budgetButton = screen.getByText(/Budget: \$10.00 per session/);
      await user.click(budgetButton);

      // Change the value using fireEvent for controlled number input
      const input = screen.getByDisplayValue('10.00');
      fireEvent.change(input, { target: { value: '5.00' } });

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      // Budget bar should show new values
      expect(screen.getByText(/\$3\.16 of \$5\.00 budget/)).toBeInTheDocument();
      // 3.16 / 5.00 * 100 = 63.2 => 63%
      expect(screen.getByText('63%')).toBeInTheDocument();
    });
  });

  describe('Cost Breakdown Table', () => {
    it('renders Cost Breakdown heading', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Cost Breakdown by Model')).toBeInTheDocument();
    });

    it('renders table headers', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('Calls')).toBeInTheDocument();
      expect(screen.getByText('Cost')).toBeInTheDocument();
    });

    it('renders model names', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('claude-sonnet-4-20250514')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('claude-haiku-3.5')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
    });

    it('renders provider names', () => {
      render(<BudgetPanel />);
      const anthropicProviders = screen.getAllByText('Anthropic');
      expect(anthropicProviders.length).toBe(2);
      const openaiProviders = screen.getAllByText('OpenAI');
      expect(openaiProviders.length).toBe(2);
    });

    it('renders formatted token counts', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('245K')).toBeInTheDocument();
      expect(screen.getByText('62K')).toBeInTheDocument();
      expect(screen.getByText('520K')).toBeInTheDocument();
    });

    it('renders individual costs', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('$1.47')).toBeInTheDocument();
      expect(screen.getByText('$1.12')).toBeInTheDocument();
      expect(screen.getByText('$0.39')).toBeInTheDocument();
      expect(screen.getByText('$0.18')).toBeInTheDocument();
    });

    it('renders Total row', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('renders call counts', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('32')).toBeInTheDocument();
      expect(screen.getByText('18')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  describe('Daily Usage', () => {
    it('renders Daily Usage heading', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('Daily Usage (Last 7 days)')).toBeInTheDocument();
    });

    it('renders daily cost values', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('$0.42')).toBeInTheDocument();
      expect(screen.getByText('$0.78')).toBeInTheDocument();
      expect(screen.getByText('$0.95')).toBeInTheDocument();
      expect(screen.getByText('$1.24')).toBeInTheDocument();
    });

    it('renders date labels', () => {
      render(<BudgetPanel />);
      expect(screen.getByText('02/04')).toBeInTheDocument();
      expect(screen.getByText('02/10')).toBeInTheDocument();
    });
  });
});
