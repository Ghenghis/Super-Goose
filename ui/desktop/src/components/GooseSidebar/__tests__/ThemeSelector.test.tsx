import { render, screen, fireEvent } from '@testing-library/react';

const mockSetUserThemePreference = vi.fn();

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    userThemePreference: 'light',
    setUserThemePreference: mockSetUserThemePreference,
    resolvedTheme: 'light',
  }),
}));

import ThemeSelector from '../ThemeSelector';

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three theme buttons', () => {
    render(<ThemeSelector />);
    expect(screen.getByTestId('light-mode-button')).toBeInTheDocument();
    expect(screen.getByTestId('dark-mode-button')).toBeInTheDocument();
    expect(screen.getByTestId('system-mode-button')).toBeInTheDocument();
  });

  it('renders "Theme" title by default', () => {
    render(<ThemeSelector />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('hides title when hideTitle is true', () => {
    render(<ThemeSelector hideTitle />);
    expect(screen.queryByText('Theme')).not.toBeInTheDocument();
  });

  it('calls setUserThemePreference with "light" when Light is clicked', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByTestId('light-mode-button'));
    expect(mockSetUserThemePreference).toHaveBeenCalledWith('light');
  });

  it('calls setUserThemePreference with "dark" when Dark is clicked', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByTestId('dark-mode-button'));
    expect(mockSetUserThemePreference).toHaveBeenCalledWith('dark');
  });

  it('calls setUserThemePreference with "system" when System is clicked', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByTestId('system-mode-button'));
    expect(mockSetUserThemePreference).toHaveBeenCalledWith('system');
  });

  it('renders button labels', () => {
    render(<ThemeSelector />);
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ThemeSelector className="my-custom-class" />);
    expect(container.firstElementChild?.className).toContain('my-custom-class');
  });
});
