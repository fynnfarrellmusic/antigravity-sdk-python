import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  LINK_LIMITS,
  LINK_TIMING,
  LINK_WORDS,
  LinkError,
  linkCheckCharter,
  linkCreateIdentity,
  linkFingerprintWords,
  linkInviteRoom,
  linkKnock,
  linkListen,
  linkLoadIdentity,
  linkMakeInvite,
  linkParseInvite,
  linkWords,
} from '../src/index.ts';
import type { Link, LinkCharter, LinkEvent, LinkIdentity, LinkStep } from '../src/index.ts';

// ── A small world: two phones, a clock, and a relay between them that can be made hostile ────

const CHARTER: LinkCharter = { kinds: ['words', 'card'], ttlSeconds: 600, purpose: 'A made-up conversation to try the app' };

const makeClock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
};

interface Side {
  link: Link;
  events: LinkEvent[];
  id: LinkIdentity;
}

type Who = 'a' | 'b';

interface Room {
  a: Side; // the one who knocks
  b: Side; // the one who is knocked on
  clock: ReturnType<typeof makeClock>;
  code: string;
  knock: LinkStep;
  log: { from: Who; frame: string }[];
  /** What the relay does with each frame. Returns what to deliver instead (none, one, many, altered). */
  relay: null | ((frame: string, from: Who) => string[]);
}

interface SetupOptions {
  charter?: LinkCharter;
  pin?: boolean;
  /** Write the pinned fingerprints in capitals, which are the same fingerprints. */
  upper?: boolean;
  expectA?: string;
  expectB?: string;
  timing?: Partial<typeof LINK_TIMING>;
}

async function setup(over: SetupOptions = {}): Promise<Room> {
  const clock = makeClock();
  const [ia, ib] = await Promise.all([linkCreateIdentity(), linkCreateIdentity()]);
  const { code } = await linkMakeInvite();
  const base = { invite: code, now: clock.now, exposeForTests: true, timing: over.timing };
  const shout = (s: string) => (over.upper ? s.toUpperCase() : s);
  const k = await linkKnock({
    ...base,
    identity: ia.identity,
    charter: over.charter ?? CHARTER,
    expectedPeer: over.expectA ?? (over.pin ? shout(ib.identity.fingerprint) : undefined),
  });
  const l = await linkListen({
    ...base,
    identity: ib.identity,
    expectedPeer: over.expectB ?? (over.pin ? shout(ia.identity.fingerprint) : undefined),
  });
  return {
    a: { link: k.link, events: [], id: ia.identity },
    b: { link: l, events: [], id: ib.identity },
    clock,
    code,
    knock: k.step,
    log: [],
    relay: null,
  };
}

/** Carry frames across the relay, and everything they cause, until the room goes quiet. */
async function run(room: Room, from: Who, frames: string[]): Promise<void> {
  const queue: { from: Who; frames: string[] }[] = [{ from, frames }];
  while (queue.length) {
    const job = queue.shift()!;
    const to = job.from === 'a' ? room.b : room.a;
    for (const frame of job.frames) {
      room.log.push({ from: job.from, frame });
      const delivered = room.relay ? room.relay(frame, job.from) : [frame];
      for (const f of delivered) {
        const step = await to.link.receive(f);
        to.events.push(...step.events);
        if (step.out.length) queue.push({ from: job.from === 'a' ? 'b' : 'a', frames: step.out });
      }
    }
  }
}

async function act(room: Room, who: Who, step: LinkStep): Promise<void> {
  room[who].events.push(...step.events);
  await run(room, who, step.out);
}

/** The knock is heard and the door is opened: both phones now show the five words. */
async function meet(room: Room): Promise<void> {
  await act(room, 'a', room.knock);
  await act(room, 'b', await room.b.link.accept());
}

/** Everyone does what a careful person does: compares the words (if asked) and says they match. */
async function goLive(room: Room): Promise<void> {
  await meet(room);
  for (const who of ['a', 'b'] as const) {
    if (room[who].link.phase() === 'verify') await act(room, who, await room[who].link.verified(true));
  }
  assert.equal(room.a.link.phase(), 'live');
  assert.equal(room.b.link.phase(), 'live');
}

const messagesOf = (side: Side) => side.events.flatMap((e) => (e.type === 'message' ? [e] : []));
const bodiesOf = (side: Side) => messagesOf(side).map((m) => m.body);
const ignoredOf = (events: LinkEvent[]) => events.flatMap((e) => (e.type === 'ignored' ? [e.why] : []));
const isLinkError = (code: string) => (e: unknown) => e instanceof LinkError && e.code === code;
const only = (step: LinkStep): string => {
  assert.equal(step.out.length, 1);
  return step.out[0]!;
};

