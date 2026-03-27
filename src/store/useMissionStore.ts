import { create } from 'zustand'
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

export interface MissionPoint {
  id: number
  x: number
  y: number
}

export interface MissionWaypoint {
  id: number
  x: number
  y: number
  z: number
  actions: MissionWaypointAction[]
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
  enterSetup: () => void
  cancelSetup: () => void
  startDrawing: () => void
  cancelDrawing: () => void
  closePolygon: () => void
  generatePath: (waypoints: MissionWaypoint[]) => void
  editGeneratedPath: () => void
  redrawMission: () => void
  resetMission: () => void
  addPoint: (x: number, y: number) => void
  updatePoint: (id: number, x: number, y: number) => void
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
  waypoints: [] as MissionWaypoint[],
  selectedWaypointId: null as number | null,
  startWaypointId: null as number | null,
  hoveredWaypointId: null as number | null,
  bulkAssignActionType: null as MissionWaypointActionType | null,
}

export const useMissionStore = create<MissionState>((set) => ({
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
  enterSetup: () =>
    set({
      stage: 'setup',
      points: [],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  cancelSetup: () =>
    set({
      stage: 'idle',
      points: [],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  startDrawing: () =>
    set({
      stage: 'drawing',
      points: [],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  cancelDrawing: () =>
    set({
      stage: 'setup',
      points: [],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  closePolygon: () =>
    set((state) =>
      state.points.length >= 3
        ? {
            stage: 'editing',
            waypoints: [],
            selectedWaypointId: null,
            startWaypointId: null,
            hoveredWaypointId: null,
            bulkAssignActionType: null,
          }
        : state,
    ),
  generatePath: (waypoints) =>
    set((state) => ({
      stage: 'generated',
      waypoints,
      selectedWaypointId: null,
      startWaypointId: waypoints.some(
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
      waypoints: [],
      selectedWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  redrawMission: () =>
    set({
      stage: 'drawing',
      points: [],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    }),
  resetMission: () =>
    set({
      ...initialState,
    }),
  addPoint: (x, y) =>
    set((state) => ({
      points: [...state.points, { id: state.points.length + 1, x, y }],
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    })),
  updatePoint: (id, x, y) =>
    set((state) => ({
      points: state.points.map((point) =>
        point.id === id ? { ...point, x, y } : point,
      ),
      waypoints: [],
      selectedWaypointId: null,
      startWaypointId: null,
      hoveredWaypointId: null,
      bulkAssignActionType: null,
    })),
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
