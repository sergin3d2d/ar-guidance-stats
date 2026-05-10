// Reconstruct the Visible reference path using JSON spheres as anchors.
//
// JSON sphere IDs (M01..M15) are ALREADY in path-traversal order — they were
// laid out as the planned corners + endpoints in correct sequence. So no need
// to sort them.
//
// Strategy:
//   1. Take 15 JSON spheres in JSON order (= path order).
//   2. For each .txt point, find its closest sphere — that's the sphere
//      "owning" the point. Avoids grabbing points from parallel sections of
//      the path that happen to be near the A-B line.
//   3. For each consecutive pair (S_i, S_{i+1}):
//        - Take .txt points owned by S_i or S_{i+1}
//        - Project onto the S_i-S_{i+1} line; keep only those between them
//        - Apply tight perpendicular threshold to keep on-segment points only
//        - Sort by projection
//   4. Concatenate: S0 → seg(0,1) → S1 → seg(1,2) → … → S14
//   5. Smooth lightly between sphere positions (sphere positions stay anchored)
//   6. Compute arclength, export Maya

import fs from 'node:fs';
import path from 'node:path';

const VISIBLE_TXT = 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt';
const REPRESENTATIVE_JSON = 'D:/AI/DataAnalysis/ar-guidance-stats/P01/ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json';
const OUT_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/maya_export';

const PERP_THRESHOLD = 0.004;   // 4mm — perpendicular distance to segment line
const SMOOTH_ITER = 4;
const SMOOTH_WINDOW = 2;

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

// --- JSON spheres in JSON order (= path order) -------------------------------

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
        name: m.reference_name,
        x: pos.x, y: pos.y, z: pos.z,
    };
});
console.log(`Spheres (JSON order = path order):`);
spheres.forEach((s) => {
    console.log(`  ${s.label}  (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`);
});

// --- Step 1: Assign each .txt point to its closest sphere -------------------

const txtOwner = new Int32Array(rawTxt.length);
for (let i = 0; i < rawTxt.length; i++) {
    const p = rawTxt[i];
    let bestIdx = 0, bestSq = Infinity;
    for (let j = 0; j < spheres.length; j++) {
        const s = spheres[j];
        const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2;
        if (d < bestSq) { bestSq = d; bestIdx = j; }
    }
    txtOwner[i] = bestIdx;
}

// --- Step 2: Build per-segment point lists ---------------------------------

const segments = [];
for (let i = 0; i < spheres.length - 1; i++) {
    const a = spheres[i], b = spheres[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;

    const candidates = [];
    for (let txtIdx = 0; txtIdx < rawTxt.length; txtIdx++) {
        if (txtOwner[txtIdx] !== i && txtOwner[txtIdx] !== i + 1) continue;
        const p = rawTxt[txtIdx];
        const ax = p.x - a.x, ay = p.y - a.y, az = p.z - a.z;
        const t = ax * ux + ay * uy + az * uz;
        if (t < 0 || t > len) continue;            // outside segment endpoints
        const fx = a.x + t * ux, fy = a.y + t * uy, fz = a.z + t * uz;
        const perp = Math.hypot(p.x - fx, p.y - fy, p.z - fz);
        if (perp > PERP_THRESHOLD) continue;        // off the segment line
        candidates.push({ p, t });
    }
    candidates.sort((x, y) => x.t - y.t);
    segments.push({
        from: a.label, to: b.label, length_mm: len * 1000,
        n_points: candidates.length, points: candidates.map((c) => c.p),
    });
}

console.log(`\nSegment extraction:`);
console.log(`  segment    length(mm)  n_points  density(pts/mm)`);
segments.forEach((s, i) => {
    console.log(`  ${s.from}→${s.to}    ${s.length_mm.toFixed(1).padStart(6)}     ${String(s.n_points).padStart(4)}    ${(s.n_points / s.length_mm).toFixed(2)}`);
});

// --- Step 3: Concatenate path: sphere[0], segment[0,1] points, sphere[1], … ---

const fullPath = [];
const sphereIndicesInPath = new Set();
fullPath.push({ x: spheres[0].x, y: spheres[0].y, z: spheres[0].z });
sphereIndicesInPath.add(0);

for (let i = 0; i < segments.length; i++) {
    let prev = fullPath[fullPath.length - 1];
    for (const p of segments[i].points) {
        const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
        if (d < 0.0005) continue;  // skip duplicates within 0.5mm
        fullPath.push({ x: p.x, y: p.y, z: p.z });
        prev = p;
    }
    fullPath.push({ x: spheres[i + 1].x, y: spheres[i + 1].y, z: spheres[i + 1].z });
    sphereIndicesInPath.add(fullPath.length - 1);
}

console.log(`\nConcatenated path: ${fullPath.length} points`);

// --- Step 4: Light smoothing (sphere positions stay anchored) ---------------

let smoothed = fullPath.slice();
for (let iter = 0; iter < SMOOTH_ITER; iter++) {
    const next = [];
    for (let i = 0; i < smoothed.length; i++) {
        if (sphereIndicesInPath.has(i)) { next.push(smoothed[i]); continue; }
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let j = Math.max(0, i - SMOOTH_WINDOW); j <= Math.min(smoothed.length - 1, i + SMOOTH_WINDOW); j++) {
            sx += smoothed[j].x; sy += smoothed[j].y; sz += smoothed[j].z; n++;
        }
        next.push({ x: sx / n, y: sy / n, z: sz / n });
    }
    smoothed = next;
}

// Cumulative arclength + sphere arclengths
const arclength = [0];
let total = 0;
for (let i = 1; i < smoothed.length; i++) {
    total += Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y, smoothed[i].z - smoothed[i - 1].z);
    arclength.push(total);
}
console.log(`\nFinal smoothed path: ${smoothed.length} points, total arclength ${total.toFixed(3)} m`);

console.log(`\nSphere arclength positions:`);
const sphereArcs = [...sphereIndicesInPath].sort((a, b) => a - b).map((i) => ({ idx: i, arc: arclength[i] }));
spheres.forEach((s, i) => console.log(`  ${s.label}: arc = ${sphereArcs[i].arc.toFixed(3)} m`));

// --- Step 5: Export Maya ----------------------------------------------------

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

scene += '\n// --- Reconstructed path (NURBS curve, JSON sphere order) ---\n';
scene += mayaTransformGroup('reconstructed_path');
scene += mayaCurve('reconstructed_path_curve', smoothed);

scene += '\n// --- Reconstructed path points (locators in walk order) ---\n';
scene += mayaTransformGroup('reconstructed_points');
smoothed.forEach((p, i) => {
    scene += mayaLocator(`pt_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'reconstructed_points');
});

scene += '\n// --- Sphere anchors (JSON order = path order) ---\n';
scene += mayaTransformGroup('sphere_anchors');
spheres.forEach((s) => {
    scene += mayaLocator(s.label, s.x, s.y, s.z, 'sphere_anchors');
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'P01_visible_via_spheres.ma'), scene, 'utf8');
console.log(`\n✓ Wrote ${path.join(OUT_DIR, 'P01_visible_via_spheres.ma')} (${(scene.length / 1024).toFixed(1)} KB)`);
