# Waypoint Info Cluster Cleanup Plan

## Mục tiêu

Dọn lại cụm thông tin quanh waypoint trong viewport để giảm rối và tăng khả năng đọc path.

Theo yêu cầu hiện tại:

### Ẩn các thông tin sau

1. `Numeric badge` của waypoint
2. `Stem + safety color` của waypoint
3. `Battery chip` dạng `WP 2 · ~99%`

### Đổi logic action badge

- bỏ `A1`, `A2`, ...
- thay bằng `action icons`
- mỗi action đã set thì có icon tương ứng
- nhiều action thì xếp `ngang`
- show tối đa `3 icon`
- nếu nhiều hơn, chi tiết xem ở `right panel`

## Phân tích hiện trạng

### 1. Numeric badge waypoint

File: `src/components/MissionViewport3D.tsx`

- Hiện đang render bằng `Billboard` với bubble tròn và text `waypoint.id`
- Đây là lớp `identity` lớn nhất và luôn hiện cho phần lớn generated waypoints

### 2. Stem + safety color

File: `src/components/MissionViewport3D.tsx`

- Mỗi waypoint hiện có:
  - line stem từ waypoint xuống ground
  - màu stem encode `safety`
  - inner core marker cũng encode safety
- Điều này làm cụm waypoint bị dày thông tin và khá “noisy”

### 3. Battery chip

File: `src/components/MissionViewport3D.tsx`

- Khi `hovered` hoặc `selected`, nếu có estimate thì render chip:
  - `WP {id} · ~{remainingPercent}%`
- Chip này hiện chồng thêm một lớp text lớn phía trên waypoint

### 4. Action count chip

File: `src/components/MissionViewport3D.tsx`

- Khi `actionCount > 0`, app render chip cam với text `A{actionCount}`
- Đây chỉ cho biết số lượng action, nhưng không cho biết action nào

## Kỳ vọng mới

### 1. Waypoint cluster tối giản hơn

Sau cleanup, cụm waypoint không còn các lớp sau:
- numeric bubble lớn
- stem line
- battery chip

Waypoint chỉ nên giữ:
- marker chính
- các semantics thật sự cần thiết như `START / END / PNR` nếu còn cần
- row icon action nếu waypoint có action

### 2. Action semantics phải cụ thể hơn

Thay vì `A1`, `A2`, waypoint cần cho user biết:
- action nào đang gắn trên waypoint

Ví dụ:
- `camera` cho `take_photo`
- `video`
- `package/drop`
- `hover/timer`
- `altitude`
- `gimbal`
- `sensor`
- `fire suppress`

### 3. Action icon row rules

- icon row bám gần waypoint marker
- hiển thị tối đa `3 icon`
- ưu tiên theo thứ tự action thực tế trong `waypoint.actions`
- không còn count chip riêng
- nếu waypoint có hơn 3 action:
  - viewport vẫn chỉ show `3 icon`
  - phần còn lại xem ở sidebar/right panel

## Quy ước hiển thị đề xuất

### Core waypoint

- giữ marker base đơn giản
- không có numeric badge nổi lớn

### Semantic badges giữ lại

- `START`
- `END`
- `PNR`

Các badge này vẫn có thể giữ vì mang meaning điều hướng, không phải noise vận hành.

### Action row

- nằm lệch cạnh waypoint
- `horizontal stack`
- icon nhỏ, đồng đều
- không dùng text label dài
- không dùng count chip nữa

## Hướng triển khai

### Stream A. Remove noisy waypoint overlays

- bỏ render `numeric badge`
- bỏ render `battery chip`
- bỏ render `stem line` và stem visual color layer trong generated state

Lưu ý:
- phần `Z drag hitbox` vẫn phải tồn tại nếu feature drag `Z` còn giữ
- nếu ẩn stem visual thì cần tách:
  - `visual stem` = ẩn
  - `interaction stem hitbox` = vẫn còn

### Stream B. Add action icon mapping

- tạo mapping từ `MissionWaypointActionType -> icon token`
- ưu tiên tái dùng icon set đang có trong app nếu hợp lý
- nếu không, tạo icon layer riêng cho viewport marker

Action types cần cover:
- `hover`
- `take_photo`
- `record_video`
- `drop_payload`
- `fire_suppress`
- `change_altitude`
- `set_gimbal`
- `trigger_sensor`

### Stream C. Render horizontal action icon row

- thay `A#` chip bằng row icon
- show tối đa `3`
- giữ thứ tự action trong `waypoint.actions`
- sizing riêng cho:
  - anchor waypoint
  - intermediate waypoint

### Stream D. Layout rebalance after cleanup

- chỉnh lại vị trí:
  - `START`
  - `END`
  - `PNR`
  - action row
- đảm bảo không đè vào marker chính
- tận dụng việc đã bỏ numeric badge và battery chip để tạo khoảng thở

### Stream E. Runtime verify

- waypoint không action:
  - marker sạch, không còn badge thừa
- waypoint có 1 action:
  - hiện đúng 1 icon
- waypoint có 2-3 action:
  - icon xếp ngang rõ ràng
- waypoint > 3 action:
  - viewport chỉ show 3 icon
  - right panel vẫn có đầy đủ action list
- `Z drag` vẫn dùng được nếu feature đó còn active

## Điểm cần lưu ý

### 1. Safety information sẽ mất khỏi waypoint cluster

Khi bỏ `stem + safety color` và bỏ battery chip, waypoint sẽ không còn thể hiện safety trực tiếp bằng marker như hiện nay.

Trong lượt này, mình hiểu yêu cầu là chấp nhận điều đó để ưu tiên readability.

### 2. Numeric identity sẽ giảm

Bỏ numeric badge nghĩa là user không còn thấy số waypoint lớn nổi ngay tại marker.

Nếu sau này vẫn cần nhận diện waypoint nhanh, có thể cân nhắc:
- chỉ show số khi selected
- hoặc show rất nhỏ trong marker

Nhưng lượt này chưa làm điều đó.

### 3. Action overflow

Yêu cầu hiện tại là:
- chỉ show tối đa 3 icon
- nhiều hơn thì xem right panel

Nên lượt này sẽ không thêm badge `+2` hay tooltip overflow, trừ khi phát sinh cần thiết sau verify.

## Acceptance Criteria

- Không còn `numeric badge` waypoint trong generated viewport
- Không còn `stem visual + safety color stem`
- Không còn `battery chip`
- `A#` chip được thay bằng `action icons`
- Action icons hiển thị tối đa `3`, xếp ngang, đủ đọc
- Waypoint có nhiều hơn `3` action vẫn xem đầy đủ ở right panel
- Không làm vỡ:
  - select/deselect waypoint
  - right click action menu
  - 3-axis drag interaction

## Ngoài phạm vi

- Không redesign toàn bộ marker shape
- Không thêm tooltip action detail trên icon row
- Không thêm overflow `+N`
- Không đổi right panel action editor

## Trạng thái

- [x] Chốt yêu cầu cleanup
- [x] Xác định các lớp thông tin cần bỏ / thay
- [x] Implement waypoint cluster cleanup
- [ ] Verify runtime
