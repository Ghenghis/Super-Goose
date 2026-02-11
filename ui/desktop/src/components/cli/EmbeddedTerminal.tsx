/**
 * EmbeddedTerminal.tsx
 *
 * Full embedded terminal component that runs the `goose` CLI inside the
 * Super-Goose desktop app. Provides a dark terminal UI with command input,
 * scrollable output history, quick-command buttons, resize handle, and
 * keyboard shortcuts (Up/Down history, Ctrl+C interrupt, Ctrl+L clear).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal,
  Minus,
  Maximize2,
  X,
  ChevronRight,
  Circle,
  GripHorizontal,
} from 'lucide-react';
import { useCLI } from './CLIContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a single line / block rendered in the terminal output area. */
export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Quick-access commands shown as buttons below the header bar. */
const QUICK_COMMANDS = [
  { label: 'session', command: 'goose session' },
  { label: 'features', command: 'goose features' },
  { label: 'cost', command: 'goose cost' },
  { label: 'configure', command: 'goose configure' },
  { label: 'update', command: 'goose update' },
] as const;

/** Minimum terminal height in pixels (when resizing). */
const MIN_HEIGHT = 150;
/** Maximum terminal height in pixels (when resizing). */
const MAX_HEIGHT = 600;
/** Default terminal height in pixels. */
const DEFAULT_HEIGHT = 320;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a TerminalEntry type to its Tailwind text-color class. */
function colorForEntryType(type: TerminalEntry['type']): string {
  switch (type) {
    case 'system':
      return 'text-blue-400';
    case 'error':
      return 'text-red-400';
    case 'input':
      return 'text-green-400';
    case 'output':
    default:
      return 'text-zinc-300';
  }
}

/** Return a connection-status indicator color class. */
function connectionDotColor(status: 'connected' | 'connecting' | 'disconnected'): string {
  switch (status) {
    case 'connected':
      return 'text-green-400';
    case 'connecting':
      return 'text-yellow-400';
    case 'disconnected':
    default:
      return 'text-red-400';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmbeddedTerminal() {
  // -- Context ---------------------------------------------------------------
  const {
    sendCommand,
    state,
    closeTerminal,
  } = useCLI();

  const { terminalHistory, isTerminalOpen, installedVersion } = state;

  // -- Local state -----------------------------------------------------------
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_HEIGHT);
  const [isMaximized, setIsMaximized] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);

  // Track the user's own input history for Up/Down arrow navigation.
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  // -- Refs ------------------------------------------------------------------
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);

  // -- Derived values --------------------------------------------------------
  // Simple connection heuristic: if we have a version string we are "connected".
  const connectionStatus: 'connected' | 'connecting' | 'disconnected' = installedVersion
    ? 'connected'
    : 'disconnected';

  // -- Effects ---------------------------------------------------------------

  /** Auto-focus the input whenever the terminal opens. */
  useEffect(() => {
    if (isTerminalOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTerminalOpen]);

  /** Auto-scroll to the bottom of the output whenever history changes. */
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  /** Show a welcome message the first time the terminal is opened. */
  useEffect(() => {
    if (isTerminalOpen && !hasShownWelcome && terminalHistory.length === 0) {
      const version = installedVersion || 'unknown';
      sendCommand(`__system__Welcome to Super-Goose CLI v${version}. Type 'goose --help' for available commands.`);
      setHasShownWelcome(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminalOpen, hasShownWelcome]);

  // -- Handlers --------------------------------------------------------------

  /** Submit the current input value as a command. */
  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    sendCommand(trimmed);
    setCommandHistory((prev) => [trimmed, ...prev]);
    setInputValue('');
    setHistoryIndex(-1);
  }, [inputValue, sendCommand]);

  /** Handle special key events on the input field. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // -- Enter: submit command ------------------------------------------------
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // -- Up arrow: navigate command history -----------------------------------
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIndex);
        setInputValue(commandHistory[nextIndex]);
        return;
      }

      // -- Down arrow: navigate forward through history -------------------------
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setInputValue('');
          return;
        }
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputValue(commandHistory[nextIndex]);
        return;
      }

      // -- Ctrl+C: send interrupt signal ----------------------------------------
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        sendCommand('__interrupt__');
        setInputValue('');
        return;
      }

      // -- Ctrl+L: clear terminal output ----------------------------------------
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        sendCommand('__clear__');
        return;
      }
    },
    [handleSubmit, commandHistory, historyIndex, sendCommand],
  );

  /** Run a quick command from the button bar. */
  const handleQuickCommand = useCallback(
    (cmd: string) => {
      sendCommand(cmd);
      setCommandHistory((prev) => [cmd, ...prev]);
      // Re-focus the input after clicking a quick-command button.
      inputRef.current?.focus();
    },
    [sendCommand],
  );

  /** Toggle maximize state for the terminal. */
  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  // -- Resize logic ----------------------------------------------------------

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startHeight: terminalHeight };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = resizeRef.current.startY - moveEvent.clientY;
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.startHeight + delta));
        setTerminalHeight(newHeight);
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [terminalHeight],
  );

  // -- Early return if terminal is not open ----------------------------------
  if (!isTerminalOpen) return null;

  // -- Render ----------------------------------------------------------------

  const effectiveHeight = isMaximized ? MAX_HEIGHT : terminalHeight;

  return (
    <div
      className="flex flex-col border-t border-border-default bg-zinc-900 select-none"
      style={{ height: effectiveHeight }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Resize handle (top edge)                                           */}
      {/* ------------------------------------------------------------------ */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="flex items-center justify-center h-2 cursor-row-resize hover:bg-zinc-700 transition-colors"
        title="Drag to resize terminal"
      >
        <GripHorizontal className="w-4 h-4 text-zinc-600" />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Header bar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        {/* Left: title + version + connection dot */}
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">Super-Goose CLI</span>
          {installedVersion && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-mono">
              v{installedVersion}
            </span>
          )}
          <Circle
            className={`w-2.5 h-2.5 fill-current ${connectionDotColor(connectionStatus)}`}
          />
        </div>

        {/* Right: window control buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTerminalHeight(MIN_HEIGHT)}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleMaximize}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={closeTerminal}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Quick command buttons                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800/60 border-b border-zinc-700/50 overflow-x-auto">
        {QUICK_COMMANDS.map(({ label, command }) => (
          <button
            key={label}
            onClick={() => handleQuickCommand(command)}
            className="flex-shrink-0 px-2 py-0.5 text-[11px] rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors font-mono"
          >
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Terminal output area                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed bg-zinc-900"
        onClick={() => inputRef.current?.focus()}
      >
        {terminalHistory.map((entry: TerminalEntry) => (
          <div key={entry.id} className={`whitespace-pre-wrap break-all ${colorForEntryType(entry.type)}`}>
            {entry.type === 'input' && (
              <span className="text-green-500 select-none">goose&gt; </span>
            )}
            {entry.content}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Input line                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-zinc-700 bg-zinc-800">
        <ChevronRight className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        <span className="text-xs text-green-500 font-mono select-none">goose&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-xs text-zinc-200 font-mono placeholder:text-zinc-600 outline-none caret-green-400"
        />
      </div>
    </div>
  );
}
