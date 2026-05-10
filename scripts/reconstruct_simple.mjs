// Minimal: read Visible.txt, light smooth, write Maya.
// No sphere anchors, no segment extraction, no order tricks. Just the .txt
// points in their file order with a light moving average pass.

import fs from 'node:fs';
import path from 'node:path';

const VISIBLE_TXT = 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt';
const OUT_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/maya_export';

const SMOOTH_ITER = 3;
const SMOOTH_WINDOW = 2;

// --- Load raw .txt -----------------------------------------------------------

const points = [];
for (const line of fs.readFileSync(VISIBLE_TXT, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('index')) continue;
    const parts = t.split(',');
    if (parts.length < 4) continue;
    points.push({
        idx: parseInt(parts[0], 10),
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3]),
    });
}
console.log(`Raw .txt points: ${points.length}`);

// --- Light moving-average smoothing in .txt order ---------------------------

let smoothed = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
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
console.log(`After ${SMOOTH_ITER} smoothing passes (window ${SMOOTH_WINDOW}): ${smoothed.length} points`);

// --- Export Maya ------------------------------------------------------------

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

let scene = mayaHeader('P01_visible_simple.ma');

scene += '\n// --- Smoothed .txt points (file order, NURBS curve) ---\n';
scene += mayaTransformGroup('smoothed_path');
scene += mayaCurve('smoothed_path_curve', smoothed);

scene += '\n// --- Smoothed .txt points (locators in file order) ---\n';
scene += '// Naming: pt_NNNN where NNNN matches the .txt file index column.\n';
scene += mayaTransformGroup('smoothed_path_points');
points.forEach((orig, i) => {
    const p = smoothed[i];
    scene += mayaLocator(`pt_${String(orig.idx).padStart(4, '0')}`, p.x, p.y, p.z, 'smoothed_path_points');
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'P01_visible_simple.ma'), scene, 'utf8');
console.log(`\n✓ Wrote ${path.join(OUT_DIR, 'P01_visible_simple.ma')} (${(scene.length / 1024).toFixed(1)} KB)`);
