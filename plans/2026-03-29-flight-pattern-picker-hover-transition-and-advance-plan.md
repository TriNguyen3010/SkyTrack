# Flight Pattern Picker Hover Transition And Advance Plan

## Mục tiêu
- Khi user hover từ pattern này sang pattern khác, preview của pattern trước phải tắt sạch trước khi preview pattern mới bắt đầu.
- Khi user click một pattern, app phải hiểu đó là hành động `chọn và đi tiếp`, không giữ user trong trạng thái review lửng.
- Giữ nguyên các thuộc tính đã có của picker:
  - mở ở góc trái viewport
  - kéo được bằng header
  - drag/orbit canvas để review path

## Vấn đề hiện tại
- Review hiện chạy dựa trên `hoveredPattern` trong [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx).
- Effect preview loop ở [src/App.tsx:958](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L958) có logic `setSimulationSession(...)`, nhưng chưa tách rõ:
  - `teardown preview cũ`
  - `start preview mới`
- `handleSelectPattern()` ở [src/App.tsx:1684](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L1684) hiện:
  - chọn pattern
  - set lại `hoveredPattern`
  - chạy `one-shot preview`
  - nhưng chưa đưa user sang `next step`
- Copy hiện tại của picker ở [src/App.tsx:2194](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx#L2194) vẫn thiên về `hover để review, click để chọn`, chưa nói rõ `click là đi tiếp`.

## Giả định chốt cho plan này
- `Bước kế tiếp` được hiểu là:
  - commit pattern đã chọn
  - đóng `Flight Pattern Picker`
  - trả user về flow chính của `editing`
  - giữ selection ở pattern vừa chọn để user chỉnh tiếp ở sidebar/canvas
- Nếu pattern có preview simulation, có thể chạy `one-shot transition preview`, nhưng không để picker còn mở và không giữ hover-review state cũ.

## Hướng xử lý chốt

### 1. Tách rõ review session state
- Phân biệt 2 loại preview:
  - `hover review preview`
  - `click confirm preview`
- Hover đổi pattern phải có `teardown -> settle -> start new preview`.
- Không để reuse mơ hồ `hoveredPattern` làm cả review state lẫn selected-final state.

### 2. Explicit handoff khi hover đổi pattern
- Khi `hoveredPattern` đổi:
  - stop preview loop của pattern cũ
  - clear telemetry tạm nếu cần
  - sau đó mới start preview loop của pattern mới
- Không để 2 loop session chồng lên nhau hoặc carry-over camera state sai.

### 3. Click = commit + advance
- Khi user click vào tile:
  - set pattern đó thành selected
  - clear hover-review state
  - đóng picker
  - chạy bước tiếp theo của flow
- Nếu cần `one-shot preview`, nó phải được xem là transition effect sau commit, không phải giữ user trong picker.

### 4. UX copy phải phản ánh behavior mới
- Subtitle của picker phải nói rõ:
  - hover để review
  - click để chọn và tiếp tục
- Trạng thái tile nên tách rõ:
  - `is-reviewing`
  - `is-selected`

## Kế hoạch triển khai

### Stream A. Hover transition model
- Audit lại state hiện có:
  - `hoveredPattern`
  - `selectedPattern`
  - `simulationSession`
- Tạo luồng rõ ràng cho `previous hovered pattern` và `current hovered pattern`.

### Stream B. Preview teardown trước khi start preview mới
- Khi hover đổi tile:
  - tắt preview loop đang chạy
  - reset phần transient cần thiết
  - rồi mới start loop mới
- Đảm bảo không còn trường hợp preview cũ chưa tắt hẳn mà preview mới đã bật.

### Stream C. Click-to-advance flow
- Sửa `handleSelectPattern()` để:
  - commit selection
  - đóng picker
  - clear hover/review state
  - đưa user sang bước tiếp theo
- Nếu cần, để `one-shot preview` chạy sau commit như transition ngắn.

### Stream D. Picker copy và visual state
- Cập nhật copy trong header/subtitle.
- Tile đang hover review và tile đã chốt selected cần khác nhau về nghĩa hiển thị.

### Stream E. Runtime verify
- Hover pattern A rồi sang pattern B:
  - A dừng trước, B mới chạy
- Click pattern:
  - picker đóng
  - app đi tiếp đúng flow
  - selection giữ đúng pattern vừa bấm

## Acceptance criteria
- Hover sang pattern khác không còn cảm giác preview cũ và preview mới chồng nhau.
- Chỉ có một hover-review preview active tại một thời điểm.
- Click một pattern sẽ chọn ngay và đưa user sang bước kế tiếp.
- Sau click, picker không còn che canvas nữa.
- Sidebar/canvas phản ánh đúng pattern đã chọn.

## Trạng thái
- `Stream A`: đã làm
- `Stream B`: đã làm
- `Stream C`: đã làm
- `Stream D`: đã làm
- Verify:
  - `pnpm lint` pass
  - `pnpm test` pass
  - `pnpm build` pass
  - Runtime verify: pending
