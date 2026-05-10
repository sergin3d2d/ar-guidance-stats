# AR Guidance Experiment — Data Reference

Handoff doc for any agent working on this codebase. Describes the experiment, data layout,
naming conventions, and the parts of the codebase that reflect them.

## Experiment design

Within-subjects study comparing **3 guidance methods × 2 obstruction conditions × 3 tasks**.

### Methods (one per recording)
| Raw device label | Normalized condition | Display name |
|---|---|---|
| `HoloLens_2` | `AR-OST` | AR optical see-through (HoloLens 2) |
| `Quest_3` | `AR-VST` | AR video see-through (Meta Quest 3) |
| `Screen` | `On-Screen` | Conventional 2D monitor guidance |

Normalization map lives in `src/utils/dataProcessor.js` → `normalizeConditionLabel`.

### Obstruction conditions (subtask)
- `Visible` — target/path fully visible to user
- `Obstruct` — target/path partially occluded

### Tasks
- **Task 1 — Placing**: align a tool tip with a sequence of 3D guide poses (position + orientation).
- **Task 2 — Tracing**: trace a painted line on a curved surface; pass through 15 sphere milestones.
- **Task 3 — Reaching**: insert tool along defined 3D axes; entry and end positions measured.

### Per-participant trial count
3 methods × 2 obstructions × 3 tasks = **18 JSON files per participant**, plus 1 CSV with all questionnaires.

## File layout

```
data/
├── P01/
│   ├── ID1__HoloLens_2__Task1_Placing__Visible_collect_20260320_101417.json
│   ├── ID1__HoloLens_2__Task1_Placing__Obstruct_collect_…json
│   ├── ID1__HoloLens_2__Task2_Tracing__Visible_collect_…json
│   ├── ID1__HoloLens_2__Task2_Tracing__Obstruct_collect_…json
│   ├── ID1__HoloLens_2__Task3_Reaching__Visible_collect_…json
│   ├── ID1__HoloLens_2__Task3_Reaching__Obstruct_collect_…json
│   ├── ID1__Quest_3__…json (×6)
│   ├── ID1__Screen__…json (×6)
│   └── results_ID1.csv
├── P02/ …
├── …
├── Visible.txt           ← reference painted path for Visible (shared across participants)
└── Obstruct.txt          ← reference painted path for Obstruct
```

The dashboard's directory picker (`webkitdirectory`) recurses through subfolders, so selecting
the parent `data/` folder loads every participant in one go.

### Filename grammar

```
ID{pid}__{Device}__Task{N}_{TaskName}__{Obstruction}_collect_{YYYYMMDD}_{HHMMSS}.json
```

- `pid` is digits; participant ID equals the `ID` prefix integer.
- `Device` ∈ {`HoloLens_2`, `Quest_3`, `Screen`}.
- `TaskName` ∈ {`Placing`, `Tracing`, `Reaching`}; `N` ∈ {1, 2, 3}.
- `Obstruction` ∈ {`Visible`, `Obstruct`}.
- The trailing date/time is when the recording was saved.

Parser: `parseFilenameMetadata(filename)` in `src/utils/dataProcessor.js`.

### Condition order

Three methods per participant; the ORDER matters (learning effect). Derived from the earliest
filename timestamp per condition. Helper: `deriveConditionOrder(rawFiles)`. Output column
`condition_order` ∈ {1, 2, 3} is propagated to every analysis row.

## Per-task data structure

Each JSON has a `payload[]` array; for Task N the relevant entry is:
- Task 1 → `payload[].name === 'GuideMeasurement'`
- Task 2 → `payload[].name === 'SurfaceDrawing'`
- Task 3 → `payload[].name === 'AxisMeasurement'`

Inside `.values`, the per-trial array of measurements:

### Task 1 — `all_measurements[]`
One entry per guide. Key fields:
- `guide_index` (0-based; +1 for human-readable ID)
- `group_index` — group of guides this belongs to
- `position_error_mm`, `rotation_error_degrees`
- `placement_time_seconds`, `attempts`
- `tooltip_position_x/y/z`, `guide_position_x/y/z` (world frame)

#### Insertion / Surface subtype split
Per protocol, certain guides are "insertion" anchors that are **not scored on position**:
- Visible insertion guides (1-based): **{1, 3, 6, 7}**
- Obstruct insertion guides (1-based): **{2, 5, 6, 7}**
- All other guides → "Surface" subtype, scored normally.
- For Insertion rows in the export, `position_error_mm` is set to `NA`.

These lists are tunable in the export modal (`src/components/ExportSettingsModal.jsx`).

