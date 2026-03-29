# Waypoint 3-Axis Drag Control Implementation Plan

## Mục tiêu

Triển khai `Waypoint 3-Axis Drag Control` theo [Waypoint_3Axis_Drag_Control_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_3Axis_Drag_Control_Spec.md), để user có thể:

- kéo `sphere` của waypoint để đổi `X/Y`
- kéo `stem line` để đổi riêng `Z`
- thấy feedback realtime rõ ràng trên viewport và sidebar

## Hiện trạng code

### Đã có

- Drag `X/Y` cho polygon vertices ở `editing`:
  - drag state `draggingPointId` trong [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx)
  - pointermove raycast vào altitude plane và gọi `onUpdatePoint(...)`
- Waypoint `generated` đã có:
  - sphere render
  - stem render
  - hover/select/context menu
  - battery/safety/state overlays
- Sidebar đã sync live với selected waypoint và action editor

### Chưa có

- Không có drag `X/Y/Z` cho waypoint generated
- Stem hiện chỉ là visual line, không có hitbox interactive
- Không có tooltip live cho drag XY/Z
- Không có state riêng cho `draggingWaypointXY` / `draggingWaypointZ`
- Không có multi-select waypoint
- Không có undo/redo stack cho drag
- Không có scrub drag trong sidebar input

## Nhận định triển khai

Spec đầy đủ khá lớn. Nếu làm một mạch không chia nhịp sẽ đụng nhiều vùng:

- viewport interaction
- mission store
- sidebar sync
- camera/input lock
- action / start waypoint semantics
- density / battery / simulation side effects

Vì vậy nên tách thành `core v1` và `deferred`.

## Core v1 nên làm ngay

1. Drag `Z` cho waypoint generated qua stem hitbox
2. Drag `X/Y` cho waypoint generated qua sphere hitbox
3. Tooltip live cho XY/Z drag
4. Hover states + cursor states cho sphere/stem
5. Sidebar sync realtime khi drag
6. Clamp X/Y/Z
7. Ground shadow + stem highlight + path update realtime

## Deferred sau core v1

1. Multi-waypoint drag Z
2. Sidebar scrub drag
3. Undo/redo stack hoàn chỉnh
4. Touch fallback UI
5. Altitude ruler ticks chi tiết
6. Promote intermediate -> anchor theo threshold
7. Scroll-wheel fallback khi top-down

## Kiến trúc đề xuất

### Interaction state

Thêm local state trong `MissionViewport3D` hoặc tách helper hook:

- `hoveredWaypointSphereId`
- `hoveredWaypointStemId`
- `draggingWaypointXY`
- `draggingWaypointZ`
- `dragStartSnapshot`
- `dragTooltipState`

`draggingWaypointXY` và `draggingWaypointZ` phải loại trừ nhau.

### Store update path

Store hiện chưa có action update waypoint position trực tiếp. Cần thêm vào [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts):

- `updateWaypointPosition(waypointId, patch)`
- có clamp
- có giữ nguyên `actions`, `role`, `selectedWaypointId`, `startWaypointId`

### Side effects cần chú ý

Khi waypoint generated bị drag:

- battery report hiện tại có thể stale
- simulation path snapshot có thể stale
- density semantics có thể stale

Core v1 nên xử lý tối thiểu:

- generated mission vẫn hiển thị theo waypoint mới
- battery summary/viewport overlays recompute được từ waypoint mới
- không auto reset stage

## Streams triển khai

### Stream A: Store + data foundation

Mục tiêu:

- thêm action update waypoint generated
- thêm clamp helpers cho `X/Y/Z`
- tách utility cho drag snapshots

Việc làm:

- update [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts)
- có thể thêm helper trong `src/lib/`
- đảm bảo generated snapshot/update không làm vỡ `start waypoint`, `actions`, `battery`

Acceptance:

- có thể update `x/y/z` của 1 waypoint từ code path duy nhất
- selected waypoint không bị mất

### Stream B: Generated waypoint XY drag

Mục tiêu:

- cho phép drag sphere của waypoint generated để đổi `X/Y`

Việc làm:

- thêm pointer handlers cho sphere waypoint generated trong [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx)
- raycast lên altitude plane tại `waypoint.z`
- disable `OrbitControls` khi drag
- cursor `grab/grabbing`
- tooltip live:
  - `X old -> new`
  - `Y old -> new`

