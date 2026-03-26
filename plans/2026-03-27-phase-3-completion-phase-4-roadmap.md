# Phase 3 Completion + Phase 4 Roadmap

## 1. Mục tiêu

Gộp 4 hướng tiếp theo thành một roadmap rõ ràng để đối chiếu khi triển khai:

1. Hoàn tất `Phase 3` còn dang dở
2. Chốt `Phase 4` theo đúng `Drone_Mission_Planner_Plan.docx`
3. Xây `mode expansion roadmap`
4. Tạo `export + simulation backlog`

## 2. Căn cứ từ tài liệu gốc

Theo `Drone_Mission_Planner_Plan.docx`, roadmap chuẩn là:

- `Phase 1`: Core Foundation
- `Phase 2`: `Perimeter Scan`, `Waypoint Navigation`, `Orbit / POI`
- `Phase 3`: `Node Actions`
- `Phase 4`: `Spiral Scan`, `Grid Scan`, `Corridor Scan`, `Simulation engine`, `Export JSON / MAVLink / KML`
- `Phase 5`: Polish

## 3. Mapping với trạng thái code hiện tại

### 3.1. Theo execution plan nội bộ

- `Phase 1`: đã build
- `Phase 2`: đã build
- `Phase 3`: mới build một phần

### 3.2. Theo phase trong doc gốc

- `Doc Phase 1`: đã có nền chính
- `Doc Phase 2`: chưa build các mode `Perimeter / Waypoint / Orbit`
- `Doc Phase 3`: chưa build `Node Actions` đầy đủ
- `Doc Phase 4`: chưa bắt đầu

## 4. Phase 3 Completion

### 4.1. Mục tiêu

Hoàn tất hệ thống `Node Actions` trên waypoint để mission không chỉ có path mà còn có execution behavior.

### 4.2. Scope bắt buộc

- Thêm `actions[]` vào model của waypoint
- Action types tối thiểu:
  - `hover`
  - `take_photo`
  - `record_video`
  - `drop_payload`
  - `fire_suppress`
  - `change_altitude`
  - `set_gimbal`
  - `trigger_sensor`
- Waypoint detail panel
- Add / remove / reorder actions
- Dynamic form theo action type
- Badge / icon action trên waypoint trong viewport
- Validation theo action schema
- Serialize actions vào mission state

### 4.3. Acceptance criteria

- Chọn một waypoint thì mở được panel chi tiết
- Có thể gán nhiều action cho cùng một waypoint
- Reorder action không làm mất dữ liệu
- Waypoint có action được đánh dấu rõ trên 3D viewport
- Generated mission state chứa được cả `path + actions`

## 5. Phase 4

### 5.1. Mục tiêu

Mở rộng planner từ một mode coverage sang mission planner nhiều mode, có playback và export thực dụng.

### 5.2. Scope theo doc

- `Spiral Scan`
- `Grid Scan`
- `Corridor Scan`
- `Simulation engine`
- `Export JSON / MAVLink / KML`

### 5.3. Dependencies

- Hoàn tất `mode registry`
- Hoàn tất `Node Actions`
- Chốt mission schema ổn định
- Chốt mapping giữa world coordinates và export coordinates

### 5.4. Acceptance criteria

- User đổi sang `Spiral / Grid / Corridor` và generate được path riêng
- Có playback cơ bản cho drone theo route
- Xuất được `JSON` nội bộ
- Có adapter hoặc schema mapping rõ cho `MAVLink` và `KML`

## 6. Mode Expansion Roadmap

### 6.1. Mục tiêu

Lấp khoảng trống giữa code hiện tại và mode matrix trong doc.

### 6.2. Shared foundation cần làm trước

- Tạo `mode registry`
- Tách `generator`, `params schema`, `renderer config` cho từng mode
- Tách `coverage-only logic` ra khỏi app shell
- Chuẩn hóa color token theo từng mode

### 6.3. Thứ tự đề xuất

1. `Perimeter Scan`
2. `Waypoint Navigation`
3. `Orbit / POI`
4. `Spiral Scan`
5. `Grid Scan`
6. `Corridor Scan`

### 6.4. Lý do ưu tiên

- `Perimeter` và `Waypoint` bù ngay phần thiếu của `Doc Phase 2`
- `Orbit / POI` giúp kiểm chứng kiến trúc mode registry trước khi sang nhóm mode hình học phức tạp hơn
- `Spiral / Grid / Corridor` phù hợp đặt vào `Phase 4` như trong doc

## 7. Export + Simulation Backlog

### 7.1. Export backlog

- Chốt `mission JSON` contract nội bộ
- Thêm import / export JSON
- Thiết kế `MAVLink mission adapter`
- Thiết kế `KML exporter`
- Bổ sung metadata:
  - unit
  - coordinate frame
  - altitude reference
  - heading / gimbal / speed

### 7.2. Simulation backlog

- Playback route theo waypoint
- Pause / resume / scrub timeline
- Drone heading interpolation
- Highlight waypoint đang active
- Trigger action event theo timeline
- Speed multiplier

### 7.3. Điều kiện để làm ổn

- Mission schema phải ổn định
- Các mode chính phải generate waypoint nhất quán
- Node actions phải serialize được

## 8. Thứ tự triển khai khuyến nghị

1. Hoàn tất `Phase 3 completion`
2. Hoàn tất phần còn thiếu của `Doc Phase 2`: `Perimeter / Waypoint / Orbit`
3. Bắt đầu `Phase 4` với `Spiral / Grid / Corridor`
4. Chốt `JSON export`
5. Làm `simulation playback`
6. Sau cùng mới đi sâu vào `MAVLink / KML`

## 9. Checklist đối chiếu

- [x] Cập nhật `EXECUTION_PLAN.md` để có `Phase 4`
- [x] Chốt phạm vi `Phase 3 completion`
- [x] Chốt thứ tự `mode expansion`
- [x] Chốt backlog `export + simulation`
- [ ] Dùng file này làm nguồn đối chiếu khi bắt đầu phase tiếp theo
