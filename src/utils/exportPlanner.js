import JSZip from 'jszip';
import {
    parseFilenameMetadata,
    deriveConditionOrder,
    normalizeQuestionnaireCondition,
} from './dataProcessor';
import {
    parseReferenceTxt,
    getSurfaceTransform,
    transformDrawPoints,
    cumulativeArclength,
    computeDeviations,
    normalizeTimestampsToSeconds,
} from './task2Spatial';
import visibleTxtRaw from '../../Visible.txt?raw';
import obstructTxtRaw from '../../Obstruct.txt?raw';

// --- Default settings -------------------------------------------------------

export const DEFAULT_EXPORT_SETTINGS = {
    provenance: {
        includeSourceFile: false,
        includeTimestamp: false,
    },
    task1: {
        include: true,
        positionError: true,
        rotationError: true,
        placementTime: true,
        attempts: true,
        guideIndex1Based: true,
        positionErrorVector: false,
        worldCoords: false,
        measurementTime: false,
        applySubtypeSplit: true,
        nullPositionForInsertion: true,
        insertionGuidesVisible: '1,3,6,7',
        insertionGuidesObstruct: '2,5,6,7',
    },
    task2: {
        trials: true,
        landmarks: true,
        deviationSummary: false,
        deviationProfile: false,
        registeredDrawPoints: false,
        referencePaths: false, // auto-enabled if profile or drawpoints on
        pathLength: false,
        segmentStats: false,
        deviationProfileBins: 50,
    },
    task3: {
        include: true,
        entryDeviation: true,
        endDeviation: true,
        entryAttempts: true,
        endAttempts: true,
        axisTotalTime: true,
        axisIndex1Based: true,
        positions: false,
        topLevelSummary: false,
    },
    questionnaires: {
        include: true,
        dropArOnlyForOnScreen: true,  // B5 and C4 are PCUE-Q items only valid for AR conditions
        arOnlyKeys: 'B5,C4',
        computeNasaTlxOverall: true,
        parseVisionScore: true,
    },
};

// --- Vision score parser ----------------------------------------------------
// "16/100" → with-glasses denom = 16, without-glasses denom = 100, uses_glasses = true
//             (i.e. participant sees 20/16 with glasses, 20/100 without)
// "20"     → without-glasses denom = 20, uses_glasses = false (single value, no glasses)
// ""       → all NA
export const parseVisionScore = (raw) => {
    const out = { with_glasses: '', without_glasses: '', uses_glasses: '' };
    if (raw === null || raw === undefined) return out;
    const s = String(raw).trim();
    if (s === '') return out;
    if (s.includes('/')) {
        const [a, b] = s.split('/').map((x) => parseInt(x.trim(), 10));
        if (!isNaN(a)) out.with_glasses = a;
        if (!isNaN(b)) out.without_glasses = b;
        out.uses_glasses = 1;
    } else {
        const v = parseInt(s, 10);
        if (!isNaN(v)) out.without_glasses = v;
        out.uses_glasses = 0;
    }
    return out;
};

// --- Utilities --------------------------------------------------------------

const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
};

const toCsv = (rows, headers) => {
    if (!rows || rows.length === 0) return headers.join(',') + '\n';
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push(headers.map((h) => escapeCsv(r[h])).join(','));
    }
    return lines.join('\n') + '\n';
};

const parseGuideList = (str) => {
    if (!str) return new Set();
    return new Set(
        String(str).split(',')
            .map((x) => parseInt(x.trim(), 10))
            .filter((x) => !isNaN(x))
    );
};

// Build the standard key block prepended to every task row. The provenance
// columns (source_file, timestamp) are off by default — the analyst can opt
// back in if needed. condition_order is always included.
const baseKeysFor = (meta, conditionOrder, settings) => {
    const order = conditionOrder[meta.pid]?.[meta.conditionLabel] ?? '';
    const base = {
        pid: meta.pid,
        device_raw: meta.deviceRaw,
        condition: meta.conditionLabel,
        obstruction: meta.obstruction,
        condition_order: order,
    };
    if (settings.provenance.includeSourceFile) base.source_file = meta.filename;
    if (settings.provenance.includeTimestamp) base.timestamp = meta.timestamp;
    return base;
};

