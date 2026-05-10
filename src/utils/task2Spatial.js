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

const smoothPathPreserveCorners = (points, iterations = 10, windowSize = 3, cornerCos = 0.85, cornerLookahead = 8) => {
    let cur = points.slice();
    const corners = new Array(points.length).fill(false);
    for (let i = 0; i < points.length; i++) {
        if (points[i].x === null) continue;
        const prev = Math.max(0, i - cornerLookahead);
        const next = Math.min(points.length - 1, i + cornerLookahead);
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

// Pipeline for the analytical reference:
//   1. Parse points in .txt row order (= path-walking order; verified)
//   2. Order-preserving voxel downsample
//   3. Smooth positions
//   4. Remove outliers using local-median filter
//      (a point that's far from the median of its order-neighbours is a
//       fly-away — works for floating points without flagging real corners,
//       which the median is robust to)
//   5. Re-compute arclength on the cleaned, smoothed, ordered points
//      ("compute IDs after smoothed and reconstructed")
const removeOutliersByLocalMedian = (points, windowSize = 6, distThresholdMeters = 0.008) => {
    if (points.length < 2 * windowSize + 1) return points.slice();
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const lo = Math.max(0, i - windowSize);
        const hi = Math.min(points.length - 1, i + windowSize);
        const xs = [], ys = [], zs = [];
        for (let j = lo; j <= hi; j++) {
            if (j === i) continue;
            xs.push(points[j].x); ys.push(points[j].y); zs.push(points[j].z);
        }
        xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); zs.sort((a, b) => a - b);
        const mx = xs[Math.floor(xs.length / 2)];
        const my = ys[Math.floor(ys.length / 2)];
        const mz = zs[Math.floor(zs.length / 2)];
        const dx = points[i].x - mx, dy = points[i].y - my, dz = points[i].z - mz;
        if (Math.hypot(dx, dy, dz) <= distThresholdMeters) out.push(points[i]);
    }
    return out;
};

// Analytical reference: ordered points + arclength using the .txt file's
// native row order, which IS the path-walking order for these data files
// (verified: median row-to-row distance 0.5mm). No nearest-neighbor sort,
// so the arclengths reflect true path traversal — distinct spheres get
// distinct arclength positions.
//
// Used by the Path Deviation Profile chart for X-axis arclength and
// milestone X positions. The visual / Maya polyline still comes from
// parseReferenceTxt (nearest-neighbor + smoothed for visual continuity).
export const parseReferenceTxtForAnalysis = (txt, options = {}) => {
    const {
        voxelMeters = 0.002,            // light voxel collapse to remove duplicate samples
        smoothIterations = 6,           // simple moving-average smoothing (no corner detection)
        smoothWindow = 3,               // moving-average half-window
        outlierWindow = 6,              // half-window for local-median outlier check
        outlierThresholdMeters = 0.008, // distance from local median above which a point is a fly-away
        strokeBreakMeters = 0.05,       // row-to-row distance above which a jump is treated as a stroke break
                                        // (excluded from arclength)
    } = options;
    if (!txt) return { points: [], arclength: [] };

    const raw = [];
    for (const line of txt.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith('index')) continue;
        const parts = t.split(',');
        if (parts.length < 4) continue;
        raw.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
    }

    // Order-preserving voxel downsample
    const downsampled = (() => {
        const out = [];
        let currentKey = null;
        let acc = null;
        const flush = () => {
            if (acc && acc.n > 0) out.push({ x: acc.sx / acc.n, y: acc.sy / acc.n, z: acc.sz / acc.n });
        };
        for (const p of raw) {
            const key = `${Math.floor(p.x / voxelMeters)},${Math.floor(p.y / voxelMeters)},${Math.floor(p.z / voxelMeters)}`;
            if (key !== currentKey) {
                flush();
                currentKey = key;
                acc = { sx: 0, sy: 0, sz: 0, n: 0 };
            }
            acc.sx += p.x; acc.sy += p.y; acc.sz += p.z; acc.n += 1;
        }
        flush();
        return out;
    })();

    // Smooth positions (simple moving average — order-preserving)
    let pts = downsampled;
    for (let iter = 0; iter < smoothIterations; iter++) {
        const next = [];
        for (let i = 0; i < pts.length; i++) {
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (let j = Math.max(0, i - smoothWindow); j <= Math.min(pts.length - 1, i + smoothWindow); j++) {
                sx += pts[j].x; sy += pts[j].y; sz += pts[j].z; n++;
            }
            next.push({ x: sx / n, y: sy / n, z: sz / n });
        }
        pts = next;
    }

    // Outlier removal — drop floating points that don't sit on the trace
    pts = removeOutliersByLocalMedian(pts, outlierWindow, outlierThresholdMeters);

    // Cumulative arclength, excluding jumps that look like stroke breaks
    const arclength = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const dz = pts[i].z - pts[i - 1].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < strokeBreakMeters) total += d;
        arclength.push(total);
    }

    return { points: pts, arclength };
};

