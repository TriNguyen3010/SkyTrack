# UI/UX Close Path Implementation Plan

## 1. Mục tiêu

Triển khai spec trong [UI_UX_Close_Path_Logic.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/UI_UX_Close_Path_Logic.md) theo hướng chia nhỏ thành các bước implement an toàn, không làm vỡ flow hiện tại.

Spec gốc gồm 4 mảng:

1. `Close Loop` UX khi user tiến gần điểm đầu
2. Popup chọn `Flight Pattern` ngay sau khi đóng polygon
3. Camera behavior trong giai đoạn vẽ
4. Camera behavior sau khi generate path

## 2. Mapping với code hiện tại

### 2.1. Đã có

- Vẽ polygon trên altitude plane
- Click điểm đầu để đóng polygon khi đủ `>= 3` điểm
- Preview line trong drawing state
- Generated path state
- Một phần camera stabilization sau generate

### 2.2. Chưa có

- `snap radius` theo screen-space để hỗ trợ close loop
- visual state `ready to close`
- cursor/hint riêng khi đang snap close
- popup `Choose Flight Pattern`
- preview on hover cho pattern trong popup
- sub-state riêng cho `pattern_selecting`
- camera logic mượt trong drawing
- reveal camera đúng spec sau generate

## 3. Khoảng cách giữa spec và implementation hiện tại

### 3.1. Close Loop

Hiện tại app chỉ đóng polygon khi:

- user click đúng marker đầu tiên
- không có screen-space snap detection
- không có pulse/ring/tooltip riêng theo spec

### 3.2. Pattern Selection

Hiện tại sau khi đóng polygon:

- flow đi thẳng sang `editing`
- chưa có popup pattern
- chưa có preview on hover

### 3.3. Camera During Drawing

Hiện tại camera:

- target chưa có lerp
- chưa auto fit trong drawing
- chưa siết controls theo sub-state như spec

### 3.4. Camera After Generate

Hiện đã fix một phần framing, nhưng chưa có:

- reveal animation
- path trace
- waypoint recentering bằng lerp
- preset views

## 4. Đề xuất chia implementation thành 4 workstreams

### Workstream A: Close Loop Detection + Feedback

#### Scope

- Tính screen-space position của điểm đầu
- Tính khoảng cách từ cursor đến điểm đầu
- Định nghĩa `snapRadius` cố định theo pixel
- Thêm state `isReadyToClose`
- Khi `isReadyToClose`:
  - marker đầu phóng to nhẹ
  - ring pulse
  - preview line snap vào điểm đầu
  - hint đổi sang `Click để đóng vùng`
  - optional fill preview

#### Kỹ thuật

- Dùng `camera.project()` hoặc `Vector3.project(camera)` để so screen-space
- Không dùng world-space radius
- Chỉ bật khi `points.length >= 3`

#### Acceptance criteria

- Cursor vào vùng snap thì UI đổi đúng spec
- Cursor ra khỏi vùng snap thì state reset
- Click trong vùng snap đóng polygon ổn định

### Workstream B: Pattern Picker Popup

#### Scope

- Sau khi close polygon, không vào `editing` ngay
- Tạo overlay popup `Choose Flight Pattern`
- Position popup theo screen-space centroid của polygon
- Tile options:
  - `Coverage Scan`
  - `Perimeter`
  - `Orbit / POI`
  - `Spiral`
  - `Grid`
  - `Corridor`
- Dismiss bằng:
  - click ngoài
  - `Esc`
  - timeout 8s
- Footer: `Customize later in sidebar`

#### State đề xuất

- Giữ `stage` hiện tại gọn
- Thêm overlay state riêng, ví dụ:
  - `patternPicker.visible`
  - `patternPicker.anchor`
  - `patternPicker.hoveredPattern`
  - `patternPicker.selectedPattern`

#### Acceptance criteria

- Đóng polygon xong popup hiện đúng vị trí
- Chọn pattern thì sidebar + viewport phản ánh đúng
- Dismiss popup không làm mất polygon

### Workstream C: Camera During Drawing

