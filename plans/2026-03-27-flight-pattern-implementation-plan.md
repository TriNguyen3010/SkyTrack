# Flight Pattern Implementation Plan

## 1. Mục tiêu

Triển khai [Flight_Pattern_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Flight_Pattern_Spec.md) theo hướng:

- giữ ổn định flow hiện tại của `Coverage Scan`
- mở rộng dần sang các pattern còn thiếu
- tách rõ `generation`, `preview`, `animation`, `sidebar params`
- không trộn `core route generation` với `polish animation`

File này là plan đối chiếu chính cho mọi lượt implement liên quan tới flight patterns.

## 2. Trạng thái hiện tại

### 2.1. Đã có

- `Coverage Scan` đã generate thật trong codebase
- popup pattern picker đã có
- preview tĩnh cho pattern chưa build đã có trong viewport
- generated camera/reveal cơ bản đã có
- `flightPatterns.ts` đã có metadata và color cho 6 pattern

### 2.2. Chưa có

- generator thật cho:
  - `Perimeter`
  - `Orbit / POI`
  - `Spiral`
  - `Grid`
  - `Corridor`
- params schema riêng theo từng pattern
- generated animation theo spec cho từng pattern
- transition khi đổi pattern từ sidebar
- playback/skip animation state dùng chung

## 3. Nguyên tắc triển khai

1. Build theo thứ tự `generator first`, `animation second`
2. Mỗi pattern phải có:
   - params schema
   - default params
   - preview renderer
   - generator thật
   - generated renderer
3. Không gắn animation đặc thù vào logic generate
4. Dùng một `pattern registry` thay vì `switch` rải rác nhiều nơi
5. Chỉ bật `Generate Path` khi pattern đó có generator thật

## 4. Kiến trúc đề xuất

### 4.1. Pattern registry

Tạo registry thống nhất cho mỗi pattern:

- `id`
- `label`
- `color`
- `implemented`
- `defaultParams`
- `validateParams()`
- `buildPreview()`
- `generateMission()`
- `animationPreset`

### 4.2. Pattern mission output

Chuẩn hóa output của mọi generator về cùng một shape:

- `waypoints`
- `segments`
- `closed`
- `meta`
  - `patternId`
  - `estimatedLength`
  - `loops`
  - `direction`

### 4.3. Animation layer

Tách animation khỏi generator:

- `static preview`
- `selection animation`
- `generated reveal`
- `pattern switch transition`

Mỗi pattern chỉ cung cấp `animationPreset` và dữ liệu cần render; controller animation dùng chung.

## 5. Chia implementation thành 5 streams

### Stream A: Pattern Foundation Refactor

Status: implemented, build/lint passed. Current scope covers registry, shared mission output, and coverage migration into the registry without changing user-facing behavior.

#### Scope

- Tạo `pattern registry`
- Tách `coverage` hiện tại vào registry
- Tạo type cho `PatternParamsMap`
- Gom logic `implemented / preview / label / color` vào một chỗ
- Chuẩn hóa output generator

#### Done khi

- `Coverage Scan` vẫn chạy như hiện tại nhưng qua registry mới
- `App.tsx` không còn phải đặc biệt hóa coverage quá nhiều
- các pattern chưa build vẫn preview được như cũ

### Stream B: Core Route Generators

#### Scope

Build theo thứ tự:

1. `Perimeter`
2. `Orbit / POI`
3. `Grid`
4. `Corridor`
5. `Spiral`

Status update:

- `Perimeter` is now implemented with a generated closed boundary loop using current altitude and default clockwise behavior.
- `Orbit / POI` is now implemented with auto center, auto-fit radius, a single clockwise loop, and generated circular waypoints.
- Advanced perimeter params such as `insetDistance`, `loops`, and `direction` UI are intentionally deferred to `Stream C`.
- Manual POI center and orbit-specific controls are intentionally deferred to `Stream C`.

#### Lý do thứ tự này

- `Perimeter` gần polygon outline nhất, ít rủi ro
- `Orbit` hình học rõ, ít dependency
- `Grid` tái sử dụng nhiều từ `Coverage`
- `Corridor` cần thêm logic trục dài
- `Spiral` cần sampling + clipping, rủi ro cao nhất

#### Done khi

- mỗi pattern generate được `waypoints + segments`
- generated state render đúng màu và semantics
- `Generate Path` không còn bị chặn cho pattern đã xong

### Stream C: Pattern Params UI

#### Scope

- Sidebar params riêng theo từng pattern
- Validation và clamp giá trị
- Reset về default params theo pattern
- Preserve params khi user đổi qua lại giữa các pattern

