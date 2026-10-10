import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_AGREEMENT,
  MAX_PEOPLE,
  addPerson,
  bootstrapPeople,
  classifyKey,
  cleanName,
  createVault,
  displayName,
  fromAgreementView,
  memoryStore,
  newPersonId,
  openVault,
  otherPerson,
  publishProfile,
  pruneUnfinished,
  publishSpoons,
  readPeople,
  readPublishedProfile,
  readPublishedSpoons,
  removePerson,
  removeSharedTraces,
  renamePerson,
  toAgreementView,
  toSharedProfile,
  unpublishProfile,
  unpublishSpoons,
  vaultExists,
} from '../src/index.ts';

const FAST = { iterations: 1000 };

describe('who uses the phone', () => {
  it('starts empty, tolerates damage, and never holds more than two', () => {
    const store = memoryStore();
    assert.deepEqual(readPeople(store), []);
    store.set('dyverge:people', '{not json');
    assert.deepEqual(readPeople(store), []);
    store.set('dyverge:people', JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'a' }, { id: 'bad id!' }, 7, null]));
    assert.deepEqual(readPeople(store).map((p) => p.id), ['a', 'b']);
  });

  it('adds up to two people and refuses a third, a duplicate, or an odd id', () => {
    const store = memoryStore();
    addPerson(store, { id: 'a', name: '  Alex  ' });
    assert.deepEqual(readPeople(store), [{ id: 'a', name: 'Alex' }]);
    assert.throws(() => addPerson(store, { id: 'a', name: 'Again' }), /already here/);
    assert.throws(() => addPerson(store, { id: 'no spaces', name: 'X' }), RangeError);
    addPerson(store, { id: 'b', name: 'Bo' });
    assert.equal(MAX_PEOPLE, 2);
    assert.throws(() => addPerson(store, { id: 'c', name: 'Cy' }), /Two people already/);
  });

  it('renames and removes', () => {
    const store = memoryStore();
    addPerson(store, { id: 'a', name: 'Alex' });
    addPerson(store, { id: 'b', name: 'Bo' });
    renamePerson(store, 'a', 'Alexandra');
    assert.equal(readPeople(store)[0]?.name, 'Alexandra');
    removePerson(store, 'a');
    assert.deepEqual(readPeople(store).map((p) => p.id), ['b']);
  });

  it('finds the other person', () => {
    const people = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Bo' }];
    assert.equal(otherPerson(people, 'a')?.id, 'b');
    assert.equal(otherPerson(people, 'b')?.id, 'a');
    assert.equal(otherPerson([people[0]!], 'a'), null);
    assert.equal(otherPerson([], 'a'), null);
  });

  it('cleans names and makes safe, distinct ids', () => {
    assert.equal(cleanName('  Al \n  ex  '), 'Al ex');
    assert.equal(cleanName('x'.repeat(100)).length, 40);
    const ids = new Set(Array.from({ length: 200 }, () => newPersonId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{1,40}$/);
  });

  it('names someone with no name yet', () => {
    assert.equal(displayName({ id: 'a', name: '' }, 0), 'Person 1');
    assert.equal(displayName({ id: 'b', name: 'Bo' }, 1), 'Bo');
  });

  it('rebuilds the list for a phone set up before people were listed', async () => {
    const store = memoryStore();
    await createVault(store, 'me', 'correct horse battery', FAST);
    assert.deepEqual(readPeople(store), []);
    assert.deepEqual(bootstrapPeople(store), [{ id: 'me', name: '' }]);
    assert.deepEqual(readPeople(store), [{ id: 'me', name: '' }], 'and remembers it');
  });

  it('forgets someone whose private space was never finished, and keeps the rest', async () => {
    const store = memoryStore();
    addPerson(store, { id: 'done', name: 'Alex' });
    addPerson(store, { id: 'half', name: 'Bo' }); // the app was closed before the passphrase became a key
    await createVault(store, 'done', 'correct horse battery', FAST);
    const kept = pruneUnfinished(store, (id) => vaultExists(store, id));
    assert.deepEqual(kept, [{ id: 'done', name: 'Alex' }]);
    assert.deepEqual(readPeople(store), [{ id: 'done', name: 'Alex' }], 'and remembers it');
  });

  it('leaves a complete list alone and writes nothing when nothing changes', async () => {
    const store = memoryStore();
    addPerson(store, { id: 'a', name: 'Alex' });
    await createVault(store, 'a', 'correct horse battery', FAST);
    let writes = 0;
    const watching = { ...store, set: (k: string, v: string) => { writes += 1; store.set(k, v); } };
    assert.deepEqual(pruneUnfinished(watching, (id) => vaultExists(store, id)), [{ id: 'a', name: 'Alex' }]);
    assert.equal(writes, 0);
  });

  it('lets the app start again when nobody on the list has a finished space', () => {
    const store = memoryStore();
    addPerson(store, { id: 'half', name: 'Bo' });
    assert.deepEqual(pruneUnfinished(store, () => false), []);
    assert.deepEqual(bootstrapPeople(store), [], 'so it offers to make a private space, not a lock screen that cannot open');
  });

  it('does not overwrite a list that already exists', async () => {
    const store = memoryStore();
    addPerson(store, { id: 'a', name: 'Alex' });
    await createVault(store, 'other', 'correct horse battery', FAST);
    assert.deepEqual(bootstrapPeople(store), [{ id: 'a', name: 'Alex' }]);
  });
});

