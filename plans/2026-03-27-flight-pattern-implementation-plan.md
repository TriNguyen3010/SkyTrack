# Flight Pattern Implementation Plan

## 1. Mục tiêu

Triển khai [Flight_Pattern_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Flight_Pattern_Spec.md) theo hướng:

- giữ ổn định flow hiện tại của `Coverage Scan`
- mở rộng dần sang các pattern còn thiếu
- tách rõ `generation`, `preview`, `animation`, `sidebar params`
- không trộn `core route generation` với `polish animation`

File này là plan đối chiếu chính cho mọi lượt implement liên quan tới flight patterns.

## 2. Quy ước đối chiếu khi implement

Thứ tự ưu tiên khi implement `Flight Pattern Spec`:

1. [Flight_Pattern_Spec.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/Flight_Pattern_Spec.md) là spec sản phẩm và animation gốc.
2. File này là `implementation source of truth` cho:
   - phạm vi đang làm trong codebase hiện tại
   - thứ tự build
   - phần nào đã hoàn thành
   - phần nào deferred hoặc chưa nên làm ngay
3. [EXECUTION_PLAN.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/EXECUTION_PLAN.md) chỉ dùng để đối chiếu roadmap tổng, không dùng để override checklist chi tiết trong file này.

Quy ước làm việc:

- Trước khi implement một hạng mục mới trong `Flight_Pattern_Spec.md`, phải kiểm tra file này trước để xác nhận nó thuộc `Stream` nào.
- Nếu spec gốc và implementation hiện tại lệch nhau, cập nhật file này trước rồi mới sửa code.
- Nếu một phần bị defer, theo dõi ở file plan/backlog riêng thay vì để lẫn vào checklist core của file này.

## 3. Trạng thái hiện tại

### 3.1. Đã có

- `Coverage Scan` đã generate thật trong codebase
- popup pattern picker đã có
- preview tĩnh cho pattern chưa build đã có trong viewport
- generated camera/reveal cơ bản đã có
- `flightPatterns.ts` đã có metadata và color cho 6 pattern
- params schema riêng cho 6 pattern đã có
- sidebar params riêng theo pattern đã có, có clamp và preserve khi user đổi qua lại giữa các pattern

### 3.2. Chưa có

- generated animation theo spec cho từng pattern
- transition khi đổi pattern từ sidebar
- playback/skip animation state dùng chung
- manual POI center qua viewport interaction

## 4. Nguyên tắc triển khai

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

## 5. Kiến trúc đề xuất

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

## 6. Chia implementation thành 5 streams

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
- `Grid` is now implemented by combining two coverage sweeps using current spacing/orientation and a default `90°` cross angle.
- `Corridor` is now implemented with a centered medial pass and automatic direction using the polygon's dominant axis.
- `Spiral` is now implemented with an inward clockwise clipped spiral using default arm spacing.
- Param controls for these generators are now handled in `Stream C`.

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

Status: implemented, build/lint passed. Sidebar now preserves params per pattern, clamps invalid values, and updates preview/generation through the shared registry. Orbit manual center is currently exposed through numeric `X/Y` inputs rather than viewport click placement.

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

Status: implemented, build/lint passed. The viewport now shares one animation orchestration layer for pattern transitions and generated route reveal, with interruptible playback via click or `Space`. Camera reveal remains coordinated with the same lock/skip behavior.

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

Status: implemented, build/lint passed. Viewport now adds pattern-specific polish overlays on top of shared animation: coverage sweep emphasis, perimeter direction arrows, orbit center/radius sweep, spiral seed/tip glow, grid layer/intersection flashes, and corridor axis band treatment.

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

## 7. Mapping pattern theo độ khó

### Low risk

- `Perimeter`
- `Orbit`

### Medium risk

- `Grid`
- `Corridor`

### High risk

- `Spiral`

## 8. Thứ tự triển khai khuyến nghị

1. `Stream A`
2. `Perimeter`
3. `Orbit`
4. `Grid`
5. `Corridor`
6. `Spiral`
7. `Stream C` polish hoàn chỉnh cho params
8. `Stream D`
9. `Stream E`

## 9. Acceptance criteria tổng

- mỗi pattern đã build phải preview đúng và generate đúng
- generated path nằm đúng altitude plane hiện tại
- sidebar params sync đúng với pattern
- đổi pattern không làm mất polygon hoặc hỏng camera state
- animation có thể skip, state cuối vẫn đúng
- pattern chưa build phải hiện rõ là `preview only`, không giả vờ đã hỗ trợ

## 10. Backlog cụ thể theo pattern

### 9.1. Perimeter

- offset / inset polygon
- loops + direction
- start marker
- perimeter animation preset

### 9.2. Orbit

- auto center
- manual center qua viewport
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

## 11. Risks

- inset polygon cần thư viện hoặc thuật toán offset ổn định
- manual POI center sẽ chạm vào interaction trên viewport
- spiral clipping có thể cho waypoint dày hoặc méo nếu sample không tốt
- animation + camera reveal có thể conflict nếu cùng điều khiển scene
- đổi pattern liên tục từ sidebar dễ tạo race condition giữa animation và generation

## 12. Checklist đối chiếu

- [x] Stream A: Pattern foundation refactor
- [x] Build `Perimeter`
- [x] Build `Orbit / POI`
- [x] Build `Grid`
- [x] Build `Corridor`
- [x] Build `Spiral`
- [x] Stream C: Pattern params UI
- [x] Stream D: Shared animation system
- [x] Stream E: Pattern-specific visual polish
- [x] Dùng file này làm nguồn đối chiếu khi implement Flight Pattern Spec
