
import { parseMetadata } from './src/utils/dataProcessor.js';

const cases = [
    "ID8  Quest 3  Task3.Reaching  Obstruct",
    "ID8  Quest 3  Task3.Reaching  Visible",
    "ID9  Quest 3  Task3.Reaching  Obstruct",
    "ID8  Screen  Task3.Reaching  Obstruct",
    "ID8  HoloLens 2  Task3.Reaching  Obstruct"
];

cases.forEach(c => {
    console.log(`Input: "${c}"`);
    console.log('Result:', parseMetadata(c));
    console.log('---');
});
