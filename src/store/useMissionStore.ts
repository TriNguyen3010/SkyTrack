import { create } from 'zustand'
import type {
  PathSegment,
  WaypointDensityConfig,
  WaypointRole,
} from '../lib/waypointDensityModels'
import {
  DEFAULT_WAYPOINT_DENSITY_CONFIG,
} from '../lib/waypointDensityModels'
import type {
  FlightPatternId,
  FlightPatternMissionMeta,
  FlightPatternMissionResult,
} from '../lib/flightPatterns'
import type { Vec2 } from '../lib/missionGeometry'
import {
  DEFAULT_DRONE_PROFILE_ID,
  DEFAULT_HOME_POINT,
  DEFAULT_SAFETY_PRESET_ID,
} from '../lib/batteryPresets'
import type {
  DroneProfileOverrides,
  Vec3,
} from '../lib/batteryModels'
import {
  cloneWaypointAction,
  createDefaultWaypointAction,
  patchWaypointAction,
  type MissionWaypointAction,
  type MissionWaypointActionType,
  type WaypointActionPatch,
} from '../lib/waypointActions'

export type OperationMode = 'simulation' | 'deployment'
export type EditorTab = 'design' | 'code'
export type MissionStage = 'idle' | 'setup' | 'drawing' | 'editing' | 'generated'
export type DrawingTarget = 'boundary' | 'exclusion'

export interface MissionPoint {
  id: number
  x: number
  y: number
}

export interface ExclusionZone {
  id: number
  points: MissionPoint[]
  label: string
  enabled: boolean
}

export interface MissionWaypoint {
  id: number
  x: number
  y: number
  z: number
  actions: MissionWaypointAction[]
  role: WaypointRole
}

interface MissionState {
  operationMode: OperationMode
  editorTab: EditorTab
  stage: MissionStage
  scanAltitude: number
  lineSpacing: number
  orientation: number
  droneProfileId: string
  droneProfileOverrides: DroneProfileOverrides | null
  homePoint: Vec3
  safetyPresetId: string
  points: MissionPoint[]
  exclusionZones: ExclusionZone[]
  activeExclusionZoneId: number | null
  drawingTarget: DrawingTarget
  waypointDensity: WaypointDensityConfig
  generatedWaypointDensity: WaypointDensityConfig | null
  generatedPatternId: FlightPatternId | null
  generatedPatternMeta: FlightPatternMissionMeta | null
  generatedSegments: Array<[Vec2, Vec2]>
  generatedAnchorWaypoints: MissionWaypoint[]
  generatedPathSegments: PathSegment[]
  generatedClosed: boolean
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  startWaypointId: number | null
  hoveredWaypointId: number | null
  bulkAssignActionType: MissionWaypointActionType | null
  setOperationMode: (mode: OperationMode) => void
  setEditorTab: (tab: EditorTab) => void
  setScanAltitude: (value: number) => void
  setLineSpacing: (value: number) => void
  setOrientation: (value: number) => void
  setDroneProfileId: (id: string) => void
  setDroneProfileOverrides: (overrides: DroneProfileOverrides | null) => void
  setHomePoint: (point: Vec3) => void
  setSafetyPresetId: (id: string) => void
  addExclusionZone: () => number | null
  removeExclusionZone: (zoneId: number) => void
  renameExclusionZone: (zoneId: number, label: string) => void
  toggleExclusionZone: (zoneId: number) => void
  setActiveExclusionZone: (zoneId: number | null) => void
  setDrawingTarget: (target: DrawingTarget) => void
  setWaypointDensityConfig: (config: WaypointDensityConfig) => void
  setWaypointDensityMode: (mode: WaypointDensityConfig['mode']) => void
  setTargetWaypointCount: (count: number) => void
  setTargetWaypointSpacing: (spacing: number) => void
  enterSetup: () => void
  cancelSetup: () => void
  startDrawing: () => void
  cancelDrawing: () => void
  closePolygon: () => void
  generatePath: (
    mission: FlightPatternMissionResult,
    densityConfig: WaypointDensityConfig,
  ) => void
  editGeneratedPath: () => void
  redrawMission: () => void
  resetMission: () => void
  addPoint: (x: number, y: number) => void
  updatePoint: (id: number, x: number, y: number) => void
  addExclusionPoint: (zoneId: number, x: number, y: number) => void
  updateExclusionPoint: (zoneId: number, pointId: number, x: number, y: number) => void
  closeExclusionZone: (zoneId: number) => void
  selectWaypoint: (id: number | null) => void
  setStartWaypoint: (id: number | null) => void
  setHoveredWaypoint: (id: number | null) => void
  setBulkAssignActionType: (type: MissionWaypointActionType | null) => void
  addWaypointAction: (waypointId: number, type: MissionWaypointActionType) => void
  duplicateWaypointAction: (waypointId: number, actionId: number) => void
  applyWaypointActionToTargets: (
    sourceWaypointId: number,
    actionId: number,
    targetWaypointIds: number[],
  ) => void
  updateWaypointAction: (
    waypointId: number,
    actionId: number,
    patch: WaypointActionPatch,
  ) => void
  removeWaypointAction: (waypointId: number, actionId: number) => void
  moveWaypointAction: (
    waypointId: number,
    actionId: number,
    direction: 'up' | 'down',
  ) => void
}

