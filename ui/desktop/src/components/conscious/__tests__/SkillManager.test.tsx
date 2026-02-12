import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillManager from '../SkillManager';

describe('SkillManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Skills header', () => {
    render(<SkillManager />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('renders skill name input, Run, Save, and List All Skills buttons', () => {
    render(<SkillManager />);
    expect(screen.getByLabelText('Skill name')).toBeInTheDocument();
    expect(screen.getByLabelText('Run skill')).toBeInTheDocument();
    expect(screen.getByLabelText('Save skill')).toBeInTheDocument();
    expect(screen.getByLabelText('List all skills')).toBeInTheDocument();
  });

  it('Run and Save buttons are disabled when input is empty', () => {
    render(<SkillManager />);
    expect(screen.getByLabelText('Run skill')).toBeDisabled();
    expect(screen.getByLabelText('Save skill')).toBeDisabled();
  });

  it('enables Run and Save buttons when skill name is entered', async () => {
    const user = userEvent.setup();
    render(<SkillManager />);
    await user.type(screen.getByLabelText('Skill name'), 'greet');
    expect(screen.getByLabelText('Run skill')).not.toBeDisabled();
    expect(screen.getByLabelText('Save skill')).not.toBeDisabled();
  });

  it('sends run skill command and shows output', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Skill greet executed successfully' }),
    } as Response);

    render(<SkillManager />);
    await user.type(screen.getByLabelText('Skill name'), 'greet');
    await user.click(screen.getByLabelText('Run skill'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Skill greet executed successfully');
    });
  });

  it('sends save skill command', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Skill saved' }),
    } as Response);

    render(<SkillManager />);
    await user.type(screen.getByLabelText('Skill name'), 'greet');
    await user.click(screen.getByLabelText('Save skill'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Skill saved');
    });
  });

  it('lists all skills when clicking the list button', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'greet\nfarewell\nsummarize' }),
    } as Response);

    render(<SkillManager />);
    await user.click(screen.getByLabelText('List all skills'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('greet');
    });
  });

  it('shows error when API returns failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Skill not found' }),
    } as Response);

    render(<SkillManager />);
    await user.type(screen.getByLabelText('Skill name'), 'unknown');
    await user.click(screen.getByLabelText('Run skill'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Skill not found');
    });
  });
});
