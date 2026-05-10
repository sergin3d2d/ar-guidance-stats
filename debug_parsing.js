
const { processExperimentData } = require('./src/utils/dataProcessor.js');
const fs = require('fs');

const id8Content = JSON.parse(fs.readFileSync('ID8__Quest_3__Task3_Reaching__Obstruct_collect_20260330_132850.json', 'utf8'));
const id9Content = JSON.parse(fs.readFileSync('ID9__Quest_3__Task3_Reaching__Obstruct_collect_20260331_151636.json', 'utf8'));

const processed = processExperimentData([id8Content, id9Content]);

console.log('Participants:', Object.keys(processed.participants));
console.log('ID8 Data:', JSON.stringify(processed.participants['8'], null, 2));
console.log('ID9 Data:', JSON.stringify(processed.participants['9'], null, 2));
