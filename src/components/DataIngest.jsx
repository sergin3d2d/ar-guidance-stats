import React, { useState } from 'react';
import { processExperimentData } from '../utils/dataProcessor';

const DataIngest = ({ onDataLoaded }) => {
    const [loading, setLoading] = useState(false);
    const [fileCount, setFileCount] = useState(0);

    const handleFolderSelect = async (e) => {
        const files = Array.from(e.target.files);
        const jsonFiles = files.filter(f => f.name.endsWith('.json'));
        const csvFiles = files.filter(f => f.name.endsWith('.csv') && f.name.includes('results'));

        if (jsonFiles.length === 0) return;

        setLoading(true);
        setFileCount(jsonFiles.length + csvFiles.length);

        try {
            const dataPromises = jsonFiles.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            resolve(JSON.parse(event.target.result));
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

            const allData = (await Promise.all(dataPromises)).filter(d => d !== null);
            const csvData = await Promise.all(csvPromises);

            const processed = processExperimentData(allData, csvData);
            onDataLoaded(processed, allData);
        } catch (err) {
            console.error('Data loading error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card" style={{ marginBottom: '24px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Step 1: Ingest Experimental Folders</h3>
            <p className="stat-label">Select the directory containing participant JSON logs</p>

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

            {loading && <p className="stat-label" style={{ color: '#00f2ff' }}>Analyzing {fileCount} data points...</p>}

            {!loading && fileCount > 0 && (
                <p className="stat-label" style={{ color: '#00f2ff' }}>✓ {fileCount} files successfully parsed</p>
            )}
        </div>
    );
};

export default DataIngest;
