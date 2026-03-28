# Exclusion Zones Implementation Plan

## 1. Mục tiêu

Triển khai spec [2026-03-28-exclusion-zones-proposal.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-exclusion-zones-proposal.md) theo hướng:

- cho phép user đánh dấu các `excluded areas` bên trong mission boundary
- pattern generation tự động bỏ phần scan nằm trong zone loại trừ
- UI chỉ lộ ra khi user đã vào `editing/generated`, giữ đúng progressive disclosure hiện tại
- ưu tiên `soft exclusion / no-scan` ở v1, chưa kéo `hard no-fly + route-around pathfinding` vào ngay

File này là plan đối chiếu chính cho mọi lượt implement liên quan tới exclusion zones trong codebase hiện tại.

## 2. Quy ước đối chiếu khi implement

Thứ tự ưu tiên:

1. [2026-03-28-exclusion-zones-proposal.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-exclusion-zones-proposal.md) là spec sản phẩm và business logic gốc.
2. File này là `implementation source of truth` cho:
   - scope v1 build ngay
   - phần nào deferred
   - cách map spec vào codebase hiện tại
3. [EXECUTION_PLAN.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/EXECUTION_PLAN.md) chỉ dùng để đối chiếu roadmap tổng.

Quy ước làm việc:

- Trước khi sửa code, kiểm tra file này để xác nhận hạng mục thuộc stream nào.
- Nếu spec gốc và kiến trúc hiện tại lệch nhau, cập nhật file này trước rồi mới implement.
- `No-fly`, `route-around`, `GeoJSON/KML import`, `preset legal zones`, `multi-altitude exclusion` không chặn v1.

Trạng thái hiện tại:

- File này đã được chốt làm nguồn đối chiếu chính cho mọi lượt implement tiếp theo liên quan tới `Exclusion Zones Spec`.

## 3. Trạng thái hiện tại của codebase

### 3.1. Đã có

- App đã có đầy đủ stage:
  - `idle`
  - `setup`
  - `drawing`
  - `editing`
  - `generated`
- [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts) đã có:
  - `points`
  - `waypoints`
  - `stage`
  - pattern params
  - waypoint actions
  - battery-related mission inputs
- [flightPatterns.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/flightPatterns.ts) đã có pattern registry và generator thật cho:
  - `coverage`
  - `perimeter`
  - `orbit`
  - `grid`
  - `corridor`
  - `spiral`
- [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx) đã có:
  - altitude plane drawing
  - boundary polygon render
  - drawing/edit/generated camera flow
  - preview/generate overlays theo pattern
- Battery estimation hiện đã là `derived data` theo `waypoints`, nên nếu exclusion làm regenerate route đúng thì battery report sẽ tự cập nhật theo.

### 3.2. Chưa có

- clipping utilities cấp segment
- point-in-any-exclusion utilities
- exclusion-specific validation/warnings
- viewport render nhiều polygon cùng lúc
- sidebar CRUD cho exclusion zones
- pattern integration với exclusion-aware context

### 3.3. Assumption quan trọng đang phải phá vỡ

Hiện codebase vẫn mặc định:

- mission chỉ có `1 polygon boundary`
- preview fill/outline chỉ build từ `points`
- drawing logic chỉ thao tác với `points`
- pattern context chỉ nhận `points`

Đây là lý do implementation nên bắt đầu từ `data model + geometry + drawing target`, không nên nhảy thẳng vào UI toggle trước.

## 4. Quyết định scope cho v1

### 4.1. Build ngay trong v1

- `soft exclusion` duy nhất:
  - nghĩa là `skip this area`
  - không scan trong zone
  - vẫn cho phép transit đi qua zone nếu generator hiện tại không route-around
- nhiều exclusion zones
- CRUD cơ bản:
  - add
  - toggle enable/disable
  - rename
  - delete
- drawing zone mới trên altitude plane
- clip/filer path output theo zone cho toàn bộ pattern
- viewport render zone fill + dashed outline + label
- warnings cơ bản:
  - polygon không đủ điểm
  - polygon tự cắt
  - zone nằm ngoài boundary
  - zone quá nhỏ
  - zone che phủ hết mission

### 4.2. Deferred sau v1

- `hard no-fly` zone type
- `route-around` transit
- external import `GeoJSON / KML`
- preset zones
- multi-altitude exclusion
- undo/redo riêng cho zone operations
- full drag-edit vertex cho existing exclusion zones nếu stream đầu chưa đủ ổn

### 4.3. Quyết định implementation quan trọng cho v1

