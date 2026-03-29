# Waypoint Info Cluster Audit Plan

## Mục tiêu

Liệt kê chính xác hiện tại `waypoint` đang có những cụm thông tin nào trong viewport, theo từng trạng thái, để làm nền cho việc quy hoạch lại UI sau đó.

## Phạm vi audit

- Chỉ xét `thông tin hiển thị quanh waypoint / point` trong viewport 3D
- Không xét sidebar
- Không xét pattern picker / radial menu
- Có ghi chú riêng cho `drone beacon` và `simulation overlays` nếu chúng chồng gần waypoint

## Tóm tắt nhanh

Hiện tại thông tin quanh waypoint đang bị phân tán thành nhiều lớp:

1. `ID / number badge`
2. `Altitude chip`
3. `Battery chip`
4. `Action count chip`
5. `START / END`
6. `PNR`
7. `Drag tooltip`
8. `Ghost anchor badge` trong density preview

Tùy state, các lớp này có thể chồng lên nhau theo chiều dọc quanh cùng một waypoint.

## Audit theo trạng thái

### 1. Setup

`Waypoint info cluster`: chưa có

Hiện tại ở `setup` chưa có waypoint/path point nào được render.

Thông tin gần khu vực mission lúc này là:
- `Altitude beacon` trên drone giả lập
- text dạng `50m`

Đây chưa phải waypoint info thực sự.

### 2. Drawing

Mỗi `drawing point` hiện có:

- `ID bubble`
  - hình tròn tím/cam
  - text số `1, 2, 3...`
- `Point sphere`
  - sphere trắng + lõi màu
- `Close loop affordance` trên điểm đầu
  - ring pulse khi có thể close polygon

Thông tin đang hiển thị:
- `point id`
- trạng thái `điểm đầu có thể close`

Chưa có:
- altitude riêng cho từng point
- battery
- action

### 3. Editing

Ở `editing`, point cluster về cơ bản giống `drawing`:

- `ID bubble`
- `Point sphere`
- `Close loop ring` nếu áp dụng

Ngoài ra trong scene có:
- preview path lines
- pattern visual polish

Nhưng ngay trên từng point vẫn chủ yếu chỉ có:
- `id`
- trạng thái `active close loop`

### 4. Generated

Đây là state có nhiều lớp thông tin nhất.

#### 4.1. Marker base

Mỗi waypoint hiện có:

- `Stem`
  - line từ waypoint xuống ground
  - encode safety/selected/hover/drag
- `Waypoint sphere`
  - outer shell trắng
  - inner core màu safety
- `Numeric badge`
  - bubble chứa `waypoint.id`

Thông tin hiển thị nền:
- `id`
- `safety color`
- `selected / hover / drag`

#### 4.2. Z editing info

Khi hover stem của waypoint đã selected hoặc đang drag `Z`:

- `Altitude chip`
  - text dạng `↕ 50m`

Khi đang drag `Z`:

- `Drag tooltip`
  - title `Waypoint N · Altitude`
  - dòng `Z: old -> new`
  - delta `+/-`
  - `snap 5m`
  - `min altitude reached / max altitude reached`
- `Ground ring` dưới chân stem

Thông tin loại này:
- `altitude current`
- `altitude delta`
- `snap state`
- `clamp state`

#### 4.3. X/Y editing info

Khi đang drag `X/Y`:

- `Drag tooltip`
  - title `Waypoint N · Move`
  - dòng `X: old -> new`
  - dòng `Y: old -> new`
  - delta `+/-`

Thông tin loại này:
- `x delta`
- `y delta`
- `x/y current`

#### 4.4. Battery info

Khi waypoint `hovered` hoặc `selected`, nếu có battery estimate:

- `Battery chip`
  - text dạng `WP 2 · ~99%`

Thông tin loại này:
- `waypoint id`
- `remaining battery percent`

#### 4.5. Route semantics info

Nếu waypoint là start:

- `START chip`

Nếu waypoint là end:

- `END chip`

Nếu waypoint là point of no return:

- `PNR ring`
- `PNR chip`

Thông tin loại này:
- `start`
- `end`
- `point of no return`

#### 4.6. Action info

Nếu waypoint có action:

- `Action count chip`
  - text dạng `A1`, `A2`, ...

Thông tin loại này:
- `action count`

Lưu ý:
- chip này không nói rõ action type
- chỉ cho biết số lượng action trên waypoint

### 5. Generated + Density Preview

Khi có simplify preview / ghost removed anchors:

- `Ghost anchor ring`
- `Ghost anchor numeric badge`

Thông tin loại này:
- `anchor cũ đã bị loại`
- `id của anchor cũ`

Đây là một lớp info phụ, nhưng vẫn là waypoint-related information trong generated state.

### 6. Simulation / Preview Flight

Trong simulation, phần thông tin đang gắn gần drone/path là:

- `current cue`
  - label action cue hiện tại
- `status label`
  - trạng thái chuyến bay hiện tại
- `pulse waypoint`
  - pulse trên waypoint active

Đây không hoàn toàn là waypoint badge truyền thống, nhưng nó làm tăng mật độ thông tin gần waypoint/path trong generated viewport.

## Danh mục thông tin hiện tại

Nếu gom theo `information type`, hiện waypoint/path trong viewport đang có các kiểu sau:

1. `Identity`
- point id
- waypoint id

2. `Edit affordance`
- close loop ring
- stem hover altitude chip
- XY/Z drag tooltip

3. `Route semantics`
- START
- END
- PNR

4. `Mission semantics`
- action count `A#`

5. `Energy semantics`
- battery remaining `~%`
- safety color trên marker/stem

6. `Density semantics`
- ghost anchor id

7. `Simulation semantics`
- current cue
- flight status label

## Vấn đề layout hiện tại

Hiện waypoint info cluster bị phình lên theo kiểu `stack tự phát`, vì nhiều badge cùng tồn tại quanh một waypoint:

- `battery chip` ở cao nhất
- `START/END` ở giữa trên
- `numeric badge` ở giữa
- `action chip` lệch bên
- `altitude chip` trên stem
- `drag tooltip` lệch thêm một lớp khác

Khi waypoint có nhiều semantics cùng lúc, cluster dễ:

- chồng lên nhau
- cắt vào path
- che drone hoặc che waypoint lân cận
- gây khó đọc

## Hướng quy hoạch tiếp theo

Đề xuất tách waypoint info thành 3 tầng cố định:

1. `Core marker`
- sphere
- numeric id

2. `Semantic badges`
- start / end / pnr / action

3. `Transient overlays`
- battery
- altitude edit
- drag tooltip
- simulation cue

## Trạng thái

- [x] Audit current waypoint information types
- [x] Group by state
- [x] Group by information type
- [ ] Lên layout spec mới cho waypoint info cluster
