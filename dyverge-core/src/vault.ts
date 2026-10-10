// Per-person private vaults. Only shared communication crosses over.
//
// SELF-CONTAINED on purpose (no imports): scripts/build-app.ts strips the types and inlines
// this file into dyverge-app.jsx, so the tests here cover the code the app runs.
//
// The model:
//   - Each person has a vault, encrypted at rest with a key derived from a passphrase only
//     they know (PBKDF2-SHA256 into AES-GCM-256). The other person cannot read it, even on
//     the same phone, because the passphrase is the only way in.
//   - Every entry is bound to its owner and key (AES-GCM additional data), so entries cannot
//     be swapped between people or between keys without detection.
//   - Everything an app stores is classed private, shared or open by classifyKey(). Anything
//     not listed is PRIVATE: a new kind of data is locked until someone decides otherwise.
//   - "Use without saving" is an ephemeral vault: it keeps nothing on disk at all.
//
// Honest limits: this keeps out someone who picks up the phone. A short passphrase would not
// stop an expert with the phone and time (the data is on the device, so it can be attacked
// offline); a longer one is better. Nothing here can recover a forgotten passphrase.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => (m.has(k) ? m.get(k)! : null),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

/** localStorage, or memory if storage is blocked (a private window), so the app still works. */
export function browserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    ls.setItem('__dyverge_probe', '1');
    ls.removeItem('__dyverge_probe');
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
      keys: () => Object.keys(ls),
    };
  } catch (e) {
    return memoryStore();
  }
}

// ── Classing: what is private, shared, or open ───────────────────────────────────────────────

export type KeyClass = 'private' | 'shared' | 'open';

/**
 * Plain, because the lock screen has to follow them too: display settings, and the list of
 * names the lock screen asks "who's opening this?" with.
 */
const OPEN_KEYS = new Set(['settings', 'people']);
/** Communication both people see: Our words, and the agreement with both signatures. */
const SHARED_KEYS = new Set(['words', 'agreement']);
/** What a person has chosen to publish for the other: `published:<id>`, `published-spoons:<id>`. */
const SHARED_PREFIX = 'published';

/** Default-deny: any key not named as open or shared is private. */
export function classifyKey(key: string): KeyClass {
  if (OPEN_KEYS.has(key)) return 'open';
  if (SHARED_KEYS.has(key) || key.startsWith(SHARED_PREFIX)) return 'shared';
  return 'private';
}

/** What older builds saved in plain text, and which now belongs in the vault. */
export const LEGACY_PRIVATE_KEYS: readonly string[] = [
  'profiles',
  'spoons',
  'translations',
  'parks',
  'checkins',
  'needSpace',
  'vibe',
  'toolLog',
];

// ── Crypto ───────────────────────────────────────────────────────────────────────────────────

export const MIN_PASSPHRASE = 6;
const ITERATIONS = 210_000;
const CHECK = 'dyverge-vault-ok';
const enc = new TextEncoder();
const dec = new TextDecoder();

interface Sealed {
  iv: string;
  ct: string;
}

interface Header {
  v: 1;
  salt: string;
  iterations: number;
  check: Sealed;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  // NFKC so the same typed characters from different keyboards give the same key.
  const base = await subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, aad: string, plaintext: string): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource },
    key,
    enc.encode(plaintext),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

async function unseal(key: CryptoKey, aad: string, sealed: Sealed): Promise<string | null> {
  try {
    const buf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(sealed.iv) as BufferSource, additionalData: enc.encode(aad) as BufferSource },
      key,
      fromB64(sealed.ct) as BufferSource,
    );
    return dec.decode(buf);
  } catch (e) {
    return null;
  }
}

// ── The vault ────────────────────────────────────────────────────────────────────────────────

