import type { CommunicationProfile, PersonId, Zone } from './types.ts';

/**
 * Communication tools: what to try saying or doing, given each person's own profile.
 *
 * Deterministic and explainable on purpose. Every recommendation carries the
 * plain-language reasons it fired, so it can be read, tested and run offline.
 * Reasons only ever restate what the person wrote in their own profile. No
 * numeric scores leave this module.
 *
 * This is one input to the pathway builder (pathways.ts). It never decides alone:
 * a set of tools is not a plan.
 */

export type Role = 'speaker' | 'listener';
export type ToolCategory = 'words' | 'connection' | 'space';

export interface Person {
  id: PersonId;
  profile: CommunicationProfile;
}

export interface MatchContext {
  speaker: Person;
  listener: Person;
  zones: Record<PersonId, Zone>;
}

export interface Tool {
  id: string;
  title: string;
  summary: string;
  category: ToolCategory;
  /** Reasons this tool fits `self` when talking with `other`. Empty means no fit. */
  fits: (self: CommunicationProfile, other: CommunicationProfile, role: Role, zone: Zone) => string[];
}

export interface Recommendation {
  toolId: string;
  title: string;
  summary: string;
  category: ToolCategory;
  because: string[];
}

export interface PersonRecommendations {
  personId: PersonId;
  /** Flooded people get no communication tools: the interface removes options as capacity drops. */
  flooded: boolean;
  tools: Recommendation[];
}

const SIDE_BY_SIDE = 'Time side by side, each doing our own thing';

export const TOOLS: readonly Tool[] = [
  {
    id: 'say-it-plainly',
    title: 'Say it plainly, then say what you hope for',
    summary: 'The words mean what they say. Then add what you would like to happen.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('literal')
        ? [`${o.name} says they take words at face value, so hints may pass them by.`]
        : [],
  },
  {
    id: 'say-how-it-is',
    title: 'Say how it is, not what to do',
    summary: '"I\'m hungry" leaves room to choose. "Make dinner" does not.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('demand')
        ? [`${o.name} says being asked to do things can feel like pressure.`]
        : [],
  },
  {
    id: 'name-the-tone',
    title: 'Say how you mean it',
    summary: 'Tone does not travel in text. Say it: "I\'m saying this calmly."',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('tone')
        ? [`${o.name} says they read tone more than words.`]
        : [],
  },
  {
    id: 'say-what-it-isnt',
    title: 'Say what this is not',
    summary: 'Not anger, and not a verdict on them. Say so first.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('rejection')
        ? [`${o.name} says they can hear criticism that is not there.`]
        : [],
  },
  {
    id: 'keep-it-short',
    title: 'One thing at a time',
    summary: 'One point per message, and say when there is more to come.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('flood')
        ? [`${o.name} says too much at once floods them.`]
        : [],
  },
  {
    id: 'use-their-words',
    title: 'Use what they said they need to hear',
    summary: 'In their own words.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.needToHear.trim() ? [`${o.name} wrote: "${o.needToHear.trim()}"`] : [],
  },
  {
    id: 'read-how-they-write',
    title: 'Read their replies the way they write them',
    summary: 'A short reply may not mean what it seems.',
    category: 'words',
    fits: (_s, o, role) =>
      role === 'speaker' && o.write.trim() ? [`${o.name} wrote: "${o.write.trim()}"`] : [],
  },
  {
    id: 'menu-replies',
    title: 'Tap a letter',
    summary: 'Choose A, B or C instead of writing a reply.',
    category: 'words',
    fits: (s, _o, role, zone) => {
      const why: string[] = [];
      if (role !== 'listener') return why;
      if (zone !== 'steady') why.push('Tapping a letter costs less than writing when you are running low.');
      if (s.lenses.includes('flood')) why.push('You said too much at once floods you. A letter is enough.');
      return why;
    },
  },
  {
    id: 'give-a-return-time',
    title: 'Say when you will be back',
    summary: 'A time means nobody is left guessing.',
    category: 'connection',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('silence')
        ? [`Quiet makes ${o.name} worry, they say.`]
        : [],
  },
  {
    id: 'show-care-their-way',
    title: 'Show care the way they feel it',
    summary: 'Say it in the form they take in most.',
    category: 'connection',
    fits: (_s, o, role) =>
      role === 'speaker' && o.care.length > 0
        ? [`${o.name} says care lands as: ${o.care.join('; ').toLowerCase()}.`]
        : [],
  },
  {
    id: 'side-by-side',
    title: 'Sit side by side',
    summary: 'Do something alongside each other. No eye contact needed.',
    category: 'connection',
    fits: (s, o) => {
      const why: string[] = [];
      if (s.care.includes(SIDE_BY_SIDE)) why.push('You said time side by side lands as care.');
      if (o.care.includes(SIDE_BY_SIDE)) why.push(`${o.name} says time side by side lands as care.`);
      return why;
    },
  },
  {
    id: 'no-rush',
    title: 'Say there is no rush',
    summary: 'Room to answer in their own time.',
    category: 'space',
    fits: (_s, o, role) =>
      role === 'speaker' && o.lenses.includes('time')
        ? [`${o.name} says they need time before they answer.`]
        : [],
  },
  {
    id: 'take-your-time',
    title: 'Take your time, with a time to come back',
    summary: 'You can answer later. Say when.',
    category: 'space',
    fits: (s, _o, role) =>
      role === 'listener' && s.lenses.includes('time') ? ['You said you need time before you answer.'] : [],
  },
];

function recommend(
  self: Person,
  other: Person,
  role: Role,
  zone: Zone,
  maxTools: number,
): PersonRecommendations {
  const flooded = zone === 'flooded';
  const found: Recommendation[] = [];

  if (!flooded) {
    for (const tool of TOOLS) {
      const because = tool.fits(self.profile, other.profile, role, zone);
      if (because.length > 0) {
        found.push({ toolId: tool.id, title: tool.title, summary: tool.summary, category: tool.category, because });
      }
    }
    found.sort((a, b) => b.because.length - a.because.length || a.toolId.localeCompare(b.toolId));
  }

  return { personId: self.id, flooded, tools: found.slice(0, maxTools) };
}

/**
 * Communication tools for each person. The speaker's read the listener's profile
 * and the listener's read the speaker's. Pass a large `maxTools` to get every fit,
 * which is what the pathway builder does.
 */
export function matchTools(ctx: MatchContext, maxTools = 3): [PersonRecommendations, PersonRecommendations] {
  const zoneOf = (p: Person): Zone => ctx.zones[p.id] ?? 'steady';
  return [
    recommend(ctx.speaker, ctx.listener, 'speaker', zoneOf(ctx.speaker), maxTools),
    recommend(ctx.listener, ctx.speaker, 'listener', zoneOf(ctx.listener), maxTools),
  ];
}
