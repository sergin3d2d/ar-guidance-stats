import fs from 'node:fs';

const check = (label, file) => {
    console.log(`\n=== ${label} ===`);
    const txt = fs.readFileSync(file, 'utf8');
    const points = [];
    for (const line of txt.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith('index')) continue;
        const parts = t.split(',');
        if (parts.length < 4) continue;
        points.push({
            idx: parseInt(parts[0], 10),
            x: parseFloat(parts[1]),
            y: parseFloat(parts[2]),
            z: parseFloat(parts[3]),
            color: parseInt(parts[4], 10),
        });
    }
    console.log(`Total points: ${points.length}`);
    console.log(`First idx: ${points[0].idx}, last idx: ${points[points.length-1].idx}`);

    // Distance between consecutive points (in .txt order)
    const dists = [];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i-1].x;
        const dy = points[i].y - points[i-1].y;
        const dz = points[i].z - points[i-1].z;
        dists.push(Math.sqrt(dx*dx + dy*dy + dz*dz));
    }
    const sorted = dists.slice().sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    const max = Math.max(...dists);
    const above5cm = dists.filter(d => d > 0.05).length;
    const above1cm = dists.filter(d => d > 0.01).length;
    console.log(`Inter-point distance (in .txt row order): median=${(median*1000).toFixed(2)}mm  max=${(max*1000).toFixed(2)}mm`);
    console.log(`  Jumps >1cm: ${above1cm} (${(above1cm/dists.length*100).toFixed(1)}%)`);
    console.log(`  Jumps >5cm: ${above5cm} (${(above5cm/dists.length*100).toFixed(1)}%)`);
    console.log(`  → If .txt is in path order, jumps would be small (sub-mm). If scan order, frequent large jumps.`);

    // Show first 10 inter-point distances and 10 random middle ones
    console.log('First 10 jumps:', dists.slice(0, 10).map(d => (d*1000).toFixed(2)+'mm').join(' '));
    console.log('Mid 10 jumps:', dists.slice(Math.floor(dists.length/2), Math.floor(dists.length/2)+10).map(d => (d*1000).toFixed(2)+'mm').join(' '));
};

check('Visible.txt', 'D:/AI/DataAnalysis/ar-guidance-stats/Visible.txt');
check('Obstruct.txt', 'D:/AI/DataAnalysis/ar-guidance-stats/Obstruct.txt');