export interface Vault {
  readonly personId: string;
  /** True for "use without saving": nothing is ever written to disk. */
  readonly ephemeral: boolean;
  isUnlocked(): boolean;
  /** Returns false for a wrong passphrase. Loads and decrypts every entry on success. */
  unlock(passphrase: string): Promise<boolean>;
  /** Waits for pending writes, then forgets the key and every decrypted value. */
  lock(): Promise<void>;
  /** Synchronous, from memory. Throws if locked. */
  get<T>(key: string, fallback: T): T;
  /** Updates memory now and resolves once the encrypted copy is saved. */
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Removes every entry but keeps the vault and its passphrase. */
  clear(): Promise<void>;
  /** Re-encrypts everything under a new passphrase. False if the current one is wrong. */
  changePassphrase(current: string, next: string): Promise<boolean>;
  /** Removes the vault entirely, passphrase included. For "I've forgotten it". Cannot be undone. */
  erase(): void;
  /** Entries that could not be read on the last unlock (damaged or tampered with). */
  unreadable(): string[];
}

const prefix = (personId: string) => `dyverge:vault:${personId}:`;
const headerKey = (personId: string) => `${prefix(personId)}__header`;
const entryPrefix = (personId: string) => `${prefix(personId)}k:`;
const entryAad = (personId: string, key: string) => `${personId}/${key}`;
const headerAad = (personId: string) => `${personId}/__header`;

export function vaultExists(store: KeyValueStore, personId: string): boolean {
  return store.get(headerKey(personId)) !== null;
}

function readHeader(store: KeyValueStore, personId: string): Header | null {
  const raw = store.get(headerKey(personId));
  if (raw === null) return null;
  try {
    const h = JSON.parse(raw) as Header;
    return h && h.v === 1 && h.salt && h.iterations && h.check ? h : null;
  } catch (e) {
    return null;
  }
}

export interface CreateOptions {
  /** Lower only in tests. */
  iterations?: number;
}

/** Opens an existing vault, locked. Use unlock() with the passphrase. */
export function openVault(store: KeyValueStore, personId: string): Vault {
  return makeVault(store, personId, null);
}

/** Makes a new vault and returns it unlocked. Throws if one already exists. */
export async function createVault(
  store: KeyValueStore,
  personId: string,
  passphrase: string,
  opts: CreateOptions = {},
): Promise<Vault> {
  if (vaultExists(store, personId)) throw new Error('A private space already exists for this person.');
  if (passphrase.length < MIN_PASSPHRASE) throw new RangeError(`Passphrase needs at least ${MIN_PASSPHRASE} characters.`);
  const iterations = opts.iterations ?? ITERATIONS;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  const header: Header = { v: 1, salt: toB64(salt), iterations, check: await seal(key, headerAad(personId), CHECK) };
  store.set(headerKey(personId), JSON.stringify(header));
  const vault = makeVault(store, personId, { key, data: new Map() });
  return vault;
}

interface Open {
  key: CryptoKey;
  data: Map<string, string>;
}

