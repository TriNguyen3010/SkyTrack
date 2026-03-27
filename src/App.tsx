import {
  Aperture,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardPlus,
  Code2,
  Flame,
  FlaskConical,
  Hexagon,
  Home,
  Layers,
  LayoutGrid,
  MousePointer2,
  MoveVertical,
  Package,
  PencilLine,
  Plane,
  Play,
  Plus,
  ScanSearch,
  Radar,
  Rocket,
  RotateCcw,
  Route,
  ScanLine,
  TimerReset,
  Trash2,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  MissionViewport3D,
  type WaypointContextMenuRequest,
  type ViewportAnimationState,
} from './components/MissionViewport3D'
import {
  buildFlightPatternMission,
  clampPatternParams,
  createInitialPatternParams,
  FLIGHT_PATTERN_OPTIONS,
  getFlightPatternDefinition,
  getFlightPatternOption,
  type FlightPatternMissionMeta,
  type FlightPatternId,
  type OrbitPatternParams,
  type PatternParamsMap,
} from './lib/flightPatterns'
import {
  WORLD_BOUNDS,
  canAppendPointToOpenPath,
  isSimplePolygon,
  polygonArea,
} from './lib/missionGeometry'
import {
  useMissionStore,
  type MissionPoint,
  type MissionWaypoint,
} from './store/useMissionStore'
import {
  WAYPOINT_ACTION_OPTIONS,
  getWaypointActionLabel,
  summarizeWaypointAction,
  validateWaypointAction,
  type MissionWaypointAction,
  type MissionWaypointActionType,
  type WaypointActionPatch,
} from './lib/waypointActions'
import {
  canSetStartWaypoint,
  deriveWaypointInteractionModel,
  getWaypointValidationWarnings,
  isBulkAssignActive,
} from './lib/waypointInteraction'
import './App.css'

const toolbarItems = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'shape', label: 'Shapes', icon: Hexagon },
  { id: 'select', label: 'Select', icon: MousePointer2 },
] as const

interface InteractionNotice {
  tone: 'warning' | 'danger'
  message: string
}

interface OverlayAnchor {
  x: number
  y: number
}

interface WaypointRadialMenuState {
  waypointId: number
  anchor: OverlayAnchor
}

