/**
 * AnimatedPipeline — Real-time agent activity visualization.
 *
 * REAL-TIME, NOT MOCKED:
 * - Reads actual ChatState from PipelineContext (sourced from useChatStream)
 * - When agent is working: active stage glows, particles flow, activity log scrolls
 * - When agent stops: enters "waiting mode" with ambient slow-pulse particles
 * - Colors match pipeline-flow.svg: deep space bg, cyan/orange/purple/pink/green stages
 *
 * Uses pure CSS animations + requestAnimationFrame — no external animation libs needed.
 * The SVG-based particle system uses the same aesthetic as GitHub Pages pipeline.
 */

import { useEffect, useRef, useMemo } from 'react';
import { usePipeline, STAGE_COLORS, type PipelineStage, type Particle } from './PipelineContext';
import '../../styles/pipeline-theme.css';

const STAGES: { id: PipelineStage; label: string; icon: string; sub: string }[] = [
  { id: 'plan', label: 'PLAN', icon: '\u{1F9E0}', sub: 'Analyzing task' },
  { id: 'team', label: 'TEAM', icon: '\u{1F465}', sub: 'Assembling agents' },
  { id: 'execute', label: 'EXECUTE', icon: '\u{26A1}', sub: 'Writing code' },
  { id: 'evolve', label: 'EVOLVE', icon: '\u{1F52C}', sub: 'Self-improving' },
  { id: 'review', label: 'REVIEW', icon: '\u{1F50D}', sub: 'Checking quality' },
  { id: 'observe', label: 'OBSERVE', icon: '\u{1F4CA}', sub: 'Monitoring output' },
];

/** Stage card X positions for a 900px wide SVG viewBox */
const STAGE_X = [10, 80, 150, 220, 290, 360];
const STAGE_Y = 8;
const STAGE_W = 40;
const STAGE_H = 45;
const CARD_RX = 4;

