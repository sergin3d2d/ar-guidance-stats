import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import StatsCard from './StatsCard';
import { Clock, Activity, CheckCircle, Navigation } from 'lucide-react';
import { getColor } from '../utils/colors';

import visibleTxtRaw from '../../Visible.txt?raw';
import obstructTxtRaw from '../../Obstruct.txt?raw';

// Helper for reference txt parsing
const downsampleVoxel = (points, voxelSize = 0.001) => {
    const voxels = new Map();
    for (const p of points) {
        const vx = Math.floor(p.x / voxelSize);
        const vy = Math.floor(p.y / voxelSize);
        const vz = Math.floor(p.z / voxelSize);
        const key = `${vx},${vy},${vz}`;
        
        if (!voxels.has(key)) {
            voxels.set(key, { sumX: 0, sumY: 0, sumZ: 0, count: 0 });
        }
        const v = voxels.get(key);
        v.sumX += p.x;
        v.sumY += p.y;
        v.sumZ += p.z;
        v.count += 1;
    }
    
    const downsampled = [];
    for (const v of voxels.values()) {
        downsampled.push({
            x: v.sumX / v.count,
            y: v.sumY / v.count,
            z: v.sumZ / v.count,
        });
    }
    return downsampled;
};

const sortNearestNeighbor = (points, threshold = 0.015) => { // 1.5cm threshold
    if (points.length <= 1) return points;

    const findPath = (startPt) => {
        const sorted = [startPt];
        const remaining = points.filter(p => p !== startPt);
        const thresholdSq = threshold * threshold;

        while (remaining.length > 0) {
            let last = sorted[sorted.length - 1];
            // If the last point is a break, we calculate distance from the last valid point before the break
            if (last && last.x === null && sorted.length >= 2) {
                last = sorted[sorted.length - 2];
            }

            let nearestIdx = 0;
            let minDistSq = Infinity;
            for (let i = 0; i < remaining.length; i++) {
                const p = remaining[i];
                const dx = p.x - last.x;
                const dy = p.y - last.y;
                const dz = p.z - last.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    nearestIdx = i;
                }
            }

            if (minDistSq > thresholdSq) {
                // Break the line since the jump is too large
                sorted.push({ x: null, y: null, z: null });
            }
            sorted.push(remaining[nearestIdx]);
            remaining.splice(nearestIdx, 1);
        }
        return sorted;
    };

    // Pass 1 to find an endpoint
    const firstPass = findPath(points[0]);
    // Find the last valid point before returning as an endpoint
    let validEndIdx = firstPass.length - 1;
    while (validEndIdx >= 0 && firstPass[validEndIdx].x === null) validEndIdx--;
    const endPoint = firstPass[validEndIdx] || points[0];

    // Pass 2 to route a continuous path
    return findPath(endPoint);
};

const smoothPathPreserveCorners = (points, iterations = 10, windowSize = 3) => {
    let currentPts = [...points];
    const corners = new Array(points.length).fill(false);
    
    for (let i = 0; i < points.length; i++) {
        if (points[i].x === null) continue;
        const prevIdx = Math.max(0, i - 4);
        const nextIdx = Math.min(points.length - 1, i + 4);
        
        if (points[prevIdx].x === null || points[nextIdx].x === null || i === 0 || i === points.length - 1) {
            corners[i] = true;
            continue;
        }
        
        const p = points[i];
        const v1 = { x: p.x - points[prevIdx].x, y: p.y - points[prevIdx].y, z: p.z - points[prevIdx].z };
        const v2 = { x: points[nextIdx].x - p.x, y: points[nextIdx].y - p.y, z: points[nextIdx].z - p.z };
        const len1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
        const len2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z);
        
        if (len1 > 0.001 && len2 > 0.001) {
            const dot = (v1.x*v2.x + v1.y*v2.y + v1.z*v2.z) / (len1 * len2);
            if (dot < 0.70) corners[i] = true;
        }
    }

    for (let iter = 0; iter < iterations; iter++) {
        const nextPts = [];
        for (let i = 0; i < currentPts.length; i++) {
            const p = currentPts[i];
            if (p.x === null || corners[i]) {
                nextPts.push(p);
                continue;
            }
            
            let sumX = 0, sumY = 0, sumZ = 0, count = 0;
            for (let j = Math.max(0, i - windowSize); j <= Math.min(currentPts.length - 1, i + windowSize); j++) {
                if (currentPts[j].x !== null) {
                    sumX += currentPts[j].x; sumY += currentPts[j].y; sumZ += currentPts[j].z;
                    count++;
                }
            }
            nextPts.push(count > 0 ? { x: sumX/count, y: sumY/count, z: sumZ/count } : p);
        }
        currentPts = nextPts;
    }
    return currentPts;
};

