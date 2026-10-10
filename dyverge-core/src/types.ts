// Shared types for dYverge. Device-local records only; nothing here is sent anywhere.

export type PersonId = string;

/** Check-In Gate zones. Skipped counts as steady. */
export type Zone = 'steady' | 'stretched' | 'flooded';

/** Only ever what the person selected themselves. Never inferred. */
export type Neurotype =
  | 'autistic'
  | 'adhd'
  | 'audhd'
  | 'c-ptsd'
  | 'pda'
  | 'neurotypical'
  | 'unsure';

export type LoveLanguage = 'words' | 'acts' | 'gifts' | 'time' | 'touch';
export type Rating = 1 | 2 | 3 | 4 | 5;
export type Channel = 'spoken' | 'written' | 'voice-note' | 'either';
export type Directness = 'direct' | 'indirect' | 'depends';
export type ContextStyle = 'explicit' | 'implied' | 'depends';
export type SensoryNeed =
  | 'deep-pressure'
  | 'low-light'
  | 'quiet'
  | 'movement'
  | 'fidget'
  | 'cold';
export type ConnectionStyle = 'parallel-play' | 'body-doubling';

export interface Worry {
  id: string;
  /** In the person's own words. */
  text: string;
  whatHelps?: string;
  /** Only worries marked true are ever visible to the partner or used to match tools for them. */
  shareWithPartner: boolean;
}

/**
 * One profile per person. Written only by its owner: every field is either
 * typed by them or accepted/edited from a proposal they chose to act on.
 */
export interface CommunicationProfile {
  personId: PersonId;
  name: string;
  pronouns?: string;
  /** BCP-47, e.g. "en-GB", "pt-BR". First entry of `languages` is the main one. */
  locale: string;
  languages: string[];
  neurotypes: Neurotype[];
  /** Neurotypes are private unless the owner says otherwise. Explicit, never defaulted by the app. */
  shareNeurotypes: boolean;
  receive: {
    /** Self-chosen: requests phrased as orders cost more to answer than statements. */
    lowDemand: boolean;
    directness: Directness;
    contextStyle: ContextStyle;
    channel: Channel;
    needsReasonWithAsk: boolean;
    literalFirst: boolean;
    processingMinutes: number;
  };
  needToHear: string[];
  howIWrite: string[];
  loveLanguages: {
    given: Record<LoveLanguage, Rating>;
    received: Record<LoveLanguage, Rating>;
  };
  worries: Worry[];
  sensoryNeeds: SensoryNeed[];
  connectionStyles: ConnectionStyle[];
  updatedAt: string;
  /** Where each field's current value came from. */
  provenance: Partial<Record<ProfileFieldKey, 'self' | 'accepted-proposal' | 'edited-proposal'>>;
}

/**
 * The fields an observation may propose changes to. `neurotypes`, `name` and
 * `pronouns` are deliberately absent: they can never be proposed, by type.
 */
export type ProfileFieldKey =
  | 'receive'
  | 'needToHear'
  | 'howIWrite'
  | 'loveLanguages'
  | 'worries'
  | 'sensoryNeeds'
  | 'connectionStyles'
  | 'languages';

export type GateOutcome = 'passed' | 'soft' | 'hard' | 'power';

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
