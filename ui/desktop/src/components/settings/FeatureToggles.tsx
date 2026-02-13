import { useFeatureSettings } from '../../utils/settingsBridge';
import { Switch } from '../ui/switch';

interface FeatureToggleItem {
  key: 'reflexionEnabled' | 'guardrailsEnabled' | 'costTrackingEnabled' | 'bookmarksEnabled' | 'compactionEnabled' | 'searchEnabled' | 'projectAutoDetection' | 'modelHotSwitch';
  label: string;
  desc: string;
}

const FEATURES: FeatureToggleItem[] = [
  { key: 'reflexionEnabled', label: 'Reflexion', desc: 'Learn from past failures to improve responses' },
  { key: 'guardrailsEnabled', label: 'Guardrails', desc: 'Scan messages for secrets, PII, and prompt injection' },
  { key: 'costTrackingEnabled', label: 'Cost Tracking', desc: 'Track per-message model pricing and usage costs' },
  { key: 'bookmarksEnabled', label: 'Bookmarks', desc: 'Save and restore conversation checkpoints' },
  { key: 'compactionEnabled', label: 'Auto-Compaction', desc: 'Automatically compact context when nearing limits' },
  { key: 'searchEnabled', label: 'Cross-Session Search', desc: 'Search across previous conversation sessions' },
  { key: 'projectAutoDetection', label: 'Project Detection', desc: 'Automatically detect project type and structure' },
  { key: 'modelHotSwitch', label: 'Model Hot-Switch', desc: 'Enable /model command to switch models mid-session' },
];

export function FeatureToggles() {
  const { settings, updateSetting, isLoading } = useFeatureSettings();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">Feature Toggles</h3>
        {isLoading && <span className="text-xs text-text-muted">Loading...</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FEATURES.map((feat) => (
          <div
            key={feat.key}
            className="flex items-center justify-between p-3 rounded-lg border border-border-default bg-background-default"
          >
            <div className="flex-1 min-w-0 mr-3">
              <div className="text-sm font-medium text-text-default">{feat.label}</div>
              <div className="text-xs text-text-muted mt-0.5 truncate">{feat.desc}</div>
            </div>
            <Switch
              checked={settings[feat.key] as boolean}
              onCheckedChange={async (checked: boolean) => {
                await updateSetting(feat.key, checked);
              }}
              variant="mono"
              data-testid={`toggle-${feat.key}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
