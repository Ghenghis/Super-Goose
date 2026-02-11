import React, { useState } from 'react';
import {
  Bookmark,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';

interface BookmarkEntry {
  id: string;
  label: string;
  description: string;
  sessionId: string;
  sessionName: string;
  timestamp: string;
  messageIndex: number;
}

const MOCK_BOOKMARKS: BookmarkEntry[] = [
  {
    id: 'bm-001',
    label: 'Auth flow fix',
    description: 'Fixed the OAuth2 callback handling that was dropping state parameters on redirect.',
    sessionId: 'sess-001',
    sessionName: 'Refactor authentication module',
    timestamp: '2026-02-10T14:32:00Z',
    messageIndex: 12,
  },
  {
    id: 'bm-002',
    label: 'Database schema migration',
    description: 'Created migration script to add composite index on (user_id, created_at) columns.',
    sessionId: 'sess-002',
    sessionName: 'Fix database connection pooling',
    timestamp: '2026-02-09T11:15:00Z',
    messageIndex: 8,
  },
  {
    id: 'bm-003',
    label: 'Stripe webhook handler',
    description: 'Implemented idempotent webhook processing for payment_intent.succeeded events.',
    sessionId: 'sess-003',
    sessionName: 'Add unit tests for payment service',
    timestamp: '2026-02-08T16:45:00Z',
    messageIndex: 22,
  },
  {
    id: 'bm-004',
    label: 'K8s health probes',
    description: 'Added liveness and readiness probes with appropriate timeouts and thresholds.',
    sessionId: 'sess-004',
    sessionName: 'Deploy staging environment',
    timestamp: '2026-02-07T09:20:00Z',
    messageIndex: 5,
  },
  {
    id: 'bm-005',
    label: 'Image optimization results',
    description: 'Benchmark results showing 3.2x throughput improvement after Sharp migration.',
    sessionId: 'sess-005',
    sessionName: 'Optimize image processing pipeline',
    timestamp: '2026-02-06T13:50:00Z',
    messageIndex: 15,
  },
  {
    id: 'bm-006',
    label: 'Error boundary pattern',
    description: 'React error boundary implementation with fallback UI and error reporting.',
    sessionId: 'sess-001',
    sessionName: 'Refactor authentication module',
    timestamp: '2026-02-10T15:10:00Z',
    messageIndex: 18,
  },
  {
    id: 'bm-007',
    label: 'Connection pool config',
    description: 'Optimal pool settings: min=5, max=25, idle_timeout=30s, connection_timeout=5s.',
    sessionId: 'sess-002',
    sessionName: 'Fix database connection pooling',
    timestamp: '2026-02-09T14:30:00Z',
    messageIndex: 30,
  },
  {
    id: 'bm-008',
    label: 'CI pipeline fix',
    description: 'Fixed flaky test by adding proper async cleanup in afterEach hooks.',
    sessionId: 'sess-003',
    sessionName: 'Add unit tests for payment service',
    timestamp: '2026-02-08T18:00:00Z',
    messageIndex: 35,
  },
  {
    id: 'bm-009',
    label: 'HPA tuning notes',
    description: 'CPU target at 70%, memory at 80%, min replicas 2, max replicas 10.',
    sessionId: 'sess-004',
    sessionName: 'Deploy staging environment',
    timestamp: '2026-02-07T10:45:00Z',
    messageIndex: 11,
  },
  {
    id: 'bm-010',
    label: 'WebP quality matrix',
    description: 'Quality vs file size comparison: q75 = 85KB avg, q60 = 52KB avg, q50 = 38KB avg.',
    sessionId: 'sess-005',
    sessionName: 'Optimize image processing pipeline',
    timestamp: '2026-02-06T15:20:00Z',
    messageIndex: 25,
  },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupBySession(bookmarks: BookmarkEntry[]): Record<string, BookmarkEntry[]> {
  const groups: Record<string, BookmarkEntry[]> = {};
  for (const bm of bookmarks) {
    if (!groups[bm.sessionName]) {
      groups[bm.sessionName] = [];
    }
    groups[bm.sessionName].push(bm);
  }
  return groups;
}

const BookmarkManager: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(MOCK_BOOKMARKS);
  const [showCreateHint, setShowCreateHint] = useState(false);

  const handleDelete = (id: string) => {
    setBookmarks((prev) => prev.filter((bm) => bm.id !== id));
  };

  const handleJumpTo = (bookmark: BookmarkEntry) => {
    // In a real implementation, this would navigate to the session and scroll to the message
    console.log(`Jumping to session ${bookmark.sessionId}, message ${bookmark.messageIndex}`);
  };

  const handleCreateBookmark = () => {
    setShowCreateHint(true);
    setTimeout(() => setShowCreateHint(false), 3000);
  };

  const grouped = groupBySession(bookmarks);
  const sessionNames = Object.keys(grouped).sort();

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex justify-between items-center mb-1">
              <h1 className="text-4xl font-light">Bookmarks</h1>
              <Button variant="outline" size="sm" onClick={handleCreateBookmark}>
                <Plus className="w-4 h-4" />
                Create Bookmark
              </Button>
            </div>
            <p className="text-sm text-text-muted mt-2">
              {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''} across{' '}
              {sessionNames.length} session{sessionNames.length !== 1 ? 's' : ''}
            </p>
            {showCreateHint && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Use /bookmark in a chat session to create a bookmark at the current point.
              </p>
            )}
          </div>
        </div>

        {/* Bookmark list */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-8">
            {bookmarks.length === 0 ? (
              <div className="text-center py-12">
                <Bookmark className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
                <p className="text-sm text-text-muted">No bookmarks yet</p>
                <p className="text-xs text-text-muted mt-1">
                  Use /bookmark in a chat to save important points
                </p>
              </div>
            ) : (
              sessionNames.map((sessionName) => (
                <div key={sessionName}>
                  {/* Session group header */}
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                    <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                      {sessionName}
                    </h2>
                  </div>

                  {/* Bookmarks in this session */}
                  <div className="space-y-2">
                    {grouped[sessionName].map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className="border border-border-default rounded-lg bg-background-default hover:bg-background-muted/30 transition-colors"
                      >
                        <div className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Bookmark className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                <h3 className="text-sm font-medium text-text-default truncate">
                                  {bookmark.label}
                                </h3>
                              </div>
                              <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                {bookmark.description}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                                  <Clock className="w-3 h-3" />
                                  {formatTimestamp(bookmark.timestamp)}
                                </span>
                                <span className="text-xs text-text-muted">
                                  Message #{bookmark.messageIndex}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => handleJumpTo(bookmark)}
                                title="Jump to this bookmark"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => handleDelete(bookmark.id)}
                                title="Delete bookmark"
                                className="text-text-muted hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default BookmarkManager;
