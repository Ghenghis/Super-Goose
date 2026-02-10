import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import useBaseUrl from "@docusaurus/useBaseUrl";

import styles from "./index.module.css";

/* ─────────────────────────  Hero Section  ───────────────────────── */
function HeroSection() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <img
          src={useBaseUrl("/img/super-goose/hero-banner.svg")}
          alt="Super-Goose — AI Agent Platform"
          className={styles.heroBannerImg}
        />
        <p className={styles.heroTagline}>{siteConfig.tagline}</p>
        <div className={styles.heroCta}>
          <Link className="button button--primary button--lg" to="docs/getting-started/installation">
            Install Super-Goose
          </Link>
          <Link className={styles.secondaryBtn} to="https://github.com/Ghenghis/Super-Goose">
            View on GitHub
          </Link>
          <Link className={styles.secondaryBtn} to="https://github.com/Ghenghis/Super-Goose/releases">
            Download v1.24.02
          </Link>
        </div>
        <div className={styles.badgeRow}>
          <img src="https://img.shields.io/badge/License-Apache_2.0-FF6600.svg?style=for-the-badge" alt="License" />
          <img src="https://img.shields.io/badge/Tools-16_Integrated-00BFFF.svg?style=for-the-badge" alt="16 Tools" />
          <img src="https://img.shields.io/badge/Agents-5_Specialists-9966FF.svg?style=for-the-badge" alt="5 Agents" />
          <img src="https://img.shields.io/badge/Voice-Moshi_7B-FF3366.svg?style=for-the-badge" alt="Voice" />
          <img src="https://img.shields.io/badge/Stage-5_Self--Evolving-00CC66.svg?style=for-the-badge" alt="Stage 5" />
          <a href="https://github.com/Ghenghis/Super-Goose/pkgs/container/super-goose">
            <img src="https://img.shields.io/badge/Docker-ghcr.io-2496ED.svg?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
          </a>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────  Stats Bar  ───────────────────────── */
