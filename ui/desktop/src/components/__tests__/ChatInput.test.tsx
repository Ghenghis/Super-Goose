import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from '../ChatInput';
import { ChatState } from '../../types/chatState';

// Mock all heavy child components and hooks
vi.mock('../bottom_menu/DirSwitcher', () => ({
  DirSwitcher: () => <div data-testid="dir-switcher">DirSwitcher</div>,
}));

vi.mock('../settings/models/bottom_bar/ModelsBottomBar', () => ({
  default: () => <div data-testid="models-bottom-bar">ModelsBottomBar</div>,
}));

vi.mock('../bottom_menu/BottomMenuModeSelection', () => ({
  BottomMenuModeSelection: () => <div data-testid="mode-selection">ModeSelection</div>,
}));

vi.mock('../bottom_menu/BottomMenuExtensionSelection', () => ({
  BottomMenuExtensionSelection: () => (
    <div data-testid="extension-selection">ExtensionSelection</div>
  ),
}));

vi.mock('../alerts', () => ({
  AlertType: { Info: 'info', Warning: 'warning' },
  useAlerts: () => ({
    alerts: [],
    addAlert: vi.fn(),
    clearAlerts: vi.fn(),
  }),
}));

vi.mock('../ConfigContext', () => ({
  useConfig: () => ({
    getProviders: vi.fn(async () => []),
    read: vi.fn(async () => null),
  }),
}));

vi.mock('../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    getCurrentModelAndProvider: vi.fn(async () => ({
      model: 'gpt-4',
      provider: 'openai',
    })),
    currentModel: 'gpt-4',
    currentProvider: 'openai',
  }),
}));

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isEnabled: false,
    dictationProvider: null,
    isRecording: false,
    isTranscribing: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock('../MentionPopover', () => {
  const MentionPopover = vi.fn(() => null);
  return { default: MentionPopover, DisplayItemWithMatch: {} };
});

vi.mock('../../updates', () => ({
  COST_TRACKING_ENABLED: false,
}));

vi.mock('../bottom_menu/CostTracker', () => ({
  CostTracker: () => null,
}));

vi.mock('../../hooks/useFileDrop', () => ({
  useFileDrop: () => ({
    droppedFiles: [],
    setDroppedFiles: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
  }),
  DroppedFile: {},
}));

vi.mock('../../recipe', () => ({}));

vi.mock('../MessageQueue', () => ({
  MessageQueue: () => <div data-testid="message-queue">MessageQueue</div>,
}));

vi.mock('../../utils/interruptionDetector', () => ({
  detectInterruption: vi.fn(() => null),
}));

vi.mock('../ui/Diagnostics', () => ({
  DiagnosticsModal: () => <div data-testid="diagnostics-modal">DiagnosticsModal</div>,
}));

vi.mock('../../api', () => ({
  getSession: vi.fn(async () => ({ data: { working_dir: '/test/dir' } })),
}));

vi.mock('../recipes/CreateRecipeFromSessionModal', () => ({
  default: () => <div data-testid="create-recipe-modal">CreateRecipeModal</div>,
}));

vi.mock('../recipes/CreateEditRecipeModal', () => ({
  default: () => <div data-testid="edit-recipe-modal">EditRecipeModal</div>,
}));

vi.mock('../../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/default/dir',
}));

vi.mock('../settings/models/predefinedModelsUtils', () => ({
  getPredefinedModelsFromEnv: () => [],
}));

vi.mock('../../utils/analytics', () => ({
  trackFileAttached: vi.fn(),
  trackVoiceDictation: vi.fn(),
  trackDiagnosticsOpened: vi.fn(),
  trackCreateRecipeOpened: vi.fn(),
  trackEditRecipeOpened: vi.fn(),
}));

vi.mock('../../utils/keyboardShortcuts', () => ({
  getNavigationShortcutText: () => 'Type a message...',
}));

vi.mock('../../utils/conversionUtils', () => ({
  compressImageDataUrl: vi.fn(async (url: string) => url),
}));

vi.mock('../../utils/localMessageStorage', () => ({
  LocalMessageStorage: {
    addMessage: vi.fn(),
    getRecentMessages: vi.fn(() => []),
  },
}));