const DEFAULT_ALTITUDE = 50
const DEFAULT_SPACING = 10
const DEFAULT_ORIENTATION = 0
const EXCLUSION_LABEL_PREFIX = 'Excluded area'

function getNextEntityId(items: Array<{ id: number }>): number {
  return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1
}

function getExclusionZoneLabel(index: number): string {
  return `${EXCLUSION_LABEL_PREFIX} ${index}`
}

function createExclusionZone(zoneId: number, labelIndex: number): ExclusionZone {
  return {
    id: zoneId,
    points: [],
    label: getExclusionZoneLabel(labelIndex),
    enabled: true,
  }
}

function clearDerivedMissionState() {
  return {
    generatedPatternId: null as FlightPatternId | null,
    generatedPatternMeta: null as FlightPatternMissionMeta | null,
    generatedSegments: [] as Array<[Vec2, Vec2]>,
    generatedAnchorWaypoints: [] as MissionWaypoint[],
    generatedPathSegments: [] as PathSegment[],
    generatedWaypointDensity: null as WaypointDensityConfig | null,
    generatedClosed: false,
    waypoints: [] as MissionWaypoint[],
    selectedWaypointId: null as number | null,
    startWaypointId: null as number | null,
    hoveredWaypointId: null as number | null,
    bulkAssignActionType: null as MissionWaypointActionType | null,
  }
}

function getDrawingCancelStage(state: Pick<MissionState, 'points'>): MissionStage {
  return state.points.length >= 3 ? 'editing' : 'setup'
}

function removeExclusionZoneById(
  zones: ExclusionZone[],
  zoneId: number,
): ExclusionZone[] {
  return zones.filter((zone) => zone.id !== zoneId)
}

const initialState = {
  operationMode: 'simulation' as OperationMode,
  editorTab: 'design' as EditorTab,
  stage: 'idle' as MissionStage,
  scanAltitude: DEFAULT_ALTITUDE,
  lineSpacing: DEFAULT_SPACING,
  orientation: DEFAULT_ORIENTATION,
  droneProfileId: DEFAULT_DRONE_PROFILE_ID,
  droneProfileOverrides: null as DroneProfileOverrides | null,
  homePoint: { ...DEFAULT_HOME_POINT } as Vec3,
  safetyPresetId: DEFAULT_SAFETY_PRESET_ID,
  points: [] as MissionPoint[],
  exclusionZones: [] as ExclusionZone[],
  activeExclusionZoneId: null as number | null,
  drawingTarget: 'boundary' as DrawingTarget,
  waypointDensity: { ...DEFAULT_WAYPOINT_DENSITY_CONFIG } as WaypointDensityConfig,
  generatedWaypointDensity: null as WaypointDensityConfig | null,
  generatedPatternId: null as FlightPatternId | null,
  generatedPatternMeta: null as FlightPatternMissionMeta | null,
  generatedSegments: [] as Array<[Vec2, Vec2]>,
  generatedAnchorWaypoints: [] as MissionWaypoint[],
  generatedPathSegments: [] as PathSegment[],
  generatedClosed: false,
  waypoints: [] as MissionWaypoint[],
  selectedWaypointId: null as number | null,
  startWaypointId: null as number | null,
  hoveredWaypointId: null as number | null,
  bulkAssignActionType: null as MissionWaypointActionType | null,
}

