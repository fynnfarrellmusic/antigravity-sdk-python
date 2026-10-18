import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canStartSitdown,
  confirmedSummary,
  decide,
  deleteOwnWords,
  lintCopy,
  matchTools,
  nameRuleOk,
  observationsAllowed,
  proposalsFromObservations,
  sessionMustStop,
  zoneFromBattery,
} from '../src/index.ts';
import type { Sitdown, Turn } from '../src/index.ts';
import { observation, person } from './fixtures.ts';

describe('capacity', () => {
  it('maps battery to zones at the boundaries', () => {
    assert.equal(zoneFromBattery(0), 'flooded');
    assert.equal(zoneFromBattery(30), 'flooded');
    assert.equal(zoneFromBattery(31), 'stretched');
    assert.equal(zoneFromBattery(65), 'stretched');
    assert.equal(zoneFromBattery(66), 'steady');
    assert.equal(zoneFromBattery(100), 'steady');
  });

  it('counts skipped as steady and rejects nonsense', () => {
    assert.equal(zoneFromBattery('skipped'), 'steady');
    assert.throws(() => zoneFromBattery(101), RangeError);
    assert.throws(() => zoneFromBattery(-1), RangeError);
    assert.throws(() => zoneFromBattery(Number.NaN), RangeError);
  });

  it('never starts a sit-down while either person is flooded', () => {
    assert.deepEqual(canStartSitdown({ a: 'steady', b: 'stretched' }), { ok: true });
    assert.deepEqual(canStartSitdown({ a: 'steady', b: 'flooded' }), {
      ok: false,
      reason: 'flooded',
      personIds: ['b'],
    });
  });
});

describe('communication tools', () => {
  const a = person('a');
  const ids = (speaker = a, listener = person('b'), zones = {}) =>
    matchTools({ speaker, listener, zones }, 99)[0].tools.map((t) => t.toolId);

  it('gives a flooded person no communication tools', () => {
    const [ra, rb] = matchTools({ speaker: a, listener: person('b', { lenses: ['literal'] }), zones: { a: 'flooded' } }, 99);
    assert.equal(ra.flooded, true);
    assert.deepEqual(ra.tools, []);
    assert.equal(rb.flooded, false);
  });

  it('tailors the speaker tools to the listener lenses, one lens at a time', () => {
    const expected: Record<string, string> = {
      literal: 'say-it-plainly',
      demand: 'say-how-it-is',
      tone: 'name-the-tone',
      rejection: 'say-what-it-isnt',
      flood: 'keep-it-short',
      silence: 'give-a-return-time',
      time: 'no-rush',
    };
    for (const [lens, tool] of Object.entries(expected)) {
      const listener = person('b', { lenses: [lens as never] });
      assert.deepEqual(ids(a, listener), [tool], lens);
    }
  });

  it('offers nothing when the listener has written nothing, rather than guessing', () => {
    assert.deepEqual(ids(), []);
  });

  it('quotes the listener own words and never invents any', () => {
    const listener = person('b', { needToHear: 'What you want, said plainly.', write: 'I go short when tired.', care: ['Help with things'] });
    const recs = matchTools({ speaker: a, listener, zones: {} }, 99)[0].tools;
    const text = recs.flatMap((r) => r.because).join(' ');
    assert.ok(text.includes('What you want, said plainly.'));
    assert.ok(text.includes('I go short when tired.'));
    assert.ok(text.includes('help with things'));
  });

  it('offers a letter reply to a listener who is running low or floods easily', () => {
    const low = matchTools({ speaker: a, listener: person('b'), zones: { b: 'stretched' } }, 99)[1].tools;
    assert.ok(low.some((t) => t.toolId === 'menu-replies'));
    const steady = matchTools({ speaker: a, listener: person('b'), zones: {} }, 99)[1].tools;
    assert.ok(!steady.some((t) => t.toolId === 'menu-replies'));
    const floods = matchTools({ speaker: a, listener: person('b', { lenses: ['flood'] }), zones: {} }, 99)[1].tools;
    assert.ok(floods.some((t) => t.toolId === 'menu-replies'));
  });

  it('lets a listener who needs time take it', () => {
    const listener = person('b', { lenses: ['time'] });
    const tools = matchTools({ speaker: a, listener, zones: {} }, 99)[1].tools.map((t) => t.toolId);
    assert.ok(tools.includes('take-your-time'));
  });

  it('suggests side by side from either person own words', () => {
    const sbs = 'Time side by side, each doing our own thing';
    assert.ok(ids(person('a', { care: [sbs] }), person('b')).includes('side-by-side'));
    assert.ok(ids(a, person('b', { care: [sbs] })).includes('side-by-side'));
  });

  it('is deterministic and respects the cap', () => {
    const listener = person('b', { lenses: ['literal', 'demand', 'tone', 'rejection', 'flood'] });
    const ctx = { speaker: a, listener, zones: {} };
    assert.deepEqual(matchTools(ctx), matchTools(ctx));
    assert.equal(matchTools(ctx, 3)[0].tools.length, 3);
  });
});

