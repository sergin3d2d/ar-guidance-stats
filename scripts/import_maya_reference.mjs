// Import a hand-cleaned reference path from a Maya .ma file.
//
// The user manually cleans a reference path in Maya (deletes fly-away CVs,
// fixes corners) and saves the curve. This script:
//   1. Parses the NURBS curve's control vertices from the .ma
//   2. Converts to meters (Maya scenes are commonly in cm)
//   3. Resamples to uniform arclength spacing (deletions leave uneven gaps)
//   4. Writes a JSON the app loads as the curated reference path
//
// Usage: node scripts/import_maya_reference.mjs <input.ma> <obstruction> [resampleMm]
//   obstruction ∈ {visible, obstruct}
// Example: node scripts/import_maya_reference.mjs \
//            ../maya_export/obstruct_reference_path.ma obstruct

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node scripts/import_maya_reference.mjs <input.ma> <visible|obstruct> [resampleMm]');
    process.exit(1);
}
const inputPath = path.isAbsolute(args[0]) ? args[0] : path.resolve(__dirname, '..', args[0]);
const obstruction = args[1].toLowerCase();
const resampleMm = args[2] ? parseFloat(args[2]) : 1.0;
if (obstruction !== 'visible' && obstruction !== 'obstruct') {
    console.error(`Second arg must be "visible" or "obstruct", got "${obstruction}"`);
    process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, '../src/data');
const OUT_FILE = path.join(OUT_DIR, `reference_${obstruction}.json`);

// --- Parse the .ma -----------------------------------------------------------

const raw = fs.readFileSync(inputPath, 'utf8');

// Unit: Maya .ma declares currentUnit; coordinates are stored in that unit.
const unitMatch = raw.match(/currentUnit\s+-l\s+(\w+)/);
const linearUnit = unitMatch ? unitMatch[1] : 'centimeter';
const toMeters = { meter: 1, centimeter: 0.01, millimeter: 0.001, decimeter: 0.1 }[linearUnit];
if (!toMeters) {
    console.error(`Unknown linear unit "${linearUnit}" — add it to the toMeters map.`);
    process.exit(1);
}
console.log(`Input: ${inputPath}`);
console.log(`Maya linear unit: ${linearUnit} (×${toMeters} → meters)`);

// Find the first nurbsCurve .cc block. Format:
//   setAttr ".cc" -type "nurbsCurve"
//       <degree> <spans> <form> <rational> <dim>
//       <knotCount> <knots...>
//       <cvCount>
//       <cv0x> <cv0y> <cv0z>
//       ...
//   ;
const ccIdx = raw.indexOf('setAttr ".cc" -type "nurbsCurve"');
if (ccIdx < 0) {
    console.error('No nurbsCurve .cc block found in the file.');
    process.exit(1);
}
// Everything from .cc to the terminating ';'
const block = raw.slice(ccIdx, raw.indexOf(';', ccIdx));
// Flatten to a stream of numeric tokens (skip the "setAttr..." header line)
const afterHeader = block.slice(block.indexOf('\n') + 1);
const tokens = afterHeader.split(/\s+/).filter((t) => t.length > 0).map(Number);

let cursor = 0;
const degree = tokens[cursor++];
const spans = tokens[cursor++];
cursor += 3;                        // form, rational, dim
const knotCount = tokens[cursor++];
cursor += knotCount;                // skip knot values
const cvCount = tokens[cursor++];
console.log(`NURBS curve: degree ${degree}, ${spans} spans, ${cvCount} control vertices`);

const cvs = [];
for (let i = 0; i < cvCount; i++) {
    const x = tokens[cursor++], y = tokens[cursor++], z = tokens[cursor++];
    if ([x, y, z].some((v) => !Number.isFinite(v))) {
        console.error(`Non-finite CV at index ${i} — parse error.`);
        process.exit(1);
    }
    cvs.push({ x: x * toMeters, y: y * toMeters, z: z * toMeters });
}
console.log(`Parsed ${cvs.length} control vertices, converted to meters.`);

// --- Resample to uniform arclength ------------------------------------------

const cumulative = [0];
for (let i = 1; i < cvs.length; i++) {
    const d = Math.hypot(cvs[i].x - cvs[i - 1].x, cvs[i].y - cvs[i - 1].y, cvs[i].z - cvs[i - 1].z);
    cumulative.push(cumulative[i - 1] + d);
}
const totalLen = cumulative[cumulative.length - 1];
console.log(`Curve length: ${totalLen.toFixed(4)} m`);

const step = resampleMm / 1000;
const nSamples = Math.max(2, Math.round(totalLen / step) + 1);
const resampled = [];
let segIdx = 0;
for (let s = 0; s < nSamples; s++) {
    const target = (s / (nSamples - 1)) * totalLen;
    while (segIdx < cumulative.length - 2 && cumulative[segIdx + 1] < target) segIdx++;
    const segLen = cumulative[segIdx + 1] - cumulative[segIdx];
    const t = segLen > 1e-12 ? (target - cumulative[segIdx]) / segLen : 0;
    const a = cvs[segIdx], b = cvs[segIdx + 1];
    resampled.push({
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
        z: a.z + t * (b.z - a.z),
    });
}
console.log(`Resampled to ${resampled.length} points at ${resampleMm} mm spacing.`);

// --- Write JSON -------------------------------------------------------------

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const out = {
    source: path.basename(inputPath),
    obstruction,
    unit: 'meters',
    resample_mm: resampleMm,
    total_length_m: totalLen,
    n_points: resampled.length,
    points: resampled.map((p) => [
        Number(p.x.toFixed(6)), Number(p.y.toFixed(6)), Number(p.z.toFixed(6)),
    ]),
};
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 0), 'utf8');
console.log(`\n✓ Wrote ${OUT_FILE}`);
console.log(`  ${resampled.length} points, ${totalLen.toFixed(3)} m total length`);