/** A seeded source of luck, so a failure can be replayed. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Identity ─────────────────────────────────────────────────────────────────────────────────

describe('a device key (the nearest thing to a login that needs no account)', () => {
  it('has a stable fingerprint and comes back whole from storage', async () => {
    const { identity, stored } = await linkCreateIdentity();
    assert.match(identity.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(identity.publicKey.length, 91);
    const again = await linkLoadIdentity(JSON.parse(JSON.stringify(stored)));
    assert.ok(again);
    assert.equal(again.fingerprint, identity.fingerprint);
    assert.deepEqual([...again.publicKey], [...identity.publicKey]);
  });

  it('refuses a damaged key, or a private half that belongs to someone else', async () => {
    const one = await linkCreateIdentity();
    const two = await linkCreateIdentity();
    assert.equal(await linkLoadIdentity(null), null);
    assert.equal(await linkLoadIdentity('nonsense'), null);
    assert.equal(await linkLoadIdentity({ v: 2, jwk: one.stored.jwk }), null);
    assert.equal(await linkLoadIdentity({ v: 1, jwk: { kty: 'EC', crv: 'P-256' } }), null);
    assert.equal(await linkLoadIdentity({ v: 1, jwk: { ...one.stored.jwk, d: two.stored.jwk.d } }), null);
  });

  it('shows a fingerprint as six words people can compare', () => {
    assert.deepEqual(linkFingerprintWords('ab'.repeat(32)), Array(6).fill(LINK_WORDS[0xab]));
    assert.deepEqual(linkFingerprintWords('nope'), []);
    assert.deepEqual(linkFingerprintWords('AB'.repeat(32)), []);
  });
});

describe('the word list', () => {
  it('has 256 easy words that are hard to confuse when spoken', () => {
    assert.equal(LINK_WORDS.length, 256);
    assert.equal(new Set(LINK_WORDS).size, 256);
    for (const w of LINK_WORDS) assert.match(w, /^[a-z]{3,8}$/, w);
    assert.equal(new Set(LINK_WORDS.map((w) => w.slice(0, 3))).size, 256, 'each word starts differently');
  });

  it('keeps its order, because the order is part of the protocol', () => {
    assert.deepEqual(linkWords(Uint8Array.of(0, 1, 2, 255), 4), ['acorn', 'amber', 'anchor', 'zucchini']);
    assert.deepEqual(linkWords(Uint8Array.of(7, 8), 5), [LINK_WORDS[7], LINK_WORDS[8]]);
  });
});

// ── The invite ───────────────────────────────────────────────────────────────────────────────

describe('the invite', () => {
  it('is a readable one-time code, and it names a room nobody could guess', async () => {
    const a = await linkMakeInvite();
    const b = await linkMakeInvite();
    assert.match(a.code, /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.match(a.room, /^[0-9a-f]{32}$/);
    assert.notEqual(a.code, b.code);
    assert.notEqual(a.room, b.room);
    assert.equal(await linkInviteRoom(a.code), a.room);
    assert.equal(await linkInviteRoom('not a code'), null);
  });

  it('is read back however it was typed or said', async () => {
    const { code } = await linkMakeInvite();
    const want = linkParseInvite(code);
    assert.ok(want);
    const variants = [
      code.toLowerCase(),
      code.replace(/-/g, ' '),
      code.replace(/-/g, ''),
      `  ${code}\n`,
      code.replace(/1/g, 'l').replace(/0/g, 'o'),
    ];
    for (const v of variants) assert.deepEqual([...linkParseInvite(v)!.secret], [...want.secret], v);
  });

  it('catches every single wrong character and every swap of neighbours', async () => {
    const { code } = await linkMakeInvite();
    const flat = code.replace(/-/g, '');
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let tried = 0;
    for (let i = 0; i < flat.length; i++) {
      for (const ch of alphabet) {
        if (ch === flat[i]) continue;
        tried++;
        assert.equal(linkParseInvite(flat.slice(0, i) + ch + flat.slice(i + 1)), null, `position ${i} became ${ch}`);
      }
    }
    assert.equal(tried, 28 * 31);
    for (let i = 0; i < 25; i++) {
      if (flat[i] === flat[i + 1]) continue;
      const swapped = flat.slice(0, i) + flat[i + 1] + flat[i] + flat.slice(i + 2);
      assert.equal(linkParseInvite(swapped), null, `swap at ${i}`);
    }
  });

  it('refuses things that are not codes', () => {
    for (const bad of ['', 'short', 'U'.repeat(28), '0'.repeat(27), undefined, null, 42]) {
      assert.equal(linkParseInvite(bad as unknown as string), null, String(bad));
    }
  });
});

// ── The terms ────────────────────────────────────────────────────────────────────────────────

describe('the terms (the charter)', () => {
  it('has one spelling, so both phones hash the same thing', () => {
    const c = linkCheckCharter({ kinds: ['words', 'card'], ttlSeconds: 600, purpose: 'caf' + String.fromCharCode(0x65, 0x301) });
    assert.deepEqual(c, { kinds: ['card', 'words'], ttlSeconds: 600, purpose: 'caf' + String.fromCharCode(0xe9) });
  });

  it('refuses terms that could mislead the person reading them', () => {
    const good = { kinds: ['words'], ttlSeconds: 600, purpose: 'ok' };
    assert.ok(linkCheckCharter(good));
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      { ...good, kinds: [] },
      { ...good, kinds: Array.from({ length: 9 }, (_, i) => `k${i}`) },
      { ...good, kinds: ['Words'] },
      { ...good, kinds: ['1words'] },
      { ...good, kinds: ['a'.repeat(25)] },
      { ...good, kinds: ['words', 'words'] },
      { ...good, kinds: [5] },
      { ...good, ttlSeconds: 59 },
      { ...good, ttlSeconds: 3601 },
      { ...good, ttlSeconds: 600.5 },
      { ...good, ttlSeconds: '600' },
      { ...good, purpose: 'x'.repeat(81) },
      { ...good, purpose: 'line\nbreak' },
      { ...good, purpose: 'hidden' + String.fromCodePoint(0x202e) + 'text' },
      { ...good, purpose: 'zero' + String.fromCodePoint(0x200b) + 'width' },
      { ...good, purpose: 'soft' + String.fromCodePoint(0xad) + 'hyphen' },
      { ...good, purpose: 'tag' + String.fromCodePoint(0xe0041) + 'char' },
      { ...good, purpose: 'joiner' + String.fromCodePoint(0x2060) + 'x' },
      { ...good, purpose: String.fromCodePoint(0xfeff) + 'bom' },
      { ...good, purpose: 'line' + String.fromCodePoint(0x2028) + 'separator' },
      { ...good, purpose: 5 },
    ];
    for (const b of bad) assert.equal(linkCheckCharter(b), null, JSON.stringify(b));
  });
});

// ── Knocking, consent, and the handshake ─────────────────────────────────────────────────────

describe('opening the door', () => {
  it('opens only after the other person says yes, and both then see the same five words', async () => {
    const room = await setup();
    assert.equal(room.a.link.phase(), 'knocking');
    assert.equal(room.b.link.phase(), 'listening');
    assert.equal(room.a.link.room, room.b.link.room);

    await act(room, 'a', room.knock);
    assert.equal(room.b.link.phase(), 'consent');
    const consent = room.b.events.find((e) => e.type === 'consent');
    assert.deepEqual(consent?.type === 'consent' ? consent.charter : null, linkCheckCharter(CHARTER));
    assert.deepEqual(room.a.events, [], 'nothing has come back yet');
    assert.equal(room.log.length, 1, 'only the knock is on the wire');

    await act(room, 'b', await room.b.link.accept());
    assert.equal(room.a.link.phase(), 'verify');
    assert.equal(room.b.link.phase(), 'verify');
    const check = room.a.link.check();
    assert.equal(check?.length, 5);
    assert.deepEqual(check, room.b.link.check());
    assert.equal(room.a.link.peer()?.fingerprint, room.b.id.fingerprint);
    assert.equal(room.b.link.peer()?.fingerprint, room.a.id.fingerprint);
    assert.equal(room.a.link.peer()?.pinned, false);
    for (const side of [room.a, room.b]) {
      const open = side.events.find((e) => e.type === 'open');
      assert.deepEqual(open?.type === 'open' ? open.check : null, check);
    }

    await act(room, 'a', await room.a.link.verified(true));
    assert.equal(room.a.link.phase(), 'verify', 'still waiting for the other person to check');
    await act(room, 'b', await room.b.link.verified(true));
    assert.equal(room.a.link.phase(), 'live');
    assert.equal(room.b.link.phase(), 'live');
    for (const side of [room.a, room.b]) assert.ok(side.events.some((e) => e.type === 'live'));
  });

  it('says nothing at all when the answer is no', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    const before = room.log.length;
    const step = await room.b.link.decline();
    assert.deepEqual(step.out, []);
    assert.deepEqual(step.events, [{ type: 'sealed', reason: 'declined' }]);
    assert.equal(room.b.link.phase(), 'sealed');

    for (let i = 0; i < 4; i++) {
      room.clock.advance(LINK_TIMING.resendMs);
      await act(room, 'a', await room.a.link.tick());
    }
    assert.ok(room.log.length > before, 'the knocker kept knocking');
    assert.deepEqual(room.a.events, [], 'and heard nothing back, not even a refusal');
    room.clock.advance(LINK_TIMING.knockMs);
    await act(room, 'a', await room.a.link.tick());
    assert.deepEqual(room.a.events, [{ type: 'sealed', reason: 'no-answer' }]);
  });

  it('makes no keys of its own until the person agrees', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    assert.equal(room.b.link.phase(), 'consent');
    assert.deepEqual(room.b.link.__test!.dump(), { sending: null, receiving: null });
    assert.equal(room.log.length, 1, 'the listener has sent nothing');
  });

  it('keeps the terms from anyone without the invite', async () => {
    const room = await setup();
    const stranger = await linkListen({ invite: (await linkMakeInvite()).code, identity: (await linkCreateIdentity()).identity });
    const step = await stranger.receive(only(room.knock));
    assert.deepEqual(step.events, [{ type: 'ignored', why: 'unreadable' }]);
    assert.equal(stranger.phase(), 'listening');

    const frame = only(room.knock);
    const raw = Buffer.from(frame, 'base64url');
    for (const secret of [CHARTER.purpose, 'words', 'card', 'ttl']) assert.ok(!raw.includes(Buffer.from(secret)), secret);
    assert.ok(!raw.includes(Buffer.from(room.a.id.publicKey)), 'the knocker does not show who they are');
  });

  it('says plainly when a code or the terms are not acceptable', async () => {
    const id = (await linkCreateIdentity()).identity;
    await assert.rejects(linkListen({ identity: id, invite: 'nonsense' }), isLinkError('bad-invite'));
    await assert.rejects(linkKnock({ identity: id, invite: 'nonsense', charter: CHARTER }), isLinkError('bad-invite'));
    const { code } = await linkMakeInvite();
    await assert.rejects(linkKnock({ identity: id, invite: code, charter: { ...CHARTER, kinds: [] } }), isLinkError('bad-charter'));
  });

  it('says so when a trusted fingerprint is not one, instead of quietly never matching', async () => {
    const id = (await linkCreateIdentity()).identity;
    const { code } = await linkMakeInvite();
    for (const bad of ['', 'abc', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
      await assert.rejects(linkListen({ identity: id, invite: code, expectedPeer: bad }), isLinkError('bad-peer'), bad);
      await assert.rejects(linkKnock({ identity: id, invite: code, charter: CHARTER, expectedPeer: bad }), isLinkError('bad-peer'), bad);
    }
    const room = await setup({ pin: true, upper: true });
    await meet(room);
    assert.equal(room.a.link.phase(), 'live', 'capitals are the same fingerprint');
    assert.equal(room.a.link.peer()?.pinned, true);
  });

  it('only lets the listener answer, and only once there is a knock', async () => {
    const room = await setup();
    await assert.rejects(room.b.link.accept(), isLinkError('wrong-phase'));
    await assert.rejects(room.b.link.decline(), isLinkError('wrong-phase'));
    await assert.rejects(room.a.link.accept(), isLinkError('wrong-phase'));
    await assert.rejects(room.a.link.verified(true), isLinkError('wrong-phase'));
  });
});

describe('a channel that drops things', () => {
  it('knocks again until answered, because a live channel only reaches whoever is there', async () => {
    const room = await setup();
    room.clock.advance(LINK_TIMING.resendMs - 1);
    assert.deepEqual((await room.a.link.tick()).out, [], 'not yet');
    room.clock.advance(1);
    const again = await room.a.link.tick();
    assert.equal(again.out[0], only(room.knock), 'the same knock, not a new one');
    await act(room, 'a', again);
    assert.equal(room.b.link.phase(), 'consent');
    await act(room, 'b', await room.b.link.accept());
    assert.equal(room.a.link.phase(), 'verify');
    room.clock.advance(LINK_TIMING.resendMs * 3);
    assert.deepEqual((await room.a.link.tick()).out, [], 'answered, so no more knocking');
  });

  it('recovers when the answer is lost', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    room.relay = (frame, from) => (from === 'b' ? [] : [frame]);
    await act(room, 'b', await room.b.link.accept());
    assert.equal(room.a.link.phase(), 'knocking');
    room.relay = null;
    room.clock.advance(LINK_TIMING.resendMs);
    await act(room, 'a', await room.a.link.tick());
    assert.equal(room.a.link.phase(), 'verify');
    assert.equal(room.b.link.phase(), 'verify');
    assert.deepEqual(room.a.link.check(), room.b.link.check());
  });

  it('recovers when the confirmation is lost', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    room.relay = (frame, from) => (from === 'a' ? [] : [frame]);
    await act(room, 'b', await room.b.link.accept());
    assert.equal(room.a.link.phase(), 'verify');
    assert.equal(room.b.link.phase(), 'handshaking');
    room.relay = null;
    room.clock.advance(LINK_TIMING.resendMs);
    await act(room, 'b', await room.b.link.tick());
    assert.equal(room.b.link.phase(), 'verify');
    assert.deepEqual(room.a.link.check(), room.b.link.check());
  });

  it('recovers when a "ready" is lost, whichever way it was going', async () => {
    for (const lost of ['a', 'b'] as const) {
      const room = await setup();
      await meet(room);
      const first: Who = lost === 'a' ? 'b' : 'a';
      await act(room, first, await room[first].link.verified(true));
      room.relay = (frame, from) => (from === lost ? [] : [frame]);
      await act(room, lost, await room[lost].link.verified(true));
      room.relay = null;
      assert.equal(room[lost].link.phase(), 'live', `${lost} has heard ${first}`);
      assert.equal(room[first].link.phase(), 'verify', `${first} has not heard ${lost}`);
      room.clock.advance(LINK_TIMING.resendMs);
      await act(room, lost, await room[lost].link.tick());
      assert.equal(room[first].link.phase(), 'live', `${first} hears it the second time`);
      assert.ok(room[first].events.some((e) => e.type === 'live'));
    }
  });

  it('does not make a fuss about a knock it has already heard', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    const knock = only(room.knock);
    assert.deepEqual((await room.b.link.receive(knock)).events, [], 'again, while the person decides');
    assert.deepEqual((await room.a.link.receive(knock)).events, [], 'the knocker hearing its own knock');
  });

  it('keeps a frame that raced ahead of the confirmation', async () => {
    const room = await setup();
    await act(room, 'a', room.knock);
    const open = await room.b.link.accept();
    const toA = await room.a.link.receive(only(open));
    room.a.events.push(...toA.events);
    const confirm = only(toA);
    const ready = await room.a.link.verified(true);
    const early = await room.b.link.receive(only(ready));
    assert.equal(room.b.link.phase(), 'handshaking');
    assert.deepEqual(early.events, []);

    await act(room, 'b', await room.b.link.receive(confirm));
    assert.equal(room.b.link.phase(), 'verify');
    await act(room, 'b', await room.b.link.verified(true));
    assert.equal(room.a.link.phase(), 'live');
    assert.equal(room.b.link.phase(), 'live', 'their ready was kept, not lost');
  });

  it('gives up quietly when nobody answers, decides, or finishes', async () => {
    // The knocker is never answered.
    let room = await setup();
    room.clock.advance(LINK_TIMING.knockMs + 1);
    let step = await room.a.link.tick();
    assert.deepEqual(step, { out: [], events: [{ type: 'sealed', reason: 'no-answer' }] });

    // The listener never hears a knock.
    room = await setup();
    room.clock.advance(LINK_TIMING.knockMs + 1);
    assert.deepEqual((await room.b.link.tick()).events, [{ type: 'sealed', reason: 'no-answer' }]);

    // The listener hears it and never decides.
    room = await setup();
    await act(room, 'a', room.knock);
    room.clock.advance(LINK_TIMING.consentMs + 1);
    step = await room.b.link.tick();
    assert.deepEqual(step, { out: [], events: [{ type: 'sealed', reason: 'expired' }] });

    // The listener agrees, then never hears the rest.
    room = await setup();
    await act(room, 'a', room.knock);
    room.relay = (frame, from) => (from === 'a' ? [] : [frame]);
    await act(room, 'b', await room.b.link.accept());
    room.clock.advance(LINK_TIMING.handshakeMs + 1);
    assert.deepEqual((await room.b.link.tick()).events, [{ type: 'sealed', reason: 'failed' }]);

    // Both are through the handshake but nobody checks the words.
    room = await setup();
    await meet(room);
    room.clock.advance(LINK_TIMING.verifyMs + 1);
    await act(room, 'a', await room.a.link.tick());
    assert.deepEqual(room.a.events.at(-1), { type: 'sealed', reason: 'expired' });
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'expired' });
  });
});

// ── Checking who you are with ────────────────────────────────────────────────────────────────

describe('checking the words', () => {
  it('lets nothing through until both people have checked', async () => {
    const room = await setup();
    await meet(room);
    await assert.rejects(room.a.link.send('words', 'hi'), isLinkError('not-live'));
    await act(room, 'a', await room.a.link.verified(true));
    await assert.rejects(room.a.link.send('words', 'hi'), isLinkError('not-live'), 'A has checked, B has not');
    await assert.rejects(room.b.link.send('words', 'hi'), isLinkError('not-live'));
  });

  it('seals both sides if the words are different', async () => {
    const room = await setup();
    await meet(room);
    await act(room, 'a', await room.a.link.verified(false));
    assert.equal(room.a.link.phase(), 'sealed');
    assert.equal(room.b.link.phase(), 'sealed');
    assert.deepEqual(room.a.events.at(-1), { type: 'sealed', reason: 'words-differ' });
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'words-differ' });
  });

  it('treats a contact you already trust as checked, with no words to read', async () => {
    const room = await setup({ pin: true });
    await meet(room);
    assert.equal(room.a.link.phase(), 'live');
    assert.equal(room.b.link.phase(), 'live');
    assert.equal(room.a.link.peer()?.pinned, true);
    assert.equal(room.b.link.peer()?.pinned, true);
    await act(room, 'a', await room.a.link.send('words', 'hello again'));
    assert.deepEqual(bodiesOf(room.b), ['hello again']);
  });

  it('seals, and reveals nothing, if a trusted contact turns out to be someone else', async () => {
    const stranger = (await linkCreateIdentity()).identity.fingerprint;
    const room = await setup({ expectA: stranger });
    await meet(room);
    assert.deepEqual(room.a.events.at(-1), { type: 'sealed', reason: 'peer-changed' });
    assert.equal(room.a.events.some((e) => e.type === 'open'), false);
    assert.deepEqual(
      room.log.filter((l) => l.from === 'a').length,
      1,
      'the knocker said nothing after the knock, so it never showed who it is',
    );
    assert.equal(room.b.link.phase(), 'handshaking');
    assert.equal(room.b.events.some((e) => e.type === 'open'), false);
  });

  it('tells a listener when the person who knocked is not who they expected', async () => {
    const stranger = (await linkCreateIdentity()).identity.fingerprint;
    const room = await setup({ expectB: stranger });
    await meet(room);
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'peer-changed' });
    assert.equal(room.b.events.some((e) => e.type === 'open'), false);
  });
});

// ── Someone in the middle ────────────────────────────────────────────────────────────────────

describe('someone in the middle', () => {
  it('shows each person different words if the invite leaked and a third person answers for the second', async () => {
    const { code } = await linkMakeInvite();
    const [ia, ib, im] = await Promise.all([linkCreateIdentity(), linkCreateIdentity(), linkCreateIdentity()]);
    const base = { invite: code, charter: CHARTER };
    const a = await linkKnock({ ...base, identity: ia.identity });
    const mallory = { asListener: await linkListen({ invite: code, identity: im.identity }), asKnocker: await linkKnock({ ...base, identity: im.identity }) };
    const b = await linkListen({ invite: code, identity: ib.identity });

    // A's knock reaches Mallory, who agrees and answers as if she were B.
    await mallory.asListener.receive(only(a.step));
    const aStep = await a.link.receive(only(await mallory.asListener.accept()));
    await mallory.asListener.receive(only(aStep));
    // Mallory knocks B with a key of her own; B agrees.
    await b.receive(only(mallory.asKnocker.step));
    const mStep = await mallory.asKnocker.link.receive(only(await b.accept()));
    await b.receive(only(mStep));

    assert.equal(a.link.phase(), 'verify');
    assert.equal(b.phase(), 'verify');
    assert.equal(a.link.peer()?.fingerprint, im.identity.fingerprint, 'A is talking to Mallory');
    assert.notEqual(a.link.peer()?.fingerprint, ib.identity.fingerprint);
    assert.notDeepEqual(a.link.check(), b.check(), 'so the two people will read out different words');
  });

  it('seals at once if the person in the middle meets someone already trusted', async () => {
    const { code } = await linkMakeInvite();
    const [ia, ib, im] = await Promise.all([linkCreateIdentity(), linkCreateIdentity(), linkCreateIdentity()]);
    const a = await linkKnock({ invite: code, charter: CHARTER, identity: ia.identity, expectedPeer: ib.identity.fingerprint });
    const mallory = await linkListen({ invite: code, identity: im.identity });
    await mallory.receive(only(a.step));
    const step = await a.link.receive(only(await mallory.accept()));
    assert.deepEqual(step.out, []);
    assert.deepEqual(step.events, [{ type: 'sealed', reason: 'peer-changed' }]);
  });

  it('lets an eavesdropper who lacks the invite neither read nor join', async () => {
    const room = await setup();
    const sid = Buffer.from(only(room.knock), 'base64url').subarray(2, 18);
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const epk = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey));
    // A well-formed answer with a real key but without the secrets, as a forger might build it.
    const forged = Buffer.concat([Buffer.from([1, 2]), sid, epk, randomBytes(12), randomBytes(16 + 187)]);
    const step = await room.a.link.receive(forged.toString('base64url'));
    assert.deepEqual(step.events, [{ type: 'ignored', why: 'unreadable' }]);
    assert.deepEqual(step.out, []);
    assert.equal(room.a.link.phase(), 'knocking');
    await act(room, 'a', room.knock);
    await act(room, 'b', await room.b.link.accept());
    assert.equal(room.a.link.phase(), 'verify', 'and the real handshake still works');
  });
});

// ── Answers forged by someone who holds the invite ──────────────────────────────────────
// An independent copy of the handshake, written from the design note and not from the code, plays
// the other side. Given the honest key it must be accepted (so the note and the code agree). Given
// a borrowed key, or a proof bound to a different key, it must be refused (so each check is there).

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;
const cat = (...parts: Uint8Array[]): Buffer => Buffer.concat(parts);

async function sha(...parts: Uint8Array[]): Promise<Buffer> {
  return Buffer.from(await subtle.digest('SHA-256', cat(...parts) as BufferSource));
}

async function hkdfBytes(ikm: Uint8Array, salt: Uint8Array, info: string, len: number): Promise<Buffer> {
  const key = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return Buffer.from(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: enc.encode(info) }, key, len * 8));
}

async function hmacBytes(key: Uint8Array, data: Uint8Array): Promise<Buffer> {
  const k = await subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Buffer.from(await subtle.sign('HMAC', k, data as BufferSource));
}

async function gcm(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, aad: Uint8Array, open = false): Promise<Buffer> {
  const k = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, [open ? 'decrypt' : 'encrypt']);
  const params = { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource, tagLength: 128 };
  return Buffer.from(open ? await subtle.decrypt(params, k, data as BufferSource) : await subtle.encrypt(params, k, data as BufferSource));
}

async function ecdhPair(): Promise<{ priv: CryptoKey; pub: Buffer }> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { priv: pair.privateKey, pub: Buffer.from(await subtle.exportKey('raw', pair.publicKey)) };
}

async function agree(priv: CryptoKey, pub: Uint8Array): Promise<Buffer> {
  const peer = await subtle.importKey('raw', pub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return Buffer.from(await subtle.deriveBits({ name: 'ECDH', public: peer }, priv, 256));
}

const charterBytes = (c: LinkCharter): Buffer => {
  const n = linkCheckCharter(c)!;
  return Buffer.from(enc.encode(JSON.stringify({ kinds: n.kinds, purpose: n.purpose, ttlSeconds: n.ttlSeconds, v: 1 })));
};

const transcript = async (sid: Uint8Array, knockerPub: Uint8Array, listenerPub: Uint8Array, charter: Uint8Array) =>
  sha(enc.encode('dyverge/link/1/transcript'), Uint8Array.of(1), sid, knockerPub, listenerPub, await sha(charter));

/** What someone presents as who they are: a public key, and a way to sign with some key. */
interface Shown {
  spki: Uint8Array;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
  /** Bind the proof to a different key than the one shown. */
  macOver?: Uint8Array;
}
const honest = (id: LinkIdentity): Shown => ({ spki: id.publicKey, sign: id.sign });
const borrowed = (shown: LinkIdentity, signer: LinkIdentity): Shown => ({ spki: shown.publicKey, sign: signer.sign });

