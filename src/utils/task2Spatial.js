// Shared spatial math for Task 2 (tracing).
// Used by both the dashboard chart and the data export so they agree.

const qConjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

const qMultiply = (a, b) => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

// Hamilton convention: rotates a world vector into the local frame whose
// orientation in world is given by q (i.e. q is the local-to-world rotation).
const rotateWorldToLocal = (p, q) => {
    const pq = { x: p.x, y: p.y, z: p.z, w: 0 };
    const qInv = qConjugate(q);
    const r = qMultiply(qMultiply(qInv, pq), q);
    return { x: r.x, y: r.y, z: r.z };
};

export const getSurfaceTransform = (values) => ({
    pos: {
        x: values?.surface_position_x || 0,
        y: values?.surface_position_y || 0,
        z: values?.surface_position_z || 0,
    },
    quat: {
        x: values?.surface_rotation_quat_x || 0,
        y: values?.surface_rotation_quat_y || 0,
        z: values?.surface_rotation_quat_z || 0,
        w: values?.surface_rotation_quat_w !== undefined ? values.surface_rotation_quat_w : 1,
    },
});

// Transform a single world point into surface-local frame.
export const transformPointToLocal = (point, transform) => {
    const rel = {
        x: (point.position_x || 0) - transform.pos.x,
        y: (point.position_y || 0) - transform.pos.y,
        z: (point.position_z || 0) - transform.pos.z,
    };
    return rotateWorldToLocal(rel, transform.quat);
};

// Transform an entire draw-points array. Carries through index, timestamp,
// is_line_break, and the per-point surface normal (also rotated into local).
export const transformDrawPoints = (points, transform) => {
    if (!points || points.length === 0) return [];
    return points.map((p) => {
        const local = transformPointToLocal(p, transform);
        const normalLocal = (p.normal_x !== undefined || p.normal_y !== undefined || p.normal_z !== undefined)
            ? rotateWorldToLocal({ x: p.normal_x || 0, y: p.normal_y || 0, z: p.normal_z || 0 }, transform.quat)
            : null;
        return {
            index: p.index,
            t: p.timestamp,
            is_line_break: !!p.is_line_break,
            x: local.x,
            y: local.y,
            z: local.z,
            nx: normalLocal?.x ?? null,
            ny: normalLocal?.y ?? null,
            nz: normalLocal?.z ?? null,
        };
    });
};

// --- Reference-path parsing & cleanup ---------------------------------------

const downsampleVoxel = (points, voxelSize = 0.001) => {
    const voxels = new Map();
    for (const p of points) {
        const key = `${Math.floor(p.x / voxelSize)},${Math.floor(p.y / voxelSize)},${Math.floor(p.z / voxelSize)}`;
        if (!voxels.has(key)) voxels.set(key, { sx: 0, sy: 0, sz: 0, n: 0 });
        const v = voxels.get(key);
        v.sx += p.x; v.sy += p.y; v.sz += p.z; v.n += 1;
    }
    const out = [];
    for (const v of voxels.values()) out.push({ x: v.sx / v.n, y: v.sy / v.n, z: v.sz / v.n });
    return out;
};

const sortNearestNeighbor = (points, threshold = 0.015) => {
    if (points.length <= 1) return points.slice();
    const findPath = (start) => {
        const sorted = [start];
        const remaining = points.filter((p) => p !== start);
        const thrSq = threshold * threshold;
        while (remaining.length > 0) {
            let last = sorted[sorted.length - 1];
            if (last && last.x === null && sorted.length >= 2) last = sorted[sorted.length - 2];
            let nearestIdx = 0;
            let minSq = Infinity;
            for (let i = 0; i < remaining.length; i++) {
                const dx = remaining[i].x - last.x;
                const dy = remaining[i].y - last.y;
                const dz = remaining[i].z - last.z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < minSq) { minSq = d; nearestIdx = i; }
            }
            if (minSq > thrSq) sorted.push({ x: null, y: null, z: null });
            sorted.push(remaining[nearestIdx]);
            remaining.splice(nearestIdx, 1);
        }
        return sorted;
    };
    const firstPass = findPath(points[0]);
    let validEnd = firstPass.length - 1;
    while (validEnd >= 0 && firstPass[validEnd].x === null) validEnd--;
    return findPath(firstPass[validEnd] || points[0]);
};

