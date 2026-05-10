
import { processExperimentData } from './src/utils/dataProcessor.js';
import fs from 'fs';
import path from 'path';

const dataDir = 'd:/AI/DataAnalysis/data/P08';
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f.includes('Task3'));

const fileContents = files.map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')));

const processed = processExperimentData(fileContents);

console.log('ID8 Task3 Data:');
console.log(JSON.stringify(processed.participants['8']['Task3'], null, 2));