/** Answer a knock as the listener would, but from outside the library. */
async function forgeOpen(code: string, knockFrame: string, charter: LinkCharter, shown: Shown): Promise<string> {
  const secret = linkParseInvite(code)!.secret;
  const kb = Buffer.from(knockFrame, 'base64url');
  const sid = kb.subarray(2, 18);
  const knockerPub = kb.subarray(18, 83);
  const mine = await ecdhPair();
  const z = await agree(mine.priv, knockerPub);
  const t0 = await transcript(sid, knockerPub, mine.pub, charterBytes(charter));
  const okm = await hkdfBytes(cat(z, secret), t0, 'dyverge/link/1/handshake', 128);
  const sig = await shown.sign(cat(enc.encode('dyverge/link/1/sig/listener'), t0));
  const mac = await hmacBytes(okm.subarray(64, 96), cat(enc.encode('dyverge/link/1/id'), shown.macOver ?? shown.spki));
  const nonce = randomBytes(12);
  const head = cat(Uint8Array.of(1, 2), sid, mine.pub, nonce);
  return cat(head, await gcm(okm.subarray(0, 32), nonce, cat(shown.spki, sig, mac), head)).toString('base64url');
}

/** Knock as the knocker would, but from outside the library; `finish` builds the confirmation. */
async function forgeKnock(code: string, charter: LinkCharter) {
  const secret = linkParseInvite(code)!.secret;
  const inviteKey = await hkdfBytes(secret, new Uint8Array(0), 'dyverge/link/1/invite', 32);
  const sid = randomBytes(16);
  const mine = await ecdhPair();
  const bytes = charterBytes(charter);
  const nonce = randomBytes(12);
  const head = cat(Uint8Array.of(1, 1), sid, mine.pub, nonce);
  const frame = cat(head, await gcm(inviteKey, nonce, bytes, head)).toString('base64url');
  const finish = async (openFrame: string, shown: Shown): Promise<string> => {
    const ob = Buffer.from(openFrame, 'base64url');
    const listenerPub = ob.subarray(18, 83);
    const z = await agree(mine.priv, listenerPub);
    const t0 = await transcript(sid, mine.pub, listenerPub, bytes);
    const okm = await hkdfBytes(cat(z, secret), t0, 'dyverge/link/1/handshake', 128);
    const theirs = await gcm(okm.subarray(0, 32), ob.subarray(83, 95), ob.subarray(95), ob.subarray(0, 95), true);
    const listenerId = theirs.subarray(0, 91);
    const sig = await shown.sign(cat(enc.encode('dyverge/link/1/sig/knocker'), t0, await sha(listenerId)));
    const mac = await hmacBytes(okm.subarray(96, 128), cat(enc.encode('dyverge/link/1/id'), shown.macOver ?? shown.spki));
    const nonce3 = randomBytes(12);
    const head3 = cat(Uint8Array.of(1, 3), sid, nonce3);
    return cat(head3, await gcm(okm.subarray(32, 64), nonce3, cat(shown.spki, sig, mac), head3)).toString('base64url');
  };
  return { frame, finish };
}

