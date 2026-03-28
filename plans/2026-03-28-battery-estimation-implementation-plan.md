# Battery Estimation Implementation Plan

## 1. Mục tiêu

Triển khai spec [2026-03-28-battery-estimation-proposal.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-battery-estimation-proposal.md) theo hướng:

- trả lời thật nhanh câu hỏi chính: `mission này có đủ pin không?`
- giữ đúng progressive disclosure theo stage hiện tại của app
- tính toán theo `derived data`, không nhồi `battery report` vào store
- ưu tiên `nominal estimate + direct RTH + warning rõ ràng` trước, rồi mới mở rộng sang overlay, recommendations, confidence range

File này là plan đối chiếu chính cho mọi lượt implement liên quan tới battery estimation trong codebase hiện tại.

## 2. Quy ước đối chiếu khi implement

Thứ tự ưu tiên:

1. [2026-03-28-battery-estimation-proposal.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/plans/2026-03-28-battery-estimation-proposal.md) là spec sản phẩm và business logic gốc.
2. File này là `implementation source of truth` cho:
   - scope v1 build ngay
   - phần nào deferred
   - cách map spec vào codebase hiện tại
3. [EXECUTION_PLAN.md](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/EXECUTION_PLAN.md) chỉ dùng để đối chiếu roadmap tổng.

Quy ước làm việc:

- Trước khi sửa code, kiểm tra file này để xác nhận hạng mục thuộc stream nào.
- Nếu spec gốc và code hiện tại lệch nhau, cập nhật file này trước rồi mới implement.
- Các hạng mục như `weather-aware`, `telemetry sync`, `multi-battery mission`, `regulatory preset nâng cao` sẽ được tách sang deferred backlog, không chặn v1.

## 3. Trạng thái hiện tại của codebase

### 3.1. Đã có

- App đã có đầy đủ stage:
  - `idle`
  - `setup`
  - `drawing`
  - `editing`
  - `generated`
- `useMissionStore.ts` đã có:
  - `scanAltitude`
  - `points`
  - `waypoints`
  - waypoint actions
  - `startWaypointId`
- `App.tsx` đã có insertion points rõ ràng:
  - setup panel
  - editing panel
  - generated summary card
  - behavior list + selected waypoint action editor
- `flightPatterns.ts` đã generate mission thật cho các pattern
- `waypointInteraction.ts` đã có ordered route semantics, nên battery engine có thể dùng `orderedWaypoints` thay vì raw array

### 3.2. Chưa có

- `DroneProfile`
- `homePoint`
- `SafetyPreset`
- `BatteryReport`
- bất kỳ battery UI nào
- per-waypoint safety coloring
- RTH overlay
- recommendation engine

## 4. Quyết định scope cho v1

### 4.1. Build ngay trong v1

- `DroneProfile` + preset selector
- `homePoint` mặc định tại gốc mission/home hiện tại
- `SafetyPreset` đơn giản
- `computeBatteryReport()` nominal
- hỗ trợ:
  - travel energy
  - takeoff / landing overhead
  - action energy
  - direct RTH
  - safety level
  - feasibility
  - point-of-no-return
- progressive disclosure theo stage:
  - setup: max flight time
  - drawing: không hiện gì
  - editing: quick estimate
  - generated: L1 + L2 battery summary
  - action editing: action cost feedback realtime

### 4.2. Deferred sau v1

- 3-scenario confidence range `optimistic / nominal / pessimistic`
- `retrace` và `altitude-first` RTH strategy
- weather-aware estimation
- battery health / cycle count
- auto-optimize mission
- multi-battery mission split
- telemetry sync ở deployment mode
- geofence battery guard
- legal disclaimer dạng full expanded block trong mọi state

### 4.3. Quan trọng cho v1

V1 vẫn phải có:

- disclaimer ngắn ở generated summary
- warning banner khi mission không feasible
- dữ liệu tính toán chạy `O(n)`
- clamp và fallback an toàn cho input lỗi

## 5. Gaps từ spec cần encode ngay từ đầu

Các gap dưới đây không nên để đến cuối, vì nếu bỏ qua thì report sẽ sai từ nền:

