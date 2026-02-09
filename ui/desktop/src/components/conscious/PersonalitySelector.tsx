import { useState, useEffect, useCallback, useRef } from 'react';
import { User, ChevronDown } from 'lucide-react';

const CONSCIOUS_API = 'http://localhost:8999';

interface Personality {
  name: string;
  description?: string;
}

export default function PersonalitySelector() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [active, setActive] = useState('default');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchPersonalities = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/personality/list`, { signal });
      if (res.ok) {
        const data = await res.json();
        setPersonalities(data.personalities || []);
        setActive(data.active || 'default');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        /* Conscious not running */
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPersonalities(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchPersonalities]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const switchPersonality = async (name: string) => {
    try {
      await fetch(`${CONSCIOUS_API}/api/personality/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setActive(name);
      setIsOpen(false);
    } catch {
      /* offline */
    }
  };

  if (personalities.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary text-sm transition-colors"
        aria-label="Select personality profile"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <User className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="capitalize">{active}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-1 right-0 z-50 min-w-[160px] rounded-lg border border-border-subtle bg-surface-primary shadow-lg overflow-hidden"
          role="listbox"
          aria-label="Personality profiles"
        >
          {personalities.map((p) => (
            <button
              key={p.name}
              onClick={() => switchPersonality(p.name)}
              role="option"
              aria-selected={p.name === active}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary transition-colors ${
                p.name === active ? 'bg-surface-tertiary font-medium' : ''
              }`}
            >
              <span className="capitalize">{p.name}</span>
              {p.description && (
                <span className="block text-xs text-text-subtlest truncate">{p.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}