describe('answers forged by someone who holds the invite', () => {
  it('accepts an answer built from the design alone, so the design and the code agree', async () => {
    const room = await setup();
    const answer = await forgeOpen(room.code, only(room.knock), CHARTER, honest(room.b.id));
    const step = await room.a.link.receive(answer);
    assert.ok(step.events.some((e) => e.type === 'open'));
    assert.equal(room.a.link.phase(), 'verify');
    assert.equal(room.a.link.peer()?.fingerprint, room.b.id.fingerprint);
    assert.equal(step.out.length, 1, 'and it sends its own confirmation');
  });

  it('refuses a public key it cannot prove, even one the knocker trusts, and reveals nothing', async () => {
    for (const pin of [false, true]) {
      const room = await setup({ pin });
      const mallory = (await linkCreateIdentity()).identity;
      const answer = await forgeOpen(room.code, only(room.knock), CHARTER, borrowed(room.b.id, mallory));
      const step = await room.a.link.receive(answer);
      assert.deepEqual(step, { out: [], events: [{ type: 'sealed', reason: 'failed' }] }, `pinned: ${pin}`);
      assert.equal(room.a.link.phase(), 'sealed');
    }
  });

  it('refuses a proof that is bound to a different key than the one shown', async () => {
    const room = await setup();
    const mallory = (await linkCreateIdentity()).identity;
    const answer = await forgeOpen(room.code, only(room.knock), CHARTER, { ...honest(room.b.id), macOver: mallory.publicKey });
    const step = await room.a.link.receive(answer);
    assert.deepEqual(step, { out: [], events: [{ type: 'sealed', reason: 'failed' }] });
  });

  it('accepts a confirmation built from the design alone', async () => {
    const room = await setup();
    const knock = await forgeKnock(room.code, CHARTER);
    await room.b.link.receive(knock.frame);
    const open = await room.b.link.accept();
    const step = await room.b.link.receive(await knock.finish(only(open), honest(room.a.id)));
    assert.ok(step.events.some((e) => e.type === 'open'));
    assert.equal(room.b.link.phase(), 'verify');
    assert.equal(room.b.link.peer()?.fingerprint, room.a.id.fingerprint);
  });

  it('refuses a confirmation that shows a key it cannot prove, even one the listener trusts', async () => {
    for (const pin of [false, true]) {
      const room = await setup({ pin });
      const mallory = (await linkCreateIdentity()).identity;
      const knock = await forgeKnock(room.code, CHARTER);
      await room.b.link.receive(knock.frame);
      const open = await room.b.link.accept();
      const step = await room.b.link.receive(await knock.finish(only(open), borrowed(room.a.id, mallory)));
      assert.deepEqual(step.events, [{ type: 'sealed', reason: 'failed' }], `pinned: ${pin}`);
      assert.equal(room.b.link.phase(), 'sealed');
    }
  });

  it('refuses a confirmation whose proof is bound to a different key', async () => {
    const room = await setup();
    const mallory = (await linkCreateIdentity()).identity;
    const knock = await forgeKnock(room.code, CHARTER);
    await room.b.link.receive(knock.frame);
    const open = await room.b.link.accept();
    const step = await room.b.link.receive(await knock.finish(only(open), { ...honest(room.a.id), macOver: mallory.publicKey }));
    assert.deepEqual(step.events, [{ type: 'sealed', reason: 'failed' }]);
  });

  it('breaks the handshake if the terms are changed between the two people', async () => {
    const room = await setup();
    const secret = linkParseInvite(room.code)!.secret;
    const inviteKey = await hkdfBytes(secret, new Uint8Array(0), 'dyverge/link/1/invite', 32);
    const kb = Buffer.from(only(room.knock), 'base64url');
    // Someone holding the invite shows the listener broader terms than the knocker asked for.
    const greedy: LinkCharter = { ...CHARTER, kinds: ['words', 'card', 'secrets'], ttlSeconds: 3600 };
    const nonce = randomBytes(12);
    const head = cat(Uint8Array.of(1, 1), kb.subarray(2, 18), kb.subarray(18, 83), nonce);
    const rewritten = cat(head, await gcm(inviteKey, nonce, charterBytes(greedy), head)).toString('base64url');

    const heard = await room.b.link.receive(rewritten);
    const consent = heard.events.find((e) => e.type === 'consent');
    assert.deepEqual(consent?.type === 'consent' ? consent.charter.kinds : null, ['card', 'secrets', 'words'], 'the listener is shown the changed terms');
    const open = await room.b.link.accept(); // and says yes to what they were shown
    const step = await room.a.link.receive(only(open));
    assert.deepEqual(step.events, [{ type: 'ignored', why: 'unreadable' }], 'but the keys do not match, so nothing opens');
    assert.equal(room.a.link.phase(), 'knocking');
    assert.equal(room.b.link.phase(), 'handshaking');
  });
});


