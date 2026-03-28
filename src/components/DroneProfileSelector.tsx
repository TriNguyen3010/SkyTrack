import type { DroneProfile, SafetyPreset } from '../lib/batteryModels'

export function DroneProfileSelector({
  droneProfileId,
  safetyPresetId,
  droneProfiles,
  safetyPresets,
  resolvedDroneProfile,
  maxFlightMinutes,
  onDroneProfileChange,
  onSafetyPresetChange,
}: {
  droneProfileId: string
  safetyPresetId: string
  droneProfiles: DroneProfile[]
  safetyPresets: SafetyPreset[]
  resolvedDroneProfile: DroneProfile
  maxFlightMinutes: number
  onDroneProfileChange: (profileId: string) => void
  onSafetyPresetChange: (presetId: string) => void
}) {
  return (
    <div className="battery-setup-card">
      <div className="battery-setup-header">
        <strong>Vehicle Profile</strong>
        <span>Battery and reserve assumptions for mission estimation.</span>
      </div>

      <label className="action-field">
        <span className="action-field-label">Preset</span>
        <select
          className="action-select"
          value={droneProfileId}
          onChange={(event) => onDroneProfileChange(event.target.value)}
        >
          {droneProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>

      <label className="action-field">
        <span className="action-field-label">Safety Reserve</span>
        <select
          className="action-select"
          value={safetyPresetId}
          onChange={(event) => onSafetyPresetChange(event.target.value)}
        >
          {safetyPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <div className="battery-setup-stats">
        <div className="battery-setup-stat">
          <span>Battery</span>
          <strong>{resolvedDroneProfile.batteryCapacityMah.toLocaleString()} mAh</strong>
        </div>
        <div className="battery-setup-stat">
          <span>Nominal Voltage</span>
          <strong>{resolvedDroneProfile.batteryVoltageNominal.toFixed(1)}V</strong>
        </div>
      </div>

      <div className="battery-theoretical-card">
        <span className="battery-theoretical-label">Max flight</span>
        <strong>~{maxFlightMinutes} min</strong>
        <span className="battery-theoretical-note">Theoretical cruise endurance</span>
      </div>
    </div>
  )
}