#### Params cần có

- `Coverage`: `lineSpacing`, `orientation`, `scanAltitude`
- `Perimeter`: `insetDistance`, `loops`, `direction`, `scanAltitude`
- `Orbit`: `centerMode`, `radius`, `waypointCount`, `loops`, `direction`, `scanAltitude`
- `Spiral`: `spiralDirection`, `armSpacing`, `rotationDirection`, `scanAltitude`
- `Grid`: `lineSpacing`, `orientation`, `crossAngle`, `scanAltitude`
- `Corridor`: `passes`, `passSpacing`, `direction`, `scanAltitude`

#### Done khi

- sidebar đổi đúng theo pattern đang chọn
- sửa params sẽ đổi preview/generation tương ứng
- params invalid không làm vỡ mission state

### Stream D: Shared Animation System

#### Scope

- state `animating / skipped / settled`
- click hoặc `Space` để skip animation
- progressive rendering controller
- transition đổi pattern:
  - fade-out path cũ
  - hide waypoints cũ
  - delay ngắn
  - chạy pattern mới

#### Shared rules bám spec

- popup fade-out rồi mới animation bắt đầu
- preview trong popup là `static preview`
- chọn pattern thì chạy `full animation`
- animation phải interruptible

#### Done khi

- mọi pattern dùng chung animation orchestration
- skip không làm sai state cuối
- đổi pattern không bị flicker hoặc mismatch sidebar

### Stream E: Pattern-specific Visual Polish

#### Scope

- `Coverage`: sweep fill + zigzag connector emphasis
- `Perimeter`: border highlight + direction arrows
- `Orbit`: center pulse + rotating radius sweep
- `Spiral`: seed glow + spiral draw
- `Grid`: 2-layer sweep + intersection flash
- `Corridor`: axis reveal + corridor band expand

#### Ghi chú

- stream này chỉ làm sau khi `generator + params + shared animation` đã ổn
- đây là lớp fidelity, không phải blocker của mission generation

## 6. Mapping pattern theo độ khó

### Low risk

- `Perimeter`
- `Orbit`

### Medium risk

- `Grid`
- `Corridor`

### High risk

- `Spiral`

## 7. Thứ tự triển khai khuyến nghị

1. `Stream A`
2. `Perimeter`
3. `Orbit`
4. `Grid`
5. `Corridor`
6. `Spiral`
7. `Stream C` polish hoàn chỉnh cho params
8. `Stream D`
9. `Stream E`

## 8. Acceptance criteria tổng

- mỗi pattern đã build phải preview đúng và generate đúng
- generated path nằm đúng altitude plane hiện tại
- sidebar params sync đúng với pattern
- đổi pattern không làm mất polygon hoặc hỏng camera state
- animation có thể skip, state cuối vẫn đúng
- pattern chưa build phải hiện rõ là `preview only`, không giả vờ đã hỗ trợ

## 9. Backlog cụ thể theo pattern

### 9.1. Perimeter

- offset / inset polygon
- loops + direction
- start marker
- perimeter animation preset

### 9.2. Orbit

- auto center
- manual center
- radius auto-fit
- looped circular mission
- orbit animation preset

### 9.3. Grid

- reuse coverage generator 2 lần
- nối bộ 1 sang bộ 2 tối ưu hơn
- grid animation preset

### 9.4. Corridor

- trục dài nhất theo bounding box
- multiple parallel passes
- zigzag linking
- corridor band preview

### 9.5. Spiral

- spiral sampling
- point-in-polygon clipping
- inward / outward
- clockwise / counter-clockwise

## 10. Risks

- inset polygon cần thư viện hoặc thuật toán offset ổn định
- manual POI center sẽ chạm vào interaction trên viewport
- spiral clipping có thể cho waypoint dày hoặc méo nếu sample không tốt
- animation + camera reveal có thể conflict nếu cùng điều khiển scene
- đổi pattern liên tục từ sidebar dễ tạo race condition giữa animation và generation

## 11. Checklist đối chiếu

- [x] Stream A: Pattern foundation refactor
- [x] Build `Perimeter`
- [x] Build `Orbit / POI`
- [ ] Build `Grid`
- [ ] Build `Corridor`
- [ ] Build `Spiral`
- [ ] Stream C: Pattern params UI
- [ ] Stream D: Shared animation system
- [ ] Stream E: Pattern-specific visual polish
- [ ] Dùng file này làm nguồn đối chiếu khi implement Flight Pattern Spec
