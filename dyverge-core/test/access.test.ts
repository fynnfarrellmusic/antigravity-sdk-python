import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent } from '../src/index.ts';
import {
  AccessDeniedError,
  RESTRICTED_MODULES,
  createAccess,
  decide,
  deriveVerifier,
  guard,
  jointSessionSupported,
  lintCopy,
  proposalsFromObservations,
  pruneStaleObservations,
  supportRoutesFor,
} from '../src/index.ts';
import { observation } from './fixtures.ts';

const SALT = '00112233445566778899aabbccddeeff';
const ITER = 1000; // low for tests only; use 210000+ in a real build
const PASSCODE = 'test-only-passcode';

async function verifier() {
  return { saltHex: SALT, iterations: ITER, hashHex: await deriveVerifier(PASSCODE, SALT, ITER) };
}

describe('restricted module access', () => {
  it('is off by default, in either environment', async () => {
    for (const environment of ['production', 'internal-test'] as const) {
      const access = createAccess({ environment, verifier: await verifier() });
      for (const m of RESTRICTED_MODULES) assert.equal(access.isEnabled(m.id), false);
    }
  });

  it('can never be unlocked in production, even with the right passcode', async () => {
    const access = createAccess({ environment: 'production', verifier: await verifier() });
    assert.deepEqual(await access.unlock('screening', PASSCODE), { ok: false, reason: 'production' });
    assert.equal(access.isEnabled('screening'), false);
  });

  it('unlocks one module only, with the right passcode in an internal-test build', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier() });
    assert.deepEqual(await access.unlock('profile-proposals', PASSCODE), { ok: true });
    assert.equal(access.isEnabled('profile-proposals'), true);
    assert.equal(access.isEnabled('screening'), false);
  });

  it('refuses a wrong passcode and locks out after the maximum attempts', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier(), maxAttempts: 3 });
    assert.deepEqual(await access.unlock('screening', 'nope'), { ok: false, reason: 'wrong-passcode' });
    assert.deepEqual(await access.unlock('screening', 'nope'), { ok: false, reason: 'wrong-passcode' });
    assert.deepEqual(await access.unlock('screening', 'nope'), { ok: false, reason: 'locked-out' });
    // Even the right passcode is refused once locked out.
    assert.deepEqual(await access.unlock('screening', PASSCODE), { ok: false, reason: 'locked-out' });
    assert.equal(access.isEnabled('screening'), false);
  });

  it('refuses to unlock when no verifier was injected', async () => {
    const access = createAccess({ environment: 'internal-test' });
    assert.deepEqual(await access.unlock('screening', PASSCODE), { ok: false, reason: 'no-verifier' });
  });

  it('relocks on request, one module or all', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier() });
    await access.unlock('screening', PASSCODE);
    await access.unlock('profile-proposals', PASSCODE);
    access.lock('screening');
    assert.equal(access.isEnabled('screening'), false);
    assert.equal(access.isEnabled('profile-proposals'), true);
    access.lockAll();
    assert.equal(access.isEnabled('profile-proposals'), false);
  });

  it('guards entry points', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier() });
    const run = guard(access, 'profile-proposals', () => 'ran');
    assert.throws(() => run(), AccessDeniedError);
    await access.unlock('profile-proposals', PASSCODE);
    assert.equal(run(), 'ran');
  });

  it('guards the real proposal function end to end', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier() });
    const propose = guard(access, 'profile-proposals', proposalsFromObservations);
    const obs = [observation({ sessions: ['s1', 's2', 's3'] })];
    assert.throws(() => propose(obs, []), AccessDeniedError);
    await access.unlock('profile-proposals', PASSCODE);
    assert.equal(propose(obs, []).length, 1);
  });

  it('keeps an audit trail with no passcode in it', async () => {
    const access = createAccess({ environment: 'internal-test', verifier: await verifier(), now: () => 'T' });
    await access.unlock('screening', 'zzz-bad-guess');
    await access.unlock('screening', PASSCODE);
    access.lockAll();
    assert.throws(() => access.require('screening'));
    const text = JSON.stringify(access.auditLog());
    assert.ok(!text.includes(PASSCODE) && !text.includes('zzz-bad-guess'));
    assert.deepEqual(access.auditLog().map((e) => e.action), ['unlock-failed', 'unlock', 'lock', 'denied']);
  });

  it('returns a copy of the audit log, not the live one', async () => {
    const access = createAccess({ environment: 'internal-test' });
    (access.auditLog() as AuditEvent[]).push({ at: 'x', module: 'screening', action: 'unlock' });
    assert.equal(access.auditLog().length, 0);
  });

  it('shows a banner that passes the copy rules and names the reviews outstanding', () => {
    const access = createAccess({ environment: 'internal-test' });
    for (const m of RESTRICTED_MODULES) {
      const banner = access.banner(m.id);
      assert.deepEqual(lintCopy(banner), [], banner);
      for (const r of m.needsReview) assert.ok(banner.includes(r));
    }
  });
});

describe('support routes by locale', () => {
  it('has reviewed routes for the UK and nowhere else yet', () => {
    assert.equal(supportRoutesFor('en-GB')?.length, 3);
    assert.equal(supportRoutesFor('pt-BR'), undefined);
    assert.equal(supportRoutesFor('en'), undefined);
  });

  it('allows a joint session only if every person has reviewed routes', () => {
    assert.equal(jointSessionSupported(['en-GB', 'cy-GB']), true);
    assert.equal(jointSessionSupported(['en-GB', 'pt-BR']), false);
    assert.equal(jointSessionSupported([]), false);
  });
});

describe('observation retention', () => {
  const now = '2026-10-10T00:00:00Z';

  it('drops observations older than the limit', () => {
    const old = observation({ id: 'old', sessions: ['s1'], lastSeen: '2026-01-01T00:00:00Z' });
    const fresh = observation({ id: 'fresh', sessions: ['s1'], lastSeen: '2026-09-01T00:00:00Z' });
    assert.deepEqual(pruneStaleObservations([old, fresh], [], now).map((o) => o.id), ['fresh']);
  });

  it('keeps an old observation while a proposal built on it is pending', () => {
    const old = observation({ id: 'old', sessions: ['s1', 's2', 's3'], lastSeen: '2026-01-01T00:00:00Z' });
    const [p] = proposalsFromObservations([old], []);
    assert.equal(pruneStaleObservations([old], [p!], now).length, 1);
    const decided = decide(p!, 'declined', now, 3);
    assert.equal(pruneStaleObservations([old], [decided], now).length, 0);
  });

  it('rejects a bad date', () => {
    assert.throws(() => pruneStaleObservations([], [], 'not a date'), RangeError);
  });
});
