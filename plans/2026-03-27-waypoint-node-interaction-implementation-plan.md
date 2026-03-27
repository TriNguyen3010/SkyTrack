# Waypoint Node Interaction Implementation Plan

## 1. Mục tiêu

Triển khai [Waypoint_Node_Interaction_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_Node_Interaction_Spec.md) theo hướng:

- giữ ổn định flow waypoint/action hiện tại đã có
- thêm `quick action` trực tiếp trên viewport trước, rồi mới mở rộng sang bulk tools
- formalize `start node` ở mission level, không nhét vào waypoint model
- tách rõ `core interaction`, `route semantics`, `visual feedback`, `deferred/future`

File này là plan đối chiếu chính cho mọi lượt implement liên quan tới waypoint node interaction.

## 2. Quy ước đối chiếu khi implement

Thứ tự ưu tiên:

1. [Waypoint_Node_Interaction_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_Node_Interaction_Spec.md) là spec UX và state flow gốc.
2. File này là `implementation source of truth` cho:
   - phần nào build ngay
   - phần nào deferred
   - cách map spec vào codebase hiện tại
3. [EXECUTION_PLAN.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/EXECUTION_PLAN.md) chỉ dùng để đối chiếu roadmap tổng.

Quy ước làm việc:

- Trước khi sửa code, kiểm tra file này để xác nhận hạng mục thuộc stream nào.
- Nếu spec gốc và code hiện tại lệch nhau, cập nhật file này trước rồi mới implement.
- Các hạng mục có dependency lớn như `Home position`, `multi-segment mission`, `touch long-press` sẽ được tách sang deferred backlog, không chặn core flow.

## 3. Trạng thái hiện tại

### 3.1. Đã có trong codebase

- `MissionWaypoint[]` trong store, `selectedWaypointId` dùng để chọn waypoint
- left-click waypoint trên viewport để select
- sidebar hiện `WaypointActionEditor`
- 8 action types đã có
- action stack đã có:
  - add
  - update
  - remove
  - move up/down
- waypoint có action đã có badge số lượng trên viewport
- validation cơ bản cho action config đã có

### 3.2. Chưa có

- radial menu trên viewport
- bulk assign mode
- hover sync viewport ↔ sidebar
- duplicate action
- apply action sang waypoint khác
- `startWaypointId` trong mission state
- constraint matrix theo pattern cho start node
- start marker / end marker / chevron direction flow
- altitude gradient line khi có `change_altitude`
- conflict warnings theo logic mission

## 4. Nguyên tắc triển khai

1. `Selection` hiện tại phải tiếp tục hoạt động như cũ.
2. `Left-click` giữ nguyên nghĩa: chọn waypoint.
3. `Right-click` mới thêm behavior mới, không phá OrbitControls và context menu browser.
4. `start node` là metadata cấp mission, không thêm cờ vào `MissionWaypoint`.
5. Không reorder vật lý `waypoints` array khi đổi start; dùng derived order cho render/export.
6. Với open path, chỉ cho đổi start theo constraint của spec; không cố support rotation mọi trường hợp.
7. Ưu tiên build `derived state + invariant` trước, rồi mới làm UI đẹp.

## 5. Mapping spec vào code hiện tại

### 5.1. Data model

Hiện store nằm ở [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts).

Cần thêm:

- `startWaypointId: number | null`
- `hoveredWaypointId: number | null`
- `bulkAssignActionType: MissionWaypointActionType | null`
- action helpers mới:
  - `setStartWaypoint(id | null)`
  - `setHoveredWaypoint(id | null)`
  - `duplicateWaypointAction(waypointId, actionId)`
  - `applyWaypointActionToTargets(sourceWaypointId, actionId, targetIds[])`
  - `appendWaypointAction(waypointId, type)` hoặc reuse `addWaypointAction`

### 5.2. Derived mission semantics

Hiện generated render vẫn đọc trực tiếp `waypoints`.

Cần thêm layer derived:

- `getWaypointInteractionModel(...)`
- `getOrderedMissionWaypoints(...)`
- `getStartNodePolicy(patternId)`
- `canSetStartWaypoint(patternId, waypointId, waypoints)`
- `getMissionEndWaypoint(...)`
- `getWaypointValidationWarnings(...)`

### 5.3. UI surfaces

- viewport: [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx)
- sidebar: [App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx)
- action model: [waypointActions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/waypointActions.ts)

## 6. Chia implementation thành 5 streams

### Stream A: Waypoint Interaction Foundation

Status: implemented, build/lint passed. Store now carries `startWaypointId`, `hoveredWaypointId`, and `bulkAssignActionType`; regenerate/reset flows clear invalid interaction state; waypoint ordering and start-node policy are now derived through a shared helper layer.

#### Scope

- thêm state mới vào store:
  - `startWaypointId`
  - `hoveredWaypointId`
  - `bulkAssignActionType`
- normalize reset behavior khi:
  - redraw
  - regenerate
  - reset mission
- thêm helper derived cho:
  - start node validity
  - ordered waypoints
  - open/closed pattern semantics
  - end node

#### Done khi

- store có đủ state để support start node + bulk assign
- regenerate không để state interaction treo
- `startWaypointId` invalid được fallback an toàn

### Stream B: Quick Action Radial Menu

#### Scope

- right-click waypoint mở radial menu theo screen-space
- disable native context menu trong viewport khi menu hoạt động
- click sector:
  - add default action
  - đóng menu
  - sidebar focus vào waypoint/action vừa thêm
