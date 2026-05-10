// Standalone smoke test: feed P01 sample data through the helpers used
// by the export planner, and print results we can eyeball.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/P01';

const {
    parseFilenameMetadata,
    deriveConditionOrder,
    normalizeQuestionnaireCondition,
} = await import('../src/utils/dataProcessor.js');
const {
    parseReferenceTxt,
    getSurfaceTransform,
    transformDrawPoints,
    cumulativeArclength,
    computeDeviations,
    measureAlignmentOffset,
} = await import('../src/utils/task2Spatial.js');

const visibleTxt = fs.readFileSync(path.resolve(__dirname, '../Visible.txt'), 'utf8');
const obstructTxt = fs.readFileSync(path.resolve(__dirname, '../Obstruct.txt'), 'utf8');

const files = fs.readdirSync(SAMPLE_DIR);
const rawFiles = files.filter((f) => f.endsWith('.json')).map((f) => ({
    filename: f,
    json: JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, f), 'utf8')),
}));

console.log(`Loaded ${rawFiles.length} JSON from ${SAMPLE_DIR}`);

const order = deriveConditionOrder(rawFiles);
console.log('Condition order per pid:', order);

console.log('\n--- Filename parses (sample) ---');
for (const rf of rawFiles.slice(0, 3)) {
    const m = parseFilenameMetadata(rf.filename);
    console.log(`  ${rf.filename}\n    →`, m);
}

console.log('\n--- Task 1 sample row (with corrections) ---');
for (const rf of rawFiles) {
    const meta = parseFilenameMetadata(rf.filename);
    if (meta?.taskNum === 1) {
        const v = rf.json.payload.find((p) => p.name === 'GuideMeasurement')?.values;
        const m = v?.all_measurements?.[0];
        console.log({
            pid: meta.pid,
            condition: meta.conditionLabel,
            obstruction: meta.obstruction,
            order: order[meta.pid][meta.conditionLabel],
            guide_index_1based: (m.guide_index || 0) + 1,
            position_error_mm: m.position_error_mm,
            placement_corrected_s: m.placement_time_seconds - 2.5,
        });
        break;
    }
}

console.log('\n--- Task 2 alignment & deviation decomposition (all trials) ---');
const visibleRef = parseReferenceTxt(visibleTxt);
const obstructRef = parseReferenceTxt(obstructTxt);
visibleRef.arclength = cumulativeArclength(visibleRef.path);
obstructRef.arclength = cumulativeArclength(obstructRef.path);
console.log(`  Visible ref: ${visibleRef.path.length} pts, total arclength ${visibleRef.arclength[visibleRef.arclength.length - 1].toFixed(3)} m`);
console.log(`  Obstruct ref: ${obstructRef.path.length} pts, total arclength ${obstructRef.arclength[obstructRef.arclength.length - 1].toFixed(3)} m`);
console.log('  device      cond     align  n     arc_min  arc_max  perp_rms  lat_rms  total_max');

for (const rf of rawFiles) {
    const meta = parseFilenameMetadata(rf.filename);
    if (meta?.taskNum !== 2) continue;
    const v = rf.json.payload.find((p) => p.name === 'SurfaceDrawing')?.values;
    if (!v?.all_draw_points?.length) continue;
    const transform = getSurfaceTransform(v);
    const transformed = transformDrawPoints(v.all_draw_points, transform);
    const ref = meta.obstruction.toLowerCase().includes('obstruct') ? obstructRef : visibleRef;
    const offset = measureAlignmentOffset(transformed, ref.path);
    const devs = computeDeviations(transformed, ref.path, ref.arclength);
    const valid = devs.filter((d) => d?.dev_total_mm !== null);
    const totals = valid.map((d) => d.dev_total_mm);
    const perps = valid.map((d) => d.dev_perp_mm);
    const laterals = valid.map((d) => d.dev_lateral_mm);
    const arcs = valid.map((d) => d.arclength_m);
    const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
    console.log(`  ${meta.deviceRaw.padEnd(11)} ${meta.obstruction.padEnd(8)}: ${offset.toFixed(1).padStart(5)}mm  n=${String(valid.length).padStart(4)}  arc=[${Math.min(...arcs).toFixed(3)}..${Math.max(...arcs).toFixed(3)}]m  perp_rms=${rms(perps).toFixed(2).padStart(5)}  lat_rms=${rms(laterals).toFixed(2).padStart(5)}  total_max=${Math.max(...totals).toFixed(2).padStart(6)}`);
}

console.log('\n--- Task 3 sample row ---');
for (const rf of rawFiles) {
    const meta = parseFilenameMetadata(rf.filename);
    if (meta?.taskNum === 3) {
        const v = rf.json.payload.find((p) => p.name === 'AxisMeasurement')?.values;
        const a = v?.all_axes_measurements?.[0];
        console.log({
            pid: meta.pid,
            condition: meta.conditionLabel,
            order: order[meta.pid][meta.conditionLabel],
            axis_index_1based: (a.axis_index || 0) + 1,
            entry_dev: a.entry_deviation_mm,
            end_dev: a.end_deviation_mm,
            axis_time_corrected_s: a.axis_total_time_seconds - 2.5,
        });
        break;
    }
}

console.log('\n--- Questionnaire condition normalization ---');
for (const s of ['AR-OST (Hololens)', 'PCUE-Q for AR-OST (Hololens)', 'AR-VST (Quest 3)', 'On-Screen', 'PCUE-Q for On-Screen', 'Final Preference']) {
    console.log(`  "${s}" → "${normalizeQuestionnaireCondition(s)}"`);
}

console.log('\n✓ smoke test complete');