Status: implemented, build/lint passed. Manual browser verification is still recommended against the UX spec.

#### Scope

- Lerp camera target khi thêm điểm mới
- Auto zoom out khi polygon vượt quá ngưỡng viewport
- Không auto zoom in khi polygon nhỏ
- Disable pan khi drawing
- Siết `maxPolarAngle` theo spec
- Freeze controls khi popup pattern đang mở

#### Kỹ thuật

- Tạo camera controller riêng thay vì nhồi hết vào `MissionViewport3D`
- Dùng `useFrame` cho lerp target/distance
- Tách sub-state camera:
  - `drawing`
  - `dragging`
  - `ready_to_close`
  - `pattern_popup`

#### Acceptance criteria

- Camera không nhảy gắt khi add point
- User không dễ bị mất orientation khi đang vẽ
- Popup mở ra thì camera đứng yên

### Workstream D: Camera After Generate

Status: implemented, build/lint passed. Manual browser verification is still recommended for reveal timing and framing feel.

#### Scope

- Reveal animation `800–1000ms`
- Fit full path + polygon vào viewport
- Khóa input trong lúc reveal
- Mở khóa sau khi reveal xong
- Recenter nhẹ khi chọn waypoint

#### Deferred items moved out of core flow

Các mục dưới đây không còn theo dõi trong file implementation core nữa:

- `path trace animation`
- quick-view presets
- altitude toggle auto-shift

Nơi theo dõi mới:

- [2026-03-27-close-path-deferred-backlog.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-close-path-deferred-backlog.md)

Lý do tách:

- Đây là phần enhancement, không còn chặn core flow
- Core flow của spec cần gọn để dễ verify và chốt chất lượng

#### Acceptance criteria

- Generated path được reveal rõ ràng
- Không lệch framing
- Chọn waypoint recenter nhẹ, không giật

## 5. Thứ tự triển khai khuyến nghị

1. `Workstream A`
2. `Workstream B`
3. `Workstream C`
4. `Workstream D`

Lý do:

- Close loop UX là entry point của toàn spec
- Popup pattern phụ thuộc vào close thành công
- Camera drawing nên chỉnh sau khi state flow đã rõ
- Camera generated nên chốt cuối để tránh sửa hai lần

## 6. State architecture đề xuất

### 6.1. Không mở rộng `stage` quá nhiều

Thay vì đổi `MissionStage` thành quá nhiều nhánh, nên giữ:

- `idle`
- `setup`
- `drawing`
- `editing`
- `generated`

Và thêm UI state riêng:

- `drawingUi.isReadyToClose`
- `drawingUi.snapScreenPoint`
- `patternPicker.visible`
- `patternPicker.hoveredPattern`
- `cameraUi.mode`

### 6.2. Lợi ích

- Ít phá flow cũ
- Dễ bật/tắt overlay và behavior theo spec
- Ít risk hơn việc đổi state machine lớn

## 7. Deliverables theo từng batch

### Batch 1

- Close loop snap detection
- Marker pulse/ring
- Snap preview line
- Hint text update

### Batch 2

- Pattern popup
- Portal overlay
- Dismiss logic
- Sidebar sync khi chọn pattern

### Batch 3

- Drawing camera smoothing
- Disable pan / clamp controls
- Freeze camera khi popup mở

### Batch 4

- Generated reveal camera
- Recenter on waypoint select
- Polish transitions

## 8. Risks

- Screen-space projection dễ sai khi resize viewport
- Overlay popup cần sync đúng với canvas bounds
- Camera smoothing và OrbitControls có thể conflict nếu trộn sai cách
- Preview on hover cho pattern có thể kéo theo nhiều logic generator hơn dự kiến

## 9. Checklist đối chiếu

- [x] Workstream A: Close Loop UX
- [x] Workstream B: Pattern Picker Popup
- [x] Workstream C: Camera During Drawing
- [x] Workstream D: Camera After Generate
- [x] Tách phần deferred ra khỏi core flow
- [ ] Dùng file này làm nguồn đối chiếu khi implement spec
