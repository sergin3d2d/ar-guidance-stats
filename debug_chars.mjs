
import fs from 'fs';

const id8Content = JSON.parse(fs.readFileSync('ID8__Quest_3__Task3_Reaching__Obstruct_collect_20260330_132850.json', 'utf8'));
const id9Content = JSON.parse(fs.readFileSync('ID9__Quest_3__Task3_Reaching__Obstruct_collect_20260331_151636.json', 'utf8'));

const s8 = id8Content.experiment_status;
const s9 = id9Content.experiment_status;

console.log('ID8 char codes:', s8.split('').slice(0, 10).map(c => c.charCodeAt(0)));
console.log('ID9 char codes:', s9.split('').slice(0, 10).map(c => c.charCodeAt(0)));
