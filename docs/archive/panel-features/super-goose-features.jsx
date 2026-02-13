import { useState, useEffect } from "react";

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const T = {
  bg:       "#080818",
  surface:  "#0a0a1f",
  card:     "#0f0f23",
  input:    "#1a1a2e",
  border:   "#1e293b",
  border2:  "#2d3748",
  text1:    "#e2e8f0",
  text2:    "#94a3b8",
  text3:    "#64748b",
  text4:    "#475569",
  text5:    "#334155",
  indigo:   "#6366f1",
  amber:    "#f59e0b",
  emerald:  "#10b981",
  red:      "#ef4444",
  violet:   "#8b5cf6",
  sky:      "#0ea5e9",
  pink:     "#ec4899",
  blue:     "#3b82f6",
  orange:   "#f97316",
  cyan:     "#06b6d4",
  lime:     "#84cc16",
  superGold:"#fbbf24",
};

// ─── LEFT SIDEBAR NAV ────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: "⚡", label: "Dashboard",   color: T.superGold },
  { id: "studios",   icon: "🧪", label: "Studios",     color: T.violet },
  { id: "agents",    icon: "🤖", label: "Agents",      color: T.emerald },
  { id: "market",    icon: "🛒", label: "Marketplace", color: T.sky },
  { id: "gpu",       icon: "🖥️", label: "GPU Cluster", color: T.red },
  { id: "connect",   icon: "🔌", label: "Connections", color: T.amber },
  { id: "monitor",   icon: "📊", label: "Monitor",     color: T.cyan },
  { id: "settings",  icon: "⚙️", label: "Settings",    color: T.text3 },
];

// ─── STUDIOS (paid features) ─────────────────────────────────────
const STUDIOS = [
  { id: "core-studio",   icon: "🧠", label: "Core Studio",     desc: "Train & publish Intelligence Cores", tag: "LoRA/QLoRA", color: T.red },
  { id: "agent-studio",  icon: "🤖", label: "Agent Studio",    desc: "Build & configure agentic workflows", tag: "DAG Builder", color: T.emerald },
  { id: "data-studio",   icon: "📊", label: "Data Studio",     desc: "Curate, clean & label training data", tag: "Auto-Label", color: T.blue },
  { id: "eval-studio",   icon: "✅", label: "Eval Studio",     desc: "Benchmark & compare model performance", tag: "SWE-bench", color: T.violet },
  { id: "deploy-studio", icon: "🚀", label: "Deploy Studio",   desc: "Package & ship to any target", tag: "OCI/Docker", color: T.sky },
  { id: "vision-studio", icon: "👁️", label: "Vision Studio",   desc: "Multimodal analysis & generation", tag: "VL Models", color: T.pink },
];

// ─── MARKETPLACE CORES ───────────────────────────────────────────
const MARKET_CORES = [
  { name: "React Dashboard Expert",   author: "ShadowByte", price: "Free",  dl: "2.4k", stars: 4.8, base: "Qwen3-8B",   size: "12MB",  tags: ["react","ts","dashboard"] },
  { name: "Rust Systems Specialist",   author: "ferris_dev", price: "$4.99", dl: "1.1k", stars: 4.9, base: "GLM-4-9B",   size: "18MB",  tags: ["rust","systems","perf"] },
  { name: "Python Data Pipeline",      author: "dataflow",   price: "$2.99", dl: "3.7k", stars: 4.6, base: "Qwen3-14B",  size: "22MB",  tags: ["python","pandas","etl"] },
  { name: "DevOps Automation",         author: "ops_master", price: "Free",  dl: "890",  stars: 4.5, base: "Qwen3-8B",   size: "14MB",  tags: ["docker","k8s","ci-cd"] },
  { name: "Game Dev Unity Expert",     author: "pixelcraft", price: "$6.99", dl: "560",  stars: 4.7, base: "DeepSeek-8B", size: "16MB",  tags: ["unity","c#","gamedev"] },
  { name: "Security Auditor",          author: "sec_hawk",   price: "$9.99", dl: "340",  stars: 4.9, base: "GLM-4.7-9B",  size: "20MB",  tags: ["security","audit","pentest"] },
];

// ─── GPU PROVIDERS ───────────────────────────────────────────────
const GPU_PROVIDERS = [
  { id: "runpod",   label: "RunPod",      icon: "🟣", status: "connected", gpus: "A100/H100", rate: "$0.74/hr" },
  { id: "lambda",   label: "Lambda Labs", icon: "🟠", status: "connected", gpus: "A100/A10G", rate: "$1.10/hr" },
  { id: "vast",     label: "Vast.ai",     icon: "🔵", status: "no key",    gpus: "Community",  rate: "$0.30/hr" },
  { id: "local",    label: "Local GPUs",  icon: "🟢", status: "active",    gpus: "RTX 3090 Ti", rate: "Free" },
  { id: "local2",   label: "Machine 2",   icon: "🟡", status: "active",    gpus: "RX 7800 XT",  rate: "Free" },
];

// ─── CONNECTIONS / SERVICES ──────────────────────────────────────
const CONNECTIONS = [
  { id: "hf",       label: "HuggingFace",   icon: "🤗", status: "connected", user: "ShadowByte" },
  { id: "gh",       label: "GitHub",         icon: "🐙", status: "connected", user: "ShadowByte" },
  { id: "ollama",   label: "Ollama",         icon: "🦙", status: "running",   user: "localhost:11434" },
  { id: "lmstudio", label: "LM Studio",     icon: "📡", status: "running",   user: "localhost:1234" },
  { id: "claude",   label: "Claude API",    icon: "🧠", status: "connected", user: "sk-ant-***" },
  { id: "openai",   label: "OpenAI",        icon: "🌐", status: "no key",    user: "—" },
  { id: "wandb",    label: "W&B",           icon: "📈", status: "connected", user: "shadow-byte" },
  { id: "docker",   label: "Docker Hub",    icon: "🐳", status: "connected", user: "shadowbyte" },
];

