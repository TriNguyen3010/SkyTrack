# Polygon Fill Fix Plan

## 1. Mục tiêu

Sửa lỗi phần fill sau khi user vẽ xong polygon, để vùng tô luôn khớp với polygon hợp lệ và không xuất hiện các mảng tam giác chồng chéo hoặc fill lệch như screenshot.

## 2. Quan sát từ issue hiện tại

- Ở trạng thái `editing`, outline polygon vẫn hiển thị, nhưng phần fill xuất hiện các mảng chéo và tam giác bất thường.
- Vấn đề này xảy ra rõ nhất khi user kéo vertex hoặc vẽ theo thứ tự làm polygon tự cắt nhau.
- Đây không phải lỗi màu, mà là lỗi triangulation trên một polygon không còn là `simple polygon`.

## 3. Nguyên nhân gốc

### 3.1. Fill đang dựa trực tiếp vào thứ tự điểm thô

Ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L242), `polygonShape` được tạo bằng `THREE.Shape()` từ mảng `points` hiện tại mà không có bước kiểm tra tính hợp lệ của polygon.

### 3.2. Không có validation chống self-intersection

- `addPoint()` ở [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts#L99) thêm điểm mới mà không kiểm tra cạnh mới có cắt các cạnh cũ hay không.
- `updatePoint()` ở [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts#L105) cho phép drag vertex đến bất kỳ vị trí nào, kể cả khi polygon tự cắt.
- `closePolygon()` ở [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts#L76) chỉ kiểm tra `points.length >= 3`, chưa kiểm tra polygon đã hợp lệ chưa.

### 3.3. Các thuật toán phía sau cũng giả định polygon hợp lệ

`generateCoverageSegments()` ở [src/lib/missionGeometry.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/missionGeometry.ts#L180) đang giả định polygon là một miền đơn giản. Nếu polygon tự cắt, coverage preview và path generation cũng không còn đáng tin cậy.

## 4. Kết luận nguyên nhân

Nguyên nhân chính là:

- user có thể tạo hoặc chỉnh sửa polygon thành dạng `self-intersecting`
- nhưng hệ thống vẫn cố gắng fill polygon đó bằng `THREE.ShapeGeometry`
- kết quả là triangulation sinh ra các mặt chéo và vùng fill sai như screenshot

## 5. Hướng fix đã chọn

Không auto-sort lại points theo centroid hoặc convex hull, vì cách đó sẽ làm sai ý định vẽ của user và phá các shape concave hợp lệ.

Hướng fix đúng hơn là:

1. phát hiện polygon tự cắt
2. chặn hoặc rollback thao tác tạo self-intersection
3. chỉ cho fill/coverage/path chạy khi polygon hợp lệ

## 6. Kế hoạch triển khai

### Step 1. Thêm geometry validation helpers

Trong [src/lib/missionGeometry.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/missionGeometry.ts):

- thêm helper kiểm tra giao nhau của hai segment
- thêm helper kiểm tra toàn polygon có self-intersection hay không
- thêm helper trả về `isSimplePolygon(points)`

### Step 2. Chặn polygon tự cắt khi thêm điểm

- Khi user thêm một điểm mới trong `drawing`, kiểm tra cạnh mới có cắt các cạnh cũ hay không.
- Nếu có, không thêm point đó.
- Hiển thị warning ngắn trong UI hoặc hint overlay.

### Step 3. Chặn polygon tự cắt khi drag vertex

- Khi user kéo vertex trong `editing`, tính polygon candidate.
- Nếu candidate polygon self-intersect:
  - không commit vị trí mới
  - hoặc snap/revert về vị trí cuối hợp lệ

### Step 4. Chặn close polygon nếu shape chưa hợp lệ

- `closePolygon()` cần kiểm tra polygon đóng lại có self-intersection hay không.
- Nếu chưa hợp lệ, giữ nguyên ở `drawing` và báo trạng thái invalid.

### Step 5. Render fill có điều kiện

Ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L242):

- chỉ tạo `polygonShape` khi polygon hợp lệ
- nếu invalid:
  - không render fill
  - có thể giữ outline/hint để user chỉnh lại

### Step 6. Coverage/path chỉ chạy khi polygon hợp lệ

- `coverageSegments`
- `Generate Path`

đều phải bị chặn nếu polygon invalid.

## 7. UX mong muốn sau khi fix

- User vẫn vẽ polygon theo thứ tự boundary như hiện tại.
- Nếu thao tác làm polygon tự cắt, app phản hồi ngay thay vì fill sai.
- Fill chỉ xuất hiện khi polygon hợp lệ.
- Coverage preview và generated path luôn bám đúng miền polygon đơn giản.

## 8. Acceptance Criteria

- [ ] Vẽ một polygon convex: fill đúng hoàn toàn.
- [ ] Vẽ một polygon concave nhưng không tự cắt: fill đúng hoàn toàn.
- [ ] Kéo một vertex làm polygon tự cắt: thao tác bị chặn hoặc bị rollback.
- [ ] Close polygon với shape tự cắt: không chuyển sang `editing`.
- [ ] Với polygon invalid, không render fill sai.
- [ ] Với polygon invalid, không generate coverage/path.
- [ ] Với polygon hợp lệ, flow `drawing -> editing -> generated` vẫn chạy bình thường.

## 9. Checklist thực hiện

- [x] Thêm helper `segment intersection`
- [x] Thêm helper `isSimplePolygon`
- [x] Validate khi add point
- [x] Validate khi update point
- [x] Validate khi close polygon
- [x] Chặn render fill khi invalid
- [x] Chặn coverage/path khi invalid
- [x] Thêm trạng thái/hint invalid cho user
- [ ] Test manual với polygon convex
- [ ] Test manual với polygon concave
- [ ] Test manual với polygon tự cắt
- [x] Chạy `pnpm build`
- [x] Chạy `pnpm lint`

## 10. Đối chiếu khi implement

Khi bắt đầu sửa issue này, đối chiếu trực tiếp với file plan này và chỉ đánh dấu hoàn thành khi:

- nguyên nhân ở mục 3 đã được xử lý
- checklist mục 9 hoàn tất
- acceptance criteria mục 8 pass