describe('proposals', () => {
  it('needs three distinct sessions', () => {
    assert.equal(proposalsFromObservations([observation({ sessions: ['s1', 's2'] })], []).length, 0);
    const out = proposalsFromObservations([observation({ sessions: ['s1', 's2', 's3'] })], []);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.state, 'pending');
  });

  it('counts a session once however often the pattern repeats in it', () => {
    assert.equal(proposalsFromObservations([observation({ sessions: ['s1', 's1', 's1', 's2'] })], []).length, 0);
  });

  it('ignores the other person words as evidence about the owner', () => {
    const o = observation({ sessions: ['s1', 's2', 's3'] });
    o.evidence = o.evidence.map((e) => ({ ...e, author: 'b' }));
    assert.equal(proposalsFromObservations([o], []).length, 0);
  });

  it('does not propose again while pending, accepted or edited', () => {
    const o = observation({ sessions: ['s1', 's2', 's3'] });
    const [p] = proposalsFromObservations([o], []);
    assert.ok(p);
    for (const state of ['pending', 'accepted', 'edited'] as const) {
      assert.equal(proposalsFromObservations([o], [{ ...p, state }]).length, 0, state);
    }
  });

  it('holds back a declined proposal until two new sessions', () => {
    const three = observation({ sessions: ['s1', 's2', 's3'] });
    const [p] = proposalsFromObservations([three], []);
    const declined = decide(p!, 'declined', '2026-10-11T00:00:00Z', 3);
    assert.equal(declined.sessionsAtDecision, 3);

    const four = observation({ sessions: ['s1', 's2', 's3', 's4'] });
    assert.equal(proposalsFromObservations([four], [declined]).length, 0);
    const five = observation({ sessions: ['s1', 's2', 's3', 's4', 's5'] });
    const again = proposalsFromObservations([five], [declined]);
    assert.equal(again.length, 1);
    assert.notEqual(again[0]?.id, declined.id);
  });

  it('keeps one person observations apart from another', () => {
    const mine = observation({ sessions: ['s1', 's2', 's3'], owner: 'a' });
    const theirs = observation({ id: 'o2', sessions: ['s1', 's2'], owner: 'b' });
    assert.deepEqual(proposalsFromObservations([mine, theirs], []).map((p) => p.owner), ['a']);
  });
});

describe('session rules', () => {
  const turn = (gate: Turn['gate'], author = 'a'): Turn => ({
    id: 't',
    author,
    at: '2026-10-10T00:00:00Z',
    kind: 'text',
    content: 'hello',
    gate,
  });

  it('stops observations after a hard or power gate, not a soft one', () => {
    assert.equal(observationsAllowed([turn(null), turn('soft')]), true);
    assert.equal(observationsAllowed([turn(null), turn('power')]), false);
    assert.equal(observationsAllowed([turn('hard')]), false);
    assert.equal(sessionMustStop([turn('soft')]), false);
    assert.equal(sessionMustStop([turn('power')]), true);
  });

  it('drops a summary unless every person confirmed it', () => {
    const summary = { heard: 'x', tryThis: 'y', confirmedBy: { a: '2026-10-10' } };
    assert.equal(confirmedSummary(summary, ['a', 'b']), undefined);
    assert.equal(confirmedSummary({ ...summary, confirmedBy: { a: '2026-10-10', b: '2026-10-10' } }, ['a', 'b'])?.heard, 'x');
    assert.equal(confirmedSummary(undefined, ['a']), undefined);
  });

  it('lets one person delete their own words without touching the other', () => {
    const s: Sitdown = {
      id: 's',
      startedAt: '2026-10-10T00:00:00Z',
      purpose: 'repair',
      turns: [turn(null, 'a'), { ...turn(null, 'b'), content: 'mine' }],
      summary: { heard: 'x', tryThis: 'y', confirmedBy: { a: 'd', b: 'd' } },
    };
    const after = deleteOwnWords(s, 'a');
    assert.equal(after.turns[0]?.content, '');
    assert.equal(after.turns[1]?.content, 'mine');
    assert.equal(after.summary, undefined);
  });
});

describe('copy lint', () => {
  it('flags banned words and phrases, including curly apostrophes', () => {
    const terms = lintCopy('Just crush it on your journey. Your partner’s disorder is a symptom of simply nothing.').map((h) => h.term);
    assert.deepEqual(terms.sort(), ['crush it', 'journey', 'just', "your partner's disorder", 'simply'].sort());
  });

  it('does not flag words that merely contain a banned one', () => {
    assert.deepEqual(lintCopy('Justice, adjusting, and a symptomatic review.'), []);
  });

  it('passes the handoff approved lines', () => {
    for (const line of [
      "You're running low. Want the short version?",
      'This reads as a demand. Want a version that costs less to answer?',
      'Nothing logged yet. The first one is usually the hardest.',
    ]) {
      assert.deepEqual(lintCopy(line), [], line);
    }
  });

  it('checks the Y naming rule', () => {
    assert.equal(nameRuleOk('dYverge'), true);
    assert.equal(nameRuleOk('Yverge'), false);
  });
});