// ─── SHARED COMPONENTS ───────────────────────────────────────────
function Badge({ children, color = T.indigo, glow = false }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 10,
      background: color + "22", color, fontSize: 11, fontWeight: 600,
      marginRight: 4, border: glow ? `1px solid ${color}44` : "none",
    }}>{children}</span>
  );
}

function ProgressBar({ value, max, color, h = 6 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: T.input, borderRadius: 6, height: h, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.6s ease" }} />
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ color: T.text3, fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>
      {children}
    </div>
  );
}

function StatusDot({ status }) {
  const colors = { connected: T.emerald, running: T.emerald, active: T.emerald, "no key": T.text3, offline: T.red, pending: T.amber };
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colors[status] || T.text3, marginRight: 6 }} />;
}

function ActionBtn({ children, color = T.indigo, onClick, full = false, small = false }) {
  return (
    <button onClick={onClick} style={{
      background: color, color: "#fff", border: "none", borderRadius: 8,
      padding: small ? "6px 14px" : "10px 20px", cursor: "pointer",
      fontWeight: 700, fontSize: small ? 11 : 13,
      width: full ? "100%" : "auto", transition: "all 0.15s",
    }}>{children}</button>
  );
}

function GradBtn({ children, onClick, from = T.sky, to = T.indigo, full = false }) {
  return (
    <button onClick={onClick} style={{
      width: full ? "100%" : "auto",
      background: `linear-gradient(135deg, ${from}, ${to})`, color: "#fff",
      border: "none", borderRadius: 10, padding: "14px 20px", cursor: "pointer",
      fontWeight: 800, fontSize: 16, letterSpacing: 1, transition: "all 0.2s",
    }}>{children}</button>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          background: active === t.id ? (t.color || T.indigo) + "18" : "transparent",
          border: active === t.id ? `1px solid ${t.color || T.indigo}55` : `1px solid transparent`,
          borderRadius: 8, padding: "7px 4px", cursor: "pointer", transition: "all 0.15s",
        }}>
          <span style={{ fontSize: 13 }}>{t.icon}</span>
          <span style={{ color: active === t.id ? (t.color || T.indigo) : T.text3, fontSize: 11, fontWeight: active === t.id ? 700 : 500 }}>
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── PANEL: DASHBOARD ────────────────────────────────────────────
function DashboardPanel() {
  const stats = [
    { label: "Active Cores",    value: "7",    icon: "🧠", color: T.indigo },
    { label: "Agents Running",  value: "3",    icon: "🤖", color: T.emerald },
    { label: "GPU Utilization", value: "42%",  icon: "🖥️", color: T.amber },
    { label: "Marketplace",     value: "2.4k", icon: "⬇️", color: T.sky },
  ];

  const recentActivity = [
    { time: "2m ago",  action: "Agent completed", detail: "PR #142 merged via StructuredCore", color: T.emerald },
    { time: "18m ago", action: "Core trained",    detail: "React Expert v2 — 91/100 quality",  color: T.violet },
    { time: "1h ago",  action: "GPU job done",    detail: "QLoRA on RunPod A100 — $0.38 cost", color: T.amber },
    { time: "3h ago",  action: "Marketplace sale", detail: "Rust Specialist × 3 downloads",    color: T.sky },
    { time: "5h ago",  action: "Model synced",    detail: "GLM-4.7-Flash pulled to Ollama",    color: T.pink },
  ];

  const quickActions = [
    { label: "New Core",      icon: "🧠", action: "studios",  color: T.red },
    { label: "Deploy Agent",  icon: "🤖", action: "agents",   color: T.emerald },
    { label: "Train on GPU",  icon: "🖥️", action: "gpu",      color: T.amber },
    { label: "Browse Market", icon: "🛒", action: "market",   color: T.sky },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 22 }}>⚡</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Super-Goose</div>
          <div style={{ color: T.superGold, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>All Systems Operational</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ color: s.color, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: T.text3, fontSize: 10, marginTop: 2 }}>{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Quick Actions</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {quickActions.map(a => (
            <button key={a.label} style={{
              background: a.color + "12", border: `1px solid ${a.color}33`, borderRadius: 8,
              padding: "10px 6px", cursor: "pointer", textAlign: "center", transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
              <div style={{ color: a.color, fontSize: 10, fontWeight: 600 }}>{a.label}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Hardware Status</SectionLabel>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: T.text2, fontSize: 12 }}>RTX 3090 Ti — 8.2 / 24 GB</span>
            <span style={{ color: T.emerald, fontSize: 11 }}>62°C</span>
          </div>
          <ProgressBar value={8.2} max={24} color={T.emerald} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: T.text2, fontSize: 12 }}>RX 7800 XT — 4.1 / 16 GB</span>
            <span style={{ color: T.emerald, fontSize: 11 }}>55°C</span>
          </div>
          <ProgressBar value={4.1} max={16} color={T.sky} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: T.text2, fontSize: 12 }}>System RAM — 41 / 128 GB</span>
            <span style={{ color: T.emerald, fontSize: 11 }}>32%</span>
          </div>
          <ProgressBar value={41} max={128} color={T.violet} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Recent Activity</SectionLabel>
        {recentActivity.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < recentActivity.length - 1 ? 10 : 0, paddingBottom: i < recentActivity.length - 1 ? 10 : 0, borderBottom: i < recentActivity.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <span style={{ color: T.text4, fontSize: 10, minWidth: 50, marginTop: 2 }}>{a.time}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: a.color, fontSize: 12, fontWeight: 600 }}>{a.action}</div>
              <div style={{ color: T.text3, fontSize: 11 }}>{a.detail}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── PANEL: STUDIOS ──────────────────────────────────────────────
