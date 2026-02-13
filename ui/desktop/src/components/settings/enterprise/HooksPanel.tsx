import { useState, useEffect, useCallback } from 'react';
import { Switch } from '../../ui/switch';
import { Card, CardContent } from '../../ui/card';
import { backendApi, type HookEvent } from '../../../utils/backendApi';

type LifecycleEvent = HookEvent;

const DEFAULT_EVENTS: LifecycleEvent[] = [
  // Session events
  { id: 'session_start', name: 'Session Start', category: 'session', enabled: false, recentCount: 0 },
  { id: 'session_end', name: 'Session End', category: 'session', enabled: false, recentCount: 0 },
  { id: 'session_pause', name: 'Session Pause', category: 'session', enabled: false, recentCount: 0 },
  { id: 'session_resume', name: 'Session Resume', category: 'session', enabled: false, recentCount: 0 },
  // Tools events
  { id: 'tool_call_start', name: 'Tool Call Start', category: 'tools', enabled: false, recentCount: 0 },
  { id: 'tool_call_end', name: 'Tool Call End', category: 'tools', enabled: false, recentCount: 0 },
  { id: 'tool_error', name: 'Tool Error', category: 'tools', enabled: false, recentCount: 0 },
  { id: 'tool_approval', name: 'Tool Approval', category: 'tools', enabled: false, recentCount: 0 },
  { id: 'tool_rejection', name: 'Tool Rejection', category: 'tools', enabled: false, recentCount: 0 },
  // Flow events
  { id: 'message_received', name: 'Message Received', category: 'flow', enabled: false, recentCount: 0 },
  { id: 'response_generated', name: 'Response Generated', category: 'flow', enabled: false, recentCount: 0 },
  { id: 'guardrail_triggered', name: 'Guardrail Triggered', category: 'flow', enabled: false, recentCount: 0 },
  { id: 'policy_evaluated', name: 'Policy Evaluated', category: 'flow', enabled: false, recentCount: 0 },
];

const CATEGORY_LABELS: Record<string, string> = {
  session: 'Session',
  tools: 'Tools',
  flow: 'Flow',
};

const CATEGORY_COLORS: Record<string, string> = {
  session: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  tools: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  flow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function HooksPanel() {
  const [events, setEvents] = useState<LifecycleEvent[]>(DEFAULT_EVENTS);
  const [isLoading, setIsLoading] = useState(true);

  const enabledCount = events.filter((e) => e.enabled).length;
  const totalActivity = events.reduce((sum, e) => sum + e.recentCount, 0);

  const fetchHooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await backendApi.fetchHooksConfig();
      if (data?.events && data.events.length > 0) {
        setEvents(data.events);
      } else {
        // Fallback to defaults if API not available
        setEvents(DEFAULT_EVENTS);
      }
    } catch {
      console.debug('Enterprise hooks config not available');
      setEvents(DEFAULT_EVENTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHooks();
  }, [fetchHooks]);

  const handleToggle = async (id: string, enabled: boolean) => {
    // Optimistically update UI
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, enabled } : e)));

    const success = await backendApi.toggleHook(id, enabled);
    if (!success) {
      // Revert on failure
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !enabled } : e)));
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-background-muted rounded w-1/3"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-background-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Group events by category
  const categories = ['session', 'tools', 'flow'] as const;

  return (
    <div className="space-y-4 py-2">
      {/* Summary */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs text-text-muted">
          {enabledCount}/{events.length} hooks enabled
        </p>
        <span className="text-xs text-text-muted">
          {totalActivity} recent event{totalActivity !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events by category */}
      {categories.map((category) => {
        const categoryEvents = events.filter((e) => e.category === category);
        return (
          <div key={category}>
            <div className="flex items-center gap-2 px-2 mb-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}
              >
                {CATEGORY_LABELS[category]}
              </span>
            </div>
            <Card className="rounded-lg py-1">
              <CardContent className="px-3">
                <div className="divide-y divide-border-default">
                  {categoryEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-default">{event.name}</span>
                        {event.recentCount > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-text-muted bg-background-muted">
                            {event.recentCount}
                          </span>
                        )}
                      </div>
                      <Switch
                        checked={event.enabled}
                        onCheckedChange={(checked: boolean) => handleToggle(event.id, checked)}
                        variant="mono"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
