import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Label shown when this boundary catches an error */
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight error boundary for chat_coding components.
 * Prevents a single component failure from crashing the entire chat interface.
 * Renders a compact inline error message instead of the full-screen "Honk!" page.
 */
class ChatCodingErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[ChatCoding] ${this.props.componentName || 'Component'} error:`,
      error,
      errorInfo.componentStack
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted bg-background-muted rounded-lg border border-border-default">
          <AlertTriangle className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span>
            {this.props.componentName
              ? `${this.props.componentName} unavailable`
              : 'Component unavailable'}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ChatCodingErrorBoundary;
