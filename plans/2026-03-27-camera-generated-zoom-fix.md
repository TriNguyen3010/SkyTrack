# Camera Generated Zoom Fix

## 1. Vấn đề

Sau khi user bấm `Generate Path`, camera trong viewport bị cảm giác **zoom to / lao vào gần bất thường**.

Mong đợi:

- Khi chuyển từ `editing` sang `generated`, framing của camera phải ổn định
- User vẫn nhìn được toàn bộ mission area như trước
- Việc chọn waypoint để inspect không nên tự làm camera đổi framing đột ngột trừ khi đó là hành vi chủ động

## 2. Root cause nghi ngờ cao

### 2.1. Camera target đang nhảy sang waypoint đầu tiên

Trong [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx), `cameraTarget` đang ưu tiên `selectedWaypoint` trước polygon centroid.

Khi generate xong:

- store set `selectedWaypointId` thành waypoint đầu tiên ở [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts#L102)
- camera target lập tức nhảy từ polygon centroid sang waypoint đầu tiên ở [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L67)
- waypoint đầu thường nằm lệch về mép path, làm khoảng cách cảm nhận từ camera đến target thay đổi mạnh

Đây là nguyên nhân chính có khả năng cao nhất.

### 2.2. Canvas đang remount khi đổi stage

`Canvas` đang có `key={stage}` ở [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L88).

Điều này khiến khi đổi `editing -> generated`:

- camera và controls bị tạo lại
- target mới được áp ngay từ đầu
- cảm giác nhảy camera bị mạnh hơn

## 3. Hướng fix

### Step 1. Giữ framing ổn định khi vừa generate

- Không auto set `selectedWaypointId` về waypoint đầu tiên trong `generatePath`
- Hoặc tách `selected waypoint` khỏi `camera target`

Khuyến nghị:

- `generatePath` nên để `selectedWaypointId: null`
- generated state mặc định vẫn target vào `polygon centroid`
- chỉ khi user click waypoint thì mới selected

### Step 2. Không remount Canvas theo stage

- Bỏ `key={stage}` khỏi `Canvas`
- Giữ camera/controls state sống qua transition `setup -> drawing -> editing -> generated`

### Step 3. Chỉnh lại logic target

- `editing` và `generated` mặc định target theo centroid của polygon
- `selectedWaypoint` chỉ ảnh hưởng highlight / detail panel
- nếu sau này muốn focus camera vào waypoint, phải là action rõ ràng và ideally có animation mượt

## 4. Acceptance criteria

- [ ] Bấm `Generate Path` không làm camera zoom to đột ngột
- [ ] Sau generate, viewport vẫn giữ framing gần giống editing state
- [x] Generated state vẫn highlight / inspect waypoint bình thường
- [x] Chọn waypoint thủ công không làm trải nghiệm camera bị giật
- [x] `pnpm build` pass
- [x] `pnpm lint` pass

## 5. Ghi chú

- Lượt fix này chỉ tập trung vào camera stability
- Không thay đổi geometry/path generation
- Không mở rộng simulation hay mode mới ở lượt này
