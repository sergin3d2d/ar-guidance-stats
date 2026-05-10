import React, { useMemo } from 'react';
import stats from 'stats-lite';
import { flattenAllVariables } from '../utils/dataProcessor';
import { FileJson } from 'lucide-react';

const TaskVariableTable = ({ rawFiles, activeTask, activeParticipant }) => {
    const tableData = useMemo(() => {
        if (!rawFiles || rawFiles.length === 0 || !activeParticipant) return [];

        // Flatten all data
        const flatted = flattenAllVariables(rawFiles);

        // Filter by task and active participant (both conditions)
        const filtered = flatted.filter(r => r.task === activeTask && r.participantId === activeParticipant);
        if (filtered.length === 0) return [];

        // Find all numeric keys in the filtered set
        const allNumericKeys = new Set();
        filtered.forEach(row => {
            Object.keys(row).forEach(k => {
                if (typeof row[k] === 'number') allNumericKeys.add(k);
            });
        });

        const keys = Array.from(allNumericKeys);
        const methods = [...new Set(filtered.map(r => r.method))];
        const conditions = [...new Set(filtered.map(r => r.condition))];

        const results = [];

        keys.forEach(key => {
            methods.forEach(method => {
                conditions.forEach(condition => {
                    const vals = filtered.filter(r => r.method === method && r.condition === condition).map(r => r[key]).filter(v => v !== undefined && v !== null && !isNaN(v));
                    if (vals.length > 0) {
                        results.push({
                            variable: key,
                            method,
                            condition,
                            n: vals.length,
                            mean: stats.mean(vals),
                            stdev: stats.stdev(vals),
                            min: Math.min(...vals),
                            max: Math.max(...vals)
                        });
                    }
                });
            });
        });

        return results.sort((a, b) => a.variable.localeCompare(b.variable) || a.method.localeCompare(b.method) || a.condition.localeCompare(b.condition));
    }, [rawFiles, activeTask, activeParticipant]);

    if (tableData.length === 0) return null;

    return (
        <div className="glass-card" style={{ marginTop: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <FileJson size={20} color="#00f2ff" />
                <h3 style={{ margin: 0 }}>Comprehensive Variable Summary ({activeTask})</h3>
            </div>
            <p className="stat-label">Descriptive statistics for ALL collected numeric variables specific to this task.</p>

            <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                        <tr style={{ color: 'var(--text)', borderBottom: '1px solid var(--primary)' }}>
                            <th style={{ padding: '12px' }}>Variable Name</th>
                            <th>Method</th>
                            <th>Condition</th>
                            <th>N</th>
                            <th>Mean</th>
                            <th>Std Dev</th>
                            <th>Min</th>
                            <th>Max</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((stat, idx) => (
                            <tr key={`${stat.variable}-${stat.method}-${stat.condition}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                                <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{stat.variable}</td>
                                <td style={{ fontWeight: 600, color: '#00f2ff' }}>{stat.method}</td>
                                <td style={{ color: stat.condition === 'Obstructed' ? '#ff007a' : '#00f2ff' }}>{stat.condition}</td>
                                <td>{stat.n}</td>
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
    );
};

export default TaskVariableTable;