1. `Home -> WP1` phải được tính như segment travel đầu tiên, không chỉ tính takeoff vertical.
2. Pattern `closed` phải cộng segment `WPlast -> WP1`.
3. `change_altitude` phải làm thay đổi `effectiveZ` cho các segment sau và cho RTH cost.
4. `homePoint` phải là `Vec3`, không phải `Vec2`.
5. `PNR` phải được tính theo prefix-safe, không phải chỉ scan ngược một waypoint safe cuối cùng.
6. `z < 0` hoặc `effectiveZ < 0` phải clamp về `0` và emit warning.
7. Với v1, action timing vẫn có thể tính theo kiểu cộng dồn pessimistic, nhưng phải ghi rõ đó là worst-case estimate.

## 6. Mapping vào kiến trúc hiện tại

### 6.1. Store

Mở rộng [useMissionStore.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/store/useMissionStore.ts) với:

- `droneProfileId: string | null`
- `droneProfileOverrides: Partial<DroneProfile> | null`
- `homePoint: { x: number; y: number; z: number } | null`
- `safetyPresetId: string`

Không lưu `MissionBatteryReport` vào store.

### 6.2. Derived selector

Tạo hook hoặc memo layer trong `App.tsx`:

- input:
  - `droneProfile`
  - `orderedWaypoints`
  - `selectedPattern`
  - `selectedPatternMeta`
  - `scanAltitude`
  - `homePoint`
  - `safety preset`
- output:
  - `MissionBatteryReport | null`
  - `QuickBatteryEstimate | null`

### 6.3. File structure

Theo spec, nhưng gọn lại theo app hiện tại:

```text
src/lib/
  batteryModels.ts
  batteryPresets.ts
  batteryEstimation.ts
  batterySafety.ts
  batteryRecommendations.ts

src/components/
  BatterySummaryBar.tsx
  BatteryWarningBanner.tsx
  DroneProfileSelector.tsx
```

`BatteryWaypointOverlay` có thể để trong [MissionViewport3D.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/SkyTrack/src/components/MissionViewport3D.tsx) ở v1 để giảm số file phải split quá sớm.

## 7. Chia implementation thành 5 streams

### Stream A: Data Models + Store Foundation

Status: implemented, build/lint passed. Battery data models, presets, safety presets, and mission-store foundation are now in place, including `droneProfileId`, `droneProfileOverrides`, `homePoint`, and `safetyPresetId`.

#### Scope

- định nghĩa:
  - `DroneProfile`
  - `MissionBatteryReport`
  - `WaypointBatteryEstimate`
  - `BatteryWarning`
  - `SafetyPreset`
- thêm presets:
  - `generic-quad-small`
  - `generic-quad-medium`
  - `generic-hex-heavy`
- mở rộng mission store:
  - `droneProfileId`
  - `droneProfileOverrides`
  - `homePoint`
  - `safetyPresetId`

#### Done khi

- app có thể chọn được 1 drone preset
- reset/redraw/generate không làm state battery bị treo
- các input cơ bản đã có default an toàn

### Stream B: Core Battery Estimation Engine

Status: implemented, build/lint/test passed. Core nominal battery estimation, direct RTH reserve, safety classification, point-of-no-return detection, and battery warning generation are now in place with unit coverage for home-to-first travel, closed loops, altitude-changing actions, and infeasible missions.

#### Scope

- implement `computeBatteryReport()`
- implement helpers:
  - `computeTravelEnergy`
  - `computeActionEnergy`
  - `computeTakeoffLandingEnergy`
  - `computeDirectRthCost`
  - `classifySafetyLevel`
  - `detectPointOfNoReturn`
- encode:
  - `home -> wp1`
  - `closed loop last -> first`
  - `effective altitude`
  - clamp invalid values
- tạo unit tests cho:
  - zero waypoints
  - single waypoint
  - open path
  - closed path
  - change altitude
  - insufficient battery

#### Done khi

- engine chạy `O(n)`
- report đủ dùng cho generated summary
- test pass cho các case nền tảng

### Stream C: Progressive Disclosure UI

Status: implemented, build/lint/test passed. Setup now exposes drone and safety preset selection with theoretical flight time, editing shows a quick feasibility estimate, generated stage has a collapsible battery summary card, and the waypoint action editor shows realtime per-node action energy impact.

#### Scope

- setup stage:
  - `DroneProfileSelector`
  - max theoretical flight time
- drawing stage:
  - giữ im lặng
- editing stage:
  - quick estimate card
  - feasibility copy xanh/đỏ
- generated stage:
  - `BatterySummaryBar`
  - L1 gauge
  - L2 detail collapse
  - disclaimer ngắn
