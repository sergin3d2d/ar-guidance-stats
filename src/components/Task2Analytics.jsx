import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { getColor } from '../utils/colors';
import {
    parseReferenceTxt,
    getSurfaceTransform,
    transformDrawPoints,
    transformPointToLocal,
    cumulativeArclength,
    computeDeviations,
    detectAndFlipDirection,
    measureAlignmentOffset,
} from '../utils/task2Spatial';

import visibleTxtRaw from '../../Visible.txt?raw';
import obstructTxtRaw from '../../Obstruct.txt?raw';

const visibleRefData = parseReferenceTxt(visibleTxtRaw);
const obstructRefData = parseReferenceTxt(obstructTxtRaw);
const visibleRefPoints = visibleRefData.path;
const visibleRefMilestones = visibleRefData.milestones;
const obstructRefPoints = obstructRefData.path;
const obstructRefMilestones = obstructRefData.milestones;

const visibleRefDistances = cumulativeArclength(visibleRefPoints);
const obstructRefDistances = cumulativeArclength(obstructRefPoints);

// Note: milestones are now sourced per-trial from JSON reference_point_measurements
// (not the .txt clustered red dots) so the dashboard uses the same M01..M15
// numbering as the Maya export. See buildJsonMilestones inside Task2Analytics.

const calculateYMid = (points) => {
    const ys = points.map((p) => p.y).filter((y) => y !== null && y !== undefined);
    if (ys.length === 0) return 0;
    return (Math.min(...ys) + Math.max(...ys)) / 2;
};
const visibleYMid = calculateYMid(visibleRefPoints);
const obstructYMid = calculateYMid(obstructRefPoints);