const clusterMilestones = (points, threshold = 0.003) => {
    const clusters = [];
    for (const p of points) {
        let added = false;
        for (const c of clusters) {
            const dist = Math.sqrt(Math.pow(p.x - c.x, 2) + Math.pow(p.y - c.y, 2) + Math.pow(p.z - c.z, 2));
            if (dist < threshold) {
                c.pts.push(p);
                c.x = c.pts.reduce((s, pt) => s + pt.x, 0) / c.pts.length;
                c.y = c.pts.reduce((s, pt) => s + pt.y, 0) / c.pts.length;
                c.z = c.pts.reduce((s, pt) => s + pt.z, 0) / c.pts.length;
                added = true;
                break;
            }
        }
        if (!added) clusters.push({ x: p.x, y: p.y, z: p.z, pts: [p] });
    }
    return clusters.map(c => ({ x: c.x, y: c.y, z: c.z }));
};

const parseReferenceTxt = (txt) => {
    if (!txt) return { path: [], milestones: [] };
    const lines = txt.split('\n');
    const pathPoints = [];
    const milestonePoints = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('index')) continue;
        const parts = trimmed.split(',');
        if (parts.length >= 4) {
            const pt = { x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) };
            
            // Re-integrate milestones seamlessly into the main trace path for connecting endpoints
            pathPoints.push(pt);
            
            // Original reference milestone points are marked with 'SecondColor' (Red) or colorIndex '1'
            if (parts.length >= 6 && (parts[5].includes('Second') || parts[5].includes('Red') || parts[4] === '1')) {
                milestonePoints.push(pt);
            }
        }
    }
    const averagedPts = downsampleVoxel(pathPoints, 0.001); // 1mm voxel downsampling to remove jitter
    const sortedPts = sortNearestNeighbor(averagedPts);
    const smoothedPts = smoothPathPreserveCorners(sortedPts, 10, 3);
    const clusteredMilestones = clusterMilestones(milestonePoints, 0.003); // 3mm clustering
    
    return { path: smoothedPts, milestones: clusteredMilestones };
};

const visibleRefData = parseReferenceTxt(visibleTxtRaw);
const obstructRefData = parseReferenceTxt(obstructTxtRaw);
const visibleRefPoints = visibleRefData.path;
const visibleRefMilestones = visibleRefData.milestones;
const obstructRefPoints = obstructRefData.path;
const obstructRefMilestones = obstructRefData.milestones;

const calculateCumulativeDistances = (points) => {
    if (!points || points.length === 0) return [];
    const distances = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        if (p1.x !== null && p2.x !== null) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dz = p2.z - p1.z;
            total += Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
        distances.push(total);
    }
    return distances;
};

const calculateYMid = (points) => {
    const validY = points.map(p => p.y).filter(y => y !== null && y !== undefined);
    if (validY.length === 0) return 0;
    const minY = Math.min(...validY);
    const maxY = Math.max(...validY);
    return (minY + maxY) / 2;
};

const visibleRefDistances = calculateCumulativeDistances(visibleRefPoints);
const obstructRefDistances = calculateCumulativeDistances(obstructRefPoints);
const visibleYMid = calculateYMid(visibleRefPoints);
const obstructYMid = calculateYMid(obstructRefPoints);

