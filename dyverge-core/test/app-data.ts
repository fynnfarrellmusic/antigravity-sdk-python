// Reads the real app file so the core is tested against what the app actually contains.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Family, VibeId } from '../src/types.ts';
import type { RegulationData, RegulationTool } from '../src/pathways.ts';

export const APP_PATH = fileURLToPath(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url));
export const appSource = (): string => readFileSync(APP_PATH, 'utf8');

/** A one-line object literal from the app, such as `const TOOL_FAMILY = { a: "x" };`. */
function literal<T>(name: string): T {
  const m = appSource().match(new RegExp(`^const ${name} = (\\{.*\\});$`, 'm'));
  if (!m?.[1]) throw new Error(`${name} not found as a one-line object in the app`);
  return JSON.parse(m[1].replace(/([{,]\s*)([A-Za-z0-9_]+):/g, '$1"$2":')) as T;
}

export const TOOL_FAMILY = literal<Record<string, Family>>('TOOL_FAMILY');
export const VIBE_FAMILY = literal<Record<VibeId, Family>>('VIBE_FAMILY');

/** Tool id, name and duration, read from the TOOLS block. */
export function appTools(): { id: string; name: string; time: string }[] {
  const out: { id: string; name: string; time: string }[] = [];
  for (const m of appSource().matchAll(/^ {2}(\w+): \{ name: "([^"]+)", time: "([^"]+)"/gm)) {
    out.push({ id: m[1]!, name: m[2]!, time: m[3]! });
  }
  return out;
}

/** Each Vibe profile's three tool ids, read from the PROFILES block. */
export function appVibeTools(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of appSource().matchAll(/^ {2}(\w+): \{ name: "[^"]+", lines: \[.*?\], tools: \[([^\]]*)\] \}/gm)) {
    out[m[1]!] = [...m[2]!.matchAll(/"(\w+)"/g)].map((x) => x[1]!);
  }
  return out;
}

export function appDefaultTools(): string[] {
  const m = appSource().match(/^const DEFAULT_TOOLS = \[(.*)\];$/m);
  return [...(m?.[1] ?? '').matchAll(/"(\w+)"/g)].map((x) => x[1]!);
}

export function regulationFromApp(): RegulationData {
  const tools: RegulationTool[] = appTools().map((t) => ({
    id: t.id,
    name: t.name,
    family: TOOL_FAMILY[t.id]!,
    blurb: t.time,
  }));
  return { tools, vibeFamily: VIBE_FAMILY };
}
