export default function SGSettingsPanel() {
  return (
    <div className="space-y-6">
      {/* Feature toggles */}
      <div>
        <div className="sg-section-label">Feature Toggles</div>
        <div className="space-y-2">
          {[
            { name: 'Experience Store', desc: 'Cross-session learning', enabled: false },
            { name: 'Skill Library', desc: 'Reusable strategies', enabled: false },
            { name: 'Auto Core Selection', desc: 'Auto-pick best core per task', enabled: false },
            { name: 'Autonomous Mode', desc: '24/7 agent daemon', enabled: false },
            { name: 'OTA Self-Update', desc: 'Self-building pipeline', enabled: false },
          ].map(toggle => (
            <div key={toggle.name} className="sg-card flex items-center justify-between py-2">
              <div>
                <div style={{ color: 'var(--sg-text-1)', fontSize: '0.875rem' }}>{toggle.name}</div>
                <div style={{ color: 'var(--sg-text-4)', fontSize: '0.75rem' }}>{toggle.desc}</div>
              </div>
              <div style={{
                width: '2.5rem',
                height: '1.25rem',
                borderRadius: '9999px',
                background: toggle.enabled ? 'var(--sg-emerald)' : 'var(--sg-input)',
                cursor: 'pointer',
                position: 'relative',
                border: `1px solid ${toggle.enabled ? 'var(--sg-emerald)' : 'var(--sg-border)'}`,
              }}>
                <div style={{
                  width: '0.875rem',
                  height: '0.875rem',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '50%',
                  transform: `translateY(-50%) translateX(${toggle.enabled ? '1.25rem' : '0.125rem'})`,
                  transition: 'transform 0.15s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Storage info */}
      <div>
        <div className="sg-section-label">Storage</div>
        <div className="sg-card">
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Experience DB</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>Not initialized</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Skills DB</span>
            <span style={{ color: 'var(--sg-text-3)', fontSize: '0.875rem' }}>Not initialized</span>
          </div>
        </div>
      </div>

      {/* Version info */}
      <div>
        <div className="sg-section-label">Version</div>
        <div className="sg-card">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--sg-text-2)', fontSize: '0.875rem' }}>Super-Goose</span>
            <span style={{ color: 'var(--sg-gold)', fontSize: '0.875rem' }}>v1.24.05</span>
          </div>
        </div>
      </div>
    </div>
  );
}
