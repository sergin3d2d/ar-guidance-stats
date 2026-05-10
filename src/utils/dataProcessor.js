import stats from 'stats-lite';

/**
 * Parses the experiment_status string into metadata components.
 * Format: "ID[Number] [Method] [Task].[Subtask] [Condition]"
 * Example: "ID1 Screen Task1.Placing Visible"
 */
export const parseMetadata = (status) => {
    if (!status) return { participantId: '?', method: '?', task: '?', subtask: '?', condition: '?' };

    // Handle multiple spaces and trim
    const parts = status.trim().split(/\s+/);
    if (parts.length < 3) return { participantId: '?', method: '?', task: '?', subtask: '?', condition: '?' };

    // find where the task info starts (e.g. "Task1.Placing")
    const taskIndex = parts.findIndex(p => p.toLowerCase().includes('task'));

    if (taskIndex === -1) {
        return {
            participantId: parts[0].replace(/ID/i, '').trim(),
            method: parts[1] || 'Unknown',
            task: 'Unknown',
            subtask: '',
            condition: parts[2] || 'Unknown'
        };
    }

    const participantId = parts[0].replace(/ID/i, '').trim();
    const method = parts.slice(1, taskIndex).join(' ');
    const taskPart = parts[taskIndex].split('.');
    const task = taskPart[0];
    const subtask = taskPart[1] || '';
    
    let condition = parts[taskIndex + 1] || 'Unknown';
    const lowerCondition = condition.toLowerCase();
    
    // Standardize condition names more robustly
    if (lowerCondition.includes('obstruct')) condition = 'Obstructed';
    if (lowerCondition.includes('visible')) condition = 'Visible';

    return { participantId, method, task, subtask, condition };
};

/**
 * Extracts and aggregates variables from a list of experiment JSON objects.
 */
