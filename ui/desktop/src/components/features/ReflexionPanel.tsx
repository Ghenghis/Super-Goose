import React, { useState } from 'react';
import { Brain, AlertTriangle, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { MainPanelLayout } from '../Layout/MainPanelLayout';

interface ReflexionEntry {
  id: string;
  timestamp: string;
  failure: string;
  lesson: string;
  sessionName: string;
  severity: 'low' | 'medium' | 'high';
  applied: boolean;
}

const MOCK_REFLEXION_ENTRIES: ReflexionEntry[] = [
  {
    id: 'ref-001',
    timestamp: '2026-02-10T14:22:00Z',
    failure: 'Attempted to modify a read-only file without checking permissions first, causing a write error that required retry.',
    lesson: 'Always check file permissions before attempting write operations. Use fs.access() or equivalent to verify write access.',
    sessionName: 'Refactor authentication module',
    severity: 'medium',
    applied: true,
  },
  {
    id: 'ref-002',
    timestamp: '2026-02-09T11:05:00Z',
    failure: 'Generated SQL migration with DROP COLUMN without first checking for dependent foreign keys, causing migration failure.',
    lesson: 'Before dropping columns, query information_schema for foreign key constraints. Drop constraints first, then the column.',
    sessionName: 'Fix database connection pooling',
    severity: 'high',
    applied: true,
  },
  {
    id: 'ref-003',
    timestamp: '2026-02-08T16:30:00Z',
    failure: 'Test assertions used toEqual on objects with Date fields, which failed due to serialization differences.',
    lesson: 'When comparing objects containing Date fields in tests, either convert to ISO strings first or use toMatchObject with expect.any(Date).',
    sessionName: 'Add unit tests for payment service',
    severity: 'low',
    applied: true,
  },
  {
    id: 'ref-004',
    timestamp: '2026-02-07T09:10:00Z',
    failure: 'Kubernetes deployment YAML used latest tag instead of specific version, making the deployment non-reproducible.',
    lesson: 'Always pin container image versions to specific tags or digests. Never use :latest in production or staging manifests.',
    sessionName: 'Deploy staging environment',
    severity: 'high',
    applied: false,
  },
  {
    id: 'ref-005',
    timestamp: '2026-02-06T13:40:00Z',
    failure: 'Image processing function ran synchronously on the main thread, blocking the event loop for large files.',
    lesson: 'Use worker threads or stream-based processing for CPU-intensive image operations. Set a file size threshold (>2MB) for async processing.',
    sessionName: 'Optimize image processing pipeline',
    severity: 'medium',
    applied: true,
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

const severityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const ReflexionPanel: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  const appliedCount = MOCK_REFLEXION_ENTRIES.filter((e) => e.applied).length;

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="bg-background-default px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <div className="flex justify-between items-center mb-1">
              <h1 className="text-4xl font-light">Reflexion</h1>
            </div>
            <p className="text-sm text-text-muted mt-2">
              Learn from mistakes. The agent records failures and applies lessons to future sessions.
            </p>

            {/* Controls */}
            <div className="flex items-center justify-between mt-4 p-3 border border-border-default rounded-lg bg-background-default">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-text-default">Reflexion Engine</p>
                  <p className="text-xs text-text-muted">
                    Inject learned lessons into agent context
                  </p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                variant="mono"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-xs text-text-muted">
                  {MOCK_REFLEXION_ENTRIES.length} total entries
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-text-muted">
                  {appliedCount} applied to context
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Entries */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-3 pb-8">
            {MOCK_REFLEXION_ENTRIES.map((entry) => {
              const isExpanded = expandedEntries[entry.id];
              return (
                <div
                  key={entry.id}
                  className="border border-border-default rounded-lg bg-background-default overflow-hidden"
                >
                  <button
                    onClick={() => toggleEntry(entry.id)}
                    className="w-full px-4 py-3 hover:bg-background-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0 text-left">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                        )}
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm text-text-default line-clamp-1">{entry.failure}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatTimestamp(entry.timestamp)}
                            </span>
                            <span className="text-xs text-text-muted">{entry.sessionName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${severityColors[entry.severity]}`}
                        >
                          {entry.severity}
                        </span>
                        {entry.applied && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            active
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-default px-4 py-3 space-y-3">
                      {/* Failure */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Failure
                          </span>
                        </div>
                        <p className="text-sm text-text-default pl-5">{entry.failure}</p>
                      </div>

                      {/* Lesson */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Lightbulb className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Lesson Learned
                          </span>
                        </div>
                        <p className="text-sm text-text-default pl-5">{entry.lesson}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </MainPanelLayout>
  );
};

export default ReflexionPanel;
