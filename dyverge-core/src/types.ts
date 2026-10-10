// Shared types for dYverge. These mirror the real app (dyverge-app.jsx) so the core
// and the app cannot drift apart: a drift test reads the app file.
// Device-local records only; nothing here is sent anywhere.

export type PersonId = string;

/** Check-In Gate zones. Skipped counts as steady. */
export type Zone = 'steady' | 'stretched' | 'flooded';

/** How a person says they receive messages. Each person picks their own. */
export type LensId = 'literal' | 'tone' | 'demand' | 'rejection' | 'silence' | 'time' | 'flood';

export const LENS_IDS: readonly LensId[] = [
  'literal',
  'tone',
  'demand',
  'rejection',
  'silence',
  'time',
  'flood',
];

/** The five Vibe Check regulation profiles. Never scored. */
export type VibeId = 'narrator' | 'lightning' | 'cocoon' | 'spark' | 'shapeshifter';

/** A family of regulation tools: one kind of approach, not one tool. */
export type Family = 'express' | 'move' | 'quiet' | 'shift' | 'choose';

/**
 * One profile per person, written only by its owner. Same shape as the app.
 * The app deliberately holds no diagnosis, so neither does the core.
 */
export interface CommunicationProfile {
  name: string;
  pronouns?: string;
  lenses: LensId[];
  receiveNote: string;
  /** What lands as care for them, from the app's fixed list. */
  care: string[];
  needToHear: string;
  write: string;
}

/** The fields an observation may propose changes to. Name and pronouns never. */
export type ProfileFieldKey = 'lenses' | 'receiveNote' | 'care' | 'needToHear' | 'write';

/** What the app's on-device gates return: null means nothing fired. */
export type GateOutcome = 'soft' | 'hard' | 'power' | null;

export interface Turn {
  id: string;
  author: PersonId;
  at: string;
  kind: 'text' | 'voice' | 'menu-choice';
  content: string;
  gate: GateOutcome;
}

export interface Sitdown {
  id: string;
  startedAt: string;
  endedAt?: string;
  purpose: 'before-send' | 'got' | 'repair' | 'talk-through';
  turns: Turn[];
  summary?: {
    heard: string;
    tryThis: string;
    /** ISO date per person who confirmed. */
    confirmedBy: Record<PersonId, string>;
  };
}

export interface Evidence {
  sitdownId: string;
  turnId: string;
  /** Who said the quoted words. */
  author: PersonId;
  quote: string;
}

/** Private to its owner. Descriptive, plain language, never a label. */
export interface Observation {
  id: string;
  owner: PersonId;
  field: ProfileFieldKey;
  /** Stable key for "the same pattern" across sessions. */
  patternKey: string;
  text: string;
  evidence: Evidence[];
  firstSeen: string;
  lastSeen: string;
}

export type ProposalState = 'pending' | 'accepted' | 'edited' | 'declined' | 'unsure';

export interface ProfileProposal {
  id: string;
  owner: PersonId;
  field: ProfileFieldKey;
  patternKey: string;
  proposedText: string;
  observationIds: string[];
  state: ProposalState;
  decidedAt?: string;
  /** Qualifying sessions when it was declined or left unsure, for re-proposal rules. */
  sessionsAtDecision?: number;
}