function StatsBar() {
  const stats = [
    { value: "161K+", label: "Lines of Rust" },
    { value: "~2,000", label: "Test Functions" },
    { value: "171", label: "Commits Ahead" },
    { value: "16", label: "Integrated Tools" },
    { value: "5", label: "Specialist Agents" },
    { value: "127", label: "Memory Tests" },
    { value: "43", label: "CI/CD Workflows" },
    { value: "7", label: "Workspace Crates" },
  ];
  return (
    <section className={styles.statsBar}>
      <div className={styles.statsGrid}>
        {stats.map((s, i) => (
          <div key={i} className={styles.statCard}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────  Pipeline Section  ───────────────────────── */
function PipelineSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>How Super-Goose Works</h2>
        <p className={styles.sectionSubtitle}>
          From voice or text input to production-quality code — every step automated, reviewed, and traced.
        </p>
        <img
          src={useBaseUrl("/img/super-goose/pipeline-flow.svg")}
          alt="Super-Goose End-to-End Pipeline"
          className={styles.fullWidthImg}
        />
        <div className={styles.pipelineSteps}>
          {[
            { step: "1", title: "Plan", desc: "Your request enters the Planner, which breaks it into structured steps with dependencies", tools: "Goose Core, LangGraph" },
            { step: "2", title: "Assign", desc: "The ALMAS Team Coordinator assigns each step to the right specialist agent", tools: "5 agents: Architect, Developer, QA, Security, Deployer" },
            { step: "3", title: "Execute", desc: "Each agent executes in an isolated MicroVM sandbox with snapshot/restore", tools: "microsandbox, Arrakis" },
            { step: "4", title: "Scan", desc: "Every line of generated code passes through security scanning and AST-aware analysis", tools: "Semgrep, ast-grep, CrossHair" },
            { step: "5", title: "Review", desc: "The Coach/Player QA system reviews output in up to 3 adversarial cycles", tools: "Coach (precise), Player (creative)" },
            { step: "6", title: "Ship", desc: "Approved code gets a PR-Agent review and full observability traces", tools: "PR-Agent, Langfuse" },
            { step: "7", title: "Evolve", desc: "Overnight, the Self-Evolution Engine analyzes attempts and optimizes prompts", tools: "DSPy, Inspect AI, Mem0" },
          ].map((p, i) => (
            <div key={i} className={styles.pipelineCard}>
              <div className={styles.pipelineStep}>{p.step}</div>
              <div>
                <h4 className={styles.pipelineCardTitle}>{p.title}</h4>
                <p className={styles.pipelineCardDesc}>{p.desc}</p>
                <span className={styles.pipelineTools}>{p.tools}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  16 Tools Section  ───────────────────────── */
function ToolsSection() {
  const categories = [
    {
      title: "Core Agent Layer",
      color: "#00BFFF",
      tools: [
        { name: "Goose Core", desc: "Rust agent engine with MCP protocol, multi-provider LLM support" },
        { name: "Aider", desc: "AI pair programmer with 14 code editing strategies" },
        { name: "LangGraph", desc: "Graph-based workflows with checkpoint/resume and time-travel" },
        { name: "OpenHands", desc: "Sandboxed execution with browser automation" },
        { name: "Pydantic-AI", desc: "Type-safe structured outputs with runtime validation" },
        { name: "Conscious", desc: "Voice-first interface with emotion detection (8 emotions)" },
      ],
    },
    {
      title: "Self-Evolution Engine",
      color: "#9966FF",
      tools: [
        { name: "DSPy", desc: "Bayesian prompt optimization (MIPROv2, GEPA)" },
        { name: "Inspect AI", desc: "UK AISI evaluation framework for scoring agent quality" },
        { name: "Mem0", desc: "Graph memory (Neo4j + Qdrant) with trajectory recall" },
      ],
    },
    {
      title: "Sandbox & Execution",
      color: "#FF9900",
      tools: [
        { name: "microsandbox", desc: "MicroVM isolation with <200ms boot, MCP-native" },
        { name: "Arrakis", desc: "VM snapshots for Language Agent Tree Search (LATS)" },
      ],
    },
    {
      title: "Governance & Observability",
      color: "#00CC66",
      tools: [
        { name: "Langfuse", desc: "Distributed tracing with token/cost/latency dashboards" },
        { name: "Semgrep", desc: "Policy-as-code security scanning on every diff" },
        { name: "PR-Agent", desc: "AI-powered code review, test generation, changelogs" },
      ],
    },
    {
      title: "Code Quality & Verification",
      color: "#FF3366",
      tools: [
        { name: "ast-grep", desc: "AST-aware structural code search and refactoring" },
        { name: "CrossHair", desc: "Formal verification with Z3 symbolic execution" },
      ],
    },
  ];

  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>The 16 Integrated Tools</h2>
        <p className={styles.sectionSubtitle}>
          Every tool is wired through the ResourceCoordinator with initialization locks, lazy loading, and atomic operations.
        </p>
        <img
          src={useBaseUrl("/img/super-goose/tool-ecosystem.svg")}
          alt="Super-Goose 16-Tool Ecosystem"
          className={styles.ecosystemImg}
        />
        <div className={styles.toolCategories}>
          {categories.map((cat, i) => (
            <div key={i} className={styles.toolCategory}>
              <h3 style={{ borderLeft: `4px solid ${cat.color}`, paddingLeft: "12px" }}>
                {cat.title}
              </h3>
              <div className={styles.toolList}>
                {cat.tools.map((t, j) => (
                  <div key={j} className={styles.toolItem}>
                    <span className={styles.toolName} style={{ color: cat.color }}>{t.name}</span>
                    <span className={styles.toolDesc}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Stage 5 Comparison  ───────────────────────── */
function Stage5Section() {
  const rows = [
    { dim: "Architecture", s4: "Single agent", s5: "5 specialist roles + orchestrator" },
    { dim: "Memory", s4: "None — starts fresh every time", s5: "Graph memory with trajectory recall" },
    { dim: "Prompts", s4: "Static forever", s5: "DSPy-compiled, improve nightly" },
    { dim: "Quality", s4: "No review — user sees all errors", s5: "Coach/Player adversarial review (3 cycles)" },
    { dim: "Voice", s4: "Text only", s5: "Moshi 7B speech-to-speech (<200ms)" },
    { dim: "Security", s4: "None", s5: "Semgrep + CrossHair on every diff" },
    { dim: "Sandbox", s4: "Docker containers", s5: "MicroVM isolation (<200ms boot)" },
    { dim: "Observability", s4: "None", s5: "Langfuse traces + OpenTelemetry spans" },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Why Stage 5?</h2>
        <p className={styles.sectionSubtitle}>
          Current AI coding agents operate at Stage 4 — a single model, static prompts, no memory.
          Super-Goose breaks through to Stage 5.
        </p>
        <img
          src={useBaseUrl("/img/super-goose/stage5-comparison.svg")}
          alt="Stage 4 vs Stage 5 Comparison"
          className={styles.comparisonImg}
        />
        <div className={styles.comparisonTable}>
          <div className={styles.comparisonHeader}>
            <span>Dimension</span>
            <span>Stage 4 (Current)</span>
            <span>Stage 5 (Super-Goose)</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={styles.comparisonRow}>
              <span className={styles.compDim}>{r.dim}</span>
              <span className={styles.compS4}>{r.s4}</span>
              <span className={styles.compS5}>{r.s5}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  ALMAS Agents  ───────────────────────── */
function AgentsSection() {
  const agents = [
    { role: "Architect", emoji: "📐", resp: "Creates design docs, PLAN.md, architecture decisions", access: "Read all, write docs only" },
    { role: "Developer", emoji: "💻", resp: "Writes code, runs builds, creates implementations", access: "Full code access" },
    { role: "QA Engineer", emoji: "🧪", resp: "Runs tests, checks coverage ≥ 80%, validates quality", access: "Read all, write tests only" },
    { role: "Security", emoji: "🛡️", resp: "Runs cargo audit, Semgrep scans, vulnerability checks", access: "Read all, scan tools only" },
    { role: "Deployer", emoji: "🚀", resp: "Builds release artifacts, manages deployment", access: "Build/deploy access only" },
  ];

  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>The ALMAS 5-Agent Team</h2>
        <p className={styles.sectionSubtitle}>
          Every task flows through five specialist agents in sequence, each with role-based access control (RBAC).
        </p>
        <img
          src={useBaseUrl("/img/super-goose/specialist-agents.svg")}
          alt="ALMAS 5 Specialist Agents"
          className={styles.ecosystemImg}
        />
        <div className={styles.agentGrid}>
          {agents.map((a, i) => (
            <div key={i} className={styles.agentCard}>
              <div className={styles.agentEmoji}>{a.emoji}</div>
              <h4 className={styles.agentRole}>{a.role}</h4>
              <p className={styles.agentResp}>{a.resp}</p>
              <span className={styles.agentAccess}>{a.access}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Overnight Gym  ───────────────────────── */
function OvernightGymSection() {
  const phases = [
    { phase: "Load", desc: "Pulls 50 benchmark tasks from SWE-bench Verified" },
    { phase: "Execute", desc: "Runs each task in an isolated microsandbox MicroVM" },
    { phase: "Score", desc: "Inspect AI evaluates every attempt with model-graded metrics" },
    { phase: "Optimize", desc: "DSPy GEPA analyzes patterns across all attempts, compiles better prompts" },
    { phase: "Remember", desc: "Mem0 stores successful trajectories as entity-relationship graphs" },
    { phase: "Improve", desc: "Week-over-week improvement tracked for regression detection" },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Self-Evolution: The Overnight Gym</h2>
        <p className={styles.sectionSubtitle}>
          Super-Goose gets better over time — automatically. Every night, the Overnight Gym runs a full optimization cycle.
        </p>
        <img
          src={useBaseUrl("/img/super-goose/overnight-gym.svg")}
          alt="Overnight Gym Self-Evolution Cycle"
          className={styles.ecosystemImg}
        />
        <div className={styles.gymPhases}>
          {phases.map((p, i) => (
            <div key={i} className={styles.gymPhaseCard}>
              <div className={styles.gymPhaseNum}>{i + 1}</div>
              <h4 className={styles.gymPhaseTitle}>{p.phase}</h4>
              <p className={styles.gymPhaseDesc}>{p.desc}</p>
            </div>
          ))}
        </div>
        <div className={styles.gymResult}>
          The result: <strong>90%+ token savings</strong> through progressive 3-layer context disclosure,
          and measurably better prompts every week.
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Coach / Player  ───────────────────────── */
function CoachPlayerSection() {
  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Coach/Player Quality Gate</h2>
        <p className={styles.sectionSubtitle}>
          Every output goes through a dual-model adversarial review before you see it.
        </p>
        <div className={styles.coachPlayerGrid}>
          <div className={styles.coachPlayerCard}>
            <h3>The Player</h3>
            <span className={styles.cpTemp}>Temperature 0.7 — Creative</span>
            <p>Executes the task with full tool access. Generates code, tests, and documentation. Optimized for <strong>breadth and creativity</strong>.</p>
          </div>
          <div className={styles.coachPlayerVs}>
            <span>vs</span>
          </div>
          <div className={styles.coachPlayerCard}>
            <h3>The Coach</h3>
            <span className={styles.cpTemp}>Temperature 0.3 — Precise</span>
            <p>Reviews against quality standards: compilation, tests, security, coverage ≥ 90%. Optimized for <strong>accuracy and rigor</strong>.</p>
          </div>
        </div>
        <p className={styles.cpNote}>
          If rejected, the Player self-improves with Coach feedback and retries — up to <strong>3 cycles</strong>. This catches errors that single-pass agents miss.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────  Voice Section  ───────────────────────── */
function VoiceSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Conscious: Voice-First Interface</h2>
        <p className={styles.sectionSubtitle}>
          Super-Goose speaks. The Conscious voice AI companion provides real-time conversation with emotion detection.
        </p>
        <div className={styles.voiceGrid}>
          <div className={styles.voiceFeatures}>
            {[
              { icon: "🎙️", title: "Moshi 7B Engine", desc: "Native speech-to-speech, no transcription step" },
              { icon: "⚡", title: "<200ms Latency", desc: "Real-time conversation" },
              { icon: "😊", title: "Emotion Detection", desc: "Wav2Vec2 tracking 8 emotions at 85-90% accuracy" },
              { icon: "🎭", title: "13 Personality Profiles", desc: "Each with 20+ behavioral sliders" },
              { icon: "🔀", title: "Intent Routing", desc: "CHAT (conversational) vs ACTION (execute via Goose)" },
              { icon: "📡", title: "Device Control", desc: "SSH, 3D printing, network scanning" },
            ].map((f, i) => (
              <div key={i} className={styles.voiceFeature}>
                <span className={styles.voiceIcon}>{f.icon}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.voiceStats}>
            <h3>Voice Stats</h3>
            {[
              { k: "Latency", v: "<200ms" },
              { k: "Emotions", v: "8 tracked" },
              { k: "Accuracy", v: "85-90%" },
              { k: "Profiles", v: "13" },
              { k: "Sliders", v: "20+ each" },
            ].map((s, i) => (
              <div key={i} className={styles.statRow}><span>{s.k}</span><strong>{s.v}</strong></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Enterprise  ───────────────────────── */
function EnterpriseSection() {
  const caps = [
    { title: "Orchestrator", desc: "Dependency graphs, parallel execution, priority scheduling, auto-retry", icon: "⚙️" },
    { title: "Checkpointing", desc: "LangGraph SQLite snapshots. Resume from any state. Time-travel debugging.", icon: "💾" },
    { title: "Supply Chain", desc: "cosign signing, Syft SBOM, Trivy scanning, OpenSSF Scorecard", icon: "🔗" },
    { title: "CI/CD", desc: "GitHub Actions pipelines. Smart change detection. All platforms.", icon: "🔄" },
  ];

  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Enterprise Capabilities</h2>
        <div className={styles.enterpriseGrid}>
          {caps.map((c, i) => (
            <div key={i} className={styles.enterpriseCard}>
              <div className={styles.enterpriseIcon}>{c.icon}</div>
              <h4>{c.title}</h4>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Downloads  ───────────────────────── */
function DownloadsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Downloads</h2>
        <p className={styles.sectionSubtitle}>
          Pre-built binaries for all platforms — CLI, Desktop, and Docker.
        </p>
        <div className={styles.downloadTable}>
          <div className={styles.downloadHeader}>
            <span>Platform</span><span>CLI</span><span>Desktop</span>
          </div>
          {[
            { platform: "Docker", cli: "ghcr.io/ghenghis/super-goose:v1.24.02", desktop: "—" },
            { platform: "Windows", cli: "goose-x86_64-pc-windows-msvc.zip", desktop: "Goose-win32-x64.zip" },
            { platform: "macOS ARM", cli: "goose-aarch64-apple-darwin.tar.bz2", desktop: "Goose.dmg" },
            { platform: "macOS Intel", cli: "goose-x86_64-apple-darwin.tar.bz2", desktop: "Goose-intel.dmg" },
            { platform: "Linux x86", cli: "goose-x86_64-unknown-linux-gnu.tar.bz2", desktop: ".deb / .rpm" },
            { platform: "Linux ARM", cli: "goose-aarch64-unknown-linux-gnu.tar.bz2", desktop: "—" },
          ].map((d, i) => (
            <div key={i} className={styles.downloadRow}>
              <span className={styles.dlPlatform}>{d.platform}</span>
              <span className={styles.dlFile}>{d.cli}</span>
              <span className={styles.dlFile}>{d.desktop}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "2rem", display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link className="button button--primary button--lg" to="https://github.com/Ghenghis/Super-Goose/releases">
            Releases Page
          </Link>
          <Link className="button button--secondary button--lg" to="https://github.com/Ghenghis/Super-Goose/pkgs/container/super-goose">
            Docker Package
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Docker  ───────────────────────── */
function DockerSection() {
  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Docker</h2>
        <p className={styles.sectionSubtitle}>
          Pull from GitHub Container Registry — includes both CLI and server binaries.
        </p>
        <div className={styles.dockerGrid}>
          <div className={styles.dockerCard}>
            <h4>Pull Image</h4>
            <code className={styles.dockerCode}>docker pull ghcr.io/ghenghis/super-goose:latest</code>
            <p>Or a specific version:</p>
            <code className={styles.dockerCode}>docker pull ghcr.io/ghenghis/super-goose:v1.24.02</code>
          </div>
          <div className={styles.dockerCard}>
            <h4>Run CLI</h4>
            <code className={styles.dockerCode}>docker run --rm -it ghcr.io/ghenghis/super-goose:latest goose</code>
            <p>Interactive mode with the Goose CLI agent.</p>
          </div>
          <div className={styles.dockerCard}>
            <h4>Run Server</h4>
            <code className={styles.dockerCode}>docker run -d -p 3284:3284 ghcr.io/ghenghis/super-goose:latest goosed</code>
            <p>API server on port 3284 for remote clients.</p>
          </div>
          <div className={styles.dockerCard}>
            <h4>Image Details</h4>
            <div className={styles.dockerDetails}>
              <span>Base: Debian Slim</span>
              <span>Arch: linux/amd64</span>
              <span>Binaries: goose + goosed</span>
              <span>Registry: GHCR</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Memory System  ───────────────────────── */
function MemorySection() {
  const tiers = [
    { name: "Working", purpose: "Short-term LRU cache for current conversation", decay: "0.70", color: "#00BFFF" },
    { name: "Episodic", purpose: "Session history and conversation context", decay: "0.90", color: "#9966FF" },
    { name: "Semantic", purpose: "Long-term facts and knowledge (vector search)", decay: "0.99", color: "#00CC66" },
    { name: "Procedural", purpose: "Learned patterns and procedures", decay: "0.98", color: "#FF9900" },
  ];
  const features = [
    { title: "Real Embeddings", desc: "Candle sentence-transformer (all-MiniLM-L6-v2, 384-dim) with hash fallback" },
    { title: "Mem0 Dual-Write", desc: "Local memory + Neo4j/Qdrant graph memory when available" },
    { title: "Auto Consolidation", desc: "Working \u2192 Episodic \u2192 Semantic promotion by importance & access" },
    { title: "/memory Command", desc: "Stats, clear, and save subcommands \u2014 127 tests passing" },
  ];
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Phase 6: Memory System</h2>
        <p className={styles.sectionSubtitle}>
          Cross-session context retention with 4 memory tiers, real vector embeddings, and graph memory.
        </p>
        <table className={styles.compactTable}>
          <thead>
            <tr><th>Tier</th><th>Purpose</th><th>Decay</th></tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td><strong style={{color: t.color}}>{t.name}</strong></td>
                <td>{t.purpose}</td>
                <td style={{textAlign: "right"}}>{t.decay}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.dockerGrid}>
          {features.map((f, i) => (
            <div key={i} className={styles.dockerCard}>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Infrastructure  ───────────────────────── */
function InfraSection() {
  const services = [
    { name: "Neo4j", purpose: "Graph memory for Mem0", port: "7474" },
    { name: "Qdrant", purpose: "Vector search for Mem0", port: "6333" },
    { name: "PostgreSQL", purpose: "Langfuse database", port: "5432" },
    { name: "ClickHouse", purpose: "Langfuse analytics", port: "8123" },
    { name: "Redis", purpose: "Langfuse cache", port: "6379" },
    { name: "MinIO", purpose: "Langfuse blob storage", port: "9000" },
    { name: "Langfuse", purpose: "Observability dashboard", port: "3000" },
    { name: "OTel Collector", purpose: "OpenTelemetry trace pipeline", port: "4317" },
  ];

  return (
    <section className={styles.sectionAlt}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Infrastructure</h2>
        <p className={styles.sectionSubtitle}>
          Backend services run on Docker Compose — one command to start everything.
        </p>
        <div className={styles.infraGrid}>
          {services.map((s, i) => (
            <div key={i} className={styles.infraCard}>
              <h4>{s.name}</h4>
              <p>{s.purpose}</p>
              <code>:{s.port}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  Feature Cards  ───────────────────────── */
function FeatureCardsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <img
          src={useBaseUrl("/img/super-goose/feature-cards.svg")}
          alt="Key Features"
          className={styles.fullWidthImg}
        />
      </div>
    </section>
  );
}

/* ─────────────────────────  Main Page  ───────────────────────── */
export default function Home(): ReactNode {
  return (
    <Layout description="Super-Goose — The first self-evolving, voice-enabled, production-grade AI agent platform with 16 integrated tools.">
      <HeroSection />
      <StatsBar />
      <FeatureCardsSection />
      <PipelineSection />
      <ToolsSection />
      <Stage5Section />
      <AgentsSection />
      <OvernightGymSection />
      <CoachPlayerSection />
      <VoiceSection />
      <EnterpriseSection />
      <MemorySection />
      <DownloadsSection />
      <DockerSection />
      <InfraSection />
    </Layout>
  );
}
