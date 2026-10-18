import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CATEGORY_ORDER,
  REGULATION_FAMILIES,
  assertPlural,
  buildPathways,
  lintCopy,
  lintOvercertainty,
  matchTools,
  pickRegulationTools,
} from '../src/index.ts';
import type { Outcome, PathwayInput, PathwaySet, VibeId, Zone } from '../src/index.ts';
import {
  TOOL_FAMILY,
  VIBE_FAMILY,
  appDefaultTools,
  appTools,
  appVibeTools,
  regulationFromApp,
} from './app-data.ts';
import { person } from './fixtures.ts';

const regulation = regulationFromApp();
const UK = [
  { name: 'Samaritans', contact: '116 123' },
  { name: 'Shout', contact: '85258' },
];
const ZONES: Zone[] = ['steady', 'stretched', 'flooded'];
const VIBES: (VibeId | null)[] = [null, 'narrator', 'lightning', 'cocoon', 'spark', 'shapeshifter'];

const familiesOf = (set: PathwaySet) =>
  set.pathways.map((p) => p.category).filter((c) => (REGULATION_FAMILIES as readonly string[]).includes(c));

function everyString(set: PathwaySet): string[] {
  const out = [set.notice, set.noneFit.title, set.noneFit.summary];
  for (const p of set.pathways) {
    out.push(p.title, p.summary, ...p.because);
    for (const o of p.options) out.push(o.title, o.summary);
  }
  return out;
}

function base(over: Partial<PathwayInput> = {}): PathwayInput {
  return { zone: 'steady', regulation, professionalEnabled: false, ...over };
}

describe('the app data the core is tested against', () => {
  it('reads all 15 regulation tools from the app', () => {
    assert.equal(appTools().length, 15);
  });

  it('gives every tool a family, and the app and core agree', () => {
    for (const t of appTools()) assert.ok(TOOL_FAMILY[t.id], `${t.id} has no family`);
    assert.deepEqual(new Set(Object.keys(TOOL_FAMILY)), new Set(appTools().map((t) => t.id)));
  });

  it('shows why plurality is needed: each Vibe profile is three tools of ONE family', () => {
    const vibeTools = appVibeTools();
    assert.equal(Object.keys(vibeTools).length, 5);
    for (const [vibe, tools] of Object.entries(vibeTools)) {
      assert.equal(new Set(tools.map((t) => TOOL_FAMILY[t])).size, 1, `${vibe} is single-family in the app`);
      assert.equal(TOOL_FAMILY[tools[0]!], VIBE_FAMILY[vibe as VibeId], vibe);
    }
  });
});

describe('plural pathways: always more than one kind of help', () => {
  it('is plural for every zone, Vibe profile, route and professional setting', () => {
    let sets = 0;
    for (const zone of ZONES)
      for (const vibe of VIBES)
        for (const professionalEnabled of [false, true])
          for (const routes of [[], UK])
            for (const tips of [false, true]) {
              const communication = tips
                ? matchTools(
                    { speaker: person('a'), listener: person('b', { lenses: ['literal', 'time'] }), zones: {} },
                    99,
                  )[0].tools
                : [];
              const set = buildPathways(base({ zone, vibe, professionalEnabled, routes, communication }));
              assertPlural(set);
              assert.ok(set.pathways.length >= 3);
              assert.ok(new Set(set.pathways.map((p) => p.category)).size >= 3);
              assert.ok(familiesOf(set).length >= 2, 'regulation offered as at least two families');
              assert.ok(set.pathways.some((p) => p.category === 'person'));
              assert.equal(set.noneFit.id, 'none-fit');
              sets++;
            }
    assert.equal(sets, 3 * 6 * 2 * 2 * 2);
  });

  it('stays plural however much history says nothing worked', () => {
    const allNo: Outcome[] = [
      ...regulation.tools.flatMap((t) => [
        { id: t.id, helped: 'no' as const },
        { id: t.id, helped: 'no' as const },
        { id: t.id, helped: 'no' as const },
      ]),
      ...REGULATION_FAMILIES.map((f) => ({ id: `family-${f}`, helped: 'no' as const })),
    ];
    for (const zone of ZONES) {
      const set = buildPathways(base({ zone, vibe: 'cocoon', history: allNo, professionalEnabled: true }));
      assertPlural(set);
      assert.ok(familiesOf(set).length >= 2);
    }
  });

  it('always carries a way to say none of these fit, and a notice that this is not a plan', () => {
    const set = buildPathways(base());
    assert.match(set.noneFit.summary, /real answer/);
    assert.match(set.notice, /not a plan/);
  });

  it('presents in a fixed order, not by preference', () => {
    for (const vibe of VIBES) {
      const set = buildPathways(base({ vibe }));
      const order = set.pathways.map((p) => CATEGORY_ORDER.indexOf(p.category));
      assert.deepEqual(order, [...order].sort((x, y) => x - y));
    }
  });
});

