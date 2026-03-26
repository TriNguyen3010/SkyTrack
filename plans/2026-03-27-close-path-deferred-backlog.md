# Close Path Deferred Backlog

## 1. Mục tiêu

Tách toàn bộ phần `deferred` ra khỏi core flow của spec [2026-03-27-ui-ux-close-path-implementation-plan.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-ui-ux-close-path-implementation-plan.md), để implementation chính chỉ còn:

- close loop UX
- pattern picker popup
- camera during drawing
- camera after generate

Các mục trong file này là **nice-to-have / polish / enhancement**, không còn chặn core flow.

## 2. Các hạng mục deferred đã tách ra

### 2.1. Generated path trace animation

Mô tả:

- animate route line theo kiểu trace dần từ waypoint đầu đến waypoint cuối
- có thể đi kèm waypoint pop-in hoặc connector reveal

Lý do chưa đưa vào core:

- đây là hiệu ứng trình diễn, không bắt buộc để generated flow usable
- tăng complexity cho camera + timing orchestration

Done khi:

- path trace không làm vỡ generated reveal hiện tại
- user vẫn có thể hiểu route rõ ràng ngay cả khi animation đang chạy

### 2.2. Quick-view presets

Mô tả:

- preset camera như `Top`, `Angled`, `Orbit Focus`, `Mission Fit`
- shortcut để user nhảy nhanh giữa các góc nhìn

Lý do chưa đưa vào core:

- core flow hiện chỉ cần framing ổn định và recenter đủ mượt
- preset views là UX enhancement, chưa phải blocker

Done khi:

- preset không conflict với `OrbitControls`
- switching view không gây giật hoặc mất orientation

### 2.3. Altitude toggle auto-shift

Mô tả:

- khi đổi cách hiển thị altitude / layer, camera tự shift nhẹ để giữ mission readable

Lý do chưa đưa vào core:

- hiện chưa có altitude display mode riêng đủ lớn để justify behavior này
- dễ làm camera trở nên “tự ý” quá mức

Done khi:

- toggle altitude không làm user mất vị trí hiện tại
- shift là tinh chỉnh nhẹ, không giống auto-fit toàn phần

## 3. Quy ước scope từ bây giờ

### 3.1. Core flow

Bao gồm:

- `Workstream A`
- `Workstream B`
- `Workstream C`
- `Workstream D`
- runtime verify của các workstream trên

### 3.2. Deferred flow

Bao gồm:

- generated path trace animation
- quick-view presets
- altitude toggle auto-shift

## 4. Nơi theo dõi tiếp

- Core flow tiếp tục theo dõi ở [2026-03-27-ui-ux-close-path-implementation-plan.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-27-ui-ux-close-path-implementation-plan.md)
- Deferred items được theo dõi riêng trong file này
- Nếu thực sự triển khai deferred item, nên tạo plan implementation nhỏ hơn từ file này

## 5. Checklist

- [x] Tách deferred items ra khỏi core flow plan
- [ ] Chọn deferred item ưu tiên đầu tiên nếu cần làm tiếp
- [ ] Tạo implementation plan riêng cho deferred item được chọn
