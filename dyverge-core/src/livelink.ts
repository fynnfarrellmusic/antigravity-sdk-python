// Live link: an encrypted, consent-first room for exactly two people on two phones.
//
// SELF-CONTAINED on purpose (no imports), like vault.ts, so it can be inlined into the app later.
// It only turns bytes into bytes. It never opens a connection, never touches storage, and never
// uses a random source other than the browser's crypto. A transport (any live channel that can
// carry a short string) is a small adapter that passes strings in and takes strings out.
//
// STATUS: a spike. It has tests, including a hostile relay that drops, repeats, reorders, alters
// and forges frames, but it has NOT been reviewed by an independent cryptographer. It must not
// carry real people's words until it has been (docs/dyverge/live-link-design.md says what and why).
//
// The invention here is in how the pieces are put together for consent, not in the maths. Every
// primitive is the browser's own (ECDH and ECDSA on P-256, HKDF, HMAC and AES-GCM, all SHA-256).
//
//   1. THE INVITE IS A KEY. One person makes a one-time invite (128 random bits) and gives it to
//      the other by hand: read out, scanned, or sent by whatever they already trust. It names the
//      room (so the room cannot be guessed) and locks the knock. Whoever does not hold it cannot
//      read the terms in the knock, or answer it in a way that is believed.
//   2. THE KNOCK CARRIES THE TERMS. The knock holds the charter: what may cross (named kinds),
//      for how long, and why. It is readable only with the invite. The other person reads it and
//      decides. The listener has made no keys of its own until they say yes, and saying no sends
//      nothing at all, so a refusal is indistinguishable from not being there.
//   3. THE TERMS ARE PART OF THE KEYS. The charter is hashed into the handshake transcript, so a
//      relay or a peer that changed it would produce different keys and nothing would decrypt.
//      Mid-room, either person may narrow the terms (never widen them without a new room).
//   4. A SIGMA-STYLE HANDSHAKE (fresh ECDH keys, each side signs the transcript with its device
//      identity and MACs its identity under the session key). Identities travel encrypted, and the
//      knocker reveals its own only after the listener has proved itself. The session keys come
//      from the fresh keys and the one-time invite, never from the long-lived identity key, so a
//      stolen identity cannot read an old room.
//   5. NOTHING FLOWS UNTIL BOTH PEOPLE HAVE CHECKED. Both phones show the same five words from the
//      handshake. Each person confirms they match, then says "ready" (a frame under the session
//      keys, sent again if it is lost). A pinned contact (a fingerprint already trusted) skips the
//      words. Different words, or a pinned key that has changed, seal the room.
//   6. A ROOM LIVES ONLY WHILE BOTH ARE HERE. Each direction has its own hash chain: one key per
//      message, used once, then gone (forward secrecy inside the room). Quiet "still here"
//      messages keep it open. If one goes quiet, or the agreed time runs out, both sides wipe
//      their keys. There is no transcript to read afterwards because nothing is written down.
//   7. LENGTHS ARE HIDDEN. Everything said after the handshake is padded up to a fixed size, so a
//      relay cannot tell a "yes" from a paragraph.
//   8. THE RELAY CAN ONLY DELAY OR GO QUIET. A frame that is dropped, repeated, reordered, altered,
//      forged or cut short is never believed, and never moves the keys on. Late frames within a
//      small window are still read once.
//
// Honest limits (also in the design note): a relay still sees that two phones talked, when, how
// often, and roughly how long the terms in the knock are. Anyone who controls a phone controls
// what it shows. Whoever serves the page can change the code the page runs, which no encryption
// inside the page can stop. A phone taken during a room shows the rest of that room, though never
// what was said before. JavaScript cannot promise to erase memory, only to drop and zero what it
// holds. Delivery is not guaranteed (a lost message is not sent again). The five words are a human
// step: people can wave them through. None of this is formally verified.

// ── Public shapes ────────────────────────────────────────────────────────────────────────────

export const LINK_VERSION = 1;

/** Everything is bounded, so a hostile peer or relay cannot make a phone do unbounded work. */
export const LINK_LIMITS = {
  /** Kinds a charter may name. */
  kinds: 8,
  kindLength: 24,
  purpose: 80,
  ttlMin: 60,
  ttlMax: 3600,
  /** Largest message body, in UTF-8 bytes. */
  body: 1900,
  /** Frames that may be lost or late before the gap is refused. */
  skip: 32,
  /** Messages held while we wait for the other person to finish checking. */
  pending: 16,
  /** Early frames held while the handshake finishes. */
  stash: 8,
  /** Longest frame text accepted, in characters. The platform's live channel carries 4 KiB. */
  frame: 4000,
  /** Plain text is padded up to the next of these, so lengths do not show. */
  buckets: [128, 256, 512, 1024, 2048],
} as const;

export interface LinkTiming {
  /** How long a knock keeps waiting for the door to be opened. */
  knockMs: number;
  /** How long a person has to decide whether to open the door. */
  consentMs: number;
  /** How long the two phones have to finish the handshake once the door is opened. */
  handshakeMs: number;
  /** How long the two people have to compare the five words. */
  verifyMs: number;
  /** How often a knock or an open is sent again, because a live channel can drop what it carries. */
  resendMs: number;
  /** How often a live room says "still here". */
  beatMs: number;
  /** How long a live room waits to hear anything before it seals itself. */
  staleMs: number;
}

export const LINK_TIMING: LinkTiming = {
  knockMs: 120_000,
  consentMs: 300_000,
  handshakeMs: 30_000,
  verifyMs: 180_000,
  resendMs: 3_000,
  beatMs: 5_000,
  staleMs: 20_000,
};

/** The terms both people agree to before anything flows. */
export interface LinkCharter {
  /** The named kinds of message that may cross, for example "words" or "card". Letters, digits, _. */
  kinds: string[];
  /** How long the room may stay open once it is live. */
  ttlSeconds: number;
  /** One plain line the other person reads before they open the door. */
  purpose: string;
}

export type LinkPhase = 'knocking' | 'listening' | 'consent' | 'handshaking' | 'verify' | 'live' | 'sealed';

export type LinkSealReason =
  | 'you-sealed'
  | 'they-sealed'
  | 'declined'
  | 'no-answer'
  | 'peer-gone'
  | 'expired'
  | 'words-differ'
  | 'peer-changed'
  | 'failed';

/** Why a frame was dropped. Dropping never throws: a relay must not be able to crash a phone. */
export type LinkIgnoredWhy =
  | 'unreadable'
  | 'wrong-session'
  | 'wrong-phase'
  | 'old'
  | 'too-far'
  | 'bad-check'
  | 'bad-form'
  | 'not-allowed';

export interface LinkPeer {
  /** SHA-256 of their public key, in hex. Pin this to recognise them next time. */
  fingerprint: string;
  /** The same fingerprint as six plain words, for people. */
  words: string[];
  /** True if their key matched a fingerprint that was already trusted. */
  pinned: boolean;
}

export type LinkEvent =
  | { type: 'consent'; charter: LinkCharter }
  | { type: 'open'; peer: LinkPeer; check: string[] }
  | { type: 'live' }
  | { type: 'message'; kind: string; body: string }
  | { type: 'narrowed'; kinds: string[]; by: 'you' | 'them' }
  | { type: 'sealed'; reason: LinkSealReason }
  | { type: 'ignored'; why: LinkIgnoredWhy };

/** What a call did: frames to hand to the transport, and things the app should show. */
export interface LinkStep {
  out: string[];
  events: LinkEvent[];
}

export interface LinkIdentity {
  /** The public half (SPKI bytes). Safe to share. */
  readonly publicKey: Uint8Array;
  /** SHA-256 of the public half, in hex. */
  readonly fingerprint: string;
  sign(data: Uint8Array): Promise<Uint8Array>;
}

/** The private half of a device identity, to be kept inside the person's encrypted private space. */
export interface LinkStoredIdentity {
  v: 1;
  jwk: JsonWebKey;
}