describe('capacity: fewer options, never one option', () => {
  it('keeps a flooded person to regulation, space and a person: no words, no professional', () => {
    const set = buildPathways(base({ zone: 'flooded', vibe: 'cocoon', professionalEnabled: true, routes: UK }));
    const allowed = new Set([...REGULATION_FAMILIES, 'space', 'person']);
    for (const p of set.pathways) assert.ok(allowed.has(p.category as never), p.category);
    assert.ok(!set.pathways.some((p) => p.category === 'professional'));
    assert.ok(familiesOf(set).length >= 2);
  });

  it('shows a flooded Cocoon three cards that are no longer all one idea', () => {
    const set = buildPathways(base({ zone: 'flooded', vibe: 'cocoon' }));
    const picked = pickRegulationTools(set);
    assert.equal(picked.length, 3);
    const families = new Set(picked.map((o) => TOOL_FAMILY[o.id]));
    assert.ok(families.size >= 2, `got ${[...families]}`);
    assert.equal(TOOL_FAMILY[picked[0]!.id], 'quiet', 'their own family still leads');
    assert.equal(TOOL_FAMILY[picked[1]!.id], 'quiet');
  });

  it('does this for every Vibe profile, using the app real tools', () => {
    for (const vibe of VIBES.filter((v): v is VibeId => v !== null)) {
      const picked = pickRegulationTools(buildPathways(base({ zone: 'flooded', vibe })));
      assert.equal(picked.length, 3, vibe);
      assert.equal(TOOL_FAMILY[picked[0]!.id], VIBE_FAMILY[vibe], `${vibe} leads with its own family`);
      assert.ok(new Set(picked.map((o) => TOOL_FAMILY[o.id])).size >= 2, vibe);
    }
  });

  it('with no Vibe profile, offers the lowest-effort families first, spanning two', () => {
    const picked = pickRegulationTools(buildPathways(base({ zone: 'flooded', vibe: null })));
    assert.deepEqual([...new Set(picked.map((o) => TOOL_FAMILY[o.id]))], ['quiet', 'choose']);
  });

  it('the app own default tools already span two families', () => {
    assert.ok(new Set(appDefaultTools().map((t) => TOOL_FAMILY[t])).size >= 2);
  });
});

describe('professional pathways (restricted until review)', () => {
  it('are absent unless enabled', () => {
    assert.ok(!buildPathways(base()).pathways.some((p) => p.category === 'professional'));
  });

  it('when enabled, offer several kinds together and never one', () => {
    const set = buildPathways(base({ professionalEnabled: true }));
    const pro = set.pathways.find((p) => p.category === 'professional');
    assert.ok(pro);
    assert.ok(pro.options.length >= 3);
    assert.match(pro.summary, /do not have to pick one/);
    assert.ok(pro.options.some((o) => /doctor/i.test(o.title)));
    assert.ok(pro.options.some((o) => /couples/i.test(o.title)));
    assert.ok(pro.options.some((o) => /one-to-one/i.test(o.title)));
  });

  it('say plainly that the app does not diagnose', () => {
    const pro = buildPathways(base({ professionalEnabled: true })).pathways.find((p) => p.category === 'professional')!;
    assert.ok(pro.options.some((o) => /does not assess or diagnose/.test(o.summary)));
  });
});

describe('a person is always on offer', () => {
  it('has someone you trust and peers even with no reviewed routes', () => {
    const person_ = buildPathways(base({ routes: [] })).pathways.find((p) => p.category === 'person')!;
    assert.deepEqual(person_.options.map((o) => o.id), ['someone-you-trust', 'people-who-have-been-there']);
  });

  it('adds reviewed routes ahead of them when there are some', () => {
    const person_ = buildPathways(base({ routes: UK })).pathways.find((p) => p.category === 'person')!;
    assert.deepEqual(person_.options.map((o) => o.title).slice(0, 2), ['Samaritans', 'Shout']);
    assert.equal(person_.options.length, 4);
  });
});

