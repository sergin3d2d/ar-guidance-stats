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

// Each entry: which reference .txt to use, which traced JSON to register,
// and the prefix for the two .ma output files.
const EXPORTS = [
    {
        refTxt: 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt',
        tracedFile: 'ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json',
        outRefName: 'P01_visible_reference.ma',
        outTracedName: 'P01_OnScreen_Visible_traced.ma',
    },
    {
        refTxt: 'D:/AI/DataAnalysis/ar-guidance-stats/Obstruct.txt',
        tracedFile: 'ID1__Screen__Task2_Tracing__Obstruct_collect_20260320_103150.json',
        outRefName: 'P01_obstruct_reference.ma',
        outTracedName: 'P01_OnScreen_Obstruct_traced.ma',
    },
];

const {
    parseReferenceTxt,
    getSurfaceTransform,
    transformDrawPoints,
    transformPointToLocal,
    cumulativeArclength,
    computeDeviations,
    computeRefPathDeviations,
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

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const exportPair = ({ refTxt, tracedFile, outRefName, outTracedName }) => {
    console.log(`\n=== ${outRefName} + ${outTracedName} ===`);

    const refTxtContent = fs.readFileSync(refTxt, 'utf8');
    // Original smoothed reference (default options).
    const refSmooth = parseReferenceTxt(refTxtContent);
    const refSmoothArc = cumulativeArclength(refSmooth.path);

    const tracedJson = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, tracedFile), 'utf8'));
    const v = tracedJson.payload.find((p) => p.name === 'SurfaceDrawing')?.values;
    if (!v) throw new Error(`Traced file ${tracedFile} has no SurfaceDrawing payload`);

    const transform = getSurfaceTransform(v);
    const transformed = transformDrawPoints(v.all_draw_points, transform);
    const offsetMm = measureAlignmentOffset(transformed, refSmooth.path);

    // Run the dashboard's matching algorithm so the measurement lines we
    // draw in Maya are exactly what the chart used: time-ordered, monotonic
    // window match, with auto direction flip.
    const deviations = computeDeviations(transformed, refSmooth.path, refSmoothArc);

    // Reference-side measurements: for each ref point, find the closest user
    // point. This is the algorithm the Path Deviation Profile chart uses
    // (one Y per X = arclength).
    const refDeviations = computeRefPathDeviations(refSmooth.path, refSmoothArc, transformed);

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

    console.log(`  Reference path (smoothed): ${refSmooth.path.length} pts, arc ${refSmoothArc[refSmoothArc.length - 1].toFixed(3)} m`);
    console.log(`  Traced trial: ${tracedFile}`);
    console.log(`  ${v.all_draw_points.length} draw points → ${transformed.length} registered points`);
    console.log(`  Centroid offset from reference: ${offsetMm.toFixed(2)} mm (in surface-local frame)`);
    const validDevs = deviations.filter((d) => d && d.dev_lateral_mm !== null);
    console.log(`  Lateral deviation: n=${validDevs.length}  rms=${Math.sqrt(validDevs.reduce((s, d) => s + d.dev_lateral_mm ** 2, 0) / validDevs.length).toFixed(2)} mm  max|=${Math.max(...validDevs.map((d) => Math.abs(d.dev_lateral_mm))).toFixed(2)} mm`);

    // --- File 1: planned reference path -------------------------------------

    let refScene = mayaHeader(outRefName);

    refScene += '\n// --- Smoothed reference path (the original visual reference) ---\n';
    refScene += mayaTransformGroup('reference_path_smoothed');
    refScene += mayaNurbsCurveSegments('reference_path_smoothed', refSmooth.path);

    refScene += '\n// --- Smoothed reference path points (locators, walk order) ---\n';
    refScene += mayaTransformGroup('reference_path_points');
    refSmooth.path.forEach((p, i) => {
        if (p.x === null) return;
        refScene += mayaLocator(`pt_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'reference_path_points');
    });

    refScene += '\n// --- Planned milestones (from JSON reference_position) ---\n';
    refScene += mayaTransformGroup('milestones_planned');
    for (const m of runtimeMilestones) {
        refScene += mayaLocator(m.label, m.planned.x, m.planned.y, m.planned.z, 'milestones_planned');
    }

    fs.writeFileSync(path.join(OUT_DIR, outRefName), refScene, 'utf8');
    console.log(`\n  ✓ Wrote ${path.join(OUT_DIR, outRefName)}  (${(refScene.length / 1024).toFixed(1)} KB)`);

    // --- File 2: registered traced path -------------------------------------

    // Insert nulls at line breaks so the curve breaks into separate segments.
    const tracedSegmented = [];
    for (const p of transformed) {
        if (p.is_line_break && tracedSegmented.length > 0) {
            tracedSegmented.push({ x: null, y: null, z: null });
        }
        tracedSegmented.push(p);
    }

    let tracedScene = mayaHeader(outTracedName);
    tracedScene += '\n// --- Smoothed reference path (Maya measurement target) ---\n';
    tracedScene += mayaTransformGroup('reference_path_smoothed');
    tracedScene += mayaNurbsCurveSegments('reference_path_smoothed', refSmooth.path);

    tracedScene += '\n// --- Traced path (NURBS curves, one per continuous stroke) ---\n';
    tracedScene += mayaTransformGroup('traced_path');
    tracedScene += mayaNurbsCurveSegments('traced_path', tracedSegmented);

    tracedScene += '\n// --- Traced path points (locators) ---\n';
    tracedScene += mayaTransformGroup('traced_path_points');
    transformed.forEach((p, i) => {
        tracedScene += mayaLocator(`tp_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'traced_path_points');
    });

    // Measurement lines: one straight line per user point connecting the
    // user point to its matched foot on the smoothed reference path.
    // These are exactly what the dashboard chart computes.
    tracedScene += '\n// --- User-side measurements (each user point → closest ref segment) ---\n';
    tracedScene += '// One degree-1 NURBS curve per user point; length = total deviation.\n';
    tracedScene += '// One line per recorded draw point — same as before.\n';
    tracedScene += mayaTransformGroup('measurements_user_to_ref');
    let nMeas = 0;
    for (let i = 0; i < transformed.length; i++) {
        const p = transformed[i];
        const d = deviations[i];
        if (!d || d.foot_x === null || p.is_line_break) continue;
        const segs = [
            { x: p.x, y: p.y, z: p.z },
            { x: d.foot_x, y: d.foot_y, z: d.foot_z },
        ];
        tracedScene += mayaNurbsCurveSegments(`meas_user_${String(i).padStart(4, '0')}`, segs);
        nMeas += 1;
    }
    console.log(`  ${nMeas} user-to-ref measurement lines drawn`);

    tracedScene += '\n// --- Reference-side measurements (each ref point → closest user point) ---\n';
    tracedScene += '// One degree-1 NURBS curve per reference path point. This is exactly\n';
    tracedScene += '// the algorithm used by the Path Deviation Profile chart\n';
    tracedScene += '// (computeRefPathDeviations: walk the ref, find closest user point at each).\n';
    tracedScene += mayaTransformGroup('measurements_ref_to_user');
    let nRefMeas = 0;
    for (let i = 0; i < refSmooth.path.length; i++) {
        const r = refSmooth.path[i];
        const d = refDeviations[i];
        if (!r || r.x === null) continue;
        if (!d || d.user_x === null) continue;
        const segs = [
            { x: r.x, y: r.y, z: r.z },
            { x: d.user_x, y: d.user_y, z: d.user_z },
        ];
        tracedScene += mayaNurbsCurveSegments(`meas_ref_${String(i).padStart(4, '0')}`, segs);
        nRefMeas += 1;
    }
    console.log(`  ${nRefMeas} ref-to-user measurement lines drawn (chart algorithm)`);

    tracedScene += `\n// --- User-hit milestones (closest_draw_point_position from JSON) ---\n`;
    tracedScene += `// Same labels as ${outRefName} — the distance between the matching\n`;
    tracedScene += `// M-locators is the recorded per-milestone deviation (also stored in\n`;
    tracedScene += `// JSON reference_point_measurements[i].distance_mm).\n`;
    tracedScene += mayaTransformGroup('milestones_user_hit');
    for (const m of runtimeMilestones) {
        tracedScene += mayaLocator(m.label, m.userHit.x, m.userHit.y, m.userHit.z, 'milestones_user_hit');
    }

    fs.writeFileSync(path.join(OUT_DIR, outTracedName), tracedScene, 'utf8');
    console.log(`  ✓ Wrote ${path.join(OUT_DIR, outTracedName)}  (${(tracedScene.length / 1024).toFixed(1)} KB)`);
};

for (const cfg of EXPORTS) exportPair(cfg);

console.log('\nOpen each pair in Maya (units = meters) and File→Import one into the other.');
console.log('M01..M{n} in milestones_planned pair with M01..M{n} in milestones_user_hit.');
console.log('Distance between paired locators = per-milestone deviation in meters.');
