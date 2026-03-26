# Phase 3 Generated Flow Stabilization

## 1. Mục tiêu

Ổn định `generated mission flow` sau khi đã thêm `Node Actions`, để có thể xem `Phase 3` là hoàn tất về mặt state và runtime behavior.

## 2. Gaps hiện tại

- `Node Actions` đã có editor nhưng validation còn mỏng
- Action params có thể nhận giá trị không đẹp hoặc không an toàn
- Generated flow chưa có status UI rõ ràng để biết action state đã ổn chưa
- Cần làm rõ mission behavior summary cho waypoint có action

## 3. Scope triển khai trong lượt này

### 3.1. Validation + sanitization

- Clamp các numeric fields về range hợp lý
- Normalize các string fields để tránh blank values
- Giữ `updateWaypointAction` an toàn khi user nhập nhanh

### 3.2. Generated flow polish

- Thêm summary rõ hơn cho waypoint có action
- Thêm validation/status card cho waypoint đang chọn
- Làm behavior list dễ scan hơn

### 3.3. State safety

- Không để action config rơi vào state invalid
- Không làm mất selection khi cập nhật action
- Không làm vỡ generated flow hiện tại

## 4. Acceptance criteria

- [x] Numeric action params được clamp hợp lý
- [x] Text action params không lưu blank string
- [x] Waypoint đang chọn có status card rõ ràng
- [x] Behavior list hiển thị summary tốt hơn cho waypoint có action
- [x] Generated flow sau Node Actions vẫn pass `pnpm build`
- [x] Generated flow sau Node Actions vẫn pass `pnpm lint`

## 5. Ghi chú

- Không mở rộng sang mode mới ở lượt này
- Không làm simulation playback ở lượt này
- Không mở `Phase 5`
