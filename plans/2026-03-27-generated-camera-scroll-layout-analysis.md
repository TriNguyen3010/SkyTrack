# Generated Camera Scroll/Layout Analysis

## 1. Bối cảnh

Sau khi user bấm `Generate Path`, UI phía phải xuất hiện rất nhiều waypoint/action rows trong `Vehicle Behavior`. Có nghi ngờ rằng lượng nội dung này làm màn hình bị scroll xuống và camera generated bị lệch theo.

Mục tiêu của file này là phân tích nguyên nhân khả dĩ trong code hiện tại trước khi fix.

Status:

- `Fix Layer A` has been implemented in CSS layout containment.
- `pnpm build` passed.
- `pnpm lint` passed.
- Manual browser verification is still needed to confirm whether `Fix Layer B` remains necessary.

## 2. Kết luận sơ bộ

Khả năng cao nhất hiện tại là:

1. `sidebar` quá dài làm **toàn bộ page cao lên**
2. `workspace` bị stretch theo chiều cao của `sidebar`
3. `viewport-stage` và `canvas` cũng bị stretch theo chiều cao mới
4. camera fit/reveal cho generated state chạy **trước hoặc trong lúc** canvas đang đổi size
5. sau khi canvas đổi aspect ratio, framing bị lệch

Nói ngắn gọn:

- scroll của page có thể là **triệu chứng**
- nguyên nhân kỹ thuật gốc khả năng cao là **layout resize của canvas trong generated state**

## 3. Phân tích theo code hiện tại

### 3.1. Layout shell hiện cho phép page cao lên

Trong [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css:1):

- `.app-shell` đang dùng `min-height: 100vh`
- không có `height: 100vh`
- không có `overflow: hidden`

Điều này có nghĩa là app **không bị khóa trong viewport height**. Nếu một vùng con cao hơn, toàn bộ document có thể dài ra và xuất hiện page scroll.

### 3.2. `workspace` bị kéo theo child cao nhất

Trong [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css:84):

- `.workspace` là grid 2 cột
- không có cơ chế khóa chiều cao hàng grid

Khi `sidebar` cao lên, grid row sẽ lấy chiều cao của child cao nhất. Vì grid item mặc định stretch, `viewport-panel` cũng bị kéo cao theo.

### 3.3. `sidebar` hiện không có internal scroll

Trong [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css:519):

- `.sidebar` chỉ là `display: flex`
- không có `min-height: 0`
- không có `overflow-y: auto`

Khi generated state render danh sách waypoint dài trong [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx:838), sidebar sẽ tiếp tục cao thêm thay vì tự scroll bên trong.

### 3.4. `viewport-stage` đang phụ thuộc vào chiều cao layout cha

Trong [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css:91) và [src/App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css:98):

- `.viewport-panel` có `min-height: 680px`
- `.viewport-stage` có `height: 100%`

Khi grid row bị kéo cao bởi `sidebar`, canvas cũng tăng chiều cao theo. Điều này làm thay đổi aspect ratio của `PerspectiveCamera`.

### 3.5. Generated camera fit hiện chạy theo stage transition, chưa bám layout settle

Trong [src/components/MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx:906), `GeneratedCameraController` bắt đầu reveal ngay khi `stage` đổi sang `generated`.

Trong cùng thời điểm đó, [src/App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx:794) render thêm:

- generated summary
- behavior overview
- toàn bộ waypoint rows
- action editor state

Điều này có thể dẫn tới chuỗi sự kiện:

1. stage chuyển sang `generated`
2. controller tính `fit frame` dựa trên canvas size hiện tại
3. sidebar mount thêm nội dung, layout thay đổi
4. canvas resize và `camera.aspect` đổi
5. framing cũ không còn đúng nữa

### 3.6. Camera không thực sự “neo theo scroll”

Trong phần camera logic hiện tại:

- fit/reveal dùng world coordinates + camera aspect
- không có logic nào chủ động bám vào `window.scrollY`

Vì vậy, “camera neo theo scroll” nhiều khả năng là cảm giác phát sinh từ:

- canvas bị resize
- viewport visible area thay đổi
- page bị trượt xuống vì document cao lên

chứ không phải do camera đọc scroll position để di chuyển.

## 4. Giả thuyết mạnh nhất

Giả thuyết ưu tiên số 1:

> Generated sidebar làm `workspace` cao lên, kéo `viewport-stage` và `canvas` cao theo. Camera reveal/fit được tính trước khi canvas ổn định kích thước, nên sau resize thì composition bị lệch.

## 5. Hướng fix đề xuất

### Fix Layer A: Khóa layout để canvas không bị stretch theo sidebar

1. Đổi `.app-shell` sang layout cố định theo viewport:
   - `height: 100vh`
   - `overflow: hidden`
2. Giữ `.workspace` trong vùng còn lại của màn hình:
   - `min-height: 0`
3. Cho `sidebar` tự scroll bên trong:
   - `min-height: 0`
   - `overflow-y: auto`
4. Giữ `viewport-panel`/`viewport-stage` bám vào vùng còn lại, không phình theo sidebar

### Fix Layer B: Chạy generated fit sau khi layout settle

1. Delay reveal/fit thêm `requestAnimationFrame` hoặc `ResizeObserver`-based settle
2. Chỉ bắt đầu generated camera reveal khi canvas size đã ổn định
3. Nếu canvas resize trong generated state, cân nhắc refit nhẹ một lần

### Fix Layer C: Tách scroll vùng danh sách waypoint

Nếu sidebar vẫn quá cao:

1. Giữ top summary cố định
2. cho riêng `behavior-list` scroll
3. tránh làm cả sidebar hoặc cả page dài vô hạn

## 6. Acceptance criteria

- Sau `Generate Path`, page không tạo thêm document scroll ngoài ý muốn
- Sidebar dài thì tự scroll nội bộ
- Canvas không đổi chiều cao chỉ vì waypoint list dài lên
- Generated reveal dùng đúng aspect ratio cuối cùng
- Camera framing sau generate ổn định, không bị dồn xuống dưới hoặc lệch sang một bên do layout shift

## 7. Thứ tự xử lý khuyến nghị

1. Fix layout containment cho `app-shell / workspace / sidebar`
2. Verify xem lỗi camera còn tồn tại không
3. Nếu còn, thêm `layout-settled fit` trong `GeneratedCameraController`
4. Sau cùng mới polish behavior-list scrolling UX
