import type { MissionWaypoint } from '../store/useMissionStore'
import type { MissionWaypointAction } from './waypointActions'
import type {
  BatteryEstimationInput,
  DroneProfile,
  MissionBatteryReport,
  Vec3,
  WaypointBatteryEstimate,
} from './batteryModels'
import { buildBatteryWarnings, classifySafetyLevel, detectPointOfNoReturn, getSafetyMarginMah } from './batterySafety'
import { DEFAULT_HOME_POINT } from './batteryPresets'

const MIN_POSITIVE_VALUE = 0.0001
const RTH_SPEED_FACTOR = 0.8
const RTH_WIND_FACTOR = 1.2
const TEMPERATURE_FACTOR = 1
const PHOTO_HOVER_SEC_PER_BURST = 2
const PHOTO_CAMERA_SEC_PER_BURST = 0.5
const PAYLOAD_RELEASE_HOVER_SEC = 3
const PAYLOAD_RELEASE_ACTIVE_SEC = 1
const GIMBAL_SETTLE_SEC = 1
const SENSOR_ACTIVE_SEC = 2

interface EnergyDurationEstimate {
  costMah: number
  timeSec: number
}

interface TravelEnergyEstimate extends EnergyDurationEstimate {
  distanceM: number
}

interface ActionEnergyEstimate extends EnergyDurationEstimate {
  endAltitude: number
  warnings: string[]
}

