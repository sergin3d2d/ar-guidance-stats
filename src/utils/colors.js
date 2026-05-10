/**
 * Returns a standard color HEX string based on the guidance method and condition.
 * 
 * Standards:
 * - HoloLens: Light Red (Visible), Red (Obstructed)
 * - Quest: Light Blue (Visible), Blue (Obstructed)
 * - Screen: Light Green (Visible), Green (Obstructed)
 * 
 * @param {string} method - e.g., 'Screen', 'HoloLens2', 'Quest3'
 * @param {string} condition - 'Visible' or 'Obstructed'
 * @returns {string} HEX Color
 */
export const getColor = (method, condition) => {
    const isObstructed = condition === 'Obstructed';
    const m = method ? method.toLowerCase() : '';

    if (m.includes('hololens')) {
        return isObstructed ? '#cc0000' : '#ff4d4d'; // Red, Light Red
    }
    if (m.includes('quest')) {
        return isObstructed ? '#0044ff' : '#00b2ff'; // Blue, Light Blue
    }
    if (m.includes('screen')) {
        return isObstructed ? '#008822' : '#33ff77'; // Green, Light Green
    }
    
    return '#888888'; // Fallback
};
