import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import ContentTypeIndicator, { detectContentType } from '../ContentTypeIndicator';

vi.mock('lucide-react', () => lucideReactMock);

describe('ContentTypeIndicator', () => {
  it('renders with testid', () => {
    render(<ContentTypeIndicator filePath="file.ts" />);
    expect(screen.getByTestId('content-type-indicator')).toBeInTheDocument();
  });

  it('renders label when showLabel is true', () => {
    render(<ContentTypeIndicator type="code" showLabel />);
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('hides label by default', () => {
    render(<ContentTypeIndicator type="code" />);
    expect(screen.queryByText('Code')).not.toBeInTheDocument();
  });

  it('detects type from file path when no type prop', () => {
    render(<ContentTypeIndicator filePath="style.css" showLabel />);
    expect(screen.getByText('Web')).toBeInTheDocument();
  });

  it('uses explicit type prop over filePath detection', () => {
    render(<ContentTypeIndicator filePath="file.ts" type="image" showLabel />);
    expect(screen.getByText('Image')).toBeInTheDocument();
  });

  it('renders with different size variants', () => {
    const { rerender } = render(<ContentTypeIndicator type="code" size="sm" />);
    expect(screen.getByTestId('content-type-indicator')).toBeInTheDocument();

    rerender(<ContentTypeIndicator type="code" size="lg" />);
    expect(screen.getByTestId('content-type-indicator')).toBeInTheDocument();
  });
});

describe('detectContentType utility', () => {
  it('detects TypeScript as code', () => {
    expect(detectContentType('app.ts')).toBe('code');
  });

  it('detects JSON files', () => {
    expect(detectContentType('config.json')).toBe('json');
  });

  it('detects images', () => {
    expect(detectContentType('photo.png')).toBe('image');
  });

  it('detects Dockerfile as config', () => {
    expect(detectContentType('Dockerfile')).toBe('config');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(detectContentType('data.xyz')).toBe('unknown');
  });

  it('detects package.json as package', () => {
    expect(detectContentType('package.json')).toBe('package');
  });
});