export function computeBatteryReport(
  input: BatteryEstimationInput,
): MissionBatteryReport {
  const droneProfile = sanitizeDroneProfile(input.droneProfile)
  const homePoint = sanitizeVec3(input.homePoint ?? DEFAULT_HOME_POINT)
  const orderedWaypoints = input.waypoints.map(sanitizeWaypoint)
  const hoverReserveMah = wattsSecondsToMah(
    droneProfile.powerHover,
    droneProfile.batteryVoltageNominal,
    input.safetyPreset.minRthHoverTimeSec,
  )
  const safetyMarginMah = getSafetyMarginMah(
    droneProfile.batteryCapacityMah,
    hoverReserveMah,
    input.safetyPreset,
  )

  if (orderedWaypoints.length === 0) {
    const emptyReport: MissionBatteryReport = {
      droneProfile,
      homePoint,
      isClosedLoop: input.isClosedLoop,
      totalDistanceM: 0,
      totalFlightTimeSec: 0,
      totalActionTimeSec: 0,
      totalMissionTimeSec: 0,
      totalEnergyMah: 0,
      totalTravelEnergyMah: 0,
      totalActionEnergyMah: 0,
      takeoffEnergyMah: 0,
      landingEnergyMah: 0,
      availableBatteryMah: droneProfile.batteryCapacityMah,
      totalRequiredMah: safetyMarginMah,
      batteryUsedPercent: clampPercent(
        (safetyMarginMah / droneProfile.batteryCapacityMah) * 100,
      ),
      batteryRemainingPercent: clampPercent(
        100 - (safetyMarginMah / droneProfile.batteryCapacityMah) * 100,
      ),
      isFeasible: true,
      feasibilityMessage: 'Generate a path to estimate mission battery usage.',
      rthReserveMah: 0,
      safetyMarginMah,
      pointOfNoReturn: null,
      waypointEstimates: [],
      warnings: [],
    }

    return emptyReport
  }

  const firstWaypoint = orderedWaypoints[0]
  const takeoffEstimate = computeVerticalTransition(
    homePoint.z,
    firstWaypoint.z,
    droneProfile,
  )

  let totalDistanceM = 0
  let totalFlightTimeSec = takeoffEstimate.timeSec
  let totalActionTimeSec = 0
  let totalTravelEnergyMah = takeoffEstimate.costMah
  let totalActionEnergyMah = 0
  let cumulativeCostMah = takeoffEstimate.costMah
  let cumulativeTimeSec = takeoffEstimate.timeSec
  let previousPosition: Vec3 = {
    x: homePoint.x,
    y: homePoint.y,
    z: firstWaypoint.z,
  }

  const waypointEstimates: WaypointBatteryEstimate[] = []
  const transientWarnings: Array<{
    waypointId: number
    message: string
  }> = []

  for (const [index, waypoint] of orderedWaypoints.entries()) {
    const travelEstimate =
      index === 0
        ? computeHorizontalCruise(
            { x: homePoint.x, y: homePoint.y },
            { x: waypoint.x, y: waypoint.y },
            droneProfile,
          )
        : computeTravelEnergy(previousPosition, waypoint, droneProfile)

    totalDistanceM += travelEstimate.distanceM
    totalFlightTimeSec += travelEstimate.timeSec
    totalTravelEnergyMah += travelEstimate.costMah
    cumulativeCostMah += travelEstimate.costMah
    cumulativeTimeSec += travelEstimate.timeSec

    const actionEstimate = computeWaypointActionEnergy({
      actions: waypoint.actions,
      startAltitude: waypoint.z,
      droneProfile,
    })

    totalActionTimeSec += actionEstimate.timeSec
    totalActionEnergyMah += actionEstimate.costMah
    cumulativeCostMah += actionEstimate.costMah
    cumulativeTimeSec += actionEstimate.timeSec

    const remainingMah = Math.max(
      0,
      droneProfile.batteryCapacityMah - cumulativeCostMah,
    )
    const directRthEstimate = computeDirectRthCost(
      {
        x: waypoint.x,
        y: waypoint.y,
        z: actionEstimate.endAltitude,
      },
      homePoint,
      droneProfile,
    )
    const netRemainingAfterRthMah = remainingMah - directRthEstimate.costMah
    const safetyLevel = classifySafetyLevel({
      remainingMah,
      rthCostFromHereMah: directRthEstimate.costMah,
      netRemainingAfterRthMah,
      safetyMarginMah,
    })

    waypointEstimates.push({
      waypointId: waypoint.id,
      travelCostMah: travelEstimate.costMah,
      travelTimeSec: travelEstimate.timeSec,
      travelDistanceM: travelEstimate.distanceM,
      actionCostMah: actionEstimate.costMah,
      actionTimeSec: actionEstimate.timeSec,
      cumulativeCostMah,
      cumulativeTimeSec,
      remainingMah,
      remainingPercent: clampPercent(
        (remainingMah / droneProfile.batteryCapacityMah) * 100,
      ),
      rthCostFromHereMah: directRthEstimate.costMah,
      rthTimeSec: directRthEstimate.timeSec,
      netRemainingAfterRthMah,
      safetyLevel,
    })

    for (const warning of actionEstimate.warnings) {
      transientWarnings.push({
        waypointId: waypoint.id,
        message: warning,
      })
    }

    previousPosition = {
      x: waypoint.x,
      y: waypoint.y,
      z: actionEstimate.endAltitude,
    }
  }

  if (input.isClosedLoop && orderedWaypoints.length > 1) {
    const closingLoopEstimate = computeTravelEnergy(
      previousPosition,
      firstWaypoint,
      droneProfile,
    )

    totalDistanceM += closingLoopEstimate.distanceM
    totalFlightTimeSec += closingLoopEstimate.timeSec
    totalTravelEnergyMah += closingLoopEstimate.costMah
    cumulativeCostMah += closingLoopEstimate.costMah
    cumulativeTimeSec += closingLoopEstimate.timeSec
    previousPosition = {
      x: firstWaypoint.x,
      y: firstWaypoint.y,
      z: firstWaypoint.z,
    }
  }

  const rthReserveEstimate = computeDirectRthCost(
    previousPosition,
    homePoint,
    droneProfile,
  )
  const landingEnergyMah = rthReserveEstimate.costMah
  const totalEnergyMah = totalTravelEnergyMah + totalActionEnergyMah
  const totalMissionTimeSec = totalFlightTimeSec + totalActionTimeSec
  const totalRequiredMah = totalEnergyMah + rthReserveEstimate.costMah + safetyMarginMah
  const availableBatteryMah = droneProfile.batteryCapacityMah
  const batteryUsedPercent = clampPercent((totalRequiredMah / availableBatteryMah) * 100)
  const batteryRemainingPercent = clampPercent(100 - batteryUsedPercent)
  const pointOfNoReturn = detectPointOfNoReturn(waypointEstimates, safetyMarginMah)

  const baseReport: MissionBatteryReport = {
    droneProfile,
    homePoint,
    isClosedLoop: input.isClosedLoop,
    totalDistanceM,
    totalFlightTimeSec,
    totalActionTimeSec,
    totalMissionTimeSec,
    totalEnergyMah,
    totalTravelEnergyMah,
    totalActionEnergyMah,
    takeoffEnergyMah: takeoffEstimate.costMah,
    landingEnergyMah,
    availableBatteryMah,
    totalRequiredMah,
    batteryUsedPercent,
    batteryRemainingPercent,
    isFeasible: totalRequiredMah <= availableBatteryMah,
    feasibilityMessage: getFeasibilityMessage({
      totalRequiredMah,
      availableBatteryMah,
      pointOfNoReturn,
    }),
    rthReserveMah: rthReserveEstimate.costMah,
    safetyMarginMah,
    pointOfNoReturn,
    waypointEstimates,
    warnings: [],
  }

  const warnings = [
    ...buildBatteryWarnings(baseReport),
    ...transientWarnings.map((warning) => ({
      level: 'warning' as const,
      waypointId: warning.waypointId,
      message: warning.message,
      suggestion: 'Review altitude-changing actions or home altitude settings.',
    })),
  ]

  return {
    ...baseReport,
    warnings,
  }
}

