# Preview Camera Gentle Orbit Angle Plan

## Mục tiêu

Đề xuất một góc camera `xoay nhẹ` để user bớt cảm giác khung nhìn bị “fix cứng” trên màn hình, nhưng vẫn giữ được:

- overview rõ toàn bộ path
- cảm giác 3D đủ tự nhiên
- không gây chóng mặt hoặc mất tập trung

## Bối cảnh hiện tại

Preview camera hiện đang bám theo pose cố định:

- `position = [122.50, 164.55, 184.36]`
- `target = [-1.47, 50.00, 5.30]`
- `distance ≈ 246.07`
- `polar ≈ 62.3°`
- `azimuth ≈ 34.7°`
- `fov = 34`

Pose này cho overview khá ổn, nhưng vì camera gần như đứng yên nên user dễ có cảm giác:

- cảnh bị “đóng băng”
- thiếu chiều sâu
- path preview hơi mechanical

## Đề xuất góc xoay nhẹ

### Base pose giữ nguyên

- `base azimuth = 34.7°`
- `base polar = 62.3°`
- `base distance = 246`
- `base fov = 34`

### Orbit envelope đề xuất

#### Phương án khuyến nghị

- `azimuth amplitude = ±4.5°`
- `polar amplitude = ±1.2°`
- `distance drift = 0`
- `cycle duration = 12s`

Khoảng hoạt động thực tế:

- `azimuth range ≈ 30.2° -> 39.2°`
- `polar range ≈ 61.1° -> 63.5°`

Đây là mức đủ để:

- user thấy camera đang “thở”
- nhưng không đủ mạnh để làm path bị lệch khung nhìn nhiều

#### Phương án mềm hơn nếu vẫn thấy động nhiều

- `azimuth amplitude = ±3.2°`
- `polar amplitude = ±0.8°`
- `cycle duration = 14s`

#### Phương án mạnh hơn nếu muốn cinematic hơn một chút

- `azimuth amplitude = ±6.0°`
- `polar amplitude = ±1.6°`
- `cycle duration = 10s`

Không khuyến nghị vượt quá:

- `azimuth ±7°`
- `polar ±2°`

vì lúc đó overview bắt đầu dao động quá rõ.

## Motion model đề xuất

### Kiểu chuyển động

Dùng orbit rất nhẹ quanh `fixed target`, không phải camera follow.

Đề xuất:

- `azimuth(t) = baseAzimuth + sin(t) * azimuthAmplitude`
- `polar(t) = basePolar + cos(t) * polarAmplitude`

Ưu điểm:

- mượt
- có loop tự nhiên
- không random
- dễ tune

### Phase offset

- cho `polar` lệch pha `90°` so với `azimuth`

Mục đích:

- tránh cảm giác chỉ lắc ngang đơn điệu
- tạo cảm giác “drift” tự nhiên hơn

## Guard đề xuất

### 1. Không đổi distance

Trong phase đầu, giữ `distance` cố định.

Lý do:

- user cần overview ổn định
- zoom in/out nhẹ thường làm cảm giác “camera đang tự điều khiển quá nhiều”

### 2. Clamp góc

Giữ envelope:

- `azimuth`: chỉ dao động trong range đã định
- `polar`: không xuống thấp hơn `60°`
- `polar`: không lên cao hơn `64°`

### 3. Chỉ áp cho preview

Áp dụng cho:

- hover preview trong `Flight Pattern Picker`
- one-shot preview trong editing flow

Không áp dụng mặc định cho:

- generated playback
- editing camera bình thường
- user manual orbit ngoài preview

## Khi nào nên giảm biên độ

Nên tự giảm amplitude nếu:

- polygon/path quá lớn
- corridor quá dài
- viewport nhỏ

Rule đơn giản:

- mission càng rộng -> giảm `azimuth amplitude`
- ưu tiên giữ overview hơn là motion

## Đề xuất triển khai

### Stream A. Freeze base pose

- giữ base pose hiện tại làm anchor chính

### Stream B. Add gentle orbit profile

- add preview orbit profile riêng:
  - `azimuthAmplitudeDeg = 4.5`
  - `polarAmplitudeDeg = 1.2`
  - `cycleDurationMs = 12000`

### Stream C. Envelope guard

- clamp nhẹ:
  - `polar 61° -> 63.5°`
  - `distance` không đổi

### Stream D. Pattern sensitivity

- `coverage/grid/corridor`: có thể giảm về `±3.5°`
- `orbit/perimeter/spiral`: giữ `±4.5°`

### Stream E. Runtime verify

Check:

- user còn thấy toàn path rõ không
- chuyển động có quá lộ không
- có gây cảm giác “camera tự quay nhiều” không

## Acceptance Criteria

- Preview camera không còn cảm giác đứng im hoàn toàn.
- User vẫn nhìn rõ tổng quan path.
- Chuyển động nhẹ, chậm, không gây rối mắt.
- Camera không bị trôi quá xa hoặc hạ quá thấp.

## Kết luận

Nếu cần chốt một cấu hình duy nhất để thử trước, mình khuyên dùng:

- `base azimuth = 34.7°`
- `base polar = 62.3°`
- `azimuth amplitude = ±4.5°`
- `polar amplitude = ±1.2°`
- `cycle = 12s`
- `distance = fixed`

Đây là điểm cân bằng tốt giữa:

- bớt cảm giác fixed
- vẫn giữ overview để quan sát đường bay

## Trạng thái

- [x] Chốt base pose hiện tại
- [x] Đề xuất envelope góc xoay nhẹ
- [x] Đề xuất cycle + guard
- [x] Implement nếu cần
