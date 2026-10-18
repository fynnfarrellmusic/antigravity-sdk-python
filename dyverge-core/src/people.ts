// Who uses this phone, and what crosses between them.
//
// SELF-CONTAINED on purpose (type imports only): scripts/build-app.ts strips the types and
// inlines this file into dyverge-app.jsx, so the tests here cover the code the app runs.
//
// Two people can each have a private space on one phone (vault.ts). This file holds the small,
// deliberately NOT private parts, so it is clear in one place what crosses over:
//   - names, so the lock screen can ask "who's opening this?" (decided: pick your name first);
//   - what a person has chosen to PUBLISH: their profile, and optionally their spoon level;
//   - the agreement, with one signature per person.
// Everything else stays in the owner's vault. Publishing is an explicit act, and only fields on
// the allow-lists below can ever be published, so a new private field cannot leak by accident.

import type { KeyValueStore } from './vault.ts';

export const MAX_PEOPLE = 2;

const PEOPLE_STORE_NS = 'dyverge:';
const PEOPLE_KEY = `${PEOPLE_STORE_NS}people`;
const AGREEMENT_KEY = `${PEOPLE_STORE_NS}agreement`;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export interface PersonRef {
  id: string;
  /** Shown on the lock screen, so it is stored in the open. */
  name: string;
}

export function cleanName(raw: string): string {
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function newPersonId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return 'p' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

/** What to call someone on the lock screen if they have no name yet. */
export function displayName(person: PersonRef, index: number): string {
  return person.name || `Person ${index + 1}`;
}

// ── Who is here ──────────────────────────────────────────────────────────────────────────────

export function readPeople(store: KeyValueStore): PersonRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(store.get(PEOPLE_KEY) ?? 'null');
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PersonRef[] = [];
  for (const item of parsed) {
    const id = item && typeof item.id === 'string' ? item.id : '';
    if (!ID_PATTERN.test(id) || out.some((p) => p.id === id)) continue;
    out.push({ id, name: typeof item.name === 'string' ? cleanName(item.name) : '' });
  }
  return out.slice(0, MAX_PEOPLE);
}

export function writePeople(store: KeyValueStore, people: readonly PersonRef[]): void {
  store.set(PEOPLE_KEY, JSON.stringify(people.slice(0, MAX_PEOPLE)));
}

/**
 * The people on this phone. A phone set up before people were listed has a vault but no list,
 * so the list is rebuilt from the vaults that exist (names unknown until each person opens theirs).
 */
export function bootstrapPeople(store: KeyValueStore): PersonRef[] {
  const existing = readPeople(store);
  if (existing.length > 0) return existing;
  const ids: string[] = [];
  for (const key of store.keys()) {
    const m = /^dyverge:vault:([^:]+):__header$/.exec(key);
    if (m && m[1] && ID_PATTERN.test(m[1]) && !ids.includes(m[1])) ids.push(m[1]);
  }
  const people = ids.slice(0, MAX_PEOPLE).map((id) => ({ id, name: '' }));
  if (people.length > 0) writePeople(store, people);
  return people;
}

/**
 * Forgets anyone listed whose private space was never finished. The list is written before the
 * passphrase is turned into a key (so a third person is refused at once), and a space only exists
 * once its header is saved. If the app is closed in between, the lock screen would show a name
 * whose passphrase can never work. `hasSpace` says whether a finished private space exists for an id.
 */
export function pruneUnfinished(store: KeyValueStore, hasSpace: (id: string) => boolean): PersonRef[] {
  const people = readPeople(store);
  const kept = people.filter((p) => hasSpace(p.id));
  if (kept.length !== people.length) writePeople(store, kept);
  return kept;
}

export function addPerson(store: KeyValueStore, ref: PersonRef): PersonRef[] {
  const people = readPeople(store);
  if (!ID_PATTERN.test(ref.id)) throw new RangeError('That person id is not allowed.');
  if (people.some((p) => p.id === ref.id)) throw new Error('That person is already here.');
  if (people.length >= MAX_PEOPLE) throw new Error('Two people already use this phone.');
  const next = [...people, { id: ref.id, name: cleanName(ref.name) }];
  writePeople(store, next);
  return next;
}

export function renamePerson(store: KeyValueStore, id: string, name: string): PersonRef[] {
  const next = readPeople(store).map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p));
  writePeople(store, next);
  return next;
}

export function removePerson(store: KeyValueStore, id: string): PersonRef[] {
  const next = readPeople(store).filter((p) => p.id !== id);
  writePeople(store, next);
  return next;
}

export function otherPerson(people: readonly PersonRef[], activeId: string): PersonRef | null {
  return people.find((p) => p.id !== activeId) ?? null;
}

// ── What a person publishes ──────────────────────────────────────────────────────────────────

/** The only profile fields that can ever cross over. Anything else on a profile stays private. */
export interface SharedProfile {
  name: string;
  pronouns: string;
  lenses: string[];
  receiveNote: string;
  care: string[];
  needToHear: string;
  write: string;
}

export interface PublishedProfile {
  profile: SharedProfile;
  at: number;
}

