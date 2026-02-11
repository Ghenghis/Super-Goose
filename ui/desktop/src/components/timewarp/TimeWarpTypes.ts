export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'float';
export type ViewMode = 'slim' | 'expanded' | 'hidden';
export type EventType =
  | 'tool_call'
  | 'message'
  | 'edit'
  | 'checkpoint'
  | 'branch_point'
  | 'error'
  | 'milestone';

export interface TimeWarpEvent {
  id: string;
  type: EventType;
  timestamp: number;
  label: string;
  detail?: string;
  branchId: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface TimeWarpBranch {
  id: string;
  name: string;
  parentBranchId?: string;
  forkEventId?: string;
  color: string;
  isActive: boolean;
}

export interface DockState {
  position: DockPosition;
  viewMode: ViewMode;
  expandedSize: number;
  floatPosition?: { x: number; y: number };
  floatSize?: { width: number; height: number };
}

export interface TimeWarpState {
  events: TimeWarpEvent[];
  branches: TimeWarpBranch[];
  currentEventId: string | null;
  selectedEventId: string | null;
  activeBranchId: string;
  isRecording: boolean;
  playbackSpeed: number;
  zoom: number;
  scrollPosition: number;
  dock: DockState;
}