/** Convert particle progress (0..1) to SVG x/y between two stage cards */
function particlePosition(p: Particle): { x: number; y: number } {
  const fromIdx = STAGES.findIndex((s) => s.id === p.fromStage);
  const toIdx = STAGES.findIndex((s) => s.id === p.toStage);
  if (fromIdx < 0 || toIdx < 0) return { x: 0, y: 0 };
  const x1 = STAGE_X[fromIdx] + STAGE_W;
  const x2 = STAGE_X[toIdx];
  const midY = STAGE_Y + STAGE_H / 2;
  // Curved path — particles arc slightly above the connection line
  const arcHeight = -20 - Math.sin(p.progress * Math.PI) * 25;
  return {
    x: x1 + (x2 - x1) * p.progress,
    y: midY + arcHeight + Math.sin(p.progress * Math.PI * 3) * 5,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function AnimatedPipeline() {
  const {
    mode,
    activeStage,
    particles,
    activity,
    metrics,
    elapsedMs,
    totalTokens,
    chatState,
  } = usePipeline();

  const activityEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll activity log
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activity.length]);

  const isWaiting = mode === 'waiting';

  // Memoize stage nodes to avoid re-creating on every particle tick
  const stageNodes = useMemo(
    () =>
      STAGES.map((stage, i) => {
        const color = STAGE_COLORS[stage.id];
        const isActive = activeStage === stage.id;
        const m = metrics[stage.id];
        const statusLabel =
          m.status === 'active'
            ? 'ACTIVE'
            : m.status === 'complete'
              ? 'DONE'
              : m.status === 'error'
                ? 'ERROR'
                : '';

        return (
          <g key={stage.id} className="pipeline-stage-group">
            {/* Active stage quantum energy field */}
            {isActive && (
              <>
                {/* Outermost energy pulse */}
                <rect
                  x={STAGE_X[i] - 10}
                  y={STAGE_Y - 10}
                  width={STAGE_W + 20}
                  height={STAGE_H + 20}
                  rx={CARD_RX + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.5"
                  opacity="0.15"
                  className="pipeline-glow-outer"
                />
                {/* Middle energy ring */}
                <rect
                  x={STAGE_X[i] - 6}
                  y={STAGE_Y - 6}
                  width={STAGE_W + 12}
                  height={STAGE_H + 12}
                  rx={CARD_RX + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.3"
                  className="pipeline-glow-mid"
                />
                {/* Inner glow */}
                <rect
                  x={STAGE_X[i] - 3}
                  y={STAGE_Y - 3}
                  width={STAGE_W + 6}
                  height={STAGE_H + 6}
                  rx={CARD_RX + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.6"
                  className="pipeline-glow"
                />
                {/* Corner energy sparks */}
                <circle cx={STAGE_X[i]} cy={STAGE_Y} r="2" fill={color} opacity="0.4" className="pipeline-spark-tl" />
                <circle cx={STAGE_X[i] + STAGE_W} cy={STAGE_Y} r="2" fill={color} opacity="0.4" className="pipeline-spark-tr" />
                <circle cx={STAGE_X[i]} cy={STAGE_Y + STAGE_H} r="2" fill={color} opacity="0.4" className="pipeline-spark-bl" />
                <circle cx={STAGE_X[i] + STAGE_W} cy={STAGE_Y + STAGE_H} r="2" fill={color} opacity="0.4" className="pipeline-spark-br" />
              </>
            )}

            {/* Card background */}
            <rect
              x={STAGE_X[i]}
              y={STAGE_Y}
              width={STAGE_W}
              height={STAGE_H}
              rx={CARD_RX}
              fill={isActive ? `${color}22` : '#0d1220'}
              stroke={color}
              strokeWidth={isActive ? 2 : 1}
              strokeOpacity={isActive ? 0.9 : 0.3}
            />

            {/* Stage icon */}
            <text
              x={STAGE_X[i] + STAGE_W / 2}
              y={STAGE_Y + 8}
              textAnchor="middle"
              fontSize="10"
              className="pipeline-icon"
            >
              {stage.icon}
            </text>

            {/* Stage label */}
            <text
              x={STAGE_X[i] + STAGE_W / 2}
              y={STAGE_Y + 18}
              textAnchor="middle"
              fill={isActive ? color : '#94a3b8'}
              fontSize="6"
              fontWeight="bold"
              letterSpacing="1.5"
            >
              {stage.label}
            </text>

            {/* Sub label */}
            <text
              x={STAGE_X[i] + STAGE_W / 2}
              y={STAGE_Y + 24}
              textAnchor="middle"
              fill="#64748b"
              fontSize="5"
            >
              {isActive ? stage.sub : ''}
            </text>

            {/* Metrics */}
            {m.tokensUsed > 0 && (
              <text
                x={STAGE_X[i] + STAGE_W / 2}
                y={STAGE_Y + 28}
                textAnchor="middle"
                fill="#475569"
                fontSize="5"
              >
                {m.tokensUsed.toLocaleString()} tok
              </text>
            )}
            {m.toolCalls > 0 && (
              <text
                x={STAGE_X[i] + STAGE_W / 2}
                y={STAGE_Y + 32}
                textAnchor="middle"
                fill="#475569"
                fontSize="5"
              >
                {m.toolCalls} tools
              </text>
            )}
            {m.duration > 0 && (
              <text
                x={STAGE_X[i] + STAGE_W / 2}
                y={STAGE_Y + 36}
                textAnchor="middle"
                fill="#475569"
                fontSize="5"
              >
                {formatDuration(m.duration)}
              </text>
            )}

            {/* Status badge */}
            {statusLabel && (
              <>
                <rect
                  x={STAGE_X[i] + STAGE_W / 2 - 9}
                  y={STAGE_Y + 40}
                  width="18"
                  height="4"
                  rx="2"
                  fill={m.status === 'active' ? color : m.status === 'complete' ? '#10b981' : '#ef4444'}
                  fillOpacity="0.2"
                />
                <text
                  x={STAGE_X[i] + STAGE_W / 2}
                  y={STAGE_Y + 43}
                  textAnchor="middle"
                  fill={m.status === 'active' ? color : m.status === 'complete' ? '#10b981' : '#ef4444'}
                  fontSize="4"
                  fontWeight="bold"
                >
                  {statusLabel}
                </text>
              </>
            )}

            {/* Connection to next stage — quantum energy conduit */}
            {i < STAGES.length - 1 && (
              <g>
                {/* Background conduit */}
                <line
                  x1={STAGE_X[i] + STAGE_W}
                  y1={STAGE_Y + STAGE_H / 2}
                  x2={STAGE_X[i + 1]}
                  y2={STAGE_Y + STAGE_H / 2}
                  stroke={isActive ? color : '#1e293b'}
                  strokeWidth={isActive ? 1.5 : 0.5}
                  strokeDasharray={isActive ? '' : '4 4'}
                  opacity={isActive ? 0.8 : 0.3}
                />
                {/* Energy flow overlay when active */}
                {isActive && (
                  <>
                    <line
                      x1={STAGE_X[i] + STAGE_W}
                      y1={STAGE_Y + STAGE_H / 2}
                      x2={STAGE_X[i + 1]}
                      y2={STAGE_Y + STAGE_H / 2}
                      stroke={color}
                      strokeWidth="3"
                      opacity="0.1"
                    />
                    <line
                      x1={STAGE_X[i] + STAGE_W}
                      y1={STAGE_Y + STAGE_H / 2}
                      x2={STAGE_X[i + 1]}
                      y2={STAGE_Y + STAGE_H / 2}
                      stroke={color}
                      strokeWidth="0.8"
                      opacity="0.5"
                      strokeDasharray="2 6"
                      className="pipeline-energy-flow"
                    />
                  </>
                )}
              </g>
            )}
          </g>
        );
      }),
    [activeStage, metrics]
  );

  return (
    <div
      className="pipeline-container"
      style={{
        background: 'linear-gradient(135deg, #0a0e17 0%, #0d1220 50%, #0a0e17 100%)',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #1e293b',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '2px 8px',
          borderBottom: '1px solid #1e293b',
          background: '#0a0e1780',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className={isWaiting ? 'pipeline-status-dot waiting' : 'pipeline-status-dot active'}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isWaiting ? '#64748b' : '#10b981',
            }}
          />
          <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600, letterSpacing: '1px' }}>
            SUPER-GOOSE PIPELINE
          </span>
          <span style={{ color: '#475569', fontSize: '10px' }}>
            {isWaiting ? 'WAITING' : chatState.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#64748b' }}>
          {elapsedMs > 0 && <span>{formatDuration(elapsedMs)}</span>}
          {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tokens</span>}
        </div>
      </div>

      {/* SVG Pipeline Visualization */}
      <svg
        viewBox="0 0 420 65"
        width="100%"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Glow filters per stage color */}
          {STAGES.map((s) => (
            <filter key={s.id} id={`glow-${s.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor={STAGE_COLORS[s.id]} floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
          {/* Radial gradient for particle glow */}
          <radialGradient id="particleGlow">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Per-stage radial gradients for quantum field effect */}
          {STAGES.map((s) => (
            <radialGradient key={`qf-${s.id}`} id={`quantum-field-${s.id}`}>
              <stop offset="0%" stopColor={STAGE_COLORS[s.id]} stopOpacity="0.3" />
              <stop offset="40%" stopColor={STAGE_COLORS[s.id]} stopOpacity="0.1" />
              <stop offset="100%" stopColor={STAGE_COLORS[s.id]} stopOpacity="0" />
            </radialGradient>
          ))}
          {/* Animated dash pattern for energy flow */}
          <pattern id="energy-dash" patternUnits="userSpaceOnUse" width="8" height="2">
            <rect width="4" height="2" fill="#ffffff" opacity="0.3" />
          </pattern>
        </defs>

        {/* Title */}
        <text x="210" y="5" textAnchor="middle" fill="#f1f5f9" fontSize="7" fontWeight="bold" letterSpacing="2">
          SUPER-GOOSE END-TO-END PIPELINE
        </text>

        {/* Input arrow */}
        <line x1="0" y1={STAGE_Y + STAGE_H / 2} x2={STAGE_X[0]} y2={STAGE_Y + STAGE_H / 2}
          stroke="#FF6600" strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="2 2" />

        {/* Stage cards */}
        {stageNodes}

        {/* Output arrow */}
        <line x1={STAGE_X[5] + STAGE_W} y1={STAGE_Y + STAGE_H / 2}
          x2="420" y2={STAGE_Y + STAGE_H / 2}
          stroke="#00FF66" strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="2 2" />

        {/* Quantum Particles — atom-like with orbital rings, electron trails, nucleus glow */}
        {particles.map((p) => {
          const pos = particlePosition(p);
          const phase = p.progress * Math.PI * 2;
          const pulse = 0.7 + Math.sin(p.progress * Math.PI) * 0.3;
          const scaledSize = p.size * 1.8; // Larger base size
          const spin = Date.now() * 0.003 + p.progress * 20; // Orbital rotation

          return (
            <g key={p.id}>
              {/* Energy field — outermost diffuse glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 4}
                fill={p.color}
                opacity={0.04 + Math.sin(phase) * 0.02}
              />
              {/* Quantum interference ring */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 2.8}
                fill="none"
                stroke={p.color}
                strokeWidth="0.3"
                opacity={0.12 + Math.sin(phase * 2) * 0.06}
                strokeDasharray={`${2 + Math.sin(spin) * 1} ${3 + Math.cos(spin) * 1}`}
              />
              {/* Outer plasma shell */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 2}
                fill={p.color}
                opacity={0.08 + Math.sin(phase * 1.5) * 0.04}
              />
              {/* Orbital ring 1 — tilted ellipse */}
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx={scaledSize * 2.2}
                ry={scaledSize * 0.6}
                fill="none"
                stroke={p.color}
                strokeWidth="0.5"
                opacity={0.25 + Math.sin(spin) * 0.1}
                transform={`rotate(${(spin * 30) % 360} ${pos.x} ${pos.y})`}
              />
              {/* Orbital ring 2 — perpendicular */}
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx={scaledSize * 1.8}
                ry={scaledSize * 0.5}
                fill="none"
                stroke={p.color}
                strokeWidth="0.4"
                opacity={0.18 + Math.cos(spin * 1.3) * 0.08}
                transform={`rotate(${(spin * 30 + 60) % 360} ${pos.x} ${pos.y})`}
              />
              {/* Orbital ring 3 — third axis */}
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx={scaledSize * 1.5}
                ry={scaledSize * 0.4}
                fill="none"
                stroke="#ffffff"
                strokeWidth="0.3"
                opacity={0.1 + Math.sin(spin * 0.7) * 0.05}
                transform={`rotate(${(spin * 30 + 120) % 360} ${pos.x} ${pos.y})`}
              />
              {/* Electron 1 — orbiting dot */}
              <circle
                cx={pos.x + Math.cos(spin * 2) * scaledSize * 2}
                cy={pos.y + Math.sin(spin * 2) * scaledSize * 0.6}
                r={scaledSize * 0.25}
                fill="#ffffff"
                opacity={0.7}
              />
              {/* Electron 2 — different orbit */}
              <circle
                cx={pos.x + Math.cos(spin * 2.6 + 2) * scaledSize * 1.6}
                cy={pos.y + Math.sin(spin * 2.6 + 2) * scaledSize * 0.5}
                r={scaledSize * 0.2}
                fill={p.color}
                opacity={0.6}
              />
              {/* Electron 3 — third orbit */}
              <circle
                cx={pos.x + Math.cos(spin * 1.8 + 4) * scaledSize * 1.3}
                cy={pos.y + Math.sin(spin * 1.8 + 4) * scaledSize * 0.4}
                r={scaledSize * 0.15}
                fill="#ffffff"
                opacity={0.5}
              />
              {/* Nucleus core — bright pulsing center */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 1.2}
                fill={p.color}
                opacity={pulse * 0.5}
              />
              {/* Nucleus inner glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 0.7}
                fill={p.color}
                opacity={pulse * 0.8}
              />
              {/* Hot white center — the "neutron" */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scaledSize * 0.35}
                fill="#ffffff"
                opacity={0.85 + Math.sin(phase * 3) * 0.15}
              />
              {/* Proton spark */}
              <circle
                cx={pos.x + Math.sin(phase * 5) * scaledSize * 0.2}
                cy={pos.y + Math.cos(phase * 5) * scaledSize * 0.2}
                r={scaledSize * 0.15}
                fill="#ffffff"
                opacity={0.4 + Math.sin(phase * 7) * 0.2}
              />
            </g>
          );
        })}

        {/* Waiting mode — quantum field with orbiting particles */}
        {isWaiting && (
          <g className="pipeline-waiting-pulse">
            {/* Central quantum field */}
            <circle cx="210" cy={STAGE_Y + STAGE_H + 5} r="4" fill="#64748b" opacity="0.03">
              <animate attributeName="r" values="4;7;4" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="210" cy={STAGE_Y + STAGE_H + 5} r="3" fill="#64748b" opacity="0.05">
              <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.05;0.1;0.05" dur="3s" repeatCount="indefinite" />
            </circle>
            {/* Core nucleus */}
            <circle cx="210" cy={STAGE_Y + STAGE_H + 5} r="1" fill="#64748b" opacity="0.25">
              <animate attributeName="r" values="1;1.5;1" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.25;0.45;0.25" dur="2.5s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>

      {/* Activity Log — real-time scrolling feed */}
      <div
        style={{
          maxHeight: '40px',
          overflowY: 'auto',
          borderTop: '1px solid #1e293b',
          padding: '4px 12px',
          background: '#080818',
        }}
      >
        {activity.length === 0 && (
          <div style={{ color: '#475569', fontSize: '10px', padding: '8px 0', textAlign: 'center' }}>
            {isWaiting ? 'Pipeline idle — waiting for agent activity' : 'Starting pipeline...'}
          </div>
        )}
        {activity.slice(-20).map((entry) => {
          const stageColor = STAGE_COLORS[entry.stage] || '#64748b';
          const typeIcon =
            entry.type === 'tool' ? '\u{1F527}' :
            entry.type === 'thought' ? '\u{1F4AD}' :
            entry.type === 'result' ? '\u2705' :
            entry.type === 'error' ? '\u274C' :
            '\u25B6';
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 0',
                fontSize: '10px',
                lineHeight: '1.4',
              }}
            >
              <span style={{ color: '#475569', flexShrink: 0, width: '42px' }}>
                {new Date(entry.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span
                style={{
                  color: stageColor,
                  fontWeight: 600,
                  flexShrink: 0,
                  width: '56px',
                  letterSpacing: '0.5px',
                  fontSize: '9px',
                }}
              >
                {entry.stage.toUpperCase()}
              </span>
              <span style={{ flexShrink: 0 }}>{typeIcon}</span>
              <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.message}
              </span>
            </div>
          );
        })}
        <div ref={activityEndRef} />
      </div>

      {/* CSS animations injected via style tag */}
      <style>{`
        /* Inner glow pulse */
        .pipeline-glow {
          animation: pipeline-glow-pulse 1.5s ease-in-out infinite;
        }
        @keyframes pipeline-glow-pulse {
          0%, 100% { opacity: 0.4; stroke-width: 2; }
          50% { opacity: 0.8; stroke-width: 3; }
        }
        /* Middle glow ring — slightly offset timing */
        .pipeline-glow-mid {
          animation: pipeline-glow-mid 2s ease-in-out infinite;
        }
        @keyframes pipeline-glow-mid {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.4; }
        }
        /* Outer glow ring — slowest */
        .pipeline-glow-outer {
          animation: pipeline-glow-outer 3s ease-in-out infinite;
        }
        @keyframes pipeline-glow-outer {
          0%, 100% { opacity: 0.08; stroke-width: 0.5; }
          50% { opacity: 0.2; stroke-width: 1; }
        }
        /* Corner energy sparks */
        .pipeline-spark-tl, .pipeline-spark-tr, .pipeline-spark-bl, .pipeline-spark-br {
          animation: spark-pulse 0.8s ease-in-out infinite;
        }
        .pipeline-spark-tr { animation-delay: 0.2s; }
        .pipeline-spark-bl { animation-delay: 0.4s; }
        .pipeline-spark-br { animation-delay: 0.6s; }
        @keyframes spark-pulse {
          0%, 100% { opacity: 0.2; r: 1.5; }
          50% { opacity: 0.7; r: 3; }
        }
        /* Energy flow along connection lines */
        .pipeline-energy-flow {
          animation: energy-flow-dash 1s linear infinite;
        }
        @keyframes energy-flow-dash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -8; }
        }
        /* Status dots */
        .pipeline-status-dot.active {
          animation: status-blink 1s ease-in-out infinite;
        }
        .pipeline-status-dot.waiting {
          animation: status-slow-pulse 3s ease-in-out infinite;
        }
        @keyframes status-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes status-slow-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        /* Stage icons with glow */
        .pipeline-icon {
          filter: drop-shadow(0 0 4px rgba(255,255,255,0.2));
        }
        /* Scrollbar styling */
        .pipeline-container::-webkit-scrollbar {
          width: 4px;
        }
        .pipeline-container::-webkit-scrollbar-track {
          background: #0a0e17;
        }
        .pipeline-container::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