export const processExperimentData = (filesData, csvFilesList = []) => {
    const results = {
        participants: {}, // e.g., {'ID1': { 'Task1': { 'Visible': { 'Screen': {...}, 'HoloLens2': {...} } } } }
        methods: ['Screen', 'HoloLens2', 'Quest3'],
        tasks: ['Task1', 'Task2', 'Task3'],
        conditions: ['Visible', 'Obstructed'],
    };

    filesData.forEach((data) => {
        if (!data || !data.experiment_status) return; // Skip non-experimental logs (e.g. package.json)

        const meta = parseMetadata(data.experiment_status);
        const { method, task, condition, participantId } = meta;

        // Initialize Participant Hierarchy
        if (!results.participants[participantId]) {
            results.participants[participantId] = {};
            results.tasks.forEach(t => {
                results.participants[participantId][t] = {};
                results.conditions.forEach(c => {
                    results.participants[participantId][t][c] = {};
                });
            });
        }

        // --- STRICT PAYLOAD ISOLATION ---
        // Because the software exports cumulatively, we must ignore metrics from other payloads
        let metrics = {};

        if (task === 'Task1') {
            const guideData = data.payload.find(p => p.name === 'GuideMeasurement')?.values;
            if (guideData) {
                metrics = {
                    // Timing
                    placementTimeTotal: guideData.placement_time_total_seconds || 0,
                    placementTimeAvg: guideData.placement_time_avg_seconds || 0,
                    placementTimeMax: guideData.placement_time_max_seconds || 0,
                    placementTimeMin: guideData.placement_time_min_seconds || 0,
                    placementTimeStd: guideData.placement_time_std_seconds || 0,
                    totalElapsedTime: guideData.total_elapsed_time_seconds || 0,

                    // Errors
                    posErrorAvg: guideData.position_error_avg_mm || 0,
                    posErrorMax: guideData.position_error_max_mm || 0,
                    posErrorMin: guideData.position_error_min_mm || 0,
                    posErrorStd: guideData.position_error_std_mm || 0,

                    rotErrorAvg: guideData.rotation_error_avg_degrees || 0,
                    rotErrorMax: guideData.rotation_error_max_degrees || 0,
                    rotErrorMin: guideData.rotation_error_min_degrees || 0,
                    rotErrorStd: guideData.rotation_error_std_degrees || 0,

                    // Efficiency
                    attemptsTotal: guideData.attempts_total || 0,
                    attemptsAvg: guideData.attempts_avg || 0,
                    attemptsMax: guideData.attempts_max || 0,
                    attemptsMin: guideData.attempts_min || 0,

                    // Progress
                    measurementsCompleted: guideData.measurements_completed || 0,
                    guidesInGroup: guideData.total_guides_in_group || 0,

                    // Deep Arrays
                    allMeasurements: guideData.all_measurements || []
                };
            }
        }
        else if (task === 'Task2') {
            const surfaceData = data.payload.find(p => p.name === 'SurfaceDrawing')?.values;
            if (surfaceData) {
                metrics = {
                    pathLength: surfaceData.total_path_length_mm || 0,
                    drawingDuration: surfaceData.drawing_duration_seconds || 0,

                    // Resolution
                    segmentDistanceMean: surfaceData.mean_segment_distance_mm || 0,
                    segmentDistanceMedian: surfaceData.median_segment_distance_mm || 0,
                    segmentDistanceMax: surfaceData.max_segment_distance_mm || 0,
                    segmentDistanceMin: surfaceData.min_segment_distance_mm || 0,

                    // Milestones
                    referencePointsFound: surfaceData.reference_points_found || 0,

                    // Deep Arrays
                    allDrawPoints: surfaceData.all_draw_points || [],
                    referencePointMeasurements: surfaceData.reference_point_measurements || [],
                    
                    // Surface transformation
                    surfacePositionX: surfaceData.surface_position_x || 0,
                    surfacePositionY: surfaceData.surface_position_y || 0,
                    surfacePositionZ: surfaceData.surface_position_z || 0,
                    surfaceRotationQuatX: surfaceData.surface_rotation_quat_x || 0,
                    surfaceRotationQuatY: surfaceData.surface_rotation_quat_y || 0,
                    surfaceRotationQuatZ: surfaceData.surface_rotation_quat_z || 0,
                    surfaceRotationQuatW: surfaceData.surface_rotation_quat_w !== undefined ? surfaceData.surface_rotation_quat_w : 1
                };
            }
        }
        else if (task === 'Task3') {
            const axisData = data.payload.find(p => p.name === 'AxisMeasurement')?.values;
            if (axisData) {
                metrics = {
                    // Duration
                    totalMeasurementDuration: axisData.total_measurement_duration_seconds || 0,
                    axisDurationMean: axisData.axis_duration_mean_seconds || 0,
                    axisDurationMax: axisData.axis_duration_max_seconds || 0,
                    axisDurationMedian: axisData.axis_duration_median_seconds || 0,
                    axisDurationMin: axisData.axis_duration_min_seconds || 0,

                    // Deviations
                    endDeviationMean: axisData.end_deviation_mean_mm || 0,
                    endDeviationMax: axisData.end_deviation_max_mm || 0,
                    endDeviationMedian: axisData.end_deviation_median_mm || 0,
                    endDeviationMin: axisData.end_deviation_min_mm || 0,

                    entryDeviationMean: axisData.entry_deviation_mean_mm || 0,
                    entryDeviationMax: axisData.entry_deviation_max_mm || 0,
                    entryDeviationMedian: axisData.entry_deviation_median_mm || 0,
                    entryDeviationMin: axisData.entry_deviation_min_mm || 0,

                    // Attempts
                    totalEndAttempts: axisData.total_end_attempts || 0,
                    totalEntryAttempts: axisData.total_entry_attempts || 0,
                    meanEndAttemptsPerAxis: axisData.mean_end_attempts_per_axis || 0,
                    meanEntryAttemptsPerAxis: axisData.mean_entry_attempts_per_axis || 0,
                    completedAxes: axisData.completed_axes_count || 0,

                    // Deep Arrays
                    allAxesMeasurements: axisData.all_axes_measurements || []
                };
            }
        }

        // Store isolated metrics for this specific test instance
        results.participants[participantId][task][condition][method] = metrics;
    });
    // Parse Questionnaire CSVs
    if (csvFilesList && csvFilesList.length > 0) {
        csvFilesList.forEach(csvFile => {
            const rows = csvFile.content.split('\n').filter(r => r.trim().length > 0);
            if (rows.length < 2) return;
            const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
            
            const parsedRows = rows.slice(1).map(r => {
                // simple split avoiding quotes breakage for standard result structure
                const cols = r.split(',');
                const obj = {};
                headers.forEach((h, idx) => { obj[h] = cols[idx] ? cols[idx].trim() : ''; });
                return obj;
            });

            const pIdRow = parsedRows.find(r => r.key === 'participant_id');
            // convert "00" or "01" to "0" or "1" to match JSON metadata if needed. 
            // Better yet, use exact match or cleaned match string lookup
            const csvPId = pIdRow ? pIdRow.value.replace(/^0+/, '') || '0' : null;
            const absolutePId = csvPId === '0' ? '0' : csvPId; 

            if (!csvPId) return; 

            // Initialize Surveys if this participant wasn't loaded from JSON
            if (!results.participants[absolutePId]) {
                results.participants[absolutePId] = { surveys: { pre_experiment: {}, nasa_tlx: {}, pcueq: {}, final_preference: {} } };
                results.tasks.forEach(t => {
                     results.participants[absolutePId][t] = {};
                     results.conditions.forEach(c => { results.participants[absolutePId][t][c] = {}; });
                });
            }

            const surveys = results.participants[absolutePId].surveys || { pre_experiment: {}, nasa_tlx: {}, pcueq: {}, final_preference: {} };

            parsedRows.forEach(r => {
                const qType = r.questionnaire;
                const cond = r.condition;
                const k = r.key;
                const v = r.value;

                if (qType === 'pre_experiment') {
                    surveys.pre_experiment[k] = v;
                } else if (qType === 'nasa_tlx') {
                    if (!surveys.nasa_tlx[cond]) surveys.nasa_tlx[cond] = {};
                    surveys.nasa_tlx[cond][k] = parseFloat(v) || 0;
                } else if (qType === 'pcueq') {
                    if (!surveys.pcueq[cond]) surveys.pcueq[cond] = {};
                    if (v !== 'none') surveys.pcueq[cond][k] = parseFloat(v) || 0;
                } else if (qType === 'final_preference') {
                    surveys.final_preference[k] = v;
                }
            });

            results.participants[absolutePId].surveys = surveys;
        });
    }

    return results;
};

