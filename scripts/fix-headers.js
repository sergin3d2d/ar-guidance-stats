const fs = require('fs');
const path = require('path');

const files = [
    'd:/AI/DataAnalysis/ar-guidance-stats/src/components/Task1Analytics.jsx',
    'd:/AI/DataAnalysis/ar-guidance-stats/src/components/Task2Analytics.jsx',
    'd:/AI/DataAnalysis/ar-guidance-stats/src/components/Task3Analytics.jsx',
    'd:/AI/DataAnalysis/ar-guidance-stats/src/components/GlobalOverview.jsx'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    // 1. Replace color: '#fff' inside <h2 and <h3 style={...}
    content = content.replace(/(<h[23]\s+style={{[^}]+)color:\s*'#fff'([^}]+}})/g, "$1color: 'var(--text)'$2");
    
    // Also support labels: { color: '#fff' } in GlobalOverview plugins
    content = content.replace(/labels:\s*{\s*color:\s*'#fff'/g, "labels: { color: 'var(--text)'");
    
    // 2. Replace borderBottom: '1px solid #333' inside h2 with transparent border
    content = content.replace(/borderBottom:\s*'1px solid #333'/g, "borderBottom: '1px solid var(--glass-border)'");
    
    // 3. Replace color: '#00f2ff' in span inside h2 to var(--primary)
    content = content.replace(/(<h2[^>]*>.*?<span\s+style={{[^}]+)color:\s*'#00f2ff'([^}]+}})/g, "$1color: 'var(--primary)'$2");

    // 4. Update layoutTheme in all files if not updated
    content = content.replace(/font:\s*{\s*color:\s*'#a0a0a0'/g, "font: { color: '#314150'");
    content = content.replace(/font:\s*{\s*color:\s*'#fff'/g, "font: { color: '#314150'");

    // 5. Update checkbox label colors if not updated
    content = content.replace(/(<label[^>]*style={{[^}]+)color:\s*'#fff'([^}]+}})/g, "$1color: 'var(--text)'$2");
    
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${path.basename(file)}`);
});
