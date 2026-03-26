# Phase 3 Node Actions

## 1. Mục tiêu

Hoàn tất phần còn thiếu của `Phase 3` bằng cách đưa `Node Actions` vào waypoint flow hiện tại.

## 2. Trạng thái hiện tại

- App đã có `Coverage Area Scan` end-to-end
- Generated state đã có waypoint list và waypoint selection
- `Vehicle Behavior` mới chỉ là danh sách inspect waypoint
- Waypoint model chưa có `actions[]`
- Viewport chưa có badge cho action

## 3. Scope triển khai trong lượt này

### 3.1. Data model

- Thêm `MissionWaypointAction`
- Thêm `actions[]` vào `MissionWaypoint`
- Tạo default action templates cho các loại action

### 3.2. UI

- Waypoint detail card trong sidebar generated state
- Danh sách action của waypoint đang chọn
- Add action
- Remove action
- Move up / move down
- Dynamic form tối thiểu theo action type

### 3.3. Viewport

- Thêm action badge / count badge trên waypoint
- Waypoint có action phải nhìn khác waypoint thường

### 3.4. State flow

- Có thể update action trên waypoint đã generate
- Selection waypoint vẫn giữ nguyên
- Sửa action không phá generated path hiện tại

## 4. Action types sẽ hỗ trợ

- `hover`
- `take_photo`
- `record_video`
- `drop_payload`
- `fire_suppress`
- `change_altitude`
- `set_gimbal`
- `trigger_sensor`

## 5. Dynamic params tối thiểu

- `hover`: `durationSec`
- `take_photo`: `burstCount`
- `record_video`: `durationSec`
- `drop_payload`: `payloadType`
- `fire_suppress`: `durationSec`
- `change_altitude`: `altitudeDelta`
- `set_gimbal`: `pitch`
- `trigger_sensor`: `sensorName`

## 6. Acceptance criteria

- [x] Mỗi waypoint có thể chứa nhiều action
- [x] Add action hoạt động với ít nhất 8 action types
- [x] Remove action hoạt động
- [x] Reorder action hoạt động
- [x] Dynamic params form cập nhật đúng vào state
- [x] Waypoint có action hiển thị badge trong viewport
- [ ] Generated flow hiện tại không bị vỡ
- [x] `pnpm build` pass
- [x] `pnpm lint` pass

## 7. Ghi chú triển khai

- Không đổi path generation ở lượt này
- Không làm simulation action playback ở lượt này
- Không làm import / export ở lượt này
- Ưu tiên UI rõ ràng và state ổn định hơn là làm form quá phức tạp
