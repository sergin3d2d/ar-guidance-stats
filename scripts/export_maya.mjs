// Generate two Maya ASCII (.ma) scene files for visual evaluation:
//   1. P01_visible_reference.ma — planned (reference) path + milestones
//   2. P01_OnScreen_Visible_traced.ma — registered traced path + same milestones
//
// Both files use the same surface-local frame and meter units, so they can
// be imported into one Maya scene and overlaid for direct comparison.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/P01';
const OUT_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/maya_export';
const VISIBLE_TXT = 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt';
const TRACED_FILE = 'ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json';

const {
    parseReferenceTxt,
    getSurfaceTransform,
    transformDrawPoints,
    transformPointToLocal,
    cumulativeArclength,
    measureAlignmentOffset,
} = await import('../src/utils/task2Spatial.js');

// --- Maya ASCII writer ------------------------------------------------------

const mayaHeader = (sceneName) => `//Maya ASCII 2023 scene
//Name: ${sceneName}
//Codeset: 1252
requires maya "2023";
currentUnit -l meter -a degree -t film;
fileInfo "application" "maya";
fileInfo "product" "Maya 2023";
fileInfo "version" "2023";
fileInfo "cutIdentifier" "exported-from-ar-guidance-analyzer";
`;

const mayaTransformGroup = (name, parent = null) => {
    const parentArg = parent ? ` -p "${parent}"` : '';
    return `createNode transform -n "${name}"${parentArg};
`;
};

const mayaLocator = (name, x, y, z, parent) => {
    return `createNode transform -n "${name}" -p "${parent}";
\tsetAttr ".t" -type "double3" ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)} ;
createNode locator -n "${name}Shape" -p "${name}";
\tsetAttr -k off ".v";
`;
};

// Use a NURBS curve so the path's order is visible in Maya — the curve's CV
// indices encode the polyline direction. Breaks (null x) split into segments.
const mayaNurbsCurveSegments = (curveBaseName, points) => {
    let out = '';
    let segIdx = 0;
    let buf = [];
    const flush = () => {
        if (buf.length < 2) { buf = []; return; }
        const name = `${curveBaseName}_seg${String(segIdx).padStart(3, '0')}`;
        const degree = 1; // linear so each CV is a literal point — order is unambiguous
        const knots = [];
        for (let i = 0; i < buf.length; i++) knots.push(i);
        out += `createNode transform -n "${name}";
createNode nurbsCurve -n "${name}Shape" -p "${name}";
\tsetAttr -k off ".v";
\tsetAttr ".cc" -type "nurbsCurve"
\t\t${degree} ${buf.length - 1} 0 no 3
\t\t${knots.length} ${knots.join(' ')}
\t\t${buf.length}
\t\t${buf.map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`).join('\n\t\t')} ;
`;
        segIdx += 1;
        buf = [];
    };
    for (const p of points) {
        if (p.x === null || p.x === undefined) { flush(); continue; }
        buf.push(p);
    }
    flush();
    return out;
};

// Order milestones by arclength so the labels match the dashboard's numbering.
const orderMilestonesByArclength = (refPoints, refDistances, milestones) => {
    const withArc = milestones.map((m) => {
        let bestIdx = 0, bestSq = Infinity;
        for (let j = 0; j < refPoints.length; j++) {
            const r = refPoints[j];
            if (r.x === null) continue;
            const d = (m.x - r.x) ** 2 + (m.y - r.y) ** 2 + (m.z - r.z) ** 2;
            if (d < bestSq) { bestSq = d; bestIdx = j; }
        }
        return { x: m.x, y: m.y, z: m.z, arclength_m: refDistances[bestIdx] || 0, refIdx: bestIdx };
    });
    withArc.sort((a, b) => a.arclength_m - b.arclength_m);
    return withArc.map((m, i) => ({ ...m, label: `M${i + 1}` }));
};

// --- Load planned reference (from .txt) and the chosen traced trial --------

const visibleTxt = fs.readFileSync(VISIBLE_TXT, 'utf8');
const visibleRef = parseReferenceTxt(visibleTxt);

const tracedJson = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, TRACED_FILE), 'utf8'));
const v = tracedJson.payload.find((p) => p.name === 'SurfaceDrawing')?.values;
if (!v) throw new Error('Traced file has no SurfaceDrawing payload');

const transform = getSurfaceTransform(v);
const transformed = transformDrawPoints(v.all_draw_points, transform);
const offsetMm = measureAlignmentOffset(transformed, visibleRef.path);

// JSON-defined milestones — the experiment's actual measurement targets.
// Each entry has both planned (reference_position) and the user's recorded
// point nearest it (closest_draw_point_position), plus the recorded distance.
// Both are in world frame; transform to surface-local for overlay.
const runtimeMilestones = (v.reference_point_measurements || []).map((m, i) => {
    const planned = transformPointToLocal({
        position_x: m.reference_position_x,
        position_y: m.reference_position_y,
        position_z: m.reference_position_z,
    }, transform);
    const userHit = transformPointToLocal({
        position_x: m.closest_draw_point_position_x,
        position_y: m.closest_draw_point_position_y,
        position_z: m.closest_draw_point_position_z,
    }, transform);
    return {
        label: `M${String(i + 1).padStart(2, '0')}`,
        name: m.reference_name,
        planned,
        userHit,
        distance_mm: m.distance_mm,
        closest_draw_point_index: m.closest_draw_point_index,
    };
});

console.log(`Reference path (.txt smoothed): ${visibleRef.path.length} points`);
console.log(`Traced trial: ${TRACED_FILE}`);
console.log(`  ${v.all_draw_points.length} draw points → ${transformed.length} registered points`);
console.log(`  Centroid offset from reference: ${offsetMm.toFixed(2)} mm (in surface-local frame)`);
console.log(`\nMilestone pairs (from JSON reference_point_measurements):`);
console.log(`  label  name    planned (m)                       user hit (m)                       dist (mm)`);
for (const m of runtimeMilestones) {
    const p = m.planned, u = m.userHit;
    console.log(`  ${m.label}  ${(m.name || '?').padEnd(7)} (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  (${u.x.toFixed(3)}, ${u.y.toFixed(3)}, ${u.z.toFixed(3)})  ${m.distance_mm.toFixed(2)}`);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// --- File 1: planned reference path -----------------------------------------

let refScene = mayaHeader('P01_visible_reference.ma');
refScene += '\n// --- Reference path (NURBS curves, one per continuous segment) ---\n';
refScene += mayaTransformGroup('reference_path');
refScene += mayaNurbsCurveSegments('reference_path', visibleRef.path);

refScene += '\n// --- Reference path points (locators) ---\n';
refScene += mayaTransformGroup('reference_path_points');
visibleRef.path.forEach((p, i) => {
    if (p.x === null) return;
    refScene += mayaLocator(`pt_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'reference_path_points');
});

