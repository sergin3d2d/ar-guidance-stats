// Reconstruct the Visible reference path from scratch.
// Goal: a single connected smoothed path with 13 corners.
//
// Pipeline:
//   1. Voxel downsample with 0.15 mm (averages near-duplicate samples)
//   2. Build spatial hash for fast neighbor queries
//   3. Find an endpoint (point with the fewest neighbors at the path scale)
//   4. Walk the path: greedy nearest-unvisited with momentum penalty for backtracking
//   5. Re-walk from the OTHER end to canonicalise direction and verify connectivity
//   6. Smooth preserving corners
//   7. Count corners; tune corner threshold until count == 13
//   8. Export to Maya for visual verification

import fs from 'node:fs';
import path from 'node:path';

const VISIBLE_TXT = 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt';
const OUT_DIR = 'D:/AI/DataAnalysis/ar-guidance-stats/maya_export';

// Note: median raw .txt spacing is 0.5 mm; tried 0.15 mm voxel but it didn't
// merge anything. Using 1.5 mm voxel instead (collapses near-duplicates while
// preserving path resolution).
const VOXEL_M = 0.0015;             // 1.5 mm voxel
const WALK_RADIUS_M = 0.005;        // 5 mm — normal next-point search radius
const BRIDGE_RADIUS_M = 0.080;      // 80 mm — when stuck, look this far to bridge a gap
const ENDPOINT_NEIGHBOR_R = 0.003;  // 3 mm — neighbor count radius for endpoint detection
const SMOOTH_ITER = 10;
const SMOOTH_WINDOW = 5;

// --- Load raw .txt -----------------------------------------------------------

const raw = [];
for (const line of fs.readFileSync(VISIBLE_TXT, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('index')) continue;
    const parts = t.split(',');
    if (parts.length < 4) continue;
    raw.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
}
console.log(`Raw .txt points: ${raw.length}`);

// --- Step 1: Voxel downsample (0.15mm) --------------------------------------

const voxels = new Map();
for (const p of raw) {
    const key = `${Math.floor(p.x / VOXEL_M)},${Math.floor(p.y / VOXEL_M)},${Math.floor(p.z / VOXEL_M)}`;
    if (!voxels.has(key)) voxels.set(key, { sx: 0, sy: 0, sz: 0, n: 0 });
    const v = voxels.get(key);
    v.sx += p.x; v.sy += p.y; v.sz += p.z; v.n += 1;
}
const points = [];
for (const v of voxels.values()) points.push({ x: v.sx / v.n, y: v.sy / v.n, z: v.sz / v.n });
console.log(`After voxel downsample (${VOXEL_M * 1000} mm): ${points.length} points`);

// --- Step 2: Spatial hash for fast neighbor queries -------------------------

