import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import type {
  TimeWarpState,
  TimeWarpEvent,
  TimeWarpBranch,
  ViewMode,
  DockPosition,
} from './TimeWarpTypes';
import { useTimeWarpEvents } from '../../hooks/useTimeWarpEvents';
import type { TimeWarpEventAPI, TimeWarpBranchAPI } from '../../hooks/useTimeWarpEvents';

// ---------------------------------------------------------------------------
// Helpers — convert API shapes to local TimeWarp shapes
// ---------------------------------------------------------------------------

const BRANCH_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

function apiEventToLocal(e: TimeWarpEventAPI): TimeWarpEvent {
  return {
    id: e.id,
    type: (e.event_type as TimeWarpEvent['type']) || 'message',
    timestamp: new Date(e.timestamp).getTime(),
    label: e.label,
    detail: e.detail || undefined,
    branchId: e.branch_id,
    agentId: e.agent_id || undefined,
    metadata: e.metadata,
  };
}

function apiBranchToLocal(b: TimeWarpBranchAPI, index: number): TimeWarpBranch {
  return {
    id: b.id,
    name: b.name,
    parentBranchId: b.parent_branch_id || undefined,
    forkEventId: b.fork_event_id || undefined,
    color: BRANCH_COLORS[index % BRANCH_COLORS.length],
    isActive: b.is_active,
  };
}

// ---------------------------------------------------------------------------
// Default empty state (used when API has no data)
// ---------------------------------------------------------------------------

const DEFAULT_BRANCH: TimeWarpBranch = {
  id: 'main',
  name: 'main',
  color: '#3b82f6',
  isActive: true,
};

const INITIAL_STATE: TimeWarpState = {
  events: [],
  branches: [DEFAULT_BRANCH],
  currentEventId: null,
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
  | { type: 'SYNC_API_DATA'; events: TimeWarpEvent[]; branches: TimeWarpBranch[] }
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

    case 'SYNC_API_DATA': {
      const newEvents = action.events;
      const newBranches = action.branches.length > 0 ? action.branches : state.branches;
      const lastEvent = newEvents.length > 0 ? newEvents[newEvents.length - 1] : null;
      return {
        ...state,
        events: newEvents,
        branches: newBranches,
        currentEventId: lastEvent ? lastEvent.id : state.currentEventId,
      };
    }

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
  replayToEvent: (eventId: string) => Promise<boolean>;
  apiLoading: boolean;
  apiError: string | null;
}

const TimeWarpContext = createContext<TimeWarpContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface TimeWarpProviderProps {
  children: ReactNode;
  sessionId?: string | null;
}

export const TimeWarpProvider: React.FC<TimeWarpProviderProps> = ({
  children,
  sessionId = null,
}) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const {
    events: apiEvents,
    branches: apiBranches,
    loading: apiLoading,
    error: apiError,
    replayToEvent: apiReplayToEvent,
    recordEvent: apiRecordEvent,
  } = useTimeWarpEvents(sessionId);

  // Sync API data into reducer state when it arrives
  useEffect(() => {
    if (apiEvents.length > 0 || apiBranches.length > 0) {
      dispatch({
        type: 'SYNC_API_DATA',
        events: apiEvents.map(apiEventToLocal),
        branches: apiBranches.map(apiBranchToLocal),
      });
    }
  }, [apiEvents, apiBranches]);

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

  const addEvent = useCallback(
    (event: TimeWarpEvent) => {
      dispatch({ type: 'ADD_EVENT', event });
      // Also attempt to persist via API
      if (sessionId) {
        apiRecordEvent({
          session_id: sessionId,
          branch_id: event.branchId,
          event_type: event.type,
          label: event.label,
          detail: event.detail || '',
          agent_id: event.agentId || null,
          metadata: event.metadata || {},
        });
      }
    },
    [sessionId, apiRecordEvent]
  );

  const stepForward = useCallback(() => {
    dispatch({ type: 'STEP_FORWARD' });
  }, []);

  const stepBackward = useCallback(() => {
    dispatch({ type: 'STEP_BACKWARD' });
  }, []);

  const toggleViewMode = useCallback(() => {
    dispatch({
      type: 'SET_VIEW_MODE',
      mode:
        state.dock.viewMode === 'slim'
          ? 'expanded'
          : state.dock.viewMode === 'expanded'
            ? 'hidden'
            : 'slim',
    });
  }, [state.dock.viewMode]);

  const replayToEvent = useCallback(
    async (eventId: string) => {
      const ok = await apiReplayToEvent(eventId);
      if (ok) {
        dispatch({ type: 'SET_CURRENT_EVENT', eventId });
      }
      return ok;
    },
    [apiReplayToEvent]
  );

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
    replayToEvent,
    apiLoading,
    apiError,
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
