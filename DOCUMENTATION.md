# AR Guidance Analyzer - Documentation

## Project Overview
The **AR Guidance Analyzer** is a React-based analytics dashboard designed to process, visualize, and compare user performance data from Augmented Reality (AR) guidance experiments. It allows researchers to ingest experimental logs and survey data to evaluate different guidance methods (e.g., Screen, HoloLens 2, Quest 3) under varying conditions (e.g., Visible vs. Obstructed targets).

---

## 📥 Inputs & Data Ingestion

The application ingests data via the **DataIngest** component, which supports folder-level selection. It expects two types of files:

### 1. JSON Performance Logs
These files contain raw tracking data and summary metrics for specific tasks.

*   **Metadata (`experiment_status`)**:
    The system parses the status string to extract key identifiers.
    *   *Format*: `[ParticipantID] [Method] [Task].[Subtask] [Condition]`
    *   *Example*: `ID1 Screen Task1.Placing Visible`
*   **Payload Structure**:
    Each file deals strictly with one main measurement type inside the `payload` array:
    *   **Task 1 (Placing)** -> `GuideMeasurement`
    *   **Task 2 (Tracing)** -> `SurfaceDrawing`
    *   **Task 3 (Reaching)** -> `AxisMeasurement`

### 2. CSV Questionnaires (Survey Results)
Files must end in `.csv` and include `results` in the filename to be parsed as survey data.

*   **Supported Surveys**:
    *   **Pre-Experiment**: Demographics (e.g., age, experience).
    *   **NASA Task Load Index (NASA-TLX)**: Mental/Physical demand, effort, frustration.
    *   **Post-Condition Usability Assessment (PCUE-Q)**: Usability, Visual Quality, Comfort, Satisfaction.
    *   **Final System Preferences**: Post-trial rankings.
*   **Structure**: Expected headers include `key`, `value`, `questionnaire`, `condition`, and `participant_id`.

---

## 🛠️ What It Does (Features)

The dashboard organizes data hierarchically:
`Participant -> Task -> Condition (Visible/Obstructed) -> Method (Screen/HoloLens/Quest)`

### 1. Global Navigation & Export
*   **Participant Selector**: Switch between ingested user profiles on the fly.
*   **Task Tabs**: Toggle between Task 1, Task 2, Task 3, and Questionnaire views.
*   **Data Export**: A one-click button exports all flattened variables from raw files into a single master `.csv` sheet.

### 2. Analytics Dashboards

#### 🎯 Task 1: Placing Analysis
*   **Focus**: Evaluating speed and accuracy of target placement.
*   **Key Metrics**: Placement Time (Avg/Max), Position Error (mm), Rotation Error (degrees), Placement Attempts.
*   **Visualizations**:
    *   *Grouped Variable Summary Cards* (Aggregated stats per condition/method).
    *   *Radar Charts* (Comparing Speed vs. Accuracy vs. Efficiency scores).
    *   *Comparative Bar Charts* (Side-by-side performance averages).
    *   *Descriptive Target-by-Target Bars* (Performance granularly per target ID).
    *   *Boxplots & Spline Progression Lines* (Spread and learning curves).

#### 🖊️ Task 2: Tracing Analysis
*   **Focus**: Detailed path tracking on surfaces.
*   **Key Metrics**: Total Path Length (mm), Drawing Duration, Segment Resolution, Milestone accuracy.
*   *Note*: Handles 3D coordinate mapping for drawing points and surface transformations.

#### 📍 Task 3: Reaching Analysis
*   **Focus**: Tracking accuracy and duration when moving along 3D axes.
*   **Key Metrics**: Axis duration, Entry/End deviations (mm), Entry/End attempts count.

---

## 📊 Technical Stack
*   **Framework**: React (Vite template)
*   **Plotting Engine**: Plotly.js (`react-plotly.js`) for complex distributions and overlays.
*   **Icons**: Lucide-React
*   **Styling**: Custom modern glassmorphic dashboard CSS inside `index.css`.
*   **Statistics Helpers**: `stats-lite` for computing variances and medians dynamically.

---
*Created automatically to provide high-level architecture guide for research ingestion.*