export function computeTravelEnergy(
  from: Vec3,
  to: Vec3,
  droneProfile: DroneProfile,
): TravelEnergyEstimate {
  const horizontalDistanceM = distance2d(from, to)
  const verticalDistanceM = to.z - from.z
  const distanceM = distance3d(from, to)

  if (distanceM <= 0) {
    return { costMah: 0, timeSec: 0, distanceM: 0 }
  }

  if (verticalDistanceM > 0) {
    const horizontalTimeSec = horizontalDistanceM / droneProfile.speedCruise
    const verticalTimeSec = verticalDistanceM / droneProfile.speedAscend
    const timeSec = Math.max(horizontalTimeSec, verticalTimeSec)
    const powerAvg = (droneProfile.powerCruise + droneProfile.powerAscend) / 2

    return {
      costMah: wattsSecondsToMah(
        powerAvg,
        droneProfile.batteryVoltageNominal,
        timeSec,
      ),
      timeSec,
      distanceM,
    }
  }

  if (verticalDistanceM < 0) {
    const horizontalTimeSec = horizontalDistanceM / droneProfile.speedCruise
    const verticalTimeSec = Math.abs(verticalDistanceM) / droneProfile.speedDescend
    const timeSec = Math.max(horizontalTimeSec, verticalTimeSec)
    const powerAvg = (droneProfile.powerCruise + droneProfile.powerDescend) / 2

    return {
      costMah: wattsSecondsToMah(
        powerAvg,
        droneProfile.batteryVoltageNominal,
        timeSec,
      ),
      timeSec,
      distanceM,
    }
  }

  const timeSec = horizontalDistanceM / droneProfile.speedCruise

  return {
    costMah: wattsSecondsToMah(
      droneProfile.powerCruise,
      droneProfile.batteryVoltageNominal,
      timeSec,
    ),
    timeSec,
    distanceM,
  }
}

