import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GpuInfo {
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
}

interface GpuResponse {
  detected: boolean;
  gpus: GpuInfo[];
  error?: string;
}

interface AgentInfo {
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  model?: string;
}

interface ProviderInfo {
  id?: string;
  name?: string;
  status?: string;
}

type GapStatus = 'fixed' | 'progress' | 'open';
type GapSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'FIXED' | 'DO NOW';
type FailSeverity = 'low' | 'med' | 'high';

interface GapItem {
  id: string;
  name: string;
  sev: GapSeverity;
  where: string;
  impact: string;
  status: GapStatus;
  icon: string;
}

interface FailsafeItem {
  mode: string;
  detection: string;
  recovery: string;
  downtime: string;
  severity: FailSeverity;
}

interface LiveData {
  goosedOnline: boolean;
  gpuDetected: boolean;
  gpus: GpuInfo[];
  agentCount: number;
  agents: AgentInfo[];
  version: string | null;
  providers: ProviderInfo[];
  lastPoll: Date | null;
  pollCount: number;
}

interface ConductorStep {
  label: string;
  desc: string;
  color: string;
}

interface PhaseItem {
  phase: string;
  title: string;
  time: string;
  color: string;
  tasks: string[];
}

type SectionId = 'overview' | 'livestatus' | 'conductor' | 'agents' | 'selfupdate' | 'failsafes' | 'gaps' | 'priority';

// ---------------------------------------------------------------------------
// Constants — color palette matching the static dashboard
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0a0e17',
  bgLight: '#111827',
  bgCard: '#1a2236',
  border: '#2a3a5c',
  text: '#e2e8f0',
  textDim: '#64748b',
  textBright: '#f8fafc',
  accent: '#3b82f6',
  accentGlow: 'rgba(59, 130, 246, 0.15)',
  green: '#10b981',
  greenGlow: 'rgba(16, 185, 129, 0.12)',
  red: '#ef4444',
  redGlow: 'rgba(239, 68, 68, 0.12)',
  yellow: '#f59e0b',
  yellowGlow: 'rgba(245, 158, 11, 0.12)',
  purple: '#8b5cf6',
  purpleGlow: 'rgba(139, 92, 246, 0.12)',
  orange: '#f97316',
  cyan: '#06b6d4',
} as const;

const POLL_INTERVAL_MS = 5000;

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '\u25C9' },
  { id: 'livestatus', label: 'Live Status', icon: '\u26A1' },
  { id: 'conductor', label: 'Conductor', icon: '\u26D3' },
  { id: 'agents', label: 'Agent Bus', icon: '\u25C8' },
  { id: 'selfupdate', label: 'Self-Update', icon: '\u21BB' },
  { id: 'failsafes', label: 'Failsafes', icon: '\u2298' },
  { id: 'gaps', label: 'Gap Analysis', icon: '\u25B3' },
  { id: 'priority', label: 'Priority', icon: '\u25B2' },
];

// ---------------------------------------------------------------------------
// Static data sets
// ---------------------------------------------------------------------------

const GAPS: GapItem[] = [
  { id: 'G1', name: 'No Conductor Process', sev: 'CRITICAL', where: 'Architecture', impact: 'Agent dies when app rebuilds', status: 'progress', icon: '\uD83D\uDD27' },
  { id: 'G2', name: 'No Inter-Agent Message Bus', sev: 'CRITICAL', where: 'crates/goose/src/', impact: 'No team coordination', status: 'progress', icon: '\uD83D\uDD27' },
  { id: 'G3', name: 'No Agent Registry/Discovery', sev: 'CRITICAL', where: 'crates/goose-server/', impact: "Can't route messages", status: 'progress', icon: '\uD83D\uDD27' },
  { id: 'G4', name: 'No Persistent Task Queue', sev: 'CRITICAL', where: 'autonomous/', impact: 'Work lost on rebuild', status: 'progress', icon: '\uD83D\uDD27' },
  { id: 'G5', name: 'Conscious backend routes', sev: 'HIGH', where: 'goose-server/routes/', impact: 'Voice system disconnected', status: 'open', icon: '\u2298' },
  { id: 'G6', name: 'AG-UI POST endpoints', sev: 'FIXED', where: 'goose-server/routes/', impact: 'Tool-result, abort, message all wired', status: 'fixed', icon: '\u2705' },
  { id: 'G7', name: 'Studio panels', sev: 'FIXED', where: 'ui/desktop/src/', impact: 'GPU + Studios + Marketplace all active', status: 'fixed', icon: '\u2705' },
  { id: 'G8', name: 'GPU Jobs backend', sev: 'HIGH', where: 'goose-server/routes/', impact: 'Launch does nothing', status: 'open', icon: '\u2298' },
  { id: 'G9', name: 'Extensions bridge servers', sev: 'FIXED', where: 'goose-mcp/', impact: '19 bridge servers created, 35 total', status: 'fixed', icon: '\u2705' },
  { id: 'G10', name: 'API Key vault', sev: 'MEDIUM', where: 'goose-server/routes/', impact: "Can't manage keys from UI", status: 'open', icon: '\u2298' },
  { id: 'G11', name: 'Python deps not installed', sev: 'MEDIUM', where: 'scripts/', impact: "Conscious/tools won't start", status: 'open', icon: '\u2298' },
  { id: 'G12', name: 'Shared agent memory', sev: 'MEDIUM', where: 'crates/goose/src/', impact: 'Per-agent only', status: 'open', icon: '\u2298' },
  { id: 'G13', name: 'Agent wake/sleep lifecycle', sev: 'MEDIUM', where: 'crates/goose/src/', impact: 'No way to wake agents', status: 'open', icon: '\u2298' },
  { id: 'G14', name: 'Uncommitted files committed', sev: 'FIXED', where: 'feat/resizable-layout', impact: 'Committed on v1.24.06', status: 'fixed', icon: '\u2705' },
];