const smoothPathPreserveCorners = (points, iterations = 10, windowSize = 3, cornerCos = 0.95) => {
    let cur = points.slice();
    const corners = new Array(points.length).fill(false);
    for (let i = 0; i < points.length; i++) {
        if (points[i].x === null) continue;
        const prev = Math.max(0, i - 4);
        const next = Math.min(points.length - 1, i + 4);
        if (points[prev].x === null || points[next].x === null || i === 0 || i === points.length - 1) {
            corners[i] = true;
            continue;
        }
        const p = points[i];
        const v1 = { x: p.x - points[prev].x, y: p.y - points[prev].y, z: p.z - points[prev].z };
        const v2 = { x: points[next].x - p.x, y: points[next].y - p.y, z: points[next].z - p.z };
        const l1 = Math.hypot(v1.x, v1.y, v1.z);
        const l2 = Math.hypot(v2.x, v2.y, v2.z);
        if (l1 > 0.001 && l2 > 0.001) {
            const dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (l1 * l2);
            if (dot < cornerCos) corners[i] = true;
        }
    }
    for (let it = 0; it < iterations; it++) {
        const nxt = [];
        for (let i = 0; i < cur.length; i++) {
            const p = cur[i];
            if (p.x === null || corners[i]) { nxt.push(p); continue; }
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (let j = Math.max(0, i - windowSize); j <= Math.min(cur.length - 1, i + windowSize); j++) {
                if (cur[j].x !== null) { sx += cur[j].x; sy += cur[j].y; sz += cur[j].z; n++; }
            }
            nxt.push(n > 0 ? { x: sx / n, y: sy / n, z: sz / n } : p);
        }
        cur = nxt;
    }
    return cur;
};

// Remove spike/fly-away points: a point whose direction vectors to its
// neighbors nearly reverse (cos angle < cosThreshold) is a path that doubled
// back to a stray point. Iterate until stable.
//
// Default cosThreshold = -0.3 catches reversals > ~107°; preserves real
// corners up to that angle.
const removeOutlierSpikes = (points, cosThreshold = -0.3) => {
    let pts = points.slice();
    let changed = true;
    let iters = 0;
    while (changed && iters++ < 10) {
        changed = false;
        const keep = new Array(pts.length).fill(true);
        for (let i = 1; i < pts.length - 1; i++) {
            const a = pts[i - 1], b = pts[i], c = pts[i + 1];
            if (a.x === null || b.x === null || c.x === null) continue;
            const v1x = b.x - a.x, v1y = b.y - a.y, v1z = b.z - a.z;
            const v2x = c.x - b.x, v2y = c.y - b.y, v2z = c.z - b.z;
            const l1 = Math.hypot(v1x, v1y, v1z);
            const l2 = Math.hypot(v2x, v2y, v2z);
            if (l1 < 1e-9 || l2 < 1e-9) continue;
            const cos = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
            if (cos < cosThreshold) {
                keep[i] = false;
                changed = true;
            }
        }
        pts = pts.filter((_, i) => keep[i]);
    }
    return pts;
};

const clusterMilestones = (points, threshold = 0.003) => {
    const clusters = [];
    for (const p of points) {
        let added = false;
        for (const c of clusters) {
            const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
            if (d < threshold) {
                c.pts.push(p);
                c.x = c.pts.reduce((s, pt) => s + pt.x, 0) / c.pts.length;
                c.y = c.pts.reduce((s, pt) => s + pt.y, 0) / c.pts.length;
                c.z = c.pts.reduce((s, pt) => s + pt.z, 0) / c.pts.length;
                added = true;
                break;
            }
        }
        if (!added) clusters.push({ x: p.x, y: p.y, z: p.z, pts: [p] });
    }
    return clusters.map((c) => ({ x: c.x, y: c.y, z: c.z }));
};