// --- participants.csv -------------------------------------------------------

const buildParticipantsTable = (rawFiles, csvFilesList, conditionOrder, settings) => {
    const participants = {};

    for (const rf of rawFiles) {
        const meta = parseFilenameMetadata(rf.filename);
        if (!meta) continue;
        if (!participants[meta.pid]) participants[meta.pid] = { pid: meta.pid };
    }

    if (csvFilesList) {
        for (const csv of csvFilesList) {
            const rows = csv.content.split('\n').filter((r) => r.trim().length > 0);
            if (rows.length < 2) continue;
            const headers = rows[0].split(',').map((h) => h.trim().toLowerCase());
            const parsed = rows.slice(1).map((r) => {
                const cols = r.split(',');
                const obj = {};
                headers.forEach((h, i) => { obj[h] = cols[i] ? cols[i].trim() : ''; });
                return obj;
            });
            const pidRow = parsed.find((r) => r.key === 'participant_id');
            const pid = pidRow ? String(parseInt(pidRow.value, 10)) : null;
            if (!pid) continue;
            if (!participants[pid]) participants[pid] = { pid };

            for (const r of parsed) {
                if (r.questionnaire === 'pre_experiment') {
                    participants[pid][`pre_${r.key}`] = r.value;
                } else if (r.questionnaire === 'final_preference') {
                    participants[pid][`pref_${r.key}`] = r.value;
                }
            }
        }
    }

    if (settings?.questionnaires?.parseVisionScore) {
        for (const pid of Object.keys(participants)) {
            const raw = participants[pid].pre_vision_test_score;
            if (raw !== undefined) {
                const parsed = parseVisionScore(raw);
                participants[pid].vision_with_glasses = parsed.with_glasses;
                participants[pid].vision_without_glasses = parsed.without_glasses;
                participants[pid].vision_uses_glasses = parsed.uses_glasses;
            }
        }
    }

    for (const pid of Object.keys(participants)) {
        const order = conditionOrder[pid] || {};
        participants[pid].order_AR_VST = order['AR-VST'] ?? '';
        participants[pid].order_AR_OST = order['AR-OST'] ?? '';
        participants[pid].order_OnScreen = order['On-Screen'] ?? '';
    }

    const rows = Object.values(participants).sort((a, b) => parseInt(a.pid, 10) - parseInt(b.pid, 10));
    const headerSet = new Set(['pid']);
    for (const r of rows) Object.keys(r).forEach((k) => headerSet.add(k));
    return { headers: Array.from(headerSet), rows };
};

// --- Task 1 -----------------------------------------------------------------

