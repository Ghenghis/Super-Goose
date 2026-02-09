import React, { useState, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { wrapHTMLInCodeBlock } from '../utils/htmlSecurity';
import { isProtocolSafe, getProtocol, BLOCKED_PROTOCOLS } from '../utils/urlSecurity';
import {
  ImagePreviewCard,
  EnhancedCodeBlock,
  MermaidDiagram,
  DiffCard,
  parseDiffText,
  AudioPlayer,
  RechartsWrapper,
} from './chat_coding';

interface CodeProps extends React.ClassAttributes<HTMLElement>, React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Enhanced MarkdownCode routes fenced blocks to specialised chat_coding renderers:
//  - ```mermaid  → MermaidDiagram (interactive SVG diagrams)
//  - ```diff     → DiffCard (unified diff with additions/deletions highlighting)
//  - ```audio    → AudioPlayer (audio content playback)
//  - everything  → EnhancedCodeBlock (line numbers, fold, search, word-wrap)
const MarkdownCode = memo(
  React.forwardRef(function MarkdownCode(
    { inline, className, children, ...props }: CodeProps,
    ref: React.Ref<HTMLElement>
  ) {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');

    if (!inline && match) {
      const lang = match[1].toLowerCase();

      // Mermaid diagram rendering
      if (lang === 'mermaid') {
        return <MermaidDiagram code={code} />;
      }

      // Audio content playback
      if (lang === 'audio') {
        return <AudioPlayer src={code.trim()} />;
      }

      // Chart/data visualization rendering
      if (lang === 'chart') {
        try {
          const chartData = JSON.parse(code.trim());
          return (
            <RechartsWrapper
              data={chartData.data || []}
              type={chartData.type || 'bar'}
              xKey={chartData.xKey || 'name'}
              yKey={chartData.yKey || 'value'}
              title={chartData.title}
            />
          );
        } catch {
          // Fall through to EnhancedCodeBlock if JSON parse fails
        }
      }

      // Unified diff rendering
      if (lang === 'diff') {
        const parsed = parseDiffText(code);
        return (
          <DiffCard
            filePath={parsed.filePath || 'diff'}
            status={(parsed.status as 'added' | 'modified' | 'deleted' | 'renamed') || 'modified'}
            additions={parsed.additions}
            deletions={parsed.deletions}
            lines={parsed.lines}
          />
        );
      }

      // All other languages → EnhancedCodeBlock
      return <EnhancedCodeBlock code={code} language={lang} />;
    }

    return (
      <code ref={ref} {...props} className="break-all bg-inline-code whitespace-pre-wrap font-mono">
        {children}
      </code>
    );
  })
);

// Custom URL transform to preserve deep link URLs (spotify:, vscode:, slack:, etc.)
// React-markdown's default only allows http/https/mailto and strips all other protocols
// We allow all protocols except dangerous ones (javascript:, data:, file:, etc.)
const customUrlTransform = (url: string): string => {
  try {
    const protocol = new URL(url).protocol;
    if (BLOCKED_PROTOCOLS.includes(protocol)) {
      return '';
    }
  } catch {
    // Not a valid URL, allow it (could be relative path)
  }
  return url;
};

const MarkdownContent = memo(function MarkdownContent({
  content,
  className = '',
}: MarkdownContentProps) {
  const [processedContent, setProcessedContent] = useState(content);

  useEffect(() => {
    try {
      const processed = wrapHTMLInCodeBlock(content);
      setProcessedContent(processed);
    } catch (error) {
      console.error('Error processing content:', error);
      setProcessedContent(content);
    }
  }, [content]);

  return (
    <div
      className={`w-full overflow-x-hidden prose prose-sm text-text-default dark:prose-invert max-w-full word-break font-sans
      prose-pre:p-0 prose-pre:m-0 !p-0
      prose-code:break-all prose-code:whitespace-pre-wrap prose-code:font-mono
      prose-a:break-all prose-a:overflow-wrap-anywhere
      prose-table:table prose-table:w-full
      prose-blockquote:text-inherit
      prose-td:border prose-td:border-border-default prose-td:p-2
      prose-th:border prose-th:border-border-default prose-th:p-2
      prose-thead:bg-background-default
      prose-h1:text-2xl prose-h1:font-normal prose-h1:mb-5 prose-h1:mt-0 prose-h1:font-sans
      prose-h2:text-xl prose-h2:font-normal prose-h2:mb-4 prose-h2:mt-4 prose-h2:font-sans
      prose-h3:text-lg prose-h3:font-normal prose-h3:mb-3 prose-h3:mt-3 prose-h3:font-sans
      prose-p:mt-0 prose-p:mb-2 prose-p:font-sans
      prose-ol:my-2 prose-ol:font-sans
      prose-ul:mt-0 prose-ul:mb-3 prose-ul:font-sans
      prose-li:m-0 prose-li:font-sans ${className}`}
    >
      <ReactMarkdown
        urlTransform={customUrlTransform}
        remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              errorColor: '#cc0000',
              strict: false,
            },
          ],
        ]}
        components={{
          a: (props) => {
            return (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!props.href) return;

                  if (isProtocolSafe(props.href)) {
                    window.electron.openExternal(props.href);
                  } else {
                    const protocol = getProtocol(props.href);
                    if (!protocol) return;

                    const result = await window.electron.showMessageBox({
                      type: 'question',
                      buttons: ['Cancel', 'Open'],
                      defaultId: 0,
                      title: 'Open External Link',
                      message: `Open ${protocol} link?`,
                      detail: `This will open: ${props.href}`,
                    });
                    if (result.response === 1) {
                      window.electron.openExternal(props.href);
                    }
                  }
                }}
              />
            );
          },
          img: ({ src, alt, ...imgProps }) => {
            if (src) {
              return (
                <ImagePreviewCard
                  src={src}
                  alt={alt || 'Image'}
                  className="my-2"
                />
              );
            }
            return <img src={src} alt={alt} {...imgProps} />;
          },
          code: MarkdownCode,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownContent;