#### Steady-position correction
Trials require a 2.5s steady hold before the placement is considered complete. The hold is
included in `placement_time_seconds`. The export keeps the **raw** value and exposes the
constant in a `steady_time_seconds` column (read from JSON's `steady_time_required_seconds`,
not hardcoded). Subtract in R if you want corrected times:
```r
mutate(corrected = placement_time_seconds - steady_time_seconds)
```

### Task 2 — `reference_point_measurements[]` and friends
- `drawing_duration_seconds` — total stroke time (one scalar per trial)
- `reference_points_found` — count of milestones the user passed near
- `reference_point_measurements[]` — 15 entries (Sphere, Sphere(1), …, Sphere(14)),
  one per planned milestone:
  - `reference_position_x/y/z` (world frame, planned position)
  - `closest_draw_point_position_x/y/z` (world frame, user point closest to it)
  - `closest_draw_point_index` — index in `all_draw_points` where the user was nearest
  - `distance_mm` — recorded per-milestone error
- `all_draw_points[]` — every recorded stylus sample. Per point:
  - `position_x/y/z`, `normal_x/y/z` (world frame)
  - `timestamp` (seconds; auto-detected if ns)
  - `is_line_break` (true at start of a new stroke after a pen lift)
  - `index`
- `surface_position_*`, `surface_rotation_quat_*` — registration to surface-local frame.

JSON sphere IDs M01–M15 are **already in path-traversal order** (the planned trace walks
through them in sequence). Maya labels and dashboard chart use this order.

#### Reference path .txt files
`Visible.txt` and `Obstruct.txt` contain dense (~0.5mm spaced) sample points along the
painted line. Format:
```
# header lines
index,x,y,z,colorIndex,colorName
0,-0.0556,0.0679,0.0508,0,Green
…
```
Color 1 / SecondColor / "Red" entries are reference milestones; in practice the JSON
`reference_point_measurements` is the canonical milestone source. The .txt is used to
reconstruct the planned path geometry. See `parseReferenceTxt` in
`src/utils/task2Spatial.js` for the pipeline (voxel downsample → nearest-neighbor sort →
iterative tiny-segment removal → corner-preserving smoothing).

### Task 3 — `all_axes_measurements[]`
One entry per axis. Key fields:
- `axis_index` (0-based; +1 for human-readable)
- `axis_name`
- `entry_deviation_mm`, `end_deviation_mm` — distance from intended entry/end positions
- `entry_attempts`, `end_attempts`
- `axis_total_time_seconds` — includes the steady-position hold (same correction as Task 1;
  field name in JSON is `steady_duration_seconds` here)
- `measured_entry_position_x/y/z`, `measured_end_position_x/y/z`
- `original_entry_position_x/y/z`, `original_end_position_x/y/z`

## Questionnaires

CSV per participant, named `results_ID{pid}.csv`. Long format: `timestamp, user_id,
questionnaire, condition, key, value`.

### Surveys
| `questionnaire` value | Description |
|---|---|
| `pre_experiment` | Demographics. Keys: `dominant_hand`, `age_group`, `ipd`, `participant_id`, `previous_ar_experience`, `vision_test_score`. |
| `nasa_tlx` | NASA Task Load Index per condition. Keys `q0`..`q5` = Mental, Physical, Temporal, Performance, Effort, Frustration (0–100). |
| `pcueq` | Post-Condition Usability Eval per condition. Keys A1–A5, B1–B6, C1–C4, D1–D2 (1–5 Likert). |
| `final_preference` | Ranked device preferences. Keys: `preference`, `preference_2nd`, `preference_3rd`. |

### Condition labels in CSV (and how we normalize)
The raw `condition` field uses display names:
- `AR-OST (Hololens)` → `AR-OST`
- `AR-VST (Quest 3)` → `AR-VST`
- `On-Screen` → `On-Screen`
- `PCUE-Q for AR-OST (Hololens)` → `AR-OST` (PCUE-Q prefix stripped)
- `Final Preference` → kept as-is (questionnaire-level, not condition-level)

Normalization in `normalizeQuestionnaireCondition`.

### AR-only PCUE-Q items
**B5** and **C4** are only valid for the AR conditions (AR-VST, AR-OST). Empty values for
On-Screen rows are expected. The export's `dropArOnlyForOnScreen` setting (default ON)
removes these rows for On-Screen, so they don't pollute averages.

### Vision test score parsing
Format encodes whether the participant wears glasses:
- `"16/100"` → with glasses **16** (i.e. 20/16), without glasses **100** (20/100), `uses_glasses = 1`
- `"20"` → no glasses, value is the without-glasses denominator, `uses_glasses = 0`
- empty / missing → all NA

Helper: `parseVisionScore` in `src/utils/exportPlanner.js`. Toggleable in export modal.

### NASA-TLX overall mean
The export optionally adds a synthetic `overall_mean` row per (pid × condition) computed
as the mean of q0..q5. Toggle in the modal.

