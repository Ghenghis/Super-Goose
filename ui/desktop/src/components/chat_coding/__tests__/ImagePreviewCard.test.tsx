import { render, screen, fireEvent } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import ImagePreviewCard from '../ImagePreviewCard';

vi.mock('lucide-react', () => lucideReactMock);

describe('ImagePreviewCard', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ImagePreviewCard src="https://example.com/img.png" alt="Test" />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders an img element with correct src and alt', () => {
    render(<ImagePreviewCard src="https://example.com/img.png" alt="My image" />);
    const img = screen.getByAltText('My image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img.png');
  });

  it('uses default alt text when none provided', () => {
    render(<ImagePreviewCard src="https://example.com/img.png" />);
    expect(screen.getByAltText('Image')).toBeInTheDocument();
  });

  it('shows error fallback on image load failure', () => {
    render(<ImagePreviewCard src="invalid.png" alt="broken" />);
    const img = screen.getByAltText('broken');
    fireEvent.error(img);
    expect(screen.getByText('Failed to load image')).toBeInTheDocument();
  });

  it('shows footer info after image loads', () => {
    render(
      <ImagePreviewCard
        src="https://example.com/img.png"
        alt="test"
        mimeType="image/png"
      />
    );
    const img = screen.getByAltText('test');
    // Simulate successful load
    fireEvent.load(img);
    expect(screen.getByText('PNG')).toBeInTheDocument();
  });

  it('has accessible role and label', () => {
    render(<ImagePreviewCard src="img.png" alt="photo" />);
    expect(screen.getByRole('button', { name: /Preview image: photo/ })).toBeInTheDocument();
  });
});