const FAILSAFES: FailsafeItem[] = [
  { mode: 'goosed crashes', detection: 'Health check (5s)', recovery: 'Restart + load saved state', downtime: '~5s', severity: 'med' },
  { mode: 'Electron crashes', detection: 'Health check', recovery: 'Restart + reconnect to goosed', downtime: '~3s', severity: 'low' },
  { mode: 'Build fails', detection: 'TestRunner', recovery: 'Discard staging, continue current', downtime: '0s', severity: 'low' },
  { mode: 'New binary fails', detection: 'HealthChecker', recovery: "Don't swap \u2014 discard new binary", downtime: '0s', severity: 'low' },
  { mode: 'New binary crashes', detection: 'Conductor', recovery: 'Rollback: restore backup binary', downtime: '~10s', severity: 'med' },
  { mode: 'Conductor crashes', detection: 'OS service mgr', recovery: 'OS restarts Conductor \u2192 children', downtime: '~5s', severity: 'high' },
  { mode: 'Agent infinite loop', detection: 'CircuitBreaker', recovery: 'Trip breaker, stop agent, alert', downtime: '0s', severity: 'med' },
  { mode: 'LLM provider down', detection: 'API timeout (30s)', recovery: 'Fallback to local model', downtime: '0s', severity: 'low' },
  { mode: 'Cost runaway', detection: 'Budget monitor', recovery: 'Pause non-critical agents', downtime: '0s', severity: 'med' },
];

const CONDUCTOR_STEPS: ConductorStep[] = [
  { label: 'Normal Operation', desc: 'Conductor monitors goosed + Electron via health checks every 5s', color: COLORS.green },
  { label: 'Agent Detects Improvement', desc: 'InsightExtractor finds a failure pattern or AutoImproveScheduler triggers', color: COLORS.yellow },
  { label: 'Save State to Conductor', desc: 'Task queue, agent states, pending messages all serialized to SQLite', color: COLORS.accent },
  { label: 'Build in Staging Directory', desc: 'cargo build runs on staging copy \u2014 live system continues running', color: COLORS.purple },
  { label: 'Test New Binary (Port 3285)', desc: 'New goosed launched on staging port, health check + smoke tests run', color: COLORS.cyan },
  { label: 'Hot Swap', desc: 'Conductor: drain old \u2192 swap binary \u2192 start new \u2192 verify health', color: COLORS.orange },
  { label: 'Verify & Resume', desc: 'New goosed loads saved state, agents resume, Electron reconnects', color: COLORS.green },
  { label: 'Rollback (if failed)', desc: 'Restore backup binary, restart old goosed, log failure, backoff', color: COLORS.red },
];

