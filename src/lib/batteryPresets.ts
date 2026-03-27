import type {
  DroneProfile,
  DroneProfileOverrides,
  SafetyPreset,
  Vec3,
} from './batteryModels'

export const DEFAULT_HOME_POINT: Vec3 = { x: 0, y: 0, z: 0 }
export const DEFAULT_DRONE_PROFILE_ID = 'generic-quad-medium'
export const DEFAULT_SAFETY_PRESET_ID = 'standard'

export const DRONE_PRESETS: DroneProfile[] = [
  {
    id: 'generic-quad-small',
    name: 'Generic Small Quad (~1kg)',
    batteryCapacityMah: 3000,
    batteryVoltageFull: 17.4,
    batteryVoltageNominal: 15.2,
    batteryVoltageMin: 13.2,
    takeoffWeightGrams: 1000,
    maxPayloadGrams: 200,
    powerHover: 65,
    powerCruise: 80,
    powerAscend: 120,
    powerDescend: 45,
    speedCruise: 10,
    speedAscend: 3,
    speedDescend: 2,
    powerCamera: 5,
    powerPayloadRelease: 15,
    powerFireSuppress: 25,
    powerSensor: 8,
  },
  {
    id: 'generic-quad-medium',
    name: 'Generic Medium Quad (~2.5kg)',
    batteryCapacityMah: 5000,
    batteryVoltageFull: 17.6,
    batteryVoltageNominal: 15.4,
    batteryVoltageMin: 13.2,
    takeoffWeightGrams: 2500,
    maxPayloadGrams: 800,
    powerHover: 110,
    powerCruise: 135,
    powerAscend: 190,
    powerDescend: 70,
    speedCruise: 12,
    speedAscend: 4,
    speedDescend: 3,
    powerCamera: 6,
    powerPayloadRelease: 18,
    powerFireSuppress: 32,
    powerSensor: 10,
  },
  {
    id: 'generic-hex-heavy',
    name: 'Generic Heavy Hex (~8kg)',
    batteryCapacityMah: 12000,
    batteryVoltageFull: 25.2,
    batteryVoltageNominal: 22.2,
    batteryVoltageMin: 19.2,
    takeoffWeightGrams: 8000,
    maxPayloadGrams: 2500,
    powerHover: 260,
    powerCruise: 320,
    powerAscend: 420,
    powerDescend: 180,
    speedCruise: 10,
    speedAscend: 3,
    speedDescend: 2.5,
    powerCamera: 12,
    powerPayloadRelease: 25,
    powerFireSuppress: 45,
    powerSensor: 20,
  },
]

export const SAFETY_PRESETS: SafetyPreset[] = [
  {
    id: 'conservative',
    name: 'Conservative (25%)',
    reservePercent: 25,
    minRthHoverTimeSec: 120,
  },
  {
    id: 'standard',
    name: 'Standard (20%)',
    reservePercent: 20,
    minRthHoverTimeSec: 60,
  },
  {
    id: 'aggressive',
    name: 'Aggressive (15%)',
    reservePercent: 15,
    minRthHoverTimeSec: 30,
  },
]

export function getDronePreset(profileId: string): DroneProfile {
  return (
    DRONE_PRESETS.find((profile) => profile.id === profileId) ??
    DRONE_PRESETS.find((profile) => profile.id === DEFAULT_DRONE_PROFILE_ID) ??
    DRONE_PRESETS[0]
  )
}

export function resolveDroneProfile(
  profileId: string,
  overrides?: DroneProfileOverrides | null,
): DroneProfile {
  const preset = getDronePreset(profileId)

  if (!overrides) {
    return preset
  }

  return {
    ...preset,
    ...overrides,
  }
}

export function getSafetyPreset(presetId: string): SafetyPreset {
  return (
    SAFETY_PRESETS.find((preset) => preset.id === presetId) ??
    SAFETY_PRESETS.find((preset) => preset.id === DEFAULT_SAFETY_PRESET_ID) ??
    SAFETY_PRESETS[0]
  )
}
