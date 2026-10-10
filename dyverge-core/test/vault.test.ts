import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LEGACY_PRIVATE_KEYS,
  browserStore,
  classifyKey,
  createVault,
  ephemeralVault,
  hasLegacyData,
  memoryStore,
  migrateLegacy,
  openVault,
  vaultExists,
} from '../src/index.ts';

const FAST = { iterations: 1000 }; // tests only; the real default is 210,000
const PASS = 'correct horse battery';

const dump = (store: ReturnType<typeof memoryStore>) =>
  store.keys().map((k) => `${k}=${store.get(k)}`).join('\n');

describe('a private space', () => {
  it('keeps what you put in, and opens only with the passphrase', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('profiles', { me: { name: 'Fynn' } });
    await v.lock();

    const again = openVault(store, 'a');
    assert.equal(again.isUnlocked(), false);
    assert.equal(await again.unlock('not the passphrase'), false);
    assert.equal(again.isUnlocked(), false);
    assert.equal(await again.unlock(PASS), true);
    assert.deepEqual(again.get('profiles', null), { me: { name: 'Fynn' } });
  });

  it('writes nothing readable to storage', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('translations', [{ text: 'I am scared you will leave', reading: 'private reading' }]);
    await v.put('profiles', { me: { name: 'Fynn', needToHear: 'that I am safe' } });
    await v.put('vibe', 'cocoon');
    const raw = dump(store);
    for (const secret of ['scared', 'leave', 'private reading', 'Fynn', 'that I am safe', 'cocoon', PASS]) {
      assert.ok(!raw.includes(secret), `"${secret}" is readable in storage`);
    }
  });

  it('stores each value under a fresh random IV', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('x', 'same');
    const first = store.get('dyverge:vault:a:k:x');
    await v.put('x', 'same');
    assert.notEqual(store.get('dyverge:vault:a:k:x'), first);
  });

  it('refuses to be read or written while locked', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('k', 1);
    await v.lock();
    assert.throws(() => v.get('k', 0), /locked/);
    assert.throws(() => v.put('k', 2), /locked/);
    assert.throws(() => v.clear(), /locked/);
  });

  it('saves pending writes before it locks', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    void v.put('late', 'still saved'); // not awaited on purpose
    await v.lock();
    const again = openVault(store, 'a');
    await again.unlock(PASS);
    assert.equal(again.get('late', null), 'still saved');
  });

  it('keeps writes in order', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    for (let i = 0; i < 20; i++) void v.put('n', i);
    await v.lock();
    const again = openVault(store, 'a');
    await again.unlock(PASS);
    assert.equal(again.get('n', -1), 19);
  });

  it('removes one entry, or all of them while keeping the passphrase', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('one', 1);
    await v.put('two', 2);
    await v.remove('one');
    assert.equal(v.get('one', 'gone'), 'gone');
    await v.clear();
    assert.equal(store.keys().filter((k) => k.includes(':k:')).length, 0);
    assert.equal(vaultExists(store, 'a'), true, 'the passphrase survives a clear');
    await v.lock();
    assert.equal(await openVault(store, 'a').unlock(PASS), true);
  });

  it('gives back a copy, so callers cannot change what is stored', async () => {
    const v = await createVault(memoryStore(), 'a', PASS, FAST);
    await v.put('o', { n: 1 });
    const got = v.get('o', { n: 0 });
    got.n = 99;
    assert.deepEqual(v.get('o', { n: 0 }), { n: 1 });
  });

  it('treats the same typed characters the same on any keyboard (NFKC)', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', 'ﬁle-pass-123', FAST); // "ﬁ" ligature
    await v.lock();
    assert.equal(await openVault(store, 'a').unlock('file-pass-123'), true);
  });

  it('will not make a vault twice, or with a weak passphrase', async () => {
    const store = memoryStore();
    await assert.rejects(createVault(store, 'a', 'abc', FAST), RangeError);
    await createVault(store, 'a', PASS, FAST);
    await assert.rejects(createVault(store, 'a', PASS, FAST), /already exists/);
  });

  it('does not throw on a damaged header, it just will not open', async () => {
    const store = memoryStore();
    await createVault(store, 'a', PASS, FAST);
    store.set('dyverge:vault:a:__header', '{not json');
    assert.equal(await openVault(store, 'a').unlock(PASS), false);
  });
});

describe('two people on one phone', () => {
  async function both() {
    const store = memoryStore();
    const a = await createVault(store, 'a', 'alex passphrase one', FAST);
    const b = await createVault(store, 'b', 'bo passphrase two', FAST);
    await a.put('profiles', { me: 'Alex private' });
    await b.put('profiles', { me: 'Bo private' });
    await a.lock();
    await b.lock();
    return store;
  }

  it('cannot open each other', async () => {
    const store = await both();
    assert.equal(await openVault(store, 'a').unlock('bo passphrase two'), false);
    assert.equal(await openVault(store, 'b').unlock('alex passphrase one'), false);
  });

  it('see only their own data', async () => {
    const store = await both();
    const a = openVault(store, 'a');
    await a.unlock('alex passphrase one');
    const b = openVault(store, 'b');
    await b.unlock('bo passphrase two');
    assert.deepEqual(a.get('profiles', null), { me: 'Alex private' });
    assert.deepEqual(b.get('profiles', null), { me: 'Bo private' });
  });

  it('cannot move one person entry into the other vault and have it read', async () => {
    const store = await both();
    store.set('dyverge:vault:b:k:profiles', store.get('dyverge:vault:a:k:profiles')!);
    const b = openVault(store, 'b');
    assert.equal(await b.unlock('bo passphrase two'), true);
    assert.deepEqual(b.unreadable(), ['profiles']);
    assert.equal(b.get('profiles', 'fallback'), 'fallback');
  });

  it('erasing one leaves the other untouched', async () => {
    const store = await both();
    const a = openVault(store, 'a');
    await a.unlock('alex passphrase one');
    a.erase();
    assert.equal(vaultExists(store, 'a'), false);
    assert.equal(store.keys().some((k) => k.startsWith('dyverge:vault:a:')), false);
    assert.equal(await openVault(store, 'b').unlock('bo passphrase two'), true);
  });
});

