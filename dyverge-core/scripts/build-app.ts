// Inlines tested core modules (types stripped) into the single-file app, between markers.
//
//   node scripts/build-app.ts           rewrite the generated blocks in dyverge-app.jsx
//   node scripts/build-app.ts --check   exit 1 if any block is out of date
//
// The app is one file by design, so it cannot import the core. This keeps the code the
// app runs identical to the code the tests cover. Edit the src file, never the block.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

export interface Block {
  name: string;
  src: string;
}

export const BLOCKS: readonly Block[] = [
  { name: 'vault', src: 'src/vault.ts' },
  { name: 'people', src: 'src/people.ts' },
  { name: 'fieldnotes', src: 'src/fieldnotes.ts' },
  { name: 'gates', src: 'src/gates.ts' },
  { name: 'pathways', src: 'src/pathways.ts' },
];

const APP = fileURLToPath(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url));
const begin = (name: string) => `// ── ${name}:begin`;
const end = (name: string) => `// ── ${name}:end ──`;

export function generatedBlock(block: Block): string {
  const file = fileURLToPath(new URL(`../${block.src}`, import.meta.url));
  const stripped = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' });
  const body = stripped
    .replace(/^export (const|function|interface|type) /gm, '$1 ')
    .replace(/[ \t]+$/gm, '')
    .replace(/(\S) {2,}=/g, '$1 =')
    .replace(/(\S) {2,}(?=[)\],;{:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [
    `${begin(block.name)} (generated from dyverge-core/${block.src} by scripts/build-app.ts. Edit that file, not this block.) ──`,
    body,
    end(block.name),
  ].join('\n');
}

export function applyBlock(app: string, block: Block): string {
  const start = app.indexOf(begin(block.name));
  const stop = app.indexOf(end(block.name));
  if (start < 0 || stop < 0 || stop < start) throw new Error(`${block.name} markers not found in the app`);
  return app.slice(0, start) + generatedBlock(block) + app.slice(stop + end(block.name).length);
}

export function applyAll(app: string): string {
  return BLOCKS.reduce((text, block) => applyBlock(text, block), app);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = readFileSync(APP, 'utf8');
  const next = applyAll(app);
  if (process.argv.includes('--check')) {
    if (next !== app) {
      console.error('dyverge-app.jsx is out of date. Run: node scripts/build-app.ts');
      process.exit(1);
    }
    console.log('dyverge-app.jsx generated blocks are up to date.');
  } else {
    writeFileSync(APP, next);
    console.log(`Updated ${BLOCKS.map((b) => b.name).join(' and ')} in dyverge-app.jsx.`);
  }
}