const Task2Analytics = ({ participantData, participantId }) => {
    const [selectedMethods, setSelectedMethods] = useState(null);
    const [selectedConditions, setSelectedConditions] = useState(['Visible', 'Obstructed']);

    const taskData = participantData?.['Task2'] || {};
    const visibleData = taskData['Visible'] || {};
    const obstructedData = taskData['Obstructed'] || {};

    const visibleMethods = Object.keys(visibleData);
    const obstructedMethods = Object.keys(obstructedData);

    const series = [];
    visibleMethods.forEach(m => series.push({ method: m, condition: 'Visible', data: visibleData[m], name: `${m} (Visible)` }));
    obstructedMethods.forEach(m => series.push({ method: m, condition: 'Obstructed', data: obstructedData[m], name: `${m} (Obstructed)` }));

    const getMethodSortIndex = (m) => {
        const lower = m.toLowerCase();
        if (lower.includes('hololens')) return 0;
        if (lower.includes('quest')) return 1;
        if (lower.includes('screen')) return 2;
        return 3;
    };

    series.sort((a, b) => {
        const mDiff = getMethodSortIndex(a.method) - getMethodSortIndex(b.method);
        if (mDiff !== 0) return mDiff;
        return a.condition === 'Visible' ? -1 : 1;
    });

    const allMethods = [...new Set([...visibleMethods, ...obstructedMethods])];
    allMethods.sort((a, b) => getMethodSortIndex(a) - getMethodSortIndex(b));

    const currentMethods = selectedMethods === null ? allMethods : selectedMethods;

    const handleMethodToggle = (m) => setSelectedMethods(prev => {
        const current = prev === null ? allMethods : prev;
        return current.includes(m) ? current.filter(x => x !== m) : [...current, m];
    });
    const handleConditionToggle = (c) => setSelectedConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    if (series.length === 0) {
        return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>No Task 2 data extracted for this participant.</div>;
    }

    const filteredSeries = series.filter(s => 
        currentMethods.includes(s.method) && 
        selectedConditions.includes(s.condition)
    );

    const renderFilters = () => (
        <div className="glass-card" style={{ padding: '15px', marginBottom: '20px', display: 'flex', gap: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 600 }}>Guidance Methods:</span>
                {allMethods.map(m => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
                        <input type="checkbox" checked={currentMethods.includes(m)} onChange={() => handleMethodToggle(m)} />
                        {m}
                    </label>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 600 }}>Conditions:</span>
                {['Visible', 'Obstructed'].map(c => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
                        <input type="checkbox" checked={selectedConditions.includes(c)} onChange={() => handleConditionToggle(c)} />
                        {c}
                    </label>
                ))}
            </div>
        </div>
    );

    if (filteredSeries.length === 0) {
        return (
            <div className="task-analytics-panel fadeIn">
                {renderFilters()}
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                    Select at least one guidance method and one condition to view analytical comparisons.
                </div>
            </div>
        );
    }

    const getMetric = (metricKey) => filteredSeries.map(s => s.data[metricKey] || 0);

    // Summary Metrics
    const durations = getMetric('drawingDuration');
    const pathLengths = getMetric('pathLength');
    const referencePoints = getMetric('referencePointsFound');
    const segmentDistancesMean = getMetric('segmentDistanceMean');
    const segmentDistancesMax = getMetric('segmentDistanceMax');

    // Deep Arrays
    const allDrawPointsList = filteredSeries.map(s => s.data.allDrawPoints || []);
    const refPointMeasurementsList = filteredSeries.map(s => s.data.referencePointMeasurements || []);

    // Pre-compute the surface-local transform of every draw-point set.
    // Used by both the deviation profile and the 3D Spatial Trace so they agree.
    const transformedSeries = filteredSeries.map((s) => {
        const transform = getSurfaceTransform({
            surface_position_x: s.data.surfacePositionX,
            surface_position_y: s.data.surfacePositionY,
            surface_position_z: s.data.surfacePositionZ,
            surface_rotation_quat_x: s.data.surfaceRotationQuatX,
            surface_rotation_quat_y: s.data.surfaceRotationQuatY,
            surface_rotation_quat_z: s.data.surfaceRotationQuatZ,
            surface_rotation_quat_w: s.data.surfaceRotationQuatW,
        });
        return transformDrawPoints(s.data.allDrawPoints || [], transform);
    });

    // Build JSON-derived milestones (15 per trial) in surface-local frame, using
    // the JSON's natural sphere-ID order so M01..M15 mean the same thing here
    // and in the Maya export. Picks the first available trial per condition.
    const buildJsonMilestones = (seriesList) => {
        const firstWithData = seriesList.find((s) => {
            const i = filteredSeries.indexOf(s);
            return transformedSeries[i] && transformedSeries[i].some((p) => !p.is_line_break);
        });
        if (!firstWithData) return [];
        const refMeasurements = firstWithData.data.referencePointMeasurements || [];
        const transform = getSurfaceTransform({
            surface_position_x: firstWithData.data.surfacePositionX,
            surface_position_y: firstWithData.data.surfacePositionY,
            surface_position_z: firstWithData.data.surfacePositionZ,
            surface_rotation_quat_x: firstWithData.data.surfaceRotationQuatX,
            surface_rotation_quat_y: firstWithData.data.surfaceRotationQuatY,
            surface_rotation_quat_z: firstWithData.data.surfaceRotationQuatZ,
            surface_rotation_quat_w: firstWithData.data.surfaceRotationQuatW,
        });
        return refMeasurements.map((m, i) => {
            const planned = transformPointToLocal({
                position_x: m.reference_position_x,
                position_y: m.reference_position_y,
                position_z: m.reference_position_z,
            }, transform);
            return {
                x: planned.x,
                y: planned.y,
                z: planned.z,
                label: `M${String(i + 1).padStart(2, '0')}`,
                name: m.reference_name,
            };
        });
    };
    const visibleJsonMilestones = buildJsonMilestones(filteredSeries.filter((s) => s.condition === 'Visible'));
    const obstructJsonMilestones = buildJsonMilestones(filteredSeries.filter((s) => s.condition === 'Obstructed'));

    // One-shot alignment warning: surface-local user trace vs reference path.
    // Logs to console (dev) — UI banner could be added later if it's a recurring issue.
    if (typeof window !== 'undefined' && !window.__ar_alignment_checked) {
        window.__ar_alignment_checked = true;
        filteredSeries.forEach((s, i) => {
            const ref = s.condition === 'Visible' ? visibleRefPoints : obstructRefPoints;
            const offsetMm = measureAlignmentOffset(transformedSeries[i], ref);
            if (offsetMm !== null && offsetMm > 50) {
                console.warn(`[Task2 alignment] ${s.name}: user-trace centroid is ${offsetMm.toFixed(1)} mm from reference centroid in surface-local space. Reference frame may not match the surface anchor.`);
            }
        });
    }

    const layoutTheme = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#314150', family: 'Inter' },
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };

    const validDurations = durations.filter(v => v > 0);
    const minDuration = validDurations.length > 0 ? Math.min(...validDurations) : 0;
    const bestDurationIndex = durations.indexOf(minDuration);

    const validSegmentMean = segmentDistancesMean.filter(v => v > 0);
    const minSegmentMean = validSegmentMean.length > 0 ? Math.min(...validSegmentMean) : 0;
    const bestSegmentMeanIndex = segmentDistancesMean.indexOf(minSegmentMean);

    const validSegmentMax = segmentDistancesMax.filter(v => v > 0);
    const minSegmentMax = validSegmentMax.length > 0 ? Math.min(...validSegmentMax) : 0;
    const bestSegmentMaxIndex = segmentDistancesMax.indexOf(minSegmentMax);

    // Helper to calculate velocity array for coloring the 2D trace
    const calculateVelocities = (points) => {
        if (!points || points.length === 0) return [];
        const velocities = [0]; 

        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];

            if (p2.is_line_break) {
                velocities.push(0);
                continue;
            }

            const dx = p2.position_x - p1.position_x;
            const dy = p2.position_y - p1.position_y;
            const dz = p2.position_z - p1.position_z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const dt = p2.timestamp - p1.timestamp;

            if (dt > 0) Object.is(dist / dt, NaN) ? velocities.push(0) : velocities.push(dist / dt);
            else velocities.push(0);
        }
        return velocities;
    };

    const calculateJitter = (points) => {
        if (!points || points.length < 3) return [];
        const jitter = [0];
        for (let i = 1; i < points.length - 1; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            if (p1.is_line_break || p2.is_line_break) { jitter.push(0); continue; }

            const d1 = Math.sqrt((p1.position_x - p0.position_x)**2 + (p1.position_y - p0.position_y)**2 + (p1.position_z - p0.position_z)**2);
            const d2 = Math.sqrt((p2.position_x - p1.position_x)**2 + (p2.position_y - p1.position_y)**2 + (p2.position_z - p1.position_z)**2);
            jitter.push(Math.abs(d2 - d1));
        }
        if (points.length > 1) jitter.push(0);
        return jitter;
    };

    const getComparativeY = (s, key) => {
        if (key === 'deviationAvg') {
            const refPoints = s.data.referencePointMeasurements || [];
            const distances = refPoints.map(r => r.distance_mm || 0);
            return distances.length > 0 ? (distances.reduce((a, b) => a + b, 0) / distances.length) : 0;
        }
        return s.data[key] || 0;
    };

    const smoothData = (points, values, windowSeconds = 0.25) => {
        if (!points || points.length === 0) return [];
        const validValues = values || [];
        
        const dtSample = points.length > 5 
            ? Math.abs(points[5].timestamp - points[0].timestamp) / 5 
            : (points.length > 1 ? Math.abs(points[1].timestamp - points[0].timestamp) : 0);
        const isNano = dtSample > 1000 || dtSample === 0;
        const windowSize = windowSeconds * (isNano ? 1e9 : 1.0);

        const smoothed = [];
        let left = 0, right = 0, sum = 0;

        for (let i = 0; i < points.length; i++) {
            const tMin = points[i].timestamp - windowSize / 2;
            const tMax = points[i].timestamp + windowSize / 2;

            while (left < points.length && points[left].timestamp < tMin) {
                sum -= (validValues[left] || 0);
                left++;
            }
            while (right < points.length && points[right].timestamp <= tMax) {
                sum += (validValues[right] || 0);
                right++;
            }

            const count = right - left;
            smoothed.push(count > 0 ? sum / count : (validValues[i] || 0));
        }
        return smoothed;
    };

    return (
        <div className="task-analytics-panel fadeIn">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                Task 2 (Tracing) Deep Analysis: <span style={{ color: 'var(--primary)' }}>{participantId}</span>
            </h2>

            {renderFilters()}

            {/* 1. Grouped Variable Summary Grid */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                    Grouped Variable Summary
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    {filteredSeries.map((s, idx) => (
                        <div key={idx} className="glass-card" style={{ padding: '20px', borderLeft: `4px solid ${getColor(s.method, s.condition)}` }}>
                            <h4 style={{ margin: '0 0 12px 0', color: getColor(s.method, s.condition), fontSize: '1rem' }}>
                                {s.name}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: 'var(--text)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Path Length</span>
                                    <span><strong>{s.data.pathLength?.toFixed(1)}mm</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Drawing Duration</span>
                                    <span><strong>{s.data.drawingDuration?.toFixed(1)}s</strong></span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)', marginBottom: '4px' }}>Segment Distance</span>
                                    <div style={{ paddingLeft: '8px', fontSize: '0.85rem' }}>
                                        Mean: <strong>{s.data.segmentDistanceMean?.toFixed(1)}mm</strong> | Med: {s.data.segmentDistanceMedian?.toFixed(1)}mm | Max: {s.data.segmentDistanceMax?.toFixed(1)}mm | Min: {s.data.segmentDistanceMin?.toFixed(1)}mm
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Milestones Hit</span>
                                    <span><strong>{s.data.referencePointsFound}</strong></span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Comparative Analysis (Averages) */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                    Comparative Analysis (Averages)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                    {[
                        { title: 'Avg Path Length', key: 'pathLength', yaxis: 'mm' },
                        { title: 'Avg Drawing Duration', key: 'drawingDuration', yaxis: 'Seconds' },
                        { title: 'Avg Deviation from Milestones', key: 'deviationAvg', yaxis: 'mm' }
                    ].map((chart, cIdx) => (
                        <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '0.95rem', color: 'var(--text)', marginBottom: '15px' }}>{chart.title}</h4>
                            <Plot
                                data={[{
                                    x: filteredSeries.slice().reverse().map(s => getComparativeY(s, chart.key)),
                                    y: filteredSeries.slice().reverse().map(s => s.name),
                                    type: 'bar', orientation: 'h',
                                    marker: { color: filteredSeries.slice().reverse().map(s => getColor(s.method, s.condition)) }
                                }]}
                                layout={{ ...layoutTheme, xaxis: { title: chart.yaxis }, yaxis: { automargin: true }, showlegend: false }}
                                useResizeHandler={true} style={{ width: '100%', height: '250px' }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Descriptive Statistics (Graphs list) */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                    Descriptive Statistics
                </h3>

                {/* Milestone Deviation Barchart */}
                <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Deviation from Target Milestones</h4>
                    <Plot
                        data={filteredSeries.map((s, i) => {
                            const refPoints = refPointMeasurementsList[i] || [];
                            return {
                                x: refPoints.map((_, idx) => `Milestone ${idx+1}`),
                                y: refPoints.map(r => r.distance_mm || 0),
                                name: s.name, type: 'bar',
                                marker: { color: getColor(s.method, s.condition) }
                            };
                        })}
                        layout={{ ...layoutTheme, barmode: 'group', xaxis: { title: 'Reference Points' }, yaxis: { title: 'Deviation (mm)' }, legend: { orientation: 'h', y: -0.2 } }}
                        useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                    />
                </div>

                {/* Path Deviation Profile — perpendicular + lateral decomposition vs ref arclength */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>
                    {Object.entries(
                        filteredSeries.reduce((acc, s) => {
                            if (!acc[s.condition]) acc[s.condition] = [];
                            acc[s.condition].push(s);
                            return acc;
                        }, {})
                    ).map(([conditionName, seriesGroup], cIdx) => {
                        const yMid = conditionName === 'Visible' ? visibleYMid : obstructYMid;
                        const refPointsRaw = conditionName === 'Visible' ? visibleRefPoints : obstructRefPoints;
                        const refDistRaw = conditionName === 'Visible' ? visibleRefDistances : obstructRefDistances;
                        // Use JSON-derived milestones (same M01..M15 numbering as Maya).
                        const milestonesForCond = conditionName === 'Visible' ? visibleJsonMilestones : obstructJsonMilestones;

                        // Detect direction once per condition using the first available series
                        // with data, so all series in this panel share the same X axis orientation.
                        const firstSeriesWithData = seriesGroup.find((s) => {
                            const i = filteredSeries.indexOf(s);
                            return transformedSeries[i] && transformedSeries[i].some((p) => !p.is_line_break);
                        });
                        let refPath = refPointsRaw;
                        let refDist = refDistRaw;
                        let reversed = false;
                        if (firstSeriesWithData) {
                            const dirIdx = filteredSeries.indexOf(firstSeriesWithData);
                            const flip = detectAndFlipDirection(transformedSeries[dirIdx], refPointsRaw, refDistRaw);
                            refPath = flip.refPath;
                            refDist = flip.refArclength;
                            reversed = flip.reversed;
                        }
                        const totalArc = refDist[refDist.length - 1] || 0;

                        // Project each JSON milestone onto the (possibly flipped) reference
                        // polyline to find its arclength position on the X axis.
                        const milestoneEntries = milestonesForCond.map((m) => {
                            let bestIdx = 0, bestSq = Infinity;
                            for (let j = 0; j < refPath.length; j++) {
                                const r = refPath[j];
                                if (r.x === null) continue;
                                const d = (m.x - r.x) ** 2 + (m.y - r.y) ** 2 + (m.z - r.z) ** 2;
                                if (d < bestSq) { bestSq = d; bestIdx = j; }
                            }
                            return { arc: refDist[bestIdx] || 0, label: m.label };
                        });

                        // Convex/concave background regions (heuristic: above/below ref Y midline)
                        const bgShapes = [];
                        let currentState = null;
                        let startX = 0;
                        for (let j = 0; j < refPath.length; j++) {
                            if (refPath[j].x === null) continue;
                            const state = refPath[j].y > yMid ? 'convex' : 'concave';
                            if (currentState === null) {
                                currentState = state;
                                startX = refDist[j];
                            } else if (currentState !== state) {
                                bgShapes.push({
                                    type: 'rect', xref: 'x', yref: 'paper',
                                    x0: startX, x1: refDist[j], y0: 0, y1: 1,
                                    fillcolor: currentState === 'convex' ? 'rgba(255,100,100,0.08)' : 'rgba(100,200,100,0.08)',
                                    layer: 'below', line: { width: 0 },
                                });
                                currentState = state;
                                startX = refDist[j];
                            }
                        }
                        if (currentState !== null && refPath.length > 0) {
                            bgShapes.push({
                                type: 'rect', xref: 'x', yref: 'paper',
                                x0: startX, x1: totalArc, y0: 0, y1: 1,
                                fillcolor: currentState === 'convex' ? 'rgba(255,100,100,0.08)' : 'rgba(100,200,100,0.08)',
                                layer: 'below', line: { width: 0 },
                            });
                        }

                        // Vertical milestone lines
                        for (const me of milestoneEntries) {
                            bgShapes.push({
                                type: 'line', xref: 'x', yref: 'paper',
                                x0: me.arc, x1: me.arc, y0: 0, y1: 1,
                                line: { color: 'rgba(0,0,0,0.45)', width: 1, dash: 'dot' },
                                layer: 'below',
                            });
                        }

                        const traces = seriesGroup.flatMap((s) => {
                            const origIdx = filteredSeries.indexOf(s);
                            const transformed = transformedSeries[origIdx];
                            // Direction was already detected above; pass the directional ref
                            // and disable autoflip so each series uses the same orientation.
                            const deviations = computeDeviations(transformed, refPath, refDist, { autoFlipDirection: false });

                            // Sort by arclength so the line is monotonic along the path.
                            // Where the user traced the same arclength multiple times (back-and-forth
                            // strokes), the line just wiggles vertically at that x — much more readable
                            // than connecting time-adjacent points across the whole chart.
                            const pairs = [];
                            for (const d of deviations) {
                                if (!d || d.dev_lateral_mm === null) continue;
                                pairs.push({ x: d.arclength_m, y: d.dev_lateral_mm });
                            }
                            pairs.sort((a, b) => a.x - b.x);
                            const color = getColor(s.method, s.condition);
                            return [{
                                x: pairs.map((p) => p.x),
                                y: pairs.map((p) => p.y),
                                type: 'scatter', mode: 'lines', name: s.name,
                                line: { color, width: 1.6 },
                                legendgroup: s.name,
                                hovertemplate: 'arc=%{x:.3f} m<br>lateral=%{y:.2f} mm<extra></extra>',
                            }];
                        });

                        // Landmark markers along the X axis at y=0
                        if (milestoneEntries.length > 0) {
                            traces.push({
                                x: milestoneEntries.map((m) => m.arc),
                                y: milestoneEntries.map(() => 0),
                                type: 'scatter', mode: 'markers+text',
                                marker: { size: 9, color: 'rgba(0,0,0,0.6)', symbol: 'diamond-open' },
                                text: milestoneEntries.map((m) => m.label),
                                textposition: 'top center',
                                textfont: { size: 10, color: 'rgba(0,0,0,0.7)' },
                                name: 'Reference milestones',
                                hovertemplate: 'milestone %{text}<br>arc=%{x:.3f} m<extra></extra>',
                            });
                        }

                        return (
                            <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                                <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '10px' }}>Path Deviation Profile: {conditionName}</h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                                    Each user point projects onto the closest segment of the planned path; pairs (arclength, lateral deviation) are then sorted by arclength so the line follows the path. {reversed ? 'Reference direction was auto-flipped so X=0 matches where the user started. ' : ''}Y = lateral deviation in mm (in-surface, signed). Vertical dotted lines and diamonds mark the planned milestones (M1…). Background tints: convex (red) vs concave (green) reference segments. Total path length ≈ {totalArc.toFixed(2)} m.
                                </p>
                                <Plot
                                    data={traces}
                                    layout={{
                                        ...layoutTheme,
                                        shapes: bgShapes,
                                        xaxis: { title: `Arclength along Reference Path (m) — total ${totalArc.toFixed(3)} m${reversed ? ' (auto-reversed)' : ''}` },
                                        yaxis: { title: 'Lateral deviation (mm)', zeroline: true, zerolinecolor: 'rgba(0,0,0,0.3)' },
                                        legend: { orientation: 'h', y: -0.2 },
                                    }}
                                    useResizeHandler={true} style={{ width: '100%', height: '380px' }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Velocity Over Time Plot */}
                <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Velocity Over Time</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Stretched horizontally from 0.0 (start) to 1.0 (end of recording).</p>
                    <Plot
                        data={filteredSeries.flatMap((s, i) => {
                            const points = allDrawPointsList[i] || [];
                            const refPoints = refPointMeasurementsList[i] || [];
                            const velocities = smoothData(points, calculateVelocities(points), 0.25);
                            const minT = points[0]?.timestamp || 0;
                            const maxT = points[points.length - 1]?.timestamp || 0;
                            const durationT = maxT - minT;

                            const lineTrace = {
                                x: points.map(p => durationT > 0 ? (p.timestamp - minT) / durationT : 0),
                                y: velocities,
                                type: 'scatter', mode: 'lines', name: s.name,
                                line: { color: getColor(s.method, s.condition), width: 1.5, shape: 'spline' }
                            };

                            const highlightIndices = refPoints.map(r => r.closest_draw_point_index).filter(idx => idx !== undefined && idx < points.length);
                            const markerTrace = {
                                x: highlightIndices.map(idx => durationT > 0 ? (points[idx].timestamp - minT) / durationT : 0),
                                y: highlightIndices.map(idx => velocities[idx]),
                                type: 'scatter', mode: 'markers', name: `${s.name} Milestones`,
                                marker: { size: 8, color: getColor(s.method, s.condition), symbol: 'diamond', line: { color: '#fff', width: 1.5 } },
                                showlegend: false
                            };

                            return [lineTrace, markerTrace];
                        })}
                        layout={{ ...layoutTheme, xaxis: { title: 'Normalized Recording Duration (0.0 - 1.0)' }, yaxis: { title: 'Velocity (mm/s)' }, legend: { orientation: 'h', y: -0.2 } }}
                        useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                    />
                </div>

                {/* Jitter Over Time Plot */}
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Path Jitter Over Time</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Stretched horizontally from 0.0 (start) to 1.0 (end of recording).</p>
                    <Plot
                        data={filteredSeries.flatMap((s, i) => {
                            const points = allDrawPointsList[i] || [];
                            const refPoints = refPointMeasurementsList[i] || [];
                            const jitter = smoothData(points, calculateJitter(points), 0.25);
                            const minT = points[0]?.timestamp || 0;
                            const maxT = points[points.length - 1]?.timestamp || 0;
                            const durationT = maxT - minT;

                            const lineTrace = {
                                x: points.map(p => durationT > 0 ? (p.timestamp - minT) / durationT : 0),
                                y: jitter,
                                type: 'scatter', mode: 'lines', name: s.name,
                                line: { color: getColor(s.method, s.condition), width: 1.5, shape: 'spline' }
                            };

                            const highlightIndices = refPoints.map(r => r.closest_draw_point_index).filter(idx => idx !== undefined && idx < points.length);
                            const markerTrace = {
                                x: highlightIndices.map(idx => durationT > 0 ? (points[idx].timestamp - minT) / durationT : 0),
                                y: highlightIndices.map(idx => jitter[idx]),
                                type: 'scatter', mode: 'markers', name: `${s.name} Milestones`,
                                marker: { size: 8, color: getColor(s.method, s.condition), symbol: 'diamond', line: { color: '#fff', width: 1.5 } },
                                showlegend: false
                            };

                            return [lineTrace, markerTrace];
                        })}
                        layout={{ ...layoutTheme, xaxis: { title: 'Normalized Recording Duration (0.0 - 1.0)' }, yaxis: { title: 'Jitter Offset Delta (mm)' }, legend: { orientation: 'h', y: -0.2 } }}
                        useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                    />
                </div>

                {/* 3D Dynamic Trace Projections Grouped by Condition (Visible/Obstructed) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
                    {Object.entries(
                        filteredSeries.reduce((acc, s) => {
                            if (!acc[s.condition]) acc[s.condition] = [];
                            acc[s.condition].push(s);
                            return acc;
                        }, {})
                    ).map(([conditionName, seriesGroup], cIdx) => {
                        // Reference path direction-flip (matches deviation profile / Maya).
                        const refPointsRaw = conditionName === 'Visible' ? visibleRefPoints : obstructRefPoints;
                        const refDistRaw = conditionName === 'Visible' ? visibleRefDistances : obstructRefDistances;
                        const firstWithData = seriesGroup.find((s) => {
                            const i = filteredSeries.indexOf(s);
                            return transformedSeries[i] && transformedSeries[i].some((p) => !p.is_line_break);
                        });
                        let dirRefPath = refPointsRaw;
                        if (firstWithData) {
                            const dirIdx = filteredSeries.indexOf(firstWithData);
                            const flip = detectAndFlipDirection(transformedSeries[dirIdx], refPointsRaw, refDistRaw);
                            dirRefPath = flip.refPath;
                        }
                        // Milestones: same JSON-derived M01..M15 set as the deviation profile and Maya.
                        const milestonesForCond3D = conditionName === 'Visible' ? visibleJsonMilestones : obstructJsonMilestones;

                        return (
                        <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '10px' }}>3D Spatial Trace: {conditionName}</h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>Aligned relative to surface. M01..M15 = experimental tracking spheres in JSON order (matches Maya export).</p>
                            <Plot
                                data={[
                                    ...seriesGroup.flatMap(s => {
                                        const origIdx = filteredSeries.indexOf(s);
                                        const transformedPoints = transformedSeries[origIdx] || [];
                                        const refPoints = refPointMeasurementsList[origIdx] || [];

                                        const lineTrace = {
                                            x: transformedPoints.map(p => p.x),
                                            y: transformedPoints.map(p => p.y),
                                            z: transformedPoints.map(p => p.z),
                                            type: 'scatter3d', mode: 'lines', name: s.name,
                                            line: { color: getColor(s.method, s.condition), width: 3 },
                                            legendgroup: s.name,
                                            showlegend: true
                                        };

                                        const highlightIndices = refPoints.map(r => r.closest_draw_point_index).filter(idx => idx !== undefined && idx < transformedPoints.length);
                                        const markerTrace = {
                                            x: highlightIndices.map(idx => transformedPoints[idx].x),
                                            y: highlightIndices.map(idx => transformedPoints[idx].y),
                                            z: highlightIndices.map(idx => transformedPoints[idx].z),
                                            type: 'scatter3d', mode: 'markers', name: s.name + ' Milestones',
                                            marker: { size: 6, color: getColor(s.method, s.condition), symbol: 'circle' },
                                            legendgroup: s.name,
                                            showlegend: false
                                        };

                                        return [lineTrace, markerTrace];
                                    }),
                                    ...(dirRefPath.length > 0 ? [
                                        {
                                            x: dirRefPath.map(p => p.x),
                                            y: dirRefPath.map(p => p.y),
                                            z: dirRefPath.map(p => p.z),
                                            type: 'scatter3d', mode: 'lines', name: `Reference Path (${conditionName})`,
                                            line: { color: 'cyan', width: 4 },
                                            legendgroup: `Ref${conditionName}`,
                                            showlegend: true
                                        },
                                        ...(milestonesForCond3D.length > 0 ? [{
                                            x: milestonesForCond3D.map(p => p.x),
                                            y: milestonesForCond3D.map(p => p.y),
                                            z: milestonesForCond3D.map(p => p.z),
                                            type: 'scatter3d', mode: 'markers+text', name: `Reference Milestones (${conditionName})`,
                                            marker: { size: 7, color: 'cyan', symbol: 'circle', line: { color: '#003a44', width: 1 } },
                                            text: milestonesForCond3D.map(p => p.label),
                                            textposition: 'top center',
                                            textfont: { size: 11, color: '#003a44' },
                                            hovertemplate: '%{text}<br>%{customdata}<br>x=%{x:.3f} y=%{y:.3f} z=%{z:.3f}<extra></extra>',
                                            customdata: milestonesForCond3D.map(p => p.name || ''),
                                            legendgroup: `Ref${conditionName}`,
                                            showlegend: false
                                        }] : []),
                                    ] : [])
                                ]}
                                layout={{
                                    ...layoutTheme,
                                    scene: {
                                        xaxis: { title: 'X (mm)', gridcolor: 'rgba(255,255,255,0.05)' },
                                        yaxis: { title: 'Y (mm)', gridcolor: 'rgba(255,255,255,0.05)' },
                                        zaxis: { title: 'Z (mm)', gridcolor: 'rgba(255,255,255,0.05)' }
                                    },
                                    margin: { l: 0, r: 0, b: 0, t: 0 },
                                    legend: { orientation: 'h', y: -0.1 }
                                }}
                                useResizeHandler={true} style={{ width: '100%', height: '400px' }}
                            />
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Task2Analytics;