vi.mock('lodash/debounce', () => ({
  default: (fn: Function) => {
    const debounced = (...args: unknown[]) => fn(...args);
    debounced.cancel = vi.fn();
    return debounced;
  },
}));

// Mock window.electron extras
beforeEach(() => {
  (window.electron as Record<string, unknown>).getPathForFile = vi.fn(
    (f: File) => `/path/${f.name}`
  );
  (window.electron as Record<string, unknown>).logInfo = vi.fn();
  (window as unknown as Record<string, unknown>).appConfig = {
    get: vi.fn(() => undefined),
  };
});

// Tooltip mock
vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: (props: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{props.children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    disabled?: boolean;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      type={type as 'button' | 'submit' | 'reset' | undefined}
      disabled={disabled}
      className={className}
      aria-label={rest['aria-label'] as string | undefined}
    >
      {children}
    </button>
  ),
}));

vi.mock('../icons', () => ({
  Attach: () => <span data-testid="attach-icon">Attach</span>,
  Send: ({ className }: { className?: string }) => (
    <span data-testid="send-icon" className={className}>
      Send
    </span>
  ),
  Close: () => <span data-testid="close-icon">Close</span>,
  Microphone: () => <span data-testid="mic-icon">Mic</span>,
}));

vi.mock('../ui/Stop', () => ({
  default: () => <span data-testid="stop-icon">Stop</span>,
}));

const defaultProps = () => ({
  sessionId: 'sess-1',
  handleSubmit: vi.fn(),
  chatState: ChatState.Idle,
  setView: vi.fn(),
  toolCount: 5,
});

describe('ChatInput', () => {
  it('renders the textarea', () => {
    render(<ChatInput {...defaultProps()} />);

    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('renders with placeholder text', () => {
    render(<ChatInput {...defaultProps()} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Type a message...');
  });

  it('updates value when typing', () => {
    render(<ChatInput {...defaultProps()} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello world' } });

    expect(textarea.value).toBe('Hello world');
  });

  it('submits message on Enter key', () => {
    const handleSubmit = vi.fn();
    render(<ChatInput {...defaultProps()} handleSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Test message',
      })
    );
  });

  it('does not submit on Shift+Enter', () => {
    const handleSubmit = vi.fn();
    render(<ChatInput {...defaultProps()} handleSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when textarea is empty', () => {
    const handleSubmit = vi.fn();
    render(<ChatInput {...defaultProps()} handleSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('clears input after submission', () => {
    const handleSubmit = vi.fn();
    render(<ChatInput {...defaultProps()} handleSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea.value).toBe('');
  });

  it('shows stop button when loading and no submittable content', () => {
    render(<ChatInput {...defaultProps()} chatState={ChatState.Streaming} />);

    expect(screen.getByTestId('stop-icon')).toBeInTheDocument();
  });

  it('shows send button when idle', () => {
    render(<ChatInput {...defaultProps()} />);

    expect(screen.getByTestId('send-icon')).toBeInTheDocument();
  });

  it('calls onStop when stop button is clicked', () => {
    const onStop = vi.fn();
    render(
      <ChatInput {...defaultProps()} chatState={ChatState.Streaming} onStop={onStop} />
    );

    const stopButton = screen.getByTestId('stop-icon').closest('button')!;
    fireEvent.click(stopButton);

    expect(onStop).toHaveBeenCalled();
  });

  it('renders DirSwitcher', () => {
    render(<ChatInput {...defaultProps()} />);

    expect(screen.getByTestId('dir-switcher')).toBeInTheDocument();
  });

  it('renders attach button', () => {
    render(<ChatInput {...defaultProps()} />);

    expect(screen.getByTestId('attach-icon')).toBeInTheDocument();
  });

  it('populates with initialValue', () => {
    render(<ChatInput {...defaultProps()} initialValue="Initial text" />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Initial text');
  });

  it('form submit triggers handleSubmit', () => {
    const handleSubmit = vi.fn();
    render(<ChatInput {...defaultProps()} handleSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'form submit test' } });

    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(handleSubmit).toHaveBeenCalled();
  });

  it('adds newline on Alt+Enter', () => {
    render(<ChatInput {...defaultProps()} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Line1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });

    expect(textarea.value).toContain('\n');
  });
});