export interface LinkOptions {
  identity: LinkIdentity;
  /** The code from linkMakeInvite(), passed between the two people by hand. */
  invite: string;
  /** A fingerprint already trusted from an earlier room. A different key seals the room. */
  expectedPeer?: string;
  now?: () => number;
  timing?: Partial<LinkTiming>;
  /** Tests only: expose the inside so attacks can be written against it. Never set in the app. */
  exposeForTests?: boolean;
}

export interface LinkKnockOptions extends LinkOptions {
  charter: LinkCharter;
}

export type LinkListenOptions = LinkOptions;

export interface LinkTestSeam {
  /** Copies of the chain state: what a thief who got the phone now would hold. */
  dump(): {
    sending: { next: number; chainKey: Uint8Array } | null;
    receiving: { next: number; chainKey: Uint8Array; kept: number[] } | null;
  };
  /** The live key arrays themselves (not copies), to check they are zeroed once the room is sealed. */
  hold(): { sending: Uint8Array | null; receiving: Uint8Array | null };
  /** Send a kind without the local charter check, to test what the other side does with it. */
  sendUnchecked(kind: string, body: string): Promise<LinkStep>;
  /** Send any frame type with any payload on the chain, to test what the other side does with it. */
  sendRaw(type: number, payload: Uint8Array): Promise<LinkStep>;
}

export interface Link {
  readonly role: 'knocker' | 'listener';
  /** The name of the live channel to meet in. Derived from the invite, so it cannot be guessed. */
  readonly room: string;
  phase(): LinkPhase;
  charter(): LinkCharter | null;
  peer(): LinkPeer | null;
  /** The five words both people compare once the handshake is done. */
  check(): string[] | null;
  /** Counters for the screen: frames sent and received (quiet ones included), and frames known to be missing. */
  stats(): { sent: number; received: number; missing: number };
  /** Hand in a frame from the transport. Never throws, whatever it is given. */
  receive(frame: string): Promise<LinkStep>;
  /** Listener: say yes. Only now are this phone's keys made. */
  accept(): Promise<LinkStep>;
  /** Listener: say no. Sends nothing, so it looks the same as not being there. */
  decline(): Promise<LinkStep>;
  /** Both: the five words match (true) or do not (false, which seals the room). */
  verified(match: boolean): Promise<LinkStep>;
  /** Send one message of an agreed kind. */
  send(kind: string, body: string): Promise<LinkStep>;
  /** Agree to less, from now on. Never more. */
  narrow(kinds: string[]): Promise<LinkStep>;
  /** Call every second or so: resends, "still here", and the clocks. */
  tick(): Promise<LinkStep>;
  /** Close the room and wipe the keys. Quietly sends nothing, which looks like a lost connection. */
  seal(opts?: { quietly?: boolean }): Promise<LinkStep>;
  readonly __test?: LinkTestSeam;
}

export class LinkError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
  }
}

// ── The five-word check ──────────────────────────────────────────────────────────────────────
// 256 easy words, each with its own first three letters, so a half-heard word is hard to confuse
// with another. One word is one byte. The order is part of the protocol: do not change it.

export const LINK_WORDS: readonly string[] = [
  'acorn', 'amber', 'anchor', 'apple', 'arrow', 'aspen', 'atlas', 'aurora', 'almond', 'anvil', 'apricot',
  'badge', 'bamboo', 'banjo', 'basil', 'beacon', 'birch', 'bison', 'blanket', 'bridge', 'brook',
  'button', 'barley', 'beetle', 'bell', 'berry', 'bread', 'bucket', 'bubble', 'cactus', 'candle',
  'carpet', 'cedar', 'cherry', 'clover', 'cobalt', 'comet', 'copper', 'coral', 'cricket', 'crystal',
  'cabin', 'cotton', 'castle', 'cave', 'chalk', 'cider', 'cliff', 'cocoa', 'crane', 'daisy',
  'delta', 'desert', 'dolphin', 'dragon', 'drum', 'dune', 'dove', 'dawn', 'dahlia', 'denim',
  'diamond', 'dingo', 'donkey', 'dusk', 'ember', 'echo', 'elm', 'engine', 'eagle', 'emerald',
  'eel', 'elder', 'falcon', 'feather', 'fern', 'fiddle', 'finch', 'flint', 'forest', 'fossil',
  'fox', 'flute', 'fig', 'frost', 'fable', 'farm', 'fennel', 'field', 'flame', 'flower',
  'fountain', 'garden', 'ginger', 'glacier', 'goose', 'grape', 'galaxy', 'geyser', 'gable', 'gazelle',
  'glove', 'goblet', 'grove', 'guitar', 'gull', 'harbour', 'hazel', 'heron', 'honey', 'hill',
  'horizon', 'hammer', 'hollow', 'haven', 'hedge', 'hickory', 'hive', 'heather', 'island', 'ivory',
  'iris', 'indigo', 'jasmine', 'jungle', 'jigsaw', 'jade', 'jacket', 'jelly', 'kettle', 'kite',
  'kiwi', 'kayak', 'kernel', 'knot', 'kelp', 'lantern', 'laurel', 'lemon', 'lily', 'lotus',
  'ladder', 'lagoon', 'lark', 'lamp', 'lime', 'maple', 'marble', 'meadow', 'mirror', 'moss',
  'mango', 'magnet', 'mitten', 'mist', 'melon', 'moon', 'mountain', 'muffin', 'nutmeg', 'needle',
  'nectar', 'nest', 'nickel', 'nimbus', 'noodle', 'nettle', 'oak', 'ocean', 'olive', 'orchid',
  'otter', 'oyster', 'onion', 'orange', 'opal', 'paddle', 'pebble', 'pepper', 'pine', 'planet',
  'plum', 'pond', 'poppy', 'pillow', 'pearl', 'piano', 'pumpkin', 'puffin', 'pocket', 'pasture',
  'quartz', 'quill', 'rabbit', 'raven', 'ribbon', 'river', 'robin', 'rocket', 'rose', 'reed',
  'ruby', 'rain', 'rowan', 'saddle', 'saffron', 'sage', 'sailor', 'shadow', 'silver', 'sparrow',
  'spruce', 'summit', 'sunrise', 'swan', 'spoon', 'stone', 'sugar', 'starling', 'sapphire', 'thistle',
  'thunder', 'tiger', 'timber', 'tulip', 'tunnel', 'teapot', 'trumpet', 'tide', 'topaz', 'turtle',
  'tomato', 'umber', 'unicorn', 'valley', 'velvet', 'violet', 'vessel', 'vine', 'vapour', 'walnut',
  'willow', 'winter', 'wagon', 'whale', 'wheat', 'wren', 'wolf', 'waffle', 'yarrow', 'yacht',
  'yoghurt', 'zephyr', 'zebra', 'zinc', 'zucchini',
];

/** The first `count` bytes as words. Eight bits a word. */
export function linkWords(bytes: Uint8Array, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count && i < bytes.length; i++) out.push(LINK_WORDS[bytes[i]!]!);
  return out;
}

/** A fingerprint (64 hex characters) as six words people can compare. Empty if it is not one. */
export function linkFingerprintWords(fingerprint: string): string[] {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return [];
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) bytes[i] = parseInt(fingerprint.slice(i * 2, i * 2 + 2), 16);
  return linkWords(bytes, 6);
}

// ── Small byte tools ─────────────────────────────────────────────────────────────────────────

const llEnc = new TextEncoder();
const llDec = new TextDecoder('utf-8', { fatal: true });
const LL_EMPTY = new Uint8Array(0);

const llBytes = (u: Uint8Array): BufferSource => u as unknown as BufferSource;
const llSubtle = (): SubtleCrypto => globalThis.crypto.subtle;
const llRandom = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

function llCat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function llU32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

function llReadU32(b: Uint8Array, at: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, false);
}

function llWipe(...arrays: (Uint8Array | null | undefined)[]): void {
  for (const a of arrays) if (a) a.fill(0);
}

function llHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function llSame(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

function llB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function llFromB64u(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch (e) {
    return null;
  }
}

// ── Crypto, all from the browser ─────────────────────────────────────────────────────────────

async function llSha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  return new Uint8Array(await llSubtle().digest('SHA-256', llBytes(llCat(...parts))));
}

async function llHkdf(ikm: Uint8Array, salt: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const key = await llSubtle().importKey('raw', llBytes(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await llSubtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: llBytes(salt), info: llBytes(llEnc.encode(info)) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function llSeal(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const k = await llSubtle().importKey('raw', llBytes(key), 'AES-GCM', false, ['encrypt']);
  const ct = await llSubtle().encrypt(
    { name: 'AES-GCM', iv: llBytes(nonce), additionalData: llBytes(aad), tagLength: 128 },
    k,
    llBytes(plain),
  );
  return new Uint8Array(ct);
}

async function llOpen(key: Uint8Array, nonce: Uint8Array, ct: Uint8Array, aad: Uint8Array): Promise<Uint8Array | null> {
  try {
    const k = await llSubtle().importKey('raw', llBytes(key), 'AES-GCM', false, ['decrypt']);
    const plain = await llSubtle().decrypt(
      { name: 'AES-GCM', iv: llBytes(nonce), additionalData: llBytes(aad), tagLength: 128 },
      k,
      llBytes(ct),
    );
    return new Uint8Array(plain);
  } catch (e) {
    return null;
  }
}

async function llMac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await llSubtle().importKey('raw', llBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await llSubtle().sign('HMAC', k, llBytes(data)));
}

async function llMacOk(key: Uint8Array, mac: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    const k = await llSubtle().importKey('raw', llBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await llSubtle().verify('HMAC', k, llBytes(mac), llBytes(data));
  } catch (e) {
    return false;
  }
}

async function llEphemeral(): Promise<{ priv: CryptoKey; pub: Uint8Array }> {
  const pair = await llSubtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { priv: pair.privateKey, pub: new Uint8Array(await llSubtle().exportKey('raw', pair.publicKey)) };
}

async function llPointOk(pub: Uint8Array): Promise<boolean> {
  if (pub.length !== 65 || pub[0] !== 4) return false;
  try {
    await llSubtle().importKey('raw', llBytes(pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return true;
  } catch (e) {
    return false;
  }
}

async function llAgree(priv: CryptoKey, peerPub: Uint8Array): Promise<Uint8Array | null> {
  if (peerPub.length !== 65 || peerPub[0] !== 4) return null;
  try {
    const peer = await llSubtle().importKey('raw', llBytes(peerPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return new Uint8Array(await llSubtle().deriveBits({ name: 'ECDH', public: peer }, priv, 256));
  } catch (e) {
    return null;
  }
}

const LL_ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const LL_SPKI = 91; // a P-256 public key, SPKI encoded
const LL_SIG = 64; // an ECDSA P-256 signature, r then s
const LL_MAC = 32;
const LL_PROOF = LL_SPKI + LL_SIG + LL_MAC;

async function llVerify(spki: Uint8Array, sig: Uint8Array, data: Uint8Array): Promise<boolean> {
  if (spki.length !== LL_SPKI || sig.length !== LL_SIG) return false;
  try {
    const key = await llSubtle().importKey('spki', llBytes(spki), LL_ECDSA, false, ['verify']);
    return await llSubtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, llBytes(sig), llBytes(data));
  } catch (e) {
    return false;
  }
}

// ── Identity: the key a phone holds, the nearest thing to a login that needs no account ──────

async function llIdentity(priv: CryptoKey, spki: Uint8Array): Promise<LinkIdentity> {
  return {
    publicKey: spki,
    fingerprint: llHex(await llSha256(spki)),
    sign: async (data) => new Uint8Array(await llSubtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, llBytes(data))),
  };
}

/**
 * Make a device identity. Keep `stored` inside the person's private space (it is a private key),
 * and give `identity` to the link. Unlocking the space is what logs a person in to their own key.
 */
export async function linkCreateIdentity(): Promise<{ identity: LinkIdentity; stored: LinkStoredIdentity }> {
  const pair = await llSubtle().generateKey(LL_ECDSA, true, ['sign', 'verify']);
  const jwk = await llSubtle().exportKey('jwk', pair.privateKey);
  const stored: LinkStoredIdentity = { v: 1, jwk };
  const identity = await linkLoadIdentity(stored);
  if (!identity) throw new LinkError('identity', 'Could not make a device key');
  return { identity, stored };
}

/** Bring a stored identity back. Null if it is damaged or does not match itself. */
export async function linkLoadIdentity(stored: unknown): Promise<LinkIdentity | null> {
  try {
    const s = stored as LinkStoredIdentity | null;
    const jwk = s && s.v === 1 ? s.jwk : null;
    if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null;
    if (typeof jwk.d !== 'string' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null;
    const priv = await llSubtle().importKey('jwk', { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y }, LL_ECDSA, false, ['sign']);
    const pub = await llSubtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, LL_ECDSA, true, ['verify']);
    const spki = new Uint8Array(await llSubtle().exportKey('spki', pub));
    const identity = await llIdentity(priv, spki);
    // The private half must really belong to the public half it claims.
    const probe = llEnc.encode('dyverge/link/1/probe');
    if (!(await llVerify(spki, await identity.sign(probe), probe))) return null;
    return identity;
  } catch (e) {
    return null;
  }
}

// ── The invite ───────────────────────────────────────────────────────────────────────────────

const LL_B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function llB32(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += LL_B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += LL_B32[(acc << (5 - bits)) & 31];
  return out;
}

function llFromB32(text: string): Uint8Array | null {
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of text) {
    const v = LL_B32.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  if (acc !== 0) return null; // spare bits must be zero, so each secret has one spelling
  return Uint8Array.from(out);
}

/**
 * Two characters that catch a mistyped or misheard code: every single wrong character, and every
 * swap of two neighbours (a weighted sum modulo a prime larger than any difference). A typo check,
 * not security.
 */
function llCheckChars(text: string): string {
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += LL_B32.indexOf(text[i]!) * (i + 1);
  const v = sum % 1021;
  return LL_B32[v >> 5]! + LL_B32[v & 31]!;
}

async function llRoomFor(secret: Uint8Array): Promise<string> {
  return llHex(await llHkdf(secret, LL_EMPTY, 'dyverge/link/1/room', 16));
}

/** A one-time invite: 128 random bits, spelled so it can be read aloud, plus the room it names. */
export async function linkMakeInvite(): Promise<{ code: string; room: string }> {
  const secret = llRandom(16);
  const text = llB32(secret);
  const code = ((text + llCheckChars(text)).match(/.{1,4}/g) ?? []).join('-');
  const room = await llRoomFor(secret);
  llWipe(secret);
  return { code, room };
}

/** Read a code back. Forgiving about case, dashes, spaces, and the letters I L O. Null if wrong. */
export function linkParseInvite(code: string): { secret: Uint8Array } | null {
  const clean = String(code)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (clean.length !== 28) return null;
  const text = clean.slice(0, 26);
  const secret = llFromB32(text);
  if (!secret || secret.length !== 16) return null;
  if (llCheckChars(text) !== clean.slice(26)) return null;
  return { secret };
}

/** The room an invite names, or null if the code is not a code. */
export async function linkInviteRoom(code: string): Promise<string | null> {
  const parsed = linkParseInvite(code);
  if (!parsed) return null;
  const room = await llRoomFor(parsed.secret);
  llWipe(parsed.secret);
  return room;
}

// ── The charter: the terms, part of the keys ─────────────────────────────────────────────────

const LL_KIND = /^[a-z][a-z0-9_]{0,23}$/;
// Controls and invisible marks, which could make a line read differently from how it is stored
// (direction overrides, zero-width characters, hidden "tag" text). The other person's consent
// screen must show exactly what was agreed. Written as plain numbers, so that no invisible
// character ever sits in this file.
const LL_UNSAFE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], // controls
  [0x7f, 0x9f], // more controls
  [0xad, 0xad], // soft hyphen
  [0x34f, 0x34f], // combining grapheme joiner
  [0x61c, 0x61c], // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x17b4, 0x17b5], // Khmer inherent vowels
  [0x180b, 0x180f], // Mongolian selectors
  [0x200b, 0x200f], // zero-width spaces and direction marks
  [0x2028, 0x202e], // line and paragraph separators, embeddings and overrides
  [0x2060, 0x206f], // word joiner, invisible operators, isolates
  [0x3164, 0x3164], // Hangul filler
  [0xfeff, 0xfeff], // byte order mark
  [0xffa0, 0xffa0], // halfwidth Hangul filler
  [0xfff9, 0xfffb], // interlinear annotation
  [0xe0000, 0xe007f], // tag characters
];

function llUnsafeText(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    for (const [lo, hi] of LL_UNSAFE_RANGES) if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** The charter in its one spelling, or null if it breaks a rule. */
export function linkCheckCharter(input: unknown): LinkCharter | null {
  if (!input || typeof input !== 'object') return null;
  const c = input as Record<string, unknown>;
  if (!Array.isArray(c.kinds) || c.kinds.length < 1 || c.kinds.length > LINK_LIMITS.kinds) return null;
  const kinds: string[] = [];
  for (const k of c.kinds) {
    if (typeof k !== 'string' || !LL_KIND.test(k) || kinds.includes(k)) return null;
    kinds.push(k);
  }
  const ttl = c.ttlSeconds;
  if (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl < LINK_LIMITS.ttlMin || ttl > LINK_LIMITS.ttlMax) return null;
  const purpose = c.purpose;
  if (typeof purpose !== 'string' || purpose.length > LINK_LIMITS.purpose || llUnsafeText(purpose)) return null;
  return { kinds: kinds.slice().sort(), ttlSeconds: ttl, purpose: purpose.normalize('NFC') };
}

function llCanon(c: LinkCharter): Uint8Array {
  return llEnc.encode(JSON.stringify({ kinds: c.kinds, purpose: c.purpose, ttlSeconds: c.ttlSeconds, v: LINK_VERSION }));
}

function llReadCharter(bytes: Uint8Array): LinkCharter | null {
  try {
    const o = JSON.parse(llDec.decode(bytes)) as Record<string, unknown>;
    if (!o || o.v !== LINK_VERSION) return null;
    const charter = linkCheckCharter(o);
    // Only the one spelling is accepted, because the hash of these bytes is part of the keys.
    return charter && llSame(llCanon(charter), bytes) ? charter : null;
  } catch (e) {
    return null;
  }
}

// ── Frames ───────────────────────────────────────────────────────────────────────────────────

const T_KNOCK = 0x01;
const T_OPEN = 0x02;
const T_CONFIRM = 0x03;
const T_DATA = 0x10;
const T_BEAT = 0x11;
const T_SEAL = 0x12;
const T_NARROW = 0x13;
const T_READY = 0x14;
const LL_TYPES = [T_KNOCK, T_OPEN, T_CONFIRM, T_DATA, T_BEAT, T_SEAL, T_NARROW, T_READY];

const LL_HEAD = 2 + 16; // version, type, session id
const LL_KNOCK_HEAD = LL_HEAD + 65 + 12; // then the sender's fresh key and a nonce
const LL_CONFIRM_HEAD = LL_HEAD + 12;
const LL_CHAIN_HEAD = LL_HEAD + 4; // then a counter
const LL_TAG = 16;

const SEAL_CODES: Record<number, LinkSealReason> = { 1: 'they-sealed', 2: 'expired', 3: 'words-differ' };

interface LlFrame {
  bytes: Uint8Array;
  type: number;
  sid: Uint8Array;
}

function llParseFrame(text: unknown): LlFrame | null {
  if (typeof text !== 'string' || text.length > LINK_LIMITS.frame) return null;
  const bytes = llFromB64u(text);
  if (!bytes || bytes.length < LL_HEAD || bytes[0] !== LINK_VERSION) return null;
  const type = bytes[1]!;
  if (!LL_TYPES.includes(type)) return null;
  return { bytes, type, sid: bytes.subarray(2, 18) };
}

function llPad(plain: Uint8Array): Uint8Array | null {
  const size = LINK_LIMITS.buckets.find((b) => b >= plain.length + 1);
  if (!size) return null;
  const out = new Uint8Array(size);
  out.set(plain);
  out[plain.length] = 0x80;
  return out;
}

function llUnpad(padded: Uint8Array): Uint8Array | null {
  let i = padded.length - 1;
  while (i >= 0 && padded[i] === 0) i--;
  if (i < 0 || padded[i] !== 0x80) return null;
  return padded.subarray(0, i);
}

// ── Key schedule ─────────────────────────────────────────────────────────────────────────────

const LL_SIG_LISTENER = 'dyverge/link/1/sig/listener';
const LL_SIG_KNOCKER = 'dyverge/link/1/sig/knocker';
const LL_ID_LABEL = 'dyverge/link/1/id';

interface LlHandshakeKeys {
  toKnocker: Uint8Array;
  toListener: Uint8Array;
  macListener: Uint8Array;
  macKnocker: Uint8Array;
}

async function llTranscript(sid: Uint8Array, knockerPub: Uint8Array, listenerPub: Uint8Array, charterBytes: Uint8Array): Promise<Uint8Array> {
  return llSha256(
    llEnc.encode('dyverge/link/1/transcript'),
    Uint8Array.of(LINK_VERSION),
    sid,
    knockerPub,
    listenerPub,
    await llSha256(charterBytes),
  );
}

async function llHandshakeKeys(z: Uint8Array, secret: Uint8Array, t0: Uint8Array): Promise<LlHandshakeKeys> {
  const okm = await llHkdf(llCat(z, secret), t0, 'dyverge/link/1/handshake', 128);
  const keys = { toKnocker: okm.slice(0, 32), toListener: okm.slice(32, 64), macListener: okm.slice(64, 96), macKnocker: okm.slice(96, 128) };
  llWipe(okm);
  return keys;
}

async function llChains(z: Uint8Array, secret: Uint8Array, t0: Uint8Array): Promise<{ knockerToListener: Uint8Array; listenerToKnocker: Uint8Array }> {
  const root = await llHkdf(llCat(z, secret), t0, 'dyverge/link/1/root', 32);
  const knockerToListener = await llHkdf(root, LL_EMPTY, 'dyverge/link/1/chain/knocker', 32);
  const listenerToKnocker = await llHkdf(root, LL_EMPTY, 'dyverge/link/1/chain/listener', 32);
  llWipe(root);
  return { knockerToListener, listenerToKnocker };
}

/** One step of a chain: this message's key and nonce, and the next chain key. Each is used once. */
async function llStep(chainKey: Uint8Array): Promise<{ key: Uint8Array; nonce: Uint8Array; next: Uint8Array }> {
  const mk = await llHkdf(chainKey, LL_EMPTY, 'dyverge/link/1/message', 44);
  const next = await llHkdf(chainKey, LL_EMPTY, 'dyverge/link/1/chain', 32);
  const out = { key: mk.slice(0, 32), nonce: mk.slice(32, 44), next };
  llWipe(mk);
  return out;
}

const llDirection = (role: 'knocker' | 'listener'): number => (role === 'knocker' ? 0x4b : 0x4c);

// ── The link ─────────────────────────────────────────────────────────────────────────────────

interface LlChain {
  ck: Uint8Array;
  next: number;
  kept: Map<number, { key: Uint8Array; nonce: Uint8Array }>;
}

interface LlState {
  role: 'knocker' | 'listener';
  phase: LinkPhase;
  room: string;
  identity: LinkIdentity;
  expectedPeer: string | null;
  now: () => number;
  timing: LinkTiming;
  tests: boolean;
  secret: Uint8Array | null;
  inviteKey: Uint8Array | null;
  sid: Uint8Array | null;
  charter: LinkCharter | null;
  charterBytes: Uint8Array | null;
  eph: { priv: CryptoKey; pub: Uint8Array } | null;
  knockPub: Uint8Array | null;
  z: Uint8Array | null;
  t0: Uint8Array | null;
  hs: LlHandshakeKeys | null;
  knockFrame: string | null;
  openFrame: string | null;
  confirmFrame: string | null;
  lastConfirm: number;
  sending: LlChain | null;
  receiving: LlChain | null;
  peer: LinkPeer | null;
  check: string[] | null;
  localReady: boolean;
  peerReady: boolean;
  pending: { kind: string; body: string }[];
  stash: string[];
  /** The kinds agreed at the start. A narrowing can never name anything outside these. */
  baseKinds: string[];
  /** Our "ready", kept so it can be sent again if it was lost. */
  readyFrame: string | null;
  lastReady: number;
  /** True once the other side has sent anything after its "ready", so it knows the room is live. */
  peerLive: boolean;
  sentCount: number;
  receivedCount: number;
  startedAt: number;
  phaseAt: number;
  liveAt: number;
  lastHeard: number;
  lastSent: number;
}

const llIgnored = (why: LinkIgnoredWhy): LinkEvent => ({ type: 'ignored', why });
const llNewStep = (): LinkStep => ({ out: [], events: [] });

/** Run one job at a time, so overlapping calls cannot interleave and corrupt the counters. */
function llQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function llWipeChain(chain: LlChain | null): void {
  if (!chain) return;
  llWipe(chain.ck);
  for (const k of chain.kept.values()) llWipe(k.key, k.nonce);
  chain.kept.clear();
}

/** Drop every secret this link holds. The room is over; only its summary stays readable. */
function llClose(st: LlState, step: LinkStep, reason: LinkSealReason): void {
  if (st.phase === 'sealed') return;
  llWipe(st.secret, st.inviteKey, st.z, st.t0, st.knockPub);
  if (st.hs) llWipe(st.hs.toKnocker, st.hs.toListener, st.hs.macListener, st.hs.macKnocker);
  llWipeChain(st.sending);
  llWipeChain(st.receiving);
  st.secret = st.inviteKey = st.z = st.t0 = st.knockPub = null;
  st.hs = null;
  st.eph = null;
  st.sending = st.receiving = null;
  st.pending = [];
  st.stash = [];
  st.knockFrame = st.openFrame = st.confirmFrame = null;
  st.phase = 'sealed';
  step.events.push({ type: 'sealed', reason });
}

/** Encrypt one frame on the sending chain. Null if the room cannot send. */
async function llSendFrame(st: LlState, type: number, payload: Uint8Array): Promise<string | null> {
  const chain = st.sending;
  if (!chain || !st.sid) return null;
  const padded = llPad(payload);
  if (!padded) return null;
  const n = chain.next;
  if (n >= 0xffffffff) return null;
  const s = await llStep(chain.ck);
  const head = llCat(Uint8Array.of(LINK_VERSION, type), st.sid, llU32(n));
  const ct = await llSeal(s.key, s.nonce, padded, llCat(head, Uint8Array.of(llDirection(st.role))));
  llWipe(s.key, s.nonce, chain.ck);
  chain.ck = s.next;
  chain.next = n + 1;
  st.lastSent = st.now();
  st.sentCount++;
  return llB64u(llCat(head, ct));
}

/** Open one frame from the receiving chain. Changes nothing unless the frame is genuine. */
async function llOpenFrame(st: LlState, f: LlFrame): Promise<{ type: number; payload: Uint8Array } | LinkIgnoredWhy> {
  const chain = st.receiving;
  if (!chain) return 'wrong-phase';
  const b = f.bytes;
  if (b.length < LL_CHAIN_HEAD + LL_TAG) return 'bad-form';
  const n = llReadU32(b, LL_HEAD);
  const head = b.subarray(0, LL_CHAIN_HEAD);
  const ct = b.subarray(LL_CHAIN_HEAD);
  const other = st.role === 'knocker' ? 'listener' : 'knocker';
  const aad = llCat(head, Uint8Array.of(llDirection(other)));

  // A late frame whose key we kept: use it once.
  const kept = chain.kept.get(n);
  if (kept) {
    const plain = await llOpen(kept.key, kept.nonce, ct, aad);
    if (!plain) return 'bad-check';
    llWipe(kept.key, kept.nonce);
    chain.kept.delete(n);
    const body = llUnpad(plain);
    return body ? { type: f.type, payload: body } : 'bad-form';
  }
  if (n < chain.next) return 'old';
  if (n - chain.next > LINK_LIMITS.skip) return 'too-far';

  // Walk forward on copies and commit only if the frame is genuine, so garbage cannot move the chain.
  let ck = chain.ck;
  const passed: [number, { key: Uint8Array; nonce: Uint8Array }][] = [];
  let mk: { key: Uint8Array; nonce: Uint8Array; next: Uint8Array } | null = null;
  for (let i = chain.next; i <= n; i++) {
    const s = await llStep(ck);
    if (ck !== chain.ck) llWipe(ck);
    if (i === n) mk = s;
    else {
      passed.push([i, { key: s.key, nonce: s.nonce }]);
      ck = s.next;
      continue;
    }
    ck = s.next;
  }
  const plain = mk ? await llOpen(mk.key, mk.nonce, ct, aad) : null;
  if (!mk || !plain) {
    for (const [, k] of passed) llWipe(k.key, k.nonce);
    if (mk) llWipe(mk.key, mk.nonce);
    if (ck !== chain.ck) llWipe(ck);
    return 'bad-check';
  }
  llWipe(mk.key, mk.nonce, chain.ck);
  chain.ck = ck;
  chain.next = n + 1;
  for (const [i, k] of passed) chain.kept.set(i, k);
  while (chain.kept.size > LINK_LIMITS.skip) {
    const oldest = Math.min(...chain.kept.keys());
    const gone = chain.kept.get(oldest);
    if (gone) llWipe(gone.key, gone.nonce);
    chain.kept.delete(oldest);
  }
  const body = llUnpad(plain);
  return body ? { type: f.type, payload: body } : 'bad-form';
}

function llDataPayload(kind: string, body: string): Uint8Array | null {
  const k = llEnc.encode(kind);
  const text = llEnc.encode(body);
  if (k.length < 1 || k.length > LINK_LIMITS.kindLength || text.length > LINK_LIMITS.body) return null;
  return llCat(Uint8Array.of(k.length), k, text);
}

function llReadData(payload: Uint8Array): { kind: string; body: string } | null {
  const len = payload[0];
  if (len === undefined || len < 1 || len > LINK_LIMITS.kindLength || payload.length < 1 + len) return null;
  try {
    const kind = llDec.decode(payload.subarray(1, 1 + len));
    if (!LL_KIND.test(kind)) return null;
    return { kind, body: llDec.decode(payload.subarray(1 + len)) };
  } catch (e) {
    return null;
  }
}

async function llMarkReady(st: LlState, step: LinkStep): Promise<void> {
  st.localReady = true;
  const frame = await llSendFrame(st, T_READY, LL_EMPTY);
  if (frame) {
    st.readyFrame = frame;
    st.lastReady = st.now();
    step.out.push(frame);
  }
  if (st.peerReady) llGoLive(st, step);
}

function llGoLive(st: LlState, step: LinkStep): void {
  if (st.phase !== 'verify') return;
  st.phase = 'live';
  st.liveAt = st.lastHeard = st.now();
  step.events.push({ type: 'live' });
  const held = st.pending;
  st.pending = [];
  for (const m of held) if (st.charter?.kinds.includes(m.kind)) step.events.push({ type: 'message', kind: m.kind, body: m.body });
}

/** The handshake is done and both phones hold the same keys. Now the people check the words. */
async function llOpened(st: LlState, step: LinkStep, peerSpki: Uint8Array, t0: Uint8Array, pinned: boolean): Promise<void> {
  const peerHash = await llSha256(peerSpki);
  const mine = await llSha256(st.identity.publicKey);
  const knockerHash = st.role === 'knocker' ? mine : peerHash;
  const listenerHash = st.role === 'knocker' ? peerHash : mine;
  const checkBytes = await llSha256(llEnc.encode('dyverge/link/1/check'), t0, knockerHash, listenerHash);
  const fingerprint = llHex(peerHash);
  st.peer = { fingerprint, words: linkFingerprintWords(fingerprint), pinned };
  st.check = linkWords(checkBytes, 5);
  st.phase = 'verify';
  st.phaseAt = st.lastHeard = st.now();
  // The handshake secrets have done their job.
  llWipe(st.secret, st.inviteKey, st.z, st.t0);
  if (st.hs) llWipe(st.hs.toKnocker, st.hs.toListener, st.hs.macListener, st.hs.macKnocker);
  st.secret = st.inviteKey = st.z = st.t0 = null;
  st.hs = null;
  st.eph = null;
  step.events.push({ type: 'open', peer: st.peer, check: st.check.slice() });
  if (pinned) await llMarkReady(st, step);
}

async function llOnKnock(st: LlState, f: LlFrame, step: LinkStep): Promise<void> {
  if (st.sid && llSame(f.sid, st.sid)) {
    // The same knock again. A knock is sent repeatedly until it is answered, so this is normal.
    if (st.role === 'listener' && st.phase === 'handshaking' && st.openFrame && st.now() - st.lastSent >= 500) {
      // The knocker did not hear our answer. Say it again; make nothing new.
      step.out.push(st.openFrame);
      st.lastSent = st.now();
    }
    return;
  }
  if (st.role !== 'listener') return void step.events.push(llIgnored('wrong-phase'));
  if (st.phase !== 'listening' || !st.inviteKey) return void step.events.push(llIgnored('wrong-phase'));
  const b = f.bytes;
  if (b.length < LL_KNOCK_HEAD + LL_TAG + 20) return void step.events.push(llIgnored('bad-form'));
  const pub = b.slice(LL_HEAD, LL_HEAD + 65);
  const nonce = b.subarray(LL_HEAD + 65, LL_KNOCK_HEAD);
  const plain = await llOpen(st.inviteKey, nonce, b.subarray(LL_KNOCK_HEAD), b.subarray(0, LL_KNOCK_HEAD));
  if (!plain) return void step.events.push(llIgnored('unreadable'));
  const charter = llReadCharter(plain);
  if (!charter || !(await llPointOk(pub))) return void step.events.push(llIgnored('bad-form'));
  st.sid = f.sid.slice();
  st.knockPub = pub;
  st.charter = charter;
  st.baseKinds = charter.kinds.slice();
  st.charterBytes = plain.slice();
  st.phase = 'consent';
  st.phaseAt = st.now();
  step.events.push({ type: 'consent', charter: { ...charter, kinds: charter.kinds.slice() } });
}

async function llOnOpen(st: LlState, f: LlFrame, step: LinkStep): Promise<void> {
  if (st.role !== 'knocker') return; // our own answer, coming back to us
  if (st.phase === 'verify' || st.phase === 'live') {
    // The listener did not hear our confirmation and asked again. Say it again.
    if (st.confirmFrame && st.sid && llSame(f.sid, st.sid) && st.now() - st.lastConfirm >= 500) {
      step.out.push(st.confirmFrame);
      st.lastConfirm = st.now();
    }
    return;
  }
  if (st.phase !== 'knocking' || !st.eph || !st.secret || !st.sid || !st.charterBytes) {
    return void step.events.push(llIgnored('wrong-phase'));
  }
  const b = f.bytes;
  if (b.length < LL_KNOCK_HEAD + LL_TAG + LL_PROOF) return void step.events.push(llIgnored('bad-form'));
  const listenerPub = b.slice(LL_HEAD, LL_HEAD + 65);
  const nonce = b.subarray(LL_HEAD + 65, LL_KNOCK_HEAD);
  const z = await llAgree(st.eph.priv, listenerPub);
  if (!z) return void step.events.push(llIgnored('bad-form'));
  const t0 = await llTranscript(st.sid, st.eph.pub, listenerPub, st.charterBytes);
  const hs = await llHandshakeKeys(z, st.secret, t0);
  const plain = await llOpen(hs.toKnocker, nonce, b.subarray(LL_KNOCK_HEAD), b.subarray(0, LL_KNOCK_HEAD));
  const wipeAttempt = () => {
    llWipe(z, t0, hs.toKnocker, hs.toListener, hs.macListener, hs.macKnocker);
  };
  if (!plain || plain.length !== LL_PROOF) {
    wipeAttempt();
    return void step.events.push(llIgnored('unreadable'));
  }
  const listenerId = plain.slice(0, LL_SPKI);
  const sig = plain.slice(LL_SPKI, LL_SPKI + LL_SIG);
  const mac = plain.slice(LL_SPKI + LL_SIG);
  const proven =
    (await llMacOk(hs.macListener, mac, llCat(llEnc.encode(LL_ID_LABEL), listenerId))) &&
    (await llVerify(listenerId, sig, llCat(llEnc.encode(LL_SIG_LISTENER), t0)));
  if (!proven) {
    wipeAttempt();
    return llClose(st, step, 'failed');
  }
  const fingerprint = llHex(await llSha256(listenerId));
  const pinned = st.expectedPeer !== null && fingerprint === st.expectedPeer;
  if (st.expectedPeer !== null && !pinned) {
    wipeAttempt();
    return llClose(st, step, 'peer-changed');
  }
  // They are who they say. Now, and only now, we show them who we are.
  const mine = st.identity.publicKey;
  const mySig = await st.identity.sign(llCat(llEnc.encode(LL_SIG_KNOCKER), t0, await llSha256(listenerId)));
  const myMac = await llMac(hs.macKnocker, llCat(llEnc.encode(LL_ID_LABEL), mine));
  const nonce3 = llRandom(12);
  const head3 = llCat(Uint8Array.of(LINK_VERSION, T_CONFIRM), st.sid, nonce3);
  const ct3 = await llSeal(hs.toListener, nonce3, llCat(mine, mySig, myMac), head3);
  st.confirmFrame = llB64u(llCat(head3, ct3));
  st.lastConfirm = st.now();
  step.out.push(st.confirmFrame);
  const chains = await llChains(z, st.secret, t0);
  st.sending = { ck: chains.knockerToListener, next: 0, kept: new Map() };
  st.receiving = { ck: chains.listenerToKnocker, next: 0, kept: new Map() };
  st.z = z;
  st.t0 = t0;
  st.hs = hs;
  await llOpened(st, step, listenerId, t0, pinned);
}

async function llOnConfirm(st: LlState, f: LlFrame, step: LinkStep): Promise<void> {
  // Our own confirmation coming back, or one repeated after we are through: not news.
  if (st.role !== 'listener' || st.phase !== 'handshaking' || !st.hs || !st.t0 || !st.z || !st.secret) return;
  const b = f.bytes;
  if (b.length < LL_CONFIRM_HEAD + LL_TAG + LL_PROOF) return void step.events.push(llIgnored('bad-form'));
  const nonce = b.subarray(LL_HEAD, LL_CONFIRM_HEAD);
  const plain = await llOpen(st.hs.toListener, nonce, b.subarray(LL_CONFIRM_HEAD), b.subarray(0, LL_CONFIRM_HEAD));
  if (!plain || plain.length !== LL_PROOF) return void step.events.push(llIgnored('unreadable'));
  const knockerId = plain.slice(0, LL_SPKI);
  const sig = plain.slice(LL_SPKI, LL_SPKI + LL_SIG);
  const mac = plain.slice(LL_SPKI + LL_SIG);
  const proven =
    (await llMacOk(st.hs.macKnocker, mac, llCat(llEnc.encode(LL_ID_LABEL), knockerId))) &&
    (await llVerify(knockerId, sig, llCat(llEnc.encode(LL_SIG_KNOCKER), st.t0, await llSha256(st.identity.publicKey))));
  if (!proven) return llClose(st, step, 'failed');
  const fingerprint = llHex(await llSha256(knockerId));
  const pinned = st.expectedPeer !== null && fingerprint === st.expectedPeer;
  if (st.expectedPeer !== null && !pinned) return llClose(st, step, 'peer-changed');
  const chains = await llChains(st.z, st.secret, st.t0);
  st.sending = { ck: chains.listenerToKnocker, next: 0, kept: new Map() };
  st.receiving = { ck: chains.knockerToListener, next: 0, kept: new Map() };
  await llOpened(st, step, knockerId, st.t0, pinned);
  // Frames that raced ahead of the confirmation can be read now.
  const early = st.stash;
  st.stash = [];
  for (const text of early) await llOnFrame(st, text, step);
}

async function llOnChain(st: LlState, f: LlFrame, text: string, step: LinkStep): Promise<void> {
  if (st.phase === 'handshaking') {
    if (st.stash.length < LINK_LIMITS.stash) st.stash.push(text);
    return;
  }
  if (st.phase !== 'verify' && st.phase !== 'live') return void step.events.push(llIgnored('wrong-phase'));
  const opened = await llOpenFrame(st, f);
  if (typeof opened === 'string') return void step.events.push(llIgnored(opened));
  st.lastHeard = st.now();
  st.receivedCount++;
  const { type, payload } = opened;
  if (type !== T_READY) st.peerLive = true;
  if (type === T_READY) {
    st.peerReady = true;
    if (st.localReady) llGoLive(st, step);
  } else if (type === T_SEAL) {
    llClose(st, step, SEAL_CODES[payload[0] ?? 0] ?? 'they-sealed');
  } else if (type === T_NARROW) {
    try {
      const o = JSON.parse(llDec.decode(payload)) as { kinds?: unknown };
      const next = Array.isArray(o.kinds) ? (o.kinds as unknown[]) : null;
      // Only names from the original terms are allowed, each once. What stays is what both have
      // kept, so two people narrowing at the same moment end up agreeing on the smaller set.
      const fine =
        next !== null &&
        next.length <= st.baseKinds.length &&
        next.every((k, i) => typeof k === 'string' && st.baseKinds.includes(k) && next.indexOf(k) === i);
      if (!fine || !st.charter) return void step.events.push(llIgnored('not-allowed'));
      const kept = st.charter.kinds.filter((k) => (next as string[]).includes(k));
      if (kept.length !== st.charter.kinds.length) {
        st.charter = { ...st.charter, kinds: kept };
        step.events.push({ type: 'narrowed', kinds: kept.slice(), by: 'them' });
      }
    } catch (e) {
      step.events.push(llIgnored('bad-form'));
    }
  } else if (type === T_DATA) {
    const m = llReadData(payload);
    if (!m) return void step.events.push(llIgnored('bad-form'));
    if (st.phase === 'verify') {
      if (st.pending.length < LINK_LIMITS.pending) st.pending.push(m);
      else step.events.push(llIgnored('wrong-phase'));
    } else if (st.charter?.kinds.includes(m.kind)) {
      step.events.push({ type: 'message', kind: m.kind, body: m.body });
    } else {
      step.events.push(llIgnored('not-allowed'));
    }
  }
  // T_BEAT: nothing more than being heard.
}

async function llOnFrame(st: LlState, text: string, step: LinkStep): Promise<void> {
  if (st.phase === 'sealed') return void step.events.push(llIgnored('wrong-phase'));
  const f = llParseFrame(text);
  if (!f) return void step.events.push(llIgnored('bad-form'));
  if (f.type === T_KNOCK) return llOnKnock(st, f, step);
  if (!st.sid || !llSame(f.sid, st.sid)) return void step.events.push(llIgnored('wrong-session'));
  if (f.type === T_OPEN) return llOnOpen(st, f, step);
  if (f.type === T_CONFIRM) return llOnConfirm(st, f, step);
  return llOnChain(st, f, text, step);
}

function llNewState(role: 'knocker' | 'listener', opts: LinkOptions, room: string, secret: Uint8Array, inviteKey: Uint8Array): LlState {
  // A clock that never jumps back (unlike the wall clock), so a timeout cannot be stretched or skipped.
  const now = opts.now ?? (typeof performance !== 'undefined' ? () => performance.now() : Date.now);
  const t = now();
  if (opts.expectedPeer !== undefined && !/^[0-9a-f]{64}$/i.test(opts.expectedPeer)) {
    // Better to say so than to quietly never match.
    throw new LinkError('bad-peer', 'A trusted fingerprint is 64 hex characters');
  }
  return {
    role,
    phase: role === 'knocker' ? 'knocking' : 'listening',
    room,
    identity: opts.identity,
    expectedPeer: opts.expectedPeer === undefined ? null : opts.expectedPeer.toLowerCase(),
    now,
    timing: { ...LINK_TIMING, ...(opts.timing ?? {}) },
    tests: opts.exposeForTests === true,
    secret,
    inviteKey,
    sid: null,
    charter: null,
    charterBytes: null,
    eph: null,
    knockPub: null,
    z: null,
    t0: null,
    hs: null,
    knockFrame: null,
    openFrame: null,
    confirmFrame: null,
    lastConfirm: 0,
    sending: null,
    receiving: null,
    peer: null,
    check: null,
    localReady: false,
    peerReady: false,
    pending: [],
    stash: [],
    baseKinds: [],
    readyFrame: null,
    lastReady: t,
    peerLive: false,
    sentCount: 0,
    receivedCount: 0,
    startedAt: t,
    phaseAt: t,
    liveAt: t,
    lastHeard: t,
    lastSent: t,
  };
}

async function llInviteKeys(code: string): Promise<{ secret: Uint8Array; inviteKey: Uint8Array; room: string }> {
  const parsed = linkParseInvite(code);
  if (!parsed) throw new LinkError('bad-invite', 'That code is not a live link code');
  const inviteKey = await llHkdf(parsed.secret, LL_EMPTY, 'dyverge/link/1/invite', 32);
  return { secret: parsed.secret, inviteKey, room: await llRoomFor(parsed.secret) };
}

function llLink(st: LlState): Link {
  const queue = llQueue();
  const refuse = (code: string, message: string): never => {
    throw new LinkError(code, message);
  };

  const link: Link = {
    role: st.role,
    room: st.room,
    phase: () => st.phase,
    charter: () => (st.charter ? { ...st.charter, kinds: st.charter.kinds.slice() } : null),
    peer: () => (st.peer ? { ...st.peer, words: st.peer.words.slice() } : null),
    check: () => (st.check ? st.check.slice() : null),
    stats: () => ({ sent: st.sentCount, received: st.receivedCount, missing: st.receiving ? st.receiving.kept.size : 0 }),

    receive: (text) =>
      queue(async () => {
        const step = llNewStep();
        try {
          await llOnFrame(st, text, step);
        } catch (e) {
          // Whatever arrived, it must not be able to stop the phone.
          step.events.push(llIgnored('bad-form'));
        }
        return step;
      }),

    accept: () =>
      queue(async () => {
        const step = llNewStep();
        if (st.role !== 'listener' || st.phase !== 'consent' || !st.sid || !st.knockPub || !st.charterBytes || !st.secret) {
          return refuse('wrong-phase', 'There is no knock to answer');
        }
        const eph = await llEphemeral();
        const z = await llAgree(eph.priv, st.knockPub);
        if (!z) {
          llClose(st, step, 'failed');
          return step;
        }
        const t0 = await llTranscript(st.sid, st.knockPub, eph.pub, st.charterBytes);
        const hs = await llHandshakeKeys(z, st.secret, t0);
        const mine = st.identity.publicKey;
        const sig = await st.identity.sign(llCat(llEnc.encode(LL_SIG_LISTENER), t0));
        const mac = await llMac(hs.macListener, llCat(llEnc.encode(LL_ID_LABEL), mine));
        const nonce = llRandom(12);
        const head = llCat(Uint8Array.of(LINK_VERSION, T_OPEN), st.sid, eph.pub, nonce);
        const ct = await llSeal(hs.toKnocker, nonce, llCat(mine, sig, mac), head);
        st.eph = eph;
        st.z = z;
        st.t0 = t0;
        st.hs = hs;
        st.openFrame = llB64u(llCat(head, ct));
        st.phase = 'handshaking';
        st.phaseAt = st.lastSent = st.now();
        step.out.push(st.openFrame);
        return step;
      }),

    decline: () =>
      queue(async () => {
        const step = llNewStep();
        if (st.role !== 'listener' || st.phase !== 'consent') return refuse('wrong-phase', 'There is no knock to decline');
        llClose(st, step, 'declined');
        return step; // nothing is sent, on purpose
      }),

    verified: (match) =>
      queue(async () => {
        const step = llNewStep();
        if (st.phase !== 'verify') return refuse('wrong-phase', 'There is nothing to check yet');
        if (st.localReady) return step;
        if (!match) {
          const frame = await llSendFrame(st, T_SEAL, Uint8Array.of(3));
          if (frame) step.out.push(frame);
          llClose(st, step, 'words-differ');
          return step;
        }
        await llMarkReady(st, step);
        return step;
      }),

    send: (kind, body) =>
      queue(async () => {
        const step = llNewStep();
        if (st.phase !== 'live') return refuse('not-live', 'The room is not open');
        if (!st.charter?.kinds.includes(kind)) return refuse('not-allowed', 'That kind of message was not agreed');
        const payload = llDataPayload(kind, body);
        if (!payload) return refuse('too-big', 'That message is too long');
        const frame = await llSendFrame(st, T_DATA, payload);
        if (!frame) return refuse('not-live', 'The room cannot send');
        step.out.push(frame);
        return step;
      }),

    narrow: (kinds) =>
      queue(async () => {
        const step = llNewStep();
        if (st.phase !== 'live' || !st.charter) return refuse('not-live', 'The room is not open');
        const now = st.charter.kinds;
        const fine =
          Array.isArray(kinds) &&
          kinds.length <= now.length &&
          kinds.every((k, i) => typeof k === 'string' && now.includes(k) && kinds.indexOf(k) === i);
        if (!fine) return refuse('widen', 'A room can be narrowed, never widened');
        const frame = await llSendFrame(st, T_NARROW, llEnc.encode(JSON.stringify({ kinds: kinds.slice().sort() })));
        if (!frame) return refuse('not-live', 'The room cannot send');
        step.out.push(frame);
        st.charter = { ...st.charter, kinds: kinds.slice().sort() };
        step.events.push({ type: 'narrowed', kinds: st.charter.kinds.slice(), by: 'you' });
        return step;
      }),

    tick: () =>
      queue(async () => {
        const step = llNewStep();
        const t = st.now();
        const { timing } = st;
        if (st.phase === 'knocking') {
          if (t - st.startedAt > timing.knockMs) llClose(st, step, 'no-answer');
          else if (st.knockFrame && t - st.lastSent >= timing.resendMs) {
            step.out.push(st.knockFrame);
            st.lastSent = t;
          }
        } else if (st.phase === 'listening') {
          if (t - st.startedAt > timing.knockMs) llClose(st, step, 'no-answer');
        } else if (st.phase === 'consent') {
          if (t - st.phaseAt > timing.consentMs) llClose(st, step, 'expired');
        } else if (st.phase === 'handshaking') {
          if (t - st.phaseAt > timing.handshakeMs) llClose(st, step, 'failed');
          else if (st.openFrame && t - st.lastSent >= timing.resendMs) {
            step.out.push(st.openFrame);
            st.lastSent = t;
          }
        } else if (st.phase === 'verify') {
          if (t - st.phaseAt > timing.verifyMs) {
            const frame = await llSendFrame(st, T_SEAL, Uint8Array.of(2));
            if (frame) step.out.push(frame);
            llClose(st, step, 'expired');
          } else if (st.readyFrame && !st.peerReady && t - st.lastReady >= timing.resendMs) {
            // Our "ready" may not have arrived. The same frame again is harmless if it did.
            step.out.push(st.readyFrame);
            st.lastReady = t;
          }
        } else if (st.phase === 'live') {
          const ttl = (st.charter?.ttlSeconds ?? 0) * 1000;
          if (t - st.liveAt > ttl) {
            const frame = await llSendFrame(st, T_SEAL, Uint8Array.of(2));
            if (frame) step.out.push(frame);
            llClose(st, step, 'expired');
          } else if (t - st.lastHeard > timing.staleMs) {
            llClose(st, step, 'peer-gone');
          } else {
            if (st.readyFrame && !st.peerLive && t - st.lastReady >= timing.resendMs) {
              // They have said nothing since going live, so they may not have our "ready".
              step.out.push(st.readyFrame);
              st.lastReady = t;
            }
            if (t - st.lastSent >= timing.beatMs) {
              const frame = await llSendFrame(st, T_BEAT, LL_EMPTY);
              if (frame) step.out.push(frame);
            }
          }
        }
        return step;
      }),

    seal: (opts) =>
      queue(async () => {
        const step = llNewStep();
        if (st.phase === 'sealed') return step;
        if (!opts?.quietly && st.sending && (st.phase === 'verify' || st.phase === 'live')) {
          const frame = await llSendFrame(st, T_SEAL, Uint8Array.of(1));
          if (frame) step.out.push(frame);
        }
        llClose(st, step, 'you-sealed');
        return step;
      }),
  };

  if (st.tests) {
    const seam: LinkTestSeam = {
      dump: () => ({
        sending: st.sending ? { next: st.sending.next, chainKey: st.sending.ck.slice() } : null,
        receiving: st.receiving
          ? { next: st.receiving.next, chainKey: st.receiving.ck.slice(), kept: [...st.receiving.kept.keys()] }
          : null,
      }),
      hold: () => ({ sending: st.sending ? st.sending.ck : null, receiving: st.receiving ? st.receiving.ck : null }),
      sendUnchecked: (kind, body) =>
        queue(async () => {
          const step = llNewStep();
          const payload = llDataPayload(kind, body);
          const frame = payload ? await llSendFrame(st, T_DATA, payload) : null;
          if (frame) step.out.push(frame);
          return step;
        }),
      sendRaw: (type, payload) =>
        queue(async () => {
          const step = llNewStep();
          const frame = await llSendFrame(st, type, payload);
          if (frame) step.out.push(frame);
          return step;
        }),
    };
    Object.defineProperty(link, '__test', { value: seam, enumerable: false });
  }
  return link;
}

// ── Starting a link ──────────────────────────────────────────────────────────────────────────

/**
 * Knock: the person who made the invite starts here. `step.out` holds the knock to put on the
 * channel named by `link.room`. Keep calling `tick()`: the knock is sent again until it is
 * answered, because a live channel only delivers to whoever is listening at that moment.
 */
export async function linkKnock(opts: LinkKnockOptions): Promise<{ link: Link; step: LinkStep }> {
  const charter = linkCheckCharter(opts.charter);
  if (!charter) throw new LinkError('bad-charter', 'Those terms are not allowed');
  const { secret, inviteKey, room } = await llInviteKeys(opts.invite);
  const st = llNewState('knocker', opts, room, secret, inviteKey);
  st.sid = llRandom(16);
  st.eph = await llEphemeral();
  st.charter = charter;
  st.baseKinds = charter.kinds.slice();
  st.charterBytes = llCanon(charter);
  const nonce = llRandom(12);
  const head = llCat(Uint8Array.of(LINK_VERSION, T_KNOCK), st.sid, st.eph.pub, nonce);
  const ct = await llSeal(inviteKey, nonce, st.charterBytes, head);
  st.knockFrame = llB64u(llCat(head, ct));
  const link = llLink(st);
  return { link, step: { out: [st.knockFrame], events: [] } };
}

/** Listen: the person who was given the invite starts here, and waits for the knock. */
export async function linkListen(opts: LinkListenOptions): Promise<Link> {
  const { secret, inviteKey, room } = await llInviteKeys(opts.invite);
  return llLink(llNewState('listener', opts, room, secret, inviteKey));
}
