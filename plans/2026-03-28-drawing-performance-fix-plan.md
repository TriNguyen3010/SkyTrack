# Drawing Performance Fix Plan

## Mục tiêu
- Giảm lag rõ rệt trong lúc user vẽ boundary / exclusion trên viewport.
- Tách luồng `drawing` ra khỏi các tính toán mission nặng không cần thiết.
- Giữ cảm giác vẽ mượt hơn mà không làm sai preview / generated flow.

## Triệu chứng hiện tại
- Khi user đang vẽ hoặc kéo vertex, viewport bị khựng, cảm giác không theo kịp chuột.
- Lag rõ hơn sau khi polygon đã đủ 3 điểm.
- Kéo vertex hoặc rê chuột lâu trên altitude plane sẽ làm app giật nhiều hơn.

## Phân tích nguyên nhân

### 1. Mission engine đang chạy quá sớm trong lúc vẽ
- `selectedPatternMission` vẫn được build live chỉ cần polygon hợp lệ ở [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L337)
- `basePatternMission` cũng build lại live ở [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L348)
- Cả hai đều gọi `buildFlightPatternMission(...)` ở [src/lib/flightPatterns.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/flightPatterns.ts#L242)

Hệ quả:
- Khi thêm điểm hoặc kéo điểm, app không chỉ cập nhật polygon.
- Nó còn regenerate pattern, exclusion clipping, density, length estimate và các dữ liệu dẫn xuất khác.

### 2. Battery estimate bị tính lại theo mission live
- `previewBatteryReport` phụ thuộc vào `selectedPatternMission` ở [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L374)

Hệ quả:
- Vừa vẽ vừa kéo theo cả battery engine chạy lại.
- Đây là phần không cần thiết trong `drawing` nhưng vẫn đang nằm trên hot path.

### 3. Drawing camera đang chạy fit logic mỗi frame
- `DrawingCameraController` dùng `useFrame(...)` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L1749)
- Trong đó mỗi frame gọi `getDrawingFitDistance(...)` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L3556)
- Hàm này tạo `Vector3[]`, `Box3`, `Sphere` mới từ toàn bộ points để tính fit distance

Hệ quả:
- Camera fitting đang ăn CPU liên tục trong suốt thời gian drawing.
- Cost này cộng dồn với hot path pointer move khiến cảm giác lag rõ.

### 4. Pointer move đang kéo theo rerender dày trên toàn scene drawing
- `handleAltitudePlaneMove(...)` gọi `onHoverPointChange(nextHoverPoint)` trên mọi pointer move ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L819)
- Hover state này làm recompute:
  - `previewPolylinePoints` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L665)
  - `hoverLinkPoints` ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L696)
- Đồng thời scene phải rerender crosshair, dashed preview, hover link, markers ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L1073) và [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L1298)

Hệ quả:
- Chỉ riêng việc rê chuột cũng đã làm scene cập nhật rất nhiều.

