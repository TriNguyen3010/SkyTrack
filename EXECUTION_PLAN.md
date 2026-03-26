# Drone Mission Planner Execution Plan

## 1. Mục tiêu

Xây dựng `Drone Mission Planner` theo đúng:

- UI reference từ các screenshot trong folder
- Product logic, màu sắc, path modes và node actions từ `Drone_Mission_Planner_Plan.docx`

Trọng tâm của execution plan này là hoàn thành 3 phase đầu với flow thật của người dùng:

1. `setup`
2. `draw polygon`
3. `tune params`
4. `generate path`
5. `inspect waypoint / behavior`

## 2. Nguồn tham chiếu

### 2.1. UI source of truth

- `1_Screenshot 2026-03-26 at 21.32.06.png`
- `2_Screenshot 2026-03-26 at 21.32.20.png`
- `3_Screenshot 2026-03-26 at 21.33.00.png`
- `4_Screenshot 2026-03-26 at 21.33.11.png`
- `5_Screenshot 2026-03-26 at 21.35.51.png`

### 2.2. Product logic and visual tokens

- `Drone_Mission_Planner_Plan.docx`
- `Color_Palette_Reference.html`

## 3. Nguyên tắc triển khai

- UI bám screenshot, không tự suy diễn layout.
- Màu sắc và semantic states bám doc.
- Chốt state model sớm để tránh refactor lớn ở Phase 2 và 3.
- Mỗi phase phải ship được một flow dùng được, không làm UI rời logic.
- `Coverage Area Scan` là backbone của Phase 1-3, các mode khác để sau.

## 4. Tech baseline

- `React + TypeScript`
- `Three.js + React Three Fiber`
- `Zustand`
- `Tailwind CSS`
- Geometry utilities cho polygon và path generation

## 5. Domain model cần có ngay từ đầu

- `Mission`
- `PathPlan`
- `CoverageAreaPlan`
- `Waypoint`
- `WaypointAction`
- `ViewportState`
- `DrawingState`
- `SelectionState`

## 6. Phase plan

### Phase 1: Core Foundation

#### Mục tiêu

Dựng shell app và flow `empty -> setup`.

#### UI scope

- Header breadcrumb
- Toggle `Simulation / Deployment`
- Status bar `READY TO FLY`
- 3D viewport base
- Left floating toolbar
- Right sidebar `Building Mission`
- Tabs `Design / Code`
- `Path Plan` card với `Coverage Area Scan`
- `Vehicle Behavior`
- Setup state với `Scan Altitude`, `Cancel`, `Start Drawing`

#### Logic scope

- Mission store cơ bản
- Default mode `Coverage Area Scan`
- Param form sync state
- Scene base: ground plane, camera, drone placeholder

#### Deliverable

- Màn giống screenshot 1
- Bấm `Setup` ra state giống screenshot 2

#### Exit criteria

- Layout match screenshots
- Design tokens chạy đúng
- Sidebar controls lưu được vào state

### Phase 2: Polygon Drawing + Coverage Editing

#### Mục tiêu

Hoàn chỉnh flow `draw polygon -> close polygon -> edit polygon -> coverage preview`.

#### UI scope

- Numbered waypoint markers
- Dashed guide line và preview line
- Hint `Click first point to close polygon`
- Info block `Alt / Pts / Area`
- Vertices list
- Sliders `Scan Altitude`, `Line Spacing`, `Orientation`
- CTA `Redraw` và `Generate Path`

#### Logic scope

- Click để tạo polygon
- Click điểm đầu để close polygon
- Drag vertex để edit
- Tính area
- Coverage preview theo `altitude / spacing / orientation`

#### Deliverable

- Flow giống screenshot 3 và screenshot 4

#### Exit criteria

- User vẽ được polygon hoàn chỉnh
- Edit vertex cập nhật preview ngay
- Params thay đổi làm preview đổi ngay

### Phase 3: Generated Path + Waypoint / Behavior Panel

#### Mục tiêu

Hoàn chỉnh generated mission state và nền tảng cho node actions.

#### UI scope

- Render lawnmower path hoàn chỉnh
- Summary card `Coverage Area Scan`
- `Edit` action cho path plan
- `Vehicle Behavior` list các waypoint
- Mỗi waypoint hiển thị `Location X / Y / Z`

#### Logic scope

- Generate path thật từ polygon
- Serialize waypoints vào mission state
- Select waypoint từ list và highlight trên viewport
- Chuẩn bị action model cho `hover`, `photo`, `video`, `sensor`

#### Deliverable

- State giống screenshot 5

#### Exit criteria

- Generate được danh sách waypoint
- Waypoint list và viewport sync hai chiều
- Mission state đủ nền để thêm node actions ở phase sau

## 7. Work breakdown theo thời gian

### Tuần 1

- Scaffold app
- Setup tooling
- Design tokens
- Layout shell
- Base viewport

### Tuần 2

- Setup flow
- Mission store
- Param wiring
- Match screenshot 1 và 2

### Tuần 3

- Polygon drawing
- Close polygon
- Guide line
- Match screenshot 3

### Tuần 4

- Vertex editing
- Area calculation
- Coverage preview
- Match screenshot 4

### Tuần 5

- Path generation
- Waypoint rendering
- Summary card

### Tuần 6

- Waypoint list
- Behavior panel foundation
- State cleanup
- Testing
- Match screenshot 5

## 8. Definition of Done

- UI match screenshots theo từng state chính
- Colors đúng doc
- `Coverage Area Scan` chạy end-to-end
- State không bị mất khi chuyển giữa setup, drawing và generated
- Các interaction chính dùng được bằng chuột

## 9. Non-goals trong plan này

- `Perimeter Scan`
- `Waypoint Navigation`
- `Spiral Scan`
- `Grid Scan`
- `Orbit / POI`
- `Corridor Scan`
- Full simulation engine
- `MAVLink / KML` export
- Responsive mobile
- Dark theme

## 10. Kết luận

Execution plan này chốt:

- UI reference chính là các screenshot trong folder
- Product logic và màu sắc lấy từ `Drone_Mission_Planner_Plan.docx`
- Phase 1-3 chỉ tập trung vào `Coverage Area Scan` flow

Sau khi hoàn thành Phase 1-3, codebase sẽ đủ nền để mở rộng sang:

- multi-mode path planning
- node actions đầy đủ
- simulation
- export
