import { create } from 'zustand'
import {
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
  points: MissionPoint[]
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  setOperationMode: (mode: OperationMode) => void
  setEditorTab: (tab: EditorTab) => void
  setScanAltitude: (value: number) => void
  setLineSpacing: (value: number) => void
  setOrientation: (value: number) => void
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
  addWaypointAction: (waypointId: number, type: MissionWaypointActionType) => void
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
  points: [] as MissionPoint[],
  waypoints: [] as MissionWaypoint[],
  selectedWaypointId: null as number | null,
}

export const useMissionStore = create<MissionState>((set) => ({
  ...initialState,
  setOperationMode: (mode) => set({ operationMode: mode }),
  setEditorTab: (tab) => set({ editorTab: tab }),
  setScanAltitude: (value) => set({ scanAltitude: value }),
  setLineSpacing: (value) => set({ lineSpacing: value }),
  setOrientation: (value) => set({ orientation: value }),
  enterSetup: () => set({ stage: 'setup', points: [], waypoints: [], selectedWaypointId: null }),
  cancelSetup: () => set({ stage: 'idle', points: [], waypoints: [], selectedWaypointId: null }),
  startDrawing: () => set({ stage: 'drawing', points: [], waypoints: [], selectedWaypointId: null }),
  cancelDrawing: () => set({ stage: 'setup', points: [], waypoints: [], selectedWaypointId: null }),
  closePolygon: () =>
    set((state) =>
      state.points.length >= 3
        ? { stage: 'editing', waypoints: [], selectedWaypointId: null }
        : state,
    ),
  generatePath: (waypoints) =>
    set({
      stage: 'generated',
      waypoints,
      selectedWaypointId: null,
    }),
  editGeneratedPath: () =>
    set({
      stage: 'editing',
      waypoints: [],
      selectedWaypointId: null,
    }),
  redrawMission: () => set({ stage: 'drawing', points: [], waypoints: [], selectedWaypointId: null }),
  resetMission: () =>
    set({
      ...initialState,
    }),
  addPoint: (x, y) =>
    set((state) => ({
      points: [...state.points, { id: state.points.length + 1, x, y }],
      waypoints: [],
      selectedWaypointId: null,
    })),
  updatePoint: (id, x, y) =>
    set((state) => ({
      points: state.points.map((point) =>
        point.id === id ? { ...point, x, y } : point,
      ),
      waypoints: [],
      selectedWaypointId: null,
    })),
  selectWaypoint: (id) => set({ selectedWaypointId: id }),
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