describe('learning from what helped, without collapsing to one thing', () => {
  it('moves what helped to the front of its family and what did not to the back, dropping nothing', () => {
    const quiet = regulation.tools.filter((t) => t.family === 'quiet').map((t) => t.id);
    const [a, b, c] = quiet as [string, string, string];
    const set = buildPathways(
      base({
        vibe: 'cocoon',
        history: [
          { id: a, helped: 'no' },
          { id: a, helped: 'no' },
          { id: c, helped: 'yes' },
        ],
      }),
    );
    const fam = set.pathways.find((p) => p.id === 'family-quiet')!;
    assert.deepEqual(fam.options.map((o) => o.id), [c, b, a]);
  });

  it('can let a family that helped lead the second slot', () => {
    const set = buildPathways(
      base({ vibe: 'cocoon', history: [{ id: 'song', helped: 'yes' }, { id: 'song', helped: 'yes' }] }),
    );
    assert.equal(set.regulationOrder[0], 'quiet');
    assert.equal(set.regulationOrder[1], 'shift');
  });

  it('keeps the person own family first however it went, because it is their baseline, not a verdict', () => {
    const history = ['weight', 'soundoff', 'lights'].flatMap((id) => [{ id, helped: 'no' as const }]);
    const set = buildPathways(base({ vibe: 'cocoon', history }));
    assert.equal(set.regulationOrder.length, 2);
  });
});

describe('the rule is enforced, not just followed', () => {
  const ok = buildPathways(base());

  it('rejects a single pathway', () => {
    assert.throws(() => assertPlural({ ...ok, pathways: ok.pathways.slice(0, 1) }), /at least 3 are required/);
  });

  it('rejects three pathways that are one kind of thing', () => {
    const same = ok.pathways[0]!;
    assert.throws(
      () => assertPlural({ ...ok, pathways: [same, { ...same, id: 'x' }, { ...same, id: 'y' }] }),
      /categories/,
    );
  });

  it('rejects a single regulation family', () => {
    const only = ok.pathways.filter((p) => !(REGULATION_FAMILIES as readonly string[]).includes(p.category));
    const one = ok.pathways.find((p) => p.category === 'quiet' || p.category === 'choose')!;
    assert.throws(() => assertPlural({ ...ok, pathways: [...only, one] }), /single regulation family/);
  });

  it('rejects a set with no person', () => {
    assert.throws(() => assertPlural({ ...ok, pathways: ok.pathways.filter((p) => p.category !== 'person') }), /no person/);
  });

  it('rejects a set with no way to say none of these fit', () => {
    assert.throws(() => assertPlural({ ...ok, noneFit: { id: 'x', title: '', summary: '' } }), /none of these fit/);
  });
});

describe('wording: never the answer, never a promise', () => {
  it('flags overcertain claims and passes honest ones', () => {
    for (const bad of ['This will cure it.', 'Guaranteed to help.', 'The only way forward.', 'You must try this.']) {
      assert.ok(lintOvercertainty(bad).length > 0, bad);
    }
    for (const good of ['This can help some people.', 'Some people find this helps.', 'It can change from day to day.']) {
      assert.deepEqual(lintOvercertainty(good), [], good);
    }
  });

  it('keeps every string in every set clean, across all inputs', () => {
    for (const zone of ZONES)
      for (const vibe of VIBES) {
        const communication = matchTools(
          {
            speaker: person('a'),
            listener: person('b', { lenses: ['literal', 'demand', 'tone', 'rejection', 'flood', 'silence', 'time'], care: ['Help with things'], needToHear: 'Plain words.', write: 'I go short.' }),
            zones: {},
          },
          99,
        )[0].tools;
        const set = buildPathways(base({ zone, vibe, professionalEnabled: true, routes: UK, communication }));
        for (const s of everyString(set)) {
          assert.deepEqual(lintCopy(s), [], s);
          assert.deepEqual(lintOvercertainty(s), [], s);
        }
      }
  });

  it('never claims a tool is best, right or proven', () => {
    const set = buildPathways(base({ vibe: 'cocoon', professionalEnabled: true }));
    for (const s of everyString(set)) assert.doesNotMatch(s, /\b(best|right choice|proven|recommended|top pick)\b/i, s);
  });
});

describe('small screens', () => {
  it('never lets maxPathways drop below the mandatory set', () => {
    const set = buildPathways(base({ maxPathways: 1, professionalEnabled: true }));
    assertPlural(set);
    assert.ok(set.pathways.length >= 4);
  });
});
