import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import AudioPlayer from '../AudioPlayer';

vi.mock('lucide-react', () => lucideReactMock);

// Mock HTMLCanvasElement.getContext for waveform canvas
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  fill: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
})) as any;

describe('AudioPlayer', () => {
  it('renders without crashing', () => {
    const { container } = render(<AudioPlayer src="test.mp3" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders a hidden audio element with correct src', () => {
    const { container } = render(<AudioPlayer src="https://example.com/audio.wav" />);
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute('src')).toBe('https://example.com/audio.wav');
  });

  it('shows play button initially', () => {
    render(<AudioPlayer src="test.mp3" />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('renders speed selector with 1x default', () => {
    render(<AudioPlayer src="test.mp3" />);
    expect(screen.getByLabelText('Playback speed 1x')).toBeInTheDocument();
  });

  it('renders mute/unmute button', () => {
    render(<AudioPlayer src="test.mp3" />);
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
  });

  it('renders audio progress slider', () => {
    render(<AudioPlayer src="test.mp3" />);
    expect(screen.getByRole('slider', { name: 'Audio progress' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<AudioPlayer src="test.mp3" className="my-class" />);
    expect(container.firstChild).toHaveClass('my-class');
  });
});