// Helper for quaternion inverse and point rotation
const qConjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const qMultiply = (q1, q2) => ({
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
});
const rotatePoint = (p, q) => {
    const pq = { x: p.x, y: p.y, z: p.z, w: 0 };
    const qInv = qConjugate(q);
    const res = qMultiply(qMultiply(qInv, pq), q);
    return { x: res.x, y: res.y, z: res.z };
};

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

                {/* Path Deviation Histogram (Grouped by Condition) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>
                    {Object.entries(
                        filteredSeries.reduce((acc, s) => {
                            if (!acc[s.condition]) acc[s.condition] = [];
                            acc[s.condition].push(s);
                            return acc;
                        }, {})
                    ).map(([conditionName, seriesGroup], cIdx) => {
                        const yMid = conditionName === 'Visible' ? visibleYMid : obstructYMid;
                        const refPoints = conditionName === 'Visible' ? visibleRefPoints : obstructRefPoints;
                        const refDistances = conditionName === 'Visible' ? visibleRefDistances : obstructRefDistances;

                        // Calculate Convex/Concave background regions
                        const bgShapes = [];
                        let currentState = null; 
                        let startX = 0;

                        for (let j = 0; j < refPoints.length; j++) {
                            if (refPoints[j].x === null) continue;
                            const isConvex = refPoints[j].y > yMid;
                            const state = isConvex ? 'convex' : 'concave';
                            
                            if (currentState === null) {
                                currentState = state;
                                startX = refDistances[j];
                            } else if (currentState !== state) {
                                bgShapes.push({
                                    type: 'rect', xref: 'x', yref: 'paper',
                                    x0: startX, x1: refDistances[j], y0: 0, y1: 1,
                                    fillcolor: currentState === 'convex' ? 'rgba(255, 100, 100, 0.15)' : 'rgba(100, 255, 100, 0.15)',
                                    layer: 'below', line: { width: 0 }
                                });
                                currentState = state;
                                startX = refDistances[j];
                            }
                        }
                        if (currentState !== null && refPoints.length > 0) {
                            bgShapes.push({
                                type: 'rect', xref: 'x', yref: 'paper',
                                x0: startX, x1: refDistances[refDistances.length - 1], y0: 0, y1: 1,
                                fillcolor: currentState === 'convex' ? 'rgba(255, 100, 100, 0.15)' : 'rgba(100, 255, 100, 0.15)',
                                layer: 'below', line: { width: 0 }
                            });
                        }

                        return (
                            <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                                <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '10px' }}>Path Deviation Profile: {conditionName}</h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                                    Vertical vector deviations mapped per-point. Background regions indicate Convex (red) and Concave (green).
                                </p>
                                <Plot
                                    data={seriesGroup.map(s => {
                                        const origIdx = filteredSeries.indexOf(s);
                                        const points = allDrawPointsList[origIdx] || [];

                                        // Extract surface transform
                                        const sPosX = s.data.surfacePositionX || 0;
                                        const sPosY = s.data.surfacePositionY || 0;
                                        const sPosZ = s.data.surfacePositionZ || 0;
                                        const sRotQ = {
                                            x: s.data.surfaceRotationQuatX || 0,
                                            y: s.data.surfaceRotationQuatY || 0,
                                            z: s.data.surfaceRotationQuatZ || 0,
                                            w: s.data.surfaceRotationQuatW !== undefined ? s.data.surfaceRotationQuatW : 1
                                        };

                                        // Transform points
                                        const transformedPoints = points.map(p => {
                                            const pRel = { 
                                                x: (p.position_x || 0) - sPosX, 
                                                y: (p.position_y || 0) - sPosY, 
                                                z: (p.position_z || 0) - sPosZ 
                                            };
                                            return rotatePoint(pRel, sRotQ);
                                        });

                                        const xVals = [];
                                        const yVals = [];

                                        // Evaluate per point (slight downsample for performance if needed, 1/4th is safe)
                                        const downsampleFactor = Math.ceil(transformedPoints.length / 1000);
                                        const processPoints = downsampleFactor > 1 ? transformedPoints.filter((_, idx) => idx % downsampleFactor === 0) : transformedPoints;
                                        const originalIndices = downsampleFactor > 1 ? points.map((_, idx) => idx).filter((_, idx) => idx % downsampleFactor === 0) : points.map((_, idx) => idx);

                                        processPoints.forEach((p, procIdx) => {
                                            const origIdxP = originalIndices[procIdx];
                                            if (points[origIdxP].is_line_break) return;

                                            let minDistSq = Infinity;
                                            let closestIdx = 0;
                                            for (let j = 0; j < refPoints.length; j++) {
                                                if (refPoints[j].x === null) continue;
                                                const dx = p.x - refPoints[j].x;
                                                const dy = p.y - refPoints[j].y;
                                                const dz = p.z - refPoints[j].z;
                                                const dSq = dx*dx + dy*dy + dz*dz;
                                                if (dSq < minDistSq) {
                                                    minDistSq = dSq;
                                                    closestIdx = j;
                                                }
                                            }
                                            
                                            const closestRef = refPoints[closestIdx];
                                            const devY = (p.y - closestRef.y) * 1000; // Convert to mm
                                            
                                            // Exact distance for x-axis
                                            xVals.push(refDistances[closestIdx]);
                                            yVals.push(devY);
                                        });

                                        return {
                                            x: xVals,
                                            y: yVals,
                                            type: 'bar',
                                            name: s.name,
                                            marker: { color: getColor(s.method, s.condition) },
                                            // Add legend group to tie with 3D trace or other plots
                                            legendgroup: s.name,
                                        };
                                    })}
                                    layout={{ 
                                        ...layoutTheme, 
                                        barmode: 'group',
                                        shapes: bgShapes,
                                        xaxis: { title: 'Distance along Path Flow (m)' }, 
                                        yaxis: { title: 'Vertical Deviation (mm)', range: [-10, 10], zeroline: true, zerolinecolor: 'rgba(0,0,0,0.2)' }, 
                                        legend: { orientation: 'h', y: -0.2 } 
                                    }}
                                    useResizeHandler={true} style={{ width: '100%', height: '350px' }}
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
                    ).map(([conditionName, seriesGroup], cIdx) => (
                        <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '10px' }}>3D Spatial Trace: {conditionName}</h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>Aligned relative to surface.</p>
                            <Plot
                                data={[
                                    ...seriesGroup.flatMap(s => {
                                        const origIdx = filteredSeries.indexOf(s);
                                        const points = allDrawPointsList[origIdx] || [];
                                        const refPoints = refPointMeasurementsList[origIdx] || [];
                                        
                                        // Extract surface transform
                                        const sPosX = s.data.surfacePositionX || 0;
                                        const sPosY = s.data.surfacePositionY || 0;
                                        const sPosZ = s.data.surfacePositionZ || 0;
                                        const sRotQ = {
                                            x: s.data.surfaceRotationQuatX || 0,
                                            y: s.data.surfaceRotationQuatY || 0,
                                            z: s.data.surfaceRotationQuatZ || 0,
                                            w: s.data.surfaceRotationQuatW !== undefined ? s.data.surfaceRotationQuatW : 1
                                        };

                                        // Transform points to common local space
                                        const transformedPoints = points.map(p => {
                                            const pRel = { 
                                                x: (p.position_x || 0) - sPosX, 
                                                y: (p.position_y || 0) - sPosY, 
                                                z: (p.position_z || 0) - sPosZ 
                                            };
                                            return rotatePoint(pRel, sRotQ);
                                        });

                                        const lineTrace = {
                                            x: transformedPoints.map(p => p.x),
                                            y: transformedPoints.map(p => p.y),
                                            z: transformedPoints.map(p => p.z),
                                            type: 'scatter3d', mode: 'lines', name: s.name,
                                            line: { color: getColor(s.method, s.condition), width: 3 },
                                            legendgroup: s.name,
                                            showlegend: true
                                        };

                                        // User Milestones
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
                                    ...(conditionName === 'Visible' && visibleRefPoints.length > 0 ? [
                                        {
                                            x: visibleRefPoints.map(p => p.x),
                                            y: visibleRefPoints.map(p => p.y),
                                            z: visibleRefPoints.map(p => p.z),
                                            type: 'scatter3d', mode: 'lines', name: 'Reference Path (Visible)',
                                            line: { color: 'cyan', width: 4 },
                                            legendgroup: 'RefVis',
                                            showlegend: true
                                        },
                                        {
                                            x: visibleRefMilestones.map(p => p.x),
                                            y: visibleRefMilestones.map(p => p.y),
                                            z: visibleRefMilestones.map(p => p.z),
                                            type: 'scatter3d', mode: 'markers', name: 'Reference Milestones (Visible)',
                                            marker: { size: 6, color: 'cyan', symbol: 'circle' },
                                            legendgroup: 'RefVis',
                                            showlegend: false
                                        }
                                    ] : []),
                                    ...(conditionName === 'Obstructed' && obstructRefPoints.length > 0 ? [
                                        {
                                            x: obstructRefPoints.map(p => p.x),
                                            y: obstructRefPoints.map(p => p.y),
                                            z: obstructRefPoints.map(p => p.z),
                                            type: 'scatter3d', mode: 'lines', name: 'Reference Path (Obstructed)',
                                            line: { color: 'cyan', width: 4 },
                                            legendgroup: 'RefObs',
                                            showlegend: true
                                        },
                                        {
                                            x: obstructRefMilestones.map(p => p.x),
                                            y: obstructRefMilestones.map(p => p.y),
                                            z: obstructRefMilestones.map(p => p.z),
                                            type: 'scatter3d', mode: 'markers', name: 'Reference Milestones (Obstructed)',
                                            marker: { size: 6, color: 'cyan', symbol: 'circle' },
                                            legendgroup: 'RefObs',
                                            showlegend: false
                                        }
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
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Task2Analytics;