## Surface-local registration (Task 2 only)

The world-frame draw points and milestone positions need to be transformed into the
**surface-local** frame to compare against the .txt reference and across trials.

- `surface_position` and `surface_rotation_quat` are in the JSON `SurfaceDrawing.values`.
- Transform: `p_local = q⁻¹ · (p_world − surface_position) · q` (Hamilton convention).
- Helpers: `getSurfaceTransform`, `transformPointToLocal`, `transformDrawPoints` in
  `src/utils/task2Spatial.js`.

A sanity check (`measureAlignmentOffset`) logs a warning if the user-trace centroid is
>50mm from the reference centroid in surface-local space (indicates frame mismatch).
Verified ~1mm on P01 — the surface anchor and .txt authoring frame coincide.

## Export pipeline

The dashboard's "Export for analysis…" button produces a zip of long-format CSVs suitable
for direct R ingestion. All built by `buildExportArchive` in `src/utils/exportPlanner.js`.

### Files
| File | Grain | Notes |
|---|---|---|
| `participants.csv` | one per pid | demographics + parsed vision + condition order columns (`order_AR_VST`, `order_AR_OST`, `order_OnScreen`) |
| `task1_placing.csv` | one per (pid × method × obstruction × group × guide) | Insertion/Surface subtype, `position_error_mm`=NA for Insertion, raw times + `steady_time_seconds` |
| `task2_trials.csv` | one per (pid × method × obstruction) | trial-level scalars (`drawing_duration_seconds`, `reference_points_found`) |
| `task2_landmarks.csv` | one per (pid × method × obstruction × milestone) | landmark distance from JSON `reference_point_measurements` |
| `task2_deviation_summary.csv` *(opt-in)* | one per (pid × method × obstruction) | per-trial lateral-deviation stats (RMS, max, banded fractions) |
| `task2_deviation_profile.csv` *(opt-in)* | one per (pid × method × obstruction × bin) | binned along ref arclength |
| `task2_drawpoints.csv` *(opt-in)* | one per draw point | registered surface-local positions + per-point deviation |
| `reference_paths.csv` *(auto)* | per ref polyline point | one set per obstruction (Visible/Obstruct) |
| `task3_reaching.csv` | one per (pid × method × obstruction × axis) | raw times + `steady_time_seconds` |
| `questionnaires.csv` | one per (pid × questionnaire × condition × item) | normalized labels, AR-only items dropped for On-Screen, optional `overall_mean` rows |
| `README.txt` | — | column dictionary + R quickstart, generated to match selected settings |

### Standard key columns on every task table
- `pid` (string of digits)
- `device_raw` (HoloLens_2 / Quest_3 / Screen)
- `condition` (AR-OST / AR-VST / On-Screen)
- `obstruction` (Visible / Obstruct)
- `condition_order` (1 / 2 / 3)
- Optional (off by default): `source_file`, `timestamp`

All exports are **long format with `pid` as a column** — one file per category, all
participants combined. Standard tidyverse workflow:
```r
participants <- read_csv("participants.csv")
t1 <- read_csv("task1_placing.csv") |> left_join(participants, by = "pid")
lmer(position_error_mm ~ condition * obstruction + condition_order + (1 | pid),
     data = filter(t1, subtype == "Surface"))
```

### Multi-participant ingest workflow
1. Lay out data as `data/P01/`, `data/P02/`, …
2. Open the dashboard, "Choose Files" → pick the `data/` parent.
3. The DataIngest banner shows participant count and IDs.
4. Click "Export for analysis…" → modal banner reconfirms what will be exported.
5. Click "Export zip" — single zip contains every participant.

## Key code locations

| Concern | File |
|---|---|
| Filename parsing, condition normalization, condition-order derivation | `src/utils/dataProcessor.js` |
| Surface-local transforms, reference-path parsing & cleanup | `src/utils/task2Spatial.js` |
| Long-format CSV builders, settings, README, zip | `src/utils/exportPlanner.js` |
| Export modal UI | `src/components/ExportSettingsModal.jsx` |
| Multi-participant ingest UI | `src/components/DataIngest.jsx` |
| Per-task analytics dashboards | `src/components/Task{1,2,3}Analytics.jsx` |
| Maya export (debug visualization) | `scripts/export_maya.mjs` |
| Algorithm diagnostic scripts | `scripts/diag_*.mjs`, `scripts/smoke_export.mjs` |

## Sample data

`P01/` in the repo root contains a single complete participant (Visible+Obstruct on all
3 tasks, all 3 devices, plus `results_ID1.csv`). Use it as a smoke-test fixture or to
verify any pipeline change without depending on a full multi-participant dataset.
