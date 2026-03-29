# Waypoint Interaction UX Plan

## Mục tiêu

Chuẩn hóa UX tương tác với waypoint theo đúng flow sau:

1. `Bấm` để chọn waypoint
2. Khi waypoint `đã được chọn`, hover vào waypoint thì cursor đổi thành `bàn tay` để drag `X/Y`
3. Khi waypoint `đã được chọn`, hover vào khu vực trục `Z` thì cursor đổi thành `mũi tên lên/xuống` để drag `Z`
4. Bấm vào khoảng trống trong viewport để `deselect`

## Vấn đề hiện tại

### 1. Cursor drag đang bật quá sớm

File: `src/components/MissionViewport3D.tsx`

- Cursor hiện tại được quyết định chỉ bởi:
  - `hoveredWaypointSphereId !== null -> grab`
  - `hoveredWaypointStemId !== null -> ns-resize`
- Điều này nghĩa là user chỉ cần hover vào waypoint là đã thấy affordance drag, kể cả waypoint chưa được chọn.

### 2. Drag `X/Y` và drag `Z` cũng chưa gắn chặt với selection state

- `handleGeneratedWaypointSpherePointerDown(...)`
- `handleGeneratedWaypointStemPointerDown(...)`

Hiện các entry point này chủ yếu guard bằng:
- `inputLocked`
- `bulkAssignActionType`
- `waypointContextMenuVisible`
- drag state hiện tại

Nhưng chưa ép rule UX là:
- chỉ được drag khi waypoint đó đang là `selectedWaypointId`

### 3. Deselect blank space vừa được thêm nhưng cần coi là một phần của spec UX này

File: `src/components/MissionViewport3D.tsx`

- `Canvas.onPointerMissed` hiện đã được dùng để deselect khi click vào khoảng trống
- Cần xem đây là behavior chính thức trong flow tương tác waypoint

## Kỳ vọng UX

### Trạng thái `unselected`

- Hover waypoint:
  - không hiện cursor drag
  - chỉ là affordance quan sát / selectable
- Click waypoint:
  - waypoint được chọn

### Trạng thái `selected`

- Hover `sphere` của waypoint được chọn:
  - cursor = `grab`
  - pointer down -> drag `X/Y`
- Hover `stem` của waypoint được chọn:
  - cursor = `ns-resize`
  - pointer down -> drag `Z`

### Blank space

- Click khoảng trống:
  - clear `selectedWaypointId`
  - clear hover liên quan nếu cần

## Nguyên tắc tương tác

- `Select first, then manipulate`
- Không để user vô tình drag waypoint chưa chọn
- Selection phải là trạng thái rõ ràng trước khi bật affordance chỉnh sửa
- `Z drag` vẫn là affordance riêng, ưu tiên rõ ràng hơn `X/Y`

## Hướng triển khai

### Stream A. Selection-gated cursor model

- Chỉ cho `grab` khi:
  - `selectedWaypointId === hoveredWaypointSphereId`
- Chỉ cho `ns-resize` khi:
  - `selectedWaypointId === hoveredWaypointStemId`
- Hover waypoint chưa chọn:
  - cursor giữ mặc định

### Stream B. Selection-gated drag entry

- `handleGeneratedWaypointSpherePointerDown(...)`
  - chỉ bắt đầu drag `X/Y` nếu waypoint đang được chọn
- `handleGeneratedWaypointStemPointerDown(...)`
  - chỉ bắt đầu drag `Z` nếu waypoint đang được chọn
- Nếu waypoint chưa chọn:
  - pointer down không khởi động drag
  - click thường vẫn để chọn waypoint

### Stream C. Visual affordance cleanup

- Waypoint chưa chọn:
  - không glow như chế độ editable quá mạnh
- Waypoint đã chọn:
  - thể hiện rõ hơn khả năng chỉnh sửa
- Stem hover chỉ nhấn mạnh mạnh khi waypoint đang selected

### Stream D. Blank-space deselect integration

- Giữ behavior mới:
  - click blank space -> deselect
- Verify không conflict với:
  - drag `X/Y`
  - drag `Z`
  - radial menu
  - bulk assign
  - simulation overlay

### Stream E. Runtime verify

- Case 1:
  - waypoint chưa chọn -> hover -> không hiện `grab/ns-resize`
- Case 2:
  - click waypoint -> selected
  - hover sphere -> `grab`
  - drag `X/Y` hoạt động
- Case 3:
  - waypoint selected
  - hover stem -> `ns-resize`
  - drag `Z` hoạt động
- Case 4:
  - click khoảng trống -> deselect
- Case 5:
  - waypoint chưa chọn -> kéo thử trực tiếp -> không drag

## Acceptance Criteria

- Waypoint chỉ editable sau khi đã được chọn
- Hover trên waypoint chưa chọn không làm cursor đổi sang `grab`
- Hover trên stem của waypoint chưa chọn không làm cursor đổi sang `ns-resize`
- Click vào khoảng trống sẽ deselect waypoint
- Không làm vỡ:
  - radial menu
  - bulk assign
  - playback
  - density preview

## Ngoài phạm vi

- Không đổi logic multi-select
- Không thêm `double click to edit`
- Không thêm shortcut keyboard cho select/deselect

## Trạng thái

- [x] Phân tích current behavior
- [x] Chốt UX rules
- [x] Implement selection-gated interaction
- [ ] Verify runtime