function App() {
  const operationMode = useMissionStore((state) => state.operationMode)
  const editorTab = useMissionStore((state) => state.editorTab)
  const stage = useMissionStore((state) => state.stage)
  const scanAltitude = useMissionStore((state) => state.scanAltitude)
  const lineSpacing = useMissionStore((state) => state.lineSpacing)
  const orientation = useMissionStore((state) => state.orientation)
  const points = useMissionStore((state) => state.points)
  const waypoints = useMissionStore((state) => state.waypoints)
  const selectedWaypointId = useMissionStore((state) => state.selectedWaypointId)
  const startWaypointId = useMissionStore((state) => state.startWaypointId)
  const hoveredWaypointId = useMissionStore((state) => state.hoveredWaypointId)
  const bulkAssignActionType = useMissionStore((state) => state.bulkAssignActionType)
  const setOperationMode = useMissionStore((state) => state.setOperationMode)
  const setEditorTab = useMissionStore((state) => state.setEditorTab)
  const setScanAltitude = useMissionStore((state) => state.setScanAltitude)
  const setLineSpacing = useMissionStore((state) => state.setLineSpacing)
  const setOrientation = useMissionStore((state) => state.setOrientation)
  const enterSetup = useMissionStore((state) => state.enterSetup)
  const cancelSetup = useMissionStore((state) => state.cancelSetup)
  const startDrawing = useMissionStore((state) => state.startDrawing)
  const cancelDrawing = useMissionStore((state) => state.cancelDrawing)
  const closePolygon = useMissionStore((state) => state.closePolygon)
  const generateMissionPath = useMissionStore((state) => state.generatePath)
  const editGeneratedPath = useMissionStore((state) => state.editGeneratedPath)
  const redrawMission = useMissionStore((state) => state.redrawMission)
  const resetMission = useMissionStore((state) => state.resetMission)
  const addPoint = useMissionStore((state) => state.addPoint)
  const updatePoint = useMissionStore((state) => state.updatePoint)
  const selectWaypoint = useMissionStore((state) => state.selectWaypoint)
  const setStartWaypoint = useMissionStore((state) => state.setStartWaypoint)
  const setHoveredWaypoint = useMissionStore((state) => state.setHoveredWaypoint)
  const setBulkAssignActionType = useMissionStore(
    (state) => state.setBulkAssignActionType,
  )
  const addWaypointAction = useMissionStore((state) => state.addWaypointAction)
  const updateWaypointAction = useMissionStore((state) => state.updateWaypointAction)
  const removeWaypointAction = useMissionStore((state) => state.removeWaypointAction)
  const moveWaypointAction = useMissionStore((state) => state.moveWaypointAction)
  const [interactionNotice, setInteractionNotice] = useState<InteractionNotice | null>(null)
  const [isReadyToClose, setIsReadyToClose] = useState(false)
  const [pendingActionType, setPendingActionType] =
    useState<MissionWaypointActionType>('hover')
  const [selectedPattern, setSelectedPattern] =
    useState<FlightPatternId>('coverage')
  const [patternParamsByPattern, setPatternParamsByPattern] =
    useState<PatternParamsMap>(() =>
      createInitialPatternParams({
        scanAltitude,
        lineSpacing,
        orientation,
      }),
    )
  const [hoveredPattern, setHoveredPattern] = useState<FlightPatternId | null>(null)
  const [patternPickerVisible, setPatternPickerVisible] = useState(false)
  const [patternPickerAnchor, setPatternPickerAnchor] = useState<OverlayAnchor | null>(
    null,
  )
  const [waypointRadialMenu, setWaypointRadialMenu] =
    useState<WaypointRadialMenuState | null>(null)
  const [viewportAnimationState, setViewportAnimationState] =
    useState<ViewportAnimationState>('settled')
  const [skipAnimationToken, setSkipAnimationToken] = useState(0)
  const [actionEditorFocusToken, setActionEditorFocusToken] = useState(0)
  const [viewportStageSize, setViewportStageSize] = useState({
    width: 0,
    height: 0,
  })
  const patternPickerRef = useRef<HTMLDivElement | null>(null)
  const waypointRadialMenuRef = useRef<HTMLDivElement | null>(null)
  const waypointActionEditorRef = useRef<HTMLDivElement | null>(null)
  const behaviorListRef = useRef<HTMLDivElement | null>(null)
  const waypointRowRefs = useRef(new Map<number, HTMLButtonElement | null>())
  const viewportStageRef = useRef<HTMLDivElement | null>(null)
  const patternPickerDelayRef = useRef<number | null>(null)
  const selectedPatternOption = useMemo(
    () => getFlightPatternDefinition(selectedPattern),
    [selectedPattern],
  )
  const hoveredPatternOption = useMemo(
    () =>
      hoveredPattern ? getFlightPatternDefinition(hoveredPattern) : null,
    [hoveredPattern],
  )
  const isPolygonValid = useMemo(
    () => points.length >= 3 && isSimplePolygon(points),
    [points],
  )
  const activePreviewPattern = hoveredPattern ?? selectedPattern
  const activePatternParams = patternParamsByPattern[selectedPattern]
  const coverageParams = patternParamsByPattern.coverage
  const perimeterParams = patternParamsByPattern.perimeter
  const orbitParams = patternParamsByPattern.orbit
  const spiralParams = patternParamsByPattern.spiral
  const gridParams = patternParamsByPattern.grid
  const corridorParams = patternParamsByPattern.corridor
  const patternGenerationContext = useMemo(
    () => ({
      points,
      paramsByPattern: patternParamsByPattern,
    }),
    [patternParamsByPattern, points],
  )
  const activePreviewMission = useMemo(
    () =>
      (stage === 'editing' || stage === 'generated') && isPolygonValid
        ? buildFlightPatternMission(activePreviewPattern, patternGenerationContext)
        : null,
    [activePreviewPattern, isPolygonValid, patternGenerationContext, stage],
  )
  const selectedPatternMission = useMemo(
    () =>
      isPolygonValid
        ? buildFlightPatternMission(selectedPattern, patternGenerationContext)
        : null,
    [isPolygonValid, patternGenerationContext, selectedPattern],
  )
  const patternSegments = useMemo(
    () => activePreviewMission?.segments ?? [],
    [activePreviewMission],
  )
  const generatedWaypoints = useMemo(
    () => selectedPatternMission?.waypoints ?? [],
    [selectedPatternMission],
  )
  const selectedPatternMeta = selectedPatternMission?.meta ?? null
  const waypointInteractionModel = useMemo(
    () =>
      deriveWaypointInteractionModel({
        patternId: selectedPattern,
        waypoints,
        requestedStartWaypointId: startWaypointId,
      }),
    [selectedPattern, startWaypointId, waypoints],
  )
  const orderedWaypoints = waypointInteractionModel.orderedWaypoints
  const effectiveStartWaypointId = waypointInteractionModel.effectiveStartWaypointId
  const missionEndWaypointId = waypointInteractionModel.endWaypointId
  const isClosedMissionLoop = waypointInteractionModel.isClosedLoop
  const displayStartWaypointId = orderedWaypoints[0]?.id ?? null
  const displayEndWaypointId = isClosedMissionLoop
    ? displayStartWaypointId
    : missionEndWaypointId
  const area = useMemo(() => polygonArea(points), [points])
  const selectedWaypoint = useMemo(
    () => waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null,
    [selectedWaypointId, waypoints],
  )
  const selectedActionOption = useMemo(
    () =>
      WAYPOINT_ACTION_OPTIONS.find((option) => option.type === pendingActionType) ??
      WAYPOINT_ACTION_OPTIONS[0],
    [pendingActionType],
  )
  const totalWaypointActions = useMemo(
    () =>
      waypoints.reduce((total, waypoint) => total + waypoint.actions.length, 0),
    [waypoints],
  )
  const waypointsWithActions = useMemo(
    () => waypoints.filter((waypoint) => waypoint.actions.length > 0).length,
    [waypoints],
  )
  const selectedWaypointValidationMessages = useMemo(
    () => {
      if (!selectedWaypoint) {
        return []
      }

      return [
        ...selectedWaypoint.actions.flatMap((action) => validateWaypointAction(action)),
        ...getWaypointValidationWarnings({
          waypoint: selectedWaypoint,
          effectiveStartWaypointId,
        }),
      ]
    },
    [effectiveStartWaypointId, selectedWaypoint],
  )
  const activeNotice =
    interactionNotice && stage !== 'idle' ? interactionNotice : null

  const radialMenuWaypoint = useMemo(
    () =>
      waypointRadialMenu
        ? waypoints.find((waypoint) => waypoint.id === waypointRadialMenu.waypointId) ??
          null
        : null,
    [waypointRadialMenu, waypoints],
  )
  const radialMenuActionTypes = useMemo(
    () =>
      new Set(
        radialMenuWaypoint?.actions.map((action) => action.type) ?? [],
      ),
    [radialMenuWaypoint],
  )
  const bulkAssignActionLabel = bulkAssignActionType
    ? getWaypointActionLabel(bulkAssignActionType)
    : null
  const canRadialWaypointBeStart = useMemo(
    () =>
      radialMenuWaypoint
        ? canSetStartWaypoint(selectedPattern, radialMenuWaypoint.id, waypoints)
        : false,
    [radialMenuWaypoint, selectedPattern, waypoints],
  )
  const isRadialWaypointStart =
    radialMenuWaypoint !== null && radialMenuWaypoint.id === displayStartWaypointId
  const startWaypointOptions = useMemo(
    () =>
      getStartWaypointOptions({
        allowedStartWaypointIds: waypointInteractionModel.allowedStartWaypointIds,
        waypoints,
        isClosedLoop: isClosedMissionLoop,
      }),
    [
      isClosedMissionLoop,
      waypointInteractionModel.allowedStartWaypointIds,
      waypoints,
    ],
  )

  function dismissPatternPicker() {
    if (patternPickerDelayRef.current !== null) {
      window.clearTimeout(patternPickerDelayRef.current)
      patternPickerDelayRef.current = null
    }

    setPatternPickerVisible(false)
    setHoveredPattern(null)
  }

  function dismissWaypointRadialMenu() {
    setWaypointRadialMenu(null)
  }

  function requestSkipAnimation() {
    setSkipAnimationToken((current) => current + 1)
  }

  function schedulePatternPickerOpen() {
    if (patternPickerDelayRef.current !== null) {
      window.clearTimeout(patternPickerDelayRef.current)
    }

    patternPickerDelayRef.current = window.setTimeout(() => {
      setPatternPickerVisible(true)
      patternPickerDelayRef.current = null
    }, 200)
  }

  useEffect(() => {
    const viewportStage = viewportStageRef.current

    if (!viewportStage) {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setViewportStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(viewportStage)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!patternPickerVisible) {
      return undefined
    }

    const dismissTimer = window.setTimeout(() => {
      dismissPatternPicker()
    }, 8000)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismissPatternPicker()
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (patternPickerRef.current?.contains(event.target as Node)) {
        return
      }

      dismissPatternPicker()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.clearTimeout(dismissTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [patternPickerVisible])

  useEffect(() => {
    if (!waypointRadialMenu) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismissWaypointRadialMenu()
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (waypointRadialMenuRef.current?.contains(event.target as Node)) {
        return
      }

      dismissWaypointRadialMenu()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [waypointRadialMenu])

  useEffect(() => {
    return () => {
      if (patternPickerDelayRef.current !== null) {
        window.clearTimeout(patternPickerDelayRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (actionEditorFocusToken === 0 || stage !== 'generated') {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      waypointActionEditorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [actionEditorFocusToken, stage])

  useEffect(() => {
    if (stage !== 'generated') {
      if (hoveredWaypointId !== null) {
        setHoveredWaypoint(null)
      }

      if (isBulkAssignActive(bulkAssignActionType)) {
        setBulkAssignActionType(null)
      }

      if (waypointRadialMenu) {
        const frameId = window.requestAnimationFrame(() => {
          dismissWaypointRadialMenu()
        })

        return () => {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    return undefined
  }, [
    bulkAssignActionType,
    hoveredWaypointId,
    setBulkAssignActionType,
    setHoveredWaypoint,
    stage,
    waypointRadialMenu,
  ])

  useEffect(() => {
    if (waypointRadialMenu && !radialMenuWaypoint) {
      const frameId = window.requestAnimationFrame(() => {
        dismissWaypointRadialMenu()
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    return undefined
  }, [radialMenuWaypoint, waypointRadialMenu])

  useEffect(() => {
    if (!isBulkAssignActive(bulkAssignActionType)) {
      return undefined
    }

    setBulkAssignActionType(null)
    return undefined
  }, [bulkAssignActionType, selectedPattern, setBulkAssignActionType])

  useEffect(() => {
    if (!isBulkAssignActive(bulkAssignActionType)) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBulkAssignActionType(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [bulkAssignActionType, setBulkAssignActionType])

  useEffect(() => {
    if (stage !== 'generated' || hoveredWaypointId === null) {
      return undefined
    }

    const container = behaviorListRef.current
    const row = waypointRowRefs.current.get(hoveredWaypointId)

    if (!container || !row) {
      return undefined
    }

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const isAboveViewport = rowRect.top < containerRect.top + 8
    const isBelowViewport = rowRect.bottom > containerRect.bottom - 8

    if (!isAboveViewport && !isBelowViewport) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      row.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [hoveredWaypointId, stage])

  useEffect(() => {
    if (
      stage !== 'generated' ||
      startWaypointId === null ||
      !waypointInteractionModel.didFallbackToAutoStart
    ) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setStartWaypoint(null)
      setInteractionNotice({
        tone: 'warning',
        message:
          'Start point reset to Waypoint 1 because the previous start no longer exists or is not valid for this path.',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    setStartWaypoint,
    stage,
    startWaypointId,
    waypointInteractionModel.didFallbackToAutoStart,
  ])

  useEffect(() => {
    if (viewportAnimationState !== 'animating') {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') {
        return
      }

      event.preventDefault()
      requestSkipAnimation()
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [viewportAnimationState])

  useEffect(() => {
    if (scanAltitude !== activePatternParams.scanAltitude) {
      setScanAltitude(activePatternParams.scanAltitude)
    }

    if (
      (selectedPattern === 'coverage' || selectedPattern === 'grid') &&
      'lineSpacing' in activePatternParams &&
      lineSpacing !== activePatternParams.lineSpacing
    ) {
      setLineSpacing(activePatternParams.lineSpacing)
    }

    if (
      (selectedPattern === 'coverage' || selectedPattern === 'grid') &&
      'orientation' in activePatternParams &&
      orientation !== activePatternParams.orientation
    ) {
      setOrientation(activePatternParams.orientation)
    }
  }, [
    activePatternParams,
    lineSpacing,
    orientation,
    scanAltitude,
    selectedPattern,
    setLineSpacing,
    setOrientation,
    setScanAltitude,
  ])

  function clearInteractionNotice() {
    setInteractionNotice(null)
  }

  function updatePatternParams<K extends FlightPatternId>(
    patternId: K,
    patch: Partial<PatternParamsMap[K]>,
  ) {
    setPatternParamsByPattern((current) => {
      const nextParams = clampPatternParams(patternId, {
        ...current[patternId],
        ...patch,
      } as PatternParamsMap[K])

      return {
        ...current,
        [patternId]: nextParams,
      }
    })
  }

  function updateSelectedPatternScanAltitude(value: number) {
    switch (selectedPattern) {
      case 'coverage':
        updatePatternParams('coverage', { scanAltitude: value })
        break
      case 'perimeter':
        updatePatternParams('perimeter', { scanAltitude: value })
        break
      case 'orbit':
        updatePatternParams('orbit', { scanAltitude: value })
        break
      case 'spiral':
        updatePatternParams('spiral', { scanAltitude: value })
        break
      case 'grid':
        updatePatternParams('grid', { scanAltitude: value })
        break
      case 'corridor':
        updatePatternParams('corridor', { scanAltitude: value })
        break
    }
  }

  function handleAddPoint(x: number, y: number) {
    if (!canAppendPointToOpenPath(points, { x, y })) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Path cannot cross itself. Place the next point along the outer boundary.',
      })
      return
    }

    clearInteractionNotice()
    addPoint(x, y)
  }

  function handleUpdatePoint(id: number, x: number, y: number) {
    const candidate = points.map((point) => (point.id === id ? { ...point, x, y } : point))

    if (!isSimplePolygon(candidate)) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Polygon fill needs a simple boundary. This move would create crossing edges.',
      })
      return
    }

    clearInteractionNotice()
    updatePoint(id, x, y)
  }

  function handleClosePolygon() {
    if (!isPolygonValid) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Close the area with a non-crossing boundary before continuing.',
      })
      return
    }

    clearInteractionNotice()
    closePolygon()
    schedulePatternPickerOpen()
  }

  function handleGeneratePath() {
    if (!selectedPatternOption.implemented) {
      setInteractionNotice({
        tone: 'warning',
        message: `${selectedPatternOption.shortLabel} preview is available, but full generation is not built yet.`,
      })
      return
    }

    if (!isPolygonValid || generatedWaypoints.length === 0) {
      setInteractionNotice({
        tone: 'warning',
        message: 'Mission path is only available after the polygon boundary is valid.',
      })
      return
    }

    clearInteractionNotice()
    generateMissionPath(generatedWaypoints)
  }

  function handleResetMission() {
    dismissPatternPicker()
    dismissWaypointRadialMenu()
    clearInteractionNotice()
    setSelectedPattern('coverage')
    setPatternParamsByPattern(createInitialPatternParams())
    setPatternPickerAnchor(null)
    resetMission()
  }

  function handleRedrawMission() {
    dismissPatternPicker()
    dismissWaypointRadialMenu()
    clearInteractionNotice()
    redrawMission()
  }

  function handleSelectPattern(patternId: FlightPatternId) {
    const nextPattern = getFlightPatternOption(patternId)
    setSelectedPattern(patternId)
    setHoveredPattern(null)
    setPatternPickerVisible(false)
    setInteractionNotice(
      nextPattern.implemented
        ? null
        : {
            tone: 'warning',
            message: `${nextPattern.shortLabel} is wired for popup selection and preview, but generator logic is still pending.`,
          },
    )
  }

  function handleWaypointContextMenu({
    waypointId,
    clientX,
    clientY,
  }: WaypointContextMenuRequest) {
    const bounds = viewportStageRef.current?.getBoundingClientRect()

    if (!bounds) {
      return
    }

    setWaypointRadialMenu({
      waypointId,
      anchor: {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      },
    })
  }

  function handleQuickAddWaypointAction(
    type: MissionWaypointActionType,
    enableBulkAssign = false,
  ) {
    if (!radialMenuWaypoint) {
      return
    }

    if (enableBulkAssign) {
      clearInteractionNotice()
      setPendingActionType(type)
      setBulkAssignActionType(type)
      dismissWaypointRadialMenu()
      return
    }

    setPendingActionType(type)
    addWaypointAction(radialMenuWaypoint.id, type)
    selectWaypoint(radialMenuWaypoint.id)
    dismissWaypointRadialMenu()
    setActionEditorFocusToken((current) => current + 1)
  }

  function handleApplyBulkAssign(waypointId: number) {
    if (!bulkAssignActionType) {
      return
    }

    clearInteractionNotice()
    addWaypointAction(waypointId, bulkAssignActionType)
    setHoveredWaypoint(waypointId)
  }

  function handleSetStartWaypointSelection(
    waypointId: number | null,
    origin: 'sidebar' | 'radial',
  ) {
    if (waypointId === null) {
      clearInteractionNotice()
      setStartWaypoint(null)

      if (origin === 'radial') {
        dismissWaypointRadialMenu()
      }

      return
    }

    if (!canSetStartWaypoint(selectedPattern, waypointId, waypoints)) {
      setInteractionNotice({
        tone: 'warning',
        message: getBlockedStartWaypointMessage(isClosedMissionLoop),
      })

      if (origin === 'radial') {
        dismissWaypointRadialMenu()
      }

      return
    }

    clearInteractionNotice()
    setStartWaypoint(waypointId)
    selectWaypoint(waypointId)

    if (origin === 'radial') {
      dismissWaypointRadialMenu()
    }
  }

  function handleStartWaypointDropdownChange(value: string) {
    if (value === 'auto') {
      handleSetStartWaypointSelection(null, 'sidebar')
      return
    }

    const nextWaypointId = Number(value)

    if (Number.isNaN(nextWaypointId)) {
      return
    }

    handleSetStartWaypointSelection(nextWaypointId, 'sidebar')
  }

  const viewportHint = activeNotice?.message
    ? activeNotice.message
    : bulkAssignActionLabel
      ? `Bulk assign: ${bulkAssignActionLabel} · click waypoint to apply · Esc or right-click to exit`
    : viewportAnimationState === 'animating'
      ? 'Animating path preview · click or press Space to skip'
      : stage === 'setup'
      ? 'Tap highlighted altitude plane to place first point'
      : stage === 'drawing'
        ? stage === 'drawing' && isReadyToClose
          ? 'Click to close polygon'
          : 'Click first point to close polygon'
      : stage === 'editing'
          ? patternPickerVisible
            ? hoveredPatternOption
              ? `Previewing ${hoveredPatternOption.label}`
              : 'Choose a flight pattern for this region'
            : 'Click & drag points to adjust position'
          : stage === 'generated'
            ? 'Generated path ready · select waypoint to inspect'
            : null
  const patternPickerPosition = getPatternPickerPosition(
    patternPickerAnchor,
    viewportStageSize,
  )
  const waypointRadialMenuPosition = getWaypointRadialMenuPosition(
    waypointRadialMenu?.anchor ?? null,
    viewportStageSize,
  )
  const viewportHintClassName = `viewport-hint ${
    activeNotice
      ? `is-${activeNotice.tone}`
      : bulkAssignActionLabel
        ? 'is-bulk'
        : ''
  }`

  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <span className="breadcrumb-item">
            <Home size={14} strokeWidth={2.2} />
            Home
          </span>
          <ChevronRight size={14} />
          <span className="breadcrumb-item">Project</span>
          <ChevronRight size={14} />
          <span className="breadcrumb-item is-current">Mission</span>
        </nav>

        <div className="mode-switch" role="tablist" aria-label="Operation mode">
          <button
            type="button"
            className={`mode-pill ${operationMode === 'simulation' ? 'is-active' : ''}`}
            onClick={() => setOperationMode('simulation')}
          >
            <FlaskConical size={15} strokeWidth={2} />
            Simulation
          </button>
          <button
            type="button"
            className={`mode-pill ${operationMode === 'deployment' ? 'is-active' : ''}`}
            onClick={() => setOperationMode('deployment')}
          >
            <Rocket size={15} strokeWidth={2} />
            Deployment
          </button>
        </div>
      </header>

      <section className="status-banner">
        <strong>READY TO FLY</strong>
      </section>

      <section className="workspace">
        <section className="viewport-panel" aria-label="Mission viewport">
          <div
            ref={viewportStageRef}
            className={`viewport-stage ${
              stage === 'setup' || stage === 'drawing' ? 'is-drawing' : ''
            } ${stage === 'drawing' && isReadyToClose ? 'is-ready-to-close' : ''}`}
            onContextMenu={(event) => {
              if (isBulkAssignActive(bulkAssignActionType)) {
                event.preventDefault()
                setBulkAssignActionType(null)
                return
              }

              if (stage === 'generated' || waypointRadialMenu) {
                event.preventDefault()
              }
            }}
          >
            {viewportHint && (
              <div className={viewportHintClassName}>
                <span className="hint-dot" />
                {viewportHint}
              </div>
            )}

            <MissionViewport3D
              stage={stage}
              scanAltitude={scanAltitude}
              points={points}
              patternSegments={patternSegments}
              waypoints={orderedWaypoints}
              selectedWaypointId={selectedWaypointId}
              selectedPattern={selectedPattern}
              hoveredPattern={hoveredPattern}
              patternPickerVisible={patternPickerVisible}
              waypointContextMenuVisible={waypointRadialMenu !== null}
              hoveredWaypointId={hoveredWaypointId}
              bulkAssignActionType={bulkAssignActionType}
              skipAnimationToken={skipAnimationToken}
              onStartDrawing={startDrawing}
              onAddPoint={handleAddPoint}
              onUpdatePoint={handleUpdatePoint}
              onClosePolygon={handleClosePolygon}
              onSelectWaypoint={selectWaypoint}
              onBulkAssignWaypoint={handleApplyBulkAssign}
              onExitBulkAssign={() => setBulkAssignActionType(null)}
              onReadyToCloseChange={setIsReadyToClose}
              onPatternPickerAnchorChange={setPatternPickerAnchor}
              onAnimationStateChange={setViewportAnimationState}
              onHoveredWaypointChange={setHoveredWaypoint}
              onWaypointContextMenu={handleWaypointContextMenu}
            />

            {viewportAnimationState === 'animating' && (
              <button
                type="button"
                className="viewport-skip-overlay"
                onClick={requestSkipAnimation}
              >
                <span className="viewport-skip-chip">
                  Skip animation
                  <small>Click anywhere or press Space</small>
                </span>
              </button>
            )}

            {patternPickerVisible && patternPickerPosition && (
              <div
                ref={patternPickerRef}
                className={`pattern-picker ${
                  patternPickerPosition.placement === 'below' ? 'is-below' : ''
                }`}
                style={{
                  left: `${patternPickerPosition.left}px`,
                  top: `${patternPickerPosition.top}px`,
                }}
              >
                <div className="pattern-picker-header">
                  <strong>Choose Flight Pattern</strong>
                  <span>Pick a route style for the area you just closed.</span>
                </div>

                <div className="pattern-picker-list">
                  {FLIGHT_PATTERN_OPTIONS.map((pattern) => (
                    <button
                      key={pattern.id}
                      type="button"
                      className={`pattern-tile ${
                        selectedPattern === pattern.id ? 'is-selected' : ''
                      }`}
                      onMouseEnter={() => setHoveredPattern(pattern.id)}
                      onMouseLeave={() => setHoveredPattern((current) =>
                        current === pattern.id ? null : current,
                      )}
                      onClick={() => handleSelectPattern(pattern.id)}
                    >
                      <span
                        className="pattern-tile-glyph"
                        style={{ color: pattern.color }}
                      >
                        {getPatternGlyph(pattern.id)}
                      </span>
                      <span className="pattern-tile-copy">
                        <strong>{pattern.label}</strong>
                        <span>{pattern.description}</span>
                      </span>
                      <span className="pattern-tile-meta">
                        {!pattern.implemented && (
                          <span className="pattern-soon-chip">Preview</span>
                        )}
                        <ChevronRight size={14} strokeWidth={2.2} />
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="pattern-picker-footer"
                  onClick={dismissPatternPicker}
                >
                  Customize later in sidebar
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {waypointRadialMenu &&
              waypointRadialMenuPosition &&
              radialMenuWaypoint && (
                <div
                  ref={waypointRadialMenuRef}
                  className="waypoint-radial-menu"
                  style={{
                    left: `${waypointRadialMenuPosition.left}px`,
                    top: `${waypointRadialMenuPosition.top}px`,
                  }}
                >
                  <button
                    type="button"
                    className={`waypoint-radial-core ${
                      isRadialWaypointStart ? 'is-active' : ''
                    } ${!canRadialWaypointBeStart ? 'is-disabled' : ''}`}
                    onClick={() =>
                      handleSetStartWaypointSelection(radialMenuWaypoint.id, 'radial')
                    }
                    title={
                      canRadialWaypointBeStart
                        ? isClosedMissionLoop
                          ? 'Rotate mission loop to start from this waypoint'
                          : 'Use this endpoint as the mission start'
                        : getBlockedStartWaypointMessage(isClosedMissionLoop)
                    }
                  >
                    <strong>
                      {isRadialWaypointStart
                        ? `Start WP ${radialMenuWaypoint.id}`
                        : `WP ${radialMenuWaypoint.id}`}
                    </strong>
                    <span>
                      {isRadialWaypointStart
                        ? 'Mission entry'
                        : canRadialWaypointBeStart
                          ? isClosedMissionLoop
                            ? 'Set loop start'
                            : 'Set as start'
                          : 'Use path ends'}
                    </span>
                  </button>

                  {getWaypointRadialItems().map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className="waypoint-radial-item"
                      style={{
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                      }}
                      onClick={(event) =>
                        handleQuickAddWaypointAction(item.type, event.shiftKey)
                      }
                      title={item.description}
                    >
                      <span className="waypoint-radial-icon">
                        {renderWaypointActionIcon(item.type)}
                      </span>
                      <span className="waypoint-radial-label">{item.shortLabel}</span>
                      {radialMenuActionTypes.has(item.type) && (
                        <span className="waypoint-radial-dot" />
                      )}
                    </button>
                  ))}
                </div>
              )}

            <div className="viewport-toolbar" aria-label="Viewport tools">
              {toolbarItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`tool-button ${id === 'layers' ? 'is-active' : ''}`}
                  aria-label={label}
                >
                  <Icon size={16} strokeWidth={2.1} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="sidebar" aria-label="Mission controls">
          <div className="action-row">
            <button type="button" className="button button-secondary" onClick={handleResetMission}>
              <RotateCcw size={18} strokeWidth={2.2} />
              Reset
            </button>
            <button type="button" className="button button-primary">
              <Play size={18} strokeWidth={2.2} fill="currentColor" />
              Simulate
              <ChevronDown size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="mission-toggle">
            <span className="checkbox" aria-hidden="true" />
            <span>Building Mission</span>
          </div>

          <div className="editor-tabs" role="tablist" aria-label="Editor mode">
            <button
              type="button"
              className={`editor-tab ${editorTab === 'design' ? 'is-active' : ''}`}
              onClick={() => setEditorTab('design')}
            >
              <PencilLine size={14} strokeWidth={2.1} />
              Design
            </button>
            <button
              type="button"
              className={`editor-tab ${editorTab === 'code' ? 'is-active' : ''}`}
              onClick={() => setEditorTab('code')}
            >
              <Code2 size={14} strokeWidth={2.1} />
              Code
            </button>
            <button type="button" className="doc-button" aria-label="Add mission note">
              <ClipboardPlus size={14} strokeWidth={2.1} />
            </button>
          </div>

          <section className="panel-section">
            <header className="section-header">
              <div className="section-title">
                <Route size={15} strokeWidth={2.1} />
                <span>Path Plan</span>
              </div>
              <ChevronDown size={16} strokeWidth={2.1} />
            </header>

            {stage === 'idle' && (
              <div className="plan-card">
                <div className="plan-icon">
                  <Route size={18} strokeWidth={2.2} />
                </div>
                <div className="plan-copy">
                  <h2>{selectedPatternOption.shortLabel}</h2>
                  <p>{selectedPatternOption.description}</p>
                </div>
                <button type="button" className="inline-cta" onClick={enterSetup}>
                  Setup
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {stage === 'setup' && (
              <div className="setup-panel">
                <div className="setup-mode">
                  <span className="setup-dot" />
                  <span>{selectedPatternOption.shortLabel}</span>
                </div>

                <label className="field-label" htmlFor="scan-altitude">
                  Scan Altitude
                </label>

                <div className="slider-row">
                  <input
                    id="scan-altitude"
                    className="slider"
                    type="range"
                    min="20"
                    max="120"
                    step="1"
                    value={scanAltitude}
                    onChange={(event) => setScanAltitude(Number(event.target.value))}
                  />
                  <div className="slider-value">{scanAltitude}m</div>
                </div>

                <div className="button-row">
                  <button type="button" className="button button-cancel" onClick={cancelSetup}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-primary-small"
                    onClick={startDrawing}
                  >
                    Start Drawing
                  </button>
                </div>
              </div>
            )}

            {stage === 'drawing' && (
              <div className="drawing-panel">
                <div className="setup-mode">
                  <span className="setup-dot" />
                  <span>Drawing {selectedPatternOption.shortLabel}</span>
                </div>

                <div className="stat-strip">
                  <div className="stat-pill">Alt {scanAltitude}m</div>
                  <div className="stat-pill">Pts {points.length}</div>
                </div>

                <div className="hint-card">
                  <span className="hint-icon">✦</span>
                  {activeNotice?.message ??
                    (isReadyToClose
                      ? 'Click để đóng vùng'
                      : 'Click first point to close polygon')}
                </div>

                <button
                  type="button"
                  className="button button-danger"
                  onClick={cancelDrawing}
                >
                  Cancel Drawing
                </button>
              </div>
            )}

            {stage === 'editing' && (
              <div className="editing-panel">
                <div className="setup-mode">
                  <ScanLine size={16} strokeWidth={2.2} />
                  <span>{selectedPatternOption.shortLabel}</span>
                </div>

                <div className="summary-grid">
                  <div className="summary-card">
                    <span className="summary-label">Area</span>
                    <strong>~{Math.round(area)} m²</strong>
                  </div>
                  <div className="summary-card">
                    <span className="summary-label">Points</span>
                    <strong>{points.length}</strong>
                  </div>
                </div>

                {activeNotice && (
                  <div className="validation-card">
                    <span className="validation-card-dot" />
                    <span>{activeNotice.message}</span>
                  </div>
                )}

                <div className="vertices-card">
                  <div className="vertices-header">
                    <span>Vertices</span>
                    <small>drag in 3D to move</small>
                  </div>

                  <div className="vertices-list">
                    {points.map((point) => (
                      <VertexRow key={point.id} point={point} />
                    ))}
                  </div>
                </div>

                <SliderField
                  id="phase2-altitude"
                  label="Scan Altitude"
                  min={20}
                  max={200}
                  step={1}
                  value={activePatternParams.scanAltitude}
                  valueLabel={`${activePatternParams.scanAltitude}m`}
                  onChange={updateSelectedPatternScanAltitude}
                />

                {selectedPattern === 'coverage' ? (
                  <>
                    <SliderField
                      id="phase2-spacing"
                      label="Line Spacing"
                      min={5}
                      max={50}
                      step={1}
                      value={coverageParams.lineSpacing}
                      valueLabel={`${coverageParams.lineSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('coverage', { lineSpacing: value })
                      }
                    />

                    <SliderField
                      id="phase2-orientation"
                      label="Orientation"
                      min={-180}
                      max={180}
                      step={1}
                      value={coverageParams.orientation}
                      valueLabel={`${coverageParams.orientation}°`}
                      onChange={(value) =>
                        updatePatternParams('coverage', { orientation: value })
                      }
                    />
                  </>
                ) : selectedPattern === 'perimeter' ? (
                  <>
                    <SliderField
                      id="perimeter-inset"
                      label="Inset Distance"
                      min={0}
                      max={30}
                      step={1}
                      value={perimeterParams.insetDistance}
                      valueLabel={`${perimeterParams.insetDistance}m`}
                      onChange={(value) =>
                        updatePatternParams('perimeter', { insetDistance: value })
                      }
                    />

                    <SliderField
                      id="perimeter-loops"
                      label="Loops"
                      min={1}
                      max={5}
                      step={1}
                      value={perimeterParams.loops}
                      valueLabel={`${perimeterParams.loops}`}
                      onChange={(value) =>
                        updatePatternParams('perimeter', { loops: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={perimeterParams.direction}
                      onChange={(value) =>
                        updatePatternParams('perimeter', {
                          direction: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'orbit' ? (
                  <>
                    <SelectField
                      label="Center Mode"
                      value={orbitParams.centerMode}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          centerMode: value as OrbitPatternParams['centerMode'],
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto centroid' },
                        { value: 'manual', label: 'Manual X / Y' },
                      ]}
                    />

                    {orbitParams.centerMode === 'manual' && (
                      <PatternFieldGrid>
                        <NumberField
                          label="Center X"
                          value={orbitParams.manualCenter.x}
                          min={WORLD_BOUNDS.minX}
                          max={WORLD_BOUNDS.maxX}
                          step={1}
                          suffix="m"
                          onChange={(value) =>
                            updatePatternParams('orbit', {
                              manualCenter: {
                                ...orbitParams.manualCenter,
                                x: value,
                              },
                            })
                          }
                        />
                        <NumberField
                          label="Center Y"
                          value={orbitParams.manualCenter.y}
                          min={WORLD_BOUNDS.minY}
                          max={WORLD_BOUNDS.maxY}
                          step={1}
                          suffix="m"
                          onChange={(value) =>
                            updatePatternParams('orbit', {
                              manualCenter: {
                                ...orbitParams.manualCenter,
                                y: value,
                              },
                            })
                          }
                        />
                      </PatternFieldGrid>
                    )}

                    <SelectField
                      label="Radius Mode"
                      value={orbitParams.radiusMode}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          radiusMode: value as OrbitPatternParams['radiusMode'],
                        })
                      }
                      options={[
                        { value: 'auto-fit', label: 'Auto-fit polygon' },
                        { value: 'manual', label: 'Manual radius' },
                      ]}
                    />

                    {orbitParams.radiusMode === 'manual' && (
                      <SliderField
                        id="orbit-radius"
                        label="Radius"
                        min={10}
                        max={200}
                        step={1}
                        value={orbitParams.radius}
                        valueLabel={`${orbitParams.radius}m`}
                        onChange={(value) =>
                          updatePatternParams('orbit', { radius: value })
                        }
                      />
                    )}

                    <SliderField
                      id="orbit-waypoints"
                      label="Waypoint Count"
                      min={8}
                      max={72}
                      step={1}
                      value={orbitParams.waypointCount}
                      valueLabel={`${orbitParams.waypointCount}`}
                      onChange={(value) =>
                        updatePatternParams('orbit', { waypointCount: value })
                      }
                    />

                    <SliderField
                      id="orbit-loops"
                      label="Loops"
                      min={1}
                      max={5}
                      step={1}
                      value={orbitParams.loops}
                      valueLabel={`${orbitParams.loops}`}
                      onChange={(value) =>
                        updatePatternParams('orbit', { loops: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={orbitParams.direction}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          direction: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'grid' ? (
                  <>
                    <SliderField
                      id="grid-spacing"
                      label="Line Spacing"
                      min={5}
                      max={50}
                      step={1}
                      value={gridParams.lineSpacing}
                      valueLabel={`${gridParams.lineSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('grid', { lineSpacing: value })
                      }
                    />

                    <SliderField
                      id="grid-orientation"
                      label="Orientation"
                      min={-180}
                      max={180}
                      step={1}
                      value={gridParams.orientation}
                      valueLabel={`${gridParams.orientation}°`}
                      onChange={(value) =>
                        updatePatternParams('grid', { orientation: value })
                      }
                    />

                    <SliderField
                      id="grid-cross-angle"
                      label="Cross Angle"
                      min={45}
                      max={135}
                      step={1}
                      value={gridParams.crossAngle}
                      valueLabel={`${gridParams.crossAngle}°`}
                      onChange={(value) =>
                        updatePatternParams('grid', { crossAngle: value })
                      }
                    />
                  </>
                ) : selectedPattern === 'corridor' ? (
                  <>
                    <SliderField
                      id="corridor-passes"
                      label="Passes"
                      min={1}
                      max={5}
                      step={1}
                      value={corridorParams.passes}
                      valueLabel={`${corridorParams.passes}`}
                      onChange={(value) =>
                        updatePatternParams('corridor', { passes: value })
                      }
                    />

                    <SliderField
                      id="corridor-pass-spacing"
                      label="Pass Spacing"
                      min={5}
                      max={30}
                      step={1}
                      value={corridorParams.passSpacing}
                      valueLabel={`${corridorParams.passSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('corridor', { passSpacing: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={corridorParams.direction}
                      onChange={(value) =>
                        updatePatternParams('corridor', {
                          direction: value as 'auto' | 'reverse',
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'reverse', label: 'Reverse' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'spiral' ? (
                  <>
                    <SliderField
                      id="spiral-arm-spacing"
                      label="Arm Spacing"
                      min={5}
                      max={40}
                      step={1}
                      value={spiralParams.armSpacing}
                      valueLabel={`${spiralParams.armSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('spiral', { armSpacing: value })
                      }
                    />

                    <SelectField
                      label="Spiral Direction"
                      value={spiralParams.spiralDirection}
                      onChange={(value) =>
                        updatePatternParams('spiral', {
                          spiralDirection: value as 'inward' | 'outward',
                        })
                      }
                      options={[
                        { value: 'inward', label: 'Inward' },
                        { value: 'outward', label: 'Outward' },
                      ]}
                    />

                    <SelectField
                      label="Rotation Direction"
                      value={spiralParams.rotationDirection}
                      onChange={(value) =>
                        updatePatternParams('spiral', {
                          rotationDirection: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : (
                  <div className="pattern-preview-card">
                    <div className="pattern-preview-header">
                      <ScanSearch size={16} strokeWidth={2.2} />
                      <span>{selectedPatternOption.label} Preview</span>
                    </div>
                    <p>
                      This pattern can already be chosen from the popup and previewed
                      in the viewport. Full generator controls will land in the next
                      mode-expansion pass.
                    </p>
                  </div>
                )}

                <div className="button-row">
                  <button
                    type="button"
                    className="button button-cancel"
                    onClick={handleRedrawMission}
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-primary-small"
                    onClick={handleGeneratePath}
                    disabled={
                      !selectedPatternOption.implemented ||
                      generatedWaypoints.length === 0 ||
                      !isPolygonValid
                    }
                  >
                    Generate Path
                  </button>
                </div>
              </div>
            )}

            {stage === 'generated' && (
              <div className="generated-panel">
                <div className="generated-summary-card">
                  <div className="generated-summary-top">
                    <div className="setup-mode">
                      <ScanLine size={16} strokeWidth={2.2} />
                      <span>{selectedPatternOption.shortLabel}</span>
                    </div>
                    <button
                      type="button"
                      className="link-button"
                      onClick={editGeneratedPath}
                    >
                      Edit
                    </button>
                  </div>
                  <p className="generated-summary-meta">
                    {formatPatternGeneratedMeta({
                      patternId: selectedPattern,
                      scanAltitude,
                      lineSpacing,
                      orientation,
                      waypointCount: orderedWaypoints.length,
                      waypointsWithActions,
                      totalWaypointActions,
                      area,
                      meta: selectedPatternMeta,
                    })}
                  </p>
                  {orderedWaypoints.length > 0 && (
                    <div className="generated-route-order-note">
                      Start WP {displayStartWaypointId ?? orderedWaypoints[0].id} ·{' '}
                      {isClosedMissionLoop
                        ? 'Closed loop'
                        : `End WP ${missionEndWaypointId ?? '—'}`}
                    </div>
                  )}
                  {orderedWaypoints.length > 0 && (
                    <div className="generated-start-control">
                      <div className="generated-start-copy">
                        <strong>Start Point</strong>
                        <span>{getStartWaypointControlHelp(isClosedMissionLoop)}</span>
                      </div>
                      <select
                        className="generated-start-select"
                        value={startWaypointId === null ? 'auto' : `${startWaypointId}`}
                        onChange={(event) =>
                          handleStartWaypointDropdownChange(event.target.value)
                        }
                      >
                        <option value="auto">
                          Auto (
                          {displayStartWaypointId !== null
                            ? `WP ${displayStartWaypointId}`
                            : '—'}
                          )
                        </option>
                        {startWaypointOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedWaypoint && (
                    <div className="selected-waypoint-summary">
                      Selected WP {selectedWaypoint.id} · X{' '}
                      {formatWaypointCoordinate(selectedWaypoint.x)} · Y{' '}
                      {formatWaypointCoordinate(selectedWaypoint.y)} · Z{' '}
                      {formatWaypointCoordinate(selectedWaypoint.z)}m ·{' '}
                      {selectedWaypoint.actions.length} actions
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="panel-section">
            <header className="section-header">
              <div className="section-title section-title-muted">
                <Plane size={15} strokeWidth={2.1} />
                <span>
                  Vehicle Behavior{stage === 'generated' ? ` (${orderedWaypoints.length})` : ''}
                </span>
              </div>
              {stage === 'generated' ? (
                <button
                  type="button"
                  className="link-button link-button-subtle"
                  onClick={() => selectWaypoint(null)}
                >
                  Clear
                </button>
              ) : (
                <ChevronDown size={16} strokeWidth={2.1} />
              )}
            </header>

            {stage === 'generated' ? (
              <div ref={behaviorListRef} className="behavior-list">
                <div className="behavior-overview">
                  <div className="behavior-overview-icon">
                    <Route size={16} strokeWidth={2.2} />
                  </div>
                  <div className="behavior-overview-copy">
                    <strong>{selectedPatternOption.shortLabel}</strong>
                    <span>
                      {orderedWaypoints.length} waypoints · {waypointsWithActions} action nodes ·{' '}
                      {totalWaypointActions} actions
                    </span>
                  </div>
                </div>

                {orderedWaypoints.map((waypoint) => (
                  <WaypointBehaviorRow
                    key={waypoint.id}
                    waypoint={waypoint}
                    isSelected={selectedWaypointId === waypoint.id}
                    isHovered={hoveredWaypointId === waypoint.id}
                    isStartNode={displayStartWaypointId === waypoint.id}
                    isEndNode={
                      !isClosedMissionLoop && displayEndWaypointId === waypoint.id
                    }
                    isClosedLoop={isClosedMissionLoop}
                    onHoverChange={setHoveredWaypoint}
                    onRegisterRow={(node) => {
                      waypointRowRefs.current.set(waypoint.id, node)
                    }}
                    onSelect={selectWaypoint}
                  />
                ))}

                {selectedWaypoint ? (
                  <div ref={waypointActionEditorRef}>
                    <WaypointActionEditor
                      waypoint={selectedWaypoint}
                      validationMessages={selectedWaypointValidationMessages}
                      pendingActionType={pendingActionType}
                      selectedActionDescription={selectedActionOption.description}
                      onPendingActionTypeChange={setPendingActionType}
                      onAddAction={addWaypointAction}
                      onUpdateAction={updateWaypointAction}
                      onRemoveAction={removeWaypointAction}
                      onMoveAction={moveWaypointAction}
                    />
                  </div>
                ) : (
                  <div className="empty-action-state">
                    Select a waypoint to configure node actions.
                  </div>
                )}
              </div>
            ) : (
            <button type="button" className="button behavior-button">
                <Plus size={16} strokeWidth={2.2} />
                Add behavior
              </button>
            )}
          </section>
        </aside>
      </section>
    </main>
  )
}

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
}) {
  return (
    <div className="slider-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="slider-row">
        <input
          id={id}
          className="slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="slider-value">{valueLabel}</div>
      </div>
    </div>
  )
}

function PatternFieldGrid({ children }: { children: ReactNode }) {
  return <div className="pattern-field-grid">{children}</div>
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <select
        className="action-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <div className="action-input-wrap">
        <input
          className="action-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <span className="action-input-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

function VertexRow({ point }: { point: MissionPoint }) {
  return (
    <div className="vertex-row">
      <div className="vertex-badge">{point.id}</div>
      <div className="vertex-coordinate">
        <span className="coordinate-label coordinate-label-x">X</span>
        <span>{formatCoordinate(point.x)}</span>
      </div>
      <div className="vertex-coordinate">
        <span className="coordinate-label coordinate-label-y">Y</span>
        <span>{formatCoordinate(point.y)}</span>
      </div>
    </div>
  )
}

function WaypointBehaviorRow({
  waypoint,
  isSelected,
  isHovered,
  isStartNode,
  isEndNode,
  isClosedLoop,
  onHoverChange,
  onRegisterRow,
  onSelect,
}: {
  waypoint: MissionWaypoint
  isSelected: boolean
  isHovered: boolean
  isStartNode: boolean
  isEndNode: boolean
  isClosedLoop: boolean
  onHoverChange: (id: number | null) => void
  onRegisterRow: (node: HTMLButtonElement | null) => void
  onSelect: (id: number) => void
}) {
  const actionSummary = summarizeWaypointActionStack(waypoint.actions)

  return (
    <button
      ref={onRegisterRow}
      type="button"
      className={`waypoint-row ${isSelected ? 'is-selected' : ''} ${
        isHovered ? 'is-hovered' : ''
      } ${
        isStartNode ? 'is-start' : ''
      }`}
      onMouseEnter={() => onHoverChange(waypoint.id)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onSelect(waypoint.id)}
    >
      <div className="waypoint-row-top">
        <div className="waypoint-index">{waypoint.id}</div>
        <div className="waypoint-copy">
          <strong>Navigate to waypoint</strong>
          <div className="waypoint-row-meta">
            <span>{isSelected ? 'Selected in viewport' : 'Waypoint target'}</span>
            {isStartNode && (
              <span className="waypoint-status-pill is-start">
                {isClosedLoop ? 'Start / Return' : 'Start Node'}
              </span>
            )}
            {isEndNode && (
              <span className="waypoint-status-pill is-end">End Node</span>
            )}
            {waypoint.actions.length > 0 && (
              <span className="waypoint-action-pill">
                {waypoint.actions.length} action
                {waypoint.actions.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {actionSummary && <span className="waypoint-action-summary">{actionSummary}</span>}
        </div>
      </div>

      <div className="waypoint-coordinates">
        <CoordinatePill label="Location X" value={formatWaypointCoordinate(waypoint.x)} />
        <CoordinatePill label="Location Y" value={formatWaypointCoordinate(waypoint.y)} />
        <CoordinatePill label="Location Z" value={formatWaypointCoordinate(waypoint.z)} />
      </div>
    </button>
  )
}

function WaypointActionEditor({
  waypoint,
  validationMessages,
  pendingActionType,
  selectedActionDescription,
  onPendingActionTypeChange,
  onAddAction,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
}: {
  waypoint: MissionWaypoint
  validationMessages: string[]
  pendingActionType: MissionWaypointActionType
  selectedActionDescription: string
  onPendingActionTypeChange: (type: MissionWaypointActionType) => void
  onAddAction: (waypointId: number, type: MissionWaypointActionType) => void
  onUpdateAction: (
    waypointId: number,
    actionId: number,
    patch: WaypointActionPatch,
  ) => void
  onRemoveAction: (waypointId: number, actionId: number) => void
  onMoveAction: (
    waypointId: number,
    actionId: number,
    direction: 'up' | 'down',
  ) => void
}) {
  return (
    <div className="action-editor-card">
      <div className="action-editor-header">
        <div className="action-editor-copy">
          <strong>Waypoint {waypoint.id} Actions</strong>
          <span>Assign mission behaviors to this node.</span>
        </div>
        <div className="action-editor-count">
          {waypoint.actions.length} action{waypoint.actions.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="action-add-block">
        <label className="field-label" htmlFor="waypoint-action-type">
          Add Action
        </label>
        <div className="action-add-row">
          <select
            id="waypoint-action-type"
            className="action-select"
            value={pendingActionType}
            onChange={(event) =>
              onPendingActionTypeChange(event.target.value as MissionWaypointActionType)
            }
          >
            {WAYPOINT_ACTION_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button button-primary-small"
            onClick={() => onAddAction(waypoint.id, pendingActionType)}
          >
            <Plus size={14} strokeWidth={2.2} />
            Add
          </button>
        </div>
        <p className="action-add-help">{selectedActionDescription}</p>
      </div>

      <div
        className={`action-status-card ${
          validationMessages.length > 0 ? 'is-warning' : 'is-ready'
        }`}
      >
        <span className="action-status-dot" />
        <div className="action-status-copy">
          <strong>
            {validationMessages.length > 0
              ? 'Action config needs attention'
              : 'Action config ready'}
          </strong>
          <span>
            {validationMessages.length > 0
              ? validationMessages[0]
              : waypoint.actions.length > 0
                ? 'Selected waypoint is safe to carry into simulation and export flows later.'
                : 'Add actions here when this waypoint needs mission behavior.'}
          </span>
        </div>
      </div>

      {waypoint.actions.length > 0 ? (
        <div className="action-list">
          {waypoint.actions.map((action, index) => (
            <WaypointActionCard
              key={action.id}
              waypointId={waypoint.id}
              action={action}
              index={index}
              total={waypoint.actions.length}
              onUpdateAction={onUpdateAction}
              onRemoveAction={onRemoveAction}
              onMoveAction={onMoveAction}
            />
          ))}
        </div>
      ) : (
        <div className="empty-action-state is-inline">
          No actions yet. Add one to turn this waypoint into an execution node.
        </div>
      )}
    </div>
  )
}

function WaypointActionCard({
  waypointId,
  action,
  index,
  total,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
}: {
  waypointId: number
  action: MissionWaypointAction
  index: number
  total: number
  onUpdateAction: (
    waypointId: number,
    actionId: number,
    patch: WaypointActionPatch,
  ) => void
  onRemoveAction: (waypointId: number, actionId: number) => void
  onMoveAction: (
    waypointId: number,
    actionId: number,
    direction: 'up' | 'down',
  ) => void
}) {
  return (
    <div className="waypoint-action-card">
      <div className="waypoint-action-top">
        <div className="waypoint-action-heading">
          <div className="waypoint-action-index">{index + 1}</div>
          <div className="waypoint-action-copy">
            <strong>
              {renderWaypointActionIcon(action.type)}
              {getWaypointActionLabel(action.type)}
            </strong>
            <span>{summarizeWaypointAction(action)}</span>
          </div>
        </div>

        <div className="waypoint-action-controls">
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypointId, action.id, 'up')}
            disabled={index === 0}
            aria-label="Move action up"
          >
            <ArrowUp size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypointId, action.id, 'down')}
            disabled={index === total - 1}
            aria-label="Move action down"
          >
            <ArrowDown size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button is-danger"
            onClick={() => onRemoveAction(waypointId, action.id)}
            aria-label="Remove action"
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="waypoint-action-fields">
        {action.type === 'hover' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'take_photo' && (
          <ActionNumberField
            label="Burst Count"
            value={action.config.burstCount}
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { burstCount: value })
            }
          />
        )}

        {action.type === 'record_video' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'drop_payload' && (
          <ActionTextField
            label="Payload Type"
            value={action.config.payloadType}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { payloadType: value })
            }
          />
        )}

        {action.type === 'fire_suppress' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'change_altitude' && (
          <ActionNumberField
            label="Altitude Delta"
            value={action.config.altitudeDelta}
            suffix="m"
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { altitudeDelta: value })
            }
          />
        )}

        {action.type === 'set_gimbal' && (
          <ActionNumberField
            label="Pitch"
            value={action.config.pitch}
            suffix="deg"
            min={-90}
            max={30}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { pitch: value })
            }
          />
        )}

        {action.type === 'trigger_sensor' && (
          <ActionTextField
            label="Sensor Name"
            value={action.config.sensorName}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { sensorName: value })
            }
          />
        )}
      </div>
    </div>
  )
}

function ActionNumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  suffix?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <div className="action-input-wrap">
        <input
          className="action-input"
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(event) => {
            const nextValue = Number(event.target.value)

            if (!Number.isNaN(nextValue)) {
              onChange(nextValue)
            }
          }}
        />
        {suffix && <span className="action-input-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

function ActionTextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <input
        className="action-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function CoordinatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="coordinate-pill">
      <span>{label}</span>
      <strong>{value}m</strong>
    </div>
  )
}

function formatCoordinate(value: number): string {
  return `${Math.round(value * 10) / 10}`
}

function formatWaypointCoordinate(value: number): string {
  return value.toFixed(2)
}

function summarizeWaypointActionStack(actions: MissionWaypointAction[]): string | null {
  if (actions.length === 0) {
    return null
  }

  const firstAction = summarizeWaypointAction(actions[0])

  if (actions.length === 1) {
    return firstAction
  }

  return `${firstAction} +${actions.length - 1} more`
}

function getPatternGlyph(patternId: FlightPatternId): string {
  switch (patternId) {
    case 'coverage':
      return 'CV'
    case 'perimeter':
      return 'PM'
    case 'orbit':
      return 'OI'
    case 'spiral':
      return 'SP'
    case 'grid':
      return 'GD'
    case 'corridor':
      return 'CR'
  }
}

function formatPatternGeneratedMeta({
  patternId,
  scanAltitude,
  lineSpacing,
  orientation,
  waypointCount,
  waypointsWithActions,
  totalWaypointActions,
  area,
  meta,
}: {
  patternId: FlightPatternId
  scanAltitude: number
  lineSpacing: number
  orientation: number
  waypointCount: number
  waypointsWithActions: number
  totalWaypointActions: number
  area: number
  meta: FlightPatternMissionMeta | null
}): string {
  const sharedTail = `${waypointCount} pts · ${waypointsWithActions} action nodes · ${totalWaypointActions} actions · ~${Math.round(area)} m²`

  switch (patternId) {
    case 'coverage':
      return `Alt: ${scanAltitude}m · Spacing: ${lineSpacing}m · ${orientation}° · ${sharedTail}`
    case 'perimeter':
      return `Alt: ${scanAltitude}m · Boundary track · ${meta?.loops ?? 1} loop · ${meta?.direction ?? 'CW'} · ${sharedTail}`
    case 'orbit':
      return `Alt: ${scanAltitude}m · Auto center · Auto-fit radius · ${meta?.loops ?? 1} loop · ${meta?.direction ?? 'CW'} · ${sharedTail}`
    case 'spiral':
      return `Alt: ${scanAltitude}m · Inward spiral · ${meta?.direction ?? 'INWARD CW'} · ${sharedTail}`
    case 'grid':
      return `Alt: ${scanAltitude}m · Spacing: ${lineSpacing}m · ${orientation}° + 90° · ${meta?.direction ?? 'cross-hatch'} · ${sharedTail}`
    case 'corridor':
      return `Alt: ${scanAltitude}m · Center corridor · ${meta?.direction ?? 'AUTO'} · ${sharedTail}`
  }
}

function getPatternPickerPosition(
  anchor: OverlayAnchor | null,
  containerSize: { width: number; height: number },
): { left: number; top: number; placement: 'above' | 'below' } | null {
  if (!anchor || containerSize.width === 0 || containerSize.height === 0) {
    return null
  }

  const { width, height } = containerSize
  const popupWidth = 320
  const popupHeight = 372
  const margin = 18
  const left = clampValue(anchor.x, popupWidth / 2 + margin, width - popupWidth / 2 - margin)
  const preferBelow = anchor.y < 150

  if (preferBelow) {
    return {
      left,
      top: clampValue(anchor.y + 20, margin, height - popupHeight - margin),
      placement: 'below',
    }
  }

  return {
    left,
    top: clampValue(anchor.y - 20, popupHeight + margin, height - margin),
    placement: 'above',
  }
}

function getWaypointRadialMenuPosition(
  anchor: OverlayAnchor | null,
  containerSize: { width: number; height: number },
): { left: number; top: number } | null {
  if (!anchor || containerSize.width === 0 || containerSize.height === 0) {
    return null
  }

  const menuSize = 228
  const radius = menuSize / 2
  const margin = 18

  return {
    left: clampValue(anchor.x, radius + margin, containerSize.width - radius - margin),
    top: clampValue(
      anchor.y,
      radius + margin,
      containerSize.height - radius - margin,
    ),
  }
}

function getWaypointRadialItems(): Array<{
  type: MissionWaypointActionType
  shortLabel: string
  description: string
  x: number
  y: number
}> {
  const positionByType: Record<
    MissionWaypointActionType,
    { x: number; y: number; shortLabel: string }
  > = {
    take_photo: { x: 50, y: 10, shortLabel: 'Photo' },
    record_video: { x: 77, y: 23, shortLabel: 'Video' },
    drop_payload: { x: 90, y: 50, shortLabel: 'Drop' },
    fire_suppress: { x: 77, y: 77, shortLabel: 'Foam' },
    change_altitude: { x: 50, y: 90, shortLabel: 'Alt' },
    trigger_sensor: { x: 23, y: 77, shortLabel: 'Sensor' },
    set_gimbal: { x: 10, y: 50, shortLabel: 'Gimbal' },
    hover: { x: 23, y: 23, shortLabel: 'Hold' },
  }

  return WAYPOINT_ACTION_OPTIONS.map((option) => ({
    type: option.type,
    shortLabel: positionByType[option.type].shortLabel,
    description: option.description,
    x: positionByType[option.type].x,
    y: positionByType[option.type].y,
  }))
}

function getStartWaypointOptions({
  allowedStartWaypointIds,
  waypoints,
  isClosedLoop,
}: {
  allowedStartWaypointIds: number[]
  waypoints: MissionWaypoint[]
  isClosedLoop: boolean
}): Array<{ value: string; label: string }> {
  if (allowedStartWaypointIds.length === 0) {
    return []
  }

  const rawStartWaypointId = waypoints[0]?.id ?? null
  const rawEndWaypointId = waypoints[waypoints.length - 1]?.id ?? null

  return allowedStartWaypointIds.map((waypointId) => {
    if (isClosedLoop) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Rotate loop`,
      }
    }

    if (waypointId === rawStartWaypointId) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Forward path`,
      }
    }

    if (waypointId === rawEndWaypointId) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Reverse path`,
      }
    }

    return {
      value: `${waypointId}`,
      label: `WP ${waypointId}`,
    }
  })
}

function getStartWaypointControlHelp(isClosedLoop: boolean): string {
  return isClosedLoop
    ? 'Closed loops can rotate to start from any waypoint.'
    : 'Open paths can only start from either endpoint.'
}

function getBlockedStartWaypointMessage(isClosedLoop: boolean): string {
  return isClosedLoop
    ? 'This loop can rotate from any waypoint after generation.'
    : 'Only the first or last waypoint can become the mission start for this path.'
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function renderWaypointActionIcon(type: MissionWaypointActionType) {
  switch (type) {
    case 'hover':
      return <TimerReset size={15} strokeWidth={2.1} />
    case 'take_photo':
      return <Camera size={15} strokeWidth={2.1} />
    case 'record_video':
      return <Video size={15} strokeWidth={2.1} />
    case 'drop_payload':
      return <Package size={15} strokeWidth={2.1} />
    case 'fire_suppress':
      return <Flame size={15} strokeWidth={2.1} />
    case 'change_altitude':
      return <MoveVertical size={15} strokeWidth={2.1} />
    case 'set_gimbal':
      return <Aperture size={15} strokeWidth={2.1} />
    case 'trigger_sensor':
      return <Radar size={15} strokeWidth={2.1} />
  }
}

export default App