export function computeWaypointActionEnergy({
  actions,
  startAltitude,
  droneProfile,
}: {
  actions: MissionWaypointAction[]
  startAltitude: number
  droneProfile: DroneProfile
}): ActionEnergyEstimate {
  let costMah = 0
  let timeSec = 0
  let currentAltitude = Math.max(0, startAltitude)
  const warnings: string[] = []

  for (const action of actions) {
    switch (action.type) {
      case 'hover': {
        const actionTimeSec = action.config.durationSec
        timeSec += actionTimeSec
        costMah += wattsSecondsToMah(
          droneProfile.powerHover,
          droneProfile.batteryVoltageNominal,
          actionTimeSec,
        )
        break
      }
      case 'take_photo': {
        const hoverTimeSec = PHOTO_HOVER_SEC_PER_BURST * action.config.burstCount
        const cameraTimeSec = PHOTO_CAMERA_SEC_PER_BURST * action.config.burstCount
        timeSec += hoverTimeSec
        costMah += wattsSecondsToMah(
          droneProfile.powerHover,
          droneProfile.batteryVoltageNominal,
          hoverTimeSec,
        )
        costMah += wattsSecondsToMah(
          droneProfile.powerCamera,
          droneProfile.batteryVoltageNominal,
          cameraTimeSec,
        )
        break
      }
      case 'record_video': {
        const actionTimeSec = action.config.durationSec
        timeSec += actionTimeSec
        costMah += wattsSecondsToMah(
          droneProfile.powerHover + droneProfile.powerCamera,
          droneProfile.batteryVoltageNominal,
          actionTimeSec,
        )
        break
      }
      case 'drop_payload': {
        timeSec += PAYLOAD_RELEASE_HOVER_SEC
        costMah += wattsSecondsToMah(
          droneProfile.powerHover,
          droneProfile.batteryVoltageNominal,
          PAYLOAD_RELEASE_HOVER_SEC,
        )
        costMah += wattsSecondsToMah(
          droneProfile.powerPayloadRelease,
          droneProfile.batteryVoltageNominal,
          PAYLOAD_RELEASE_ACTIVE_SEC,
        )
        break
      }
      case 'fire_suppress': {
        const actionTimeSec = action.config.durationSec
        timeSec += actionTimeSec
        costMah += wattsSecondsToMah(
          droneProfile.powerHover + droneProfile.powerFireSuppress,
          droneProfile.batteryVoltageNominal,
          actionTimeSec,
        )
        break
      }
      case 'change_altitude': {
        const nextAltitude = Math.max(0, currentAltitude + action.config.altitudeDelta)

        if (nextAltitude !== currentAltitude + action.config.altitudeDelta) {
          warnings.push('Altitude was clamped to ground level for battery estimation.')
        }

        const transition = computeVerticalTransition(
          currentAltitude,
          nextAltitude,
          droneProfile,
        )

        costMah += transition.costMah
        timeSec += transition.timeSec
        currentAltitude = nextAltitude
        break
      }
      case 'set_gimbal': {
        timeSec += GIMBAL_SETTLE_SEC
        costMah += wattsSecondsToMah(
          droneProfile.powerHover,
          droneProfile.batteryVoltageNominal,
          GIMBAL_SETTLE_SEC,
        )
        break
      }
      case 'trigger_sensor': {
        timeSec += SENSOR_ACTIVE_SEC
        costMah += wattsSecondsToMah(
          droneProfile.powerHover + droneProfile.powerSensor,
          droneProfile.batteryVoltageNominal,
          SENSOR_ACTIVE_SEC,
        )
        break
      }
    }
  }

  return {
    costMah,
    timeSec,
    endAltitude: currentAltitude,
    warnings,
  }
}

export function computeDirectRthCost(
  from: Vec3,
  homePoint: Vec3,
  droneProfile: DroneProfile,
): TravelEnergyEstimate {
  const horizontalDistanceM = distance2d(from, homePoint)
  const cruiseSpeed = Math.max(
    MIN_POSITIVE_VALUE,
    droneProfile.speedCruise * RTH_SPEED_FACTOR,
  )
  const horizontalTimeSec = horizontalDistanceM / cruiseSpeed
  const horizontalEnergyMah = wattsSecondsToMah(
    droneProfile.powerCruise * RTH_WIND_FACTOR * TEMPERATURE_FACTOR,
    droneProfile.batteryVoltageNominal,
    horizontalTimeSec,
  )
  const verticalEstimate = computeVerticalTransition(
    from.z,
    homePoint.z,
    droneProfile,
  )

  return {
    costMah: horizontalEnergyMah + verticalEstimate.costMah,
    timeSec: horizontalTimeSec + verticalEstimate.timeSec,
    distanceM: horizontalDistanceM + Math.abs(from.z - homePoint.z),
  }
}

function computeHorizontalCruise(
  from: Pick<Vec3, 'x' | 'y'>,
  to: Pick<Vec3, 'x' | 'y'>,
  droneProfile: DroneProfile,
): TravelEnergyEstimate {
  const distanceM = distance2d(from, to)

  if (distanceM <= 0) {
    return { costMah: 0, timeSec: 0, distanceM: 0 }
  }

  const timeSec = distanceM / droneProfile.speedCruise

  return {
    costMah: wattsSecondsToMah(
      droneProfile.powerCruise,
      droneProfile.batteryVoltageNominal,
      timeSec,
    ),
    timeSec,
    distanceM,
  }
}