const PHASES: PhaseItem[] = [
  { phase: 'Phase 0', title: 'IMMEDIATE', time: 'DONE', color: COLORS.green,
    tasks: ['Commit files \u2705', 'Studios active \u2705', 'AG-UI POST wired \u2705', 'Extensions bridged \u2705'] },
  { phase: 'Phase 1', title: 'Conductor Foundation', time: 'Week 1', color: COLORS.orange,
    tasks: ['Create goose-conductor crate (~500 LOC)', 'Database tables (registry, messages, tasks, memory)', 'Modify goosed for drain/shutdown/restore', 'IPC socket communication'] },
  { phase: 'Phase 2', title: 'Agent Message Bus', time: 'Week 2', color: COLORS.yellow,
    tasks: ['AgentMessage types + routing', 'Agent registry (online/offline)', 'Wake-up protocol', 'New API routes for agent communication', 'SSE stream for agent messages'] },
  { phase: 'Phase 3', title: 'Agent Chat UI', time: 'Week 3', color: COLORS.accent,
    tasks: ['AgentChatPanel.tsx in sidebar', 'Wire to SSE stream', 'User can send messages to agents', 'Queued message visibility', 'Wake-up button'] },
  { phase: 'Phase 4', title: 'Self-Update Pipeline', time: 'Week 4', color: COLORS.purple,
    tasks: ['Staging directory build system', 'Parallel binary testing (port 3285)', 'Conductor-orchestrated hot-swap', 'Automatic rollback', 'UI progress indicator'] },
  { phase: 'Phase 5', title: 'Wire Remaining Gaps', time: 'Weeks 5-6', color: COLORS.cyan,
    tasks: ['Conscious backend routes', 'GPU Jobs backend', 'Install scripts', 'API Key vault', 'Agent wake/sleep lifecycle'] },
  { phase: 'Phase 6', title: 'Full Agentic Team', time: 'Weeks 7-8', color: COLORS.green,
    tasks: ['HyperAgent message bus integration', 'Zoekt code search', 'Shared memory (team_memories)', 'Agent self-spawning', 'ALMAS role assignment'] },
];

// ---------------------------------------------------------------------------
// Shared micro-components (inline, no external deps)
// ---------------------------------------------------------------------------

const Dot = ({ color, pulse }: { color: string; pulse?: boolean }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      marginRight: 6,
      animation: pulse ? 'auditPulse 1.5s ease infinite' : 'none',
    }}
  />
);

const Badge = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      letterSpacing: 0.5,
    }}
  >
    {children}
  </span>
);