/**
 * Calculates comparative statistics between methods for a specific metric.
 */
export const calculateComparison = (aggregatedData, task, condition, metric) => {
    const summary = {};

    Object.keys(aggregatedData).forEach(method => {
        const records = aggregatedData[method]?.[task]?.[condition] || [];
        const values = records.map(r => r.metrics[metric]);

        if (values.length > 0) {
            summary[method] = {
                mean: stats.mean(values),
                stdev: stats.stdev(values),
                median: stats.median(values),
                count: values.length,
                values
            };
        }
    });

    return summary;
};

/**
 * Flattens all variables from all payloads into a single array of objects for CSV export.
 */
export const flattenAllVariables = (filesData) => {
    const flattened = [];

    filesData.forEach((data) => {
        const meta = parseMetadata(data.experiment_status);

        // Create base object with metadata
        const base = {
            participantId: meta.participantId,
            method: meta.method,
            task: meta.task,
            subtask: meta.subtask,
            condition: meta.condition,
        };

        const flattenDeep = (obj, currentPrefix) => {
            if (Array.isArray(obj)) {
                // If the array is massive (like raw drawing points), prevent column explosion
                if (obj.length > 50) {
                    base[`${currentPrefix}_count`] = obj.length;
                    return;
                }
                obj.forEach((item, index) => {
                    flattenDeep(item, `${currentPrefix}_${index}`);
                });
            } else if (obj !== null && typeof obj === 'object') {
                Object.entries(obj).forEach(([key, val]) => {
                    flattenDeep(val, currentPrefix ? `${currentPrefix}_${key}` : key);
                });
            } else {
                base[currentPrefix] = obj;
            }
        };

        // Flatten all payload values deeply
        data.payload.forEach(payload => {
            const prefix = payload.name;
            const values = payload.values;

            if (values) {
                flattenDeep(values, prefix);
            }
        });

        flattened.push(base);
    });

    return flattened;
};

export const downloadCSV = (data, filename = 'experiment_data.csv') => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(header => JSON.stringify(obj[header] ?? '')).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