export const parseReferenceTxt = (txt, options = {}) => {
    const {
        smooth = true,             // apply corner-preserving smoothing pass
        smoothIterations = 20,     // smoothing passes (higher = smoother straight runs)
        smoothWindow = 5,          // moving-average half-window in points
        smoothCornerCos = 0.85,    // dot threshold below which a point is treated as a corner (preserved). Lower = fewer corners detected = more smoothing.
        smoothCornerLookahead = 8, // how many points each side to look for the corner check. Wider = less noise-sensitive.
        removeOutliers = true,     // strip spike/fly-away points after sorting
        voxelMeters = 0.001,       // voxel-downsample edge length
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
    const downsampled = downsampleVoxel(pathRaw, voxelMeters);
    const sorted = sortNearestNeighbor(downsampled);
    const cleaned = removeOutliers ? removeOutlierSpikes(sorted) : sorted;
    const finalPath = smooth ? smoothPathPreserveCorners(cleaned, smoothIterations, smoothWindow, smoothCornerCos, smoothCornerLookahead) : cleaned;
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
// Optional arcWindow = [arcMin, arcMax]: only consider segments whose midpoint
// arclength falls inside this window. Used to enforce monotonic matching.
const projectOntoPolyline = (p, refPoints, refArclength, arcWindow = null) => {
    let bestSegIdx = -1;
    let bestT = 0;
    let bestFoot = null;
    let bestSq = Infinity;

    for (let i = 0; i < refPoints.length - 1; i++) {
        const a = refPoints[i];
        const b = refPoints[i + 1];
        if (a.x === null || b.x === null) continue;

        if (arcWindow) {
            const segMidArc = ((refArclength?.[i] ?? 0) + (refArclength?.[i + 1] ?? 0)) / 2;
            if (segMidArc < arcWindow[0] || segMidArc > arcWindow[1]) continue;
        }

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

// Detect whether the user traced the reference in reverse direction. If so,
// returns a flipped (refPath, refArclength) so that subsequent matching gets
// arclength = 0 at the user's start. Threshold: first user point must be
// > startDistMin away from refStart AND distance to refEnd must be < half the
// distance to refStart (clear preference for the "wrong" end).
export const detectAndFlipDirection = (transformedPoints, refPath, refArclength, options = {}) => {
    const { startDistMin = 0.10 } = options;
    const firstUser = transformedPoints.find((p) => !p.is_line_break);
    const refStart = refPath.find((p) => p.x !== null);
    const refEnd = [...refPath].reverse().find((p) => p.x !== null);
    if (!firstUser || !refStart || !refEnd) {
        return { refPath, refArclength, reversed: false };
    }
    const dStart = Math.hypot(firstUser.x - refStart.x, firstUser.y - refStart.y, firstUser.z - refStart.z);
    const dEnd = Math.hypot(firstUser.x - refEnd.x, firstUser.y - refEnd.y, firstUser.z - refEnd.z);
    const reversed = dStart > startDistMin && dEnd < dStart * 0.5;
    if (!reversed) {
        return { refPath, refArclength, reversed: false };
    }
    const flippedPath = [...refPath].reverse();
    const flippedArc = cumulativeArclength(flippedPath);
    return { refPath: flippedPath, refArclength: flippedArc, reversed: true };
};

// Compute per-point deviations against a reference polyline.
//
// - Walks transformedPoints in array order (= recording / timestamp order).
//   Callers should plot results in the returned order, not sorted by arclength,
//   so user backtracking / self-crossings render honestly as a back-and-forth
//   line on the chart.
// - Auto-flip direction: if the user's first traced point is much closer to
//   the reference's last point than its first, the reference is reversed so
//   arclength = 0 corresponds to where the user started.
// - Each user point projects to the GLOBALLY closest segment of the reference.
//   No monotonicity constraint — for a tracing task, the closest-segment is
//   the geometrically meaningful match even when the trace doubles back.
//
// Decomposition at the foot F (per point):
//   T (tangent)   = normalized segment direction
//   N (normal)    = user point's surface normal if available, else estimated
//   B (binormal)  = T × N    (in-surface, perpendicular to path direction)
//
//   dev_lateral  = (P - F) · B    in-surface sideways, signed
//   dev_perp     = (P - F) · N    off-surface, signed (+ outward / − inward)
//   dev_total    = |P - F|        3D Euclidean
//
// The returned array carries _reversed / _refPath / _refArclength so callers
// can use the same flipped reference for milestone arclengths and overlays.
export const computeDeviations = (transformedPoints, refPoints, refArclength, options = {}) => {
    const { autoFlipDirection = true } = options;

    let workingRef = refPoints;
    let workingArc = refArclength;
    let reversed = false;
    if (autoFlipDirection) {
        const flip = detectAndFlipDirection(transformedPoints, refPoints, refArclength);
        workingRef = flip.refPath;
        workingArc = flip.refArclength;
        reversed = flip.reversed;
    }

    const out = new Array(transformedPoints.length);
    const buildEmpty = () => ({
        seg_index: null, foot_x: null, foot_y: null, foot_z: null,
        arclength_m: null, dev_total_mm: null, dev_perp_mm: null, dev_lateral_mm: null,
    });

    for (let i = 0; i < transformedPoints.length; i++) {
        const p = transformedPoints[i];
        if (p.is_line_break) {
            out[i] = buildEmpty();
            continue;
        }
        const proj = projectOntoPolyline(p, workingRef, workingArc, null);
        if (proj.segIdx < 0) {
            out[i] = buildEmpty();
            continue;
        }

        const F = proj.foot;
        const dx = p.x - F.x, dy = p.y - F.y, dz = p.z - F.z;
        const distTotal = Math.sqrt(proj.distSq);
        const tlen = F.segLen;
        const tx = F.abx / tlen, ty = F.aby / tlen, tz = F.abz / tlen;

        let nx, ny, nz;
        if (p.nx !== null && p.ny !== null && p.nz !== null) {
            const nLen = Math.hypot(p.nx, p.ny, p.nz) || 1;
            nx = p.nx / nLen; ny = p.ny / nLen; nz = p.nz / nLen;
            const dotTN = nx * tx + ny * ty + nz * tz;
            nx -= dotTN * tx; ny -= dotTN * ty; nz -= dotTN * tz;
            const renorm = Math.hypot(nx, ny, nz) || 1;
            nx /= renorm; ny /= renorm; nz /= renorm;
        } else {
            let upx = 0, upy = 1, upz = 0;
            if (Math.abs(tx * upx + ty * upy + tz * upz) > 0.95) { upx = 0; upy = 0; upz = 1; }
            const dotTU = tx * upx + ty * upy + tz * upz;
            nx = upx - dotTU * tx; ny = upy - dotTU * ty; nz = upz - dotTU * tz;
            const renorm = Math.hypot(nx, ny, nz) || 1;
            nx /= renorm; ny /= renorm; nz /= renorm;
        }

        const bx = ty * nz - tz * ny;
        const by = tz * nx - tx * nz;
        const bz = tx * ny - ty * nx;

        const devPerp = dx * nx + dy * ny + dz * nz;
        const devLateral = dx * bx + dy * by + dz * bz;
        const arc = (workingArc?.[proj.segIdx] ?? 0) + proj.t * tlen;

        out[i] = {
            seg_index: proj.segIdx,
            foot_x: F.x, foot_y: F.y, foot_z: F.z,
            arclength_m: arc,
            dev_total_mm: distTotal * 1000,
            dev_perp_mm: devPerp * 1000,
            dev_lateral_mm: devLateral * 1000,
        };
    }

    out._reversed = reversed;
    out._refPath = workingRef;
    out._refArclength = workingArc;
    return out;
};

// Walk along the reference path; for each ref point, find the closest user
// (traced) point and compute the deviation vector. Returns one record per ref
// point in arclength order. The chart plots these directly — naturally
// monotonic along X, one Y per X, no sort or windowed-projection ambiguity.
//
// Decomposition at each ref point R_i:
//   T = local tangent of the reference polyline (averaged inbound+outbound)
//   N = user-point surface normal (orthogonalised vs T) if available
//   B = T × N
//   dev_lateral_mm = (U − R) · B   (in-surface, signed; the meaningful error)
//   dev_total_mm   = |U − R|
//
// Returns null fields for break points in the reference path.
export const computeRefPathDeviations = (refPath, refArclength, transformedUserPoints) => {
    const out = new Array(refPath.length);
    const validUser = transformedUserPoints.filter((p) => !p.is_line_break);

    const buildEmpty = (i) => ({
        arclength_m: refArclength?.[i] ?? 0,
        dev_lateral_mm: null, dev_total_mm: null,
        closest_user_idx: null, ref_x: null, ref_y: null, ref_z: null,
        user_x: null, user_y: null, user_z: null,
    });

    if (validUser.length === 0) {
        for (let i = 0; i < refPath.length; i++) out[i] = buildEmpty(i);
        return out;
    }

    for (let i = 0; i < refPath.length; i++) {
        const r = refPath[i];
        if (r.x === null) { out[i] = buildEmpty(i); continue; }

        // 3D nearest user point
        let bestIdx = 0, bestSq = Infinity;
        for (let j = 0; j < validUser.length; j++) {
            const u = validUser[j];
            const dx = r.x - u.x, dy = r.y - u.y, dz = r.z - u.z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestSq) { bestSq = d; bestIdx = j; }
        }
        const u = validUser[bestIdx];
        const dxU = u.x - r.x, dyU = u.y - r.y, dzU = u.z - r.z;
        const distTotal = Math.sqrt(bestSq);

        // Local tangent (average of inbound + outbound segment directions)
        let tx = 0, ty = 0, tz = 0;
        const prev = i > 0 ? refPath[i - 1] : null;
        const next = i < refPath.length - 1 ? refPath[i + 1] : null;
        if (prev && prev.x !== null) {
            const ix = r.x - prev.x, iy = r.y - prev.y, iz = r.z - prev.z;
            const il = Math.hypot(ix, iy, iz);
            if (il > 1e-9) { tx += ix / il; ty += iy / il; tz += iz / il; }
        }
        if (next && next.x !== null) {
            const ix = next.x - r.x, iy = next.y - r.y, iz = next.z - r.z;
            const il = Math.hypot(ix, iy, iz);
            if (il > 1e-9) { tx += ix / il; ty += iy / il; tz += iz / il; }
        }
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;

        // Normal: prefer user point's captured surface normal
        let nx, ny, nz;
        if (u.nx !== null && u.ny !== null && u.nz !== null) {
            const nL = Math.hypot(u.nx, u.ny, u.nz) || 1;
            nx = u.nx / nL; ny = u.ny / nL; nz = u.nz / nL;
            const dotTN = nx * tx + ny * ty + nz * tz;
            nx -= dotTN * tx; ny -= dotTN * ty; nz -= dotTN * tz;
            const renorm = Math.hypot(nx, ny, nz) || 1;
            nx /= renorm; ny /= renorm; nz /= renorm;
        } else {
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
        const devLateral = dxU * bx + dyU * by + dzU * bz;

        out[i] = {
            arclength_m: refArclength?.[i] ?? 0,
            dev_lateral_mm: devLateral * 1000,
            dev_total_mm: distTotal * 1000,
            closest_user_idx: bestIdx,
            ref_x: r.x, ref_y: r.y, ref_z: r.z,
            user_x: u.x, user_y: u.y, user_z: u.z,
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
