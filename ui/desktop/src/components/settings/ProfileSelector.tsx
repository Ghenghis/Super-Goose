import { useSettingsBridge } from '../../utils/settingsBridge';

const PROFILES = [
  { id: 'default', label: 'Default', desc: 'Balanced general-purpose agent' },
  { id: 'code-focused', label: 'Code-Focused', desc: 'Optimized for coding tasks with structured output' },
  { id: 'research', label: 'Research', desc: 'Deep exploration with extended reasoning' },
  { id: 'creative', label: 'Creative', desc: 'Open-ended generation with higher temperature' },
] as const;

export type ProfileId = (typeof PROFILES)[number]['id'];

export function ProfileSelector() {
  const { value: profile, setValue: setProfile, isLoading } = useSettingsBridge<ProfileId>(
    'agentProfile',
    'default'
  );

  const selectProfile = async (id: ProfileId) => {
    await setProfile(id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">Agent Profile</h3>
        {isLoading && <span className="text-xs text-text-muted">Loading...</span>}
      </div>
      <div className="space-y-2">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => selectProfile(p.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              profile === p.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-border-default bg-background-default hover:bg-background-muted'
            }`}
          >
            <div className="text-sm font-medium text-text-default">{p.label}</div>
            <div className="text-xs text-text-muted mt-0.5">{p.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
