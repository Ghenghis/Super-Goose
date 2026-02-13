import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3284';

const MODES = [
  { id: 'freeform', label: 'Freeform', desc: 'Open-ended chat & research' },
  { id: 'structured', label: 'Structured', desc: 'Code-Test-Fix pipeline' },
  { id: 'auto', label: 'Auto', desc: 'CoreSelector picks best core' },
] as const;

type ModeId = (typeof MODES)[number]['id'];

export default function ModeSelector() {
  const [mode, setMode] = useState<ModeId>('auto');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings/execution_mode`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setMode(data.value as ModeId);
      })
      .catch(() => {});
  }, []);

  const selectMode = async (id: ModeId) => {
    setMode(id);
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/settings/execution_mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: id }),
      });
    } catch {
      /* silent */
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">Execution Mode</h3>
        {saving && <span className="text-xs text-text-muted">Saving...</span>}
      </div>
      <div className="space-y-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => selectMode(m.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              mode === m.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-border-default bg-background-default hover:bg-background-muted'
            }`}
          >
            <div className="text-sm font-medium text-text-default">{m.label}</div>
            <div className="text-xs text-text-muted mt-0.5">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
