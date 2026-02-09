import { useState } from 'react';
import { Message } from '../../api';
import { getTextAndImageContent } from '../../types/message';
import { More } from '../icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';

interface ExportConversationProps {
  messages: Message[];
  sessionId: string;
}

function messagesToMarkdown(messages: Message[]): string {
  const lines: string[] = [];
  lines.push('# Conversation Export');
  lines.push('');

  for (const message of messages) {
    const { textContent } = getTextAndImageContent(message);
    if (!textContent.trim()) continue;

    const role = message.role === 'user' ? 'User' : 'Goose';
    const date = new Date(message.created * 1000);
    const timestamp = date.toLocaleString();

    lines.push(`## ${role}`);
    lines.push(`*${timestamp}*`);
    lines.push('');
    lines.push(textContent.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function messagesToJson(messages: Message[]): string {
  const exported = messages.map((message) => {
    const { textContent } = getTextAndImageContent(message);
    return {
      id: message.id,
      role: message.role,
      content: textContent.trim(),
      created: message.created,
      timestamp: new Date(message.created * 1000).toISOString(),
    };
  }).filter((m) => m.content.length > 0);

  return JSON.stringify(exported, null, 2);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ExportConversation({ messages, sessionId }: ExportConversationProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const handleExportJson = () => {
    const json = messagesToJson(messages);
    const filename = `conversation-${sessionId.slice(0, 8)}.json`;
    downloadFile(json, filename, 'application/json');
  };

  const handleExportMarkdown = () => {
    const markdown = messagesToMarkdown(messages);
    const filename = `conversation-${sessionId.slice(0, 8)}.md`;
    downloadFile(markdown, filename, 'text/markdown');
  };

  const handleCopyAll = async () => {
    try {
      const markdown = messagesToMarkdown(messages);
      await navigator.clipboard.writeText(markdown);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (err) {
      console.error('Failed to copy conversation:', err);
      setCopyStatus('Failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  if (messages.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-default transition-colors duration-200 hover:cursor-pointer"
          aria-label="Export conversation"
          title="Export conversation"
        >
          <More className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Export Conversation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleExportJson}>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span>Export as JSON</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportMarkdown}>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>Export as Markdown</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyAll}>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>{copyStatus ?? 'Copy All'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