// ── Talking ──────────────────────────────────────────────────────────────────────────────────

describe('talking in the room', () => {
  it('carries words both ways, in order, whatever they are written in', async () => {
    const room = await setup();
    await goLive(room);
    const lines = ['hello', '', 'café ✓ 😀', 'שלום עולם', 'e' + String.fromCharCode(0x301) + ' and\nnew line', '€'.repeat(633)];
    for (const line of lines) await act(room, 'a', await room.a.link.send('words', line));
    for (const line of lines) await act(room, 'b', await room.b.link.send('card', line));
    assert.deepEqual(bodiesOf(room.b), lines);
    assert.deepEqual(bodiesOf(room.a), lines);
    assert.ok(messagesOf(room.b).every((m) => m.kind === 'words'));
    assert.ok(messagesOf(room.a).every((m) => m.kind === 'card'));
  });

  it('holds to its size limits', async () => {
    const room = await setup();
    await goLive(room);
    await act(room, 'a', await room.a.link.send('words', 'a'.repeat(LINK_LIMITS.body)));
    assert.equal(bodiesOf(room.b)[0]?.length, LINK_LIMITS.body);
    await assert.rejects(room.a.link.send('words', 'a'.repeat(LINK_LIMITS.body + 1)), isLinkError('too-big'));
    await assert.rejects(room.a.link.send('words', '€'.repeat(634)), isLinkError('too-big'));
    for (const l of room.log) assert.ok(l.frame.length <= LINK_LIMITS.frame, 'fits the live channel');
  });

  it('only sends kinds that were agreed, on both sides of the wire', async () => {
    const room = await setup();
    await goLive(room);
    await assert.rejects(room.a.link.send('secrets', 'x'), isLinkError('not-allowed'));
    // A phone that skipped its own check is still stopped by the receiving phone.
    await act(room, 'a', await room.a.link.__test!.sendUnchecked('secrets', 'x'));
    assert.deepEqual(messagesOf(room.b), []);
    assert.deepEqual(ignoredOf(room.b.events), ['not-allowed']);
  });

  it('can agree to less during the room, never to more', async () => {
    const room = await setup();
    await goLive(room);
    await act(room, 'a', await room.a.link.narrow(['words']));
    assert.deepEqual(room.a.link.charter()?.kinds, ['words']);
    assert.deepEqual(room.b.link.charter()?.kinds, ['words']);
    assert.deepEqual(room.b.events.at(-1), { type: 'narrowed', kinds: ['words'], by: 'them' });
    assert.deepEqual(room.a.events.at(-1), { type: 'narrowed', kinds: ['words'], by: 'you' });
    await assert.rejects(room.a.link.send('card', 'x'), isLinkError('not-allowed'));
    await assert.rejects(room.b.link.send('card', 'x'), isLinkError('not-allowed'));

    await assert.rejects(room.a.link.narrow(['words', 'card']), isLinkError('widen'));
    await assert.rejects(room.a.link.narrow(['extra']), isLinkError('widen'));
    await assert.rejects(room.a.link.narrow(['words', 'words']), isLinkError('widen'));

    // A hostile peer that tries to widen the terms changes nothing: what stays is what both kept.
    const heard = room.b.events.length;
    await act(room, 'a', await room.a.link.__test!.sendRaw(0x13, new TextEncoder().encode(JSON.stringify({ kinds: ['words', 'card'] }))));
    assert.deepEqual(room.b.link.charter()?.kinds, ['words']);
    assert.equal(room.b.events.length, heard, 'and it is not even news');
    // One that names something never agreed at all is refused outright.
    await act(room, 'a', await room.a.link.__test!.sendRaw(0x13, new TextEncoder().encode(JSON.stringify({ kinds: ['words', 'extra'] }))));
    assert.ok(ignoredOf(room.b.events).includes('not-allowed'));
    assert.deepEqual(room.b.link.charter()?.kinds, ['words']);

    // Narrowing to nothing pauses the room: still open, but nothing can cross.
    await act(room, 'b', await room.b.link.narrow([]));
    assert.deepEqual(room.a.link.charter()?.kinds, []);
    await assert.rejects(room.a.link.send('words', 'x'), isLinkError('not-allowed'));
    assert.equal(room.a.link.phase(), 'live');
  });

  it('settles on the smaller set when both narrow at the same moment', async () => {
    const room = await setup();
    await goLive(room);
    const [sa, sb] = await Promise.all([room.a.link.narrow(['words']), room.b.link.narrow(['card'])]);
    await act(room, 'a', sa);
    await act(room, 'b', sb);
    assert.deepEqual(room.a.link.charter()?.kinds, []);
    assert.deepEqual(room.b.link.charter()?.kinds, []);
    await assert.rejects(room.a.link.send('words', 'x'), isLinkError('not-allowed'));
    await assert.rejects(room.b.link.send('card', 'x'), isLinkError('not-allowed'));
  });

  it('counts what went by, and what is missing', async () => {
    const room = await setup();
    await goLive(room);
    assert.deepEqual(room.a.link.stats(), { sent: 1, received: 1, missing: 0 }, 'just the two "ready"s so far');
    const f: string[] = [];
    for (const w of ['one', 'two', 'three']) f.push(only(await room.a.link.send('words', w)));
    assert.equal(room.a.link.stats().sent, 4);
    await room.b.link.receive(f[0]!);
    await room.b.link.receive(f[2]!);
    assert.deepEqual(room.b.link.stats(), { sent: 1, received: 3, missing: 1 });
    await room.b.link.receive(f[1]!);
    assert.deepEqual(room.b.link.stats(), { sent: 1, received: 4, missing: 0 });
  });

  it('handles both people talking at once', async () => {
    const room = await setup();
    await goLive(room);
    const [sa, sb] = await Promise.all([
      Promise.all(Array.from({ length: 20 }, (_, i) => room.a.link.send('words', `a${i}`))),
      Promise.all(Array.from({ length: 20 }, (_, i) => room.b.link.send('words', `b${i}`))),
    ]);
    for (const s of sa) await act(room, 'a', s);
    for (const s of sb) await act(room, 'b', s);
    assert.deepEqual(bodiesOf(room.b), Array.from({ length: 20 }, (_, i) => `a${i}`));
    assert.deepEqual(bodiesOf(room.a), Array.from({ length: 20 }, (_, i) => `b${i}`));
  });

  it('copes with calls that overlap, handing out each counter once', async () => {
    const room = await setup();
    await goLive(room);
    const steps = await Promise.all(Array.from({ length: 25 }, (_, i) => room.a.link.send('words', `m${i}`)));
    const frames = steps.flatMap((s) => s.out);
    assert.equal(new Set(frames).size, 25);
    const received = await Promise.all(frames.map((f) => room.b.link.receive(f)));
    const bodies = received.flatMap((s) => s.events).flatMap((e) => (e.type === 'message' ? [e.body] : []));
    assert.deepEqual(bodies, Array.from({ length: 25 }, (_, i) => `m${i}`));
  });

  it('refuses nonsense control messages without being hurt by them', async () => {
    const room = await setup();
    await goLive(room);
    await act(room, 'a', await room.a.link.__test!.sendRaw(0x10, Uint8Array.of(0))); // a message with no kind
    await act(room, 'a', await room.a.link.__test!.sendRaw(0x13, new TextEncoder().encode('not json')));
    assert.deepEqual(messagesOf(room.b), []);
    assert.equal(room.b.link.phase(), 'live');
    await act(room, 'a', await room.a.link.send('words', 'still fine'));
    assert.deepEqual(bodiesOf(room.b), ['still fine']);
  });
});

