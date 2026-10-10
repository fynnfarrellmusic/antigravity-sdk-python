/**
 * Voice rules from the handoff: British English, plain language, never clinical,
 * never treating neurotypical behaviour as the default. This lints facilitator
 * and UI copy for the words and phrases the handoff bans.
 */

const BANNED_WORDS = [
  'journey',
  'unlock',
  'self-care',
  'tribe',
  'wellness warrior',
  'high-functioning',
  'special needs',
  'suffers from',
  'just',
  'simply',
  'symptoms',
];

const BANNED_PHRASES = [
  'crush it',
  "your partner's disorder",
  "your partner's pda",
  'trigger your partner',
];

export interface LintHit {
  term: string;
  index: number;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lintCopy(text: string): LintHit[] {
  const normalised = text.replaceAll('’', "'");
  const hits: LintHit[] = [];
  for (const term of [...BANNED_WORDS, ...BANNED_PHRASES]) {
    const re = new RegExp(`(?<![\\w-])${escape(term)}(?![\\w-])`, 'gi');
    for (const m of normalised.matchAll(re)) hits.push({ term, index: m.index ?? 0 });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Name rule: the Y sits uppercase mid-word, never at the start. */
export function nameRuleOk(name: string): boolean {
  return !/^Y/.test(name);
}
