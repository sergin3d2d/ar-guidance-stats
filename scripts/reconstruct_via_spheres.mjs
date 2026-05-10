// Reconstruct the Visible reference path:
//   1. Voxel-downsample raw .txt → uniform density
//   2. Smooth the downsampled points (preserves order from .txt native rows)
//   3. JSON spheres are corners + endpoints, in JSON order = path order
//   4. For each smoothed point, find owning sphere (closest sphere)
//   5. For each consecutive sphere pair, collect owned points, order them
//      along the A→B direction, keep within a perpendicular tolerance
//   6. Concatenate: sphere[0] → seg(0,1) smooth-pts → sphere[1] → … → sphere[14]
//   7. Compute arclength, export Maya

import fs from 'node:fs';
import path from 'node:path';

const VISIBLE_TXT = 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt';
const REPRESENTATIVE_JSON = 'D:/AI/DataAnalysis/ar-guidance-stats/P01/ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json';
const OUT_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/maya_export';

const VOXEL_M = 0.0015;        // 1.5mm voxel — uniform density
const SMOOTH_ITER = 15;        // moving-average passes (preserves order)
const SMOOTH_WINDOW = 4;       // half-window
const PERP_THRESHOLD = 0.012;  // 12mm perpendicular distance from segment line
                               // (loose enough to capture surface curvature)
const BIN_M = 0.002;           // 2mm bins along segment direction
                               // — centerline averaging avoids zigzag
const FINAL_SMOOTH_ITER = 5;   // smoothing passes on final concatenated path
const FINAL_SMOOTH_WINDOW = 2;

const { getSurfaceTransform, transformPointToLocal } = await import('../src/utils/task2Spatial.js');

// --- Load raw .txt -----------------------------------------------------------

const rawTxt = [];
for (const line of fs.readFileSync(VISIBLE_TXT, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('index')) continue;
    const parts = t.split(',');
    if (parts.length < 4) continue;
    rawTxt.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
}
console.log(`Raw .txt points: ${rawTxt.length}`);

// --- Step 1: Voxel downsample (order-preserving) -----------------------------

const voxelOrdered = (() => {
    const out = [];
    let curKey = null, acc = null;
    const flush = () => { if (acc?.n) out.push({ x: acc.sx / acc.n, y: acc.sy / acc.n, z: acc.sz / acc.n }); };
    for (const p of rawTxt) {
        const key = `${Math.floor(p.x / VOXEL_M)},${Math.floor(p.y / VOXEL_M)},${Math.floor(p.z / VOXEL_M)}`;
        if (key !== curKey) { flush(); curKey = key; acc = { sx: 0, sy: 0, sz: 0, n: 0 }; }
        acc.sx += p.x; acc.sy += p.y; acc.sz += p.z; acc.n++;
    }
    flush();
    return out;
})();
console.log(`After ${VOXEL_M * 1000}mm voxel downsample: ${voxelOrdered.length} points`);

// --- Step 2: Smooth (light moving average, preserves order) ------------------

let smoothed = voxelOrdered.slice();
for (let iter = 0; iter < SMOOTH_ITER; iter++) {
    const next = [];
    for (let i = 0; i < smoothed.length; i++) {
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let j = Math.max(0, i - SMOOTH_WINDOW); j <= Math.min(smoothed.length - 1, i + SMOOTH_WINDOW); j++) {
            sx += smoothed[j].x; sy += smoothed[j].y; sz += smoothed[j].z; n++;
        }
        next.push({ x: sx / n, y: sy / n, z: sz / n });
    }
    smoothed = next;
}
console.log(`After smoothing (${SMOOTH_ITER} iter, window ${SMOOTH_WINDOW}): ${smoothed.length} points`);

// --- Step 3: Load JSON spheres (in JSON order = path order) ------------------

const json = JSON.parse(fs.readFileSync(REPRESENTATIVE_JSON, 'utf8'));
const v = json.payload.find((p) => p.name === 'SurfaceDrawing').values;
const transform = getSurfaceTransform(v);
const spheres = v.reference_point_measurements.map((m, i) => {
    const pos = transformPointToLocal({
        position_x: m.reference_position_x,
        position_y: m.reference_position_y,
        position_z: m.reference_position_z,
    }, transform);
    return {
        label: `M${String(i + 1).padStart(2, '0')}`,
        x: pos.x, y: pos.y, z: pos.z,
    };
});
console.log(`Spheres (path order): ${spheres.map((s) => s.label).join(', ')}`);

// --- Step 4: Owner = closest sphere for each smoothed point ------------------

const owner = new Int32Array(smoothed.length);
for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    let bestIdx = 0, bestSq = Infinity;
    for (let j = 0; j < spheres.length; j++) {
        const s = spheres[j];
        const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2;
        if (d < bestSq) { bestSq = d; bestIdx = j; }
    }
    owner[i] = bestIdx;
}

// --- Step 5: Per-segment extraction with t-binning --------------------------
// Divide each segment into bins along the A→B direction. Average all points
// in each bin → one centerline point per bin. Output is monotonic in t and
// captures the average perpendicular position (curvature) at each step.