describe('tampering', () => {
  it('is caught per entry and does not lose the rest', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('good', 'kept');
    await v.put('hit', 'damaged');
    await v.lock();
    const entry = JSON.parse(store.get('dyverge:vault:a:k:hit')!);
    entry.ct = entry.ct.slice(0, -4) + 'AAAA';
    store.set('dyverge:vault:a:k:hit', JSON.stringify(entry));

    const again = openVault(store, 'a');
    assert.equal(await again.unlock(PASS), true);
    assert.deepEqual(again.unreadable(), ['hit']);
    assert.equal(again.get('good', null), 'kept');
  });

  it('catches an entry swapped under another key', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('vibe', 'cocoon');
    await v.put('toolLog', []);
    await v.lock();
    store.set('dyverge:vault:a:k:toolLog', store.get('dyverge:vault:a:k:vibe')!);
    const again = openVault(store, 'a');
    await again.unlock(PASS);
    assert.deepEqual(again.unreadable(), ['toolLog']);
  });
});

describe('changing and forgetting the passphrase', () => {
  it('re-encrypts everything under the new one, and the old one stops working', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('profiles', { me: 'kept' });
    assert.equal(await v.changePassphrase('wrong', 'a brand new phrase'), false);
    assert.equal(await v.changePassphrase(PASS, 'a brand new phrase'), true);
    await v.lock();

    assert.equal(await openVault(store, 'a').unlock(PASS), false);
    const again = openVault(store, 'a');
    assert.equal(await again.unlock('a brand new phrase'), true);
    assert.deepEqual(again.get('profiles', null), { me: 'kept' });
  });

  it('rejects a weak new passphrase', async () => {
    const v = await createVault(memoryStore(), 'a', PASS, FAST);
    await assert.rejects(v.changePassphrase(PASS, 'abc'), RangeError);
  });

  it('can be erased when forgotten, and then a new one can be made', async () => {
    const store = memoryStore();
    const v = await createVault(store, 'a', PASS, FAST);
    await v.put('profiles', 'old');
    v.erase();
    assert.deepEqual(store.keys(), []);
    const fresh = await createVault(store, 'a', 'something else entirely', FAST);
    assert.equal(fresh.get('profiles', 'empty'), 'empty');
  });
});

describe('use without saving', () => {
  it('holds things in memory only and forgets them on lock', async () => {
    const v = ephemeralVault('a');
    assert.equal(v.ephemeral, true);
    await v.put('profiles', { me: 'x' });
    assert.deepEqual(v.get('profiles', null), { me: 'x' });
    await v.lock();
    assert.throws(() => v.get('profiles', null), /ended/);
    assert.equal(await v.unlock('anything'), false, 'there is nothing to unlock');
    assert.equal(await v.changePassphrase('a', 'b'), false);
  });
});

describe('what is private, shared or open', () => {
  it('shares only Our words and the agreement; settings stay open', () => {
    assert.equal(classifyKey('words'), 'shared');
    assert.equal(classifyKey('agreement'), 'shared');
    assert.equal(classifyKey('settings'), 'open');
  });

  it('treats everything else as private, including things not invented yet', () => {
    for (const k of LEGACY_PRIVATE_KEYS) assert.equal(classifyKey(k), 'private', k);
    for (const k of ['somethingNew', 'observations', 'proposals', '']) assert.equal(classifyKey(k), 'private', k);
  });
});

describe('moving older plain-text data into the vault', () => {
  it('encrypts it, then removes the plain copy', async () => {
    const store = memoryStore();
    store.set('dyverge:profiles', JSON.stringify({ me: { name: 'Fynn' } }));
    store.set('dyverge:vibe', JSON.stringify('cocoon'));
    store.set('dyverge:toolLog', JSON.stringify([{ id: 'weight', helped: 'yes' }]));
    store.set('dyverge:words', JSON.stringify([{ phrase: 'Reset' }]));
    store.set('dyverge:settings', JSON.stringify({ lessMotion: true }));
    assert.equal(hasLegacyData(store), true);

    const v = await createVault(store, 'a', PASS, FAST);
    const moved = await migrateLegacy(store, v);
    assert.deepEqual(moved.sort(), ['profiles', 'toolLog', 'vibe']);

    assert.equal(v.get('vibe', null), 'cocoon');
    assert.equal(store.get('dyverge:profiles'), null);
    assert.equal(store.get('dyverge:vibe'), null);
    assert.equal(store.get('dyverge:words') !== null, true, 'shared data stays where it is');
    assert.equal(store.get('dyverge:settings') !== null, true, 'open data stays where it is');
    assert.ok(!dump(store).includes('Fynn'));
    assert.equal(hasLegacyData(store), false);
  });

  it('leaves unreadable plain data alone instead of destroying it', async () => {
    const store = memoryStore();
    store.set('dyverge:profiles', '{not json');
    const v = await createVault(store, 'a', PASS, FAST);
    assert.deepEqual(await migrateLegacy(store, v), []);
    assert.equal(store.get('dyverge:profiles'), '{not json');
  });
});

describe('storage that is blocked', () => {
  it('falls back to memory, so the app still works', () => {
    const s = browserStore();
    s.set('a', '1');
    assert.equal(s.get('a'), '1');
    s.remove('a');
    assert.equal(s.get('a'), null);
  });
});