function computeVerticalTransition(
  fromAltitude: number,
  toAltitude: number,
  droneProfile: DroneProfile,
): EnergyDurationEstimate {
  const altitudeDelta = toAltitude - fromAltitude

  if (altitudeDelta === 0) {
    return { costMah: 0, timeSec: 0 }
  }

  if (altitudeDelta > 0) {
    const timeSec = altitudeDelta / droneProfile.speedAscend
    return {
      costMah: wattsSecondsToMah(
        droneProfile.powerAscend,
        droneProfile.batteryVoltageNominal,
        timeSec,
      ),
      timeSec,
    }
  }

  const timeSec = Math.abs(altitudeDelta) / droneProfile.speedDescend

  return {
    costMah: wattsSecondsToMah(
      droneProfile.powerDescend,
      droneProfile.batteryVoltageNominal,
      timeSec,
    ),
    timeSec,
  }
}

function wattsSecondsToMah(
  powerWatts: number,
  voltage: number,
  durationSec: number,
): number {
  if (durationSec <= 0) {
    return 0
  }

  return ((powerWatts / voltage) * durationSec * 1000) / 3600
}

function sanitizeDroneProfile(droneProfile: DroneProfile): DroneProfile {
  return {
    ...droneProfile,
    batteryCapacityMah: clampNonNegative(droneProfile.batteryCapacityMah),
    batteryVoltageFull: clampPositive(droneProfile.batteryVoltageFull),
    batteryVoltageNominal: clampPositive(droneProfile.batteryVoltageNominal),
    batteryVoltageMin: clampPositive(droneProfile.batteryVoltageMin),
    takeoffWeightGrams: clampNonNegative(droneProfile.takeoffWeightGrams),
    maxPayloadGrams: clampNonNegative(droneProfile.maxPayloadGrams),
    powerHover: clampPositive(droneProfile.powerHover),
    powerCruise: clampPositive(droneProfile.powerCruise),
    powerAscend: clampPositive(droneProfile.powerAscend),
    powerDescend: clampPositive(droneProfile.powerDescend),
    speedCruise: clampPositive(droneProfile.speedCruise),
    speedAscend: clampPositive(droneProfile.speedAscend),
    speedDescend: clampPositive(droneProfile.speedDescend),
    powerCamera: clampNonNegative(droneProfile.powerCamera),
    powerPayloadRelease: clampNonNegative(droneProfile.powerPayloadRelease),
    powerFireSuppress: clampNonNegative(droneProfile.powerFireSuppress),
    powerSensor: clampNonNegative(droneProfile.powerSensor),
  }
}

function sanitizeWaypoint(waypoint: MissionWaypoint): MissionWaypoint {
  return {
    ...waypoint,
    z: clampNonNegative(waypoint.z),
  }
}

function sanitizeVec3(point: Vec3): Vec3 {
  return {
    x: point.x,
    y: point.y,
    z: clampNonNegative(point.z),
  }
}

function clampPositive(value: number): number {
  return Math.max(MIN_POSITIVE_VALUE, value)
}

function clampNonNegative(value: number): number {
  return Math.max(0, value)
}

function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function distance2d(
  from: Pick<Vec3, 'x' | 'y'>,
  to: Pick<Vec3, 'x' | 'y'>,
): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function distance3d(from: Vec3, to: Vec3): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
}

function getFeasibilityMessage({
  totalRequiredMah,
  availableBatteryMah,
  pointOfNoReturn,
}: {
  totalRequiredMah: number
  availableBatteryMah: number
  pointOfNoReturn: number | null
}): string {
  if (totalRequiredMah <= availableBatteryMah) {
    if (pointOfNoReturn !== null) {
      return `Mission is feasible, but reserve starts to tighten after waypoint #${pointOfNoReturn}.`
    }

    return 'Mission is feasible with current reserve settings.'
  }

  const deficitMah = Math.max(0, totalRequiredMah - availableBatteryMah)
  return `Mission is not feasible with current reserve settings. Estimated deficit: ${Math.round(
    deficitMah,
  )} mAh.`
}