export const parseReferenceTxt = (txt, options = {}) => {
    const {
        smooth = true,           // apply corner-preserving smoothing pass
        smoothCornerCos = 0.95,  // dot threshold below which a point is treated as a corner (preserved)
        removeOutliers = true,   // strip spike/fly-away points after sorting
    } = options;
    if (!txt) return { path: [], milestones: [] };
    const pathRaw = [];
    const milestonesRaw = [];
    for (const line of txt.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('index')) continue;
        const parts = trimmed.split(',');
        if (parts.length < 4) continue;
        const pt = { x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) };
        pathRaw.push(pt);
        if (parts.length >= 6 && (parts[5].includes('Second') || parts[5].includes('Red') || parts[4] === '1')) {
            milestonesRaw.push(pt);
        }
    }
    const downsampled = downsampleVoxel(pathRaw, 0.001);
    const sorted = sortNearestNeighbor(downsampled);
    const cleaned = removeOutliers ? removeOutlierSpikes(sorted) : sorted;
    const finalPath = smooth ? smoothPathPreserveCorners(cleaned, 10, 3, smoothCornerCos) : cleaned;
    const milestones = clusterMilestones(milestonesRaw, 0.003);
    return { path: finalPath, milestones };
};

// Cumulative arclength along a (possibly broken) path. Same length as input.
export const cumulativeArclength = (points) => {
    const out = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (a.x !== null && b.x !== null) {
            total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        }
        out.push(total);
    }
    return out;
};

// Project a single 3D point onto a reference polyline, returning the closest
// foot point and decomposed deviation. Uses true closest-segment projection,
// not closest-vertex (handles sparse references correctly).
//
// Decomposition at the foot F:
//   T (tangent)   = normalized segment direction
//   N (normal)    = user point's surface normal if available, else cross of
//                   adjacent ref segments (estimates surface normal from path)
//   B (binormal)  = T × N (in-surface, perpendicular to the path direction)
//
//   dev_perp     = (P - F) · N    → off-surface, signed (+ outward / − inward)
//   dev_lateral  = (P - F) · B    → in-surface sideways, signed
//   dev_total    = |P - F|        → 3D Euclidean
const projectOntoPolyline = (p, refPoints, refArclength) => {
    let bestSegIdx = -1;
    let bestT = 0;
    let bestFoot = null;
    let bestSq = Infinity;

    for (let i = 0; i < refPoints.length - 1; i++) {
        const a = refPoints[i];
        const b = refPoints[i + 1];
        if (a.x === null || b.x === null) continue;
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
        const segLenSq = abx * abx + aby * aby + abz * abz;
        if (segLenSq < 1e-12) continue;
        const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
        let t = (apx * abx + apy * aby + apz * abz) / segLenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const fx = a.x + t * abx, fy = a.y + t * aby, fz = a.z + t * abz;
        const dx = p.x - fx, dy = p.y - fy, dz = p.z - fz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestSq) {
            bestSq = d;
            bestSegIdx = i;
            bestT = t;
            bestFoot = { x: fx, y: fy, z: fz, abx, aby, abz, segLen: Math.sqrt(segLenSq) };
        }
    }
    return { segIdx: bestSegIdx, t: bestT, foot: bestFoot, distSq: bestSq };
};

