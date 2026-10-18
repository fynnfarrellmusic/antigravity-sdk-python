// Plural pathways: the app never offers one approach as the answer.
//
// This file is SELF-CONTAINED on purpose (type imports only, no runtime imports).
// The app is a single file, so scripts/build-app.ts strips the types from this file
// and inlines it between the markers in dyverge-app.jsx. The tests here are the tests
// for the code the app runs.
//
// The rule, enforced by assertPlural() on every set the builder returns:
//   - at least 3 pathways, from at least 3 different categories;
//   - if any regulation family is offered, at least 2 different families;
//   - always a person (support routes, someone you trust), never only tools;
//   - always a way to say "none of these fit";
//   - no pathway is presented as the answer, and none are ranked.
// "Plural" means different KINDS of help, not a longer list. A flooded person still
// gets few options (the interface removes options as capacity drops), but never one.

import type { Family, VibeId, Zone } from './types.ts';

export type Category =
  | Family
  | 'space'
  | 'words'
  | 'connection'
  | 'learn'
  | 'person'
  | 'professional';

export type Helped = 'yes' | 'some' | 'no' | 'unsure';

/** What a person said about a tool or pathway afterwards. Id is a tool id or a pathway id. */
export interface Outcome {
  id: string;
  helped: Helped;
}

export interface RegulationTool {
  id: string;
  name: string;
  family: Family;
  /** Short line shown with the tool, such as its duration. */
  blurb?: string;
}

export interface RegulationData {
  tools: readonly RegulationTool[];
  /** Which family each Vibe Check profile points to. */
  vibeFamily: Readonly<Record<VibeId, Family>>;
}

/** A communication-tool recommendation, as matcher.ts returns them. */
export interface CommunicationTip {
  toolId: string;
  title: string;
  summary: string;
  category: 'words' | 'connection' | 'space';
  because: string[];
}

export interface RouteLike {
  name: string;
  /** Phone number, short code or similar. */
  contact: string;
}

export interface PathwayOption {
  id: string;
  title: string;
  summary: string;
}

export interface Pathway {
  id: string;
  category: Category;
  title: string;
  summary: string;
  because: string[];
  /** Several concrete options inside the pathway. Never just one idea. */
  options: PathwayOption[];
}

export interface PathwaySet {
  /** Presented in a fixed order, never by preference, so order does not imply a best. */
  pathways: Pathway[];
  /** Always offered, never counted as a pathway. */
  noneFit: PathwayOption;
  notice: string;
  /** The regulation families offered, the one that leads first. Presentation order stays fixed. */
  regulationOrder: Family[];
}

export interface PathwayInput {
  zone: Zone;
  regulation: RegulationData;
  vibe?: VibeId | null;
  communication?: readonly CommunicationTip[];
  /** Reviewed support routes for the person's locale. Empty or absent means none are reviewed. */
  routes?: readonly RouteLike[];
  /** Restricted until clinical and legal review (access.ts, 'pathway-signposting'). */
  professionalEnabled: boolean;
  history?: readonly Outcome[];
  maxPathways?: number;
}

export const REGULATION_FAMILIES: readonly Family[] = ['express', 'move', 'quiet', 'shift', 'choose'];

/** Presentation order. Fixed, so the order carries no ranking. */
export const CATEGORY_ORDER: readonly Category[] = [
  'express',
  'move',
  'quiet',
  'shift',
  'choose',
  'space',
  'words',
  'connection',
  'learn',
  'person',
  'professional',
];

/**
 * When nothing else separates two families, offer the lowest-effort ones first.
 * Someone who is flooded with no Vibe profile should not be asked to do much.
 */
const FAMILY_TIE_ORDER: readonly Family[] = ['quiet', 'choose', 'express', 'shift', 'move'];

const FAMILY_COPY: Readonly<Record<Family, { title: string; summary: string }>> = {
  express: { title: 'Put it into words', summary: 'Say it, write it or record it.' },
  move: { title: 'Move it out', summary: 'Use your body: shake, walk, push.' },
  quiet: { title: 'Take some input away', summary: 'Less sound, less light, steady weight.' },
  shift: { title: 'Change what is coming in', summary: 'A song, a new room, a hum.' },
  choose: { title: 'Let your body choose', summary: 'A short menu, picked for today.' },
};

const NOTICE =
  'These are options, not a plan. What helps differs between people, and what helps you can change from day to day.';

export const NONE_FIT: PathwayOption = {
  id: 'none-fit',
  title: 'None of these feel right',
  summary: 'That is a real answer. Leave it for now, or come back when something else might.',
};

