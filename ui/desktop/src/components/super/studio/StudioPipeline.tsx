/**
 * StudioPipeline -- Main container with 6 tabs for the studio pipeline view.
 *
 * Tabs: Plan | Code | Test | Build | Deploy | Monitor
 *
 * Each tab renders a presentational component that accepts data via props.
 * Uses sg-* CSS classes and design tokens, scoped to .super-goose-panel.
 */

import { useState } from 'react';
import { PlanTab, type PlanTabProps } from './PlanTab';
import { CodeTab, type CodeTabProps } from './CodeTab';
import { TestTab, type TestTabProps } from './TestTab';
import { BuildTab, type BuildTabProps } from './BuildTab';
import { DeployTab, type DeployTabProps } from './DeployTab';
import { MonitorTab, type MonitorTabProps } from './MonitorTab';
import type { StudioTabStatus } from './PlanTab';

export type StudioTabId = 'plan' | 'code' | 'test' | 'build' | 'deploy' | 'monitor';

interface TabConfig {
  id: StudioTabId;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'plan', label: 'Plan', icon: '\uD83E\uDDE0' },
  { id: 'code', label: 'Code', icon: '\uD83D\uDCBB' },
  { id: 'test', label: 'Test', icon: '\uD83E\uDDEA' },
  { id: 'build', label: 'Build', icon: '\uD83D\uDD28' },
  { id: 'deploy', label: 'Deploy', icon: '\uD83D\uDE80' },
  { id: 'monitor', label: 'Monitor', icon: '\uD83D\uDCCA' },
];

export interface StudioPipelineProps {
  /** Per-tab status indicators */
  tabStatuses?: Partial<Record<StudioTabId, StudioTabStatus>>;
  /** Props forwarded to each tab */
  plan?: PlanTabProps;
  code?: CodeTabProps;
  test?: TestTabProps;
  build?: BuildTabProps;
  deploy?: DeployTabProps;
  monitor?: MonitorTabProps;
  /** Initially active tab */
  defaultTab?: StudioTabId;
}

export function StudioPipeline({
  tabStatuses = {},
  plan = {},
  code = {},
  test = {},
  build = {},
  deploy = {},
  monitor = {},
  defaultTab = 'plan',
}: StudioPipelineProps) {
  const [activeTab, setActiveTab] = useState<StudioTabId>(defaultTab);

  const getTabStatusColor = (tabId: StudioTabId): string | undefined => {
    const status = tabStatuses[tabId];
    if (!status || status === 'idle') return undefined;
    const colors: Record<StudioTabStatus, string> = {
      idle: 'var(--sg-text-4)',
      running: 'var(--sg-sky)',
      success: 'var(--sg-emerald)',
      error: 'var(--sg-red)',
    };
    return colors[status];
  };

  return (
    <div className="studio-pipeline" data-testid="studio-pipeline">
      {/* Tab bar */}
      <div className="sg-tabs" role="tablist" aria-label="Studio Pipeline">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const statusColor = getTabStatusColor(tab.id);

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`studio-tabpanel-${tab.id}`}
              className={`sg-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`studio-tab-${tab.id}`}
              style={{ position: 'relative' }}
            >
              <span style={{ marginRight: '0.375rem' }}>{tab.icon}</span>
              {tab.label}
              {/* Status indicator dot on the tab */}
              {statusColor && (
                <span
                  style={{
                    position: 'absolute',
                    top: '0.375rem',
                    right: '0.375rem',
                    width: '0.375rem',
                    height: '0.375rem',
                    borderRadius: '50%',
                    background: statusColor,
                    boxShadow: `0 0 4px ${statusColor}`,
                  }}
                  data-testid={`studio-tab-status-${tab.id}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content panel */}
      <div
        className="studio-tab-panel"
        role="tabpanel"
        id={`studio-tabpanel-${activeTab}`}
        aria-labelledby={`studio-tab-${activeTab}`}
        data-testid={`studio-tabpanel-${activeTab}`}
        style={{ padding: '0.75rem' }}
      >
        {activeTab === 'plan' && <PlanTab {...plan} />}
        {activeTab === 'code' && <CodeTab {...code} />}
        {activeTab === 'test' && <TestTab {...test} />}
        {activeTab === 'build' && <BuildTab {...build} />}
        {activeTab === 'deploy' && <DeployTab {...deploy} />}
        {activeTab === 'monitor' && <MonitorTab {...monitor} />}
      </div>
    </div>
  );
}
