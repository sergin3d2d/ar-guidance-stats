import React, { useMemo } from 'react';
import stats from 'stats-lite';
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { Radar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
    ArcElement
);

const GlobalOverview = ({ rawFiles, data }) => {

    const globalStats = useMemo(() => {
        if (!rawFiles || rawFiles.length === 0) return [];

        // Get all numeric keys
        const firstRow = rawFiles[0];
        const numericKeys = Object.keys(firstRow).filter(k => typeof firstRow[k] === 'number');

        return numericKeys.map(key => {
            const allVals = rawFiles.map(r => r[key]).filter(v => v !== undefined && v !== null);
            if (allVals.length === 0) return { key, count: 0, mean: 0, min: 0, max: 0, stdev: 0 };

            return {
                key,
                count: allVals.length,
                mean: stats.mean(allVals),
                min: Math.min(...allVals),
                max: Math.max(...allVals),
                stdev: stats.stdev(allVals)
            };
        }).sort((a, b) => b.mean - a.mean);
    }, [rawFiles]);

    const radarData = useMemo(() => {
        if (!data) return null;
        const methods = data.methods;
        // Map placing data generically
        const metricsNameMap = {
            placementTime: 'Avg Time (s)',
            posError: 'Pos Error (mm)',
            rotError: 'Rot Error (deg)',
            attempts: 'Attempts'
        };

        const datasets = methods.map((method, i) => {
            const colors = ['#00f2ff', '#7000ff', '#ff007a'];
            const bgColors = ['rgba(0, 242, 255, 0.2)', 'rgba(112, 0, 255, 0.2)', 'rgba(255, 0, 122, 0.2)'];

            // Calculate mean across all tasks/conditions for the method
            const metricValues = Object.keys(metricsNameMap).map(metricKey => {
                let sum = 0; let count = 0;
                ['Task1', 'Task2', 'Task3'].forEach(t => {
                    ['Visible', 'Obstructed'].forEach(c => {
                        const records = data.aggregated.byMethod[method]?.[t]?.[c] || [];
                        records.forEach(r => {
                            const val = r.metrics[metricKey];
                            if (val !== undefined && val !== 0) {
                                sum += val; count++;
                            }
                        });
                    });
                });
                return count > 0 ? sum / count : 0;
            });

            return {
                label: method,
                data: metricValues,
                backgroundColor: bgColors[i],
                borderColor: colors[i],
                borderWidth: 2,
            };
        });

        return {
            labels: Object.values(metricsNameMap),
            datasets
        };
    }, [data]);

    const radarOptions = {
        scales: {
            r: {
                angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                pointLabels: { color: 'var(--text-dim)', font: { family: 'Outfit', size: 14 } },
                ticks: { display: false }
            }
        },
        plugins: {
            legend: { labels: { color: 'var(--text)', font: { family: 'Outfit' } } }
        }
    };

    const doughnutData = useMemo(() => {
        if (!data) return null;
        // Total files per method
        const methodsCount = data.methods.map(m => {
            let count = 0;
            ['Task1', 'Task2', 'Task3'].forEach(t => {
                ['Visible', 'Obstructed'].forEach(c => {
                    count += (data.aggregated.byMethod[m]?.[t]?.[c] || []).length;
                });
            });
            return count;
        });

        return {
            labels: data.methods,
            datasets: [
                {
                    data: methodsCount,
                    backgroundColor: ['rgba(0, 242, 255, 0.8)', 'rgba(112, 0, 255, 0.8)', 'rgba(255, 0, 122, 0.8)'],
                    borderColor: ['#00f2ff', '#7000ff', '#ff007a'],
                    borderWidth: 1,
                },
            ],
        };
    }, [data]);


    return (
        <div>
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(400px, 1fr) minmax(300px, 1fr)' }}>
                <div className="glass-card">
                    <h3 style={{ color: '#00f2ff', marginTop: 0 }}>Method Performance Multiplex</h3>
                    <p className="stat-label">Radar Comparison of Core KPIs (Global Average)</p>
                    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
                        {radarData && <Radar data={radarData} options={radarOptions} />}
                    </div>
                </div>

                <div className="glass-card">
                    <h3 style={{ color: '#00f2ff', marginTop: 0 }}>Dataset Distribution</h3>
                    <p className="stat-label">Total samples collected by hardware method</p>
                    <div style={{ padding: '20px', maxWidth: '300px', margin: '0 auto' }}>
                        {doughnutData && <Doughnut data={doughnutData} options={{
                            plugins: { legend: { position: 'bottom', labels: { color: 'var(--text)', font: { family: 'Outfit' } } } }
                        }} />}
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginTop: '24px' }}>
                <h3 style={{ color: '#00f2ff', marginTop: 0 }}>Comprehensive Variable Summary</h3>
                <p className="stat-label">Descriptive statistics globally aggregating all experimental instances.</p>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ color: 'var(--text)', borderBottom: '1px solid var(--primary)' }}>
                                <th style={{ padding: '12px' }}>Variable Name</th>
                                <th>N</th>
                                <th>Mean</th>
                                <th>Std Dev</th>
                                <th>Min</th>
                                <th>Max</th>
                            </tr>
                        </thead>
                        <tbody>
                            {globalStats.map((stat, idx) => (
                                <tr key={stat.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                    <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{stat.key}</td>
                                    <td>{stat.count}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{stat.mean.toFixed(3)}</td>
                                    <td>{stat.stdev.toFixed(3)}</td>
                                    <td>{stat.min.toFixed(3)}</td>
                                    <td>{stat.max.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default GlobalOverview;
