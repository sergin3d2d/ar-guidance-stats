// Diagnostic: are task2_drawpoints.csv and reference_paths.csv in the same
// coordinate frame? Replicates the export's spatial pipeline and prints the
// bounding boxes of both so we can see directly.

import fs from 'node:fs';
import path from 'node:path';

const { parseReferenceTxt, getSurfaceTransform, transformDrawPoints } =
    await import('../src/utils/task2Spatial.js');

const SAMPLE_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/P01';
const CURATED_DIR = path.resolve(import.meta.dirname, '../src/data');

const bbox = (pts, getX, getY, getZ) => {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (const p of pts) {
        const x = getX(p), y = getY(p), z = getZ(p);
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    return { xmin, xmax, ymin, ymax, zmin, zmax };
};
const fmt = (b) => `x[${b.xmin.toFixed(4)}, ${b.xmax.toFixed(4)}]  y[${b.ymin.toFixed(4)}, ${b.ymax.toFixed(4)}]  z[${b.zmin.toFixed(4)}, ${b.zmax.toFixed(4)}]`;

const loadCurated = (obstruction) => {
    const f = path.join(CURATED_DIR, `reference_${obstruction}.json`);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8')).points.map(([x, y, z]) => ({ x, y, z }));
};

for (const [label, file, obstruction] of [
    ['Obstruct', 'ID1__Screen__Task2_Tracing__Obstruct_collect_20260320_103150.json', 'obstruct'],
    ['Visible', 'ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json', 'visible'],
]) {
    console.log(`\n=== ${label} ===`);
    const json = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, file), 'utf8'));
    const v = json.payload.find((p) => p.name === 'SurfaceDrawing').values;

    // Raw world-frame draw points
    const rawPts = v.all_draw_points.map((p) => ({ x: p.position_x, y: p.position_y, z: p.position_z }));
    console.log(`  draw points, RAW WORLD frame:        ${fmt(bbox(rawPts, p => p.x, p => p.y, p => p.z))}`);

    // Transformed (surface-local) draw points — this is what task2_drawpoints.csv uses
    const transform = getSurfaceTransform(v);
    const transformed = transformDrawPoints(v.all_draw_points, transform);
    console.log(`  draw points, SURFACE-LOCAL (export): ${fmt(bbox(transformed, p => p.x, p => p.y, p => p.z))}`);

    // Reference path — what reference_paths.csv uses
    const curated = loadCurated(obstruction);
    if (curated) {
        console.log(`  reference path, CURATED (export):    ${fmt(bbox(curated, p => p.x, p => p.y, p => p.z))}`);
    }
    const algoRef = parseReferenceTxt(obstruction === 'obstruct'
        ? fs.readFileSync('D:/AI/DataAnalysis/ar-guidance-stats/Obstruct.txt', 'utf8')
        : fs.readFileSync('D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt', 'utf8'));
    const algoValid = algoRef.path.filter((p) => p.x !== null);
    console.log(`  reference path, algorithmic .txt:    ${fmt(bbox(algoValid, p => p.x, p => p.y, p => p.z))}`);
}
