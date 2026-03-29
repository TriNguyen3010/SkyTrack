# Blank Space Waypoint Deselect Plan

## Mục tiêu

Cho phép user `deselect waypoint` khi bấm vào khoảng trống trong viewport, không bắt buộc phải bấm đúng vào altitude plane.

## Vấn đề hiện tại

- Ở `generated stage`, logic deselect hiện chỉ chạy khi click trúng `altitude plane`.
- Nếu user click vào phần trống của viewport nhưng ngoài mesh plane, hoặc click vào vùng overlay không phải UI control, waypoint vẫn giữ trạng thái selected.
- Điều này làm flow inspect waypoint bị "kẹt chọn", nhất là khi user muốn quay lại nhìn toàn path.

## Phân tích hiện trạng

### 1. Deselect hiện chỉ nằm trong `handleAltitudePlaneClick`

File: `src/components/MissionViewport3D.tsx`

- Trong `handleAltitudePlaneClick(...)`, nhánh `stage === 'generated'` đang gọi:
  - `onHoveredWaypointChange?.(null)`
  - `onSelectWaypoint(null)`
- Nghĩa là deselect chỉ xảy ra nếu pointer event đi vào đúng altitude plane mesh.

### 2. Viewport wrapper chưa có blank-space fallback

File: `src/App.tsx`

- `viewport-stage` hiện có `onContextMenu`, nhưng chưa có click fallback cho blank space.
- `MissionViewport3D` cũng chưa dùng `onPointerMissed` hoặc một cơ chế tương đương để bắt click ngoài object.

### 3. Cần tránh deselect sai lúc user đang tương tác

Các case không được deselect:

- đang drag waypoint `X/Y`
- đang drag waypoint `Z`
- đang mở `radial menu`
- đang ở `bulk assign mode`
- click vào `Flight Pattern Picker`
- click vào `Playback bar` hoặc các UI overlay khác

## Kỳ vọng hành vi

- Khi `generated stage` và có waypoint đang được chọn:
  - click vào khoảng trống trong viewport -> deselect waypoint
- Click vào object tương tác hợp lệ thì không deselect:
  - waypoint sphere
  - waypoint stem
  - radial menu
  - pattern picker
  - playback controls
- Trong `setup / drawing / editing` không thay đổi behavior hiện tại.

## Hướng triển khai

### Stream A. Audit interaction boundaries

- Xác định các lớp tương tác trong viewport:
  - Three.js scene objects
  - viewport overlay DOM
  - floating panels / menus
- Chốt nơi phù hợp nhất để đặt deselect fallback:
  - ưu tiên `MissionViewport3D`
  - fallback ở `viewport-stage` nếu cần

### Stream B. Add blank-space deselect hook

- Thêm cơ chế bắt click vào khoảng trống của scene:
  - ưu tiên `onPointerMissed`
  - hoặc canvas-level pointer up/click reconciliation nếu `onPointerMissed` không đủ ổn định
- Chỉ cho phép chạy ở:
  - `stage === 'generated'`
  - `selectedWaypointId !== null`

### Stream C. Guard against false deselect

- Không deselect nếu:
  - đang drag waypoint
  - đang mở radial menu
  - đang bulk assign
  - đang lock input / reveal animation
- Không deselect khi click vào overlay UI element bên trên viewport.

### Stream D. Sync hover + selection cleanup

- Khi deselect:
  - clear `selectedWaypointId`
  - clear `hoveredWaypointId` nếu phù hợp
  - không làm hỏng camera/simulation state

### Stream E. Verify runtime cases

- Test manual các case:
  - select waypoint -> click blank space -> deselect
  - select waypoint -> click plane -> deselect
  - select waypoint -> click radial menu -> vẫn giữ selection
  - drag waypoint -> thả chuột -> không bị deselect ngoài ý muốn
  - bulk assign active -> click blank space không gây side effect sai

## Acceptance Criteria

- User có thể click khoảng trống trong viewport để bỏ chọn waypoint.
- Không còn phụ thuộc vào việc click đúng altitude plane.
- Không deselect nhầm khi đang drag hoặc khi click vào overlay UI.
- Không làm vỡ các flow:
  - radial menu
  - bulk assign
  - simulation playback
  - pattern picker

## Ngoài phạm vi

- Không đổi selection behavior trong `editing stage`
- Không thêm multi-select
- Không thêm hotkey `Esc to deselect` trong lượt này

## Trạng thái

- [x] Phân tích nguyên nhân hiện tại
- [x] Chốt hướng fix
- [x] Implement blank-space deselect
- [ ] Verify runtime