// For each transformed user point, project onto the reference polyline.
// Returns per-point: arclength of foot (m), perp/lateral/total deviation (mm),
// and metadata for export.
export const computeDeviations = (transformedPoints, refPoints, refArclength) => {
    const out = new Array(transformedPoints.length);
    for (let i = 0; i < transformedPoints.length; i++) {
        const p = transformedPoints[i];
        if (p.is_line_break) {
            out[i] = {
                seg_index: null, arclength_m: null,
                dev_total_mm: null, dev_perp_mm: null, dev_lateral_mm: null,
            };
            continue;
        }

        const proj = projectOntoPolyline(p, refPoints, refArclength);
        if (proj.segIdx < 0) {
            out[i] = {
                seg_index: null, arclength_m: null,
                dev_total_mm: null, dev_perp_mm: null, dev_lateral_mm: null,
            };
            continue;
        }

        const F = proj.foot;
        const dx = p.x - F.x, dy = p.y - F.y, dz = p.z - F.z;
        const distTotal = Math.sqrt(proj.distSq);

        // Tangent
        const tlen = F.segLen;
        const tx = F.abx / tlen, ty = F.aby / tlen, tz = F.abz / tlen;

        // Normal at F: prefer user point's captured normal (it's on the surface);
        // fall back to estimating from the path itself (cross of adjacent tangents).
        let nx, ny, nz;
        if (p.nx !== null && p.ny !== null && p.nz !== null) {
            const nLen = Math.hypot(p.nx, p.ny, p.nz) || 1;
            nx = p.nx / nLen; ny = p.ny / nLen; nz = p.nz / nLen;
            // Orthogonalize against tangent so decomposition is clean.
            const dotTN = nx * tx + ny * ty + nz * tz;
            nx -= dotTN * tx; ny -= dotTN * ty; nz -= dotTN * tz;
            const renorm = Math.hypot(nx, ny, nz) || 1;
            nx /= renorm; ny /= renorm; nz /= renorm;
        } else {
            // Fallback: a perpendicular-to-tangent direction in the plane of
            // the largest deviation component. Usable, less anchored to reality.
            // Pick world-Y if not parallel to tangent, else world-Z.
            let upx = 0, upy = 1, upz = 0;
            if (Math.abs(tx * upx + ty * upy + tz * upz) > 0.95) { upx = 0; upy = 0; upz = 1; }
            const dotTU = tx * upx + ty * upy + tz * upz;
            nx = upx - dotTU * tx; ny = upy - dotTU * ty; nz = upz - dotTU * tz;
            const renorm = Math.hypot(nx, ny, nz) || 1;
            nx /= renorm; ny /= renorm; nz /= renorm;
        }

        // Binormal = T × N
        const bx = ty * nz - tz * ny;
        const by = tz * nx - tx * nz;
        const bz = tx * ny - ty * nx;

        const devPerp = dx * nx + dy * ny + dz * nz;
        const devLateral = dx * bx + dy * by + dz * bz;

        const arc = (refArclength?.[proj.segIdx] ?? 0) + proj.t * tlen;

        out[i] = {
            seg_index: proj.segIdx,
            arclength_m: arc,
            dev_total_mm: distTotal * 1000,
            dev_perp_mm: devPerp * 1000,
            dev_lateral_mm: devLateral * 1000,
        };
    }
    return out;
};

// Sanity check: warn if user-trace centroid is far from reference-path centroid
// in surface-local space. Returns the offset magnitude in millimeters.
export const measureAlignmentOffset = (transformedPoints, refPoints) => {
    const valid = transformedPoints.filter((p) => !p.is_line_break);
    const refValid = refPoints.filter((r) => r.x !== null);
    if (valid.length === 0 || refValid.length === 0) return null;
    const centroid = (pts) => pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
    const cu = centroid(valid);
    const cr = centroid(refValid);
    cu.x /= valid.length; cu.y /= valid.length; cu.z /= valid.length;
    cr.x /= refValid.length; cr.y /= refValid.length; cr.z /= refValid.length;
    return Math.hypot(cu.x - cr.x, cu.y - cr.y, cu.z - cr.z) * 1000;
};

// Normalize draw-point timestamps to "seconds since start". The recorder
// sometimes emits ns; auto-detect using inter-sample dt magnitude.
export const normalizeTimestampsToSeconds = (transformedPoints) => {
    if (transformedPoints.length < 2) {
        return transformedPoints.map((p) => ({ ...p, t_seconds: 0 }));
    }
    const sample = Math.abs((transformedPoints[5]?.t ?? transformedPoints[1].t) - transformedPoints[0].t);
    const isNs = sample > 1000;
    const scale = isNs ? 1e-9 : 1.0;
    const t0 = transformedPoints[0].t;
    return transformedPoints.map((p) => ({ ...p, t_seconds: (p.t - t0) * scale }));
};
