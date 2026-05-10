
import { parseMetadata } from './src/utils/dataProcessor.js';
import fs from 'fs';

const id8Content = JSON.parse(fs.readFileSync('ID8__Quest_3__Task3_Reaching__Obstruct_collect_20260330_132850.json', 'utf8'));
const id9Content = JSON.parse(fs.readFileSync('ID9__Quest_3__Task3_Reaching__Obstruct_collect_20260331_151636.json', 'utf8'));

console.log('ID8 experiment_status:', JSON.stringify(id8Content.experiment_status));
console.log('ID9 experiment_status:', JSON.stringify(id9Content.experiment_status));

const meta8 = parseMetadata(id8Content.experiment_status);
const meta9 = parseMetadata(id9Content.experiment_status);

console.log('ID8 Meta:', meta8);
console.log('ID9 Meta:', meta9);

const parts9 = id9Content.experiment_status.trim().split(/\s+/);
console.log('ID9 Parts:', parts9);
