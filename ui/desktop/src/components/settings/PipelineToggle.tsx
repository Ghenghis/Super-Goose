import { useSettingsBridge } from '../../utils/settingsBridge';
import { Switch } from '../ui/switch';

export function PipelineToggle() {
  const { value: enabled, setValue: setEnabled, isLoading } = useSettingsBridge<boolean>(
    'pipelineVisualization',
    true
  );

  const handleToggle = async (checked: boolean) => {
    await setEnabled(checked);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">Pipeline Visualization</h3>
        {isLoading && <span className="text-xs text-text-muted">Loading...</span>}
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg border border-border-default bg-background-default">
        <div>
          <div className="text-sm text-text-default">Show Pipeline</div>
          <div className="text-xs text-text-muted mt-0.5">
            Real-time agent pipeline with quantum particles and stage tracking
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          variant="mono"
          data-testid="pipeline-viz-toggle"
        />
      </div>
    </div>
  );
}
