import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Hack for ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', '..', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

let sampleFilesData = [];
files.forEach(f => {
    const raw = fs.readFileSync(path.join(dataDir, f), 'utf-8');
    sampleFilesData.push(JSON.parse(raw));
});

const flattenDeep = (obj, currentPrefix, base) => {
    if (Array.isArray(obj)) {
        if (obj.length > 50) {
            base[`${currentPrefix}_count`] = obj.length;
            return;
        }
        obj.forEach((item, index) => {
            flattenDeep(item, `${currentPrefix}_${index}`, base);
        });
    } else if (obj !== null && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, val]) => {
            flattenDeep(val, currentPrefix ? `${currentPrefix}_${key}` : key, base);
        });
    } else {
        base[currentPrefix] = obj;
    }
};

const flattenAllVariables = (filesData) => {
    const flattened = [];
    filesData.forEach((data) => {
        const base = {
            _status: data.experiment_status,
        };
        data.payload.forEach(payload => {
            const prefix = payload.name;
            const values = payload.values;
            if (values) {
                flattenDeep(values, prefix, base);
            }
        });
        flattened.push(base);
    });
    return flattened;
};

const results = flattenAllVariables(sampleFilesData);
console.log(`Successfully flattened ${results.length} files.`);
const allKeys = new Set();
results.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));

console.log(`\nTotal unique variables extracted: ${allKeys.size}`);
console.log('\nSample of extracted variables:');
Array.from(allKeys).slice(0, 30).forEach(k => console.log(' - ' + k));
console.log(' ... and ' + (allKeys.size - 30) + ' more.');

// Specific checks based on variable_reference.md
const keywordsToCheck = [
    'attempts', 'placement_time', 'position_error', 'rotation_error', // Task 1 Guides
    'axis_duration', 'end_deviation', 'measured_end_position', // Task 3 Axes
    'total_path_length', 'drawing_duration', 'all_draw_points_count' // Task 2 Tracing
];

console.log('\n--- VERIFYING CRITICAL METRICS ---');
keywordsToCheck.forEach(keyword => {
    const matches = Array.from(allKeys).filter(k => k.includes(keyword));
    if (matches.length > 0) {
        console.log(`[OK] Found ${matches.length} matches for '${keyword}' (e.g. ${matches[0]})`);
    } else {
        console.log(`[MISSING] Could not find any variable containing '${keyword}'`);
    }
});
