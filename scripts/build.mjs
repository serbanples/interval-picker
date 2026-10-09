import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'browser',
  target: 'es2018',
  legalComments: 'none',
  sourcemap: true,
  logLevel: 'info',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/index.ts', 'src/calendar.ts'],
    outdir: 'dist',
    format: 'esm',
    outExtension: { '.js': '.js' },
  }),
  build({
    ...shared,
    entryPoints: ['src/index.ts', 'src/calendar.ts'],
    outdir: 'dist',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
  }),
  build({
    ...shared,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/interval-picker.global.js',
    format: 'iife',
    globalName: 'IntervalPicker',
  }),
]);