function StudiosPanel() {
  const [activeStudio, setActiveStudio] = useState(null);

  const studioTabs = [
    { id: "all",     icon: "📋", label: "All",      color: T.text2 },
    { id: "recent",  icon: "🕒", label: "Recent",   color: T.amber },
    { id: "running", icon: "▶️",  label: "Running",  color: T.emerald },
  ];
  const [studioTab, setStudioTab] = useState("all");

  if (activeStudio) {
    return <StudioDetailPanel studio={activeStudio} onBack={() => setActiveStudio(null)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🧪</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Studios</div>
          <div style={{ color: T.violet, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Super-Goose Creative Tools</div>
        </div>
      </div>

      <TabBar tabs={studioTabs} active={studioTab} onChange={setStudioTab} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {STUDIOS.map(s => (
          <button key={s.id} onClick={() => setActiveStudio(s)} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 14, cursor: "pointer", textAlign: "left", transition: "all 0.2s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ fontSize: 26 }}>{s.icon}</span>
              <Badge color={s.color}>{s.tag}</Badge>
            </div>
            <div style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: T.text3, fontSize: 11 }}>{s.desc}</div>
          </button>
        ))}
      </div>

      <Card style={{ marginTop: 16 }}>
        <SectionLabel>Active Studio Sessions</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <StatusDot status="running" />
          <div style={{ flex: 1 }}>
            <span style={{ color: T.text1, fontSize: 12, fontWeight: 600 }}>Core Studio</span>
            <span style={{ color: T.text3, fontSize: 11 }}> — Training "React Expert v2"</span>
          </div>
          <span style={{ color: T.amber, fontSize: 11 }}>67%</span>
        </div>
        <ProgressBar value={67} max={100} color={T.amber} />
      </Card>
    </div>
  );
}

function StudioDetailPanel({ studio, onBack }) {
  const pipeline = [
    { num: "①", label: "SOURCE",  icon: "📥", color: T.indigo,  status: "done" },
    { num: "②", label: "BUILD",   icon: "🔨", color: T.amber,   status: "done" },
    { num: "③", label: "PREPARE", icon: "📊", color: T.emerald, status: "active" },
    { num: "④", label: "TRAIN",   icon: "🧠", color: T.red,     status: "pending" },
    { num: "⑤", label: "TEST",    icon: "✅", color: T.violet,  status: "pending" },
    { num: "⑥", label: "PUBLISH", icon: "🚀", color: T.sky,     status: "pending" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, marginBottom: 12, padding: 0 }}>
        ← Back to Studios
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 26 }}>{studio.icon}</span>
        <div>
          <div style={{ color: T.text1, fontSize: 16, fontWeight: 800 }}>{studio.label}</div>
          <div style={{ color: studio.color, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>{studio.desc}</div>
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Pipeline Progress</SectionLabel>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {pipeline.map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                background: step.status === "active" ? step.color + "22" : "transparent",
                border: step.status === "active" ? `1px solid ${step.color}55` : "1px solid transparent",
                borderRadius: 6, padding: "6px 2px",
              }}>
                <span style={{ fontSize: 11 }}>{step.status === "done" ? "✅" : step.icon}</span>
                <span style={{ color: step.status === "active" ? step.color : step.status === "done" ? T.emerald : T.text4, fontSize: 9, fontWeight: step.status === "active" ? 700 : 400 }}>
                  {step.label}
                </span>
              </div>
              {i < pipeline.length - 1 && <div style={{ width: 10, height: 2, background: step.status === "done" ? T.emerald : T.border, margin: "0 1px" }} />}
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Source Selection</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { icon: "🤗", label: "HuggingFace", active: true },
            { icon: "🐙", label: "GitHub", active: false },
            { icon: "📁", label: "My Files", active: false },
          ].map(s => (
            <div key={s.label} style={{
              background: s.active ? T.indigo + "18" : T.input,
              border: `1px solid ${s.active ? T.indigo + "55" : T.border}`,
              borderRadius: 8, padding: "10px 8px", textAlign: "center", cursor: "pointer",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ color: s.active ? T.indigo : T.text3, fontSize: 10, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Model Search — HuggingFace</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input placeholder="Search models (e.g. Qwen3, coding, 8B)..." style={{
            flex: 1, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8,
            padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none",
          }} />
          <ActionBtn color={T.amber} small>Search 🤗</ActionBtn>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          <Badge color={T.emerald}>≤24GB VRAM</Badge>
          <Badge color={T.amber}>Coding</Badge>
          <Badge color={T.blue}>Apache 2.0</Badge>
        </div>
        {[
          { name: "Qwen3-30B-A3B", vram: "~18GB", speed: "⚡ 87 t/s", tag: "MoE" },
          { name: "GLM-4.7-Flash",  vram: "~16GB", speed: "⚡ 93 t/s", tag: "MoE" },
          { name: "Qwen3-14B",      vram: "~10GB", speed: "🟡 45 t/s", tag: "Dense" },
        ].map(m => (
          <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.input, borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
            <input type="radio" name="model-select" style={{ accentColor: T.indigo }} />
            <div style={{ flex: 1 }}>
              <span style={{ color: T.text1, fontSize: 12, fontWeight: 600 }}>{m.name}</span>
              <span style={{ color: T.text3, fontSize: 10, marginLeft: 8 }}>{m.vram} · {m.speed}</span>
            </div>
            <Badge color={T.cyan}>{m.tag}</Badge>
          </div>
        ))}
      </Card>

      <GradBtn full from={T.indigo} to={T.violet}>▶ Launch Pipeline</GradBtn>
    </div>
  );
}

// ─── PANEL: AGENTS ───────────────────────────────────────────────
function AgentsPanel() {
  const agentTabs = [
    { id: "active",   icon: "▶️",  label: "Active",    color: T.emerald },
    { id: "cores",    icon: "🧠", label: "My Cores",  color: T.violet },
    { id: "builder",  icon: "🔧", label: "Builder",   color: T.amber },
  ];
  const [tab, setTab] = useState("active");

  const agents = [
    { name: "CodeReview-Agent",    core: "FreeformCore",     model: "Claude Sonnet",    status: "running",  task: "Reviewing PR #142 — src/auth/login.ts", uptime: "4m" },
    { name: "TestWriter-Agent",    core: "StructuredCore",   model: "Qwen3-30B-A3B",    status: "running",  task: "Generating tests for UserService", uptime: "12m" },
    { name: "DocGen-Agent",        core: "FreeformCore",     model: "GLM-4.7-Flash",    status: "running",  task: "Updating ARCHITECTURE.md", uptime: "2m" },
    { name: "SecurityScan-Agent",  core: "StructuredCore",   model: "Qwen3-14B",        status: "idle",     task: "Waiting for next commit", uptime: "—" },
  ];

  const cores = [
    { name: "FreeformCore",      desc: "LLM loop with all subsystems",            active: true,  agentCount: 2 },
    { name: "StructuredCore",    desc: "Code→Test→Fix StateGraph with DoneGate",  active: true,  agentCount: 2 },
    { name: "OrchestratorCore",  desc: "Specialist teams with DAG distribution",  active: false, agentCount: 0 },
    { name: "AdaptiveLearning",  desc: "Self-learning with skill library + PEFT", active: false, agentCount: 0 },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🤖</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Agents</div>
          <div style={{ color: T.emerald, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>3 Active · 1 Idle</div>
        </div>
      </div>

      <TabBar tabs={agentTabs} active={tab} onChange={setTab} />

      {tab === "active" && (
        <div>
          {agents.map(a => (
            <Card key={a.name} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={a.status} />
                  <span style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{a.name}</span>
                </div>
                <span style={{ color: T.text4, fontSize: 10 }}>{a.uptime}</span>
              </div>
              <div style={{ color: T.text3, fontSize: 11, marginBottom: 6 }}>{a.task}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <Badge color={T.violet}>{a.core}</Badge>
                <Badge color={T.cyan}>{a.model}</Badge>
              </div>
            </Card>
          ))}
          <div style={{ marginTop: 12 }}>
            <ActionBtn color={T.emerald} full>+ Deploy New Agent</ActionBtn>
          </div>
        </div>
      )}

      {tab === "cores" && (
        <div>
          {cores.map(c => (
            <Card key={c.name} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: c.active ? T.emerald + "22" : T.input,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${c.active ? T.emerald + "44" : T.border}`,
              }}>
                <span style={{ fontSize: 18 }}>{c.active ? "🟢" : "⚪"}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                <div style={{ color: T.text3, fontSize: 11 }}>{c.desc}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: c.agentCount > 0 ? T.emerald : T.text4, fontSize: 16, fontWeight: 800 }}>{c.agentCount}</div>
                <div style={{ color: T.text4, fontSize: 9 }}>agents</div>
              </div>
            </Card>
          ))}
          <Card style={{ marginTop: 12, border: `1px dashed ${T.superGold}44` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>✨</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.superGold, fontSize: 13, fontWeight: 700 }}>AdaptiveLearningCore</div>
                <div style={{ color: T.text3, fontSize: 11 }}>Self-learning with Voyager-style skill library + Reflexion memory + optional PEFT adapters</div>
              </div>
              <Badge color={T.superGold} glow>NEW</Badge>
            </div>
          </Card>
        </div>
      )}

      {tab === "builder" && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Core Builder</SectionLabel>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Core Name</label>
              <input placeholder="e.g. MyCustomCore" style={{ width: "100%", boxSizing: "border-box", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Base Core</label>
              <select style={{ width: "100%", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }}>
                <option>FreeformCore</option>
                <option>StructuredCore</option>
                <option>OrchestratorCore</option>
                <option>AdaptiveLearningCore</option>
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Shared Services</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["MemoryManager","CostTracker","CheckpointMgr","GuardrailsEngine","ExperienceStore","SkillLibrary"].map(s => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: T.emerald }} />
                    <span style={{ color: T.text2, fontSize: 10 }}>{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
          <ActionBtn color={T.violet} full>🔧 Generate Core Scaffold</ActionBtn>
        </div>
      )}
    </div>
  );
}

// ─── PANEL: MARKETPLACE ──────────────────────────────────────────
function MarketplacePanel() {
  const marketTabs = [
    { id: "browse",  icon: "🔍", label: "Browse",    color: T.sky },
    { id: "my",      icon: "📦", label: "My Cores",  color: T.violet },
    { id: "sell",    icon: "💰", label: "Sell",       color: T.superGold },
    { id: "review",  icon: "🔎", label: "Review",    color: T.emerald },
  ];
  const [tab, setTab] = useState("browse");
  const [filter, setFilter] = useState("all");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🛒</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Core Marketplace</div>
          <div style={{ color: T.sky, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Buy · Sell · Share Intelligence Cores</div>
        </div>
      </div>

      <TabBar tabs={marketTabs} active={tab} onChange={setTab} />

      {tab === "browse" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Search cores..." style={{ flex: 1, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }} />
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 10px", color: T.text2, fontSize: 11, outline: "none" }}>
              <option value="all">All</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
              <option value="trending">Trending</option>
            </select>
          </div>

          {MARKET_CORES.map(c => (
            <Card key={c.name} style={{ marginBottom: 10, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ color: T.text3, fontSize: 11 }}>by {c.author} · {c.base} · {c.size}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: c.price === "Free" ? T.emerald : T.superGold, fontSize: 14, fontWeight: 800 }}>{c.price}</div>
                  <div style={{ color: T.amber, fontSize: 10 }}>{"⭐".repeat(Math.floor(c.stars))} {c.stars}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {c.tags.map(t => <Badge key={t} color={T.indigo}>{t}</Badge>)}
                </div>
                <span style={{ color: T.text4, fontSize: 10 }}>⬇ {c.dl}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "sell" && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Submit Core for Review</SectionLabel>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Select Core to Sell</label>
              <select style={{ width: "100%", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }}>
                <option>React Dashboard Expert v2</option>
                <option>DevOps Automation Core</option>
                <option>Custom Python Pipeline</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Price</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {["Free","$2.99","$4.99","$9.99","Custom"].map(p => (
                    <button key={p} style={{
                      background: p === "Free" ? T.emerald + "22" : T.input,
                      border: `1px solid ${p === "Free" ? T.emerald + "55" : T.border}`,
                      borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                      color: p === "Free" ? T.emerald : T.text2, fontSize: 10, fontWeight: 600,
                    }}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>License</label>
                <select style={{ width: "100%", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 6, padding: "6px 8px", color: T.text1, fontSize: 11, outline: "none" }}>
                  <option>Apache 2.0</option>
                  <option>MIT</option>
                  <option>Proprietary</option>
                </select>
              </div>
            </div>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Build Cost Transparency</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 12 }}>
              <span style={{ color: T.text3 }}>Build Time:</span>
              <span style={{ color: T.text1 }}>2h 14m total</span>
              <span style={{ color: T.text3 }}>GPU Cost:</span>
              <span style={{ color: T.text1 }}>$0.00 (local RTX 3090 Ti)</span>
              <span style={{ color: T.text3 }}>Training Data:</span>
              <span style={{ color: T.text1 }}>2,847 pairs · 87/100 quality</span>
              <span style={{ color: T.text3 }}>Base Model:</span>
              <span style={{ color: T.text1 }}>Qwen3-8B (Apache 2.0)</span>
              <span style={{ color: T.text3 }}>Method:</span>
              <span style={{ color: T.text1 }}>QLoRA 4-bit + Unsloth</span>
              <span style={{ color: T.text3 }}>Adapter Size:</span>
              <span style={{ color: T.text1 }}>12.4 MB (.safetensors)</span>
            </div>
          </Card>

          <GradBtn full from={T.superGold} to={T.orange}>📤 Submit for Review</GradBtn>
        </div>
      )}

      {tab === "review" && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Core Review Engine</SectionLabel>
            <div style={{ color: T.text2, fontSize: 12, marginBottom: 12 }}>Automated + human review pipeline for marketplace submissions</div>
            {[
              { gate: "Schema Validation",   status: "pass", detail: "adapter_config.json valid, safetensors format" },
              { gate: "Security Scan",        status: "pass", detail: "No pickle files, no secrets detected" },
              { gate: "Quality Benchmark",    status: "pass", detail: "88/100 — above 70 threshold" },
              { gate: "Portability Check",    status: "pass", detail: "Works on any GPU ≥ 6GB VRAM" },
              { gate: "License Compliance",   status: "pass", detail: "Apache 2.0 — derivative works OK" },
              { gate: "Human Review",         status: "pending", detail: "Queued — avg wait: 4 hours" },
            ].map(g => (
              <div key={g.gate} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ color: g.status === "pass" ? T.emerald : T.amber, fontSize: 14, marginTop: -1 }}>
                  {g.status === "pass" ? "✅" : "⏳"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.text1, fontSize: 12, fontWeight: 600 }}>{g.gate}</div>
                  <div style={{ color: T.text3, fontSize: 11 }}>{g.detail}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "my" && (
        <div>
          <Card style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>React Dashboard Expert</div>
                <div style={{ color: T.emerald, fontSize: 11 }}>Published · Free · ⬇ 2.4k</div>
              </div>
              <Badge color={T.emerald}>Live</Badge>
            </div>
          </Card>
          <Card style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>DevOps Automation</div>
                <div style={{ color: T.amber, fontSize: 11 }}>Under Review · Free</div>
              </div>
              <Badge color={T.amber}>Review</Badge>
            </div>
          </Card>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>Python Pipeline v3</div>
                <div style={{ color: T.text3, fontSize: 11 }}>Draft · Not submitted</div>
              </div>
              <Badge color={T.text3}>Draft</Badge>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── PANEL: GPU ORCHESTRATOR ─────────────────────────────────────
function GPUPanel() {
  const gpuTabs = [
    { id: "cluster",  icon: "🖥️", label: "Cluster",   color: T.red },
    { id: "jobs",     icon: "📋", label: "Jobs",      color: T.amber },
    { id: "train",    icon: "🧠", label: "Launch",    color: T.emerald },
  ];
  const [tab, setTab] = useState("cluster");

  const jobs = [
    { id: "J-001", name: "QLoRA: React Expert v2",  provider: "Local",   gpu: "RTX 3090 Ti", status: "running",   progress: 67, cost: "$0.00",  eta: "~12 min" },
    { id: "J-002", name: "Full FT: Rust Specialist", provider: "RunPod",  gpu: "A100 80GB",   status: "running",   progress: 34, cost: "$1.22",  eta: "~45 min" },
    { id: "J-003", name: "Eval: GLM-4.7 Benchmark",  provider: "Local",   gpu: "RX 7800 XT",  status: "complete",  progress: 100, cost: "$0.00", eta: "Done" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🖥️</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>GPU Cluster</div>
          <div style={{ color: T.red, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Agentic GPU Orchestrator · BYOK</div>
        </div>
      </div>

      <TabBar tabs={gpuTabs} active={tab} onChange={setTab} />

      {tab === "cluster" && (
        <div>
          {GPU_PROVIDERS.map(p => (
            <Card key={p.id} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{p.label}</div>
                <div style={{ color: T.text3, fontSize: 11 }}>{p.gpus} · {p.rate}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <StatusDot status={p.status} />
                <span style={{ color: p.status === "connected" || p.status === "active" ? T.emerald : T.text4, fontSize: 11 }}>
                  {p.status}
                </span>
              </div>
            </Card>
          ))}
          <Card style={{ marginTop: 12, border: `1px dashed ${T.border2}`, textAlign: "center", padding: 16 }}>
            <span style={{ fontSize: 20 }}>➕</span>
            <div style={{ color: T.text3, fontSize: 11, marginTop: 4 }}>Add GPU Provider (BYOK)</div>
            <div style={{ color: T.text4, fontSize: 10, marginTop: 2 }}>RunPod · Lambda · Vast.ai · CoreWeave</div>
          </Card>
        </div>
      )}

      {tab === "jobs" && (
        <div>
          {jobs.map(j => (
            <Card key={j.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{j.name}</div>
                  <div style={{ color: T.text3, fontSize: 11 }}>{j.provider} · {j.gpu} · {j.id}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: j.cost === "$0.00" ? T.emerald : T.amber, fontSize: 13, fontWeight: 700 }}>{j.cost}</div>
                  <div style={{ color: T.text4, fontSize: 10 }}>{j.eta}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}><ProgressBar value={j.progress} max={100} color={j.progress >= 100 ? T.emerald : T.amber} /></div>
                <span style={{ color: j.progress >= 100 ? T.emerald : T.text2, fontSize: 11, fontWeight: 600, minWidth: 36, textAlign: "right" }}>{j.progress}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "train" && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Launch Training Job</SectionLabel>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Target GPU</label>
              <select style={{ width: "100%", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }}>
                <option>🟢 Local — RTX 3090 Ti (24GB) — Free</option>
                <option>🟡 Local — RX 7800 XT (16GB) — Free</option>
                <option>🟣 RunPod — A100 80GB — ~$1.10/hr</option>
                <option>🟠 Lambda — A100 40GB — ~$0.74/hr</option>
                <option>☁️ SkyPilot — Auto (cheapest spot)</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Method</label>
                <select style={{ width: "100%", background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", color: T.text1, fontSize: 12, outline: "none" }}>
                  <option>QLoRA 4-bit (Recommended)</option>
                  <option>LoRA 16-bit</option>
                  <option>DoRA</option>
                  <option>Full Fine-tune</option>
                </select>
              </div>
              <div>
                <label style={{ color: T.text2, fontSize: 11, display: "block", marginBottom: 4 }}>Max Budget</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {["$0","$5","$20","$50","∞"].map(b => (
                    <button key={b} style={{
                      flex: 1, background: b === "$0" ? T.emerald + "22" : T.input,
                      border: `1px solid ${b === "$0" ? T.emerald + "55" : T.border}`,
                      borderRadius: 6, padding: "6px 2px", cursor: "pointer",
                      color: b === "$0" ? T.emerald : T.text2, fontSize: 10, fontWeight: 600,
                    }}>{b}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <input type="checkbox" defaultChecked style={{ accentColor: T.emerald }} />
              <span style={{ color: T.text2, fontSize: 11 }}>Auto-terminate on completion</span>
              <div style={{ flex: 1 }} />
              <input type="checkbox" defaultChecked style={{ accentColor: T.amber }} />
              <span style={{ color: T.text2, fontSize: 11 }}>Save checkpoints</span>
            </div>
          </Card>
          <GradBtn full from={T.red} to={T.orange}>🚀 Launch GPU Job</GradBtn>
        </div>
      )}
    </div>
  );
}

// ─── PANEL: CONNECTIONS ──────────────────────────────────────────
function ConnectionsPanel() {
  const connTabs = [
    { id: "services", icon: "🔌", label: "Services",   color: T.amber },
    { id: "models",   icon: "🦙", label: "Models",     color: T.violet },
    { id: "keys",     icon: "🔑", label: "API Keys",   color: T.red },
  ];
  const [tab, setTab] = useState("services");

  const localModels = [
    { name: "GLM-4.7-Flash",     size: "18GB", status: "loaded",  gpu: "RTX 3090 Ti", speed: "93 t/s" },
    { name: "Qwen3-30B-A3B",     size: "18GB", status: "ready",   gpu: "RTX 3090 Ti", speed: "87 t/s" },
    { name: "Qwen3-8B",          size: "5GB",  status: "ready",   gpu: "RX 7800 XT",  speed: "110 t/s" },
    { name: "Qwen2.5-Coder-7B",  size: "4GB",  status: "ready",   gpu: "RX 7800 XT",  speed: "95 t/s" },
    { name: "GLM-4-9B",          size: "6GB",  status: "ready",   gpu: "—",           speed: "—" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🔌</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Connections</div>
          <div style={{ color: T.amber, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Services · Models · API Keys</div>
        </div>
      </div>

      <TabBar tabs={connTabs} active={tab} onChange={setTab} />

      {tab === "services" && (
        <div>
          {CONNECTIONS.map(c => (
            <Card key={c.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text1, fontSize: 13, fontWeight: 700 }}>{c.label}</div>
                <div style={{ color: T.text3, fontSize: 11 }}>{c.user}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <StatusDot status={c.status} />
                <span style={{ color: c.status === "connected" || c.status === "running" ? T.emerald : T.text4, fontSize: 11 }}>
                  {c.status}
                </span>
              </div>
            </Card>
          ))}
          <Card style={{ marginTop: 12, border: `1px dashed ${T.border2}`, textAlign: "center", padding: 14 }}>
            <span style={{ fontSize: 20 }}>➕</span>
            <div style={{ color: T.text3, fontSize: 11, marginTop: 4 }}>Add Service Connection</div>
          </Card>
        </div>
      )}

      {tab === "models" && (
        <div>
          {localModels.map(m => (
            <Card key={m.name} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: m.status === "loaded" ? T.emerald : T.amber,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text1, fontSize: 12, fontWeight: 700 }}>{m.name}</div>
                <div style={{ color: T.text3, fontSize: 10 }}>{m.size} · {m.gpu}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: m.status === "loaded" ? T.emerald : T.text3, fontSize: 11, fontWeight: 600 }}>
                  {m.status === "loaded" ? `⚡ ${m.speed}` : "Ready"}
                </div>
              </div>
            </Card>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <ActionBtn color={T.violet} small>Pull from Ollama</ActionBtn>
            <ActionBtn color={T.amber} small>Browse HuggingFace</ActionBtn>
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div>
          {[
            { label: "Claude API", key: "sk-ant-api03-***...xQ", set: true },
            { label: "HuggingFace", key: "hf_***...kM", set: true },
            { label: "RunPod", key: "rp_***...7a", set: true },
            { label: "Lambda Labs", key: "lambda_***...3f", set: true },
            { label: "OpenAI", key: "—", set: false },
            { label: "W&B", key: "wandb_***...2c", set: true },
          ].map(k => (
            <Card key={k.label} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text1, fontSize: 12, fontWeight: 700 }}>{k.label}</div>
                <div style={{ color: T.text4, fontSize: 10, fontFamily: "monospace" }}>{k.key}</div>
              </div>
              <button style={{
                background: k.set ? T.input : T.amber + "22",
                border: `1px solid ${k.set ? T.border : T.amber + "55"}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: k.set ? T.text3 : T.amber, fontSize: 10, fontWeight: 600,
              }}>{k.set ? "Edit" : "Add Key"}</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PANEL: MONITOR ──────────────────────────────────────────────
function MonitorPanel() {
  const logs = [
    { time: "14:32:01", level: "INFO",  msg: "CodeReview-Agent: Starting diff analysis on PR #142" },
    { time: "14:32:03", level: "INFO",  msg: "TestWriter-Agent: Generated 12 test cases for UserService" },
    { time: "14:32:05", level: "WARN",  msg: "GPU Memory: RTX 3090 Ti at 78% utilization" },
    { time: "14:32:08", level: "INFO",  msg: "DocGen-Agent: Updated 3 files in docs/" },
    { time: "14:32:10", level: "INFO",  msg: "Training J-001: Epoch 2/3 complete — loss: 0.142" },
    { time: "14:32:12", level: "OK",    msg: "Checkpoint saved: react-expert-v2-ep2.safetensors" },
    { time: "14:32:15", level: "INFO",  msg: "Marketplace: react-dashboard-expert downloaded × 3" },
    { time: "14:32:18", level: "INFO",  msg: "Ollama: GLM-4.7-Flash serving on :11434" },
  ];

  const levelColors = { INFO: T.text2, WARN: T.amber, ERROR: T.red, OK: T.emerald };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Monitor</div>
          <div style={{ color: T.cyan, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Real-Time System Dashboard</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Agents", value: "3/4", color: T.emerald },
          { label: "GPU Jobs", value: "2", color: T.amber },
          { label: "API Calls", value: "1.2k", color: T.sky },
          { label: "Cost Today", value: "$1.22", color: T.superGold },
        ].map(s => (
          <Card key={s.label} style={{ textAlign: "center", padding: 10 }}>
            <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            <div style={{ color: T.text4, fontSize: 9 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Cost Tracker — This Month</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: T.emerald, fontSize: 18, fontWeight: 800 }}>$0.00</div>
            <div style={{ color: T.text4, fontSize: 9 }}>Local GPU</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: T.amber, fontSize: 18, fontWeight: 800 }}>$4.87</div>
            <div style={{ color: T.text4, fontSize: 9 }}>Cloud GPU</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: T.sky, fontSize: 18, fontWeight: 800 }}>$12.30</div>
            <div style={{ color: T.text4, fontSize: 9 }}>API Calls</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <SectionLabel>Live Log Stream</SectionLabel>
          <Badge color={T.emerald}>Live</Badge>
        </div>
        <div style={{ background: T.bg, borderRadius: 8, padding: 10, maxHeight: 240, overflowY: "auto", fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
          {logs.map((l, i) => (
            <div key={i} style={{ fontSize: 10, marginBottom: 4, display: "flex", gap: 8 }}>
              <span style={{ color: T.text4, minWidth: 60 }}>{l.time}</span>
              <span style={{ color: levelColors[l.level] || T.text2, minWidth: 36, fontWeight: 600 }}>{l.level}</span>
              <span style={{ color: T.text2 }}>{l.msg}</span>
            </div>
          ))}
          <div style={{ color: T.emerald, fontSize: 10, marginTop: 4 }}>▮</div>
        </div>
      </Card>
    </div>
  );
}

// ─── PANEL: SETTINGS ─────────────────────────────────────────────
function SettingsPanel() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>⚙️</span>
        <div>
          <div style={{ color: T.text1, fontSize: 18, fontWeight: 800 }}>Settings</div>
          <div style={{ color: T.text3, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Super-Goose Configuration</div>
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Subscription</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: `linear-gradient(135deg, ${T.superGold}, ${T.orange})`,
            borderRadius: 10, padding: "12px 18px", textAlign: "center",
          }}>
            <div style={{ color: "#000", fontSize: 16, fontWeight: 900 }}>SUPER</div>
            <div style={{ color: "#000", fontSize: 9, fontWeight: 700, opacity: 0.7 }}>GOOSE</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.text1, fontSize: 14, fontWeight: 700 }}>Super-Goose Pro</div>
            <div style={{ color: T.emerald, fontSize: 11 }}>All features unlocked</div>
            <div style={{ color: T.text4, fontSize: 10 }}>Renews Feb 28, 2026</div>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Defaults</SectionLabel>
        {[
          { label: "Default Model", value: "GLM-4.7-Flash" },
          { label: "Training Method", value: "QLoRA 4-bit + Unsloth" },
          { label: "GPU Preference", value: "Local First → Cloud Spot" },
          { label: "Core Format", value: "SafeTensors (.safetensors)" },
          { label: "Max Agent Count", value: "4 (Claude) + unlimited (local)" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ color: T.text2, fontSize: 12 }}>{s.label}</span>
            <span style={{ color: T.text1, fontSize: 12, fontWeight: 600 }}>{s.value}</span>
          </div>
        ))}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Feature Toggles</SectionLabel>
        {[
          { label: "Auto-save checkpoints", on: true },
          { label: "GPU auto-terminate", on: true },
          { label: "Marketplace notifications", on: true },
          { label: "Agent cost alerts ($5 threshold)", on: true },
          { label: "Experimental: AdaptiveLearningCore", on: false },
          { label: "Experimental: Core hot-swap", on: false },
        ].map(f => (
          <label key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" defaultChecked={f.on} style={{ accentColor: T.emerald }} />
            <span style={{ color: T.text2, fontSize: 12 }}>{f.label}</span>
          </label>
        ))}
      </Card>

      <Card>
        <SectionLabel>Data & Storage</SectionLabel>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: T.text2, fontSize: 12 }}>NVMe Storage — 1.2 / 4.0 TB</span>
          </div>
          <ProgressBar value={1.2} max={4} color={T.sky} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 14px", fontSize: 11 }}>
          <span style={{ color: T.text3 }}>Models:</span>    <span style={{ color: T.text1 }}>847 GB</span>
          <span style={{ color: T.text3 }}>Cores:</span>     <span style={{ color: T.text1 }}>2.4 GB</span>
          <span style={{ color: T.text3 }}>Datasets:</span>  <span style={{ color: T.text1 }}>124 GB</span>
          <span style={{ color: T.text3 }}>Checkpoints:</span><span style={{ color: T.text1 }}>189 GB</span>
        </div>
      </Card>
    </div>
  );
}

// ─── MAIN LAYOUT: LEFT SIDEBAR + CONTENT ─────────────────────────
export default function SuperGoosePanel() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const panels = {
    dashboard: <DashboardPanel />,
    studios:   <StudiosPanel />,
    agents:    <AgentsPanel />,
    market:    <MarketplacePanel />,
    gpu:       <GPUPanel />,
    connect:   <ConnectionsPanel />,
    monitor:   <MonitorPanel />,
    settings:  <SettingsPanel />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: "'Segoe UI', -apple-system, sans-serif", color: T.text1 }}>
      {/* ─── LEFT SIDEBAR ─── */}
      <div style={{
        width: collapsed ? 52 : 180, minWidth: collapsed ? 52 : 180,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? "14px 10px" : "14px 16px",
          borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer",
        }} onClick={() => setCollapsed(!collapsed)}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `linear-gradient(135deg, ${T.superGold}, ${T.orange})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#000", flexShrink: 0,
          }}>SG</div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, lineHeight: 1.2 }}>Super-Goose</div>
              <div style={{ fontSize: 8, color: T.superGold, letterSpacing: 1.5, textTransform: "uppercase" }}>Pro Edition</div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div style={{ flex: 1, padding: "8px 6px" }}>
          {NAV.map(n => {
            const isActive = n.id === activeNav;
            return (
              <button key={n.id} onClick={() => setActiveNav(n.id)} title={n.label} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                background: isActive ? n.color + "18" : "transparent",
                border: isActive ? `1px solid ${n.color}33` : "1px solid transparent",
                borderRadius: 8, padding: collapsed ? "10px 12px" : "9px 12px",
                cursor: "pointer", marginBottom: 2, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
                {!collapsed && (
                  <span style={{
                    color: isActive ? n.color : T.text3, fontSize: 12,
                    fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap",
                  }}>{n.label}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom: Hardware Badge */}
        {!collapsed && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.emerald }} />
              <span style={{ color: T.text3, fontSize: 9 }}>RTX 3090 Ti · 24GB</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.sky }} />
              <span style={{ color: T.text3, fontSize: 9 }}>RX 7800 XT · 16GB</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── CONTENT AREA ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top Bar */}
        <div style={{
          background: T.surface, borderBottom: `1px solid ${T.border}`,
          padding: "8px 20px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ color: T.text1, fontSize: 14, fontWeight: 700 }}>
            {NAV.find(n => n.id === activeNav)?.icon} {NAV.find(n => n.id === activeNav)?.label}
          </span>
          <div style={{ flex: 1 }} />
          <Badge color={T.superGold} glow>SUPER</Badge>
          <Badge color={T.emerald}>3 Agents Running</Badge>
          <Badge color={T.amber}>2 GPU Jobs</Badge>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          <div style={{ maxWidth: 700 }}>
            {panels[activeNav]}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          background: T.surface, borderTop: `1px solid ${T.border}`,
          padding: "5px 20px", display: "flex", justifyContent: "center", gap: 16,
        }}>
          <span style={{ color: T.text5, fontSize: 9 }}>Super-Goose Pro v2.0</span>
          <span style={{ color: T.text5, fontSize: 9 }}>·</span>
          <span style={{ color: T.text5, fontSize: 9 }}>SkyPilot · Ollama · LM Studio</span>
          <span style={{ color: T.text5, fontSize: 9 }}>·</span>
          <span style={{ color: T.text5, fontSize: 9 }}>SafeTensors · QLoRA · Unsloth</span>
          <span style={{ color: T.text5, fontSize: 9 }}>·</span>
          <span style={{ color: T.text5, fontSize: 9 }}>100% Local-First · Open Source Core</span>
        </div>
      </div>
    </div>
  );
}