const buildTask1Table = (rawFiles, conditionOrder, settings) => {
    if (!settings.task1.include) return null;
    const visibleSet = parseGuideList(settings.task1.insertionGuidesVisible);
    const obstructSet = parseGuideList(settings.task1.insertionGuidesObstruct);

    const rows = [];
    for (const rf of rawFiles) {
        const meta = parseFilenameMetadata(rf.filename);
        if (!meta || meta.taskNum !== 1) continue;
        const guideData = rf.json?.payload?.find((p) => p.name === 'GuideMeasurement')?.values;
        if (!guideData) continue;
        const measurements = guideData.all_measurements || [];
        const steadyTime = guideData.steady_time_required_seconds ?? null;

        for (const m of measurements) {
            const guide1Based = (m.guide_index || 0) + 1;

            let subtype = 'Surface';
            if (settings.task1.applySubtypeSplit) {
                const insertSet = meta.obstruction.toLowerCase().includes('obstruct') ? obstructSet : visibleSet;
                if (insertSet.has(guide1Based)) subtype = 'Insertion';
            }

            const row = {
                ...baseKeysFor(meta, conditionOrder, settings),
                group_index: m.group_index,
            };

            if (settings.task1.guideIndex1Based) {
                row.guide_index = guide1Based;
            } else {
                row.guide_index = m.guide_index;
            }
            if (settings.task1.applySubtypeSplit) row.subtype = subtype;

            if (settings.task1.positionError) {
                const isInsertNa = settings.task1.applySubtypeSplit
                    && settings.task1.nullPositionForInsertion
                    && subtype === 'Insertion';
                row.position_error_mm = isInsertNa ? 'NA' : m.position_error_mm;
            }
            if (settings.task1.positionErrorVector) {
                row.position_error_vec_x_mm = m.position_error_vector_x_mm;
                row.position_error_vec_y_mm = m.position_error_vector_y_mm;
                row.position_error_vec_z_mm = m.position_error_vector_z_mm;
            }
            if (settings.task1.rotationError) row.rotation_error_degrees = m.rotation_error_degrees;
            if (settings.task1.placementTime) {
                // Raw value — analyst applies steady_time_seconds correction in R if desired.
                row.placement_time_seconds = m.placement_time_seconds;
                if (steadyTime !== null) row.steady_time_seconds = steadyTime;
            }
            if (settings.task1.attempts) row.attempts = m.attempts;
            if (settings.task1.measurementTime) row.measurement_time_seconds = m.measurement_time_seconds;
            if (settings.task1.worldCoords) {
                row.tooltip_x = m.tooltip_position_x;
                row.tooltip_y = m.tooltip_position_y;
                row.tooltip_z = m.tooltip_position_z;
                row.guide_x = m.guide_position_x;
                row.guide_y = m.guide_position_y;
                row.guide_z = m.guide_position_z;
            }

            rows.push(row);
        }
    }
    if (rows.length === 0) return null;
    const headerSet = new Set();
    for (const r of rows) Object.keys(r).forEach((k) => headerSet.add(k));
    return { headers: Array.from(headerSet), rows };
};

// --- Task 3 -----------------------------------------------------------------

const buildTask3Table = (rawFiles, conditionOrder, settings) => {
    if (!settings.task3.include) return null;
    const rows = [];
    for (const rf of rawFiles) {
        const meta = parseFilenameMetadata(rf.filename);
        if (!meta || meta.taskNum !== 3) continue;
        const axisData = rf.json?.payload?.find((p) => p.name === 'AxisMeasurement')?.values;
        if (!axisData) continue;
        const axes = axisData.all_axes_measurements || [];
        const steadyTime = axisData.steady_duration_seconds
            ?? axisData.steady_time_required_seconds
            ?? null;

        for (const a of axes) {
            const row = {
                ...baseKeysFor(meta, conditionOrder, settings),
                axis_index: settings.task3.axisIndex1Based ? (a.axis_index || 0) + 1 : a.axis_index,
                axis_name: a.axis_name,
            };

            if (settings.task3.entryDeviation) row.entry_deviation_mm = a.entry_deviation_mm;
            if (settings.task3.endDeviation) row.end_deviation_mm = a.end_deviation_mm;
            if (settings.task3.entryAttempts) row.entry_attempts = a.entry_attempts;
            if (settings.task3.endAttempts) row.end_attempts = a.end_attempts;
            if (settings.task3.axisTotalTime) {
                // Raw value — analyst applies steady_time_seconds correction in R if desired.
                row.axis_total_time_seconds = a.axis_total_time_seconds;
                if (steadyTime !== null) row.steady_time_seconds = steadyTime;
            }
            if (settings.task3.positions) {
                row.entry_x = a.measured_entry_position_x;
                row.entry_y = a.measured_entry_position_y;
                row.entry_z = a.measured_entry_position_z;
                row.end_x = a.measured_end_position_x;
                row.end_y = a.measured_end_position_y;
                row.end_z = a.measured_end_position_z;
                row.original_entry_x = a.original_entry_position_x;
                row.original_entry_y = a.original_entry_position_y;
                row.original_entry_z = a.original_entry_position_z;
                row.original_end_x = a.original_end_position_x;
                row.original_end_y = a.original_end_position_y;
                row.original_end_z = a.original_end_position_z;
            }
            rows.push(row);
        }
    }
    if (rows.length === 0) return null;
    const headerSet = new Set();
    for (const r of rows) Object.keys(r).forEach((k) => headerSet.add(k));
    return { headers: Array.from(headerSet), rows };
};

