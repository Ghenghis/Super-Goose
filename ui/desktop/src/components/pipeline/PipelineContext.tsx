/**
 * PipelineContext — Real-time agent activity state for the pipeline visualization.
 *
 * This reads REAL ChatState from useChatStream (not mocked) and maps it to
 * pipeline stages. When the agent stops working, it transitions to "waiting" mode.
 * When streaming/thinking, it activates the corresponding pipeline stage.
 *
 * The pipeline stages map to the Super-Goose 6-stage workflow:
 *   PLAN → TEAM → EXECUTE → EVOLVE → REVIEW → OBSERVE
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { ChatState } from '../../types/chatState';

/** Pipeline stage identifiers matching the SVG pipeline */
export type PipelineStage =
  | 'plan'
  | 'team'
  | 'execute'
  | 'evolve'
  | 'review'
  | 'observe';

/** The overall pipeline display mode */
export type PipelineMode = 'active' | 'waiting' | 'error' | 'complete';

/** A single particle flowing between stages */
export interface Particle {
  id: string;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  progress: number; // 0..1
  color: string;
  size: number;
  speed: number;
}

/** Activity log entry — what the agent is actually doing right now */
export interface ActivityEntry {
  id: string;
  timestamp: number;
  stage: PipelineStage;
  message: string;
  type: 'action' | 'thought' | 'tool' | 'result' | 'error';
}

/** Per-stage metrics tracked in real time */
export interface StageMetrics {
  tokensUsed: number;
  toolCalls: number;
  duration: number; // ms spent in this stage
  status: 'idle' | 'active' | 'complete' | 'error';
}

export interface PipelineState {
  mode: PipelineMode;
  activeStage: PipelineStage | null;
  previousStage: PipelineStage | null;
  particles: Particle[];
  activity: ActivityEntry[];
  metrics: Record<PipelineStage, StageMetrics>;
  elapsedMs: number;
  totalTokens: number;
  chatState: ChatState;
}

interface PipelineContextValue extends PipelineState {
  /** Push a new activity entry (called when we detect tool use, thoughts, etc.) */
  pushActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  /** Update the chat state from useChatStream — this drives everything */
  syncChatState: (state: ChatState) => void;
  /** Update token counts from the real stream */
  syncTokens: (input: number, output: number) => void;
  /** Signal a tool call was made */
  recordToolCall: (toolName: string, stage?: PipelineStage) => void;
  /** Whether the pipeline visualization is visible */
  isVisible: boolean;
  /** Toggle pipeline visibility (persists to localStorage) */
  setIsVisible: (visible: boolean) => void;
}

const PIPELINE_VISIBLE_KEY = 'pipeline_visible';

const defaultMetrics = (): Record<PipelineStage, StageMetrics> => ({
  plan: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
  team: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
  execute: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
  evolve: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
  review: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
  observe: { tokensUsed: 0, toolCalls: 0, duration: 0, status: 'idle' },
});

const defaultState: PipelineState = {
  mode: 'waiting',
  activeStage: null,
  previousStage: null,
  particles: [],
  activity: [],
  metrics: defaultMetrics(),
  elapsedMs: 0,
  totalTokens: 0,
  chatState: ChatState.Idle,
};

const PipelineCtx = createContext<PipelineContextValue>({
  ...defaultState,
  pushActivity: () => {},
  syncChatState: () => {},
  syncTokens: () => {},
  recordToolCall: () => {},
  isVisible: true,
  setIsVisible: () => {},
});

export const usePipeline = () => useContext(PipelineCtx);

/** Stage colors matching the pipeline-flow.svg */
export const STAGE_COLORS: Record<PipelineStage, string> = {
  plan: '#00BFFF',
  team: '#4488CC',
  execute: '#FF9900',
  evolve: '#9966FF',
  review: '#FF3366',
  observe: '#00CC66',
};

const STAGES: PipelineStage[] = ['plan', 'team', 'execute', 'evolve', 'review', 'observe'];

/** Map ChatState to the most likely active pipeline stage */
function chatStateToStage(cs: ChatState): PipelineStage | null {
  switch (cs) {
    case ChatState.Thinking:
      return 'plan';
    case ChatState.Streaming:
      return 'execute';
    case ChatState.Compacting:
      return 'evolve';
    case ChatState.RestartingAgent:
      return 'team';
    default:
      return null;
  }
}

