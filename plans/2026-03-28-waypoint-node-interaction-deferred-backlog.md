# Waypoint Node Interaction — Deferred Backlog

## Mục tiêu

- Tách các hạng mục chưa làm của `Waypoint Node Interaction Spec` ra khỏi core flow đã ship.
- Giữ backlog rõ ràng để các lượt sau có thể pick từng phần độc lập mà không làm mờ scope hiện tại.

## Nguồn đối chiếu

- Spec gốc: [Waypoint_Node_Interaction_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Waypoint_Node_Interaction_Spec.md)
- Refresh plan: [2026-03-28-waypoint-node-interaction-refresh-plan.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-waypoint-node-interaction-refresh-plan.md)

## Deferred Items

### 1. Touch / Long-Press Support

#### Lý do deferred

- Hiện flow core đang bám desktop interaction (`left-click`, `right-click`, `Shift + click`).
- Touch cần model interaction khác hẳn: long-press threshold, drag cancel, viewport gesture conflict.

#### Scope tương lai

- long-press waypoint để mở radial menu
- tap ngoài để close
- touch-safe bulk assign gesture
- touch-safe start node affordance

### 2. Drag-and-Drop Action Reorder

#### Lý do deferred

- Hiện `move up / down` đã đủ để reorder an toàn.
- Drag-and-drop trong card expand dễ đụng:
  - nested scroll
  - focus management
  - apply-to panel
  - mobile/touch behavior

#### Scope tương lai

- drag handle cho action mini-card
- animated reorder
- keyboard-accessible reorder fallback

### 3. Altitude Gradient Path Line

#### Lý do deferred

- Đây là visual enhancement, không phải blocker cho start/action interaction core.
- Cần phối hợp với battery, safety overlays, selected route colors.

#### Scope tương lai

- segment có `change_altitude` hiển thị gradient màu
- legend hoặc tooltip giải thích tăng/giảm cao độ

### 4. Home Position / Approach / RTL Semantics

#### Lý do deferred

- Start node hiện đang là mission-level waypoint ordering.
- `home`, `approach leg`, `RTL` là layer mission semantics mới, tác động cả battery, export, simulation.

#### Scope tương lai

- home marker
- path `home -> start`
- `return to launch` semantics
- warning nếu start node không hợp lý với home point

### 5. Performance / Virtualized Waypoint List

#### Lý do deferred

- List waypoint hiện dùng DOM trực tiếp và đã đủ cho current prototype scope.
- Virtualization sẽ làm logic:
  - `scrollIntoView`
  - hover sync
  - inline expanded editor
  phức tạp hơn đáng kể.

#### Scope tương lai

- windowed list
- pinned expanded row
- stable hover/select sync với viewport

### 6. Multi-Segment / Multi-Drone Interaction

#### Lý do deferred

- Vượt scope của spec interaction v1.
- Cần data model mới cho mission segmentation.

#### Scope tương lai

- segment-level start node
- per-segment actions
- drone assignment
- cross-segment warnings

## Thứ tự ưu tiên đề xuất

1. Touch / long-press
2. Altitude gradient path line
3. Drag-and-drop reorder
4. Home / RTL semantics
5. Performance / virtualization
6. Multi-segment / multi-drone

## Quy tắc thực thi

- Mỗi item deferred cần một plan riêng trước khi code.
- Không kéo các item này vào core `waypoint interaction` commits nếu chưa được plan hóa.
- Nếu một item deferred bắt đầu chạm data model mission tổng quát, phải tách scope với `waypoint interaction` UI ngay từ đầu.