Acceptance:

- sphere drag chỉ đổi `X/Y`
- `Z` giữ nguyên
- path line và stem update realtime

### Stream C: Generated waypoint Z drag qua stem hitbox

Mục tiêu:

- cho phép drag altitude bằng stem line

Việc làm:

- thêm invisible hitbox quanh stem
- hitbox scale theo camera distance
- hover stem:
  - đổi màu `#3b82f6`
  - tăng opacity
  - cursor `ns-resize`
  - hiện indicator / altitude label
- drag stem:
  - dùng `clientY` delta -> `deltaMeters`
  - scale sensitivity theo camera distance
  - clamp `Z_MIN=5`, `Z_MAX=200`
- tooltip live cho `Z`
- ground shadow trong lúc drag

Acceptance:

- stem drag chỉ đổi `Z`
- `X/Y` giữ nguyên
- sphere lên/xuống realtime
- neighboring route segments update slope realtime

### Stream D: Sidebar sync + visual feedback polish

Mục tiêu:

- khi drag trên viewport, sidebar đổi theo ngay

Việc làm:

- sync `selectedWaypoint` panel realtime
- nếu drag một waypoint chưa selected trong generated, auto-select waypoint đó
- thêm hint/tooltip states
- warning khi chạm clamp

Acceptance:

- sidebar card hiển thị `X/Y/Z` mới khi đang drag
- không gây scroll jump

### Stream E: Edge cases + regression guard

Mục tiêu:

- chặn regress ở generated workflow

Việc làm:

- xử lý stem thấp quá bằng min hitbox height
- kiểm tra top-down hitbox behavior
- kiểm tra overlap stems
- test generated path sau drag
- verify:
  - waypoint actions còn nguyên
  - start/end semantics không vỡ
  - battery overlays không crash

Acceptance:

- drag XY/Z không làm crash generated stage
- không làm vỡ waypoint action editor
- không làm mất selected/start node bất ngờ

## Deferred backlog sau khi xong core

### Phase 2

- Multi-waypoint select
- Shift + click group selection
- group drag Z

### Phase 3

- Undo/redo stack cho drag
- Sidebar scrub drag

### Phase 4

- Touch fallback
- Scroll-wheel Z fallback khi top-down
- altitude ruler ticks nâng cao
- promote intermediate -> anchor

## File dự kiến chỉnh

- [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx)
- [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts)
- [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx)
- [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css)
- có thể thêm helper mới trong `src/lib/`

## Thứ tự khuyến nghị

1. `Stream A`
2. `Stream C`
3. `Stream B`
4. `Stream D`
5. `Stream E`

Lý do:

- `Z drag` là phần mới và có giá trị cao nhất của spec
- `XY drag generated` đụng semantics pattern nhiều hơn, nên nên làm sau khi có data/update path ổn định

## Acceptance Criteria tổng

- User có thể kéo sphere waypoint để đổi `X/Y`.
- User có thể kéo stem để đổi riêng `Z`.
- Hover states và cursor giúp user phân biệt rõ 2 vùng tương tác.
- Tooltip realtime giúp đọc delta dễ dàng.
- Generated path, sidebar, và selection state cập nhật ổn định.
- Không làm vỡ flight preview, battery overlays, hay waypoint action flow.

## Quy ước đối chiếu

- Spec gốc: [Waypoint_3Axis_Drag_Control_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_3Axis_Drag_Control_Spec.md)
- File này là nguồn đối chiếu implementation chính khi bắt đầu làm.

## Trạng thái

- Đã triển khai core theo các stream:
  - `Stream A`: store update path cho generated waypoint
  - `Stream B`: drag sphere để đổi `X/Y`
  - `Stream C`: drag stem để đổi `Z`
  - `Stream D`: sidebar summary/battery/selection sync realtime qua store
  - `Stream E`: clamp, min stem hitbox height, top-down hitbox scaling, regression test cho store path
- Đã có:
  - stem hitbox interactive
  - sphere hover/drag
  - XY/Z tooltip realtime
  - cursor `grab / grabbing / ns-resize`
  - ground shadow khi drag Z
  - generated route/stem/sphere update realtime
- Vẫn deferred đúng theo plan:
  - multi-waypoint drag
  - undo/redo stack
  - sidebar scrub drag
  - touch fallback
  - promote intermediate -> anchor