// ── What the relay sees ──────────────────────────────────────────────────────────────────────

describe('what the relay can see', () => {
  it('never carries a word of what was said, or who said it, in the clear', async () => {
    const room = await setup();
    await goLive(room);
    const secrets = ['I am scared you will leave', 'what I need to hear is that I am safe', 'tuesday at six'];
    await act(room, 'a', await room.a.link.send('words', secrets[0]!));
    await act(room, 'b', await room.b.link.send('card', secrets[1]!));
    await act(room, 'a', await room.a.link.send('words', secrets[2]!));
    const hidden = [...secrets, CHARTER.purpose, 'words', 'card', room.a.id.fingerprint, room.b.id.fingerprint];
    assert.ok(room.log.length >= 8);
    for (const { frame } of room.log) {
      const bytes = Buffer.from(frame, 'base64url');
      for (const h of hidden) {
        assert.ok(!bytes.includes(Buffer.from(h)), `"${h}" is visible in a frame`);
        assert.ok(!frame.includes(h), `"${h}" is visible in the text of a frame`);
      }
      for (const key of [room.a.id.publicKey, room.b.id.publicKey]) {
        assert.ok(!bytes.includes(Buffer.from(key)), 'a public key is visible');
      }
    }
  });

  it('hides length: a yes and a paragraph look the same', async () => {
    const room = await setup();
    await goLive(room);
    const size = async (text: string) => only(await room.a.link.send('words', text)).length;
    const yes = await size('yes');
    assert.equal(await size('x'.repeat(100)), yes);
    const beat = (await (async () => { room.clock.advance(LINK_TIMING.beatMs); return room.a.link.tick(); })()).out[0]!;
    assert.equal(beat.length, yes, 'a "still here" is the same size as a yes');
    assert.ok((await size('x'.repeat(130))) > yes, 'longer ones step up in fixed sizes');
    assert.equal(await size('x'.repeat(130)), await size('x'.repeat(200)));
  });

  it('makes every frame different, even for the same words', async () => {
    const room = await setup();
    await goLive(room);
    const frames: string[] = [];
    for (let i = 0; i < 100; i++) frames.push(only(await room.a.link.send('words', 'the same words')));
    assert.equal(new Set(frames).size, 100);
    const starts = new Set(frames.map((f) => Buffer.from(f, 'base64url').subarray(22, 38).toString('hex')));
    assert.equal(starts.size, 100, 'no two share their first encrypted bytes');
  });
});

// ── A hostile relay ──────────────────────────────────────────────────────────────────────────

