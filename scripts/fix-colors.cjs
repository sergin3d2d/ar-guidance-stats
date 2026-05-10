const fs = require('fs');
const path = require('path');

const dir = 'd:/AI/DataAnalysis/ar-guidance-stats/src/components';
const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsx'))
    .map(f => path.join(dir, f));

// Add App.jsx
files.push('d:/AI/DataAnalysis/ar-guidance-stats/src/App.jsx');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace color: '#e0e0e0' with var(--text)
    content = content.replace(/color:\s*'#e0e0e0'/g, "color: 'var(--text)'");
    // Replace color: '#a0a0a0' with var(--text-dim)
    content = content.replace(/color:\s*'#a0a0a0'/g, "color: 'var(--text-dim)'");
    
    // Also check for background / border styles that might be dark or white rigid constants
    // e.g., border: '1px solid #333'
    content = content.replace(/#333/g, "var(--glass-border)");

    // Also update any remaining #fff that might be inline text color: '#fff'
    // ONLY inside style={{ ... }} tag structure to pre-emptively avoid layout breakdown
    content = content.replace(/(style={{[^}]+)color:\s*'#fff'([^}]+}})/g, "$1color: 'var(--text)'$2");

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Deep cleaned colors in ${path.basename(file)}`);
});