function makeVault(store: KeyValueStore, personId: string, initial: Open | null): Vault {
  let state: Open | null = initial;
  let queue: Promise<void> = Promise.resolve();
  let bad: string[] = [];

  const enqueue = (fn: () => Promise<void> | void): Promise<void> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const need = (): Open => {
    if (!state) throw new Error('The private space is locked.');
    return state;
  };
  const entryKeys = () => store.keys().filter((k) => k.startsWith(entryPrefix(personId)));

  return {
    personId,
    ephemeral: false,

    isUnlocked: () => state !== null,

    async unlock(passphrase) {
      const header = readHeader(store, personId);
      if (!header) return false;
      const key = await deriveKey(passphrase, fromB64(header.salt), header.iterations);
      if ((await unseal(key, headerAad(personId), header.check)) !== CHECK) return false;
      const data = new Map<string, string>();
      bad = [];
      for (const storeKey of entryKeys()) {
        const id = storeKey.slice(entryPrefix(personId).length);
        let sealed: Sealed | null = null;
        try {
          sealed = JSON.parse(store.get(storeKey) ?? 'null') as Sealed | null;
        } catch (e) {
          sealed = null;
        }
        const plain = sealed ? await unseal(key, entryAad(personId, id), sealed) : null;
        if (plain === null) bad.push(id);
        else data.set(id, plain);
      }
      state = { key, data };
      return true;
    },

    async lock() {
      await queue;
      state = null;
    },

    get<T>(key: string, fallback: T): T {
      const raw = need().data.get(key);
      return raw === undefined ? fallback : (JSON.parse(raw) as T);
    },

    put(key, value) {
      const s = need();
      const json = JSON.stringify(value);
      s.data.set(key, json);
      return enqueue(async () => {
        if (!state) return;
        const sealed = await seal(state.key, entryAad(personId, key), json);
        store.set(entryPrefix(personId) + key, JSON.stringify(sealed));
      });
    },

    remove(key) {
      need().data.delete(key);
      return enqueue(() => store.remove(entryPrefix(personId) + key));
    },

    clear() {
      need().data.clear();
      return enqueue(() => {
        for (const k of entryKeys()) store.remove(k);
      });
    },

    async changePassphrase(current, next) {
      if (next.length < MIN_PASSPHRASE) throw new RangeError(`Passphrase needs at least ${MIN_PASSPHRASE} characters.`);
      const s = need();
      const header = readHeader(store, personId);
      if (!header) return false;
      const proof = await deriveKey(current, fromB64(header.salt), header.iterations);
      if ((await unseal(proof, headerAad(personId), header.check)) !== CHECK) return false;
      await queue;
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(next, salt, header.iterations);
      // Seal everything first, then write: no half-changed state if sealing fails.
      const sealedEntries: [string, string][] = [];
      for (const [id, json] of s.data) {
        sealedEntries.push([entryPrefix(personId) + id, JSON.stringify(await seal(key, entryAad(personId, id), json))]);
      }
      const newHeader: Header = { v: 1, salt: toB64(salt), iterations: header.iterations, check: await seal(key, headerAad(personId), CHECK) };
      for (const [k, v] of sealedEntries) store.set(k, v);
      store.set(headerKey(personId), JSON.stringify(newHeader));
      s.key = key;
      return true;
    },

    erase() {
      for (const k of store.keys()) if (k.startsWith(prefix(personId))) store.remove(k);
      state = null;
    },

    unreadable: () => [...bad],
  };
}

/** "Use without saving": same interface, nothing ever written to disk. */
export function ephemeralVault(personId: string): Vault {
  let data: Map<string, string> | null = new Map();
  const need = (): Map<string, string> => {
    if (!data) throw new Error('This session has ended.');
    return data;
  };
  return {
    personId,
    ephemeral: true,
    isUnlocked: () => data !== null,
    unlock: () => Promise.resolve(false),
    lock: () => {
      data = null;
      return Promise.resolve();
    },
    get<T>(key: string, fallback: T): T {
      const raw = need().get(key);
      return raw === undefined ? fallback : (JSON.parse(raw) as T);
    },
    put(key, value) {
      need().set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    remove(key) {
      need().delete(key);
      return Promise.resolve();
    },
    clear() {
      need().clear();
      return Promise.resolve();
    },
    changePassphrase: () => Promise.resolve(false),
    erase() {
      data = null;
    },
    unreadable: () => [],
  };
}

/**
 * Moves what an older build saved in plain text into the vault, then deletes the plain copy.
 * The plain copy is only removed once the encrypted one is saved. Returns the keys moved.
 */
export async function migrateLegacy(store: KeyValueStore, vault: Vault, namespace = 'dyverge:'): Promise<string[]> {
  const moved: string[] = [];
  for (const key of LEGACY_PRIVATE_KEYS) {
    const raw = store.get(namespace + key);
    if (raw === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      continue;
    }
    await vault.put(key, parsed);
    store.remove(namespace + key);
    moved.push(key);
  }
  return moved;
}

/** Whether older plain-text private data exists, so the app can say it will be moved. */
export function hasLegacyData(store: KeyValueStore, namespace = 'dyverge:'): boolean {
  return LEGACY_PRIVATE_KEYS.some((k) => store.get(namespace + k) !== null);
}
