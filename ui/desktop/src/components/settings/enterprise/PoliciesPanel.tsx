import { useState, useEffect, useCallback, useRef } from 'react';
import { Switch } from '../../ui/switch';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';

interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
}

export default function PoliciesPanel() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCount = rules.filter((r) => r.enabled).length;

  const fetchPolicies = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/enterprise/policies/rules');
      if (response.ok) {
        const data = await response.json();
        if (data.rules) {
          setRules(data.rules);
        }
        if (typeof data.dryRunMode === 'boolean') {
          setDryRunMode(data.dryRunMode);
        }
      }
    } catch {
      console.debug('Enterprise policies not available');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleRuleToggle = (id: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
  };

  const handleDryRunToggle = (enabled: boolean) => {
    setDryRunMode(enabled);
  };

  const handleImportYaml = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      console.log('Imported YAML policy:', text);
      // In a real implementation, this would parse and send to the backend
    } catch (err) {
      console.error('Failed to read policy file:', err);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-background-muted rounded w-1/4"></div>
          <div className="h-16 bg-background-muted rounded"></div>
          <div className="h-16 bg-background-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Summary */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs text-text-muted">
          {activeCount} active rule{activeCount !== 1 ? 's' : ''}
        </p>
        {dryRunMode && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            Dry Run
          </span>
        )}
      </div>

      {/* Rules list */}
      {rules.length > 0 ? (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className="rounded-lg py-2">
              <CardContent className="px-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-medium text-text-default">{rule.name}</h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                      <span className="truncate">
                        <span className="font-medium">When:</span> {rule.condition}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
                      <span className="truncate">
                        <span className="font-medium">Then:</span> {rule.action}
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked: boolean) => handleRuleToggle(rule.id, checked)}
                    variant="mono"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-lg py-4">
          <CardContent className="px-3 text-center">
            <p className="text-xs text-text-muted">No policy rules configured</p>
            <p className="text-xs text-text-muted mt-1">Import a YAML file to add rules</p>
          </CardContent>
        </Card>
      )}

      {/* Dry-run toggle */}
      <div className="flex items-center justify-between px-2 py-2 hover:bg-background-muted rounded-lg transition-all">
        <div>
          <h4 className="text-xs font-medium text-text-default">Dry-Run Mode</h4>
          <p className="text-xs text-text-muted max-w-md mt-[2px]">
            Log policy violations without enforcing them
          </p>
        </div>
        <Switch checked={dryRunMode} onCheckedChange={handleDryRunToggle} variant="mono" />
      </div>

      {/* Import */}
      <div className="px-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button variant="secondary" size="sm" onClick={handleImportYaml}>
          Import YAML
        </Button>
      </div>
    </div>
  );
}
