import { create } from 'zustand'

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
      selectedWaypointId: waypoints[0]?.id ?? null,
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
}))
