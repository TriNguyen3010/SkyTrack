# Polygon Fill Mirror Fix Plan

## 1. Mục tiêu

Sửa lỗi vùng fill của polygon đang bị lật ngược so với outline/path trong viewport 3D.

## 2. Quan sát từ screenshot

- Outline polygon đang đúng vị trí.
- Coverage lines và các vertex marker cũng đang đúng vị trí.
- Chỉ riêng vùng fill bị lệch sang phía đối diện, nhìn như bị mirror qua một trục.

## 3. Nguyên nhân gốc

### 3.1. Fill dùng `THREE.Shape` trong local XY plane

Ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L242), `polygonShape` được tạo bằng:

- `shape.moveTo(points[0].x, points[0].y)`
- `shape.lineTo(point.x, point.y)`

`THREE.ShapeGeometry` mặc định nằm trong mặt phẳng local `XY`.

### 3.2. Sau đó mesh fill bị quay `rotation-x={-Math.PI / 2}`

Ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L442), mesh fill được đặt bằng:

- `rotation-x={-Math.PI / 2}`

Phép quay này làm:

- local `+Y` của shape biến thành world `-Z`

Trong khi toàn bộ các line/marker khác của app đang map `point.y -> world +Z`, ví dụ ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L714).

### 3.3. Kết quả

Outline, hover, coverage, waypoint đang dùng hệ:

- `x -> world x`
- `y -> world +z`

Còn fill đang ngầm dùng hệ:

- `x -> world x`
- `y -> world -z`

Nên fill bị mirror/lật ngược so với polygon thật.

## 4. Hướng fix đã chọn

Không đụng vào coordinate system chung của app.

Chỉ sửa riêng phần fill để nó dùng cùng orientation với:

- vertex markers
- preview lines
- coverage lines
- generated route

## 5. Kế hoạch triển khai

### Step 1. Đồng bộ orientation của shape fill

Chọn một trong hai cách, ưu tiên cách ít side effect hơn:

1. giữ `rotation-x={-Math.PI / 2}` nhưng tạo shape bằng `shape.moveTo(x, -y)`
2. hoặc giữ shape như cũ nhưng đổi rotation/orientation sao cho local Y map sang world `+Z`

Khuyến nghị:

- dùng cách `invert y khi build shape`, vì dễ đối chiếu với phần render hiện tại hơn

### Step 2. Kiểm tra fill với các loại polygon

- convex polygon
- concave polygon
- polygon sau khi drag vertex

### Step 3. Đảm bảo không làm lệch coverage/path

- chỉ sửa fill layer
- không đổi logic của `toAltitudePlanePosition()`
- không đổi `MissionPoint`

## 6. Acceptance Criteria

- [ ] Với polygon convex, fill trùng đúng outline.
- [ ] Với polygon concave hợp lệ, fill trùng đúng outline.
- [ ] Sau khi drag vertex, fill không bị mirror sang phía đối diện.
- [ ] Coverage lines vẫn nằm đúng trong polygon.
- [ ] Generated route không bị ảnh hưởng.

## 7. Checklist thực hiện

- [x] Xác nhận lại root cause bằng code path hiện tại
- [x] Sửa orientation của `polygonShape`
- [ ] Test editing state
- [ ] Test generated state
- [x] Chạy `pnpm build`
- [x] Chạy `pnpm lint`

## 8. Đối chiếu khi implement

Khi sửa issue này, đối chiếu trực tiếp với file plan này và chỉ đánh dấu hoàn thành khi:

- fill không còn bị mirror
- outline/fill/coverage cùng dùng một hệ orientation
- checklist mục 7 hoàn tất