- action editing:
  - selected waypoint actions hiển thị cost delta realtime

#### Vị trí gắn UI

- setup panel: ngay dưới `Scan Altitude`
- editing panel: sau `summary-grid`, trước `vertices-card`
- generated panel: ngay dưới `generated-summary-card`
- selected waypoint action editor: thêm section `Action energy`

#### Done khi

- user chọn drone từ setup và thấy max flight
- editing có quick estimate sơ bộ
- generated có câu trả lời chính `feasible / not feasible`
- sửa action làm gauge cập nhật ngay

### Stream D: Safety Overlay + Viewport Integration

Status: implemented, build/lint/test passed. Generated missions now expose an infeasible battery warning banner, the viewport colors waypoint markers and route segments by safety level, hover/selection shows estimated battery percentage, and the point-of-no-return is marked directly on the mission path.

#### Scope

- per-waypoint safety color
- hover tooltip `WP #X · ~YY%`
- PNR marker
- path color shift từ safe -> critical
- warning banner khi `isFeasible === false`

#### Ghi chú

- v1 chỉ cần `direct RTH`
- overlay phải dùng chính `orderedWaypoints`
- không làm viewport quá rối ở editing/drawing

#### Done khi

- generated viewport cho thấy waypoint nào bắt đầu rủi ro
- hover waypoint có thể xem battery %
- PNR nhìn ra được trên viewport và sidebar

### Stream E: Recommendations + Advanced Safety

Status: implemented, build/lint/test passed. Battery recommendations are now generated from the mission report, infeasible missions expose actionable CTA buttons, and the expanded battery breakdown shows sorted warning/recommendation items with waypoint-specific guidance.

#### Scope

- `batteryRecommendations.ts`
- warning list từ report
- suggestion text:
  - tăng line spacing
  - giảm action duration
  - chia mission
- RTH reserve display
- mission-level banner + CTA

#### Deferred trong stream này

- auto-optimize thật
- what-if slider
- alternate RTH strategies

#### Done khi

- mission infeasible có banner và suggestions đủ rõ
- warning không spam ở các case còn safe/caution

## 8. Thứ tự triển khai khuyến nghị

1. `Stream A`
2. `Stream B`
3. `Stream C`
4. `Stream D`
5. `Stream E`

Lý do:

- nếu chưa có engine đúng thì mọi UI đều chỉ là placeholder
- setup selector cần có sớm để generated summary có input hợp lệ
- viewport overlay nên làm sau khi summary logic đã ổn
- recommendation nên build cuối vì phụ thuộc report và warning model

## 9. Acceptance criteria tổng

- setup:
  - user chọn được drone preset
  - thấy max flight time lý thuyết
- editing:
  - quick estimate đổi theo pattern, spacing, altitude
- generated:
  - hiện rõ `feasible / not feasible`
  - gauge và breakdown hiển thị đúng
  - disclaimer ngắn luôn hiện
- action editing:
  - thêm/bớt action làm total energy đổi ngay
- safety:
  - `critical` và `not feasible` có banner rõ ràng
  - `PNR` được xác định nhất quán
- performance:
  - tính toán vẫn mượt với mission dài
  - không tạo nested recalculation không cần thiết

## 10. Những quyết định UX cần giữ

1. `Drawing` vẫn im lặng, không thêm battery noise.
2. `Editing` chỉ hiện 1 câu quick estimate, không bung full table.
3. `Generated` phải trả lời câu hỏi chính trước mọi thứ khác.
4. Warning banner chỉ dùng khi `isFeasible === false`.
5. Mọi số battery đều phải gắn ngữ nghĩa `estimate`, không trình bày như telemetry thật.

## 11. Deferred Backlog

- confidence range 3 kịch bản
- battery health / cycle count
- regulatory safety presets nâng cao
- weather-aware estimation
- `retrace` / `altitude-first` RTH
- multi-battery mission planning
- telemetry sync / forecast correction
- export battery report

## 12. Checklist đối chiếu

- [x] Stream A: Data models + store foundation
- [x] Stream B: Core battery estimation engine
- [x] Stream C: Progressive disclosure UI
- [x] Stream D: Safety overlay + viewport integration
- [x] Stream E: Recommendations + advanced safety
- [ ] Dùng file này làm nguồn đối chiếu khi implement Battery Estimation Spec