1. Nội bộ vẫn dùng tên `ExclusionZone`, nhưng UI nên dùng `Excluded area` hoặc `Vùng loại trừ`.
2. V1 ưu tiên `coverage / grid / corridor` bằng segment clipping trước, vì đây là nơi value cao nhất.
3. `perimeter / orbit / spiral` trong v1 sẽ dùng waypoint filtering thay vì boolean polygon operations.
4. Khi zone thay đổi:
   - nếu đang ở `generated`, mission phải regenerate ngay
   - battery và waypoint interactions tự update theo mission mới
5. `Reset mission` có thể xoá zones.
   - nhưng `Edit boundary` không nên tự xoá zones; thay vào đó giữ nguyên và warning nếu zone nằm ngoài boundary mới.

## 5. Gaps từ spec cần encode ngay từ đầu

Các điểm này nếu không chốt sớm sẽ gây rework:

1. `drawingTarget` phải là state thật trong store, không chỉ là local UI flag.
2. `activeExclusionZoneId` phải tách riêng với `selectedWaypointId` và các selection khác.
3. Validation cho exclusion phải reuse logic `simple polygon` hiện có, tránh copy-paste một bộ hình học thứ hai.
4. `FlightPatternBuildContext` cần nhận `enabled exclusion zones only`.
5. `clipSegmentsAgainstExclusions()` phải có `epsilon` + dedupe intersections, nếu không sẽ sinh sub-segment rác ở case chạm cạnh.
6. Với v1, segment nằm đúng trên cạnh exclusion được coi là `outside`, đúng theo spec.
7. V1 chưa cần pathfinding transit; nếu segment bị cắt ra nhiều nhóm, generator hiện tại chỉ cần trả các đoạn scan sạch. Transit semantics vẫn do ordered waypoint flow hiện có chịu trách nhiệm.

## 6. Mapping vào kiến trúc hiện tại

### 6.1. Store

Mở rộng [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts) với:

- `exclusionZones: ExclusionZone[]`
- `activeExclusionZoneId: number | null`
- `drawingTarget: 'boundary' | 'exclusion'`
- actions:
  - `addExclusionZone`
  - `removeExclusionZone`
  - `renameExclusionZone`
  - `toggleExclusionZone`
  - `setActiveExclusionZone`
  - `setDrawingTarget`
  - `addExclusionPoint`
  - `updateExclusionPoint`
  - `closeExclusionZone`

### 6.2. Geometry

Tách shared logic vào:

```text
src/lib/
  exclusionGeometry.ts
  exclusionValidation.ts
```

Nội dung chính:

- `isPointInAnyExclusion`
- `clipSegmentAgainstPolygon`
- `clipSegmentsAgainstExclusions`
- intersection helpers
- bbox pre-check
- validation helpers và warning helpers

### 6.3. Patterns

Mở rộng [flightPatterns.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/flightPatterns.ts):

- `FlightPatternBuildContext.exclusionZones`
- segment-based patterns:
  - `coverage`
  - `grid`
  - `corridor`
- waypoint-filter patterns:
  - `perimeter`
  - `orbit`
  - `spiral`

### 6.4. UI / Viewport

Các insertion points chính:

- [App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx)
  - nút `Add excluded area`
  - zone list trong editing/generated
  - warning blocks
- [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx)
  - render nhiều zone
  - drawing visuals cho exclusion
  - click/hover/select zone
- [App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css)
  - style list, badge, warning, zone chip

Battery engine chưa cần sửa trực tiếp.

## 7. Chia implementation thành 5 streams

### Stream A: Data Model + Store Foundation

Status: implemented, build/lint/test passed. `ExclusionZone`, `drawingTarget`, `activeExclusionZoneId`, CRUD/store actions, and boundary-vs-exclusion drawing transitions are now in place inside [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts), with store transition coverage in [useMissionStore.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.test.ts).

#### Scope

- thêm type `ExclusionZone`
- thêm store state:
  - `exclusionZones`
  - `activeExclusionZoneId`
  - `drawingTarget`
- thêm CRUD/actions nền
- chốt id strategy cho zones và zone points
- bảo đảm reset/stage transition không làm zones rơi vào state mồ côi

#### Done khi

- app có thể lưu nhiều zones trong store
- switching giữa `boundary` và `exclusion` là deterministic
- regenerate/redraw/reset không làm crash selection state

### Stream B: Geometry + Validation Core

Status: implemented, build/lint/test passed. Shared exclusion clipping and validation utilities now live in [exclusionGeometry.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/exclusionGeometry.ts) and [exclusionValidation.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/exclusionValidation.ts), with coverage for clipping, edge-touch tolerance, outside-boundary warnings, and overlap detection in [exclusionGeometry.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/exclusionGeometry.test.ts) and [exclusionValidation.test.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/lib/exclusionValidation.test.ts).

#### Scope

- tạo `exclusionGeometry.ts`
- implement:
  - `isPointInAnyExclusion`
  - `clipSegmentAgainstPolygon`
  - `clipSegmentsAgainstExclusions`
