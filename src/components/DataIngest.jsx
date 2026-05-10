import React, { useState } from 'react';
import { processExperimentData, parseFilenameMetadata } from '../utils/dataProcessor';

const DataIngest = ({ onDataLoaded }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ jsonCount: 0, csvCount: 0, pidCount: 0, pids: [] });

    const handleFolderSelect = async (e) => {
        const files = Array.from(e.target.files);
        const jsonFiles = files.filter(f => f.name.endsWith('.json'));
        const csvFiles = files.filter(f => f.name.endsWith('.csv') && f.name.includes('results'));

        if (jsonFiles.length === 0) return;

        // Pre-scan filenames to show participant count before parsing JSON.
        const detectedPids = new Set();
        for (const f of jsonFiles) {
            const meta = parseFilenameMetadata(f.name);
            if (meta) detectedPids.add(meta.pid);
        }

        setLoading(true);
        setProgress({
            jsonCount: jsonFiles.length,
            csvCount: csvFiles.length,
            pidCount: detectedPids.size,
            pids: Array.from(detectedPids).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
        });

        try {
            const dataPromises = jsonFiles.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            resolve({ filename: file.name, json: JSON.parse(event.target.result) });
                        } catch (err) {
                            console.error('Error parsing JSON:', file.name);
                            resolve(null);
                        }
                    };
                    reader.readAsText(file);
                });
            });

            const csvPromises = csvFiles.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        resolve({ name: file.name, content: event.target.result });
                    };
                    reader.readAsText(file);
                });
            });

            const rawFiles = (await Promise.all(dataPromises)).filter(d => d !== null);
            const csvData = await Promise.all(csvPromises);

            const allData = rawFiles.map(f => f.json);
            const processed = processExperimentData(allData, csvData);
            onDataLoaded(processed, rawFiles, csvData);
        } catch (err) {
            console.error('Data loading error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card" style={{ marginBottom: '24px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Step 1: Ingest Experimental Data</h3>
            <p className="stat-label">
                Select <strong>one participant folder</strong> (e.g. <code>P01/</code>) <strong>or</strong> a parent folder
                containing multiple participants (e.g. <code>data/</code> with <code>P01/, P02/, P03/, …</code> inside).
                All JSONs and result CSVs found anywhere in the selected tree are processed together.
            </p>

            <div style={{ margin: '20px 0' }}>
                <input
                    type="file"
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={handleFolderSelect}
                    style={{ cursor: 'pointer' }}
                />
            </div>

            {loading && (
                <p className="stat-label" style={{ color: '#00f2ff' }}>
                    Parsing {progress.jsonCount} JSON + {progress.csvCount} CSV files
                    {' '}from {progress.pidCount} participant{progress.pidCount === 1 ? '' : 's'}…
                </p>
            )}

            {!loading && progress.jsonCount > 0 && (
                <div style={{ color: '#00f2ff' }}>
                    <p className="stat-label" style={{ margin: '4px 0' }}>
                        ✓ Loaded {progress.jsonCount} JSON + {progress.csvCount} CSV
                        {' '}from {progress.pidCount} participant{progress.pidCount === 1 ? '' : 's'}
                    </p>
                    {progress.pids.length > 0 && (
                        <p className="stat-label" style={{ margin: '4px 0', fontSize: '0.75rem' }}>
                            Participants: {progress.pids.map((p) => `P${String(p).padStart(2, '0')}`).join(', ')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default DataIngest;