### 5. Drag vertex là case nặng nhất
- Khi drag point, `pointermove` trên `window` gọi `onUpdatePoint(...)` liên tục ở [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx#L623)
- Việc này làm App rerender và kích hoạt lại các mission memo ở [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L337), [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L348), [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L374)

Hệ quả:
- Kéo point vừa update geometry vừa regenerate mission nặng theo thời gian thực.
- Đây là nguyên nhân dễ gây drop frame nhất.

## Kết luận root cause
- Lag không đến từ một lỗi đơn lẻ trong Three.js.
- Root cause là hot path `drawing` đang bị lẫn với:
  - mission generation
  - battery estimation
  - density calculations
  - camera fit per-frame
  - hover-driven rerender scene

## Hướng fix chốt

### Fix 1. Tách hot path `drawing` khỏi mission preview nặng
- Không build `selectedPatternMission` / `basePatternMission` trong `stage === 'drawing'`
- Chỉ bật mission preview nặng từ `editing` trở đi

### Fix 2. Tách battery khỏi drawing stage
- Không tính `previewBatteryReport` khi đang `drawing`
- Chỉ tính ở `editing` hoặc `generated`

### Fix 3. Giảm cost camera fitting trong drawing
- Không chạy `getDrawingFitDistance(...)` mỗi frame
- Chỉ recompute fit khi `points` thay đổi thật
- Dùng cached fit target/distance trong các frame ở giữa

### Fix 4. Giảm phạm vi rerender do hover
- Giữ hover processing local hơn trong viewport
- Không đẩy state không cần thiết lên parent trong lúc pointer move
- Xem xét throttle / frame-sync cho hover updates nếu cần

### Fix 5. Tách drag update khỏi các derived calculations không cần thiết
- Dragging chỉ nên cập nhật polygon/edit visuals trước
- Các derived calculations nặng nên debounce hoặc chỉ chạy khi drag settle, tùy stage

## Kế hoạch triển khai

### Stream A. Instrument + baseline
- Thêm logging/profiling đơn giản để đo:
  - số lần `buildFlightPatternMission(...)` chạy trong `drawing`
  - số rerender của App / Viewport trong lúc hover và drag
  - frame cost khi drag vertex
- Chốt baseline trước khi sửa

### Stream B. Stage gating cho heavy derived state
- Gate `selectedPatternMission`
- Gate `basePatternMission`
- Gate `previewBatteryReport`
- Rà lại các memo khác đang phụ thuộc gián tiếp vào các mission object này

### Stream C. Drawing camera optimization
- Tách `fit distance` ra thành derived value theo `points`
- `useFrame` chỉ lerp theo cached target/distance
- Không dựng lại bounds/sphere mỗi frame

### Stream D. Hover / ready-to-close optimization
- Giữ `isReadyToClose` local nhất có thể
- Rà `onReadyToCloseChange` để tránh push parent updates liên tục
- Giảm rerender surface của crosshair / preview hover link

### Stream E. Drag-path optimization
- Phân tách update geometry trực tiếp khỏi các effect nặng
- Nếu cần, debounce live mission recompute khi drag
- Verify riêng case drag boundary và drag exclusion vertex

### Stream F. Regression + acceptance pass
- Manual verify:
  - vẽ boundary từ 0 -> close polygon
  - kéo vertex của boundary
  - vẽ exclusion zone
  - đổi pattern sau editing
- Kiểm tra không làm hỏng:
  - close loop UX
  - pattern picker
  - generated snapshot flow
  - battery preview ở editing

## Acceptance criteria
- Lúc rê chuột trên altitude plane, viewport không còn khựng rõ như hiện tại.
- Lúc drag vertex, frame pacing ổn định hơn và không có cảm giác “đuổi theo chuột”.
- `drawing` không còn gọi mission/battery pipeline nặng trên mọi update.
- Camera drawing vẫn theo kịp vùng đang vẽ nhưng không phải recompute fit nặng mỗi frame.
- `editing` và `generated` vẫn hiển thị preview/mission đúng như trước.

## Thứ tự ưu tiên
1. Stream B: stage gating cho heavy derived state
2. Stream C: drawing camera optimization
3. Stream D: hover / ready-to-close optimization
4. Stream E: drag-path optimization
5. Stream F: verify regression

## Ghi chú
- Đây là issue hiệu năng kiến trúc render/state, không chỉ là issue canvas.
- Nếu chỉ tối ưu Three scene mà không chặn mission generation trong `drawing`, lag sẽ còn quay lại.
- Nên đo lại sau từng stream để tránh tối ưu sai mục tiêu.

## Trạng thái triển khai
- `Stream A`: chưa làm riêng. Chưa thêm profiler/logging baseline.
- `Stream B`: đã làm.
  - Gate `selectedPatternMission`, `basePatternMission`, `previewBatteryReport` khỏi `drawing`.
- `Stream C`: đã làm.
  - `DrawingCameraController` giờ dùng cached fit distance theo `points` thay vì tính bounds mỗi frame.
- `Stream D`: đã làm một phần quan trọng.
  - Hover state được localize vào `MissionWorld`.
  - Hover updates được coalesce theo `requestAnimationFrame`.
- `Stream E`: đã làm phần hot path chính.
  - Drag vertex giờ coalesce `onUpdatePoint(...)` theo frame thay vì spam theo mọi `pointermove`.
- `Stream F`: verify kỹ thuật đã xong.
  - `pnpm test` pass
  - `pnpm lint` pass
  - `pnpm build` pass
- Manual visual verification trong browser: chưa xác nhận trong plan này.
