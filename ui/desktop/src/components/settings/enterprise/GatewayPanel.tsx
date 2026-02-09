import { useState, useEffect, useCallback } from 'react';
import { Switch } from '../../ui/switch';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';

interface GatewayStatus {
  healthy: boolean;
  uptime: string;
  version: string;
  auditLogging: boolean;
  permissions: {
    total: number;
    granted: number;
    denied: number;
  };
}

const DEFAULT_STATUS: GatewayStatus = {
  healthy: false,
  uptime: '--',
  version: '--',
  auditLogging: false,
  permissions: {
    total: 0,
    granted: 0,
    denied: 0,
  },
};

export default function GatewayPanel() {
  const [status, setStatus] = useState<GatewayStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [auditLogging, setAuditLogging] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/enterprise/gateway/status');
      if (response.ok) {
        const data: GatewayStatus = await response.json();
        setStatus(data);
        setAuditLogging(data.auditLogging);
      }
    } catch {
      console.debug('Enterprise gateway status not available');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleAuditToggle = (enabled: boolean) => {
    setAuditLogging(enabled);
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-background-muted rounded"></div>
          <div className="h-8 bg-background-muted rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Server status */}
      <Card className="rounded-lg py-3">
        <CardContent className="px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  status.healthy
                    ? 'bg-green-500 shadow-sm shadow-green-500/50'
                    : 'bg-slate-400 dark:bg-slate-600'
                }`}
              />
              <h4 className="text-xs font-medium text-text-default">Gateway Server</h4>
            </div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                status.healthy
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {status.healthy ? 'Healthy' : 'Offline'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-text-muted">Uptime</span>
              <p className="text-text-default font-medium">{status.uptime}</p>
            </div>
            <div>
              <span className="text-text-muted">Version</span>
              <p className="text-text-default font-medium">{status.version}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit logging */}
      <div className="flex items-center justify-between px-2 py-2 hover:bg-background-muted rounded-lg transition-all">
        <div>
          <h4 className="text-xs font-medium text-text-default">Audit Logging</h4>
          <p className="text-xs text-text-muted max-w-md mt-[2px]">
            Log all gateway requests for compliance and debugging
          </p>
        </div>
        <Switch checked={auditLogging} onCheckedChange={handleAuditToggle} variant="mono" />
      </div>

      {/* Permissions summary */}
      <div className="border-t border-border-default pt-4 px-2">
        <h4 className="text-xs font-medium text-text-default mb-3">Permissions Summary</h4>
        <div className="grid grid-cols-3 gap-3">
          <Card className="rounded-lg py-2">
            <CardContent className="px-3 text-center">
              <p className="text-lg font-semibold text-text-default">{status.permissions.total}</p>
              <p className="text-xs text-text-muted">Total</p>
            </CardContent>
          </Card>
          <Card className="rounded-lg py-2">
            <CardContent className="px-3 text-center">
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {status.permissions.granted}
              </p>
              <p className="text-xs text-text-muted">Granted</p>
            </CardContent>
          </Card>
          <Card className="rounded-lg py-2">
            <CardContent className="px-3 text-center">
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                {status.permissions.denied}
              </p>
              <p className="text-xs text-text-muted">Denied</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Refresh */}
      <div className="px-2">
        <Button variant="secondary" size="sm" onClick={fetchStatus}>
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