const CELL = 0.005;  // 5 mm cells
const hash = new Map();
for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)},${Math.floor(p.z / CELL)}`;
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push(i);
}

const neighborsWithin = (idx, radius) => {
    const p = points[idx];
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL);
    const r = Math.ceil(radius / CELL);
    const out = [];
    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
                const key = `${cx + dx},${cy + dy},${cz + dz}`;
                if (!hash.has(key)) continue;
                for (const j of hash.get(key)) {
                    if (j === idx) continue;
                    const q = points[j];
                    const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
                    if (d <= radius) out.push({ idx: j, dist: d });
                }
            }
        }
    }
    return out;
};

// --- Step 3: Find a starting endpoint candidate ------------------------------
// True endpoints have neighbors mostly on ONE side. Outliers have NO neighbors.
// Score each point: prefer fewer-but-still-present neighbors AND asymmetric placement.

const scoreEndpoint = (idx) => {
    const ns = neighborsWithin(idx, ENDPOINT_NEIGHBOR_R);
    if (ns.length === 0) return -Infinity;  // outlier — skip
    if (ns.length > 8) return -Infinity;    // interior — too many neighbors
    const p = points[idx];
    // Compute centroid offset from p — true endpoint has all neighbors on one side
    let cx = 0, cy = 0, cz = 0;
    for (const n of ns) {
        cx += points[n.idx].x; cy += points[n.idx].y; cz += points[n.idx].z;
    }
    cx /= ns.length; cy /= ns.length; cz /= ns.length;
    return Math.hypot(cx - p.x, cy - p.y, cz - p.z) / ENDPOINT_NEIGHBOR_R;  // asymmetry score 0..1
};

let startCandidate = -1, bestEndpointScore = -Infinity;
for (let i = 0; i < points.length; i++) {
    const s = scoreEndpoint(i);
    if (s > bestEndpointScore) { bestEndpointScore = s; startCandidate = i; }
}
console.log(`Endpoint candidate idx ${startCandidate}: asymmetry score ${bestEndpointScore.toFixed(2)}, ` +
    `${neighborsWithin(startCandidate, ENDPOINT_NEIGHBOR_R).length} neighbors within ${ENDPOINT_NEIGHBOR_R * 1000}mm`);

// --- Step 4: Walk the path with momentum -----------------------------------

const walk = (startIdx) => {
    const order = [startIdx];
    const visited = new Uint8Array(points.length);
    visited[startIdx] = 1;
    let lastDir = null;
    const bridges = [];  // indices in `order` where a gap > WALK_RADIUS_M was bridged

    while (true) {
        const cur = order[order.length - 1];
        const curP = points[cur];

        // Try normal walk first; if no candidates, expand to bridge a gap.
        let cands = neighborsWithin(cur, WALK_RADIUS_M).filter((c) => !visited[c.idx]);
        let bridging = false;
        if (cands.length === 0) {
            cands = neighborsWithin(cur, BRIDGE_RADIUS_M).filter((c) => !visited[c.idx]);
            if (cands.length === 0) break;  // really done
            bridging = true;
        }

        let bestIdx = -1, bestScore = Infinity;
        for (const c of cands) {
            const cp = points[c.idx];
            const dx = cp.x - curP.x, dy = cp.y - curP.y, dz = cp.z - curP.z;
            const dn = c.dist;
            let score = dn;
            if (lastDir && dn > 0 && !bridging) {
                const dot = (dx * lastDir.x + dy * lastDir.y + dz * lastDir.z) / dn;
                if (dot < -0.3) score *= (1 + (-dot - 0.3) * 3);
            }
            if (score < bestScore) { bestScore = score; bestIdx = c.idx; }
        }
        if (bestIdx === -1) break;

        const np = points[bestIdx];
        const dx = np.x - curP.x, dy = np.y - curP.y, dz = np.z - curP.z;
        const dn = Math.hypot(dx, dy, dz);
        lastDir = { x: dx / dn, y: dy / dn, z: dz / dn };
        if (bridging) bridges.push({ at: order.length, span_mm: dn * 1000 });
        order.push(bestIdx);
        visited[bestIdx] = 1;
    }
    return { order, bridges };
};

const firstWalk = walk(startCandidate);
console.log(`First walk: ${firstWalk.order.length}/${points.length} points reached, ${firstWalk.bridges.length} gaps bridged`);
const trueEnd = firstWalk.order[firstWalk.order.length - 1];

const finalWalk = walk(trueEnd);
console.log(`Final walk: ${finalWalk.order.length}/${points.length} points reached, ${finalWalk.bridges.length} gaps bridged`);
console.log(`  Bridge spans (mm): ${finalWalk.bridges.map((b) => b.span_mm.toFixed(1)).join(', ') || 'none'}`);
const unvisited = points.length - finalWalk.order.length;
console.log(`Unreached points: ${unvisited} ${unvisited === 0 ? '✓ all points visited' : '✗ ' + unvisited + ' isolated'}`);

const ordered = finalWalk.order.map((i) => points[i]);
const bridgeIndicesInOrdered = new Set(finalWalk.bridges.map((b) => b.at));

// --- Step 6: Smooth preserving corners --------------------------------------

const smoothPreserveCorners = (pts, iterations, window, cornerCos, lookahead = 8) => {
    let cur = pts.slice();
    const corners = new Array(pts.length).fill(false);
    for (let i = 0; i < pts.length; i++) {
        if (i === 0 || i === pts.length - 1) { corners[i] = true; continue; }
        const prev = Math.max(0, i - lookahead);
        const next = Math.min(pts.length - 1, i + lookahead);
        const p = pts[i];
        const v1x = p.x - pts[prev].x, v1y = p.y - pts[prev].y, v1z = p.z - pts[prev].z;
        const v2x = pts[next].x - p.x, v2y = pts[next].y - p.y, v2z = pts[next].z - p.z;
        const l1 = Math.hypot(v1x, v1y, v1z);
        const l2 = Math.hypot(v2x, v2y, v2z);
        if (l1 > 0 && l2 > 0) {
            const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
            if (dot < cornerCos) corners[i] = true;
        }
    }
    for (let iter = 0; iter < iterations; iter++) {
        const next = [];
        for (let i = 0; i < cur.length; i++) {
            if (corners[i]) { next.push(cur[i]); continue; }
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (let j = Math.max(0, i - window); j <= Math.min(cur.length - 1, i + window); j++) {
                sx += cur[j].x; sy += cur[j].y; sz += cur[j].z; n++;
            }
            next.push({ x: sx / n, y: sy / n, z: sz / n });
        }
        cur = next;
    }
    return cur;
};

// --- Step 7: Count corners (cluster adjacent detections into a single corner)
// Skips points within `bridgeExclude` of a bridge transition (those produce
// spurious "corners" because the direction reverses across a stroke gap).
const countDistinctCorners = (pts, cornerCos, bridgeIdxs = new Set(), lookahead = 8, mergeWithin = 15, bridgeExclude = 12) => {
    const isCorner = new Array(pts.length).fill(false);
    const nearBridge = (i) => {
        for (const b of bridgeIdxs) {
            if (Math.abs(i - b) < bridgeExclude) return true;
        }
        return false;
    };
    for (let i = 1; i < pts.length - 1; i++) {
        if (nearBridge(i)) continue;
        const prev = Math.max(0, i - lookahead);
        const next = Math.min(pts.length - 1, i + lookahead);
        const p = pts[i];
        const v1x = p.x - pts[prev].x, v1y = p.y - pts[prev].y, v1z = p.z - pts[prev].z;
        const v2x = pts[next].x - p.x, v2y = pts[next].y - p.y, v2z = pts[next].z - p.z;
        const l1 = Math.hypot(v1x, v1y, v1z);
        const l2 = Math.hypot(v2x, v2y, v2z);
        if (l1 > 0 && l2 > 0) {
            const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
            if (dot < cornerCos) isCorner[i] = true;
        }
    }
    let count = 0;
    let lastCornerIdx = -Infinity;
    for (let i = 0; i < isCorner.length; i++) {
        if (!isCorner[i]) continue;
        if (i - lastCornerIdx > mergeWithin) count++;
        lastCornerIdx = i;
    }
    return { count, isCorner };
};

// Try smoothing with default settings, then tune cornerCos to hit target=13
let bestSmoothed = null, bestCount = -1, bestCos = null;
for (const cos of [0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
    const sm = smoothPreserveCorners(ordered, SMOOTH_ITER, SMOOTH_WINDOW, cos);
    const { count } = countDistinctCorners(sm, cos, bridgeIndicesInOrdered);
    console.log(`  cornerCos=${cos.toFixed(2)} → ${count} corners detected (excluding bridges)`);
    if (Math.abs(count - 13) < Math.abs(bestCount - 13) || bestCount === -1) {
        bestSmoothed = sm; bestCount = count; bestCos = cos;
    }
}
console.log(`\nBest match: cornerCos=${bestCos} → ${bestCount} corners (target 13)`);
const smoothed = bestSmoothed;
const { isCorner } = countDistinctCorners(smoothed, bestCos, bridgeIndicesInOrdered);

// --- Step 8: Export to Maya ------------------------------------------------

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

let scene = mayaHeader('P01_visible_reconstructed.ma');
scene += '\n// --- Walk-ordered smoothed path (NURBS curve) ---\n';
scene += mayaTransformGroup('reconstructed_path');
scene += mayaCurve('reconstructed_path_curve', smoothed);

scene += '\n// --- Path points as locators in walk order ---\n';
scene += '// pt_NNNN where NNNN is the position in the walk (0 = start endpoint).\n';
scene += mayaTransformGroup('reconstructed_points');
smoothed.forEach((p, i) => {
    scene += mayaLocator(`pt_${String(i).padStart(4, '0')}`, p.x, p.y, p.z, 'reconstructed_points');
});

scene += '\n// --- Detected corners (one locator each, in walk order) ---\n';
scene += mayaTransformGroup('detected_corners');
let cornerNum = 0;
let lastCornerI = -Infinity;
for (let i = 0; i < isCorner.length; i++) {
    if (!isCorner[i]) continue;
    if (i - lastCornerI > 15) {
        cornerNum++;
        scene += mayaLocator(`C${String(cornerNum).padStart(2, '0')}`, smoothed[i].x, smoothed[i].y, smoothed[i].z, 'detected_corners');
    }
    lastCornerI = i;
}

scene += '\n// --- Bridge transitions (where the walk closed a gap) ---\n';
scene += '// One locator per bridge, named B##_NNNNmm with the span size.\n';
scene += mayaTransformGroup('bridge_transitions');
finalWalk.bridges.forEach((b, i) => {
    const p = smoothed[b.at];
    if (!p) return;
    scene += mayaLocator(`B${String(i + 1).padStart(2, '0')}_${b.span_mm.toFixed(0)}mm`, p.x, p.y, p.z, 'bridge_transitions');
});

scene += '\n// --- Path endpoints ---\n';
scene += mayaTransformGroup('endpoints');
scene += mayaLocator('START', smoothed[0].x, smoothed[0].y, smoothed[0].z, 'endpoints');
scene += mayaLocator('END', smoothed[smoothed.length - 1].x, smoothed[smoothed.length - 1].y, smoothed[smoothed.length - 1].z, 'endpoints');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'P01_visible_reconstructed.ma'), scene, 'utf8');
console.log(`\n✓ Wrote ${path.join(OUT_DIR, 'P01_visible_reconstructed.ma')} (${(scene.length / 1024).toFixed(1)} KB)`);
console.log(`Path points: ${smoothed.length}, corners detected: ${bestCount}`);
