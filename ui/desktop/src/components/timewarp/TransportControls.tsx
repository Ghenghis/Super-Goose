import { Play, Pause, SkipBack, SkipForward, CircleDot, RotateCcw } from 'lucide-react';
import { useTimeWarp } from './TimeWarpContext';

const SPEED_OPTIONS = [0.5, 1, 2, 4];

interface TransportControlsProps {
  compact?: boolean;
}

const TransportControls: React.FC<TransportControlsProps> = ({ compact = false }) => {
  const { state, stepBackward, stepForward, setRecording, setPlaybackSpeed, replayToEvent } =
    useTimeWarp();

  const btnBase = [
    'flex items-center justify-center rounded transition-colors',
    'hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
    'text-text-muted hover:text-text-default',
  ].join(' ');

  const btnSize = compact ? 'w-6 h-6' : 'w-7 h-7';
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';

  const handleReplay = () => {
    if (state.selectedEventId) {
      replayToEvent(state.selectedEventId);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Step backward */}
      <button
        className={`${btnBase} ${btnSize}`}
        onClick={stepBackward}
        title="Step backward"
      >
        <SkipBack className={iconSize} />
      </button>

      {/* Play / Pause (shows recording state) */}
      <button
        className={`${btnBase} ${btnSize}`}
        onClick={() => setRecording(!state.isRecording)}
        title={state.isRecording ? 'Pause recording' : 'Resume recording'}
      >
        {state.isRecording ? (
          <Pause className={iconSize} />
        ) : (
          <Play className={iconSize} />
        )}
      </button>

      {/* Step forward */}
      <button
        className={`${btnBase} ${btnSize}`}
        onClick={stepForward}
        title="Step forward"
      >
        <SkipForward className={iconSize} />
      </button>

      {/* Replay to selected event */}
      <button
        className={`${btnBase} ${btnSize} ${state.selectedEventId ? 'text-blue-400 hover:text-blue-300' : 'opacity-30 cursor-not-allowed'}`}
        onClick={handleReplay}
        disabled={!state.selectedEventId}
        title={state.selectedEventId ? 'Replay to selected event' : 'Select an event to replay'}
      >
        <RotateCcw className={iconSize} />
      </button>

      {/* Recording indicator */}
      <button
        className={`${btnBase} ${btnSize} ${state.isRecording ? 'text-red-400' : ''}`}
        onClick={() => setRecording(!state.isRecording)}
        title={state.isRecording ? 'Recording' : 'Not recording'}
      >
        <CircleDot className={`${iconSize} ${state.isRecording ? 'animate-pulse' : 'opacity-40'}`} />
      </button>

      {/* Speed selector (hidden in compact) */}
      {!compact && (
        <select
          value={state.playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          className="ml-1 bg-transparent text-text-muted text-[10px] border border-white/10 rounded px-1 py-0.5 cursor-pointer hover:border-white/20 focus:outline-none"
          title="Playback speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-neutral-800 text-white">
              {s}x
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default TransportControls;