/** Determine pipeline mode from ChatState */
function chatStateToMode(cs: ChatState): PipelineMode {
  switch (cs) {
    case ChatState.Idle:
    case ChatState.WaitingForUserInput:
    case ChatState.LoadingConversation:
      return 'waiting';
    case ChatState.Thinking:
    case ChatState.Streaming:
    case ChatState.Compacting:
    case ChatState.RestartingAgent:
      return 'active';
    default:
      return 'waiting';
  }
}

/** Hard cap on particle count to prevent unbounded memory growth */
const MAX_PARTICLES = 120;

let particleIdCounter = 0;
let activityIdCounter = 0;

/** Spawn quantum particles flowing from one stage to the next */
function spawnParticles(from: PipelineStage, to: PipelineStage, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      id: `p-${++particleIdCounter}`,
      fromStage: from,
      toStage: to,
      progress: Math.random() * 0.2,
      color: STAGE_COLORS[from],
      size: 3 + Math.random() * 5,   // Larger: 3-8px base (was 2-6)
      speed: 0.004 + Math.random() * 0.012, // Slightly slower for more screen time
    });
  }
  return particles;
}

/** Read initial visibility from localStorage (defaults to true) */
function getInitialVisibility(): boolean {
  try {
    const stored = localStorage.getItem(PIPELINE_VISIBLE_KEY);
    if (stored === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PipelineState>(defaultState);
  const [isVisible, setIsVisibleState] = useState<boolean>(getInitialVisibility);
  const startTimeRef = useRef<number | null>(null);

  const setIsVisible = useCallback((visible: boolean) => {
    setIsVisibleState(visible);
    try {
      localStorage.setItem(PIPELINE_VISIBLE_KEY, String(visible));
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, []);

  // Animation loop for particles — ONLY runs when pipeline is visible AND has particles or is active.
  // This prevents the 60fps setState loop from running at startup when nothing is animated.
  const modeRef = useRef<PipelineMode>('waiting');
  const visibleRef = useRef(isVisible);
  modeRef.current = state.mode;
  visibleRef.current = isVisible;

  useEffect(() => {
    // Don't start animation loop if pipeline isn't visible
    if (!isVisible) return;

    let raf: number;
    const tick = () => {
      setState((prev) => {
        // Skip update entirely if waiting with no particles — nothing to animate
        if (prev.mode === 'waiting' && prev.particles.length === 0) {
          return prev; // No-op — no new object, no re-render
        }

        if (prev.mode === 'waiting') {
          // Drain remaining particles slowly, don't spawn new ones
          const updatedParticles = prev.particles
            .map((p) => ({ ...p, progress: p.progress + p.speed * 0.3 }))
            .filter((p) => p.progress < 1);
          // If nothing changed (all filtered out already), skip
          if (updatedParticles.length === 0 && prev.particles.length === 0) return prev;
          return { ...prev, particles: updatedParticles };
        }

        // Active mode — advance particles, track elapsed time
        const now = Date.now();
        const elapsed = startTimeRef.current ? now - startTimeRef.current : 0;

        const updatedParticles = prev.particles
          .map((p) => ({ ...p, progress: p.progress + p.speed }))
          .filter((p) => p.progress < 1);

        // Only spawn new particles if under the cap
        let newParticles = updatedParticles;
        if (updatedParticles.length < MAX_PARTICLES) {
          // Spawn from active stage (reduced rate: 8% instead of 15%)
          if (prev.activeStage && Math.random() < 0.08) {
            const idx = STAGES.indexOf(prev.activeStage);
            if (idx < STAGES.length - 1) {
              newParticles = [
                ...updatedParticles,
                ...spawnParticles(prev.activeStage, STAGES[idx + 1], 1),
              ];
            }
          }

          // Previous-to-active energy (reduced: 3% instead of 6%)
          if (prev.activeStage && prev.previousStage && Math.random() < 0.03) {
            newParticles = [
              ...newParticles,
              ...spawnParticles(prev.previousStage, prev.activeStage, 1),
            ];
          }

          // Ambient particles (reduced: 2% instead of 4%)
          if (Math.random() < 0.02) {
            const randIdx = Math.floor(Math.random() * (STAGES.length - 1));
            newParticles = [
              ...newParticles,
              ...spawnParticles(STAGES[randIdx], STAGES[randIdx + 1], 1),
            ];
          }
        }

        // Hard cap — truncate if somehow over limit
        if (newParticles.length > MAX_PARTICLES) {
          newParticles = newParticles.slice(-MAX_PARTICLES);
        }

        // Update active stage duration
        const metrics = { ...prev.metrics };
        if (prev.activeStage) {
          metrics[prev.activeStage] = {
            ...metrics[prev.activeStage],
            duration: metrics[prev.activeStage].duration + 16, // ~60fps
          };
        }

        return {
          ...prev,
          particles: newParticles,
          elapsedMs: elapsed,
          metrics,
        };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVisible]);

  const syncChatState = useCallback((cs: ChatState) => {
    setState((prev) => {
      const newMode = chatStateToMode(cs);
      const newStage = chatStateToStage(cs);
      const wasActive = prev.mode === 'active';
      const isNowActive = newMode === 'active';

      // Track start time
      if (!wasActive && isNowActive) {
        startTimeRef.current = Date.now();
      }

      // Stage transition — spawn quantum burst of particles (capped)
      let particles = prev.particles;
      if (newStage && newStage !== prev.activeStage && prev.activeStage) {
        const burstCount = Math.min(4, MAX_PARTICLES - particles.length);
        if (burstCount > 0) {
          particles = [
            ...particles,
            ...spawnParticles(prev.activeStage, newStage, burstCount),
          ];
        }
      }

      // Update metrics status
      const metrics = { ...prev.metrics };
      if (prev.activeStage && prev.activeStage !== newStage) {
        metrics[prev.activeStage] = {
          ...metrics[prev.activeStage],
          status: 'complete',
        };
      }
      if (newStage) {
        metrics[newStage] = {
          ...metrics[newStage],
          status: 'active',
        };
      }

      // If going to waiting, mark final stage as complete
      if (newMode === 'waiting' && prev.activeStage) {
        metrics[prev.activeStage] = {
          ...metrics[prev.activeStage],
          status: 'complete',
        };
      }

      return {
        ...prev,
        chatState: cs,
        mode: newMode,
        activeStage: newStage,
        previousStage: newStage !== prev.activeStage ? prev.activeStage : prev.previousStage,
        particles,
        metrics,
      };
    });
  }, []);

  const syncTokens = useCallback((input: number, output: number) => {
    setState((prev) => {
      const total = input + output;
      if (!prev.activeStage) return { ...prev, totalTokens: prev.totalTokens + total };
      const metrics = { ...prev.metrics };
      metrics[prev.activeStage] = {
        ...metrics[prev.activeStage],
        tokensUsed: metrics[prev.activeStage].tokensUsed + total,
      };
      return { ...prev, totalTokens: prev.totalTokens + total, metrics };
    });
  }, []);

  const pushActivity = useCallback(
    (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
      const full: ActivityEntry = {
        ...entry,
        id: `act-${++activityIdCounter}`,
        timestamp: Date.now(),
      };
      setState((prev) => ({
        ...prev,
        activity: [...prev.activity.slice(-49), full], // Keep last 50
      }));
    },
    []
  );

  const recordToolCall = useCallback(
    (toolName: string, stage?: PipelineStage) => {
      setState((prev) => {
        const s = stage || prev.activeStage;
        if (!s) return prev;
        const metrics = { ...prev.metrics };
        metrics[s] = {
          ...metrics[s],
          toolCalls: metrics[s].toolCalls + 1,
        };
        return { ...prev, metrics };
      });
      pushActivity({
        stage: stage || 'execute',
        message: `Tool: ${toolName}`,
        type: 'tool',
      });
    },
    [pushActivity]
  );

  return (
    <PipelineCtx.Provider
      value={{
        ...state,
        pushActivity,
        syncChatState,
        syncTokens,
        recordToolCall,
        isVisible,
        setIsVisible,
      }}
    >
      {children}
    </PipelineCtx.Provider>
  );
}