- `Esc` / click outside để đóng
- indicator nếu waypoint đã có action type đó

#### Ghi chú triển khai

- render bằng portal trong `App.tsx`, không render trong Three scene
- waypoint 3D position cần project sang screen-space
- reuse logic anchor/viewport edge offset từ pattern picker nếu phù hợp

#### Done khi

- right-click waypoint không xoay camera
- add action từ viewport hoạt động ổn định
- left-click selection flow không bị ảnh hưởng

### Stream C: Bulk Assign + Viewport/Sidebar Sync

#### Scope

- `Shift + click` vào sector trong radial menu → vào bulk assign mode
- banner top viewport: action đang gán + cách thoát
- click waypoint trong bulk mode → add action ngay
- `Esc` / right-click để thoát
- hover sidebar row → waypoint glow
- hover waypoint viewport → sidebar scroll tới row tương ứng

#### Done khi

- bulk assign gán lặp được nhiều waypoint nhanh
- hover sync 2 chiều hoạt động, không gây jump khó chịu

### Stream D: Sidebar Action Panel Upgrade

#### Scope

- action cards giữ collapsed/expanded state
- duplicate action
- apply to selected waypoints / range
- drag-to-reorder hoặc fallback drag-handle UX rõ ràng
- conflict warnings:
  - `change_altitude` out of range
  - long dwell time
  - `drop_payload` mid-flight
  - duplicate action cùng config

#### Ghi chú

- code hiện đã có `moveWaypointAction`, nên reorder logic không phải blocker
- nếu drag-and-drop tốn nhiều integration, có thể ship `duplicate + apply to + warnings` trước, rồi drag thật sau

#### Done khi

- action panel bớt phụ thuộc vào dropdown flow cũ
- warning logic phản ánh đúng trên selected waypoint

### Stream E: Start Node Semantics + Visual Markers

#### Scope

- thêm UI set start:
  - radial menu center action hoặc context action
  - dropdown `Start Point` trong sidebar
- policy theo pattern:
  - `Coverage`: chỉ đầu/cuối, đổi start = reverse path
  - `Perimeter`: bất kỳ waypoint, circular rotation
  - `Orbit`: bất kỳ waypoint, circular rotation
  - `Spiral`: đầu/cuối
  - `Grid`: đầu/cuối
  - `Corridor`: đầu/cuối
- start/end markers trên viewport
- chevron flow direction trên path
- selected start row trong sidebar

#### Done khi

- user nhìn ra start node rõ ràng trên viewport và sidebar
- open path không cho set start bừa ở waypoint giữa
- closed path support rotation đúng semantics

## 7. Core vs Deferred

### Core build ngay

- `startWaypointId`
- radial menu add action
- bulk assign mode
- sidebar duplicate/apply-to/warnings
- start node dropdown
- start marker + ordered route semantics

### Deferred

- long-press touch support
- drag-and-drop reorder hoàn chỉnh nếu integration quá nặng
- Home position / approach distance
- launch line / RTL line
- multi-segment / multi-drone
- altitude gradient path line giữa 2 waypoint

## 8. Constraint matrix cần encode trong code

| Pattern | Start cho phép | Hành vi |
|---|---|---|
| Coverage | đầu hoặc cuối | reverse toàn bộ path |
| Perimeter | bất kỳ | circular rotation |
| Orbit / POI | bất kỳ | circular rotation |
| Spiral | đầu hoặc cuối | reverse direction |
| Grid | đầu hoặc cuối | reverse toàn bộ path |
| Corridor | đầu hoặc cuối | reverse toàn bộ path |

## 9. Edge cases bắt buộc xử lý

1. Regenerate path làm mất `startWaypointId` cũ → fallback về `null` và notice.
2. Chỉ có 1 waypoint → disable set start.
3. Open path chọn waypoint giữa → chặn và hiện notice.
4. Đổi start sau khi đã có actions → actions giữ nguyên trên waypoint id cũ.
5. Start waypoint có `change_altitude` nguy hiểm → warning riêng.
6. Bulk assign đang hoạt động mà user đổi stage/pattern → auto exit mode.

## 10. Thứ tự triển khai khuyến nghị

1. `Stream A`
2. `Stream B`
3. `Stream E` phần data semantics trước
4. `Stream C`
5. `Stream D`
6. `Stream E` phần visual polish còn lại

Lý do:

- phải chốt `start node` semantics trước khi render marker/hướng bay
- radial menu và bulk assign đem lại UX value lớn nhất sớm nhất
- sidebar polish nên làm sau khi input model đã ổn

## 11. Acceptance criteria tổng

- left-click vẫn chỉ select waypoint
- right-click waypoint mở radial menu đúng vị trí
- thêm action từ radial menu không làm mất selection state
- bulk assign có thể bắt đầu/kết thúc rõ ràng
- start node render đúng theo policy từng pattern
- regenerate path không làm app giữ state invalid
- sidebar và viewport sync đúng khi hover/select

## 12. Checklist đối chiếu

- [x] Stream A: Waypoint interaction foundation
- [ ] Stream B: Quick action radial menu
- [ ] Stream C: Bulk assign + viewport/sidebar sync
- [ ] Stream D: Sidebar action panel upgrade
- [ ] Stream E: Start node semantics + visual markers
- [ ] Dùng file này làm nguồn đối chiếu khi implement Waypoint Node Interaction Spec
