# Experiment Variables Reference

## Metadata & Common Fields
| Variable | Description | Type |
| :--- | :--- | :--- |
| `experiment_status` | String in format: `[ID] [Method] [Task] [Condition]` | string |
| `payload[].name` | Type of measurement: `GuideMeasurement`, `AxisMeasurement`, `SurfaceDrawing` | string |
| `payload[].timestamp_utc` | Time of the measurement | ISO-8601 |

## Common Payload Isolation Rules (Updated)
As of the recent cleanup, each JSON file strictly contains *only* the relevant payload for its task:
- **Task 1 (Placing):** Contains ONLY `GuideMeasurement`.
- **Task 2 (Tracing):** Contains ONLY `SurfaceDrawing`.
- **Task 3 (Reaching):** Contains ONLY `AxisMeasurement`.

---

## 1. GuideMeasurement (Placing)
This payload captures placement accuracy and efficiency.

### Summary Metrics
| Variable | Description |
| :--- | :--- |
| `attempts_avg / max / min / total` | Stats on placement attempts per target. |
| `placement_time_avg / max / min / std / total_seconds` | Timing stats for the placement phase. |
| `position_error_avg / max / min / std_mm` | Error from target center (Euclidean). |
| `rotation_error_avg / max / min / std_degrees` | Angular error from target orientation. |
| `total_elapsed_time_seconds` | Total time for the entire task. |
| `measurements_completed / total_guides_in_group` | Progress tracking. |

### Per-Target Measurements (`all_measurements[]`)
| Variable | Description |
| :--- | :--- |
| `attempts` | Attempts for this specific target. |
| `measurement_time_seconds` | Total time for this target. |
| `placement_time_seconds` | Time from focus to placement for this target. |
| `position_error_mm` | Error magnitude for this target. |
| `position_error_vector_x/y/z_mm` | Directional error components. |
| `rotation_error_degrees` | Angular error for this target. |
| `tooltip_position_x/y/z` | Final position of the tool tip. |
| `guide_position_x/y/z` | Target center position. |

---

## 2. AxisMeasurement (Reaching)
Captured primarily in Task 3, tracking performance along logical axes.

### Summary Metrics
| Variable | Description |
| :--- | :--- |
| `axis_duration_mean / max / median / min_seconds` | Stats on time spent per axis. |
| `end_deviation_mean / max / median / min_mm` | Error at the goal point. |
| `entry_deviation_mean / max / median / min_mm` | Error at the entrance point. |
| `total_measurement_duration_seconds` | Duration of the reaching task. |
| `total_end_attempts / total_entry_attempts` | Cumulative efficiency metrics. |
| `mean_end_attempts_per_axis / mean_entry_attempts_per_axis` | Averaged efficiency. |

### Per-Axis Measurements (`all_axes_measurements[]`)
| Variable | Description |
| :--- | :--- |
| `axis_total_time_seconds` | Specific time for this axis. |
| `end_attempts / entry_attempts` | Attempts to reach/enter goal/zone. |
| `end_deviation_mm / entry_deviation_mm` | Precision at start and end of axis. |
| `measured_end_position_x/y/z` | Captured user goal point. |
| `original_end_position_x/y/z` | Target goal point. |

---

## 3. SurfaceDrawing (Tracing)
Detailed path tracking for Task 2.

### Summary Metrics
| Variable | Description |
| :--- | :--- |
| `total_path_length_mm` | Cumulative length of drawn points. |
| `drawing_duration_seconds` | Active time spent drawing. |
| `mean / median / max / min_segment_distance_mm` | Resolution of the captured path. |
| `reference_points_found` | Count of milestone points hit. |

### Path Data (`all_draw_points[]`)
| Variable | Description |
| :--- | :--- |
| `index` | Sequential point ID. |
| `is_line_break` | Boolean indicating a new stroke. |
| `position_x/y/z` | Coordination of path point. |
| `timestamp` | Time since start for each point (vital for velocity). |

### Accuracy Milestones (`reference_point_measurements[]`)
| Variable | Description |
| :--- | :--- |
| `distance_mm` | Deviation from specific target milestones in the trace. |
| `closest_draw_point_index` | Link to the path point that was nearest the milestone. |
