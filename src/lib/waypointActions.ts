export type MissionWaypointActionType =
  | 'hover'
  | 'take_photo'
  | 'record_video'
  | 'drop_payload'
  | 'fire_suppress'
  | 'change_altitude'
  | 'set_gimbal'
  | 'trigger_sensor'

export type MissionWaypointAction =
  | {
      id: number
      type: 'hover'
      config: {
        durationSec: number
      }
    }
  | {
      id: number
      type: 'take_photo'
      config: {
        burstCount: number
      }
    }
  | {
      id: number
      type: 'record_video'
      config: {
        durationSec: number
      }
    }
  | {
      id: number
      type: 'drop_payload'
      config: {
        payloadType: string
      }
    }
  | {
      id: number
      type: 'fire_suppress'
      config: {
        durationSec: number
      }
    }
  | {
      id: number
      type: 'change_altitude'
      config: {
        altitudeDelta: number
      }
    }
  | {
      id: number
      type: 'set_gimbal'
      config: {
        pitch: number
      }
    }
  | {
      id: number
      type: 'trigger_sensor'
      config: {
        sensorName: string
      }
    }

export type WaypointActionPatch = Record<string, number | string>

const ACTION_LIMITS = {
  hoverDurationSec: { min: 1, max: 300, fallback: 6 },
  photoBurstCount: { min: 1, max: 12, fallback: 3 },
  videoDurationSec: { min: 1, max: 600, fallback: 10 },
  fireSuppressDurationSec: { min: 1, max: 180, fallback: 8 },
  altitudeDelta: { min: -120, max: 120, fallback: 10 },
  gimbalPitch: { min: -90, max: 30, fallback: -35 },
} as const

export const WAYPOINT_ACTION_OPTIONS: Array<{
  type: MissionWaypointActionType
  label: string
  description: string
}> = [
  {
    type: 'hover',
    label: 'Hover',
    description: 'Pause over the waypoint for a fixed duration.',
  },
  {
    type: 'take_photo',
    label: 'Take Photo',
    description: 'Capture one or more still images at the waypoint.',
  },
  {
    type: 'record_video',
    label: 'Record Video',
    description: 'Record a short video pass while holding position.',
  },
  {
    type: 'drop_payload',
    label: 'Drop Payload',
    description: 'Trigger the payload release system.',
  },
  {
    type: 'fire_suppress',
    label: 'Fire Suppress',
    description: 'Activate the suppression payload for a set duration.',
  },
  {
    type: 'change_altitude',
    label: 'Change Altitude',
    description: 'Adjust the flight level relative to the mission altitude.',
  },
  {
    type: 'set_gimbal',
    label: 'Set Gimbal',
    description: 'Rotate the camera gimbal to a target pitch angle.',
  },
  {
    type: 'trigger_sensor',
    label: 'Trigger Sensor',
    description: 'Run a mission sensor or equipment trigger.',
  },
]

export function createDefaultWaypointAction(
  type: MissionWaypointActionType,
  id: number,
): MissionWaypointAction {
  switch (type) {
    case 'hover':
      return { id, type, config: { durationSec: 6 } }
    case 'take_photo':
      return { id, type, config: { burstCount: 3 } }
    case 'record_video':
      return { id, type, config: { durationSec: 10 } }
    case 'drop_payload':
      return { id, type, config: { payloadType: 'Rescue Kit' } }
    case 'fire_suppress':
      return { id, type, config: { durationSec: 8 } }
    case 'change_altitude':
      return { id, type, config: { altitudeDelta: 10 } }
    case 'set_gimbal':
      return { id, type, config: { pitch: -35 } }
    case 'trigger_sensor':
      return { id, type, config: { sensorName: 'Thermal Camera' } }
  }
}

export function getWaypointActionLabel(type: MissionWaypointActionType): string {
  return (
    WAYPOINT_ACTION_OPTIONS.find((option) => option.type === type)?.label ?? 'Action'
  )
}

export function summarizeWaypointAction(action: MissionWaypointAction): string {
  switch (action.type) {
    case 'hover':
      return `${action.config.durationSec}s hold`
    case 'take_photo':
      return `${action.config.burstCount} shot burst`
    case 'record_video':
      return `${action.config.durationSec}s clip`
    case 'drop_payload':
      return action.config.payloadType
    case 'fire_suppress':
      return `${action.config.durationSec}s release`
    case 'change_altitude':
      return `${action.config.altitudeDelta > 0 ? '+' : ''}${action.config.altitudeDelta}m`
    case 'set_gimbal':
      return `${action.config.pitch}° pitch`
    case 'trigger_sensor':
      return action.config.sensorName
  }
}