// --- Task 2 -----------------------------------------------------------------

const refCache = {};
const getRefData = (obstruction) => {
    const isObstruct = String(obstruction).toLowerCase().includes('obstruct');
    const key = isObstruct ? 'obstruct' : 'visible';
    if (!refCache[key]) {
        refCache[key] = parseReferenceTxt(isObstruct ? obstructTxtRaw : visibleTxtRaw);
        refCache[key].arclength = cumulativeArclength(refCache[key].path);
        const milestoneIdx = new Set();
        for (const m of refCache[key].milestones) {
            let bestIdx = 0, bestSq = Infinity;
            for (let j = 0; j < refCache[key].path.length; j++) {
                const r = refCache[key].path[j];
                if (r.x === null) continue;
                const d = (m.x - r.x) ** 2 + (m.y - r.y) ** 2 + (m.z - r.z) ** 2;
                if (d < bestSq) { bestSq = d; bestIdx = j; }
            }
            milestoneIdx.add(bestIdx);
        }
        refCache[key].milestoneIndices = milestoneIdx;
    }
    return refCache[key];
};

const buildTask2Tables = (rawFiles, conditionOrder, settings) => {
    const tables = {};
    if (!settings.task2.trials && !settings.task2.landmarks
        && !settings.task2.deviationSummary && !settings.task2.deviationProfile
        && !settings.task2.registeredDrawPoints && !settings.task2.referencePaths) {
        return tables;
    }

    const trialRows = [];
    const landmarkRows = [];
    const summaryRows = [];
    const profileRows = [];
    const drawPointRows = [];
    const conditionsUsed = new Set();

    for (const rf of rawFiles) {
        const meta = parseFilenameMetadata(rf.filename);
        if (!meta || meta.taskNum !== 2) continue;
        const v = rf.json?.payload?.find((p) => p.name === 'SurfaceDrawing')?.values;
        if (!v) continue;
        conditionsUsed.add(meta.obstruction);
        const baseKeys = baseKeysFor(meta, conditionOrder, settings);

        // Trial-level row
        if (settings.task2.trials) {
            const row = {
                ...baseKeys,
                drawing_duration_seconds: v.drawing_duration_seconds,
                reference_points_found: v.reference_points_found,
            };
            if (settings.task2.pathLength) row.total_path_length_mm = v.total_path_length_mm;
            if (settings.task2.segmentStats) {
                row.segment_distance_mean_mm = v.mean_segment_distance_mm;
                row.segment_distance_median_mm = v.median_segment_distance_mm;
                row.segment_distance_max_mm = v.max_segment_distance_mm;
                row.segment_distance_min_mm = v.min_segment_distance_mm;
            }
            trialRows.push(row);
        }

        // Per-landmark rows
        if (settings.task2.landmarks) {
            const landmarks = v.reference_point_measurements || [];
            landmarks.forEach((lm, idx) => {
                landmarkRows.push({
                    ...baseKeys,
                    landmark_index: idx + 1,
                    landmark_name: lm.reference_name,
                    distance_mm: lm.distance_mm,
                    closest_draw_point_index: lm.closest_draw_point_index,
                });
            });
        }

        // Spatial computations only if needed
        const needsSpatial = settings.task2.deviationSummary
            || settings.task2.deviationProfile
            || settings.task2.registeredDrawPoints;

        if (needsSpatial) {
            const transform = getSurfaceTransform(v);
            const transformed = transformDrawPoints(v.all_draw_points || [], transform);
            const withTime = normalizeTimestampsToSeconds(transformed);
            const ref = getRefData(meta.obstruction);
            const deviations = computeDeviations(withTime, ref.path, ref.arclength);

            const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
            const std = (arr) => {
                const mu = mean(arr);
                return Math.sqrt(arr.reduce((s, x) => s + (x - mu) ** 2, 0) / arr.length);
            };
            const median = (arr) => arr.length % 2 ? arr[(arr.length - 1) / 2] : 0.5 * (arr[arr.length / 2 - 1] + arr[arr.length / 2]);
            const rms = (arr) => Math.sqrt(mean(arr.map((x) => x * x)));

            // Per-trial summary
            if (settings.task2.deviationSummary) {
                const valid = deviations.filter((d) => d && d.dev_total_mm !== null);
                if (valid.length > 0) {
                    const totals = valid.map((d) => d.dev_total_mm);
                    const perps = valid.map((d) => d.dev_perp_mm);
                    const laterals = valid.map((d) => d.dev_lateral_mm);
                    const sortedT = totals.slice().sort((a, b) => a - b);
                    summaryRows.push({
                        ...baseKeys,
                        n_points: valid.length,
                        dev_total_mean_mm: mean(totals),
                        dev_total_median_mm: median(sortedT),
                        dev_total_rms_mm: rms(totals),
                        dev_total_max_mm: Math.max(...totals),
                        dev_total_std_mm: std(totals),
                        dev_perp_mean_mm: mean(perps),
                        dev_perp_rms_mm: rms(perps),
                        dev_perp_signed_mean_mm: mean(perps),
                        dev_lateral_mean_mm: mean(laterals),
                        dev_lateral_rms_mm: rms(laterals),
                        dev_lateral_signed_mean_mm: mean(laterals),
                        frac_within_2mm: totals.filter((x) => x <= 2).length / totals.length,
                        frac_within_5mm: totals.filter((x) => x <= 5).length / totals.length,
                    });
                }
            }

            // Profile binned along reference arclength
            if (settings.task2.deviationProfile) {
                const nBins = Math.max(2, settings.task2.deviationProfileBins | 0);
                const totalArc = ref.arclength[ref.arclength.length - 1] || 1;
                const bins = Array.from({ length: nBins }, () => ({
                    totalSum: 0, totalMax: 0, perpSum: 0, latSum: 0, n: 0,
                }));
                for (const d of deviations) {
                    if (!d || d.dev_total_mm === null) continue;
                    let binIdx = Math.floor((d.arclength_m / totalArc) * nBins);
                    if (binIdx >= nBins) binIdx = nBins - 1;
                    if (binIdx < 0) binIdx = 0;
                    bins[binIdx].totalSum += d.dev_total_mm;
                    bins[binIdx].totalMax = Math.max(bins[binIdx].totalMax, d.dev_total_mm);
                    bins[binIdx].perpSum += d.dev_perp_mm;
                    bins[binIdx].latSum += d.dev_lateral_mm;
                    bins[binIdx].n += 1;
                }
                bins.forEach((b, i) => {
                    if (b.n === 0) return;
                    profileRows.push({
                        ...baseKeys,
                        bin_index: i,
                        bin_path_distance_m: ((i + 0.5) / nBins) * totalArc,
                        bin_n_points: b.n,
                        dev_total_mean_mm: b.totalSum / b.n,
                        dev_total_max_mm: b.totalMax,
                        dev_perp_mean_mm: b.perpSum / b.n,
                        dev_lateral_mean_mm: b.latSum / b.n,
                    });
                });
            }

            // Registered draw points
            if (settings.task2.registeredDrawPoints) {
                for (let i = 0; i < withTime.length; i++) {
                    const p = withTime[i];
                    const d = deviations[i];
                    drawPointRows.push({
                        ...baseKeys,
                        point_index: p.index,
                        is_line_break: p.is_line_break ? 1 : 0,
                        t_seconds: p.t_seconds,
                        x_local_mm: p.x * 1000,
                        y_local_mm: p.y * 1000,
                        z_local_mm: p.z * 1000,
                        ref_arclength_m: d?.arclength_m ?? '',
                        dev_total_mm: d?.dev_total_mm ?? '',
                        dev_perp_mm: d?.dev_perp_mm ?? '',
                        dev_lateral_mm: d?.dev_lateral_mm ?? '',
                    });
                }
            }
        }
    }

    const buildTbl = (rows) => {
        if (rows.length === 0) return null;
        const headerSet = new Set();
        for (const r of rows) Object.keys(r).forEach((k) => headerSet.add(k));
        return { headers: Array.from(headerSet), rows };
    };

    if (settings.task2.trials) tables.task2_trials = buildTbl(trialRows);
    if (settings.task2.landmarks) tables.task2_landmarks = buildTbl(landmarkRows);
    if (settings.task2.deviationSummary) tables.task2_deviation_summary = buildTbl(summaryRows);
    if (settings.task2.deviationProfile) tables.task2_deviation_profile = buildTbl(profileRows);
    if (settings.task2.registeredDrawPoints) tables.task2_drawpoints = buildTbl(drawPointRows);

    // Reference paths file (auto-include if any spatial export is on, OR explicit toggle)
    const wantRef = settings.task2.referencePaths
        || settings.task2.deviationProfile
        || settings.task2.registeredDrawPoints;
    if (wantRef) {
        const refRows = [];
        for (const obstruction of conditionsUsed) {
            const ref = getRefData(obstruction);
            for (let j = 0; j < ref.path.length; j++) {
                const r = ref.path[j];
                if (r.x === null) continue;
                refRows.push({
                    obstruction,
                    ref_index: j,
                    arclength_m: ref.arclength[j],
                    x_mm: r.x * 1000,
                    y_mm: r.y * 1000,
                    z_mm: r.z * 1000,
                    is_milestone: ref.milestoneIndices.has(j) ? 1 : 0,
                });
            }
        }
        const refTbl = buildTbl(refRows);
        if (refTbl) tables.reference_paths = refTbl;
    }

    return tables;
};

