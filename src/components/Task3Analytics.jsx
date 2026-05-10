import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import StatsCard from './StatsCard';
import { Clock, Activity, BarChart2, Target } from 'lucide-react';
import { getColor } from '../utils/colors';

const Task3Analytics = ({ participantData, participantId }) => {
    const [selectedMethods, setSelectedMethods] = useState(null);
    const [selectedConditions, setSelectedConditions] = useState(['Visible', 'Obstructed']);

    const taskData = participantData?.['Task3'] || {};
    const visibleData = taskData['Visible'] || {};
    const obstructedData = taskData['Obstructed'] || {};

    const visibleMethods = Object.keys(visibleData);
    const obstructedMethods = Object.keys(obstructedData);
    
    // Debug Logging
    if (participantId === '9' || participantId === '8') {
        console.log(`Task3 Stats for ${participantId}:`, {
            visibleMethods,
            obstructedMethods,
            obstructedData
        });
    }

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

    if (participantId === '9' || participantId === '8') {
        console.log(`Task3 Series for ${participantId}:`, series);
    }

    const currentMethods = selectedMethods === null ? allMethods : selectedMethods;

    const handleMethodToggle = (m) => setSelectedMethods(prev => {
        const current = prev === null ? allMethods : prev;
        return current.includes(m) ? current.filter(x => x !== m) : [...current, m];
    });
    const handleConditionToggle = (c) => setSelectedConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    if (series.length === 0) {
        return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>No Task 3 data extracted for this participant.</div>;
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
    const totalDurations = getMetric('totalMeasurementDuration');
    const entryDeviationsMean = getMetric('entryDeviationMean');
    const endDeviationsMean = getMetric('endDeviationMean');

    // Deep Arrays
    const allAxesList = filteredSeries.map(s => s.data.allAxesMeasurements || []);

    const layoutTheme = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#314150', family: 'Inter' },
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };

    const validDurations = totalDurations.filter(v => v > 0);
    const minDuration = validDurations.length > 0 ? Math.min(...validDurations) : 0;
    const bestDurationIndex = totalDurations.indexOf(minDuration);

    const validEndDev = endDeviationsMean.filter(v => v > 0);
    const minEndDev = validEndDev.length > 0 ? Math.min(...validEndDev) : 0;
    const bestEndDevIndex = endDeviationsMean.indexOf(minEndDev);

    const validEntryDev = entryDeviationsMean.filter(v => v > 0);
    const minEntryDev = validEntryDev.length > 0 ? Math.min(...validEntryDev) : 0;
    const bestEntryDevIndex = entryDeviationsMean.indexOf(minEntryDev);

    return (
        <div className="task-analytics-panel fadeIn">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                Task 3 (Reaching) Deep Analysis: <span style={{ color: '#00f2ff' }}>{participantId}</span>
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
                                    <span style={{ color: 'var(--text-dim)' }}>Mean Axis Duration</span>
                                    <span><strong>{s.data.axisDurationMean?.toFixed(1)}s</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Mean End Error</span>
                                    <span><strong>{s.data.endDeviationMean?.toFixed(1)}mm</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Mean Entry Error</span>
                                    <span><strong>{s.data.entryDeviationMean?.toFixed(1)}mm</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Total Duration</span>
                                    <span><strong>{s.data.totalMeasurementDuration?.toFixed(1)}s</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Total Attempts (Ent/End)</span>
                                    <span><strong>{s.data.totalEntryAttempts} / {s.data.totalEndAttempts}</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Avg Attempts/Axis (Ent/End)</span>
                                    <span><strong>{s.data.meanEntryAttemptsPerAxis?.toFixed(1)} / {s.data.meanEndAttemptsPerAxis?.toFixed(1)}</strong></span>
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
                        { title: 'Avg Time spent per Axis', key: 'axisDurationMean', yaxis: 'Seconds' },
                        { title: 'Avg Error at Entrance point', key: 'entryDeviationMean', yaxis: 'mm' },
                        { title: 'Avg Error at Goal point', key: 'endDeviationMean', yaxis: 'mm' },
                        { title: 'Avg Total Entry Attempts', key: 'totalEntryAttempts', yaxis: 'Attempts' },
                        { title: 'Avg Total End Attempts', key: 'totalEndAttempts', yaxis: 'Attempts' }
                    ].map((chart, cIdx) => (
                        <div key={cIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '0.95rem', color: 'var(--text)', marginBottom: '15px' }}>{chart.title}</h4>
                            <Plot
                                data={[{
                                    x: filteredSeries.slice().reverse().map(s => s.data[chart.key] || 0),
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

            {/* 3. Descriptive Statistics (Axis lists) */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                    Descriptive Statistics (Per Axis)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                    {[
                        { title: 'Specific Time spent per Axis', key: 'axis_total_time_seconds', yaxis: 'Seconds' },
                        { title: 'Attempts to reach Entrance point', key: 'entry_attempts', yaxis: 'Attempts' },
                        { title: 'Attempts to reach Goal point', key: 'end_attempts', yaxis: 'Attempts' },
                        { title: 'Precision at Start (Entry Deviation)', key: 'entry_deviation_mm', yaxis: 'mm' },
                        { title: 'Precision at End (End Deviation)', key: 'end_deviation_mm', yaxis: 'mm' }
                    ].map((chart, dIdx) => (
                        <div key={dIdx} className="glass-card" style={{ padding: '20px' }}>
                            <h4 style={{ fontSize: '0.95rem', color: 'var(--text)', marginBottom: '15px' }}>{chart.title}</h4>
                            <Plot
                                data={filteredSeries.map((s, i) => {
                                    const axes = allAxesList[i] || [];
                                    return {
                                        x: axes.map((_, idx) => `Axis ${idx + 1}`),
                                        y: axes.map(a => a[chart.key] || 0),
                                        name: s.name, type: 'bar',
                                        marker: { color: getColor(s.method, s.condition) }
                                    };
                                })}
                                layout={{ ...layoutTheme, barmode: 'group', xaxis: { title: 'Sequential Reaching Axes' }, yaxis: { title: chart.yaxis }, legend: { orientation: 'h', y: -0.2 } }}
                                useResizeHandler={true} style={{ width: '100%', height: '350px' }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Preserved Existing Section */}
            <div style={{ marginBottom: '30px', borderTop: '2px dashed var(--glass-border)', paddingTop: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '15px' }}>Existing Overview Context</h3>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '30px' }}>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Mean Entry vs End Accuracy</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>
                        Contrasts the error mapping when initially triggering a reaching axis versus committing to the final goal.
                    </p>
                    <Plot
                        data={[
                            {
                                x: filteredSeries.map(s => s.name),
                                y: entryDeviationsMean,
                                name: 'Initial Entry Deviation (mm)',
                                type: 'bar',
                                marker: { color: '#00f2ff' }
                            },
                            {
                                x: filteredSeries.map(s => s.name),
                                y: endDeviationsMean,
                                name: 'Final Goal Deviation (mm)',
                                type: 'bar',
                                marker: { color: '#ff007a' }
                            }
                        ]}
                        layout={{
                            ...layoutTheme,
                            barmode: 'group',
                            xaxis: { title: 'Guidance Method' },
                            yaxis: { title: 'Mean Deviation Distance (mm)' },
                            legend: { orientation: 'h', y: -0.2 }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '350px' }}
                    />
                </div>

                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Axis Duration Spread (Boxplot)</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>
                        Plots the distribution of the time taken to traverse every individual axis line across the task.
                    </p>
                    <Plot
                        data={filteredSeries.map((s, i) => ({
                            y: allAxesList[i].map(axis => axis.axis_total_time_seconds || 0),
                            type: 'box',
                            name: s.name,
                            boxpoints: 'all',
                            jitter: 0.3,
                            pointpos: -1.8,
                            marker: { color: getColor(s.method, s.condition) }
                        }))}
                        layout={{
                            ...layoutTheme,
                            yaxis: { title: 'Axis Traversal Time (s)' },
                            showlegend: false
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '350px' }}
                    />
                </div>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '30px' }}>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Axis-by-Axis Attempt Stability</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>
                        Tracks the raw number of Entry and End attempts required per individual 3D axis, exposing difficult spatial angles.
                    </p>
                    <Plot
                        data={filteredSeries.flatMap((s, i) => {
                            const axes = allAxesList[i];
                            return [
                                {
                                    x: axes.map((_, idx) => `Axis ${idx + 1}`),
                                    y: axes.map(a => a.entry_attempts || 0),
                                    name: `${s.name} Entry Attempts`,
                                    type: 'bar',
                                    marker: { color: getColor(s.method, s.condition), opacity: s.condition === 'Obstructed' ? 0.4 : 0.6 }
                                },
                                {
                                    x: axes.map((_, idx) => `Axis ${idx + 1}`),
                                    y: axes.map(a => a.end_attempts || 0),
                                    name: `${s.name} End Attempts`,
                                    type: 'bar',
                                    marker: { color: getColor(s.method, s.condition), opacity: s.condition === 'Obstructed' ? 0.7 : 1.0 }
                                }
                            ];
                        })}
                        layout={{
                            ...layoutTheme,
                            barmode: 'group',
                            xaxis: { title: 'Sequential Reaching Axes' },
                            yaxis: { title: 'Number of Attempts' },
                            showlegend: true,
                            legend: { orientation: 'h', y: -0.2 }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '350px' }}
                    />
                </div>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '15px' }}>Axis-by-Axis Error Instability</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '10px' }}>
                        Tracks physical deviation mapping (mm) for the Entry point and End point per individual 3D axis.
                    </p>
                    <Plot
                        data={filteredSeries.flatMap((s, i) => {
                            const axes = allAxesList[i];
                            return [
                                {
                                    x: axes.map((_, idx) => `Axis ${idx + 1}`),
                                    y: axes.map(a => a.end_deviation_mm || 0),
                                    mode: 'lines+markers',
                                    name: `${s.name} (End Dev)`,
                                    type: 'scatter',
                                    marker: { color: getColor(s.method, s.condition) },
                                    line: { shape: 'spline', dash: s.condition === 'Obstructed' ? 'dash' : 'solid' }
                                },
                                {
                                    x: axes.map((_, idx) => `Axis ${idx + 1}`),
                                    y: axes.map(a => a.entry_deviation_mm || 0),
                                    mode: 'lines+markers',
                                    name: `${s.name} (Entry Dev)`,
                                    type: 'scatter',
                                    marker: { color: getColor(s.method, s.condition) },
                                    line: { shape: 'spline', dash: s.condition === 'Obstructed' ? 'dashdot' : 'dot' }
                                }
                            ];
                        })}
                        layout={{
                            ...layoutTheme,
                            xaxis: { title: 'Sequential Reaching Axes' },
                            yaxis: { title: 'Deviation (mm)' },
                            showlegend: true,
                            legend: { orientation: 'h', y: -0.2 }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '350px' }}
                    />
                </div>
            </div>
        </div>
    );
};

export default Task3Analytics;
