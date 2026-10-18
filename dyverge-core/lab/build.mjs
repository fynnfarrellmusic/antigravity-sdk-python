// Builds the Live Link Lab into one page you can publish or open.
//
//   node lab/build.mjs                    writes lab/dist/live-link-lab.html (the page as the platform wants it)
//   node lab/build.mjs out.html           writes it somewhere else
//   node lab/build.mjs out.html --wrapped adds the small document shell the platform adds, for opening it locally
//
// The script inside is not minified on purpose: the point of this page is that someone technical can
// read exactly what runs. It bundles the real src/livelink.ts, so what the lab runs is what the tests cover.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const wrapped = args.includes('--wrapped');
const out = args.find((a) => !a.startsWith('--')) ?? join(root, 'lab', 'dist', 'live-link-lab.html');

const bundle = await build({
  entryPoints: [join(root, 'lab', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'none',
  nodePaths: [join(root, 'node_modules')],
  logLevel: 'error',
});

// A script block must never be ended early by something inside it.
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'lab', 'lab.css'), 'utf8');
let html = readFileSync(join(root, 'lab', 'lab.html'), 'utf8')
  .replace('/*@@CSS@@*/', () => css)
  .replace('/*@@JS@@*/', () => js);

if (wrapped) {
  // What the platform wraps around a page, so the same file can be tried locally.
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>${html}</body></html>`;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB${wrapped ? ' (wrapped for local use)' : ''}`);
