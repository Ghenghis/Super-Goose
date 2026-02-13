import { useSettingsBridge } from '../../utils/settingsBridge';

const MIN_AGENTS = 1;
const MAX_AGENTS = 8;

export function AgentScaler() {
  const { value: agentCount, setValue: setAgentCount, isLoading } = useSettingsBridge<number>(
    'concurrentAgents',
    1
  );

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10);
    if (!isNaN(next) && next >= MIN_AGENTS && next <= MAX_AGENTS) {
      await setAgentCount(next);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">Concurrent Agents</h3>
        {isLoading && <span className="text-xs text-text-muted">Loading...</span>}
      </div>
      <div className="p-3 rounded-lg border border-border-default bg-background-default">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-text-default">Agent Count</div>
            <div className="text-xs text-text-muted mt-0.5">
              Number of agents that can run concurrently (1-8)
            </div>
          </div>
          <span
            className="text-lg font-mono font-bold text-text-default min-w-[2rem] text-center"
            data-testid="agent-count-display"
          >
            {agentCount}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{MIN_AGENTS}</span>
          <input
            type="range"
            min={MIN_AGENTS}
            max={MAX_AGENTS}
            step={1}
            value={agentCount}
            onChange={handleChange}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-background-muted accent-blue-500"
            data-testid="agent-count-slider"
          />
          <span className="text-xs text-text-muted">{MAX_AGENTS}</span>
        </div>
      </div>
    </div>
  );
}
