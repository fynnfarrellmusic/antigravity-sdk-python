// Inlines src/pathways.ts (types stripped) into the single-file app, between markers.
//
//   node scripts/build-app.ts           rewrite the block in dyverge-app.jsx
//   node scripts/build-app.ts --check   exit 1 if the block is out of date
//
// The app is one file by design, so it cannot import the core. This keeps the code the
// app runs identical to the code the tests cover. Edit src/pathways.ts, never the block.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/pathways.ts', import.meta.url));
const APP = fileURLToPath(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url));
const BEGIN = '// ── pathways:begin';
const END = '// ── pathways:end ──';

export function generatedBlock(): string {
  const stripped = stripTypeScriptTypes(readFileSync(SRC, 'utf8'), { mode: 'strip' });
  const body = stripped
    .replace(/^export (const|function|interface|type) /gm, '$1 ')
    .replace(/[ \t]+$/gm, '')
    .replace(/(\S) {2,}=/g, '$1 =')
    .replace(/(\S) {2,}(?=[)\],;{:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [
    `${BEGIN} (generated from dyverge-core/src/pathways.ts by scripts/build-app.ts. Edit that file, not this block.) ──`,
    body,
    END,
  ].join('\n');
}

export function applyToApp(app: string, block: string): string {
  const start = app.indexOf(BEGIN);
  const end = app.indexOf(END);
  if (start < 0 || end < 0 || end < start) throw new Error('pathways markers not found in the app');
  return app.slice(0, start) + block + app.slice(end + END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = readFileSync(APP, 'utf8');
  const next = applyToApp(app, generatedBlock());
  if (process.argv.includes('--check')) {
    if (next !== app) {
      console.error('dyverge-app.jsx is out of date. Run: node scripts/build-app.ts');
      process.exit(1);
    }
    console.log('dyverge-app.jsx pathways block is up to date.');
  } else {
    writeFileSync(APP, next);
    console.log('Updated the pathways block in dyverge-app.jsx.');
  }
}
