import type { CommunicationProfile, Observation } from '../src/types.ts';
import type { Person } from '../src/matcher.ts';

export function profile(over: Partial<CommunicationProfile> = {}): CommunicationProfile {
  return { name: 'Alex', lenses: [], receiveNote: '', care: [], needToHear: '', write: '', ...over };
}

export function person(id: string, over: Partial<CommunicationProfile> = {}): Person {
  return { id, profile: profile({ name: id === 'a' ? 'Alex' : 'Bo', ...over }) };
}

export function observation(over: Partial<Observation> & { sessions: string[] }): Observation {
  const { sessions, ...rest } = over;
  const owner = rest.owner ?? 'a';
  return {
    id: rest.id ?? 'o1',
    owner,
    field: 'lenses',
    patternKey: 'time-before-answering',
    text: 'A quiet pause after a direct question usually means they are processing.',
    evidence: sessions.map((s, i) => ({
      sitdownId: s,
      turnId: `t${i}`,
      author: owner,
      quote: 'Give me a minute.',
    })),
    firstSeen: '2026-10-01T00:00:00Z',
    lastSeen: '2026-10-10T00:00:00Z',
    ...rest,
  };
}
