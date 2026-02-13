import { useState } from "react";

const TABS = [
  { id: "source", num: "①", label: "SOURCE", icon: "📥", color: "#6366f1" },
  { id: "build", num: "②", label: "BUILD", icon: "🔨", color: "#f59e0b" },
  { id: "prepare", num: "③", label: "PREPARE", icon: "📊", color: "#10b981" },
  { id: "train", num: "④", label: "TRAIN", icon: "🧠", color: "#ef4444" },
  { id: "test", num: "⑤", label: "TEST", icon: "✅", color: "#8b5cf6" },
  { id: "publish", num: "⑥", label: "PUBLISH", icon: "🚀", color: "#0ea5e9" },
];

const SOURCES = [
  { id: "hf", icon: "🤗", label: "HuggingFace", desc: "Browse models & datasets from the Hub", best: "General skills" },
  { id: "gh", icon: "🐙", label: "GitHub", desc: "Clone a repo and learn its source code", best: "Code expertise" },
  { id: "local", icon: "📁", label: "My Files", desc: "Upload your own training data files", best: "Custom data" },
];

const RECIPES = [
  { icon: "🔥", label: "Coding Assistant", model: "Qwen3-8B", time: "~15 min", vram: "6GB" },
  { icon: "✍️", label: "Writing Style", model: "LLaMA-3.3-8B", time: "~20 min", vram: "6GB" },
  { icon: "🧠", label: "Reasoning Boost", model: "GLM-4-9B", time: "~25 min", vram: "7GB" },
  { icon: "📊", label: "Data Analyst", model: "Qwen3-14B", time: "~35 min", vram: "10GB" },
  { icon: "🎮", label: "Game Dev", model: "DeepSeek-8B", time: "~20 min", vram: "6GB" },
  { icon: "🔧", label: "DevOps Expert", model: "Qwen3-8B", time: "~15 min", vram: "6GB" },
];

const MODELS = [
  { name: "Qwen3-8B", vram: "~6GB", speed: "⚡ Fast", rec: true, note: "Best all-around" },
  { name: "GLM-4-9B-0414", vram: "~7GB", speed: "⚡ Fast", rec: true, note: "Great for coding" },
  { name: "LLaMA-3.3-8B", vram: "~6GB", speed: "⚡ Fast", rec: true, note: "Great for English" },
  { name: "Qwen3-14B", vram: "~10GB", speed: "🟡 Med", rec: false, note: "Higher quality" },
  { name: "Phi-4-14B", vram: "~10GB", speed: "🟡 Med", rec: false, note: "Microsoft" },
  { name: "GLM-4-32B-0414", vram: "~20GB", speed: "🔴 Slow", rec: false, note: "Max quality" },
];

const NIXPACKS_LANGS = [
  "Node.js", "Python", "Go", "Rust", "Ruby", "Java", "PHP", "C#", "Elixir",
  "Dart", "Deno", "Scala", "Swift", "Zig", "Haskell", "Crystal", "F#",
  "Clojure", "Cobol", "Static HTML"
];

function ProgressBar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: "#1a1a2e", borderRadius: 6, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.5s ease" }} />
    </div>
  );
}

function Badge({ children, color = "#6366f1" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 10,
      background: color + "22", color, fontSize: 11, fontWeight: 600, marginRight: 4
    }}>{children}</span>
  );
}