export const useMissionStore = create<MissionState>((set, get) => ({
  ...initialState,
  setOperationMode: (mode) => set({ operationMode: mode }),
  setEditorTab: (tab) => set({ editorTab: tab }),
  setScanAltitude: (value) => set({ scanAltitude: value }),
  setLineSpacing: (value) => set({ lineSpacing: value }),
  setOrientation: (value) => set({ orientation: value }),
  setDroneProfileId: (id) =>
    set({
      droneProfileId: id,
      droneProfileOverrides: null,
    }),
  setDroneProfileOverrides: (overrides) =>
    set({
      droneProfileOverrides: overrides,
    }),
  setHomePoint: (point) =>
    set({
      homePoint: point,
    }),
  setSafetyPresetId: (id) =>
    set({
      safetyPresetId: id,
    }),
  addExclusionZone: () => {
    const state = get()

    if (state.points.length < 3) {
      return null
    }

    const zoneId = getNextEntityId(state.exclusionZones)

    set((current) => ({
      stage: 'drawing',
      drawingTarget: 'exclusion',
      activeExclusionZoneId: zoneId,
      exclusionZones: [
        ...current.exclusionZones,
        createExclusionZone(zoneId, current.exclusionZones.length + 1),
      ],
      ...clearDerivedMissionState(),
    }))

    return zoneId
  },
  removeExclusionZone: (zoneId) =>
    set((state) => {
      const nextZones = removeExclusionZoneById(state.exclusionZones, zoneId)
      const removedActiveZone = state.activeExclusionZoneId === zoneId

      return {
        exclusionZones: nextZones,
        activeExclusionZoneId: removedActiveZone ? null : state.activeExclusionZoneId,
        drawingTarget:
          removedActiveZone && state.drawingTarget === 'exclusion'
            ? 'boundary'
            : state.drawingTarget,
        stage:
          removedActiveZone && state.stage === 'drawing'
            ? getDrawingCancelStage(state)
            : state.stage === 'generated'
              ? 'editing'
            : state.stage,
        ...clearDerivedMissionState(),
      }
    }),
  renameExclusionZone: (zoneId, label) =>
    set((state) => ({
      exclusionZones: state.exclusionZones.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              label: label.trim() || zone.label,
            }
          : zone,
      ),
    })),
  toggleExclusionZone: (zoneId) =>
    set((state) => ({
      exclusionZones: state.exclusionZones.map((zone) =>
        zone.id === zoneId ? { ...zone, enabled: !zone.enabled } : zone,
      ),
      stage: state.stage === 'generated' ? 'editing' : state.stage,
      ...clearDerivedMissionState(),
    })),
  setActiveExclusionZone: (zoneId) =>
    set((state) => ({
      activeExclusionZoneId:
        zoneId === null || state.exclusionZones.some((zone) => zone.id === zoneId)
          ? zoneId
          : state.activeExclusionZoneId,
    })),
  setDrawingTarget: (target) =>
    set((state) => ({
      drawingTarget: target,
      activeExclusionZoneId:
        target === 'boundary' ? null : state.activeExclusionZoneId,
    })),
  setWaypointDensityConfig: (config) =>
    set({
      waypointDensity: {
        ...config,
      },
    }),
  setWaypointDensityMode: (mode) =>
    set((state) => ({
      waypointDensity: {
        ...state.waypointDensity,
        mode,
      },
    })),
  setTargetWaypointCount: (count) =>
    set((state) => ({
      waypointDensity: {
        ...state.waypointDensity,
        targetCount: Math.max(1, Math.round(count)),
      },
    })),
  setTargetWaypointSpacing: (spacing) =>
    set((state) => ({
      waypointDensity: {
        ...state.waypointDensity,
        targetSpacing: Math.max(0.1, Math.round(spacing * 100) / 100),
      },
    })),
  enterSetup: () =>
    set({
      stage: 'setup',
      points: [],
      exclusionZones: [],
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      ...clearDerivedMissionState(),
    }),
  cancelSetup: () =>
    set({
      stage: 'idle',
      points: [],
      exclusionZones: [],
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      ...clearDerivedMissionState(),
    }),
  startDrawing: () =>
    set({
      stage: 'drawing',
      points: [],
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      ...clearDerivedMissionState(),
    }),
  cancelDrawing: () =>
    set((state) => {
      if (state.drawingTarget === 'exclusion') {
        const nextZones =
          state.activeExclusionZoneId === null
            ? state.exclusionZones
            : removeExclusionZoneById(state.exclusionZones, state.activeExclusionZoneId)

        return {
          stage: getDrawingCancelStage(state),
          exclusionZones: nextZones,
          activeExclusionZoneId: null,
          drawingTarget: 'boundary',
          ...clearDerivedMissionState(),
        }
      }

      return {
        stage: 'setup',
        points: [],
        exclusionZones: [],
        activeExclusionZoneId: null,
        drawingTarget: 'boundary',
        ...clearDerivedMissionState(),
      }
    }),
  closePolygon: () =>
    set((state) =>
      state.drawingTarget === 'exclusion'
        ? (() => {
            const activeZone = state.exclusionZones.find(
              (zone) => zone.id === state.activeExclusionZoneId,
            )

            if (!activeZone || activeZone.points.length < 3) {
              return state
            }

            return {
              stage: 'editing' as MissionStage,
              activeExclusionZoneId: null,
              drawingTarget: 'boundary' as DrawingTarget,
              ...clearDerivedMissionState(),
            }
          })()
        : state.points.length >= 3
          ? {
              stage: 'editing',
              activeExclusionZoneId: null,
              drawingTarget: 'boundary',
              ...clearDerivedMissionState(),
            }
          : state,
    ),
  generatePath: (mission, densityConfig) =>
    set((state) => ({
      stage: 'generated',
      generatedWaypointDensity: { ...densityConfig },
      generatedPatternId: mission.patternId,
      generatedPatternMeta: mission.meta,
      generatedSegments: mission.segments,
      generatedAnchorWaypoints: mission.anchorWaypoints,
      generatedPathSegments: mission.pathSegments,
      generatedClosed: mission.closed,
      waypoints: mission.waypoints,
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      selectedWaypointId: null,
      startWaypointId: mission.waypoints.some(
        (waypoint) => waypoint.id === state.startWaypointId,
      )
        ? state.startWaypointId
        : null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    })),
  editGeneratedPath: () =>
    set({
      stage: 'editing',
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      ...clearDerivedMissionState(),
    }),
  redrawMission: () =>
    set((state) => ({
      stage: 'drawing',
      points: [],
      activeExclusionZoneId: null,
      drawingTarget: 'boundary',
      exclusionZones: state.exclusionZones,
      ...clearDerivedMissionState(),
    })),
  resetMission: () =>
    set({
      ...initialState,
    }),
  addPoint: (x, y) =>
    set((state) => {
      if (state.drawingTarget === 'exclusion') {
        if (state.activeExclusionZoneId === null) {
          return state
        }

        return {
          exclusionZones: state.exclusionZones.map((zone) =>
            zone.id === state.activeExclusionZoneId
              ? {
                  ...zone,
                  points: [
                    ...zone.points,
                    { id: getNextEntityId(zone.points), x, y },
                  ],
                }
              : zone,
          ),
          ...clearDerivedMissionState(),
        }
      }

      return {
        points: [...state.points, { id: getNextEntityId(state.points), x, y }],
        ...clearDerivedMissionState(),
      }
    }),
  updatePoint: (id, x, y) =>
    set((state) => {
      if (state.drawingTarget === 'exclusion') {
        if (state.activeExclusionZoneId === null) {
          return state
        }

        return {
          exclusionZones: state.exclusionZones.map((zone) =>
            zone.id === state.activeExclusionZoneId
              ? {
                  ...zone,
                  points: zone.points.map((point) =>
                    point.id === id ? { ...point, x, y } : point,
                  ),
                }
              : zone,
          ),
          ...clearDerivedMissionState(),
        }
      }

      return {
        points: state.points.map((point) =>
          point.id === id ? { ...point, x, y } : point,
        ),
        ...clearDerivedMissionState(),
      }
    }),
  addExclusionPoint: (zoneId, x, y) =>
    set((state) => ({
      exclusionZones: state.exclusionZones.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              points: [
                ...zone.points,
                { id: getNextEntityId(zone.points), x, y },
              ],
            }
          : zone,
      ),
      ...clearDerivedMissionState(),
    })),
  updateExclusionPoint: (zoneId, pointId, x, y) =>
    set((state) => ({
      exclusionZones: state.exclusionZones.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              points: zone.points.map((point) =>
                point.id === pointId ? { ...point, x, y } : point,
              ),
            }
          : zone,
      ),
      ...clearDerivedMissionState(),
    })),
  closeExclusionZone: (zoneId) =>
    set((state) => {
      const zone = state.exclusionZones.find((entry) => entry.id === zoneId)

      if (!zone || zone.points.length < 3) {
        return state
      }

      return {
        stage: 'editing',
        activeExclusionZoneId: null,
        drawingTarget: 'boundary',
        ...clearDerivedMissionState(),
      }
    }),
  selectWaypoint: (id) => set({ selectedWaypointId: id }),
  setStartWaypoint: (id) => set({ startWaypointId: id }),
  setHoveredWaypoint: (id) => set({ hoveredWaypointId: id }),
  setBulkAssignActionType: (type) => set({ bulkAssignActionType: type }),
  addWaypointAction: (waypointId, type) =>
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) => {
        if (waypoint.id !== waypointId) {
          return waypoint
        }

        const nextActionId =
          waypoint.actions.reduce(
            (highest, action) => Math.max(highest, action.id),
            0,
          ) + 1

        return {
          ...waypoint,
          actions: [
            ...waypoint.actions,
            createDefaultWaypointAction(type, nextActionId),
          ],
        }
      }),
    })),
  duplicateWaypointAction: (waypointId, actionId) =>
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) => {
        if (waypoint.id !== waypointId) {
          return waypoint
        }

        const actionToDuplicate = waypoint.actions.find(
          (action) => action.id === actionId,
        )

        if (!actionToDuplicate) {
          return waypoint
        }

        const nextActionId =
          waypoint.actions.reduce(
            (highest, action) => Math.max(highest, action.id),
            0,
          ) + 1

        return {
          ...waypoint,
          actions: [
            ...waypoint.actions,
            cloneWaypointAction(actionToDuplicate, nextActionId),
          ],
        }
      }),
    })),
  applyWaypointActionToTargets: (sourceWaypointId, actionId, targetWaypointIds) =>
    set((state) => {
      const sourceWaypoint = state.waypoints.find(
        (waypoint) => waypoint.id === sourceWaypointId,
      )
      const sourceAction = sourceWaypoint?.actions.find(
        (action) => action.id === actionId,
      )

      if (!sourceAction) {
        return state
      }

      return {
        waypoints: state.waypoints.map((waypoint) => {
          if (!targetWaypointIds.includes(waypoint.id)) {
            return waypoint
          }

          const nextActionId =
            waypoint.actions.reduce(
              (highest, action) => Math.max(highest, action.id),
              0,
            ) + 1

          return {
            ...waypoint,
            actions: [
              ...waypoint.actions,
              cloneWaypointAction(sourceAction, nextActionId),
            ],
          }
        }),
      }
    }),
  updateWaypointAction: (waypointId, actionId, patch) =>
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) =>
        waypoint.id === waypointId
          ? {
              ...waypoint,
              actions: waypoint.actions.map((action) =>
                action.id === actionId ? patchWaypointAction(action, patch) : action,
              ),
            }
          : waypoint,
      ),
    })),
  removeWaypointAction: (waypointId, actionId) =>
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) =>
        waypoint.id === waypointId
          ? {
              ...waypoint,
              actions: waypoint.actions.filter((action) => action.id !== actionId),
            }
          : waypoint,
      ),
    })),
  moveWaypointAction: (waypointId, actionId, direction) =>
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) => {
        if (waypoint.id !== waypointId) {
          return waypoint
        }

        const currentIndex = waypoint.actions.findIndex((action) => action.id === actionId)

        if (currentIndex === -1) {
          return waypoint
        }

        const targetIndex =
          direction === 'up' ? currentIndex - 1 : currentIndex + 1

        if (targetIndex < 0 || targetIndex >= waypoint.actions.length) {
          return waypoint
        }

        const nextActions = [...waypoint.actions]
        const [movedAction] = nextActions.splice(currentIndex, 1)
        nextActions.splice(targetIndex, 0, movedAction)

        return {
          ...waypoint,
          actions: nextActions,
        }
      }),
    })),
}))
