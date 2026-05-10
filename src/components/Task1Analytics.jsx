import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import StatsCard from './StatsCard';
import { Clock, Target, Navigation, Activity } from 'lucide-react';
import { getColor } from '../utils/colors';

const Task1Analytics = ({ participantData, participantId }) => {
    const [selectedMethods, setSelectedMethods] = useState(null);
    const [selectedConditions, setSelectedConditions] = useState(['Visible', 'Obstructed']);

    const taskData = participantData?.['Task1'] || {};
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
        return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>No Task 1 data extracted for this participant.</div>;
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

    const placementTimesAvg = getMetric('placementTimeAvg');
    const posErrorsAvg = getMetric('posErrorAvg');
    const rotErrorsAvg = getMetric('rotErrorAvg');
    const attemptsAvg = getMetric('attemptsAvg');
    const totalElapsedTimes = getMetric('totalElapsedTime');

    const allMeasurementsList = filteredSeries.map(s => s.data.allMeasurements || []);

    const normalizeScore = (arr, isLowerBetter = true) => {
        const max = Math.max(...arr, 1);
        return arr.map(v => isLowerBetter ? Math.max(0, 100 - (v / max * 100)) : (v / max * 100));
    };

    const radarData = filteredSeries.map((s, i) => ({
        type: 'scatterpolar',
        r: [
            normalizeScore(placementTimesAvg)[i],
            normalizeScore(posErrorsAvg)[i],
            normalizeScore(rotErrorsAvg)[i],
            normalizeScore(attemptsAvg)[i],
            normalizeScore(placementTimesAvg)[i]
        ],
        theta: ['Speed', 'Pos Accuracy', 'Rot Precision', 'Efficiency', 'Speed'],
        fill: 'toself',
        name: s.name,
        line: { 
            color: getColor(s.method, s.condition),
            dash: s.condition === 'Obstructed' ? 'dash' : 'solid'
        }
    }));

    const layoutTheme = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#314150', family: 'Outfit' },
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };

    const validTotalTimes = totalElapsedTimes.filter(v => v > 0);
    const minTotalTime = validTotalTimes.length > 0 ? Math.min(...validTotalTimes) : 0;
    const bestIndex = totalElapsedTimes.indexOf(minTotalTime);

    return (
        <div className="task-analytics-panel fadeIn">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                Task 1 (Placing) Deep Analysis: <span style={{ color: 'var(--primary)' }}>{participantId}</span>
            </h2>

            {renderFilters()}

            {/* 1. Summary Grid */}
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
                                    <span style={{ color: 'var(--text-dim)' }}>Attempts</span>
                                    <span>Avg: <strong>{s.data.attemptsAvg?.toFixed(1)}</strong> | Max: {s.data.attemptsMax} | Min: {s.data.attemptsMin} | Total: {s.data.attemptsTotal}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Placement Time</span>
                                    <span>Avg: <strong>{s.data.placementTimeAvg?.toFixed(1)}s</strong> | Max: {s.data.placementTimeMax?.toFixed(1)}s | Min: {s.data.placementTimeMin?.toFixed(1)}s | Total: {s.data.placementTimeTotal?.toFixed(1)}s</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Position Error</span>
                                    <span>Avg: <strong>{s.data.posErrorAvg?.toFixed(1)}mm</strong> | Max: {s.data.posErrorMax?.toFixed(1)}mm | Min: {s.data.posErrorMin?.toFixed(1)}mm | Std: {s.data.posErrorStd?.toFixed(1)}mm</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Rotation Error</span>
                                    <span>Avg: <strong>{s.data.rotErrorAvg?.toFixed(1)}°</strong> | Max: {s.data.rotErrorMax?.toFixed(1)}° | Min: {s.data.rotErrorMin?.toFixed(1)}° | Std: {s.data.rotErrorStd?.toFixed(1)}°</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Total Elapsed Time</span>
                                    <span><strong>{s.data.totalElapsedTime?.toFixed(1)}s</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Progress</span>
                                    <span><strong>{s.data.measurementsCompleted} / {s.data.guidesInGroup}</strong></span>
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
                        { title: 'Avg Attempts', key: 'attemptsAvg', yaxis: 'Attempts' },
                        { title: 'Avg Placement Time', key: 'placementTimeAvg', yaxis: 'Seconds' },
                        { title: 'Avg Position Error', key: 'posErrorAvg', yaxis: 'mm' },
                        { title: 'Avg Rotation Error', key: 'rotErrorAvg', yaxis: 'Degrees' },
                        { title: 'Total Elapsed Time', key: 'totalElapsedTime', yaxis: 'Seconds' }
                    ].map((chart, cIdx) => (
                        <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '0.95rem', color: 'var(--text)', marginBottom: '15px' }}>{chart.title}</h4>
                            <Plot
                                data={[{
                                    x: filteredSeries.slice().reverse().map(s => s.data[chart.key] || 0),
                                    y: filteredSeries.slice().reverse().map(s => s.name),
                                    type: 'bar',
                                    orientation: 'h',
                                    marker: { color: filteredSeries.slice().reverse().map(s => getColor(s.method, s.condition)) }
                                }]}
                                layout={{
                                    ...layoutTheme,
                                    xaxis: { title: chart.yaxis },
                                    yaxis: { automargin: true, tickfont: { size: 11 } },
                                    showlegend: false
                                }}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '250px' }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Descriptive Statistics (Grouped Barcharts) */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                    Descriptive Statistics (Per Target)
                </h3>

                {[
                    { title: 'Attempts per Target', key: 'attempts', yaxis: 'Attempts count' },
                    { title: 'Placement Time per Target (seconds)', key: 'placement_time_seconds', yaxis: 'Time (s)' },
                    { title: 'Position Error per Target', key: 'position_error_mm', yaxis: 'Error Magnitude (mm)' },
                    { title: 'Rotation Error per Target', key: 'rotation_error_degrees', yaxis: 'Angular Error (degrees)' }
                ].map((chart, cIdx) => (
                    <div key={cIdx} className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>{chart.title}</h4>
                        <Plot
                            data={filteredSeries.map((s, i) => ({
                                x: allMeasurementsList[i].map((_, idx) => `Target ${idx + 1}`),
                                y: allMeasurementsList[i].map(m => m[chart.key] || 0),
                                type: 'bar',
                                name: s.name,
                                marker: { color: getColor(s.method, s.condition) }
                            }))}
                            layout={{
                                ...layoutTheme,
                                barmode: 'group',
                                xaxis: { title: 'Target ID' },
                                yaxis: { title: chart.yaxis },
                                legend: { orientation: 'h', y: -0.2 }
                            }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '350px' }}
                        />
                    </div>
                ))}
            </div>



            {/* 3. Existing Visuals (Appended at bottom) */}
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '30px' }}>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Placement Time Spread (Boxplot)</h3>
                    <Plot
                        data={filteredSeries.map((s, i) => ({
                            y: allMeasurementsList[i].map(measurement => measurement.placement_time_seconds || 0),
                            type: 'box',
                            name: s.name,
                            boxpoints: 'all', jitter: 0.3, pointpos: -1.8,
                            marker: { color: getColor(s.method, s.condition) }
                        }))}
                        layout={{ ...layoutTheme, yaxis: { title: 'Placement Time (s)' }, showlegend: false }}
                        useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                    />
                </div>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Target-by-Target Progression</h3>
                    <Plot
                        data={filteredSeries.flatMap((s, i) => [{
                            x: allMeasurementsList[i].map((_, idx) => `Target ${idx + 1}`),
                            y: allMeasurementsList[i].map(m => m.position_error_mm || 0),
                            type: 'scatter', mode: 'lines+markers', name: s.name,
                            line: { color: getColor(s.method, s.condition), shape: 'spline', dash: s.condition === 'Obstructed' ? 'dash' : 'solid' }
                        }])}
                        layout={{ ...layoutTheme, xaxis: { title: 'Sequence' }, yaxis: { title: 'Pos Error (mm)' }, legend: { orientation: 'h', y: -0.2 } }}
                        useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                    />
                </div>
            </div>

        </div>
    );
};

export default Task1Analytics;

