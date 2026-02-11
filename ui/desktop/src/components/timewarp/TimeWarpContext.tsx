import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  TimeWarpState,
  TimeWarpEvent,
  TimeWarpBranch,
  ViewMode,
  DockPosition,
} from './TimeWarpTypes';

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const now = Date.now();
const minute = 60_000;

const DEMO_BRANCHES: TimeWarpBranch[] = [
  { id: 'main', name: 'main', color: '#3b82f6', isActive: true },
  {
    id: 'experiment-1',
    name: 'experiment-1',
    parentBranchId: 'main',
    forkEventId: 'evt-08',
    color: '#a855f7',
    isActive: false,
  },
];

const DEMO_EVENTS: TimeWarpEvent[] = [
  {
    id: 'evt-01',
    type: 'message',
    timestamp: now - 18 * minute,
    label: 'User: set up project',
    branchId: 'main',
    agentId: 'user',
  },
  {
    id: 'evt-02',
    type: 'tool_call',
    timestamp: now - 17 * minute,
    label: 'Read package.json',
    detail: 'developer.read_file("package.json")',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-03',
    type: 'tool_call',
    timestamp: now - 16 * minute,
    label: 'Read tsconfig.json',
    detail: 'developer.read_file("tsconfig.json")',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-04',
    type: 'edit',
    timestamp: now - 15 * minute,
    label: 'Edit src/index.ts',
    detail: '+24 / -3 lines',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-05',
    type: 'checkpoint',
    timestamp: now - 14 * minute,
    label: 'Checkpoint: scaffold complete',
    branchId: 'main',
  },
  {
    id: 'evt-06',
    type: 'message',
    timestamp: now - 13 * minute,
    label: 'User: add tests',
    branchId: 'main',
    agentId: 'user',
  },
  {
    id: 'evt-07',
    type: 'tool_call',
    timestamp: now - 12 * minute,
    label: 'Run vitest',
    detail: 'developer.shell("npx vitest --run")',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-08',
    type: 'branch_point',
    timestamp: now - 11 * minute,
    label: 'Branch: experiment-1',
    detail: 'Exploring alternative approach',
    branchId: 'main',
  },
  {
    id: 'evt-09',
    type: 'edit',
    timestamp: now - 10 * minute,
    label: 'Edit tests/index.test.ts',
    detail: '+48 / -0 lines',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-10',
    type: 'error',
    timestamp: now - 9 * minute,
    label: 'Test failure',
    detail: '2 of 5 tests failed',
    branchId: 'main',
    agentId: 'goose',
    metadata: { failedTests: 2, totalTests: 5 },
  },
  {
    id: 'evt-11',
    type: 'edit',
    timestamp: now - 8 * minute,
    label: 'Fix failing tests',
    detail: '+6 / -4 lines in src/index.ts',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-12',
    type: 'tool_call',
    timestamp: now - 7 * minute,
    label: 'Run vitest (retry)',
    detail: '5/5 passed',
    branchId: 'main',
    agentId: 'goose',
  },
  {
    id: 'evt-13',
    type: 'milestone',
    timestamp: now - 6 * minute,
    label: 'All tests passing',
    branchId: 'main',
  },
  {
    id: 'evt-14',
    type: 'message',
    timestamp: now - 5 * minute,
    label: 'User: deploy to staging',
    branchId: 'main',
    agentId: 'user',
  },
  {
    id: 'evt-15',
    type: 'tool_call',
    timestamp: now - 4 * minute,
    label: 'Shell: npm run build',
    branchId: 'main',
    agentId: 'goose',
  },
  // Events on experiment-1 branch
  {
    id: 'evt-b1',
    type: 'edit',
    timestamp: now - 10.5 * minute,
    label: 'Refactor to functional style',
    detail: '+32 / -18 lines',
    branchId: 'experiment-1',
    agentId: 'goose',
  },
  {
    id: 'evt-b2',
    type: 'tool_call',
    timestamp: now - 9.5 * minute,
    label: 'Run vitest on branch',
    detail: '5/5 passed',
    branchId: 'experiment-1',
    agentId: 'goose',
  },
  {
    id: 'evt-b3',
    type: 'checkpoint',
    timestamp: now - 8.5 * minute,
    label: 'Checkpoint: functional refactor',
    branchId: 'experiment-1',
  },
];

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: TimeWarpState = {
  events: DEMO_EVENTS,
  branches: DEMO_BRANCHES,
  currentEventId: 'evt-15',
  selectedEventId: null,
  activeBranchId: 'main',
  isRecording: true,
  playbackSpeed: 1,
  zoom: 1,
  scrollPosition: 0,
  dock: {
    position: 'bottom',
    viewMode: 'slim',
    expandedSize: 160,
  },
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'SELECT_EVENT'; eventId: string | null }
  | { type: 'SET_CURRENT_EVENT'; eventId: string }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_DOCK_POSITION'; position: DockPosition }
  | { type: 'SET_EXPANDED_SIZE'; size: number }
  | { type: 'SET_RECORDING'; isRecording: boolean }
  | { type: 'SET_PLAYBACK_SPEED'; speed: number }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_SCROLL_POSITION'; position: number }
  | { type: 'SET_ACTIVE_BRANCH'; branchId: string }
  | { type: 'ADD_EVENT'; event: TimeWarpEvent }
  | { type: 'STEP_FORWARD' }
  | { type: 'STEP_BACKWARD' };