const PERSON_OPTIONS: readonly PathwayOption[] = [
  {
    id: 'someone-you-trust',
    title: 'Someone you trust',
    summary: 'A friend or family member you can tell how it is, even in a few words.',
  },
  {
    id: 'people-who-have-been-there',
    title: 'People who have been there',
    summary: 'Peer groups and communities of people who live with something similar.',
  },
];

/**
 * Kinds of professional help, offered together and never ranked. The list and the
 * wording need clinical review, and any claims need legal review, before real use.
 */
const PROFESSIONAL_OPTIONS: readonly PathwayOption[] = [
  {
    id: 'talk-to-a-doctor',
    title: 'Talk to a doctor',
    summary: 'A GP or doctor can look at the whole picture, including sleep, pain and medicines, and say what support exists.',
  },
  {
    id: 'relationship-support',
    title: 'Relationship or couples support',
    summary: 'Counselling or therapy for two, with someone who understands neurodivergence. Several approaches exist.',
  },
  {
    id: 'one-to-one-support',
    title: 'One-to-one support for you',
    summary: 'One-to-one therapy or counselling. Approaches differ, and finding a fit can take more than one try.',
  },
  {
    id: 'neurodivergence-support',
    title: 'Neurodivergence assessment or support',
    summary: 'If you want one. This app does not assess or diagnose.',
  },
];

const LEARN_OPTIONS: readonly PathwayOption[] = [
  {
    id: 'why-we-differ',
    title: 'Read why this happens',
    summary: 'A plain explanation of how two people can mean the same thing and miss each other.',
  },
  {
    id: 'read-each-others-profiles',
    title: 'Read each other’s profiles',
    summary: 'How each of you says you take things in, in your own words.',
  },
];

const OUTCOME_POINTS: Readonly<Record<Helped, number>> = { yes: 0.5, some: 0.25, no: -0.5, unsure: 0 };

/** Sum of what was said about an id, kept small so no history can erase an option. */
function outcomeScore(id: string, history: readonly Outcome[]): number {
  let n = 0;
  for (const o of history) if (o.id === id) n += OUTCOME_POINTS[o.helped];
  return Math.max(-1.5, Math.min(1.5, n));
}

interface Candidate {
  pathway: Pathway;
  score: number;
}

function familyCandidate(family: Family, input: PathwayInput, primary: Family | undefined): Candidate {
  const history = input.history ?? [];
  const tools = input.regulation.tools.filter((t) => t.family === family);
  const copy = FAMILY_COPY[family];
  const id = `family-${family}`;
  const toolScores = tools.reduce((n, t) => n + outcomeScore(t.id, history), 0);
  const score =
    (family === primary ? 3 : 1) + Math.max(-1.5, Math.min(1.5, toolScores + outcomeScore(id, history)));
  // Within a family, what helped comes first and what did not comes last. Nothing is dropped.
  const options = tools
    .map((t, i) => ({ t, i, s: outcomeScore(t.id, history) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ t }) => ({ id: t.id, title: t.name, summary: t.blurb ?? '' }));
  return {
    score,
    pathway: {
      id,
      category: family,
      title: copy.title,
      summary: copy.summary,
      because: [
        family === primary
          ? 'Your answers in Vibe Check pointed here.'
          : 'Some people find this helps when other things have not.',
      ],
      options,
    },
  };
}

function personPathway(input: PathwayInput): Pathway {
  const routes: PathwayOption[] = (input.routes ?? []).map((r) => ({
    id: `route-${r.name}`,
    title: r.name,
    summary: r.contact,
  }));
  return {
    id: 'person',
    category: 'person',
    title: 'A person',
    summary: 'You do not have to do this alone.',
    because: ['An app cannot sit with you. A person can.'],
    options: [...routes, ...PERSON_OPTIONS],
  };
}

/**
 * Builds a plural set of pathways for one person.
 * Throws if it cannot honour the plural rule, so a singular set is never returned.
 */