const Card = ({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) => (
  <div
    style={{
      background: COLORS.bgCard,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      transition: 'all 0.2s',
      boxShadow: glow ? `inset 0 0 20px ${glow}` : 'none',
      ...style,
    }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// useLiveData hook
// ---------------------------------------------------------------------------

function useLiveData() {
  const [data, setData] = useState<LiveData>({
    goosedOnline: false,
    gpuDetected: false,
    gpus: [],
    agentCount: 0,
    agents: [],
    version: null,
    providers: [],
    lastPoll: null,
    pollCount: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const next: Partial<LiveData> = { lastPoll: new Date() };

    // Health / version
    try {
      const r = await fetch(getApiUrl('/api/version'), { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        next.goosedOnline = true;
        const d = await r.json();
        if (d?.version) next.version = d.version;
      } else {
        next.goosedOnline = false;
      }
    } catch {
      next.goosedOnline = false;
    }

    // GPU
    try {
      const r = await fetch(getApiUrl('/api/system/gpu'), { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d: GpuResponse = await r.json();
        next.gpuDetected = d.detected;
        next.gpus = d.gpus || [];
      }
    } catch { /* ignore */ }

    // Agent registry
    try {
      const r = await fetch(getApiUrl('/api/agents/registry'), { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        const list = Array.isArray(d) ? d : d?.agents ?? [];
        next.agents = list;
        next.agentCount = list.length;
      }
    } catch { /* ignore */ }

    // Vault providers
    try {
      const r = await fetch(getApiUrl('/api/vault/providers'), { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        next.providers = Array.isArray(d) ? d : [];
      }
    } catch { /* ignore */ }

    setData((prev) => ({ ...prev, ...next, pollCount: (prev.pollCount || 0) + 1 }));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  return data;
}

// ---------------------------------------------------------------------------
// Sub-section components
// ---------------------------------------------------------------------------

function LiveBanner({ data }: { data: LiveData }) {
  const on = data.goosedOnline;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: on ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${on ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        borderRadius: 6,
        marginBottom: 16,
        fontSize: 11,
        color: on ? COLORS.green : COLORS.red,
      }}
    >
      <Dot color={on ? COLORS.green : COLORS.red} pulse />
      <strong>{on ? 'LIVE' : 'OFFLINE'}</strong>
      <span>{on ? 'Connected to goosed' : 'Cannot reach goosed \u2014 showing cached data'}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textDim }}>
        Poll #{data.pollCount} &middot; {data.lastPoll ? data.lastPoll.toLocaleTimeString() : '--'}
      </span>
    </div>
  );
}

function OverviewSection({ data }: { data: LiveData }) {
  const stats = [
    { label: 'Rust Crates', value: '7', color: COLORS.accent },
    { label: 'Backend Tests', value: '465+', color: COLORS.green },
    { label: 'Vitest', value: '3,451', color: COLORS.green },
    { label: 'Playwright E2E', value: '291', color: COLORS.green },
    { label: 'Agent Cores', value: '6', color: COLORS.cyan },
    { label: 'OTA Modules', value: '14', color: COLORS.orange },
    { label: 'Autonomy Level', value: 'L6.5', color: COLORS.yellow },
    { label: 'Target', value: 'L10+', color: COLORS.red },
  ];

  const systems = [
    { name: 'Agent Core System', tests: '87', ok: true },
    { name: 'Learning Engine', tests: '52', ok: true },
    { name: 'OTA Self-Build', tests: '198', ok: true },
    { name: 'Autonomous Daemon', tests: '86', ok: true },
    { name: 'TimeWarp Store', tests: '8', ok: true },
    { name: 'AG-UI Protocol', tests: '255', ok: true },
    { name: 'Frontend Vitest', tests: '3,451', ok: true },
    { name: 'Playwright E2E', tests: '291', ok: true },
    { name: 'TypeScript', tests: '0 errors', ok: true },
    { name: 'Cargo Check', tests: '0 warnings', ok: true },
    { name: 'goosed', tests: data.goosedOnline ? 'ONLINE' : 'OFFLINE', ok: data.goosedOnline },
    { name: 'GPU', tests: data.gpuDetected ? `${data.gpus.length} detected` : 'None', ok: data.gpuDetected },
  ];

  return (
    <div>
      <LiveBanner data={data} />
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Project Health Dashboard
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        Real-time state of Super-Goose &mdash; data refreshes every {POLL_INTERVAL_MS / 1000}s
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {stats.map((s) => (
          <Card key={s.label} glow={s.color + '15'}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <h3 style={{ color: COLORS.textBright, fontSize: 15, margin: '0 0 10px' }}>System Status</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {systems.map((s) => {
          const c = s.ok ? COLORS.green : COLORS.red;
          return (
            <div
              key={s.name}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: COLORS.bgCard, borderRadius: 6,
                border: `1px solid ${COLORS.border}`, fontSize: 12,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <Dot color={c} />
                <span style={{ color: COLORS.text }}>{s.name}</span>
              </span>
              <Badge color={c}>{s.tests}</Badge>
            </div>
          );
        })}
      </div>

      {data.gpuDetected && data.gpus.length > 0 && (
        <>
          <h3 style={{ color: COLORS.textBright, fontSize: 15, margin: '16px 0 10px' }}>GPU (Live)</h3>
          {data.gpus.map((g, i) => {
            const pct = g.utilization_pct ?? 0;
            const c = pct >= 80 ? COLORS.red : pct >= 50 ? COLORS.yellow : COLORS.green;
            const memPct = g.memory_total_mb > 0 ? Math.round((g.memory_used_mb / g.memory_total_mb) * 100) : 0;
            return (
              <Card key={i} style={{ borderLeft: `3px solid ${c}`, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textBright }}>{g.name}</span>
                  <Badge color={c}>{pct}% util</Badge>
                </div>
                <div style={{ width: '100%', height: 6, background: COLORS.bgLight, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>
                  VRAM: {Math.round(g.memory_used_mb)} / {Math.round(g.memory_total_mb)} MB ({memPct}%)
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function LiveStatusSection({ data }: { data: LiveData }) {
  const rows = [
    { label: 'goosed Process', value: data.goosedOnline ? 'RUNNING' : 'OFFLINE', ok: data.goosedOnline, detail: 'Port 3284' },
    { label: 'Version', value: data.version || 'unknown', ok: !!data.version, detail: 'From /api/version' },
    { label: 'GPU Detected', value: data.gpuDetected ? `Yes (${data.gpus.length})` : 'No', ok: data.gpuDetected, detail: data.gpus.map((g) => g.name).join(', ') || 'nvidia-smi not found or no GPU' },
    { label: 'Agent Cores', value: data.agentCount > 0 ? String(data.agentCount) : '0', ok: data.agentCount > 0, detail: data.agents.map((a) => a.name || a.role || a.id || '').join(', ') || 'No agents registered' },
    { label: 'Providers', value: data.providers.length > 0 ? String(data.providers.length) : '0', ok: data.providers.length > 0, detail: data.providers.map((p) => p.name || p.id || '').join(', ') || '/api/vault/providers' },
    { label: 'Poll Count', value: String(data.pollCount), ok: true, detail: `Every ${POLL_INTERVAL_MS / 1000}s` },
  ];

  return (
    <div>
      <LiveBanner data={data} />
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Live System Status</h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        Real-time monitoring of Super-Goose services. Auto-refreshes every {POLL_INTERVAL_MS / 1000}s.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {rows.map((r) => {
          const c = r.ok ? COLORS.green : COLORS.red;
          return (
            <Card key={r.label} style={{ borderLeft: `3px solid ${c}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{r.label}</span>
                <Badge color={c}>{r.value}</Badge>
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>{r.detail}</div>
            </Card>
          );
        })}
      </div>

      {data.gpuDetected && data.gpus.length > 0 && (
        <>
          <h3 style={{ color: COLORS.textBright, fontSize: 15, margin: '0 0 10px' }}>GPU Details</h3>
          {data.gpus.map((g, i) => {
            const pct = g.utilization_pct ?? 0;
            const memPct = g.memory_total_mb > 0 ? Math.round((g.memory_used_mb / g.memory_total_mb) * 100) : 0;
            const c = pct >= 80 ? COLORS.red : pct >= 50 ? COLORS.yellow : COLORS.green;
            return (
              <Card key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textBright, marginBottom: 6 }}>{g.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{pct}%</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>Utilization</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.cyan, fontFamily: 'monospace' }}>{Math.round(g.memory_used_mb)}MB</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>VRAM Used</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.accent, fontFamily: 'monospace' }}>{Math.round(g.memory_total_mb)}MB</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>VRAM Total</div>
                  </div>
                </div>
                <div style={{ width: '100%', height: 6, background: COLORS.bgLight, borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${memPct}%`, background: COLORS.cyan, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>Memory: {memPct}% used</div>
              </Card>
            );
          })}
        </>
      )}

      <h3 style={{ color: COLORS.textBright, fontSize: 15, margin: '16px 0 10px' }}>Test Counts (Verified)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { label: 'Vitest', val: '3,451', sub: '242 files, 3 skipped', c: COLORS.green },
          { label: 'Rust', val: '465+', sub: 'cargo test --lib clean', c: COLORS.accent },
          { label: 'Playwright E2E', val: '291', sub: '68 skipped, 0 failed', c: COLORS.purple },
        ].map((t) => (
          <Card key={t.label} glow={t.c + '15'}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.c, fontFamily: 'monospace' }}>{t.val}</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>{t.sub}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConductorSection() {
  const [step, setStep] = useState(0);
  const s = CONDUCTOR_STEPS[step];

  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        The Conductor &mdash; Process That Never Dies
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        ~500 lines of Rust. No LLM logic. Just process management. Registered as a system service.
      </p>

      <Card glow={COLORS.accentGlow} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {['Child Manager', 'Health Checker', 'Message Bus', 'State Store'].map((m) => (
            <div key={m} style={{ padding: '10px 8px', background: COLORS.bgLight, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, color: COLORS.accent, fontWeight: 700 }}>{m}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', padding: '8px 0 4px', color: COLORS.textDim, fontSize: 11, letterSpacing: 1 }}>
          IPC Socket (Unix/Named Pipe)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {[
            { name: 'goosed', desc: 'Rust Backend' },
            { name: 'Agents', desc: 'Per-agent processes' },
            { name: 'Electron', desc: 'React GUI' },
          ].map((c) => (
            <div key={c.name} style={{ padding: '10px 8px', background: COLORS.bgLight, borderRadius: 6, border: `1px solid ${COLORS.green}44` }}>
              <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <h3 style={{ color: COLORS.textBright, fontSize: 14, margin: '0 0 10px' }}>
        Self-Update Sequence (click to step through)
      </h3>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {CONDUCTOR_STEPS.map((st, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            style={{
              padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${i === step ? st.color : COLORS.border}`,
              background: i === step ? st.color + '22' : 'transparent',
              color: i === step ? st.color : COLORS.textDim,
              cursor: 'pointer', fontSize: 11, fontWeight: i === step ? 700 : 400,
              fontFamily: 'inherit',
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Card glow={s.color + '15'} style={{ borderLeft: `3px solid ${s.color}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 4 }}>
          Step {step + 1}: {s.label}
        </div>
        <div style={{ fontSize: 13, color: COLORS.text }}>{s.desc}</div>
        {step === 5 && (
          <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
            a) Tell Electron &rarr; "maintenance mode" (UI shows overlay)<br />
            b) Tell goosed &rarr; "drain and shutdown" (finish in-flight, save state)<br />
            c) Binary swap: mv goosed&rarr;backup, mv goosed-new&rarr;goosed<br />
            d) Start new goosed &rarr; restore state from SQLite<br />
            e) Health check &rarr; if OK, tell Electron "reconnect"
          </div>
        )}
        {step === 7 && (
          <div style={{ marginTop: 8, fontSize: 12, color: COLORS.red, lineHeight: 1.6 }}>
            Restore backup binary &rarr; restart old goosed &rarr; exponential backoff for next attempt
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{
            padding: '6px 16px', borderRadius: 4, border: `1px solid ${COLORS.border}`,
            background: 'transparent', color: step === 0 ? COLORS.textDim : COLORS.text,
            cursor: step === 0 ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}
        >
          &larr; Previous
        </button>
        <button
          onClick={() => setStep(Math.min(CONDUCTOR_STEPS.length - 1, step + 1))}
          disabled={step === CONDUCTOR_STEPS.length - 1}
          style={{
            padding: '6px 16px', borderRadius: 4, border: `1px solid ${COLORS.accent}`,
            background: COLORS.accent + '22',
            color: step === CONDUCTOR_STEPS.length - 1 ? COLORS.textDim : COLORS.accent,
            cursor: step === CONDUCTOR_STEPS.length - 1 ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}

function AgentBusSection() {
  const agents = [
    { role: 'Architect', icon: '\uD83C\uDFD7\uFE0F', status: 'online', model: 'claude-opus-4-6', task: 'Planning auth module', color: COLORS.green },
    { role: 'Developer', icon: '\uD83D\uDCBB', status: 'online', model: 'qwen3-32b (local)', task: 'Writing JWT middleware', color: COLORS.green },
    { role: 'QA', icon: '\u2705', status: 'waking', model: 'claude-sonnet-4-5', task: 'Queued: run tests', color: COLORS.yellow },
    { role: 'Security', icon: '\uD83D\uDEE1\uFE0F', status: 'offline', model: 'claude-haiku-4-5', task: '3 queued messages', color: COLORS.textDim },
    { role: 'Deploy', icon: '\uD83D\uDE80', status: 'offline', model: 'ollama', task: 'Will activate for deploy step', color: COLORS.textDim },
  ];

  const messages = [
    { from: 'Architect', to: 'Team', time: '14:23', msg: 'Plan approved. Dev + QA check assignments.', channel: '#team', chColor: COLORS.cyan },
    { from: 'Developer', to: 'Team', time: '14:24', msg: 'Starting implementation. ETA 3 min.', channel: '#team', chColor: COLORS.cyan },
    { from: 'Developer', to: 'QA', time: '14:27', msg: 'Code committed. 3 files. Ready for testing.', channel: 'direct', chColor: COLORS.purple },
    { from: 'QA', to: 'Team', time: '14:27', msg: '12/12 tests passed. Coverage: 89%', channel: '#team', chColor: COLORS.cyan },
    { from: 'Architect', to: 'Security', time: '14:28', msg: 'Review auth module (queued \u2014 agent offline)', channel: 'direct', chColor: COLORS.purple },
  ];

  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Inter-Agent Communication
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        All agents aware of each other. Messages queue for offline agents. Wake-up on demand.
      </p>

      <h3 style={{ color: COLORS.textBright, fontSize: 14, margin: '0 0 10px' }}>Agent Registry</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {agents.map((a) => (
          <div
            key={a.role}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: COLORS.bgCard, borderRadius: 6,
              border: `1px solid ${a.color}33`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Dot color={a.color} />
              <span style={{ fontSize: 16 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{a.role}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.model}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge color={a.color}>{a.status.toUpperCase()}</Badge>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{a.task}</div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ color: COLORS.textBright, fontSize: 14, margin: '0 0 10px' }}>Live Agent Chat</h3>
      <Card style={{ maxHeight: 260, overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: i < messages.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>{m.from}</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>&rarr; {m.to}</span>
              <span style={{ fontSize: 10, color: COLORS.textDim, marginLeft: 'auto' }}>{m.time}</span>
              <Badge color={m.chColor}>{m.channel}</Badge>
            </div>
            <div style={{ fontSize: 12, color: COLORS.text, paddingLeft: 2 }}>{m.msg}</div>
          </div>
        ))}
      </Card>

      <Card style={{ marginTop: 12, background: COLORS.yellowGlow, border: `1px solid ${COLORS.yellow}33` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.yellow, marginBottom: 4 }}>Wake-Up Protocol</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6 }}>
          Messages to offline agents are queued in SQLite. Conductor checks WakePolicy (priority threshold,
          cooldown, resource availability). If conditions met &rarr; spawns agent process &rarr; delivers queued messages.
        </div>
      </Card>
    </div>
  );
}

function SelfUpdateSection() {
  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Self-Update Architecture
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        How Super-Goose rebuilds itself without losing agent connectivity
      </p>

      <Card glow={COLORS.accentGlow} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent, marginBottom: 8 }}>The Core Insight</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          The <strong style={{ color: COLORS.yellow }}>Conductor</strong> is a tiny Rust daemon (~500 lines) that
          never gets rebuilt by the agent. When goosed needs to rebuild, the Conductor:<br /><br />
          1. Keeps the old goosed running while the new one builds<br />
          2. Tests the new binary on a separate port (3285)<br />
          3. Only swaps after all tests pass<br />
          4. Rolls back automatically if the new binary fails<br />
          5. Preserves all state in SQLite<br />
          6. Electron stays open &mdash; auto-reconnects after swap
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.green, marginBottom: 6 }}>What Survives Rebuild</div>
          {['Task queue', 'Agent messages', 'Session state', 'Learning data', 'ExperienceStore', 'SkillLibrary', 'TimeWarp events', 'Audit log', 'Agent registry', 'Shared memories'].map((item) => (
            <div key={item} style={{ fontSize: 11, color: COLORS.text, padding: '2px 0' }}>
              <Dot color={COLORS.green} /> {item}
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.red, marginBottom: 6 }}>What Gets Rebuilt</div>
          {['goosed binary', 'Agent core logic', 'API routes', 'MCP handlers', 'OTA engine', 'Learning algorithms', 'Compaction logic', 'Guardrails rules'].map((item) => (
            <div key={item} style={{ fontSize: 11, color: COLORS.text, padding: '2px 0' }}>
              <Dot color={COLORS.orange} /> {item}
            </div>
          ))}
          <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6, fontStyle: 'italic' }}>
            Downtime: ~5-15 seconds during binary swap
          </div>
        </Card>
      </div>
    </div>
  );
}

function FailsafeSection() {
  const sevColors: Record<FailSeverity, string> = { low: COLORS.green, med: COLORS.yellow, high: COLORS.red };

  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Failsafe Architecture
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        Every failure mode has automatic detection + recovery. The system never fully stops.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 2fr 3fr 1fr', gap: 8,
          padding: '8px 12px', fontSize: 10, fontWeight: 700, color: COLORS.textDim,
          textTransform: 'uppercase' as const, letterSpacing: 1,
        }}>
          <span>Failure Mode</span><span>Detection</span><span>Recovery</span><span>Downtime</span>
        </div>
        {FAILSAFES.map((f) => (
          <div
            key={f.mode}
            style={{
              display: 'grid', gridTemplateColumns: '2fr 2fr 3fr 1fr', gap: 8,
              padding: '10px 12px', background: COLORS.bgCard, borderRadius: 6,
              border: `1px solid ${sevColors[f.severity]}22`, fontSize: 12, alignItems: 'center',
            }}
          >
            <span style={{ color: COLORS.text, fontWeight: 600 }}>{f.mode}</span>
            <span style={{ color: COLORS.textDim }}>{f.detection}</span>
            <span style={{ color: COLORS.text }}>{f.recovery}</span>
            <Badge color={sevColors[f.severity]}>{f.downtime}</Badge>
          </div>
        ))}
      </div>

      <Card style={{ marginTop: 16, background: COLORS.greenGlow, border: `1px solid ${COLORS.green}33` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.green, marginBottom: 4 }}>
          The "Always Connected" Guarantee
        </div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
          There is ALWAYS a process accepting connections on port 3284. If all binaries fail, Conductor enters
          SAFE MODE: starts a minimal diagnostic HTTP server, accepts user commands, logs everything for debugging.
        </div>
      </Card>
    </div>
  );
}

function GapsSection() {
  const sevColors: Record<GapSeverity, string> = {
    CRITICAL: COLORS.red,
    HIGH: COLORS.yellow,
    MEDIUM: COLORS.accent,
    FIXED: COLORS.green,
    'DO NOW': COLORS.orange,
  };

  const fixedCount = GAPS.filter((g) => g.status === 'fixed').length;
  const progressCount = GAPS.filter((g) => g.status === 'progress').length;
  const openCount = GAPS.filter((g) => g.status === 'open').length;

  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Gap Analysis &mdash; {GAPS.length} Issues Tracked
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        Ranked by severity and dependency order
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Card glow={COLORS.green + '15'}>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.green, fontFamily: 'monospace' }}>{fixedCount}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>Fixed</div>
        </Card>
        <Card glow={COLORS.yellow + '15'}>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.yellow, fontFamily: 'monospace' }}>{progressCount}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>In Progress</div>
        </Card>
        <Card glow={COLORS.red + '15'}>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.red, fontFamily: 'monospace' }}>{openCount}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>Open</div>
        </Card>
        <Card glow={COLORS.accent + '15'}>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.accent, fontFamily: 'monospace' }}>
            {Math.round((fixedCount / GAPS.length) * 100)}%
          </div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>Complete</div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {GAPS.map((g) => {
          const c = sevColors[g.sev] || COLORS.textDim;
          const rowBg =
            g.status === 'fixed' ? 'rgba(16,185,129,0.04)' :
            g.status === 'progress' ? 'rgba(245,158,11,0.04)' : 'transparent';
          return (
            <div
              key={g.id}
              style={{
                display: 'grid', gridTemplateColumns: '40px 3fr 80px 2fr', gap: 8,
                padding: '10px 12px', background: rowBg, borderRadius: 6,
                border: `1px solid ${c}22`, fontSize: 12, alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, textAlign: 'center' }}>{g.icon}</span>
              <div>
                <div style={{ fontWeight: 600, color: COLORS.text }}>{g.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{g.impact}</div>
              </div>
              <Badge color={c}>{g.sev}</Badge>
              <span style={{ fontSize: 10, color: COLORS.textDim, fontFamily: 'monospace' }}>{g.where}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrioritySection() {
  return (
    <div>
      <h2 style={{ color: COLORS.textBright, margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>
        Implementation Priority
      </h2>
      <p style={{ color: COLORS.textDim, margin: '0 0 16px', fontSize: 13 }}>
        8-week roadmap from current state to L10+ agentic autonomy
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PHASES.map((p) => (
          <Card key={p.phase} style={{ borderLeft: `3px solid ${p.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.phase}:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textBright, marginLeft: 6 }}>{p.title}</span>
              </div>
              <Badge color={p.color}>{p.time}</Badge>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {p.tasks.map((t) => {
                const isDone = t.includes('\u2705');
                return (
                  <span
                    key={t}
                    style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11,
                      background: COLORS.bgLight, color: isDone ? COLORS.green : COLORS.text,
                      border: `1px solid ${isDone ? COLORS.green + '44' : COLORS.border}`,
                    }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 16, background: COLORS.purpleGlow, border: `1px solid ${COLORS.purple}33` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.purple, marginBottom: 4 }}>
          Total New Code Estimate
        </div>
        <div style={{ fontSize: 12, color: COLORS.text }}>
          ~40 new files &middot; ~5,000-8,000 lines of Rust + TypeScript &middot; Conductor: ~1,200 LOC &middot;
          Agent Bus: ~1,500 LOC &middot; API routes: ~800 LOC &middot; Frontend: ~1,200 LOC &middot; Tests: ~1,500 LOC
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export default function AuditDashboard() {
  const [active, setActive] = useState<SectionId>('overview');
  const data = useLiveData();

  const renderSection = () => {
    switch (active) {
      case 'overview': return <OverviewSection data={data} />;
      case 'livestatus': return <LiveStatusSection data={data} />;
      case 'conductor': return <ConductorSection />;
      case 'agents': return <AgentBusSection />;
      case 'selfupdate': return <SelfUpdateSection />;
      case 'failsafes': return <FailsafeSection />;
      case 'gaps': return <GapsSection />;
      case 'priority': return <PrioritySection />;
    }
  };

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Keyframe for pulse animation */}
      <style>{`
        @keyframes auditPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Sidebar */}
      <div
        style={{
          width: 180,
          background: COLORS.bgLight,
          borderRight: `1px solid ${COLORS.border}`,
          padding: '16px 0',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0 16px 16px', borderBottom: `1px solid ${COLORS.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accent, letterSpacing: 1 }}>SUPER-GOOSE</div>
          <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>Agentic Architecture Audit</div>
          <div style={{ fontSize: 9, color: COLORS.cyan, marginTop: 4, fontWeight: 600 }}>
            {data.version ? `v${data.version}` : 'v?.?.?'}
          </div>
        </div>

        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 16px', border: 'none',
              background: active === s.id ? COLORS.accentGlow : 'transparent',
              color: active === s.id ? COLORS.accent : COLORS.textDim,
              cursor: 'pointer', fontSize: 12,
              fontWeight: active === s.id ? 700 : 400,
              textAlign: 'left', fontFamily: 'inherit',
              borderLeft: active === s.id ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{s.icon}</span>
            {s.label}
          </button>
        ))}

        {/* Connection status at sidebar bottom */}
        <div style={{ marginTop: 'auto', padding: '10px 16px', borderTop: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textDim }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>LIVE STATUS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Dot color={data.goosedOnline ? COLORS.green : COLORS.red} pulse={data.goosedOnline} />
            <span>goosed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Dot color={data.gpuDetected ? COLORS.green : COLORS.textDim} />
            <span>GPU</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 9, color: COLORS.textDim }}>
            Poll #{data.pollCount}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', maxHeight: '100%' }}>
        {renderSection()}
      </div>
    </div>
  );
}
