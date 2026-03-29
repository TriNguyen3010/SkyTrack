# Waypoint Tooltip Consolidation Plan

## Mục tiêu

Gom thông tin waypoint vào `tooltip` thay vì để rải ra nhiều badge riêng, với các quy tắc:

1. Ẩn chip `50m` màu tím vì thông tin này sẽ nằm trong tooltip
2. Tooltip phải có đủ `3 trục X / Y / Z`
3. Khi user đang chỉnh trục nào thì trục đó được `highlight`
4. Khi waypoint ở trạng thái `selected` thì tooltip được hiển thị

## Vấn đề hiện tại

### 1. Altitude đang bị tách đôi

File: `src/components/MissionViewport3D.tsx`

- `AltitudeBeacon` đang render chip `50m` phía trên drone/beacon
- `activeWaypointDragTooltip` lại render tooltip riêng khi đang drag

Kết quả:
- altitude xuất hiện ở một chip riêng
- drag info lại xuất hiện ở một hộp riêng
- thông tin bị chia nhỏ và dễ trùng lặp

### 2. Tooltip hiện chỉ tồn tại khi drag

File: `src/components/MissionViewport3D.tsx`

- `activeWaypointDragTooltip` hiện chỉ được dựng khi:
  - đang drag `X/Y`
  - hoặc đang drag `Z`

Nó chưa có state tooltip ổn định cho `selected waypoint`.

### 3. Tooltip hiện chưa có đủ 3 trục cùng lúc

Hiện tại:
- drag `X/Y` -> tooltip chỉ có `X`, `Y`
- drag `Z` -> tooltip chỉ có `Z`

Trong khi mong đợi mới là:
- tooltip luôn có `X / Y / Z`
- trục đang tương tác sẽ sáng lên

## Kỳ vọng UX

### Selected state

- Khi waypoint được chọn:
  - tooltip xuất hiện
  - tooltip hiển thị đủ:
    - `X`
    - `Y`
    - `Z`

### Drag state

- Khi đang drag `X/Y`:
  - tooltip vẫn là cùng một component
  - `X` và/hoặc `Y` là trục active
  - `Z` vẫn hiện nhưng không active

- Khi đang drag `Z`:
  - tooltip vẫn là cùng một component
  - `Z` active
  - `X`, `Y` vẫn hiện nhưng không active

### Altitude chip riêng

- `50m` tím ở beacon/waypoint layer phải được ẩn đi
- user đọc `Z` trong tooltip là đủ

## Hướng triển khai

### Stream A. Tách tooltip model mới

- Tạo một model tooltip thống nhất cho waypoint:
  - `selected tooltip`
  - `drag tooltip`
- Không còn chia thành:
  - selected state = không tooltip
  - drag state = tooltip riêng

Tooltip model mới nên có:
- `waypoint id`
- `mode`
- `lines: X / Y / Z`
- `activeAxes`
- `snap state`
- `clamp state`

### Stream B. Hiển thị tooltip ở selected state

- Nếu có `selectedWaypointId`:
  - render tooltip cho waypoint đó
- Nếu đang drag waypoint đó:
  - cùng tooltip này chuyển sang mode interactive

### Stream C. Gộp đủ 3 trục vào tooltip

- Tooltip luôn có 3 dòng:
  - `X`
  - `Y`
  - `Z`
- Nội dung mỗi dòng gồm:
  - current value
  - nếu đang drag thì có `from -> to`
  - delta nếu phù hợp

### Stream D. Highlight trục đang chỉnh

- Khi drag `X/Y`
  - highlight dòng `X` và `Y`
- Khi drag `Z`
  - highlight dòng `Z`
- Khi chỉ selected mà chưa drag:
  - cả 3 dòng ở trạng thái neutral

### Stream E. Ẩn altitude chip màu tím

- Tắt phần text `anchor.z m` trong `AltitudeBeacon`
- Giữ lại beacon/drone nếu cần cho context scene
- Không còn duplicated altitude display

### Stream F. Runtime verify

- waypoint selected -> tooltip hiện
- tooltip có đủ `X / Y / Z`
- drag `X/Y` -> `X`, `Y` sáng lên
- drag `Z` -> `Z` sáng lên
- `50m` tím không còn xuất hiện

## Đề xuất nội dung tooltip

### Selected

- Header: `WAYPOINT 18`
- Lines:
  - `X  89.7m`
  - `Y  42.4m`
  - `Z  50.0m`

### Drag X/Y

- Header: `WAYPOINT 18 · MOVE`
- Lines:
  - `X  89.7m -> 92.1m   +2.4m`
  - `Y  42.4m -> 41.0m   -1.4m`
  - `Z  50.0m`

### Drag Z

- Header: `WAYPOINT 18 · ALTITUDE`
- Lines:
  - `X  89.7m`
  - `Y  42.4m`
  - `Z  50.0m -> 60.0m   +10.0m`

## Acceptance Criteria

- Tooltip xuất hiện khi waypoint `selected`
- Tooltip luôn có đủ `X / Y / Z`
- Trục đang chỉnh được highlight rõ
- Chip `50m` tím bị ẩn
- Không làm vỡ:
  - `3-axis drag`
  - `select/deselect`
  - `right click radial menu`
  - `simulation overlay`

## Ngoài phạm vi

- Không redesign toàn bộ drone beacon
- Không thêm collapse/expand cho tooltip
- Không thêm copy-to-clipboard tọa độ

## Trạng thái

- [x] Audit current altitude + tooltip duplication
- [x] Chốt hướng gom tooltip
- [x] Implement unified waypoint tooltip
- [ ] Verify runtime