function reducer(state: TimeWarpState, action: Action): TimeWarpState {
  switch (action.type) {
    case 'SELECT_EVENT':
      return { ...state, selectedEventId: action.eventId };

    case 'SET_CURRENT_EVENT':
      return { ...state, currentEventId: action.eventId };

    case 'SET_VIEW_MODE':
      return { ...state, dock: { ...state.dock, viewMode: action.mode } };

    case 'SET_DOCK_POSITION':
      return { ...state, dock: { ...state.dock, position: action.position } };

    case 'SET_EXPANDED_SIZE':
      return {
        ...state,
        dock: { ...state.dock, expandedSize: Math.max(80, Math.min(400, action.size)) },
      };

    case 'SET_RECORDING':
      return { ...state, isRecording: action.isRecording };

    case 'SET_PLAYBACK_SPEED':
      return { ...state, playbackSpeed: action.speed };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(4, action.zoom)) };

    case 'SET_SCROLL_POSITION':
      return { ...state, scrollPosition: action.position };

    case 'SET_ACTIVE_BRANCH': {
      const branches = state.branches.map((b) => ({
        ...b,
        isActive: b.id === action.branchId,
      }));
      return { ...state, activeBranchId: action.branchId, branches };
    }

    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.event], currentEventId: action.event.id };

    case 'STEP_FORWARD': {
      const branchEvents = state.events
        .filter((e) => e.branchId === state.activeBranchId)
        .sort((a, b) => a.timestamp - b.timestamp);
      const currentIdx = branchEvents.findIndex((e) => e.id === state.currentEventId);
      if (currentIdx < branchEvents.length - 1) {
        return { ...state, currentEventId: branchEvents[currentIdx + 1].id };
      }
      return state;
    }

    case 'STEP_BACKWARD': {
      const branchEvents = state.events
        .filter((e) => e.branchId === state.activeBranchId)
        .sort((a, b) => a.timestamp - b.timestamp);
      const currentIdx = branchEvents.findIndex((e) => e.id === state.currentEventId);
      if (currentIdx > 0) {
        return { ...state, currentEventId: branchEvents[currentIdx - 1].id };
      }
      return state;
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TimeWarpContextValue {
  state: TimeWarpState;
  selectEvent: (eventId: string | null) => void;
  setCurrentEvent: (eventId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setDockPosition: (position: DockPosition) => void;
  setExpandedSize: (size: number) => void;
  setRecording: (isRecording: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setZoom: (zoom: number) => void;
  setScrollPosition: (position: number) => void;
  setActiveBranch: (branchId: string) => void;
  addEvent: (event: TimeWarpEvent) => void;
  stepForward: () => void;
  stepBackward: () => void;
  toggleViewMode: () => void;
}

const TimeWarpContext = createContext<TimeWarpContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const TimeWarpProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const selectEvent = useCallback((eventId: string | null) => {
    dispatch({ type: 'SELECT_EVENT', eventId });
  }, []);

  const setCurrentEvent = useCallback((eventId: string) => {
    dispatch({ type: 'SET_CURRENT_EVENT', eventId });
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', mode });
  }, []);

  const setDockPosition = useCallback((position: DockPosition) => {
    dispatch({ type: 'SET_DOCK_POSITION', position });
  }, []);

  const setExpandedSize = useCallback((size: number) => {
    dispatch({ type: 'SET_EXPANDED_SIZE', size });
  }, []);

  const setRecording = useCallback((isRecording: boolean) => {
    dispatch({ type: 'SET_RECORDING', isRecording });
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    dispatch({ type: 'SET_PLAYBACK_SPEED', speed });
  }, []);

  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', zoom });
  }, []);

  const setScrollPosition = useCallback((position: number) => {
    dispatch({ type: 'SET_SCROLL_POSITION', position });
  }, []);

  const setActiveBranch = useCallback((branchId: string) => {
    dispatch({ type: 'SET_ACTIVE_BRANCH', branchId });
  }, []);

  const addEvent = useCallback((event: TimeWarpEvent) => {
    dispatch({ type: 'ADD_EVENT', event });
  }, []);

  const stepForward = useCallback(() => {
    dispatch({ type: 'STEP_FORWARD' });
  }, []);

  const stepBackward = useCallback(() => {
    dispatch({ type: 'STEP_BACKWARD' });
  }, []);

  const toggleViewMode = useCallback(() => {
    dispatch({
      type: 'SET_VIEW_MODE',
      mode: state.dock.viewMode === 'slim' ? 'expanded' : state.dock.viewMode === 'expanded' ? 'hidden' : 'slim',
    });
  }, [state.dock.viewMode]);

  const value: TimeWarpContextValue = {
    state,
    selectEvent,
    setCurrentEvent,
    setViewMode,
    setDockPosition,
    setExpandedSize,
    setRecording,
    setPlaybackSpeed,
    setZoom,
    setScrollPosition,
    setActiveBranch,
    addEvent,
    stepForward,
    stepBackward,
    toggleViewMode,
  };

  return <TimeWarpContext.Provider value={value}>{children}</TimeWarpContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimeWarp(): TimeWarpContextValue {
  const ctx = useContext(TimeWarpContext);
  if (!ctx) {
    throw new Error('useTimeWarp must be used within a <TimeWarpProvider>');
  }
  return ctx;
}