function SourceTab({ onSelect }) {
  const [selected, setSelected] = useState(null);
  const [ghUrl, setGhUrl] = useState("");

  return (
    <div>
      <p style={{ color: "#94a3b8", marginBottom: 16, fontSize: 14 }}>
        Where should your Intelligence Core learn from?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {SOURCES.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)} style={{
            background: selected === s.id ? "#6366f122" : "#0f0f23",
            border: selected === s.id ? "2px solid #6366f1" : "2px solid #1e293b",
            borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "left", transition: "all 0.2s"
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>{s.desc}</div>
            <Badge color="#10b981">Best for: {s.best}</Badge>
          </button>
        ))}
      </div>

      {selected === "gh" && (
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 6 }}>GitHub Repository URL</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={ghUrl} onChange={e => setGhUrl(e.target.value)} placeholder="https://github.com/user/repo"
              style={{ flex: 1, background: "#1a1a2e", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
            <button onClick={() => onSelect("build")} style={{
              background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13
            }}>Clone & Build →</button>
          </div>
        </div>
      )}

      {selected === "hf" && (
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Search models (e.g. Qwen3, coding, 8B)..."
              style={{ flex: 1, background: "#1a1a2e", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
            <button style={{ background: "#f59e0b", color: "#000", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Search 🤗</button>
          </div>
          <p style={{ color: "#64748b", fontSize: 12 }}>Only models that fit your GPU (RTX 3090 Ti, 24GB) will be shown</p>
        </div>
      )}

      {selected === "local" && (
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>Drop files here or click to browse</p>
          <p style={{ color: "#475569", fontSize: 11 }}>Supports: .jsonl, .csv, .txt, .pdf, .py, .js, .ts, .zip</p>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ color: "#64748b", fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          ─── Quick Recipes (one click) ───
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {RECIPES.map(r => (
            <button key={r.label} onClick={() => onSelect("train")} style={{
              background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px",
              cursor: "pointer", textAlign: "left", transition: "all 0.2s"
            }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{r.icon} <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{r.label}</span></div>
              <div style={{ color: "#475569", fontSize: 11 }}>{r.model} · {r.time} · {r.vram}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildTab({ onSelect }) {
  const [step, setStep] = useState(0);
  const steps = [
    { label: "Cloned repository", done: true },
    { label: "Detected: Node.js 20 + React 18 + TypeScript", done: true },
    { label: "Nixpacks plan generated", done: true },
    { label: "npm install (347 packages)", done: true },
    { label: "npm run build", done: step >= 1 },
    { label: "Starting dev server on :3000", done: step >= 2 },
  ];

  useState(() => {
    const t1 = setTimeout(() => setStep(1), 1200);
    const t2 = setTimeout(() => setStep(2), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>Repository: </span>
          <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>github.com/user/awesome-dashboard</span>
        </div>
        <Badge color="#10b981">Nixpacks Auto-Build</Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Build Log</div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: s.done ? "#10b981" : "#f59e0b" }}>{s.done ? "✅" : "⏳"}</span>
              <span style={{ color: s.done ? "#94a3b8" : "#e2e8f0" }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#0a0a1a", border: "1px solid #1e293b", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {step >= 2 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>🟢 Live Preview</div>
              <div style={{ background: "#111827", borderRadius: 8, padding: 16, width: "100%", border: "1px solid #2d3748" }}>
                <div style={{ background: "#1e293b", height: 8, borderRadius: 4, marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px", gap: 8 }}>
                  <div style={{ background: "#1e293b", height: 80, borderRadius: 4 }} />
                  <div>
                    <div style={{ background: "#1e293b", height: 30, borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ background: "#1e293b", height: 30, borderRadius: 4 }} />
                  </div>
                  <div style={{ background: "#1e293b", height: 80, borderRadius: 4 }} />
                </div>
              </div>
              <p style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>localhost:3000</p>
            </div>
          ) : (
            <div style={{ color: "#475569", fontSize: 13 }}>Building...</div>
          )}
        </div>
      </div>

      <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Code Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Files", value: "127" },
            { label: "Functions", value: "412" },
            { label: "Components", value: "34" },
            { label: "Tests", value: "18" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 700 }}>{s.value}</div>
              <div style={{ color: "#64748b", fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <Badge color="#6366f1">React 18</Badge>
          <Badge color="#3b82f6">TypeScript</Badge>
          <Badge color="#f59e0b">Redux</Badge>
          <Badge color="#10b981">REST + tRPC</Badge>
          <Badge color="#8b5cf6">PostgreSQL</Badge>
          <Badge color="#ec4899">Tailwind CSS</Badge>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Badge color="#f59e0b">Nixpacks supports: {NIXPACKS_LANGS.length} languages</Badge>
        <div style={{ flex: 1 }} />
        <button onClick={() => onSelect("prepare")} style={{
          background: "#f59e0b", color: "#000", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13
        }}>Next: Prepare →</button>
      </div>
    </div>
  );
}

function PrepareTab({ onSelect }) {
  const [mode, setMode] = useState(null);
  const categories = [
    { label: "Function Explanation", count: 812, color: "#6366f1" },
    { label: "Code Generation", count: 734, color: "#3b82f6" },
    { label: "Debugging", count: 523, color: "#ef4444" },
    { label: "Architecture", count: 401, color: "#f59e0b" },
    { label: "Testing", count: 287, color: "#10b981" },
    { label: "UI/UX (Vision)", count: 90, color: "#8b5cf6" },
  ];
  const total = categories.reduce((s, c) => s + c.count, 0);
  const maxCount = Math.max(...categories.map(c => c.count));

  return (
    <div>
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>How should I create training data?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { id: "auto", icon: "🤖", label: "Auto-Generate", desc: "I'll analyze the code and generate Q&A pairs", tag: "Recommended" },
          { id: "manual", icon: "📝", label: "Manual Edit", desc: "Upload or write your own training pairs", tag: "Custom" },
          { id: "mix", icon: "🔀", label: "Mix", desc: "Auto-generate + your own data combined", tag: "Maximum quality" },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            background: mode === m.id ? "#10b98122" : "#0f0f23",
            border: mode === m.id ? "2px solid #10b981" : "2px solid #1e293b",
            borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left"
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>{m.label}</div>
            <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>{m.desc}</div>
            <Badge color="#10b981">{m.tag}</Badge>
          </button>
        ))}
      </div>

      {mode && (
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700 }}>{total.toLocaleString()}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}> training pairs generated</span>
            </div>
            <div>
              <span style={{ color: "#10b981", fontSize: 14, fontWeight: 700 }}>87</span>
              <span style={{ color: "#64748b", fontSize: 12 }}>/100 Quality</span>
            </div>
          </div>

          {categories.map(c => (
            <div key={c.label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{c.label}</span>
                <span style={{ color: "#64748b", fontSize: 11 }}>{c.count}</span>
              </div>
              <ProgressBar value={c.count} max={maxCount} color={c.color} />
            </div>
          ))}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#475569", fontSize: 11 }}>
              Avg tokens per pair: 342 · Est. training time: ~28 min
            </div>
            <button onClick={() => onSelect("train")} style={{
              background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13
            }}>Next: Train →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrainTab({ onSelect }) {
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [model, setModel] = useState("Qwen3-8B");
  const [preset, setPreset] = useState("recommended");

  const startTraining = () => {
    setTraining(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 2;
      });
    }, 200);
  };

  return (
    <div>
      {!training ? (
        <>
          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Base Model</div>
            <select value={model} onChange={e => setModel(e.target.value)} style={{
              width: "100%", background: "#1a1a2e", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px",
              color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 8
            }}>
              {MODELS.map(m => (
                <option key={m.name} value={m.name}>{m.rec ? "⭐ " : ""}{m.name} — {m.vram} {m.speed} ({m.note})</option>
              ))}
            </select>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "#64748b", fontSize: 11 }}>VRAM needed: </span>
              <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600 }}>~6GB of 24GB available</span>
              <div style={{ marginTop: 4 }}><ProgressBar value={6} max={24} color="#10b981" /></div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Method</div>
              {["QLoRA 4-bit (Recommended)", "LoRA 16-bit", "Full fine-tune"].map((m, i) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="radio" name="method" defaultChecked={i === 0} style={{ accentColor: "#ef4444" }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{m}</span>
                </label>
              ))}
            </div>
            <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Speed</div>
              {["Turbo (Unsloth 2-5x faster)", "Standard"].map((m, i) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="radio" name="speed" defaultChecked={i === 0} style={{ accentColor: "#ef4444" }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{m}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Preset</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {[
                { id: "quick", label: "Quick Test", detail: "1 epoch · ~5 min" },
                { id: "recommended", label: "Recommended", detail: "3 epochs · ~28 min" },
                { id: "quality", label: "High Quality", detail: "5 epochs · ~45 min" },
                { id: "custom", label: "Custom", detail: "All parameters" },
              ].map(p => (
                <button key={p.id} onClick={() => setPreset(p.id)} style={{
                  background: preset === p.id ? "#ef444422" : "#1a1a2e",
                  border: preset === p.id ? "2px solid #ef4444" : "1px solid #2d3748",
                  borderRadius: 8, padding: 10, cursor: "pointer", textAlign: "center"
                }}>
                  <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{p.label}</div>
                  <div style={{ color: "#64748b", fontSize: 10 }}>{p.detail}</div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={startTraining} style={{
            width: "100%", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff",
            border: "none", borderRadius: 10, padding: "14px 20px", cursor: "pointer", fontWeight: 800, fontSize: 16,
            letterSpacing: 1
          }}>▶▶ START TRAINING</button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <Badge color="#ef4444">Qwen3-8B</Badge>
              <Badge color="#f59e0b">QLoRA 4-bit</Badge>
              <Badge color="#10b981">Unsloth ON</Badge>
            </div>
            <span style={{ color: progress >= 100 ? "#10b981" : "#f59e0b", fontSize: 13, fontWeight: 700 }}>
              {progress >= 100 ? "✅ Complete!" : `${progress}%`}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <ProgressBar value={progress} max={100} color={progress >= 100 ? "#10b981" : "#ef4444"} />
          </div>

          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Loss Curve</div>
            <svg viewBox="0 0 300 80" style={{ width: "100%", height: 80 }}>
              <polyline fill="none" stroke="#ef4444" strokeWidth="2"
                points={Array.from({ length: Math.floor(progress / 2) }, (_, i) => {
                  const x = (i / 50) * 300;
                  const y = 70 - (60 * (1 - Math.exp(-i * 0.08)));
                  return `${x},${y}`;
                }).join(" ")} />
              <line x1="0" y1="75" x2="300" y2="75" stroke="#1e293b" strokeWidth="1" />
            </svg>
          </div>

          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>GPU Status</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>RTX 3090 Ti: 6.2GB / 24GB</span>
              <span style={{ color: "#10b981", fontSize: 12 }}>72°C</span>
            </div>
            <div style={{ marginTop: 4 }}><ProgressBar value={6.2} max={24} color="#10b981" /></div>
          </div>

          {progress >= 100 && (
            <button onClick={() => onSelect("test")} style={{
              width: "100%", background: "#10b981", color: "#fff",
              border: "none", borderRadius: 10, padding: "12px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14
            }}>Training Complete! → Test Your Core</button>
          )}
        </>
      )}
    </div>
  );
}

function TestTab({ onSelect }) {
  const scores = [
    { label: "Code Quality", score: 92 },
    { label: "Instruction Following", score: 88 },
    { label: "Helpfulness", score: 85 },
    { label: "Accuracy", score: 90 },
    { label: "Consistency", score: 87 },
  ];
  const overall = Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <Badge color="#10b981">Training Complete</Badge>
          <Badge color="#8b5cf6">Adapter: 8.3MB</Badge>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Chat Test</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ background: "#1a1a2e", borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <span style={{ color: "#6366f1", fontSize: 11, fontWeight: 600 }}>You: </span>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>How do I add a new API route?</span>
            </div>
            <div style={{ background: "#0a2e1a", borderRadius: 8, padding: 10 }}>
              <span style={{ color: "#10b981", fontSize: 11, fontWeight: 600 }}>Core: </span>
              <span style={{ color: "#d1fae5", fontSize: 12 }}>In this project, routes live in <span style={{ fontFamily: "monospace", background: "#1a1a2e", padding: "1px 4px", borderRadius: 3 }}>src/routes/</span>. Create a new file following the pattern in users.ts. Register the router in app.ts with <span style={{ fontFamily: "monospace", background: "#1a1a2e", padding: "1px 4px", borderRadius: 3 }}>app.use('/api/notifications', notifRouter)</span>...</span>
            </div>
          </div>
          <div style={{ background: "#1a1a2e", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8 }}>
            <input placeholder="Ask your Core a question..." style={{ flex: 1, background: "transparent", border: "none", color: "#e2e8f0", fontSize: 12, outline: "none" }} />
            <span style={{ color: "#6366f1", cursor: "pointer" }}>↵</span>
          </div>
        </div>

        <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Benchmark Results</div>
          {scores.map(s => (
            <div key={s.label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{s.label}</span>
                <span style={{ color: s.score >= 85 ? "#10b981" : "#f59e0b", fontSize: 12, fontWeight: 600 }}>{s.score}/100</span>
              </div>
              <ProgressBar value={s.score} max={100} color={s.score >= 85 ? "#10b981" : "#f59e0b"} />
            </div>
          ))}
          <div style={{ borderTop: "1px solid #1e293b", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>Overall: {overall}/100</span>
            <span style={{ fontSize: 16 }}>⭐⭐⭐⭐</span>
          </div>
          <div style={{ color: "#10b981", fontSize: 11, marginTop: 6 }}>+23 points vs base model</div>
        </div>
      </div>

      <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Side-by-Side Comparison</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>BASE MODEL (no LoRA)</div>
            <div style={{ color: "#64748b", fontSize: 11 }}>"To add an API route, you typically create an endpoint handler and register it with your framework's router..."</div>
            <Badge color="#ef4444">Generic ❌</Badge>
          </div>
          <div style={{ background: "#0a2e1a", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#10b981", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>YOUR CORE (with LoRA)</div>
            <div style={{ color: "#d1fae5", fontSize: 11 }}>"In this project, create src/routes/notifications.ts following the Express router pattern used in users.ts and posts.ts..."</div>
            <Badge color="#10b981">Project-Specific ✅</Badge>
          </div>
        </div>
      </div>

      <button onClick={() => onSelect("publish")} style={{
        width: "100%", background: "#8b5cf6", color: "#fff",
        border: "none", borderRadius: 10, padding: "12px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14
      }}>Looking Great! → Publish</button>
    </div>
  );
}

function PublishTab() {
  const [published, setPublished] = useState(false);
  const gates = [
    { label: "V1: Schema valid", pass: true },
    { label: "V2: Security passed", pass: true },
    { label: "V3: Eval passed (88/100)", pass: true },
    { label: "V4: Portable (any GPU ≥6GB)", pass: true },
    { label: "V5: Quality check passed", pass: true },
  ];

  return (
    <div>
      {!published ? (
        <>
          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Core Details</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 3 }}>Name</label>
              <input defaultValue="React Dashboard Expert" style={{ width: "100%", boxSizing: "border-box", background: "#1a1a2e", border: "1px solid #2d3748", borderRadius: 6, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 3 }}>Description</label>
              <textarea rows={2} defaultValue="Specialized in React+TS dashboard patterns. Trained on awesome-dashboard repo. Knows Recharts, Redux, Prisma, tRPC." style={{ width: "100%", boxSizing: "border-box", background: "#1a1a2e", border: "1px solid #2d3748", borderRadius: 6, padding: "8px 12px", color: "#e2e8f0", fontSize: 12, outline: "none", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Badge color="#6366f1">react</Badge>
              <Badge color="#3b82f6">typescript</Badge>
              <Badge color="#f59e0b">dashboard</Badge>
              <Badge color="#10b981">coding</Badge>
            </div>
          </div>

          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>5-Gate Validation</div>
            {gates.map(g => (
              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 12 }}>
                <span style={{ color: "#10b981" }}>✅</span>
                <span style={{ color: "#94a3b8" }}>{g.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Pricing</div>
              {["Free (open source)", "$4.99 (suggested)", "Custom"].map((p, i) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="radio" name="price" defaultChecked={i === 0} style={{ accentColor: "#0ea5e9" }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{p}</span>
                </label>
              ))}
            </div>
            <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Destination</div>
              {[
                { label: "Goose Marketplace", checked: true },
                { label: "Save Locally", checked: true },
                { label: "HuggingFace Hub", checked: false },
                { label: "Export as GGUF", checked: false },
              ].map(d => (
                <label key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked={d.checked} style={{ accentColor: "#0ea5e9" }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={() => setPublished(true)} style={{
            width: "100%", background: "linear-gradient(135deg, #0ea5e9, #6366f1)", color: "#fff",
            border: "none", borderRadius: 10, padding: "14px 20px", cursor: "pointer", fontWeight: 800, fontSize: 16, letterSpacing: 1
          }}>🚀 PUBLISH CORE</button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
          <div style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Core Published!</div>
          <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 20 }}>
            "React Dashboard Expert" is now live on the Goose Marketplace
          </div>
          <div style={{ background: "#0f0f23", border: "1px solid #1e293b", borderRadius: 10, padding: 16, display: "inline-block", textAlign: "left" }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Package:</span>
              <span style={{ color: "#e2e8f0", fontFamily: "monospace" }}>react-dashboard-expert-v1.gcpkg</span>
              <span style={{ color: "#64748b" }}>Size:</span>
              <span style={{ color: "#e2e8f0" }}>12.4 MB</span>
              <span style={{ color: "#64748b" }}>Quality:</span>
              <span style={{ color: "#10b981" }}>88/100 ⭐⭐⭐⭐</span>
              <span style={{ color: "#64748b" }}>Base:</span>
              <span style={{ color: "#e2e8f0" }}>Qwen3-8B</span>
              <span style={{ color: "#64748b" }}>Method:</span>
              <span style={{ color: "#e2e8f0" }}>QLoRA 4-bit + Unsloth</span>
              <span style={{ color: "#64748b" }}>Total Time:</span>
              <span style={{ color: "#f59e0b" }}>~30 minutes</span>
            </div>
          </div>
          <div style={{ marginTop: 20, color: "#475569", fontSize: 12 }}>
            Every path led to a working Core. Zero ML knowledge required. ✨
          </div>
        </div>
      )}
    </div>
  );
}

export default function GooseStudio() {
  const [activeTab, setActiveTab] = useState("source");

  const tabContent = {
    source: <SourceTab onSelect={setActiveTab} />,
    build: <BuildTab onSelect={setActiveTab} />,
    prepare: <PrepareTab onSelect={setActiveTab} />,
    train: <TrainTab onSelect={setActiveTab} />,
    test: <TestTab onSelect={setActiveTab} />,
    publish: <PublishTab />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080818", fontFamily: "'Segoe UI', -apple-system, sans-serif", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ background: "#0a0a1f", borderBottom: "1px solid #1e293b", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 22 }}>🧪</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>GOOSE STUDIO</div>
          <div style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Every Path Leads to a Working Core</div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge color="#10b981">RTX 3090 Ti: 24GB</Badge>
        <Badge color="#6366f1">RTX 3060 Ti: 12GB</Badge>
      </div>

      {/* Pipeline Progress */}
      <div style={{ background: "#0a0a1f", padding: "8px 20px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {TABS.map((tab, i) => {
            const isActive = tab.id === activeTab;
            const activeIdx = TABS.findIndex(t => t.id === activeTab);
            const isPast = i < activeIdx;
            return (
              <div key={tab.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <button onClick={() => setActiveTab(tab.id)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: isActive ? tab.color + "22" : "transparent",
                  border: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                  borderRadius: 8, padding: "8px 4px", cursor: "pointer", transition: "all 0.2s"
                }}>
                  <span style={{ fontSize: 14 }}>{isPast ? "✅" : tab.icon}</span>
                  <span style={{ color: isActive ? tab.color : isPast ? "#10b981" : "#475569", fontSize: 11, fontWeight: isActive ? 700 : 500 }}>
                    {tab.label}
                  </span>
                </button>
                {i < TABS.length - 1 && (
                  <div style={{ width: 20, height: 2, background: isPast ? "#10b981" : "#1e293b", margin: "0 2px" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
        {tabContent[activeTab]}
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0a0a1f", borderTop: "1px solid #1e293b", padding: "6px 20px", display: "flex", justifyContent: "center", gap: 20 }}>
        <span style={{ color: "#334155", fontSize: 10 }}>Nixpacks Build Engine</span>
        <span style={{ color: "#334155", fontSize: 10 }}>·</span>
        <span style={{ color: "#334155", fontSize: 10 }}>LLaMA-Factory + Unsloth</span>
        <span style={{ color: "#334155", fontSize: 10 }}>·</span>
        <span style={{ color: "#334155", fontSize: 10 }}>Vision Agent: Qwen2.5-VL</span>
        <span style={{ color: "#334155", fontSize: 10 }}>·</span>
        <span style={{ color: "#334155", fontSize: 10 }}>100% Open Source · 100% Local</span>
      </div>
    </div>
  );
}
