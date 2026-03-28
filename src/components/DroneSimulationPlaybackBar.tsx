import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Video,
} from 'lucide-react'
import type {
  DroneSimulationTelemetry,
} from '../lib/droneSimulationPlayback'

interface DroneSimulationPlaybackBarProps {
  telemetry: DroneSimulationTelemetry
  speedLabel: string
  isFollowEnabled: boolean
  onTogglePlay: () => void
  onReplay: () => void
  onSeekPrev: () => void
  onSeekNext: () => void
  onCycleSpeed: () => void
  onToggleFollow: () => void
  onStop: () => void
  onScrub: (progress: number) => void
}

export function DroneSimulationPlaybackBar({
  telemetry,
  speedLabel,
  isFollowEnabled,
  onTogglePlay,
  onReplay,
  onSeekPrev,
  onSeekNext,
  onCycleSpeed,
  onToggleFollow,
  onStop,
  onScrub,
}: DroneSimulationPlaybackBarProps) {
  if (!telemetry.visible || telemetry.mode === null) {
    return null
  }

  const currentWaypointLabel = telemetry.waypointCount
    ? `${Math.min(telemetry.currentWaypointIndex + 1, telemetry.waypointCount)}/${telemetry.waypointCount}`
    : '0/0'

  return (
    <div className="simulation-playback-bar" role="group" aria-label="Simulation playback">
      <div className="simulation-playback-actions">
        <button type="button" onClick={onTogglePlay}>
          {telemetry.isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" onClick={onReplay}>
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="simulation-playback-actions">
        <button type="button" onClick={onSeekPrev}>
          <SkipBack size={15} />
        </button>
        <button type="button" onClick={onSeekNext}>
          <SkipForward size={15} />
        </button>
      </div>

      <button
        type="button"
        className="simulation-playback-chip"
        onClick={onCycleSpeed}
      >
        {speedLabel}
      </button>

      <button
        type="button"
        className={`simulation-playback-chip ${isFollowEnabled ? 'is-active' : ''}`}
        onClick={onToggleFollow}
      >
        {isFollowEnabled ? 'Follow' : 'Unfollow'}
      </button>

      <div className="simulation-playback-progress">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(telemetry.progress * 1000)}
          onChange={(event) => onScrub(Number(event.target.value) / 1000)}
        />
        <span>{currentWaypointLabel}</span>
      </div>

      <button
        type="button"
        className="simulation-playback-chip is-danger"
        onClick={onStop}
      >
        <Video size={14} />
        Stop
      </button>
    </div>
  )
}
