import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('examples/angular11/src/assets', { recursive: true });
copyFileSync('dist/interval-picker.global.js', 'examples/angular11/src/assets/interval-picker.js');
console.log('Angular browser bundle copied.');
