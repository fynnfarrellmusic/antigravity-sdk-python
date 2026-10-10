import type {
  CommunicationProfile,
  LoveLanguage,
  PersonId,
  Zone,
} from './types.ts';

/**
 * Tool matching: which communication tools suit each person right now.
 *
 * Deterministic and explainable on purpose. Every recommendation carries the
 * plain-language reasons it fired, so it can be read, tested and run offline.
 * No numeric scores leave this module: ranking is internal.
 *
 * A tool "helps" one person (`forPerson`) and may read the other's profile,
 * but only what that person has chosen to share.
 */

export type Role = 'speaker' | 'listener';
export type Cost = 'low' | 'medium' | 'high';

export interface MatchContext {
  /** Who is about to speak, and who is listening. */
  speaker: CommunicationProfile;
  listener: CommunicationProfile;
  zones: Record<PersonId, Zone>;
}

export interface Tool {
  id: string;
  title: string;
  summary: string;
  cost: Cost;
  /** Regulation tools are the only ones offered when someone is flooded. */
  regulation: boolean;
  /** Works with no network. */
  offline: boolean;
  /** Reasons this tool fits `self` when talking with `other`. Empty means no fit. */
  fits: (self: CommunicationProfile, other: CommunicationProfile, role: Role) => string[];
}

export interface Recommendation {
  toolId: string;
  title: string;
  summary: string;
  because: string[];
}

export interface PersonRecommendations {
  personId: PersonId;
  /** Present when the person is flooded: no sit-down tools, regulation only. */
  flooded: boolean;
  tools: Recommendation[];
}

const LOVE_LABEL: Record<LoveLanguage, string> = {
  words: 'kind words',
  acts: 'things done for them',
  gifts: 'thoughtful gifts',
  time: 'undivided time',
  touch: 'physical closeness',
};

function topLoveLanguages(r: Record<LoveLanguage, number>): LoveLanguage[] {
  const entries = Object.entries(r) as [LoveLanguage, number][];
  const max = Math.max(...entries.map(([, v]) => v));
  return entries.filter(([, v]) => v === max).map(([k]) => k).sort();
}

function sharedWorries(p: CommunicationProfile) {
  return p.worries.filter((w) => w.shareWithPartner && w.whatHelps);
}

export const TOOLS: readonly Tool[] = [
  {
    id: 'breathing-orb',
    title: 'Breathe with the orb',
    summary: 'In for four, out for six. Nothing else to do.',
    cost: 'low',
    regulation: true,
    offline: true,
    fits: () => [], // offered by the flooded path, see matchTools
  },
  {
    id: 'need-space',
    title: 'Take some space',
    summary: 'Send "I\'ve hit my limit. Not gone, not angry. Back by ___." A return time is required.',
    cost: 'low',
    regulation: true,
    offline: true,
    fits: () => [],
  },
  {
    id: 'sensory-reset',
    title: 'Your own reset',
    summary: 'The thing your body already knows helps.',
    cost: 'low',
    regulation: true,
    offline: true,
    fits: (self) =>
      self.sensoryNeeds.length > 0
        ? [`You told us these help: ${self.sensoryNeeds.join(', ').replaceAll('-', ' ')}.`]
        : [],
  },
  {
    id: 'menu-replies',
    title: 'Tap a reply',
    summary: 'Choose from A, B or C instead of writing one.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, _o, role) => {
      const why: string[] = [];
      if (role === 'listener') why.push('Tapping costs less than writing when you are running low.');
      if (self.neurotypes.some((n) => n === 'adhd' || n === 'audhd' || n === 'autistic')) {
        why.push('You said replies are easier when the options are laid out.');
      }
      return why;
    },
  },
  {
    id: 'processing-pause',
    title: 'Pause before replying',
    summary: 'Take your time, with a time to come back.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, _o, role) =>
      role === 'listener' && self.receive.processingMinutes >= 10
        ? [`You need about ${self.receive.processingMinutes} minutes before a reply feels right.`]
        : [],
  },
  {
    id: 'written-first',
    title: 'Write it down first',
    summary: 'Put it in writing, then talk about it.',
    cost: 'medium',
    regulation: false,
    offline: true,
    fits: (self) =>
      self.receive.channel === 'written' ? ['You take things in best when you can read them first.'] : [],
  },
  {
    id: 'spoken-first',
    title: 'Say it out loud first',
    summary: 'Talk it through, then write it down if you want a record.',
    cost: 'medium',
    regulation: false,
    offline: true,
    fits: (self) =>
      self.receive.channel === 'spoken' ? ['You take things in best when you hear them.'] : [],
  },
  {
    id: 'say-it-plainly',
    title: 'Say it plainly, then say what you hope for',
    summary: 'The words mean what they say. Then add what you would like to happen.',
    cost: 'medium',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker' && other.receive.literalFirst
        ? [`${other.name} takes words at face value first, so plain words will land as you mean them.`]
        : [],
  },
  {
    id: 'reason-with-ask',
    title: 'Attach the reason',
    summary: 'A request with its reason costs less to answer.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker' && other.receive.needsReasonWithAsk
        ? [`${other.name} answers asks more easily when they know why.`]
        : [],
  },
  {
    id: 'say-how-it-is',
    title: 'Say how it is, not what to do',
    summary: '"I\'m hungry" leaves room to choose. "Make dinner" does not.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker' && other.neurotypes.includes('pda')
        ? [`${other.name} told us requests that sound like orders cost a lot to answer.`]
        : [],
  },
  {
    id: 'say-the-unsaid',
    title: 'Say the part you would normally leave out',
    summary: 'Spell out what you mean, including what you hope they will understand without being told.',
    cost: 'medium',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker' && self.receive.contextStyle === 'implied' && other.receive.contextStyle === 'explicit'
        ? [`You tend to let context carry meaning. ${other.name} prefers it said outright.`]
        : [],
  },
  {
    id: 'lead-with-intent',
    title: 'Lead with what you want to achieve',
    summary: 'Open with your aim, then be as direct as you like.',
    cost: 'medium',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker' && self.receive.directness === 'direct' && other.receive.directness === 'indirect'
        ? [`You like to be direct. ${other.name} takes a lot from how a thing is approached.`]
        : [],
  },
  {
    id: 'check-the-phrase',
    title: 'Check what a phrase means',
    summary: 'Idioms and tone do not always cross languages. Ask what it meant to them.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, other) => {
      const a = self.languages[0];
      const b = other.languages[0];
      return a && b && a !== b
        ? [`You mainly use different languages (${a} and ${b}), so a phrase can mean something different on each side.`]
        : [];
    },
  },
  {
    id: 'their-love-language',
    title: 'Show care the way they feel it',
    summary: 'Say it in the form they take in most.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, other, role) => {
      if (role !== 'speaker') return [];
      const given = topLoveLanguages(self.loveLanguages.given);
      const received = topLoveLanguages(other.loveLanguages.received);
      if (given.some((g) => received.includes(g))) return [];
      return [
        `You show care through ${given.map((g) => LOVE_LABEL[g]).join(' and ')}. ` +
          `${other.name} feels it most through ${received.map((r) => LOVE_LABEL[r]).join(' and ')}.`,
      ];
    },
  },
  {
    id: 'offer-what-helps',
    title: 'Offer what helps them',
    summary: 'In their own words.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self, other, role) =>
      role === 'speaker'
        ? sharedWorries(other).map((w) => `${other.name} said: "${w.whatHelps}"`)
        : [],
  },
  {
    id: 'side-by-side',
    title: 'Sit side by side',
    summary: 'Do something alongside each other, no eye contact needed.',
    cost: 'low',
    regulation: false,
    offline: true,
    fits: (self) =>
      self.connectionStyles.length > 0
        ? [`You told us ${self.connectionStyles.join(' and ').replaceAll('-', ' ')} helps you connect.`]
        : [],
  },
];