export interface PublishedSpoons {
  left: number;
  total: number;
  at: number;
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
const cleanText = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Picks the allowed fields and nothing else, whatever object it is given. */
export function toSharedProfile(p: unknown): SharedProfile {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  return {
    name: cleanName(cleanText(o['name'], 100)),
    pronouns: cleanText(o['pronouns'], 100),
    lenses: stringList(o['lenses']),
    receiveNote: cleanText(o['receiveNote']),
    care: stringList(o['care']),
    needToHear: cleanText(o['needToHear']),
    write: cleanText(o['write']),
  };
}

const profileKey = (id: string) => `${PEOPLE_STORE_NS}published:${id}`;
const spoonsKey = (id: string) => `${PEOPLE_STORE_NS}published-spoons:${id}`;

function readStoreJson(store: KeyValueStore, key: string): unknown {
  try {
    return JSON.parse(store.get(key) ?? 'null');
  } catch (e) {
    return null;
  }
}

export function publishProfile(store: KeyValueStore, personId: string, profile: unknown, at: number): void {
  const published: PublishedProfile = { profile: toSharedProfile(profile), at };
  store.set(profileKey(personId), JSON.stringify(published));
}

export function readPublishedProfile(store: KeyValueStore, personId: string): PublishedProfile | null {
  const raw = readStoreJson(store, profileKey(personId)) as { profile?: unknown; at?: unknown } | null;
  if (!raw || typeof raw.at !== 'number') return null;
  return { profile: toSharedProfile(raw.profile), at: raw.at };
}

export function unpublishProfile(store: KeyValueStore, personId: string): void {
  store.remove(profileKey(personId));
}

export function publishSpoons(store: KeyValueStore, personId: string, spoons: { left: number; total: number }, at: number): void {
  const { left, total } = spoons;
  if (!Number.isFinite(left) || !Number.isFinite(total) || total < 1 || left < 0) {
    throw new RangeError('Spoons need a total of at least 1 and a level of at least 0.');
  }
  const published: PublishedSpoons = { left: Math.min(Math.round(left), Math.round(total)), total: Math.round(total), at };
  store.set(spoonsKey(personId), JSON.stringify(published));
}

export function readPublishedSpoons(store: KeyValueStore, personId: string): PublishedSpoons | null {
  const raw = readStoreJson(store, spoonsKey(personId)) as Partial<PublishedSpoons> | null;
  if (!raw || typeof raw.left !== 'number' || typeof raw.total !== 'number' || typeof raw.at !== 'number') return null;
  if (raw.total < 1 || raw.left < 0) return null;
  return { left: Math.min(raw.left, raw.total), total: raw.total, at: raw.at };
}

export function unpublishSpoons(store: KeyValueStore, personId: string): void {
  store.remove(spoonsKey(personId));
}

// ── The agreement: one signature per person ──────────────────────────────────────────────────

export interface AgreementRaw {
  signatures: Record<string, number | null>;
  reopened: number | null;
}

/** What the screens see: me and partner, from whoever is using the app right now. */
export interface AgreementView {
  signatures: { me: number | null; partner: number | null };
  reopened: number | null;
}

export const EMPTY_AGREEMENT: AgreementRaw = { signatures: {}, reopened: null };

function rawAgreement(v: unknown): AgreementRaw {
  const o = (v && typeof v === 'object' ? v : {}) as { signatures?: unknown; reopened?: unknown };
  const signatures: Record<string, number | null> = {};
  if (o.signatures && typeof o.signatures === 'object') {
    for (const [k, val] of Object.entries(o.signatures as Record<string, unknown>)) {
      signatures[k] = typeof val === 'number' ? val : null;
    }
  }
  return { signatures, reopened: typeof o.reopened === 'number' ? o.reopened : null };
}

export function toAgreementView(raw: unknown, selfId: string, otherId: string | null): AgreementView {
  const r = rawAgreement(raw);
  const sig = (id: string | null): number | null => (id && typeof r.signatures[id] === 'number' ? (r.signatures[id] as number) : null);
  return { signatures: { me: sig(selfId), partner: sig(otherId) }, reopened: r.reopened };
}

/**
 * Writes a change made on screen back to the stored agreement. A person can only change their
 * own signature. The one exception is reopening, which clears both: it is done together.
 * Signatures stored under any other key (an old demo partner, say) are dropped.
 */
export function fromAgreementView(raw: unknown, next: AgreementView, selfId: string, otherId: string | null): AgreementRaw {
  const r = rawAgreement(raw);
  const signatures: Record<string, number | null> = {};
  for (const id of [selfId, otherId]) {
    if (id) signatures[id] = typeof r.signatures[id] === 'number' ? (r.signatures[id] as number) : null;
  }
  const reopening = next.reopened !== r.reopened && next.signatures.me === null && next.signatures.partner === null;
  if (reopening) {
    for (const id of Object.keys(signatures)) signatures[id] = null;
  } else {
    signatures[selfId] = next.signatures.me;
  }
  return { signatures, reopened: next.reopened };
}

/** Everything a person put in the shared space, removed: their published items and their signature. */
export function removeSharedTraces(store: KeyValueStore, personId: string): void {
  unpublishProfile(store, personId);
  unpublishSpoons(store, personId);
  const raw = readStoreJson(store, AGREEMENT_KEY);
  if (raw) {
    const r = rawAgreement(raw);
    if (personId in r.signatures) {
      delete r.signatures[personId];
      store.set(AGREEMENT_KEY, JSON.stringify(r));
    }
  }
}