describe('what a person publishes', () => {
  const profile = {
    name: 'Alex',
    pronouns: 'they/them',
    lenses: ['literal', 'time'],
    receiveNote: 'Plainly, please.',
    care: ['Help with things'],
    needToHear: 'What you want.',
    write: 'I go short.',
  };

  it('writes and reads a profile', () => {
    const store = memoryStore();
    publishProfile(store, 'a', profile, 123);
    assert.deepEqual(readPublishedProfile(store, 'a'), { profile, at: 123 });
    assert.equal(readPublishedProfile(store, 'b'), null);
  });

  it('can only ever publish the allowed fields, whatever it is given', () => {
    const store = memoryStore();
    publishProfile(store, 'a', { ...profile, vibe: 'cocoon', toolLog: [1], password: 'hunter2', observations: ['x'] }, 1);
    const raw = store.get('dyverge:published:a')!;
    for (const secret of ['cocoon', 'toolLog', 'hunter2', 'observations']) assert.ok(!raw.includes(secret), secret);
    assert.deepEqual(Object.keys(readPublishedProfile(store, 'a')!.profile).sort(), Object.keys(profile).sort());
  });

  it('coerces odd values rather than trusting them', () => {
    const p = toSharedProfile({ name: 5, lenses: ['a', 3, null, 'b'], care: 'nope', write: { x: 1 } });
    assert.deepEqual(p, { name: '', pronouns: '', lenses: ['a', 'b'], receiveNote: '', care: [], needToHear: '', write: '' });
  });

  it('stops being shared when unpublished', () => {
    const store = memoryStore();
    publishProfile(store, 'a', profile, 1);
    unpublishProfile(store, 'a');
    assert.equal(readPublishedProfile(store, 'a'), null);
  });

  it('shares a spoon level only when asked, and rejects nonsense', () => {
    const store = memoryStore();
    assert.equal(readPublishedSpoons(store, 'a'), null);
    publishSpoons(store, 'a', { left: 5, total: 12 }, 9);
    assert.deepEqual(readPublishedSpoons(store, 'a'), { left: 5, total: 12, at: 9 });
    publishSpoons(store, 'a', { left: 20, total: 12 }, 10);
    assert.equal(readPublishedSpoons(store, 'a')?.left, 12, 'cannot have more left than the total');
    assert.throws(() => publishSpoons(store, 'a', { left: -1, total: 12 }, 1), RangeError);
    assert.throws(() => publishSpoons(store, 'a', { left: 1, total: 0 }, 1), RangeError);
    assert.throws(() => publishSpoons(store, 'a', { left: Number.NaN, total: 12 }, 1), RangeError);
    unpublishSpoons(store, 'a');
    assert.equal(readPublishedSpoons(store, 'a'), null);
  });

  it('ignores damaged published data', () => {
    const store = memoryStore();
    store.set('dyverge:published:a', '{oops');
    store.set('dyverge:published-spoons:a', JSON.stringify({ left: 'x', total: 1, at: 1 }));
    assert.equal(readPublishedProfile(store, 'a'), null);
    assert.equal(readPublishedSpoons(store, 'a'), null);
  });
});

