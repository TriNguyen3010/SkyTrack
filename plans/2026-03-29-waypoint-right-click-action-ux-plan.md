# Waypoint Right-Click Action UX Plan

## Mục tiêu

Làm rõ UX khi waypoint đang ở trạng thái `selected`, đặc biệt để hệ thống phân biệt được:

- `left click` dùng cho `select / drag`
- `right click` dùng cho `action intent`

Mục tiêu là khi user bấm chuột phải vào waypoint, app phải hiểu đây là hành động mở/gán action cho waypoint, không bị lẫn với flow `select`, `drag`, hay `deselect`.

## Vấn đề hiện tại

### 1. Right click đã có behavior nhưng chưa được coi là rule UX rõ ràng

File: `src/components/MissionViewport3D.tsx`

- Waypoint group đang có `onContextMenu(...)`
- Handler này gọi `onWaypointContextMenu(...)`

File: `src/App.tsx`

- `handleWaypointContextMenu(...)` đang mở `waypointRadialMenu`
- Từ radial menu, user có thể:
  - quick add action
  - bật bulk assign
  - set start waypoint

Nghĩa là right-click hiện đã được dùng cho `action flow`, nhưng chưa được chuẩn hóa như một interaction rule riêng trong selected state.

### 2. Cần tránh xung đột với selection/drag

Hiện tại waypoint interaction đã có:

- left click để chọn
- selected rồi mới drag `X/Y`
- selected rồi mới drag `Z`
- click blank space để deselect

Cần đảm bảo khi user `right click`:

- không khởi động drag
- không bị hiểu là deselect
- không làm mất selected state ngoài ý muốn
- nếu right-click vào waypoint chưa chọn, cần quyết định rõ có tự chọn waypoint đó không

## Kỳ vọng UX

### Rule 1. Left click = Select / Manipulate

- Left click waypoint:
  - chọn waypoint
- Left click blank space:
  - deselect
- Left drag trên waypoint đã chọn:
  - drag `X/Y` hoặc `Z`

### Rule 2. Right click = Action

- Right click vào waypoint:
  - mở `Waypoint Action Radial Menu`
  - không bị hiểu là drag
  - không deselect

### Rule 3. Selected state phải được giữ ổn định

- Nếu waypoint đã selected và user right-click chính waypoint đó:
  - vẫn giữ selection
  - mở action menu

### Rule 4. Right-click vào waypoint chưa chọn

UX khuyến nghị:

- tự `select waypoint đó trước`
- rồi mở radial menu

Lý do:
- sidebar/action editor sẽ sync đúng đối tượng
- user thấy rõ “action đang gán cho waypoint nào”

## Hướng triển khai

### Stream A. Chốt gesture semantics

- Ghi rõ trong implementation:
  - `left button = selection/manipulation`
  - `right button = action intent`
- Tách semantics này ra khỏi logic drag hiện có

### Stream B. Ensure right-click preserves or updates selection

- Khi `onContextMenu` trên waypoint chạy:
  - nếu waypoint chưa selected -> select waypoint đó
  - nếu waypoint đã selected -> giữ nguyên selection
- Sau đó mới mở radial menu

### Stream C. Guard against drag/deselect conflicts

- Right click không được:
  - start `XY drag`
  - start `Z drag`
  - trigger blank-space deselect
- Nếu đang bulk assign:
  - right-click vẫn theo rule riêng đã có hoặc thoát bulk mode rõ ràng

### Stream D. Sidebar / radial consistency

- Radial menu và sidebar phải cùng trỏ về waypoint vừa right-click
- Không để selected waypoint và radial waypoint lệch nhau

### Stream E. Runtime verify

- Case 1:
  - waypoint đã selected -> right-click -> menu mở, selection giữ nguyên
- Case 2:
  - waypoint chưa selected -> right-click -> waypoint được chọn, menu mở
- Case 3:
  - sau right-click, left click blank space -> deselect như bình thường
- Case 4:
  - right-click không khởi động drag `X/Y`
- Case 5:
  - right-click lên stem cũng không khởi động drag `Z`

## Acceptance Criteria

- User có thể hiểu rõ:
  - `left click` để chọn/chỉnh waypoint
  - `right click` để gán action cho waypoint
- Right-click vào waypoint luôn mở đúng action menu
- Selection không bị mất ngoài ý muốn khi right-click
- Không phát sinh drag sai khi user bấm chuột phải
- Sidebar và radial menu luôn sync cùng waypoint mục tiêu

## Ngoài phạm vi

- Không đổi layout radial menu
- Không thêm keyboard shortcut cho action menu
- Không thêm long-press/touch fallback trong lượt này

## Trạng thái

- [x] Phân tích luồng chuột phải hiện tại
- [x] Chốt UX semantics
- [x] Implement right-click selection/action consistency
- [ ] Verify runtime
