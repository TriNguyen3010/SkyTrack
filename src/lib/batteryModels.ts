import type { MissionWaypoint } from '../store/useMissionStore'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'critical'

export interface DroneProfile {
  id: string
  name: string
  batteryCapacityMah: number
  batteryVoltageFull: number
  batteryVoltageNominal: number
  batteryVoltageMin: number
  takeoffWeightGrams: number
  maxPayloadGrams: number
  powerHover: number
  powerCruise: number
  powerAscend: number
  powerDescend: number
  speedCruise: number
  speedAscend: number
  speedDescend: number
  powerCamera: number
  powerPayloadRelease: number
  powerFireSuppress: number
  powerSensor: number
}

export type DroneProfileOverrides = Partial<Omit<DroneProfile, 'id'>>

export interface SafetyPreset {
  id: string
  name: string
  reservePercent: number
  minRthHoverTimeSec: number
}

export interface WaypointBatteryEstimate {
  waypointId: number
  travelCostMah: number
  travelTimeSec: number
  travelDistanceM: number
  actionCostMah: number
  actionTimeSec: number
  cumulativeCostMah: number
  cumulativeTimeSec: number
  remainingMah: number
  remainingPercent: number
  rthCostFromHereMah: number
  rthTimeSec: number
  netRemainingAfterRthMah: number
  safetyLevel: SafetyLevel
}

export interface BatteryWarning {
  level: SafetyLevel
  waypointId: number | null
  message: string
  suggestion: string | null
}

export interface MissionBatteryReport {
  droneProfile: DroneProfile
  homePoint: Vec3
  isClosedLoop: boolean
  totalDistanceM: number
  totalFlightTimeSec: number
  totalActionTimeSec: number
  totalMissionTimeSec: number
  totalEnergyMah: number
  totalTravelEnergyMah: number
  totalActionEnergyMah: number
  takeoffEnergyMah: number
  landingEnergyMah: number
  availableBatteryMah: number
  totalRequiredMah: number
  batteryUsedPercent: number
  batteryRemainingPercent: number
  isFeasible: boolean
  feasibilityMessage: string
  rthReserveMah: number
  safetyMarginMah: number
  pointOfNoReturn: number | null
  waypointEstimates: WaypointBatteryEstimate[]
  warnings: BatteryWarning[]
}

export interface BatteryEstimationInput {
  droneProfile: DroneProfile
  waypoints: MissionWaypoint[]
  homePoint: Vec3 | null
  isClosedLoop: boolean
  safetyPreset: SafetyPreset
}