export function buildPathways(input: PathwayInput): PathwaySet {
  const flooded = input.zone === 'flooded';
  const history = input.history ?? [];
  const primary = input.vibe ? input.regulation.vibeFamily[input.vibe] : undefined;
  const professional = input.professionalEnabled && !flooded;

  // Regulation: always at least two different families. Primary first, then the best other.
  const familiesPresent = REGULATION_FAMILIES.filter((f) => input.regulation.tools.some((t) => t.family === f));
  const familyCands = familiesPresent.map((f) => familyCandidate(f, input, primary));
  const tieRank = (f: Family) => FAMILY_TIE_ORDER.indexOf(f);
  familyCands.sort(
    (a, b) => b.score - a.score || tieRank(a.pathway.category as Family) - tieRank(b.pathway.category as Family),
  );
  const chosenFamilies = familyCands.slice(0, 2);

  const mandatory: Pathway[] = [...chosenFamilies.map((c) => c.pathway), personPathway(input)];
  if (professional) {
    mandatory.push({
      id: 'professional',
      category: 'professional',
      title: 'Kinds of professional help',
      summary: 'Different kinds exist. You do not have to pick one, and you can try more than one.',
      because: ['A professional can look at the whole picture, which an app cannot.'],
      options: [...PROFESSIONAL_OPTIONS],
    });
  }

  // Everything else competes on fit. Flooded people get only space (the interface contracts).
  const optional: Candidate[] = [
    {
      score: 1 + outcomeScore('need-space', history),
      pathway: {
        id: 'need-space',
        category: 'space',
        title: 'Take some space',
        summary: 'Say you need it, and say when you will be back.',
        because: ['Stepping away with a time to return is not leaving.'],
        options: [
          {
            id: 'need-space',
            title: 'Need space',
            summary: 'Send "I\'ve hit my limit. Not gone, not angry. Back by ___."',
          },
        ],
      },
    },
  ];

  if (!flooded) {
    const bestByCategory = new Map<Category, Candidate>();
    for (const tip of input.communication ?? []) {
      const score = 1 + Math.min(3, tip.because.length) + outcomeScore(tip.toolId, history);
      const cand: Candidate = {
        score,
        pathway: {
          id: tip.toolId,
          category: tip.category,
          title: tip.title,
          summary: tip.summary,
          because: tip.because,
          options: [{ id: tip.toolId, title: tip.title, summary: tip.summary }],
        },
      };
      const cur = bestByCategory.get(tip.category);
      if (!cur || cand.score > cur.score) bestByCategory.set(tip.category, cand);
    }
    optional.push(...bestByCategory.values());
    optional.push({
      score: 0.5,
      pathway: {
        id: 'learn',
        category: 'learn',
        title: 'Understand what happened',
        summary: 'Sometimes knowing why it happens takes the heat out.',
        because: ['Seeing a clash as two ways of working, not one fault, can change how it feels.'],
        options: [...LEARN_OPTIONS],
      },
    });
  }

  // 'space' may come from either need-space or a communication tip. Keep the better one.
  const byCat = new Map<Category, Candidate>();
  for (const c of optional) {
    const cur = byCat.get(c.pathway.category);
    if (!cur || c.score > cur.score) byCat.set(c.pathway.category, c);
  }
  const room = Math.max(0, (input.maxPathways ?? 6) - mandatory.length);
  const extras = [...byCat.values()]
    .sort((a, b) => b.score - a.score || a.pathway.id.localeCompare(b.pathway.id))
    .slice(0, room)
    .map((c) => c.pathway);

  const pathways = [...mandatory, ...extras].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
  const set: PathwaySet = {
    pathways,
    noneFit: { ...NONE_FIT },
    notice: NOTICE,
    regulationOrder: chosenFamilies.map((c) => c.pathway.category as Family),
  };
  assertPlural(set);
  return set;
}

export const MIN_PATHWAYS = 3;
export const MIN_CATEGORIES = 3;

/** Throws unless the set is genuinely plural. */
export function assertPlural(set: PathwaySet): void {
  const cats = new Set(set.pathways.map((p) => p.category));
  if (set.pathways.length < MIN_PATHWAYS) {
    throw new Error(`Pathway set has ${set.pathways.length} pathways; at least ${MIN_PATHWAYS} are required.`);
  }
  if (cats.size < MIN_CATEGORIES) {
    throw new Error(`Pathway set spans ${cats.size} categories; at least ${MIN_CATEGORIES} are required.`);
  }
  const families = [...cats].filter((c) => (REGULATION_FAMILIES as readonly string[]).includes(c));
  if (families.length === 1) {
    throw new Error('Pathway set offers a single regulation family; at least two are required.');
  }
  if (!cats.has('person')) throw new Error('Pathway set has no person to turn to.');
  if (set.noneFit.id !== NONE_FIT.id) throw new Error('Pathway set has no way to say none of these fit.');
}

/**
 * Picks a short list of tool options for a small screen, taking from different
 * families in turn so even a short list is plural. Defaults to 2 from the leading
 * family and 1 from the next, which keeps Sanctuary at its usual three cards.
 */
export function pickRegulationTools(set: PathwaySet, counts: readonly number[] = [2, 1]): PathwayOption[] {
  const out: PathwayOption[] = [];
  set.regulationOrder.forEach((family, i) => {
    const pathway = set.pathways.find((p) => p.category === family);
    if (pathway) out.push(...pathway.options.slice(0, counts[i] ?? 0));
  });
  return out;
}
