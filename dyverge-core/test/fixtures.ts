import type { CommunicationProfile, Observation } from '../src/types.ts';

export function profile(over: Partial<CommunicationProfile> = {}): CommunicationProfile {
  return {
    personId: 'a',
    name: 'Alex',
    locale: 'en-GB',
    languages: ['en'],
    neurotypes: [],
    receive: {
      directness: 'depends',
      contextStyle: 'depends',
      channel: 'either',
      needsReasonWithAsk: false,
      literalFirst: false,
      processingMinutes: 0,
    },
    needToHear: [],
    howIWrite: [],
    loveLanguages: {
      given: { words: 3, acts: 3, gifts: 3, time: 3, touch: 3 },
      received: { words: 3, acts: 3, gifts: 3, time: 3, touch: 3 },
    },
    worries: [],
    sensoryNeeds: [],
    connectionStyles: [],
    updatedAt: '2026-10-10T00:00:00Z',
    provenance: {},
    ...over,
  };
}

export function observation(over: Partial<Observation> & { sessions: string[] }): Observation {
  const { sessions, ...rest } = over;
  const owner = rest.owner ?? 'a';
  return {
    id: rest.id ?? 'o1',
    owner,
    field: 'receive',
    patternKey: 'pause-means-processing',
    text: 'A quiet pause after a direct question usually means processing.',
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
