# Flight Pattern Picker Left Default Plan

## Mục tiêu

Khi user vẽ xong và `Flight Pattern Picker` xuất hiện:

- picker sẽ `auto xuất hiện ở góc trái viewport`
- vẫn giữ nguyên khả năng `drag để di chuyển`
- vẫn có thể `Reset` để quay về vị trí mặc định mới này

## Vấn đề hiện tại

Hiện tại picker đang dùng auto-position theo `anchor` của polygon:

- `patternPickerAutoPosition = getPatternPickerPosition(patternPickerAnchor, viewportStageSize)`
- hàm `getPatternPickerPosition(...)` trong [App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx) đang:
  - căn theo `anchor.x / anchor.y`
  - chọn `above / below`
  - clamp trong viewport

Điều này làm picker mở gần vùng polygon/path, nên đôi lúc:
- che mất khu vực cần quan sát
- không có vị trí khởi tạo ổn định
- mỗi mission lại mở ở vị trí khác nhau

## Kỳ vọng UX

### Mặc định

- Sau khi close polygon và mở picker:
  - picker xuất hiện ở `góc trái` của viewport
  - vị trí ổn định, dễ đoán
  - không che vùng path chính giữa

### Drag

- User vẫn kéo picker đi được bằng header như hiện tại
- vị trí kéo vẫn bị clamp trong viewport

### Reset

- Khi user bấm `Reset`
  - picker quay về `left default position`
  - không quay về anchor cũ trên polygon nữa

## Hướng triển khai

### Stream A. Đổi auto-position model

- bỏ logic auto-position dựa trên `patternPickerAnchor` cho picker
- thay bằng `left default position` dựa trên `viewportStageSize`

Đề xuất:
- `left = 16px` hoặc cùng margin hệ thống
- `top = 16px` hoặc top offset đủ thoáng dưới hint/status

### Stream B. Giữ manual drag layer

- `patternPickerManualPosition` vẫn giữ nguyên
- Nếu user đã kéo picker:
  - render theo manual position
- Nếu chưa kéo:
  - render theo left default position

### Stream C. Reset behavior

- `Reset` sẽ:
  - clear manual position
  - quay về `left default position`

### Stream D. Remove dependency on anchor for picker placement

- `patternPickerAnchor` vẫn có thể giữ cho mục đích khác nếu cần
- nhưng không còn là nguồn quyết định vị trí picker

### Stream E. Runtime verify

- close polygon -> picker mở ở trái
- drag picker -> vẫn kéo được
- reset -> quay về trái
- resize viewport -> picker vẫn clamp đúng

## Acceptance Criteria

- Picker luôn mở ở góc trái viewport sau khi xuất hiện
- Picker vẫn drag được như hiện nay
- Reset đưa picker về góc trái mặc định
- Không làm vỡ:
  - hover preview pattern
  - click chọn pattern
  - drag/orbit canvas để review

## Ngoài phạm vi

- Không redesign UI của picker
- Không đổi nội dung picker
- Không đổi radial menu

## Trạng thái

- [x] Phân tích logic auto-position hiện tại
- [x] Chốt default-left behavior
- [x] Implement left-default picker positioning
- [ ] Verify runtime
