import React, { useState, useMemo } from 'react';
import { Search, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';

interface SearchResult {
  id: string;
  snippet: string;
  lineNumber: number;
  matchStart: number;
  matchEnd: number;
}

interface SessionSearchGroup {
  sessionId: string;
  sessionName: string;
  date: string;
  results: SearchResult[];
}

const MOCK_SEARCH_DATA: SessionSearchGroup[] = [
  {
    sessionId: 'sess-001',
    sessionName: 'Refactor authentication module',
    date: '2026-02-10',
    results: [
      {
        id: 'r1',
        snippet: 'Updated the JWT token validation to use RS256 algorithm instead of HS256 for better security.',
        lineNumber: 42,
        matchStart: 12,
        matchEnd: 21,
      },
      {
        id: 'r2',
        snippet: 'Added refresh token rotation to prevent token reuse attacks in the auth middleware.',
        lineNumber: 87,
        matchStart: 6,
        matchEnd: 19,
      },
    ],
  },
  {
    sessionId: 'sess-002',
    sessionName: 'Fix database connection pooling',
    date: '2026-02-09',
    results: [
      {
        id: 'r3',
        snippet: 'Connection pool max size increased from 10 to 25 to handle concurrent requests better.',
        lineNumber: 15,
        matchStart: 0,
        matchEnd: 15,
      },
      {
        id: 'r4',
        snippet: 'Added connection health checks with a 30-second interval to detect stale connections.',
        lineNumber: 33,
        matchStart: 6,
        matchEnd: 16,
      },
      {
        id: 'r5',
        snippet: 'Implemented connection retry logic with exponential backoff for transient failures.',
        lineNumber: 58,
        matchStart: 12,
        matchEnd: 22,
      },
    ],
  },
  {
    sessionId: 'sess-003',
    sessionName: 'Add unit tests for payment service',
    date: '2026-02-08',
    results: [
      {
        id: 'r6',
        snippet: 'Created mock Stripe client for testing payment intent creation and confirmation flows.',
        lineNumber: 5,
        matchStart: 8,
        matchEnd: 12,
      },
      {
        id: 'r7',
        snippet: 'Test coverage for payment webhooks increased from 45% to 92% with edge case handling.',
        lineNumber: 120,
        matchStart: 5,
        matchEnd: 13,
      },
    ],
  },
  {
    sessionId: 'sess-004',
    sessionName: 'Deploy staging environment',
    date: '2026-02-07',
    results: [
      {
        id: 'r8',
        snippet: 'Configured Kubernetes deployment manifests with resource limits and health probes.',
        lineNumber: 1,
        matchStart: 11,
        matchEnd: 21,
      },
      {
        id: 'r9',
        snippet: 'Set up horizontal pod autoscaler targeting 70% CPU utilization threshold.',
        lineNumber: 44,
        matchStart: 7,
        matchEnd: 17,
      },
    ],
  },
  {
    sessionId: 'sess-005',
    sessionName: 'Optimize image processing pipeline',
    date: '2026-02-06',
    results: [
      {
        id: 'r10',
        snippet: 'Switched from ImageMagick to Sharp for 3x faster thumbnail generation.',
        lineNumber: 22,
        matchStart: 14,
        matchEnd: 25,
      },
      {
        id: 'r11',
        snippet: 'Added WebP format support with quality optimization targeting sub-100KB file sizes.',
        lineNumber: 67,
        matchStart: 6,
        matchEnd: 10,
      },
      {
        id: 'r12',
        snippet: 'Implemented lazy loading for gallery images with intersection observer pattern.',
        lineNumber: 93,
        matchStart: 12,
        matchEnd: 24,
      },
    ],
  },
];

const HighlightedSnippet: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) {
    return <span className="text-xs text-text-muted">{text}</span>;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className="text-xs text-text-muted">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/50 text-text-default rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

const SearchSidebar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return MOCK_SEARCH_DATA;

    const lowerQuery = query.toLowerCase();
    return MOCK_SEARCH_DATA.map((group) => ({
      ...group,
      results: group.results.filter(
        (r) =>
          r.snippet.toLowerCase().includes(lowerQuery) ||
          group.sessionName.toLowerCase().includes(lowerQuery)
      ),
    })).filter((group) => group.results.length > 0);
  }, [query]);

  const totalResults = filteredGroups.reduce((sum, g) => sum + g.results.length, 0);

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [sessionId]: prev[sessionId] === undefined ? false : !prev[sessionId],
    }));
  };

  const isExpanded = (sessionId: string) => {
    return expandedSessions[sessionId] !== false;
  };

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-4xl font-light">Search</h1>
            </div>
            <p className="text-sm text-text-muted mb-4">
              Search across all sessions for messages, code, and context.
            </p>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search sessions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            {query.trim() && (
              <p className="text-xs text-text-muted mt-2">
                {totalResults} result{totalResults !== 1 ? 's' : ''} across{' '}
                {filteredGroups.length} session{filteredGroups.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-3 pb-8">
            {filteredGroups.length === 0 && query.trim() ? (
              <div className="text-center py-12">
                <Search className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
                <p className="text-sm text-text-muted">No results found for "{query}"</p>
                <p className="text-xs text-text-muted mt-1">Try different keywords or check spelling</p>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.sessionId}
                  className="border border-border-default rounded-lg overflow-hidden bg-background-default"
                >
                  {/* Session header */}
                  <button
                    onClick={() => toggleSession(group.sessionId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-background-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded(group.sessionId) ? (
                        <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                      )}
                      <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <span className="text-sm font-medium text-text-default truncate">
                        {group.sessionName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs text-text-muted">{group.date}</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {group.results.length}
                      </span>
                    </div>
                  </button>

                  {/* Results list */}
                  {isExpanded(group.sessionId) && (
                    <div className="border-t border-border-default">
                      {group.results.map((result, idx) => (
                        <div
                          key={result.id}
                          className={`px-4 py-2.5 hover:bg-background-muted/50 cursor-pointer transition-colors ${
                            idx < group.results.length - 1 ? 'border-b border-border-default/50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-text-muted font-mono flex-shrink-0 mt-0.5 w-8 text-right">
                              L{result.lineNumber}
                            </span>
                            <HighlightedSnippet text={result.snippet} query={query} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default SearchSidebar;
