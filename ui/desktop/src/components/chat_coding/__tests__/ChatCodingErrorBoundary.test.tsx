import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import ChatCodingErrorBoundary from '../ChatCodingErrorBoundary';

vi.mock('lucide-react', () => lucideReactMock);

// Component that always throws
const ThrowingComponent = () => {
  throw new Error('Test error');
};

// Suppress React error boundary console output during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe('ChatCodingErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ChatCodingErrorBoundary>
        <div>Hello World</div>
      </ChatCodingErrorBoundary>
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ChatCodingErrorBoundary>
        <ThrowingComponent />
      </ChatCodingErrorBoundary>
    );
    expect(screen.getByText('Component unavailable')).toBeInTheDocument();
  });

  it('displays component name in fallback when provided', () => {
    render(
      <ChatCodingErrorBoundary componentName="MermaidDiagram">
        <ThrowingComponent />
      </ChatCodingErrorBoundary>
    );
    expect(screen.getByText('MermaidDiagram unavailable')).toBeInTheDocument();
  });

  it('renders generic fallback when no componentName is given', () => {
    render(
      <ChatCodingErrorBoundary>
        <ThrowingComponent />
      </ChatCodingErrorBoundary>
    );
    expect(screen.getByText('Component unavailable')).toBeInTheDocument();
  });

  it('does not show error fallback when children render successfully', () => {
    render(
      <ChatCodingErrorBoundary componentName="TestComp">
        <span>Safe content</span>
      </ChatCodingErrorBoundary>
    );
    expect(screen.queryByText('TestComp unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });
});