describe('a relay that attacks', () => {
  it('rejects every altered byte of a message, and the real one still arrives afterwards', async () => {
    const room = await setup();
    await goLive(room);
    const genuine = only(await room.a.link.send('words', 'meet me at six'));
    const original = Buffer.from(genuine, 'base64url');
    for (let i = 0; i < original.length; i++) {
      for (const bit of [0x01, 0x80]) {
        const altered = Buffer.from(original);
        altered[i] = original[i]! ^ bit;
        const step = await room.b.link.receive(altered.toString('base64url'));
        assert.deepEqual(messagesOf({ ...room.b, events: step.events }), [], `byte ${i} bit ${bit}`);
        assert.ok(step.events.length === 1 && step.events[0]!.type === 'ignored', `byte ${i}`);
      }
    }
    const step = await room.b.link.receive(genuine);
    assert.deepEqual(step.events, [{ type: 'message', kind: 'words', body: 'meet me at six' }]);
  });

  it('rejects a message cut short or added to', async () => {
    const room = await setup();
    await goLive(room);
    const genuine = only(await room.a.link.send('words', 'meet me at six'));
    const bytes = Buffer.from(genuine, 'base64url');
    for (let len = 0; len < bytes.length; len++) {
      const step = await room.b.link.receive(bytes.subarray(0, len).toString('base64url'));
      assert.deepEqual(ignoredOf(step.events).length, 1, `cut at ${len}`);
    }
    for (const extra of [Buffer.from([0]), randomBytes(16)]) {
      const step = await room.b.link.receive(Buffer.concat([bytes, extra]).toString('base64url'));
      assert.equal(ignoredOf(step.events).length, 1);
    }
    assert.deepEqual((await room.b.link.receive(genuine)).events.map((e) => e.type), ['message']);
  });

  it('delivers a repeated message once', async () => {
    const room = await setup();
    await goLive(room);
    const frame = only(await room.a.link.send('words', 'once'));
    const first = await room.b.link.receive(frame);
    const second = await room.b.link.receive(frame);
    const third = await room.b.link.receive(frame);
    assert.deepEqual(first.events.map((e) => e.type), ['message']);
    assert.deepEqual(second.events, [{ type: 'ignored', why: 'old' }]);
    assert.deepEqual(third.events, [{ type: 'ignored', why: 'old' }]);
  });

  it('accepts messages that arrive out of order, each once', async () => {
    const room = await setup();
    await goLive(room);
    const f = [];
    for (const w of ['one', 'two', 'three']) f.push(only(await room.a.link.send('words', w)));
    for (const i of [2, 0, 1]) await act(room, 'b', await room.b.link.receive(f[i]!));
    assert.deepEqual(bodiesOf(room.b), ['three', 'one', 'two']);
    assert.deepEqual((await room.b.link.receive(f[0]!)).events, [{ type: 'ignored', why: 'old' }], 'and not twice');
    assert.deepEqual(room.b.link.__test!.dump().receiving?.kept, [], 'the kept keys were used up');
  });

  it('copes with lost messages, and still takes them if they turn up late', async () => {
    const room = await setup();
    await goLive(room);
    const f = [];
    for (let i = 1; i <= 5; i++) f.push(only(await room.a.link.send('words', `m${i}`)));
    for (const i of [0, 3, 4]) await act(room, 'b', await room.b.link.receive(f[i]!));
    assert.deepEqual(bodiesOf(room.b), ['m1', 'm4', 'm5']);
    assert.equal(room.b.link.__test!.dump().receiving?.kept.length, 2);
    for (const i of [1, 2]) await act(room, 'b', await room.b.link.receive(f[i]!));
    assert.deepEqual(bodiesOf(room.b), ['m1', 'm4', 'm5', 'm2', 'm3']);
  });

  it('waits for up to thirty-two late messages, and refuses a gap bigger than that', async () => {
    const room = await setup();
    await goLive(room);
    const f = [];
    for (let i = 0; i < LINK_LIMITS.skip + 1; i++) f.push(only(await room.a.link.send('words', `m${i}`)));
    // Delivering only the last leaves 32 behind it: allowed.
    assert.deepEqual((await room.b.link.receive(f.at(-1)!)).events.map((e) => e.type), ['message']);
    assert.equal(room.b.link.__test!.dump().receiving?.kept.length, LINK_LIMITS.skip);

    const room2 = await setup();
    await goLive(room2);
    const g = [];
    for (let i = 0; i < LINK_LIMITS.skip + 2; i++) g.push(only(await room2.a.link.send('words', `m${i}`)));
    const far = await room2.b.link.receive(g.at(-1)!);
    assert.deepEqual(far.events, [{ type: 'ignored', why: 'too-far' }]);
    assert.deepEqual(messagesOf({ ...room2.b, events: (await room2.b.link.receive(g[0]!)).events }).map((m) => m.body), ['m0']);
  });

  it('is not moved by forged frames, however many', { timeout: 30_000 }, async () => {
    const room = await setup();
    await goLive(room);
    const genuine = only(await room.a.link.send('words', 'real'));
    const real = Buffer.from(genuine, 'base64url');
    const sid = real.subarray(2, 18);
    const before = JSON.stringify(room.b.link.__test!.dump());
    for (let i = 0; i < 300; i++) {
      const n = Buffer.alloc(4);
      n.writeUInt32BE(i % 2 ? i : 0xffffff00 + (i % 200), 0);
      const forged = Buffer.concat([Buffer.from([1, 0x10]), sid, n, randomBytes(40 + (i % 50))]);
      const step = await room.b.link.receive(forged.toString('base64url'));
      assert.equal(ignoredOf(step.events).length, 1);
    }
    assert.equal(JSON.stringify(room.b.link.__test!.dump()), before, 'the chain did not move');
    assert.deepEqual((await room.b.link.receive(genuine)).events.map((e) => e.type), ['message']);
  });

  it('shrugs off anything that is not a frame', async () => {
    const room = await setup();
    await goLive(room);
    const junk: unknown[] = ['', 'not base64!!', 'a', 'a'.repeat(5000), 'AAAA', 123, null, undefined, {}, [], '\u0000'.repeat(10), 'é'];
    for (const j of junk) {
      const step = await room.b.link.receive(j as string);
      assert.deepEqual(step.out, []);
      assert.equal(ignoredOf(step.events).length, 1, String(j));
    }
    assert.equal(room.b.link.phase(), 'live');
  });

  it('keeps one room from reaching into another', async () => {
    const one = await setup();
    const two = await setup();
    await goLive(one);
    await goLive(two);
    const frame = only(await one.a.link.send('words', 'for room one'));
    assert.deepEqual((await two.b.link.receive(frame)).events, [{ type: 'ignored', why: 'wrong-session' }]);
  });

  it('does not take its own message back as a new one', async () => {
    const room = await setup();
    await goLive(room);
    const frame = only(await room.a.link.send('words', 'mine'));
    const echoed = await room.a.link.receive(frame);
    assert.deepEqual(messagesOf({ ...room.a, events: echoed.events }), []);
    assert.equal(ignoredOf(echoed.events).length, 1);
    assert.equal(room.a.link.phase(), 'live');
  });

  it('survives mutated handshake frames and then completes with the real ones', async () => {
    const rand = prng(20261018);
    const mutate = (frame: string, others: string[]): string => {
      const bytes = Buffer.from(frame, 'base64url');
      let out: Buffer;
      const kind = Math.floor(rand() * 5);
      if (kind === 0) {
        out = Buffer.from(bytes);
        const i = Math.floor(rand() * out.length);
        out[i] = out[i]! ^ (1 << Math.floor(rand() * 8));
      } else if (kind === 1) out = bytes.subarray(0, Math.floor(rand() * bytes.length));
      else if (kind === 2) out = Buffer.concat([bytes, Buffer.from([Math.floor(rand() * 256)])]);
      else if (kind === 3) {
        const o = Buffer.from(others[Math.floor(rand() * others.length)]!, 'base64url');
        const cut = Math.floor(rand() * Math.min(bytes.length, o.length));
        out = Buffer.concat([bytes.subarray(0, cut), o.subarray(cut)]);
      } else {
        out = Buffer.from(bytes);
        out[Math.floor(rand() * out.length)] = Math.floor(rand() * 256);
      }
      return out.toString('base64url');
    };

    const room = await setup();
    const knock = only(room.knock);
    const noise = [knock, ...Array.from({ length: 4 }, () => randomBytes(120).toString('base64url'))];

    // Mutated knocks do not make a listener ask for consent.
    for (let i = 0; i < 200; i++) {
      const m = mutate(knock, noise);
      if (m === knock) continue;
      const step = await room.b.link.receive(m);
      assert.ok(!step.events.some((e) => e.type === 'consent'), 'a damaged knock was believed');
    }
    assert.equal(room.b.link.phase(), 'listening');
    await act(room, 'a', room.knock);
    assert.equal(room.b.link.phase(), 'consent');

    // Mutated answers do not move the knocker on.
    const open = only(await room.b.link.accept());
    for (let i = 0; i < 200; i++) {
      const m = mutate(open, noise);
      if (m === open) continue;
      const step = await room.a.link.receive(m);
      assert.ok(!step.events.some((e) => e.type === 'open' || e.type === 'sealed'), 'a damaged answer was believed');
      assert.deepEqual(step.out, []);
    }
    assert.equal(room.a.link.phase(), 'knocking');

    // Mutated confirmations do not move the listener on.
    const toA = await room.a.link.receive(open);
    const confirm = only(toA);
    for (let i = 0; i < 200; i++) {
      const m = mutate(confirm, noise);
      if (m === confirm) continue;
      const step = await room.b.link.receive(m);
      assert.ok(!step.events.some((e) => e.type === 'open' || e.type === 'sealed'), 'a damaged confirmation was believed');
    }
    assert.equal(room.b.link.phase(), 'handshaking');

    const done = await room.b.link.receive(confirm);
    assert.ok(done.events.some((e) => e.type === 'open'));
    assert.deepEqual(room.a.link.check(), room.b.link.check());
  });
});

// ── Closing the room ─────────────────────────────────────────────────────────────────────────