describe('the agreement, one signature each', () => {
  it('shows me and partner from whoever is using the app', () => {
    const raw = { signatures: { a: 100, b: 200 }, reopened: null };
    assert.deepEqual(toAgreementView(raw, 'a', 'b').signatures, { me: 100, partner: 200 });
    assert.deepEqual(toAgreementView(raw, 'b', 'a').signatures, { me: 200, partner: 100 });
    assert.deepEqual(toAgreementView(raw, 'a', null).signatures, { me: 100, partner: null });
    assert.deepEqual(toAgreementView(undefined, 'a', 'b').signatures, { me: null, partner: null });
  });

  it('lets a person sign for themselves and no one else', () => {
    const raw = { signatures: { a: null, b: 200 }, reopened: null };
    const view = toAgreementView(raw, 'a', 'b');
    const signed = fromAgreementView(raw, { ...view, signatures: { me: 300, partner: view.signatures.partner } }, 'a', 'b');
    assert.deepEqual(signed.signatures, { a: 300, b: 200 });
    // A screen trying to sign for the other person is ignored.
    const sneaky = fromAgreementView(raw, { ...view, signatures: { me: null, partner: 999 } }, 'a', 'b');
    assert.equal(sneaky.signatures['b'], 200);
    assert.equal(sneaky.signatures['a'], null);
  });

  it('reopens for both together, and records when', () => {
    const raw = { signatures: { a: 100, b: 200 }, reopened: null };
    const reopened = fromAgreementView(raw, { signatures: { me: null, partner: null }, reopened: 500 }, 'a', 'b');
    assert.deepEqual(reopened, { signatures: { a: null, b: null }, reopened: 500 });
  });

  it('drops signatures stored under keys that are not real people, such as an old demo partner', () => {
    const legacy = { signatures: { me: 100, partner: Date.parse('2026-09-14T12:00:00Z') }, reopened: null };
    // The first person kept the id "me"; the demo partner is not a person, so is not carried over.
    assert.deepEqual(toAgreementView(legacy, 'me', 'p2').signatures, { me: 100, partner: null });
    const written = fromAgreementView(legacy, toAgreementView(legacy, 'me', 'p2'), 'me', 'p2');
    assert.deepEqual(written.signatures, { me: 100, p2: null });
  });

  it('starts empty', () => {
    assert.deepEqual(EMPTY_AGREEMENT, { signatures: {}, reopened: null });
  });
});

describe('leaving: removing what a person put in the shared space', () => {
  it('removes their published items and signature, and leaves the other person alone', () => {
    const store = memoryStore();
    publishProfile(store, 'a', { name: 'Alex' }, 1);
    publishProfile(store, 'b', { name: 'Bo' }, 1);
    publishSpoons(store, 'a', { left: 1, total: 2 }, 1);
    publishSpoons(store, 'b', { left: 2, total: 2 }, 1);
    store.set('dyverge:agreement', JSON.stringify({ signatures: { a: 1, b: 2 }, reopened: null }));
    store.set('dyverge:words', JSON.stringify([{ phrase: 'Reset' }]));

    removeSharedTraces(store, 'a');

    assert.equal(readPublishedProfile(store, 'a'), null);
    assert.equal(readPublishedSpoons(store, 'a'), null);
    assert.ok(readPublishedProfile(store, 'b'));
    assert.ok(readPublishedSpoons(store, 'b'));
    assert.deepEqual(JSON.parse(store.get('dyverge:agreement')!).signatures, { b: 2 });
    assert.ok(store.get('dyverge:words'), 'Our words belong to both, and stay');
  });
});

describe('the whole boundary, with two real vaults', () => {
  it('shares only what was published, and nothing from either private space', async () => {
    const store = memoryStore();
    addPerson(store, { id: 'a', name: 'Alex' });
    addPerson(store, { id: 'b', name: 'Bo' });
    const a = await createVault(store, 'a', 'alex long passphrase', FAST);
    const b = await createVault(store, 'b', 'bo long passphrase', FAST);
    await a.put('profile', { name: 'Alex', needToHear: 'ALEX PRIVATE DRAFT' });
    await a.put('translations', [{ text: 'ALEX PRIVATE MESSAGE' }]);
    await b.put('profile', { name: 'Bo', needToHear: 'BO PRIVATE DRAFT' });
    await b.put('vibe', 'BO PRIVATE VIBE');

    // Alex publishes a version of their profile. Bo has not.
    publishProfile(store, 'a', { name: 'Alex', lenses: ['literal'], needToHear: 'What Alex chose to share.' }, 1);

    const seenByBo = readPublishedProfile(store, 'a');
    assert.equal(seenByBo?.profile.needToHear, 'What Alex chose to share.');
    assert.equal(readPublishedProfile(store, 'b'), null, 'Bo shared nothing, so Alex sees nothing');

    const everything = store.keys().map((k) => `${k}=${store.get(k)}`).join('\n');
    for (const secret of ['ALEX PRIVATE DRAFT', 'ALEX PRIVATE MESSAGE', 'BO PRIVATE DRAFT', 'BO PRIVATE VIBE', 'alex long passphrase', 'bo long passphrase']) {
      assert.ok(!everything.includes(secret), `"${secret}" is readable in storage`);
    }

    // And Bo's passphrase does not open Alex's space.
    await a.lock();
    assert.equal(await openVault(store, 'a').unlock('bo long passphrase'), false);
  });
});

describe('what is open, shared or private, now with people', () => {
  it('lists names in the open, publishes as shared, and keeps the rest private', () => {
    assert.equal(classifyKey('people'), 'open');
    assert.equal(classifyKey('published:p123'), 'shared');
    assert.equal(classifyKey('published-spoons:p123'), 'shared');
    assert.equal(classifyKey('profile'), 'private');
    assert.equal(classifyKey('voiceSeen'), 'private');
    assert.equal(classifyKey('shareSpoons'), 'private');
  });
});
