import React, { useState } from 'react';
import { X, Download, Settings as SettingsIcon } from 'lucide-react';
import { DEFAULT_EXPORT_SETTINGS, buildExportArchive, downloadBlob } from '../utils/exportPlanner';

const Toggle = ({ label, value, onChange, hint }) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '6px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: '3px' }} />
        <span style={{ fontSize: '0.92rem', color: 'var(--text)', flex: 1 }}>
            {label}
            {hint && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>{hint}</span>}
        </span>
    </label>
);

const NumField = ({ label, value, onChange, step = 0.1, hint }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
        <span style={{ fontSize: '0.92rem', color: 'var(--text)', minWidth: '180px' }}>
            {label}
            {hint && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-dim)' }}>{hint}</span>}
        </span>
        <input
            type="number"
            value={value}
            step={step}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            style={{ width: '90px', padding: '6px 8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text)' }}
        />
    </label>
);

const TextField = ({ label, value, onChange, hint, width = '160px' }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
        <span style={{ fontSize: '0.92rem', color: 'var(--text)', minWidth: '180px' }}>
            {label}
            {hint && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-dim)' }}>{hint}</span>}
        </span>
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width, padding: '6px 8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text)' }}
        />
    </label>
);

const Section = ({ title, children }) => (
    <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--glass-border)' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text)' }}>{title}</h3>
        <div style={{ paddingLeft: '4px' }}>{children}</div>
    </div>
);

