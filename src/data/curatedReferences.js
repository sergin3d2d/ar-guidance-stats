// Hand-curated reference paths imported from Maya via
// scripts/import_maya_reference.mjs. When a curated path exists for an
// obstruction it overrides the algorithmic parseReferenceTxt output —
// the curve has been manually cleaned (fly-aways removed, corners fixed).
//
// Drop a reference_<obstruction>.json into this folder and it is picked
// up automatically; no code change needed.

const modules = import.meta.glob('./reference_*.json', { eager: true });

const curated = {};
for (const mod of Object.values(modules)) {
    const data = mod.default || mod;
    if (data && data.obstruction && Array.isArray(data.points)) {
        curated[data.obstruction] = data.points.map(([x, y, z]) => ({ x, y, z }));
    }
}

// Returns an array of {x,y,z} for the obstruction, or null if no curated
// path has been provided (caller falls back to parseReferenceTxt).
export const getCuratedReferencePath = (obstruction) => {
    const key = String(obstruction).toLowerCase().includes('obstruct') ? 'obstruct' : 'visible';
    return curated[key] || null;
};

export const hasCuratedReference = (obstruction) => getCuratedReferencePath(obstruction) !== null;