- tạo `exclusionValidation.ts`
- implement warnings:
  - `< 3 points`
  - self-intersection
  - outside boundary
  - overlapping zones
  - fully-covered mission
  - too-small zone
- unit tests cho concave polygon, edge-touch, zero-result

#### Done khi

- có thể clip segment sạch, không sinh đoạn rất ngắn bất thường
- `0 zones` trả input nguyên bản
- tests pass cho các case nền tảng

### Stream C: Drawing Flow + Sidebar CRUD + Viewport Rendering

Status: implemented, build/lint/test passed. Editing/generated sidebar now exposes `Excluded Areas`, drawing can switch to `drawingTarget = exclusion`, and the viewport renders exclusion fills, dashed outlines, labels, and selection states through [App.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.tsx), [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx), and [App.css](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/App.css).

#### Scope

- thêm entry point `Add excluded area` trong editing/generated
- khi add zone:
  - `drawingTarget = exclusion`
  - boundary mờ đi
  - zone đang vẽ dùng fill/outline đỏ hoặc cam nét đứt
  - hint riêng cho exclusion drawing
- sau khi close:
  - quay lại editing
  - zone xuất hiện trong list
- sidebar list:
  - toggle
  - rename
  - delete
  - select/highlight
- viewport:
  - render fill + dashed outline + label
  - disabled zone render subdued
  - click zone để select

#### Done khi

- user tạo được zone đầu tiên mà không cần rời flow hiện tại
- editing/generated đều thấy list zone rõ ràng
- zone visuals đủ khác boundary để không gây nhầm lẫn

### Stream D: Phase A Pattern Integration

Status: pending.

#### Scope

- đưa `enabled exclusion zones` vào pattern context
- áp dụng segment clipping cho:
  - `coverage`
  - `grid`
  - `corridor`
- regenerate preview/generated output khi zone đổi
- giữ battery report, waypoint panel, animation flow hoạt động sau regenerate
- errors:
  - `0 waypoints after exclusion`
  - `mission fully covered`

#### Done khi

- `coverage/grid/corridor` có gap thật ở nơi zone cắt qua
- bật/tắt zone làm route và battery thay đổi ngay
- generated state không vỡ camera/selection flow

### Stream E: Full Pattern Support + Polish v1

Status: pending.

#### Scope

- waypoint filtering cho:
  - `perimeter`
  - `orbit`
  - `spiral`
- reindex waypoint sau filter
- selected/start waypoint semantics vẫn đúng sau regenerate
- warnings polish:
  - zone ngoài boundary
  - zone rất nhỏ
  - orbit bị filter hết
  - remaining scan area quá nhỏ
- nếu còn sức:
  - edit existing zone vertices
  - hover/select zone highlight tốt hơn

#### Done khi

- cả 6 pattern đều không ignore exclusion zones
- waypoint numbering và action editor không lệch sau filter
- warnings đủ rõ để user hiểu vì sao path biến mất hoặc ngắn lại

## 8. Thứ tự build khuyến nghị

1. `Stream A`
2. `Stream B`
3. `Stream C`
4. `Stream D`
5. `Stream E`

Lý do:

- nếu chưa có geometry + validation core thì UI drawing rất dễ sinh state sai
- nếu chưa có drawing flow thì pattern integration không test được bằng mắt
- `coverage/grid/corridor` cho ROI cao nhất nên đi trước

## 9. Acceptance criteria cho v1

- User có thể tạo ít nhất 1 exclusion zone sau khi đã có boundary.
- Exclusion zone render khác boundary một cách rõ ràng.
- `coverage`, `grid`, `corridor` hiển thị gap scan đúng chỗ zone cắt qua.
- `perimeter`, `orbit`, `spiral` không còn generate waypoint nằm trong zone enabled.
- Toggle `enabled` làm route, waypoint count và battery estimate đổi ngay.
- Nếu zones che hết mission thì app báo lỗi rõ, không generate mission rỗng một cách im lặng.
- `0 exclusion zones` cho output giống hệt hiện tại.

## 10. Deferred backlog

- `no-fly` zone type
- `route-around` transit
- GeoJSON/KML import
- preset zones
- multi-altitude exclusion
- undo/redo cho zone ops
- impact card kiểu:
  - `Excluded areas removed ~X waypoints`
  - `Saved ~Y mAh`

## 11. Checklist tổng

- [x] Stream A: Data Model + Store Foundation
- [x] Stream B: Geometry + Validation Core
- [x] Stream C: Drawing Flow + Sidebar CRUD + Viewport Rendering
- [ ] Stream D: Phase A Pattern Integration
- [ ] Stream E: Full Pattern Support + Polish v1
- [ ] Dùng file này làm nguồn đối chiếu khi implement Exclusion Zones Spec
