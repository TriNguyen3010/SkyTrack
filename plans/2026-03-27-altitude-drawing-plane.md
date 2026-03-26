# Altitude Drawing Plane Plan

## 1. Mục tiêu

Sửa flow `Scan Altitude -> Start Drawing` để user vẽ polygon trực tiếp trên **mặt phẳng altitude đã chọn**, thay vì click trên ground rồi mới nâng preview/path lên cao.

## 2. Mong đợi đã chốt

- `2_Screenshot 2026-03-26 at 21.32.20` là trạng thái user **đã chọn altitude**.
- Ngay ở trạng thái này, viewport phải hiển thị **mặt phẳng altitude đã chọn**.
- Khi user tap vào mặt phẳng đó, hành động đó được hiểu là **bắt đầu setup path**.
- User chỉnh `Scan Altitude`.
- Sau khi altitude được chọn, mọi điểm user click để tạo node đều nằm trên cùng mặt phẳng này.
- Khi drag vertex để chỉnh polygon, vertex vẫn bám đúng drawing plane đó.
- Coverage preview và generated path phải đồng phẳng với polygon.

## 2.1. Diễn giải flow theo screenshot 2

- `Setup` state không chỉ là form chỉnh slider.
- `Setup` state là trạng thái `altitude-selected / plane-ready`.
- Plane phải là primary interaction surface.
- Tap đầu tiên lên plane sẽ dùng để bắt đầu path setup và đặt điểm đầu tiên.

## 3. Hiện trạng lệch với mong đợi

### 3.1. Input plane đang là ground plane

- Raycast drag vertex đang dùng plane `y = 0` tại [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L148).
- Click để add point cũng đang đi qua mesh ground interaction ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L363).

### 3.2. Drawing visuals chưa bám altitude

- Preview polyline đang bám `SURFACE_HEIGHT` cố định ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L199).
- Vertex markers cũng đang bám layer cố định ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L444).

### 3.3. Altitude mới chỉ ảnh hưởng phần bay sau đó

- Coverage preview line đang dùng `scanAltitude` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L412).
- Generated waypoint/path đang dùng `scanAltitude` qua `waypoint.z` ở [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L77) và [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L429).

## 4. Kế hoạch triển khai

### Step 1. Chốt khái niệm drawing plane

- Dùng `scanAltitude` làm `drawingPlaneAltitude`.
- Hiển thị plane này ngay từ `setup` state để khớp screenshot 2.
- Tạo helper scene position riêng cho:
  - ground layer
  - drawing plane layer
  - labels/markers layer

### Step 2. Đổi raycast từ ground sang altitude plane

- Add point: click vào plane ở `y = drawingPlaneAltitude`.
- Ở `setup` state, tap lên plane sẽ chuyển sang flow setup path và tạo điểm đầu tiên.
- Drag point: raycast lại trên chính plane đó.
- Hover preview cũng phải theo plane đó.

### Step 3. Render rõ drawing plane

- Thêm một plane bán trong suốt tại `drawingPlaneAltitude`.
- Có border/grid nhẹ để user thấy rõ họ đang thao tác trên lớp bay nào.
- Camera target ưu tiên plane này ngay từ `setup`, `drawing` và `editing`.

### Step 4. Dời toàn bộ drawing visuals lên cùng plane

- preview polyline
- polygon fill
- close ring
- vertex markers
- hover crosshair

### Step 5. Đồng bộ generated state

- Coverage preview phải nằm cùng plane với polygon.
- Generated route và waypoint tiếp tục nằm trên plane đó.
- Nếu đổi `Scan Altitude` ở `editing`, toàn bộ polygon + preview + route phải chuyển theo.

## 5. Ràng buộc dữ liệu

- `MissionPoint` vẫn giữ footprint `x/y`.
- Không cần lưu `z` riêng cho từng polygon vertex trong store hiện tại.
- `scanAltitude` là nguồn sự thật cho drawing plane và coverage route của mode hiện tại.

## 6. Acceptance Criteria

- [ ] Ở state tương ứng với `2_Screenshot 2026-03-26 at 21.32.20`, altitude plane đã hiện sẵn trong viewport.
- [ ] User nhìn thấy rõ mình đang chọn path trên mặt phẳng altitude, không phải trên ground.
- [ ] Tap đầu tiên vào plane sẽ bắt đầu setup path và tạo điểm đầu tiên trên plane đó.
- [ ] `Scan Altitude = 80m`, drawing plane ở `80m` đã hiện sẵn trong setup state.
- [ ] Click nào cũng tạo point trên plane `80m`.
- [ ] Hover crosshair không nằm dưới ground.
- [ ] Drag vertex không tụt xuống ground.
- [ ] Polygon fill, preview lines, coverage lines đều đồng phẳng.
- [ ] Generate path xong, route và waypoint vẫn ở đúng altitude plane đó.
- [ ] Đổi altitude trong `editing` làm toàn bộ drawing layer dời theo.

## 7. Checklist thực hiện

- [x] Refactor helper position trong `MissionViewport3D`
- [x] Thêm altitude interaction plane
- [x] Hiển thị altitude plane ngay ở `setup` state
- [x] Cho phép tap lên plane từ `setup` state để bắt đầu path setup
- [x] Đổi raycast add/drag sang altitude plane
- [x] Dời preview polygon lên drawing plane
- [x] Dời vertex markers lên drawing plane
- [x] Dời hover indicator lên drawing plane
- [x] Tinh camera target/framing
- [ ] Test flow `setup -> drawing -> editing -> generated`
- [x] Chạy `pnpm build`
- [x] Chạy `pnpm lint`

## 8. Đối chiếu khi implement

Khi bắt đầu code cho issue này, đối chiếu trực tiếp với file plan này và chỉ đánh dấu hoàn thành khi:

- behavior đúng với mục 2
- checklist mục 7 hoàn tất
- acceptance criteria mục 6 pass
