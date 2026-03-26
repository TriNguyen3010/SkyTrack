# Camera Generated Framing Fix

## 1. Vấn đề quan sát được

Sau khi `Generate Path`, camera không còn zoom to đột ngột như trước, nhưng framing vẫn **bị lệch**.

Theo screenshot hiện tại:

- mission area bị dồn xuống **mép dưới**
- đồng thời lệch về **phía phải**
- phần lớn viewport phía trên là khoảng trống

Nói ngắn gọn: camera đang nhìn đúng scene, nhưng **không fit lại mission area vào khung nhìn** sau khi generate.

## 2. Tình trạng code hiện tại

### 2.1. Đã fix trước đó

- Không auto select waypoint đầu tiên khi generate ở [src/store/useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts#L102)
- Không remount `Canvas` theo `stage` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L80)

### 2.2. Phần còn thiếu

Camera hiện tại chỉ có:

- `CAMERA_POSITION` cố định ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L25)
- `OrbitControls target` bám vào centroid ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L67) và [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L105)

Điều này có nghĩa là:

- target được cập nhật
- nhưng **camera position / distance / framing không được fit lại theo bounds của mission**

## 3. Root cause nghi ngờ cao

### 3.1. Chỉ target centroid là chưa đủ

Centroid cho biết tâm của mission, nhưng không cho biết:

- mission rộng bao nhiêu
- mission lệch theo trục nào
- cần camera cách xa bao nhiêu để nhìn trọn

Vì vậy dù target đúng, khung hình vẫn có thể lệch mạnh.

### 3.2. Camera đang dùng vị trí tĩnh

`CAMERA_POSITION` hiện là hằng số, nên sau generate:

- camera không tự lùi ra / tịnh tiến theo mission bounds
- với polygon nằm lệch trong world space, scene dễ bị dồn xuống dưới hoặc sang một bên

### 3.3. Generated state cần “fit mission”, không chỉ “look at centroid”

Editing state có thể chấp nhận camera tự do hơn vì user đang thao tác.
Generated state thì expectation tốt hơn là:

- mission path nằm khá cân trong viewport
- user nhìn được toàn bộ generated result ngay sau khi bấm generate

## 4. Hướng fix

### Step 1. Tính mission bounds sau generate

- Lấy bounds từ `points` hoặc `waypoints`
- Tính:
  - min/max X
  - min/max Y
  - width / height
  - center

### Step 2. Tạo “fit camera” logic

- Từ bounds, tính ra:
  - target center
  - desired camera distance
  - desired camera position offset

Nguyên tắc:

- không chỉ đổi `target`
- phải đổi cả `camera.position` theo một offset ổn định

### Step 3. Chỉ chạy fit khi chuyển sang generated

- `editing` giữ orbit tự nhiên cho user
- lúc `generated` mới chạy one-shot fit
- sau đó vẫn cho phép user orbit bình thường

### Step 4. Giữ framing ổn định khi chọn waypoint

- click waypoint chỉ highlight / inspect
- không làm camera lệch khỏi fitted view trừ khi sau này có explicit “focus waypoint”

## 5. Acceptance criteria

- [ ] Sau `Generate Path`, mission area nằm gần trung tâm viewport
- [ ] Không còn tình trạng scene bị dồn xuống mép dưới
- [ ] Không còn tình trạng scene bị lệch hẳn sang phải hoặc trái
- [x] User vẫn orbit/pan được sau khi generate
- [x] Chọn waypoint không phá framing đã fit
- [x] `pnpm build` pass
- [x] `pnpm lint` pass

## 6. Ghi chú

- Đây là issue về **camera framing**, không còn là issue `zoom spike`
- Lượt fix tới nên thêm logic `fit-to-mission-bounds`
- Không đụng sang path generation hay node actions ở lượt này