// --- Questionnaires ---------------------------------------------------------

const buildQuestionnaireTable = (csvFilesList, conditionOrder, settings) => {
    if (!settings.questionnaires.include || !csvFilesList) return null;
    const arOnlyKeys = new Set(
        String(settings.questionnaires.arOnlyKeys || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    );
    const rows = [];

    for (const csv of csvFilesList) {
        const lines = csv.content.split('\n').filter((r) => r.trim().length > 0);
        if (lines.length < 2) continue;
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const parsed = lines.slice(1).map((r) => {
            const cols = r.split(',');
            const obj = {};
            headers.forEach((h, i) => { obj[h] = cols[i] ? cols[i].trim() : ''; });
            return obj;
        });
        const pidRow = parsed.find((r) => r.key === 'participant_id');
        const pid = pidRow ? String(parseInt(pidRow.value, 10)) : null;
        if (!pid) continue;

        const skipKeys = new Set(['participant_id', 'condition', 'dominant_hand', 'age_group', 'ipd', 'previous_ar_experience', 'vision_test_score']);

        // Aggregate per (questionnaire, condition) for NASA-TLX overall
        const tlxScores = {}; // condition → { sum, n }

        for (const r of parsed) {
            if (skipKeys.has(r.key)) continue;
            if (r.questionnaire === 'pre_experiment' || r.questionnaire === 'final_preference') continue;
            const condLabel = normalizeQuestionnaireCondition(r.condition);
            const order = conditionOrder[pid]?.[condLabel] ?? '';

            // Drop AR-only items for On-Screen rows in PCUE-Q
            if (settings.questionnaires.dropArOnlyForOnScreen
                && r.questionnaire === 'pcueq'
                && condLabel === 'On-Screen'
                && arOnlyKeys.has(r.key.toUpperCase())) {
                continue;
            }

            const numVal = r.value === '' ? '' : parseFloat(r.value);
            const valOut = (r.value === '' || isNaN(numVal)) ? r.value : numVal;

            rows.push({
                pid,
                questionnaire: r.questionnaire,
                condition: condLabel,
                condition_order: order,
                key: r.key,
                value: valOut,
            });

            if (r.questionnaire === 'nasa_tlx' && typeof valOut === 'number') {
                if (!tlxScores[condLabel]) tlxScores[condLabel] = { sum: 0, n: 0 };
                tlxScores[condLabel].sum += valOut;
                tlxScores[condLabel].n += 1;
            }
        }

        if (settings.questionnaires.computeNasaTlxOverall) {
            for (const cond of Object.keys(tlxScores)) {
                const s = tlxScores[cond];
                rows.push({
                    pid,
                    questionnaire: 'nasa_tlx',
                    condition: cond,
                    condition_order: conditionOrder[pid]?.[cond] ?? '',
                    key: 'overall_mean',
                    value: s.n > 0 ? s.sum / s.n : '',
                });
            }
        }
    }

    if (rows.length === 0) return null;
    return { headers: ['pid', 'questionnaire', 'condition', 'condition_order', 'key', 'value'], rows };
};

// --- README -----------------------------------------------------------------

const buildReadme = (settings, tables) => {
    const lines = [];
    lines.push('AR Guidance Analyzer — data export');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('');
    lines.push('Files in this archive:');
    for (const name of Object.keys(tables)) lines.push(`  - ${name}.csv`);
    lines.push('');
    lines.push('Common key columns (joinable across all task tables):');
    lines.push('  pid                participant id (string of digits)');
    lines.push('  device_raw         raw device label from filename (HoloLens_2 / Quest_3 / Screen)');
    lines.push('  condition          normalized condition label (AR-OST / AR-VST / On-Screen)');
    lines.push('  obstruction        Visible / Obstruct');
    lines.push('  condition_order    1, 2 or 3 — rank by earliest filename timestamp per participant');
    if (settings.provenance.includeSourceFile) lines.push('  source_file        original JSON filename (provenance)');
    if (settings.provenance.includeTimestamp) lines.push('  timestamp          ISO datetime parsed from the filename (provenance)');
    lines.push('');
    lines.push('Time fields are RAW (no correction applied). The steady_time_seconds column,');
    lines.push('when present, records the steady-position hold required by the task — subtract');
    lines.push('it in your analysis if you want corrected times.');
    lines.push('  task1_placing.placement_time_seconds   - steady_time_seconds');
    lines.push('  task3_reaching.axis_total_time_seconds - steady_time_seconds');
    lines.push('');
    if (tables.task1_placing) {
        lines.push('task1_placing.csv — one row per (participant × condition × group × guide).');
        if (settings.task1.applySubtypeSplit) {
            lines.push(`  subtype: Insertion guides (1-based) Visible={${settings.task1.insertionGuidesVisible}} Obstruct={${settings.task1.insertionGuidesObstruct}}; remainder = Surface.`);
            if (settings.task1.nullPositionForInsertion) {
                lines.push('  position_error_mm = NA for Insertion rows (per protocol).');
            }
        }
        lines.push('');
    }
    if (tables.task2_trials || tables.task2_landmarks) {
        lines.push('task2_trials.csv — one row per Task 2 trial (drawing duration, milestones found).');
        lines.push('task2_landmarks.csv — one row per landmark (distance_mm to nearest user point).');
        lines.push('');
    }
    if (tables.task2_deviation_summary) {
        lines.push('task2_deviation_summary.csv — per-trial 3D-deviation stats (mean / RMS / max / std / signed mean / banded fractions).');
        lines.push('  Deviations computed from registered (surface-local) draw points vs the reference path.');
        lines.push('');
    }
    if (tables.task2_deviation_profile) {
        lines.push(`task2_deviation_profile.csv — per-trial deviation binned into ${settings.task2.deviationProfileBins} equal-width bins along reference arclength.`);
        lines.push('');
    }
    if (tables.task2_drawpoints) {
        lines.push('task2_drawpoints.csv — registered draw points in surface-local mm.');
        lines.push('  Columns x_local_mm / y_local_mm / z_local_mm are after subtracting surface_position');
        lines.push('  and rotating by the inverse of surface_rotation_quat. Units = millimeters.');
        lines.push('  dist_to_closest_ref_mm = nearest 3D distance to the reference path point at closest_ref_index.');
        lines.push('  Reference frame alignment is assumed (surface anchor = .txt authoring frame).');
        lines.push('  See reference_paths.csv for the smoothed reference geometry to overlay.');
        lines.push('');
    }
    if (tables.reference_paths) {
        lines.push('reference_paths.csv — smoothed reference path per obstruction (Visible / Obstruct).');
        lines.push('  Same surface-local frame as task2_drawpoints. Units = millimeters.');
        lines.push('');
    }
    if (tables.task3_reaching) {
        lines.push('task3_reaching.csv — one row per (participant × condition × axis).');
        lines.push('');
    }
    if (tables.participants && settings.questionnaires.parseVisionScore) {
        lines.push('participants.csv — vision_test_score parsed into:');
        lines.push('  vision_with_glasses      denominator of "20/X" with glasses (NA if single value)');
        lines.push('  vision_without_glasses   denominator of "20/X" without glasses');
        lines.push('  vision_uses_glasses      1 = two values reported (had glasses), 0 = single value (no glasses)');
        lines.push('  Raw value preserved as pre_vision_test_score.');
        lines.push('');
    }
    if (tables.questionnaires) {
        lines.push('questionnaires.csv — long-format survey responses.');
        if (settings.questionnaires.dropArOnlyForOnScreen) {
            lines.push(`  PCUE-Q items {${settings.questionnaires.arOnlyKeys}} dropped for On-Screen rows (AR-only items).`);
        }
        if (settings.questionnaires.computeNasaTlxOverall) {
            lines.push('  Includes synthetic key=overall_mean per (pid × condition) = mean of NASA-TLX q0..q5.');
        }
        lines.push('');
    }
    lines.push('Quick start in R:');
    lines.push('  library(tidyverse)');
    lines.push('  participants <- read_csv("participants.csv")');
    lines.push('  t1 <- read_csv("task1_placing.csv") |> left_join(participants, by = "pid")');
    return lines.join('\n');
};

// --- Public entry point -----------------------------------------------------

export const buildExportArchive = async (rawFiles, csvFilesList, settings) => {
    const conditionOrder = deriveConditionOrder(rawFiles);
    const tables = {};

    const participantsTbl = buildParticipantsTable(rawFiles, csvFilesList, conditionOrder, settings);
    if (participantsTbl.rows.length > 0) tables.participants = participantsTbl;

    const t1 = buildTask1Table(rawFiles, conditionOrder, settings);
    if (t1) tables.task1_placing = t1;

    const t2 = buildTask2Tables(rawFiles, conditionOrder, settings);
    Object.assign(tables, t2);

    const t3 = buildTask3Table(rawFiles, conditionOrder, settings);
    if (t3) tables.task3_reaching = t3;

    const q = buildQuestionnaireTable(csvFilesList, conditionOrder, settings);
    if (q) tables.questionnaires = q;

    const zip = new JSZip();
    for (const [name, tbl] of Object.entries(tables)) {
        zip.file(`${name}.csv`, toCsv(tbl.rows, tbl.headers));
    }
    zip.file('README.txt', buildReadme(settings, tables));

    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, tables };
};

export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
