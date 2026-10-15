// Marks dist/esm as an ES module package so Node/Vite treat the .js files as ESM.
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../dist/esm/package.json', import.meta.url), JSON.stringify({ type: 'module' }) + '\n');