refScene += '\n// --- Planned milestones (from JSON reference_position) ---\n';
refScene += mayaTransformGroup('milestones_planned');
for (const m of runtimeMilestones) {
    refScene += mayaLocator(m.label, m.planned.x, m.planned.y, m.planned.z, 'milestones_planned');
}

fs.writeFileSync(path.join(OUT_DIR, 'P01_visible_reference.ma'), refScene, 'utf8');
console.log(`\n✓ Wrote ${path.join(OUT_DIR, 'P01_visible_reference.ma')}  (${(refScene.length / 1024).toFixed(1)} KB)`);

// --- File 2: registered traced path -----------------------------------------

// Insert nulls at line breaks so the curve breaks into separate segments.
const tracedSegmented = [];
for (const p of transformed) {
    if (p.is_line_break && tracedSegmented.length > 0) {
        tracedSegmented.push({ x: null, y: null, z: null });
    }
    tracedSegmented.push(p);
}

let tracedScene = mayaHeader('P01_OnScreen_Visible_traced.ma');
tracedScene += '\n// --- Traced path (NURBS curves, one per continuous stroke) ---\n';
tracedScene += mayaTransformGroup('traced_path');
tracedScene += mayaNurbsCurveSegments('traced_path', tracedSegmented);

tracedScene += '\n// --- Traced path points (locators) ---\n';
tracedScene += mayaTransformGroup('traced_path_points');
transformed.forEach((p, i) => {
    tracedScene += mayaLocator(`tp_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'traced_path_points');
});

tracedScene += '\n// --- User-hit milestones (closest_draw_point_position from JSON) ---\n';
tracedScene += '// Same labels as P01_visible_reference.ma — the distance between the\n';
tracedScene += '// matching M-locators is the recorded per-milestone deviation (also stored\n';
tracedScene += '// in JSON reference_point_measurements[i].distance_mm).\n';
tracedScene += mayaTransformGroup('milestones_user_hit');
for (const m of runtimeMilestones) {
    tracedScene += mayaLocator(m.label, m.userHit.x, m.userHit.y, m.userHit.z, 'milestones_user_hit');
}

fs.writeFileSync(path.join(OUT_DIR, 'P01_OnScreen_Visible_traced.ma'), tracedScene, 'utf8');
console.log(`✓ Wrote ${path.join(OUT_DIR, 'P01_OnScreen_Visible_traced.ma')}  (${(tracedScene.length / 1024).toFixed(1)} KB)`);

console.log('\nOpen both in Maya (units = meters) and File→Import one into the other.');
console.log('M01..M{n} in milestones_planned (reference file) pair with M01..M{n} in');
console.log('milestones_user_hit (traced file). Distance between paired locators');
console.log('= per-milestone deviation in meters.');
