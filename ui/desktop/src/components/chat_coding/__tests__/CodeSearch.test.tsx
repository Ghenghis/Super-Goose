import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import CodeSearch, { findMatches } from '../CodeSearch';

vi.mock('lucide-react', () => lucideReactMock);

describe('CodeSearch', () => {
  const defaultProps = {
    code: 'Hello world\nfoo bar baz\nHello again\ntest line',
    onHighlight: vi.fn(),
  };

  it('renders search input', () => {
    render(<CodeSearch {...defaultProps} />);
    expect(screen.getByLabelText('Search in code')).toBeInTheDocument();
  });

  it('shows match count when query is entered', () => {
    render(<CodeSearch {...defaultProps} />);
    const input = screen.getByLabelText('Search in code');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(screen.getByText('1 of 2 matches')).toBeInTheDocument();
  });

  it('shows "No matches" for non-matching query', () => {
    render(<CodeSearch {...defaultProps} />);
    const input = screen.getByLabelText('Search in code');
    fireEvent.change(input, { target: { value: 'xyz123' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('calls onHighlight when matches are found', () => {
    const onHighlight = vi.fn();
    render(<CodeSearch {...defaultProps} onHighlight={onHighlight} />);
    const input = screen.getByLabelText('Search in code');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(onHighlight).toHaveBeenCalledWith(0); // first match on line 0
  });

  it('navigates to next match on Enter key', () => {
    const onHighlight = vi.fn();
    render(<CodeSearch {...defaultProps} onHighlight={onHighlight} />);
    const input = screen.getByLabelText('Search in code');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should advance to match index 1 (line 2)
    expect(onHighlight).toHaveBeenCalledWith(2);
  });

  it('has case sensitivity toggle', () => {
    render(<CodeSearch {...defaultProps} />);
    expect(screen.getByLabelText('Toggle case sensitivity')).toBeInTheDocument();
  });
});

describe('findMatches utility', () => {
  it('finds all case-insensitive matches', () => {
    const matches = findMatches('Hello hello HELLO', 'hello', false);
    expect(matches).toHaveLength(3);
  });

  it('finds case-sensitive matches when specified', () => {
    const matches = findMatches('Hello hello HELLO', 'Hello', true);
    expect(matches).toHaveLength(1);
    expect(matches[0].startCol).toBe(0);
  });

  it('returns empty array for empty query', () => {
    expect(findMatches('some code', '', false)).toHaveLength(0);
  });

  it('returns correct column positions', () => {
    const matches = findMatches('abc def abc', 'abc', false);
    expect(matches).toHaveLength(2);
    expect(matches[0].startCol).toBe(0);
    expect(matches[0].endCol).toBe(3);
    expect(matches[1].startCol).toBe(8);
    expect(matches[1].endCol).toBe(11);
  });
});
