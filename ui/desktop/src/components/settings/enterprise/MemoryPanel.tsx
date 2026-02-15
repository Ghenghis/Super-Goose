import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { backendApi, type MemorySubsystem } from '../../../utils/backendApi';

const DEFAULT_SUBSYSTEMS: MemorySubsystem[] = [
  { id: 'working', name: 'Working', status: 'inactive', itemCount: 0, decayRate: 'N/A' },
  { id: 'episodic', name: 'Episodic', status: 'inactive', itemCount: 0, decayRate: 'N/A' },
  { id: 'semantic', name: 'Semantic', status: 'inactive', itemCount: 0, decayRate: 'N/A' },
  { id: 'procedural', name: 'Procedural', status: 'inactive', itemCount: 0, decayRate: 'N/A' },
];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-slate-400 dark:bg-slate-600',
  degraded: 'bg-amber-500',
};

export default function MemoryPanel() {
  const [subsystems, setSubsystems] = useState<MemorySubsystem[]>(DEFAULT_SUBSYSTEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const fetchMemoryStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await backendApi.fetchMemorySummary();
      if (data?.subsystems) {
        setSubsystems(data.subsystems);
      } else {
        // Fallback to defaults if API not available
        setSubsystems(DEFAULT_SUBSYSTEMS);
      }
    } catch {
      console.debug('Enterprise memory status not available');
      setSubsystems(DEFAULT_SUBSYSTEMS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemoryStatus();
  }, [fetchMemoryStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    console.debug('Memory search:', searchQuery);
    // In production, this would query the memory search API
  };

  const handleConsolidate = async () => {
    setIsConsolidating(true);
    try {
      const result = await backendApi.consolidateMemory();
      if (result) {
        console.debug('Memory consolidation:', result.message);
      }
    } catch {
      console.debug('Memory consolidation not available');
    } finally {
      setTimeout(() => setIsConsolidating(false), 1500);
    }
  };

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      subsystems,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goose-memory-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      console.debug('Imported memory data:', text.substring(0, 100));
    } catch (err) {
      console.error('Failed to read memory file:', err);
    }
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-background-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Subsystem status cards */}
      <div className="grid grid-cols-2 gap-3">
        {subsystems.map((subsystem) => (
          <Card key={subsystem.id} className="rounded-lg py-3">
            <CardContent className="px-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[subsystem.status]}`}
                  />
                  <h4 className="text-xs font-medium text-text-default">{subsystem.name}</h4>
                </div>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[subsystem.status]}`}
                >
                  {subsystem.status}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Items</span>
                  <span className="text-text-default font-medium">{subsystem.itemCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Decay Rate</span>
                  <span className="text-text-default font-medium">{subsystem.decayRate}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Memory search */}
      <div className="px-2">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            type="text"
            placeholder="Search memory..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs h-8"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      </div>

      {/* Actions */}
      <div className="border-t border-border-default pt-4 px-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleConsolidate}
            disabled={isConsolidating}
          >
            {isConsolidating ? 'Consolidating...' : 'Consolidate'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            Export
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button variant="secondary" size="sm" onClick={handleImport}>
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
