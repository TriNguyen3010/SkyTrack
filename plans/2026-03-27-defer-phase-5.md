# Defer Phase 5

## 1. Quyết định

Hiện tại **chưa triển khai `Phase 5`**.

Roadmap thực thi trước mắt chỉ tập trung vào:

1. Hoàn tất `Phase 3`
2. Hoàn tất phần còn thiếu của `Doc Phase 2`
3. Triển khai `Phase 4`

## 2. Lý do

- App vẫn còn nhiều phần core chưa xong
- `Node Actions` mới hoàn thành foundation, còn cần verify runtime
- Các mode chính trong doc vẫn chưa được build
- `simulation` và `export` còn chưa bắt đầu
- Nếu nhảy sang `Phase 5` quá sớm thì dễ polish trên nền chưa ổn định

## 3. Scope sẽ làm ngay

### 3.1. Ưu tiên 1

- Verify generated flow sau `Node Actions`
- Ổn định `Vehicle Behavior` + action editor

### 3.2. Ưu tiên 2

- `Perimeter Scan`
- `Waypoint Navigation`
- `Orbit / POI`

### 3.3. Ưu tiên 3

- `Spiral Scan`
- `Grid Scan`
- `Corridor Scan`
- `simulation playback`
- `JSON export`
- khung adapter cho `MAVLink / KML`

## 4. Những gì tạm hoãn theo quyết định này

- `Design / Code` tab behavior thật
- `Simulation / Deployment` toggle behavior thật
- `dark theme`
- `responsive polish`
- test/deploy polish ở mức cuối

## 5. Điều kiện để mở lại Phase 5

Chỉ bắt đầu `Phase 5` khi:

- `Node Actions` đã ổn định
- các mode chính đã có
- `simulation` đã có bản chạy cơ bản
- `JSON export` đã chốt được contract

## 6. Checklist đối chiếu

- [x] Chốt chưa làm `Phase 5` ở thời điểm hiện tại
- [x] Chốt lại thứ tự ưu tiên chỉ tới `Phase 4`
- [ ] Dùng file này làm chuẩn khi lên plan/implement tiếp theo