/** An independent copy of the key schedule, as a thief who has the phone would write it. */
async function thief(chainKey: Uint8Array, firstN: number, frame: string, directionByte: number): Promise<string | null> {
  const subtle = globalThis.crypto.subtle;
  const hkdf = async (ikm: Uint8Array, info: string, len: number) => {
    const key = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(
      await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) }, key, len * 8),
    );
  };
  const bytes = Buffer.from(frame, 'base64url');
  const n = bytes.readUInt32BE(18);
  let ck = chainKey;
  for (let i = firstN; i < firstN + 64; i++) {
    const mk = await hkdf(ck, 'dyverge/link/1/message', 44);
    if (i === n) {
      try {
        const key = await subtle.importKey('raw', mk.slice(0, 32) as BufferSource, 'AES-GCM', false, ['decrypt']);
        const plain = new Uint8Array(
          await subtle.decrypt(
            { name: 'AES-GCM', iv: mk.slice(32, 44) as BufferSource, additionalData: Buffer.concat([bytes.subarray(0, 22), Buffer.from([directionByte])]), tagLength: 128 },
            key,
            bytes.subarray(22),
          ),
        );
        return Buffer.from(plain).toString('utf8');
      } catch (e) {
        return null;
      }
    }
    ck = await hkdf(ck, 'dyverge/link/1/chain', 32);
  }
  return null;
}

describe('closing the room', () => {
  it('keeps what was said before safe from someone who gets the phone afterwards', async () => {
    const room = await setup();
    await goLive(room);
    const sent: string[] = [];
    for (const w of ['first secret', 'second secret', 'third secret']) {
      const step = await room.a.link.send('words', w);
      sent.push(only(step));
      await act(room, 'a', step);
    }
    const reply: string[] = [];
    for (const w of ['reply one', 'reply two']) {
      const step = await room.b.link.send('words', w);
      reply.push(only(step));
      await act(room, 'b', step);
    }
    // The thief takes B's phone now: both chains as they stand at this moment.
    const stolen = room.b.link.__test!.dump();
    const KNOCKER = 0x4b;
    const LISTENER = 0x4c;
    for (const frame of sent) assert.equal(await thief(stolen.receiving!.chainKey, stolen.receiving!.next, frame, KNOCKER), null, 'cannot read the past');
    for (const frame of reply) assert.equal(await thief(stolen.sending!.chainKey, stolen.sending!.next, frame, LISTENER), null, 'cannot read the past');

    // The same thief code does read what comes next in this room, so the test is not blind. That is
    // the honest limit: a phone taken mid-room shows the rest of that room, never what came before.
    const next = only(await room.a.link.send('words', 'later secret'));
    assert.match((await thief(stolen.receiving!.chainKey, stolen.receiving!.next, next, KNOCKER)) ?? '', /later secret/);
  });

  it('wipes its keys when the room is sealed', async () => {
    const room = await setup();
    await goLive(room);
    const held = room.a.link.__test!.hold();
    assert.ok(held.sending?.some((x) => x !== 0));
    assert.ok(held.receiving?.some((x) => x !== 0));
    await act(room, 'a', await room.a.link.seal({ quietly: true }));
    assert.ok(held.sending!.every((x) => x === 0));
    assert.ok(held.receiving!.every((x) => x === 0));
    assert.deepEqual(room.a.link.__test!.dump(), { sending: null, receiving: null });
    assert.equal(room.a.link.phase(), 'sealed');
    await assert.rejects(room.a.link.send('words', 'x'), isLinkError('not-live'));
  });

  it('tells the other side, who then wipes too', async () => {
    const room = await setup();
    await goLive(room);
    await act(room, 'a', await room.a.link.seal());
    assert.deepEqual(room.a.events.at(-1), { type: 'sealed', reason: 'you-sealed' });
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'they-sealed' });
    assert.deepEqual(room.b.link.__test!.dump(), { sending: null, receiving: null });
  });

  it('can be left quietly, which looks like a lost connection', async () => {
    const room = await setup();
    await goLive(room);
    const step = await room.a.link.seal({ quietly: true });
    assert.deepEqual(step.out, []);
    assert.equal(room.b.link.phase(), 'live', 'the other side has not been told');
    for (let i = 0; i < 25; i++) {
      room.clock.advance(1000);
      await act(room, 'b', await room.b.link.tick());
    }
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'peer-gone' });
  });

  it('ignores everything once it is over', async () => {
    const room = await setup();
    await goLive(room);
    const frame = only(await room.a.link.send('words', 'late'));
    await act(room, 'b', await room.b.link.seal());
    assert.deepEqual((await room.b.link.receive(frame)).events, [{ type: 'ignored', why: 'wrong-phase' }]);
    assert.deepEqual(await room.b.link.tick(), { out: [], events: [] });
    assert.deepEqual(await room.b.link.seal(), { out: [], events: [] });
    await assert.rejects(room.b.link.narrow([]), isLinkError('not-live'));
  });

  it('closes by itself when one person goes quiet, and stays open while both are here', async () => {
    const room = await setup();
    await goLive(room);
    for (let i = 0; i < 60; i++) {
      room.clock.advance(1000);
      await act(room, 'a', await room.a.link.tick());
      await act(room, 'b', await room.b.link.tick());
    }
    assert.equal(room.a.link.phase(), 'live');
    assert.equal(room.b.link.phase(), 'live');
    for (let i = 0; i < 25; i++) {
      room.clock.advance(1000);
      await act(room, 'b', await room.b.link.tick());
    }
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'peer-gone' });
    assert.deepEqual(room.b.link.__test!.dump(), { sending: null, receiving: null });
  });

  it('closes at the agreed time, and both sides wipe', async () => {
    const room = await setup({ charter: { ...CHARTER, ttlSeconds: 60 } });
    await goLive(room);
    for (let i = 0; i < 59; i++) {
      room.clock.advance(1000);
      await act(room, 'a', await room.a.link.tick());
      await act(room, 'b', await room.b.link.tick());
    }
    assert.equal(room.a.link.phase(), 'live');
    room.clock.advance(2000);
    await act(room, 'a', await room.a.link.tick());
    assert.deepEqual(room.a.events.at(-1), { type: 'sealed', reason: 'expired' });
    assert.deepEqual(room.b.events.at(-1), { type: 'sealed', reason: 'expired' });
  });

  it('says "still here" only when it is due', async () => {
    const room = await setup();
    await goLive(room);
    // Until the other side has said something after going live, a "ready" is sent again in case it
    // was lost. Let each side speak once, so that this test is only about "still here".
    room.clock.advance(LINK_TIMING.beatMs);
    await act(room, 'a', await room.a.link.tick());
    await act(room, 'b', await room.b.link.tick());
    assert.deepEqual((await room.a.link.tick()).out, []);
    room.clock.advance(LINK_TIMING.beatMs - 1);
    assert.deepEqual((await room.a.link.tick()).out, []);
    room.clock.advance(1);
    assert.equal((await room.a.link.tick()).out.length, 1);
    assert.deepEqual((await room.a.link.tick()).out, []);
  });
});

// ── What the code itself is allowed to do ────────────────────────────────────────────────────

describe('the module itself', () => {
  const source = readFileSync(new URL('../src/livelink.ts', import.meta.url), 'utf8');

  it('never touches the network, storage, the page, or a weak random source', () => {
    assert.ok(!/^\s*import\s/m.test(source), 'it has no imports');
    for (const banned of [
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
      'RTCPeerConnection',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'Math.random',
      'eval(',
      'new Function',
      'document.',
      'window.',
      'navigator.',
      'console.',
    ]) {
      assert.ok(!source.includes(banned), banned);
    }
  });

  it('keeps time on its own when it is not given a clock', async () => {
    const id = (await linkCreateIdentity()).identity;
    const { code } = await linkMakeInvite();
    const k = await linkKnock({ identity: id, invite: code, charter: CHARTER, timing: { knockMs: 40 } });
    assert.deepEqual((await k.link.tick()).events, []);
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.deepEqual((await k.link.tick()).events, [{ type: 'sealed', reason: 'no-answer' }]);
  });

  it('keeps its test hooks out of the app and out of ordinary links', async () => {
    const id = (await linkCreateIdentity()).identity;
    const { code } = await linkMakeInvite();
    const plain = await linkListen({ identity: id, invite: code });
    assert.equal(plain.__test, undefined);
    assert.equal(Object.keys(plain).includes('__test'), false);
    const app = readFileSync(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url), 'utf8');
    assert.ok(!app.includes('exposeForTests'));
    for (const f of readdirSync(new URL('../src/', import.meta.url))) {
      if (f === 'livelink.ts') continue;
      assert.ok(!readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').includes('exposeForTests'), f);
    }
  });
});
