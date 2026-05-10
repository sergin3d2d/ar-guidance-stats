import fs from 'node:fs';
const { parseReferenceTxt, cumulativeArclength } = await import('../src/utils/task2Spatial.js');

const inspect = (label, file) => {
    console.log(`\n=== ${label} ===`);
    const txt = fs.readFileSync(file, 'utf8');

    // Try several configurations to compare
    const configs = [
        { label: 'default (current)', opts: {} },
        { label: 'no outlier removal', opts: { removeOutliers: false } },
        { label: 'no smoothing', opts: { smooth: false } },
        { label: 'no smooth, no outliers', opts: { smooth: false, removeOutliers: false } },
        { label: 'larger break threshold (50mm)', opts: { breakJumpMeters: 0.05 } },
    ];
    for (const cfg of configs) {
        const ref = parseReferenceTxt(txt, cfg.opts);
        const arc = cumulativeArclength(ref.path);
        const total = arc[arc.length - 1] || 0;
        const breaks = ref.path.filter(p => p.x === null).length;
        const pts = ref.path.filter(p => p.x !== null).length;
        // Count contiguous segments
        let segs = 0, inSeg = false;
        for (const p of ref.path) {
            if (p.x === null) inSeg = false;
            else if (!inSeg) { segs++; inSeg = true; }
        }
        console.log(`  ${cfg.label.padEnd(40)}: ${pts} pts in ${segs} segments (${breaks} breaks), arc=${total.toFixed(3)}m`);
    }
};

inspect('Visible.txt', 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt');
inspect('Obstruct.txt', 'D:/AI/DataAnalysis/ar-guidance-stats/Obstruct.txt');
