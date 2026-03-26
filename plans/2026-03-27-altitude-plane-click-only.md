# Altitude Plane Click-Only Plan

## 1. Mục tiêu

Sửa interaction của altitude plane để việc đặt điểm chỉ xảy ra khi user thực hiện **click thật**, không xảy ra khi user giữ chuột trái, drag rồi thả trên plane.

## 2. Bug hiện tại

- Trong `setup` hoặc `drawing`, nếu user giữ chuột trái và thả trên altitude plane, app vẫn có thể hiểu đó là thao tác vẽ điểm.
- Hành vi này làm việc orbit/drag camera dễ vô tình tạo điểm mới.

## 3. Mong đợi

- Chỉ thao tác `click` mới tạo điểm.
- `hold -> drag -> release` không được tạo điểm.
- Chỉ nút chuột trái mới được dùng để tạo điểm.

## 4. Nguyên nhân gốc

Ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L308), altitude plane đang dùng `onClick={handleAltitudePlaneClick}` trực tiếp.

Hiện handler:

- không kiểm tra `event.delta`
- không kiểm tra `event.button`
- không phân biệt click thật với drag-release

Trong React Three Fiber, `onClick` vẫn có thể fire sau một lượt pointer interaction, nên nếu không gate thêm thì drag-release có thể bị hiểu là click.

## 5. Hướng fix

### Step 1. Gate theo click distance

- Dùng `event.delta` để chỉ nhận thao tác có movement rất nhỏ.
- Nếu `delta` vượt threshold thì bỏ qua.

### Step 2. Gate theo nút chuột

- Chỉ nhận `event.button === 0` cho create point.

### Step 3. Áp dụng cho setup và drawing

- `setup`: click thật mới bắt đầu path setup và đặt điểm đầu tiên.
- `drawing`: click thật mới thêm point tiếp theo.

### Step 4. Giữ nguyên các interaction khác

- orbit/drag camera không được tạo điểm
- generated state selection không bị ảnh hưởng

## 6. Acceptance Criteria

- [ ] Left click thật trên plane tạo điểm.
- [ ] Hold rồi drag rồi release trên plane không tạo điểm.
- [ ] Right click hoặc non-primary button không tạo điểm.
- [ ] Setup state vẫn cho tap/click đầu tiên để bắt đầu path setup.
- [ ] Drawing state vẫn thêm được point bình thường khi click thật.

## 7. Checklist thực hiện

- [x] Thêm threshold cho click trên altitude plane
- [x] Chặn non-primary mouse button
- [ ] Verify setup state
- [ ] Verify drawing state
- [x] Chạy `pnpm build`
- [x] Chạy `pnpm lint`

## 8. Đối chiếu khi implement

Khi sửa issue này, đối chiếu trực tiếp với file plan này và chỉ đánh dấu hoàn thành khi:

- point creation chỉ còn xảy ra trên click thật
- drag-release không tạo point
- checklist mục 7 hoàn tất
