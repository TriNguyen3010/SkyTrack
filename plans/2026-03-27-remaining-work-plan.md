# Remaining Work Plan

## 1. Mục tiêu

Tổng hợp toàn bộ phần **chưa xong** của `Drone Mission Planner` dựa trên:

- trạng thái code hiện tại
- `EXECUTION_PLAN.md`
- `Drone_Mission_Planner_Plan.docx`

File này là nguồn đối chiếu cho các lượt triển khai tiếp theo.

## 2. Trạng thái hiện tại

### 2.1. Đã hoàn thành

- `Phase 1` nội bộ: shell app + setup flow + viewport base
- `Phase 2` nội bộ: altitude plane + polygon drawing + edit + coverage preview
- `Phase 3` nội bộ phần đầu: generated path + waypoint list + selection
- `Node Actions` foundation:
  - waypoint có `actions[]`
  - add / update / remove / reorder action
  - dynamic form cơ bản
  - action badge trên viewport

### 2.2. Chưa hoàn thành

- Verify runtime đầy đủ cho generated flow sau khi thêm `Node Actions`
- Chưa build các mode còn thiếu trong doc
- Chưa có simulation engine
- Chưa có export `JSON / MAVLink / KML`
- Chưa có polish phase

## 3. Phần chưa xong theo mức ưu tiên

### 3.1. Priority A: Hoàn tất Phase 3 hiện tại

#### Mục tiêu

Chốt `Node Actions` để generated mission flow thật sự ổn định.

#### Việc còn thiếu

- Manual QA cho flow:
  - generate path
  - select waypoint
  - add action
  - reorder action
  - remove action
- Xác nhận generated path state không bị vỡ khi chỉnh action liên tục
- Tinh UI `Vehicle Behavior` panel cho dễ đọc hơn nếu cần
- Thêm validation nhẹ cho action params nếu xuất hiện giá trị rỗng / bất hợp lệ

#### Done khi

- Generated flow ổn định qua browser test
- Node Actions không làm mất selection hoặc hỏng state
- Sidebar và viewport phản ánh action nhất quán

### 3.2. Priority B: Phần còn thiếu của Doc Phase 2

#### Mục tiêu

Bù lại các mode mà doc xếp vào `Phase 2` nhưng code hiện chưa có.

#### Modes còn thiếu

- `Perimeter Scan`
- `Waypoint Navigation`
- `Orbit / POI`

#### Foundation cần làm trước

- `mode registry`
- `mode params schema`
- `mode-specific path generator`
- `mode-specific renderer config`
- color token mapping theo mode

#### Done khi

- Chuyển mode không làm vỡ mission state
- Mỗi mode generate được path riêng
- Path được render đúng màu / đúng semantics trong viewport

### 3.3. Priority C: Phase 4

#### Mục tiêu

Mở rộng planner sang advanced modes, simulation và export.

#### Scope chưa làm

- `Spiral Scan`
- `Grid Scan`
- `Corridor Scan`
- `simulation playback`
- `JSON export`
- `MAVLink adapter`
- `KML exporter`

#### Dependencies

- `Node Actions` phải ổn định
- `mode registry` phải xong
- mission schema phải đủ rõ

#### Done khi

- Các advanced mode generate được path hợp lệ
- Có playback cơ bản của drone trên route
- Xuất được `JSON`
- Có khung adapter rõ cho `MAVLink / KML`

### 3.4. Priority D: Phase 5 / Polish

> Trạng thái hiện tại: **deferred**, chưa làm ở giai đoạn này.

#### Scope chưa làm

- `Design / Code` tab có behavior thật
- `Simulation / Deployment` toggle có behavior thật
- `dark theme`
- `responsive`
- testing sâu hơn
- deploy pipeline

Ghi chú:

- Các enhancement deferred của spec close-path / generated camera không còn theo dõi trong core flow.
- Xem backlog riêng tại [2026-03-27-close-path-deferred-backlog.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-close-path-deferred-backlog.md)

#### Done khi

- UI không chỉ là shell mà có behavior đúng
- App dùng ổn trên nhiều kích thước màn hình
- Có regression test cơ bản

## 4. Thứ tự triển khai khuyến nghị

1. Chốt `Priority A`: verify và polish `Node Actions`
2. Làm `Perimeter Scan`
3. Làm `Waypoint Navigation`
4. Làm `Orbit / POI`
5. Làm `Spiral / Grid / Corridor`
6. Chốt `JSON export`
7. Làm `simulation playback`
8. Sau cùng mới đào sâu `MAVLink / KML`
9. Chỉ quay lại `Phase 5 / Polish` khi Phase 3-4 đã ổn

## 5. Backlog chi tiết còn lại

### 5.1. Action system backlog

- validation params
- action summary tốt hơn
- action icon/badge phong phú hơn
- future playback hooks cho action timeline

### 5.2. Mission schema backlog

- định nghĩa rõ `Mission`
- định nghĩa `PathPlan` theo mode
- metadata cho export:
  - unit
  - coordinate frame
  - altitude reference
  - heading
  - gimbal
  - speed

### 5.3. Simulation backlog

- play / pause
- step qua waypoint
- highlight active waypoint
- speed multiplier
- heading interpolation
- action trigger visualization

### 5.4. Export backlog

- internal JSON contract
- import JSON
- export JSON
- map sang MAVLink mission items
- map sang KML geometry

## 6. Checklist đối chiếu

- [ ] Verify generated flow sau `Node Actions`
- [ ] Build `Perimeter Scan`
- [ ] Build `Waypoint Navigation`
- [ ] Build `Orbit / POI`
- [ ] Build `Spiral Scan`
- [ ] Build `Grid Scan`
- [ ] Build `Corridor Scan`
- [ ] Build `simulation playback`
- [ ] Build `JSON export`
- [ ] Thiết kế `MAVLink / KML` adapter
- [ ] Hoàn thiện `Phase 5 / Polish`

## 7. Ghi chú

- File này chỉ tập trung vào **phần chưa xong**
- Khi bắt đầu một nhánh việc mới, nên tạo thêm một plan file nhỏ hơn để bám sát implementation
- Thứ tự trong file này ưu tiên ổn định kiến trúc trước, rồi mới mở rộng mode và export