export function patchWaypointAction(
  action: MissionWaypointAction,
  patch: WaypointActionPatch,
): MissionWaypointAction {
  switch (action.type) {
    case 'hover':
      return {
        ...action,
        config: {
          durationSec: sanitizeNumberValue(
            patch.durationSec,
            ACTION_LIMITS.hoverDurationSec,
          ),
        },
      }
    case 'take_photo':
      return {
        ...action,
        config: {
          burstCount: sanitizeNumberValue(
            patch.burstCount,
            ACTION_LIMITS.photoBurstCount,
          ),
        },
      }
    case 'record_video':
      return {
        ...action,
        config: {
          durationSec: sanitizeNumberValue(
            patch.durationSec,
            ACTION_LIMITS.videoDurationSec,
          ),
        },
      }
    case 'drop_payload':
      return {
        ...action,
        config: {
          payloadType: sanitizeTextValue(patch.payloadType, 'Rescue Kit'),
        },
      }
    case 'fire_suppress':
      return {
        ...action,
        config: {
          durationSec: sanitizeNumberValue(
            patch.durationSec,
            ACTION_LIMITS.fireSuppressDurationSec,
          ),
        },
      }
    case 'change_altitude':
      return {
        ...action,
        config: {
          altitudeDelta: sanitizeNumberValue(
            patch.altitudeDelta,
            ACTION_LIMITS.altitudeDelta,
          ),
        },
      }
    case 'set_gimbal':
      return {
        ...action,
        config: {
          pitch: sanitizeNumberValue(
            patch.pitch,
            ACTION_LIMITS.gimbalPitch,
          ),
        },
      }
    case 'trigger_sensor':
      return {
        ...action,
        config: {
          sensorName: sanitizeTextValue(patch.sensorName, 'Thermal Camera'),
        },
      }
  }
}

export function cloneWaypointAction(
  action: MissionWaypointAction,
  id: number,
): MissionWaypointAction {
  switch (action.type) {
    case 'hover':
      return { id, type: action.type, config: { ...action.config } }
    case 'take_photo':
      return { id, type: action.type, config: { ...action.config } }
    case 'record_video':
      return { id, type: action.type, config: { ...action.config } }
    case 'drop_payload':
      return { id, type: action.type, config: { ...action.config } }
    case 'fire_suppress':
      return { id, type: action.type, config: { ...action.config } }
    case 'change_altitude':
      return { id, type: action.type, config: { ...action.config } }
    case 'set_gimbal':
      return { id, type: action.type, config: { ...action.config } }
    case 'trigger_sensor':
      return { id, type: action.type, config: { ...action.config } }
  }
}

export function validateWaypointAction(action: MissionWaypointAction): string[] {
  switch (action.type) {
    case 'hover':
      return validateNumberRange(
        action.config.durationSec,
        ACTION_LIMITS.hoverDurationSec,
        'Hover duration',
      )
    case 'take_photo':
      return validateNumberRange(
        action.config.burstCount,
        ACTION_LIMITS.photoBurstCount,
        'Burst count',
      )
    case 'record_video':
      return validateNumberRange(
        action.config.durationSec,
        ACTION_LIMITS.videoDurationSec,
        'Video duration',
      )
    case 'drop_payload':
      return validateTextValue(action.config.payloadType, 'Payload type')
    case 'fire_suppress':
      return validateNumberRange(
        action.config.durationSec,
        ACTION_LIMITS.fireSuppressDurationSec,
        'Suppress duration',
      )
    case 'change_altitude':
      return validateNumberRange(
        action.config.altitudeDelta,
        ACTION_LIMITS.altitudeDelta,
        'Altitude delta',
      )
    case 'set_gimbal':
      return validateNumberRange(
        action.config.pitch,
        ACTION_LIMITS.gimbalPitch,
        'Gimbal pitch',
      )
    case 'trigger_sensor':
      return validateTextValue(action.config.sensorName, 'Sensor name')
  }
}

function sanitizeNumberValue(
  value: number | string | undefined,
  limits: { min: number; max: number; fallback: number },
): number {
  const nextValue = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(nextValue)) {
    return limits.fallback
  }

  return Math.min(limits.max, Math.max(limits.min, nextValue))
}

function sanitizeTextValue(
  value: number | string | undefined,
  fallback: string,
): string {
  const nextValue = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')

  return nextValue.length > 0 ? nextValue : fallback
}

function validateNumberRange(
  value: number,
  limits: { min: number; max: number },
  label: string,
): string[] {
  if (value < limits.min || value > limits.max) {
    return [`${label} must stay between ${limits.min} and ${limits.max}.`]
  }

  return []
}

function validateTextValue(value: string, label: string): string[] {
  if (value.trim().length === 0) {
    return [`${label} cannot be empty.`]
  }

  return []
}
