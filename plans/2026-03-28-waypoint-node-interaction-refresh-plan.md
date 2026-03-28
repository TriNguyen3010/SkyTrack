# Waypoint Node Interaction — Refresh Plan

## Mục tiêu

- Đối chiếu lại [Waypoint_Node_Interaction_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_Node_Interaction_Spec.md) với code hiện tại.
- Chốt rõ phần nào của spec đã được build xong.
- Lập plan tiếp theo theo hướng thực tế: `verify -> polish -> deferred`, thay vì re-plan lại phần core đã hoàn thành.

## Source of truth

1. Spec gốc: [Waypoint_Node_Interaction_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_Node_Interaction_Spec.md)
2. Implementation plan gốc: [2026-03-27-waypoint-node-interaction-implementation-plan.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-waypoint-node-interaction-implementation-plan.md)
3. File này là plan refresh để triển khai phần còn lại.

## Kết luận sau khi đọc spec và đối chiếu code

### Đã hoàn thành

- `Stream A`: waypoint interaction foundation
- `Stream B`: quick action radial menu
- `Stream C`: bulk assign + viewport/sidebar sync
- `Stream D`: sidebar action panel upgrade
- `Stream E`: start node semantics + visual markers

### Nghĩa là gì

- Core flow của `Waypoint Node Interaction Spec` đã có trong app.
- Không cần lập lại plan để build từ đầu.
- Việc hợp lý tiếp theo là lập plan cho:
  - runtime verification
  - UX polish
  - deferred features
  - test coverage sâu hơn

## Trạng thái theo spec

### Đã có trong app

- right-click radial menu trên viewport
- quick add action trực tiếp từ waypoint
- `Shift + click` để vào bulk assign mode
- hover sync viewport ↔ sidebar
- `startWaypointId` ở mission level
- start/end semantics theo pattern
- `START` / `END` markers trên viewport
- duplicate / apply-to / reorder fallback / warnings trong sidebar

### Chưa nên coi là “done hoàn toàn”

- manual runtime verification toàn bộ edge cases
- touch / long-press support
- drag-and-drop reorder hoàn chỉnh
- altitude gradient line khi có `change_altitude`
- full virtualization/performance pass cho list waypoint dài
- integration tests cho radial menu / bulk assign / start node rotation

## Plan triển khai tiếp theo

### Phase 1 — Runtime Verification Sweep

#### Mục tiêu

Xác nhận phần core đã build thực sự match spec khi chạy thật.

#### Checklist

- verify radial menu:
  - open/close đúng
  - không xung đột OrbitControls
  - add action đúng waypoint
- verify bulk assign:
  - `Shift + click` vào radial action
  - banner hiển thị đúng
  - click nhiều waypoint liên tiếp
  - `Esc` / right-click thoát đúng
- verify viewport/sidebar sync:
  - hover sidebar row → waypoint glow
  - hover waypoint → sidebar reveal đúng row
- verify start node semantics:
  - `Coverage` chỉ đầu/cuối
  - `Perimeter` rotation đúng
  - `Orbit` rotation đúng
  - `Grid/Spiral/Corridor` không set start sai ở waypoint giữa

#### Done khi

- Không còn mismatch rõ ràng giữa spec và behavior runtime
- Mọi issue runtime được ghi thành bug list riêng nếu phát hiện

### Phase 2 — UX Polish Pass

#### Mục tiêu

Làm các flow đã có trở nên rõ ràng và ít ma sát hơn.

#### Scope

- polish radial menu positioning gần mép viewport
- polish bulk mode banner + exit affordance
- polish expanded waypoint card spacing / hierarchy
- refine `START` / `END` labels cho dễ đọc hơn
- refine warning copy trong sidebar

#### Done khi

- flow nhanh hơn, ít cần “đoán” hơn
- viewport feedback rõ hơn khi hover/select/bulk assign

### Phase 3 — Deferred Feature Backlog

#### Mục tiêu

Tách các hạng mục chưa build khỏi core flow để triển khai có thứ tự.

Status: completed. Deferred items are now tracked in [2026-03-28-waypoint-node-interaction-deferred-backlog.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-waypoint-node-interaction-deferred-backlog.md).

#### Backlog

- touch `long-press`
- drag-and-drop reorder hoàn chỉnh
- home position / approach semantics
- altitude gradient path line
- multi-segment / multi-drone interaction

#### Quy tắc

- không trộn backlog này vào core verification
- mỗi deferred item cần plan riêng trước khi code

### Phase 4 — Test Coverage

#### Mục tiêu

Thêm test để khóa behavior quan trọng của spec.

#### Scope

- unit tests cho `start node` policy matrix
- unit tests cho ordered mission waypoints
- integration tests cho:
  - radial quick add
  - bulk assign
  - start node rotation
  - warning semantics

#### Done khi

- các invariant quan trọng của spec có test bảo vệ

## Ưu tiên khuyến nghị

1. `Phase 1: Runtime Verification Sweep`
2. `Phase 2: UX Polish Pass`
3. `Phase 4: Test Coverage`
4. `Phase 3: Deferred Feature Backlog`

## Ghi chú thực thi

- Không re-implement lại `Stream A-E`; chúng đã có.
- File [2026-03-27-waypoint-node-interaction-implementation-plan.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-waypoint-node-interaction-implementation-plan.md) vẫn là nguồn đối chiếu implementation chính cho phần đã build.
- File này dùng để quyết định bước tiếp theo từ trạng thái hiện tại.