const COST_ORDER: Record<Cost, number> = { low: 0, medium: 1, high: 2 };

function recommend(
  self: CommunicationProfile,
  other: CommunicationProfile,
  role: Role,
  zone: Zone,
  maxTools: number,
): PersonRecommendations {
  const flooded = zone === 'flooded';
  const scored: { tool: Tool; because: string[] }[] = [];

  for (const tool of TOOLS) {
    // Capacity removes options; it never adds encouragement.
    if (flooded && !tool.regulation) continue;
    if (zone === 'stretched' && tool.cost === 'high') continue;
    const because = tool.fits(self, other, role);
    if (because.length > 0) scored.push({ tool, because });
  }

  if (flooded) {
    // Orb and space are always offered when flooded, ahead of personalised resets.
    for (const id of ['need-space', 'breathing-orb']) {
      const tool = TOOLS.find((t) => t.id === id)!;
      scored.push({ tool, because: ['Your body has hit its limit. Nothing else is needed from you right now.'] });
    }
  }

  scored.sort((a, b) => {
    if (flooded) {
      const fixed = ['need-space', 'breathing-orb'];
      const ai = fixed.indexOf(a.tool.id);
      const bi = fixed.indexOf(b.tool.id);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
    return (
      b.because.length - a.because.length ||
      COST_ORDER[a.tool.cost] - COST_ORDER[b.tool.cost] ||
      a.tool.id.localeCompare(b.tool.id)
    );
  });

  return {
    personId: self.personId,
    flooded,
    tools: scored.slice(0, maxTools).map(({ tool, because }) => ({
      toolId: tool.id,
      title: tool.title,
      summary: tool.summary,
      because,
    })),
  };
}

/**
 * Up to `maxTools` (default 3, as Vibe Check) tools for each person.
 * The speaker's tools read the listener's shared profile; the listener's read the speaker's.
 */
export function matchTools(ctx: MatchContext, maxTools = 3): [PersonRecommendations, PersonRecommendations] {
  const zoneOf = (p: CommunicationProfile): Zone => ctx.zones[p.personId] ?? 'steady';
  return [
    recommend(ctx.speaker, ctx.listener, 'speaker', zoneOf(ctx.speaker), maxTools),
    recommend(ctx.listener, ctx.speaker, 'listener', zoneOf(ctx.listener), maxTools),
  ];
}
