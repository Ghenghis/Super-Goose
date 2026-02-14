import { useState } from 'react';
import { BookOpen, Play, Save } from 'lucide-react';

import { CONSCIOUS_API } from './consciousConfig';

export default function SkillManager() {
  const [skillName, setSkillName] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const executeCommand = async (text: string) => {
    setLoading(true);
    setOutput('');
    setError('');
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setOutput(data.text || 'Done');
      } else {
        const err = await res.json();
        setError(err.error || 'Command failed');
      }
    } catch {
      setError('Conscious API not reachable');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-text-subtlest" aria-hidden="true" />
        <span className="text-sm font-medium">Skills</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && skillName.trim() && executeCommand(`run skill ${skillName}`)}
          placeholder="Skill name..."
          className="flex-1 px-3 py-1.5 text-xs rounded bg-surface-secondary border border-border-subtle focus:outline-none focus:border-purple-500"
          disabled={loading}
          aria-label="Skill name"
        />
        <button
          onClick={() => executeCommand(`run skill ${skillName}`)}
          disabled={loading || !skillName.trim()}
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          aria-label="Run skill"
        >
          <Play className="h-3 w-3" aria-hidden="true" /> Run
        </button>
        <button
          onClick={() => executeCommand(`save skill ${skillName}`)}
          disabled={loading || !skillName.trim()}
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          aria-label="Save skill"
        >
          <Save className="h-3 w-3" aria-hidden="true" /> Save
        </button>
      </div>

      <button
        onClick={() => executeCommand('list skills')}
        disabled={loading}
        className="w-full px-3 py-1.5 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
        aria-label="List all skills"
      >
        {loading ? 'Loading...' : 'List All Skills'}
      </button>

      {error && <div className="text-xs text-red-400" role="alert">{error}</div>}

      {output && (
        <div className="p-2 rounded bg-surface-secondary text-xs whitespace-pre-wrap max-h-40 overflow-y-auto" role="status" aria-live="polite">
          {output}
        </div>
      )}
    </div>
  );
}