const ExportSettingsModal = ({ rawFiles, csvFiles, onClose }) => {
    const [settings, setSettings] = useState(DEFAULT_EXPORT_SETTINGS);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [lastSummary, setLastSummary] = useState(null);

    const update = (path) => (val) => {
        setSettings((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const keys = path.split('.');
            let cursor = next;
            for (let i = 0; i < keys.length - 1; i++) cursor = cursor[keys[i]];
            cursor[keys[keys.length - 1]] = val;
            return next;
        });
    };

    const handleExport = async () => {
        setBusy(true);
        setError(null);
        try {
            const { blob, tables } = await buildExportArchive(rawFiles, csvFiles, settings);
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            downloadBlob(blob, `ar_guidance_export_${ts}.zip`);
            const summary = Object.entries(tables).map(([name, t]) => `${name}.csv (${t.rows.length} rows)`);
            setLastSummary(summary);
        } catch (err) {
            console.error(err);
            setError(err.message || String(err));
        } finally {
            setBusy(false);
        }
    };

    const t1 = settings.task1;
    const t2 = settings.task2;
    const t3 = settings.task3;
    const q = settings.questionnaires;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: '40px 20px',
            }}
            onClick={onClose}
        >
            <div
                className="glass-card"
                style={{ maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '0' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <SettingsIcon size={20} color="var(--primary)" />
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>Export settings</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                        <X size={22} />
                    </button>
                </div>

                <div style={{ padding: '20px 24px' }}>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', marginTop: 0, marginBottom: '20px' }}>
                        Produces a zip of long-format CSVs (one row per trial / landmark / axis / item) plus a README. Suitable for direct ingestion into R.
                    </p>

                    <Section title="Steady-position correction">
                        <Toggle
                            label="Subtract steady-position hold from Task 1 placement_time and Task 3 axis_total_time"
                            value={settings.steady.enabled}
                            onChange={update('steady.enabled')}
                        />
                        {settings.steady.enabled && (
                            <NumField
                                label="Seconds subtracted"
                                value={settings.steady.seconds}
                                onChange={update('steady.seconds')}
                                step={0.1}
                            />
                        )}
                    </Section>

                    <Section title="Task 1 — Placing">
                        <Toggle label="Include Task 1 file" value={t1.include} onChange={update('task1.include')} />
                        {t1.include && (
                            <div style={{ paddingLeft: '24px' }}>
                                <Toggle label="position_error_mm" value={t1.positionError} onChange={update('task1.positionError')} />
                                <Toggle label="rotation_error_degrees" value={t1.rotationError} onChange={update('task1.rotationError')} />
                                <Toggle label="placement_time_seconds (corrected)" value={t1.placementTime} onChange={update('task1.placementTime')} />
                                <Toggle label="attempts" value={t1.attempts} onChange={update('task1.attempts')} />
                                <Toggle label="guide_index as 1-based" value={t1.guideIndex1Based} onChange={update('task1.guideIndex1Based')} />
                                <Toggle label="position_error vector components (x/y/z)" value={t1.positionErrorVector} onChange={update('task1.positionErrorVector')} />
                                <Toggle label="tooltip & guide world coordinates" value={t1.worldCoords} onChange={update('task1.worldCoords')} />
                                <Toggle label="measurement_time_seconds (cumulative)" value={t1.measurementTime} onChange={update('task1.measurementTime')} />
                                <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '10px', paddingTop: '10px' }}>
                                    <Toggle
                                        label="Apply Insertion / Surface subtype split"
                                        value={t1.applySubtypeSplit}
                                        onChange={update('task1.applySubtypeSplit')}
                                    />
                                    {t1.applySubtypeSplit && (
                                        <div style={{ paddingLeft: '24px' }}>
                                            <TextField
                                                label="Insertion guides — Visible"
                                                hint="comma-separated 1-based indices"
                                                value={t1.insertionGuidesVisible}
                                                onChange={update('task1.insertionGuidesVisible')}
                                            />
                                            <TextField
                                                label="Insertion guides — Obstruct"
                                                hint="comma-separated 1-based indices"
                                                value={t1.insertionGuidesObstruct}
                                                onChange={update('task1.insertionGuidesObstruct')}
                                            />
                                            <Toggle
                                                label="Set position_error_mm = NA for Insertion rows"
                                                value={t1.nullPositionForInsertion}
                                                onChange={update('task1.nullPositionForInsertion')}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Section>

                    <Section title="Task 2 — Tracing">
                        <Toggle label="Trial-level metrics (drawing_duration, milestones_found)" value={t2.trials} onChange={update('task2.trials')} />
                        <Toggle label="Per-landmark distances" value={t2.landmarks} onChange={update('task2.landmarks')} />
                        <Toggle label="Deviation summary (one row per trial — RMS / max / std / banded fractions)" value={t2.deviationSummary} onChange={update('task2.deviationSummary')} />
                        <Toggle
                            label="Deviation profile (binned along reference arclength)"
                            value={t2.deviationProfile}
                            onChange={update('task2.deviationProfile')}
                        />
                        {t2.deviationProfile && (
                            <div style={{ paddingLeft: '24px' }}>
                                <NumField label="Bins" value={t2.deviationProfileBins} onChange={(v) => update('task2.deviationProfileBins')(Math.max(2, v | 0))} step={1} />
                            </div>
                        )}
                        <Toggle
                            label="Registered draw points (surface-local mm — opt-in, large)"
                            hint="One row per draw point. Same registration as the 3D Spatial Trace."
                            value={t2.registeredDrawPoints}
                            onChange={update('task2.registeredDrawPoints')}
                        />
                        <Toggle
                            label="Reference paths (Visible & Obstruct, written once)"
                            hint="Auto-included if profile or registered draw points are on."
                            value={t2.referencePaths || t2.deviationProfile || t2.registeredDrawPoints}
                            onChange={update('task2.referencePaths')}
                        />
                        <Toggle label="total_path_length_mm" value={t2.pathLength} onChange={update('task2.pathLength')} />
                        <Toggle label="Segment statistics (mean/median/min/max)" value={t2.segmentStats} onChange={update('task2.segmentStats')} />
                    </Section>

                    <Section title="Task 3 — Reaching">
                        <Toggle label="Include Task 3 file" value={t3.include} onChange={update('task3.include')} />
                        {t3.include && (
                            <div style={{ paddingLeft: '24px' }}>
                                <Toggle label="entry_deviation_mm" value={t3.entryDeviation} onChange={update('task3.entryDeviation')} />
                                <Toggle label="end_deviation_mm" value={t3.endDeviation} onChange={update('task3.endDeviation')} />
                                <Toggle label="entry_attempts" value={t3.entryAttempts} onChange={update('task3.entryAttempts')} />
                                <Toggle label="end_attempts" value={t3.endAttempts} onChange={update('task3.endAttempts')} />
                                <Toggle label="axis_total_time_seconds (corrected)" value={t3.axisTotalTime} onChange={update('task3.axisTotalTime')} />
                                <Toggle label="axis_index as 1-based" value={t3.axisIndex1Based} onChange={update('task3.axisIndex1Based')} />
                                <Toggle label="measured & original entry/end positions" value={t3.positions} onChange={update('task3.positions')} />
                            </div>
                        )}
                    </Section>

                    <Section title="Questionnaires">
                        <Toggle label="Include questionnaires file" value={q.include} onChange={update('questionnaires.include')} />
                        {q.include && (
                            <div style={{ paddingLeft: '24px' }}>
                                <Toggle
                                    label="Drop AR-only PCUE-Q items for On-Screen rows"
                                    value={q.dropArOnlyForOnScreen}
                                    onChange={update('questionnaires.dropArOnlyForOnScreen')}
                                />
                                {q.dropArOnlyForOnScreen && (
                                    <TextField
                                        label="AR-only item keys"
                                        hint="default: B5,C4 (only valid for AR-VST and AR-OST)"
                                        value={q.arOnlyKeys}
                                        onChange={update('questionnaires.arOnlyKeys')}
                                        width="120px"
                                    />
                                )}
                                <Toggle
                                    label="Compute NASA-TLX overall_mean (per pid × condition)"
                                    value={q.computeNasaTlxOverall}
                                    onChange={update('questionnaires.computeNasaTlxOverall')}
                                />
                            </div>
                        )}
                    </Section>

                    {error && (
                        <div style={{ background: '#ffe9ec', color: '#9c1f30', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>
                            Export failed: {error}
                        </div>
                    )}
                    {lastSummary && (
                        <div style={{ background: '#e6f7ee', color: '#1a6b3a', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.88rem' }}>
                            Last export written:
                            <ul style={{ margin: '6px 0 0 18px' }}>
                                {lastSummary.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid var(--glass-border)', position: 'sticky', bottom: 0, background: 'var(--bg-card)' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                    >
                        Close
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleExport}
                        disabled={busy}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: busy ? 0.6 : 1 }}
                    >
                        <Download size={16} /> {busy ? 'Building zip…' : 'Export zip'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportSettingsModal;
