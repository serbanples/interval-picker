import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({
  resolve(specifier, context, nextResolve) {
    // Pure helpers are tested against explicit defaults; external IO must never run.
    const boundary = {
      '../../../factory': 'let defaults; export function setTestBranchFactory(fn) { defaults = fn; } export const Factory = { getInstance() { if (!defaults) throw Error("Supply a test defaults factory"); return { getBzl() { return { AutomaticSetupSessionBzl: { getDefaultBranchSetup: () => defaults() } }; } }; } };',
      'fast-csv': 'export function parseString() { throw Error("CSV IO is outside this test"); }',
      'puppeteer': 'export {};',
      '../prettyPrint/html2pdf': 'export function getBrowser() { throw Error("Browser IO is outside this test"); }',
    }[specifier];
    if (boundary) return { url: 'data:text/javascript,' + encodeURIComponent(boundary), shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(fileURLToPath(url) + '.ts')) {
        return nextResolve(url.href + '.ts', context);
      }
    }
    return nextResolve(specifier, context);
  },
});