const segments = [];
for (let i = 0; i < spheres.length - 1; i++) {
    const a = spheres[i], b = spheres[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;

    const numBins = Math.max(1, Math.ceil(len / BIN_M));
    const bins = Array.from({ length: numBins }, () => ({ sx: 0, sy: 0, sz: 0, n: 0 }));

    let candidatesCount = 0;
    for (let k = 0; k < smoothed.length; k++) {
        if (owner[k] !== i && owner[k] !== i + 1) continue;
        const p = smoothed[k];
        const ax = p.x - a.x, ay = p.y - a.y, az = p.z - a.z;
        const t = ax * ux + ay * uy + az * uz;
        if (t <= 0 || t >= len) continue;
        const fx = a.x + t * ux, fy = a.y + t * uy, fz = a.z + t * uz;
        const perp = Math.hypot(p.x - fx, p.y - fy, p.z - fz);
        if (perp > PERP_THRESHOLD) continue;
        const binIdx = Math.min(numBins - 1, Math.floor(t / BIN_M));
        bins[binIdx].sx += p.x; bins[binIdx].sy += p.y; bins[binIdx].sz += p.z; bins[binIdx].n++;
        candidatesCount++;
    }
    const centerline = bins
        .filter((b) => b.n > 0)
        .map((b) => ({ x: b.sx / b.n, y: b.sy / b.n, z: b.sz / b.n }));
    segments.push({
        from: a.label, to: b.label, length_mm: len * 1000,
        n_candidates: candidatesCount, n_bins_filled: centerline.length, points: centerline,
    });
}

console.log(`\nSegment extraction (t-binned centerlines, ${BIN_M * 1000}mm bins):`);
console.log(`  segment   length(mm)  n_cands  n_bins_filled`);
segments.forEach((s) => {
    console.log(`  ${s.from}→${s.to}   ${s.length_mm.toFixed(1).padStart(6)}    ${String(s.n_candidates).padStart(4)}    ${String(s.n_bins_filled).padStart(4)}`);
});

// --- Step 6: Concatenate ----------------------------------------------------

const fullPath = [{ x: spheres[0].x, y: spheres[0].y, z: spheres[0].z }];
const sphereIndicesInPath = new Set([0]);

for (let i = 0; i < segments.length; i++) {
    let prev = fullPath[fullPath.length - 1];
    for (const p of segments[i].points) {
        const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
        if (d < 0.0005) continue;
        fullPath.push({ x: p.x, y: p.y, z: p.z });
        prev = p;
    }
    fullPath.push({ x: spheres[i + 1].x, y: spheres[i + 1].y, z: spheres[i + 1].z });
    sphereIndicesInPath.add(fullPath.length - 1);
}

// Final smoothing pass — sphere positions stay anchored
let final = fullPath.slice();
for (let iter = 0; iter < FINAL_SMOOTH_ITER; iter++) {
    const next = [];
    for (let i = 0; i < final.length; i++) {
        if (sphereIndicesInPath.has(i)) { next.push(final[i]); continue; }
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let j = Math.max(0, i - FINAL_SMOOTH_WINDOW); j <= Math.min(final.length - 1, i + FINAL_SMOOTH_WINDOW); j++) {
            sx += final[j].x; sy += final[j].y; sz += final[j].z; n++;
        }
        next.push({ x: sx / n, y: sy / n, z: sz / n });
    }
    final = next;
}

// Cumulative arclength
const arclength = [0];
let total = 0;
for (let i = 1; i < final.length; i++) {
    total += Math.hypot(final[i].x - final[i - 1].x, final[i].y - final[i - 1].y, final[i].z - final[i - 1].z);
    arclength.push(total);
}
console.log(`\nFinal path (after final smoothing): ${final.length} points, total arclength ${total.toFixed(3)} m`);

console.log(`\nSphere arclength positions:`);
const sphereArcs = [...sphereIndicesInPath].sort((a, b) => a - b);
spheres.forEach((s, i) => console.log(`  ${s.label}: arc = ${arclength[sphereArcs[i]].toFixed(3)} m`));

// --- Step 7: Export Maya ----------------------------------------------------

const mayaHeader = (sceneName) => `//Maya ASCII 2023 scene
//Name: ${sceneName}
//Codeset: 1252
requires maya "2023";
currentUnit -l meter -a degree -t film;
fileInfo "application" "maya";
fileInfo "product" "Maya 2023";
fileInfo "version" "2023";
`;
const mayaTransformGroup = (name) => `createNode transform -n "${name}";\n`;
const mayaLocator = (name, x, y, z, parent) =>
    `createNode transform -n "${name}" -p "${parent}";
\tsetAttr ".t" -type "double3" ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)} ;
createNode locator -n "${name}Shape" -p "${name}";
\tsetAttr -k off ".v";
`;
const mayaCurve = (name, pts) => {
    if (pts.length < 2) return '';
    const knots = Array.from({ length: pts.length }, (_, i) => i);
    return `createNode transform -n "${name}";
createNode nurbsCurve -n "${name}Shape" -p "${name}";
\tsetAttr -k off ".v";
\tsetAttr ".cc" -type "nurbsCurve"
\t\t1 ${pts.length - 1} 0 no 3
\t\t${knots.length} ${knots.join(' ')}
\t\t${pts.length}
\t\t${pts.map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`).join('\n\t\t')} ;
`;
};

let scene = mayaHeader('P01_visible_via_spheres.ma');

scene += '\n// --- Reconstructed path (NURBS curve) ---\n';
scene += mayaTransformGroup('reconstructed_path');
scene += mayaCurve('reconstructed_path_curve', final);

scene += '\n// --- Reconstructed path points (locators in walk order) ---\n';
scene += mayaTransformGroup('reconstructed_points');
final.forEach((p, i) => {
    scene += mayaLocator(`pt_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'reconstructed_points');
});

scene += '\n// --- Sphere anchors (M01..M15 in path order) ---\n';
scene += mayaTransformGroup('sphere_anchors');
spheres.forEach((s) => {
    scene += mayaLocator(s.label, s.x, s.y, s.z, 'sphere_anchors');
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'P01_visible_via_spheres.ma'), scene, 'utf8');
console.log(`\n✓ Wrote ${path.join(OUT_DIR, 'P01_visible_via_spheres.ma')} (${(scene.length / 1024).toFixed(1)} KB)`);
