import fs from 'node:fs';
const { parseReferenceTxt, getSurfaceTransform, transformDrawPoints, transformPointToLocal, cumulativeArclength, detectAndFlipDirection } = await import('../src/utils/task2Spatial.js');

const visibleTxt = fs.readFileSync('D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt', 'utf8');
const obstructTxt = fs.readFileSync('D:/AI/DataAnalysis/ar-guidance-stats/Obstruct.txt', 'utf8');

const test = (label, txt, jsonPath) => {
    console.log(`\n=== ${label} ===`);
    const ref = parseReferenceTxt(txt);
    const arc = cumulativeArclength(ref.path);
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const v = json.payload.find(p => p.name === 'SurfaceDrawing').values;
    const transform = getSurfaceTransform(v);
    const transformed = transformDrawPoints(v.all_draw_points, transform);
    const flip = detectAndFlipDirection(transformed, ref.path, arc);
    const refPath = flip.refPath;
    const refDist = flip.refArclength;
    const totalArc = refDist[refDist.length - 1];
    console.log(`  reversed=${flip.reversed}  total_arc=${totalArc.toFixed(3)}m  polyline_pts=${refPath.length}`);

    const milestones = v.reference_point_measurements.map((m, i) => {
        const planned = transformPointToLocal({ position_x: m.reference_position_x, position_y: m.reference_position_y, position_z: m.reference_position_z }, transform);
        let bestIdx = 0, bestSq = Infinity;
        for (let j = 0; j < refPath.length; j++) {
            const r = refPath[j];
            if (r.x === null) continue;
            const d = (planned.x-r.x)**2 + (planned.y-r.y)**2 + (planned.z-r.z)**2;
            if (d < bestSq) { bestSq = d; bestIdx = j; }
        }
        return {
            id: `M${String(i+1).padStart(2,'0')}`, name: m.reference_name,
            pos: planned, arc: refDist[bestIdx], distToPolyMm: Math.sqrt(bestSq) * 1000,
            polyIdx: bestIdx,
            isClampedToStart: bestIdx === 0,
            isClampedToEnd: bestIdx >= refPath.length - 2,
        };
    }).sort((a,b) => a.arc - b.arc);

    console.log(`  Sorted by arclength:`);
    console.log(`  chart  sphereId  name             arc(m)  distToPoly(mm)  polyIdx/total  flag`);
    milestones.forEach((m, idx) => {
        const flag = m.isClampedToStart ? 'CLAMPED-START' : m.isClampedToEnd ? 'CLAMPED-END' : (m.distToPolyMm > 10 ? 'FAR-FROM-PATH' : 'ok');
        console.log(`  M${String(idx+1).padStart(2,'0')}    ${m.id}     ${(m.name||'').padEnd(13)}  ${m.arc.toFixed(3).padStart(6)}    ${m.distToPolyMm.toFixed(2).padStart(7)}     ${String(m.polyIdx).padStart(4)}/${refPath.length}        ${flag}`);
    });
};

test('Visible / OnScreen', visibleTxt, 'D:/AI/DataAnalysis/ar-guidance-stats/P01/ID1__Screen__Task2_Tracing__Visible_collect_20260320_103034.json');
test('Obstruct / OnScreen', obstructTxt, 'D:/AI/DataAnalysis/ar-guidance-stats/P01/ID1__Screen__Task2_Tracing__Obstruct_collect_20260320_103150.json');
