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
import { observation, profile } from './fixtures.ts';

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

describe('matchTools', () => {
  const a = profile({ personId: 'a', name: 'Alex' });
  const b = profile({ personId: 'b', name: 'Bo' });

  it('offers only regulation tools, space first, to a flooded person', () => {
    const [ra, rb] = matchTools({ speaker: a, listener: b, zones: { a: 'flooded', b: 'steady' } });
    assert.equal(ra.flooded, true);
    assert.deepEqual(ra.tools.map((t) => t.toolId), ['need-space', 'breathing-orb']);
    assert.equal(rb.flooded, false);
  });

  it('puts a flooded person own sensory reset after space and the orb', () => {
    const s = profile({ personId: 'a', sensoryNeeds: ['deep-pressure'] });
    const [ra] = matchTools({ speaker: s, listener: b, zones: { a: 'flooded', b: 'steady' } });
    assert.deepEqual(ra.tools.map((t) => t.toolId), ['need-space', 'breathing-orb', 'sensory-reset']);
  });

  it('returns at most three tools and every one carries a reason', () => {
    const rich = profile({
      personId: 'b',
      name: 'Bo',
      languages: ['pt'],
      neurotypes: ['pda', 'adhd'],
      receive: { ...b.receive, literalFirst: true, needsReasonWithAsk: true, channel: 'written', processingMinutes: 20 },
    });
    const [ra, rb] = matchTools({ speaker: a, listener: rich, zones: { a: 'steady', b: 'steady' } });
    for (const r of [ra, rb]) {
      assert.ok(r.tools.length <= 3);
      for (const t of r.tools) assert.ok(t.because.length > 0);
    }
  });

  it('tailors the speaker tools to the listener profile', () => {
    const listener = profile({
      personId: 'b',
      name: 'Bo',
      neurotypes: ['pda'],
      receive: { ...b.receive, needsReasonWithAsk: true, literalFirst: true },
    });
    const [ra] = matchTools({ speaker: a, listener, zones: { a: 'steady', b: 'steady' } });
    const ids = ra.tools.map((t) => t.toolId);
    assert.ok(ids.includes('say-how-it-is'));
    assert.ok(ids.includes('reason-with-ask'));
  });

  it('flags a love-language mismatch and stays quiet on a match', () => {
    const giver = profile({
      personId: 'a',
      name: 'Alex',
      loveLanguages: {
        given: { words: 1, acts: 5, gifts: 1, time: 1, touch: 1 },
        received: { words: 3, acts: 3, gifts: 3, time: 3, touch: 3 },
      },
    });
    const receiver = (top: 'words' | 'acts') =>
      profile({
        personId: 'b',
        name: 'Bo',
        loveLanguages: {
          given: { words: 3, acts: 3, gifts: 3, time: 3, touch: 3 },
          received: { words: top === 'words' ? 5 : 1, acts: top === 'acts' ? 5 : 1, gifts: 1, time: 1, touch: 1 },
        },
      });
    const mismatch = matchTools({ speaker: giver, listener: receiver('words'), zones: {} })[0];
    assert.ok(mismatch.tools.some((t) => t.toolId === 'their-love-language'));
    const match = matchTools({ speaker: giver, listener: receiver('acts'), zones: {} })[0];
    assert.ok(!match.tools.some((t) => t.toolId === 'their-love-language'));
  });

  it('suggests checking phrases when main languages differ', () => {
    const pt = profile({ personId: 'b', name: 'Bo', languages: ['pt'] });
    const [ra] = matchTools({ speaker: a, listener: pt, zones: {} });
    assert.ok(ra.tools.some((t) => t.toolId === 'check-the-phrase'));
  });

  it('never uses a worry the owner has not shared', () => {
    const private_ = profile({
      personId: 'b',
      name: 'Bo',
      worries: [{ id: 'w', text: 'Being left', whatHelps: 'Tell me when you will be back', shareWithPartner: false }],
    });
    const shared = profile({
      personId: 'b',
      name: 'Bo',
      worries: [{ id: 'w', text: 'Being left', whatHelps: 'Tell me when you will be back', shareWithPartner: true }],
    });
    const hidden = matchTools({ speaker: a, listener: private_, zones: {} })[0];
    const shown = matchTools({ speaker: a, listener: shared, zones: {} })[0];
    assert.ok(!hidden.tools.some((t) => t.toolId === 'offer-what-helps'));
    assert.ok(shown.tools.some((t) => t.toolId === 'offer-what-helps'));
  });

  it('is deterministic', () => {
    const ctx = { speaker: a, listener: b, zones: { a: 'stretched', b: 'steady' } } as const;
    assert.deepEqual(matchTools(ctx), matchTools(ctx));
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
    const out = proposalsFromObservations([mine, theirs], []);
    assert.deepEqual(out.map((p) => p.owner), ['a']);
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
    assert.equal(observationsAllowed([turn('passed'), turn('soft')]), true);
    assert.equal(observationsAllowed([turn('passed'), turn('power')]), false);
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
      turns: [turn('passed', 'a'), { ...turn('passed', 'b'), content: 'mine' }],
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
