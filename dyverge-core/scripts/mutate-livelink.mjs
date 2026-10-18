// Do the live link tests notice when the live link is broken?
//
// This breaks src/livelink.ts in specific, plausible ways (a check removed, a key not wiped, a
// limit dropped), one at a time, in a throwaway copy, and runs test/livelink.test.ts against each.
// A broken copy that still passes means a missing test. It takes a couple of minutes, so it is not
// part of `npm test`:
//
//   npm run mutate:livelink
//
// It exits with 1 if any change was not applied (the module moved on and this list needs a look),
// if a change broke the file instead of its behaviour, or if a real mutant survived. The two
// "equivalent" mutants below survive on purpose: removing them changes no behaviour anyone can see.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CORE = fileURLToPath(new URL('..', import.meta.url));
const APP = fileURLToPath(new URL('../../dyverge-app', import.meta.url));
const original = readFileSync(join(CORE, 'src/livelink.ts'), 'utf8');

const TIMEOUT_MS = 60_000;

// [name, change, equivalent?]. `equivalent` says why the change cannot be seen from outside.
const mutants = [
  ['data frames carry no associated data (sender and receiver)', (s) => s
    .replace('llSeal(s.key, s.nonce, padded, llCat(head, Uint8Array.of(llDirection(st.role))))', 'llSeal(s.key, s.nonce, padded, new Uint8Array(0))')
    .replace('const aad = llCat(head, Uint8Array.of(llDirection(other)));', 'const aad = new Uint8Array(0); void other;')],
  ['knocker does not verify the listener signature', (s) => s.replace('(await llVerify(listenerId, sig, llCat(llEnc.encode(LL_SIG_LISTENER), t0)))', 'true')],
  ['listener does not verify the knocker signature', (s) => s.replace('(await llVerify(knockerId, sig, llCat(llEnc.encode(LL_SIG_KNOCKER), st.t0, await llSha256(st.identity.publicKey))))', 'true')],
  ['knocker does not check the identity MAC', (s) => s.replace('(await llMacOk(hs.macListener, mac, llCat(llEnc.encode(LL_ID_LABEL), listenerId))) &&', 'true &&')],
  ['listener does not check the identity MAC', (s) => s.replace('(await llMacOk(st.hs.macKnocker, mac, llCat(llEnc.encode(LL_ID_LABEL), knockerId))) &&', 'true &&')],
  ['knocker ignores a changed pinned key', (s) => s.replace("if (st.expectedPeer !== null && !pinned) {\n    wipeAttempt();", 'if (false) {\n    wipeAttempt();')],
  ['listener ignores a changed pinned key', (s) => s.replace("if (st.expectedPeer !== null && !pinned) return llClose(st, step, 'peer-changed');", '')],
  ['the terms are not part of the keys', (s) => s.replace('await llSha256(charterBytes),', 'new Uint8Array(32),')],
  ['knock has no associated data', (s) => s
    .replace('const ct = await llSeal(inviteKey, nonce, st.charterBytes, head);', 'const ct = await llSeal(inviteKey, nonce, st.charterBytes, new Uint8Array(0));')
    .replace('const plain = await llOpen(st.inviteKey, nonce, b.subarray(LL_KNOCK_HEAD), b.subarray(0, LL_KNOCK_HEAD));', 'const plain = await llOpen(st.inviteKey, nonce, b.subarray(LL_KNOCK_HEAD), new Uint8Array(0));')],
  ['no padding (exact sizes)', (s) => s.replace('const size = LINK_LIMITS.buckets.find((b) => b >= plain.length + 1);', 'const size = plain.length + 1;')],
  ['the sending chain does not advance', (s) => s.replace('  chain.ck = s.next;\n  chain.next = n + 1;\n  st.lastSent', '  chain.next = n + 1;\n  st.lastSent')],
  ['no limit on how far ahead a frame may be', (s) => s.replace("if (n - chain.next > LINK_LIMITS.skip) return 'too-far';", '')],
  ['a failed frame still moves the chain', (s) => s.replace('  const plain = mk ? await llOpen(mk.key, mk.nonce, ct, aad) : null;\n  if (!mk || !plain) {', '  const plain = mk ? await llOpen(mk.key, mk.nonce, ct, aad) : null;\n  chain.ck = ck; chain.next = n + 1;\n  if (!mk || !plain) {')],
  ['sending is allowed before the room is live', (s) => s.replace("if (st.phase !== 'live') return refuse('not-live', 'The room is not open');\n        if (!st.charter?.kinds.includes(kind))", "if (st.phase !== 'live' && st.phase !== 'verify') return refuse('not-live', 'The room is not open');\n        if (!st.charter?.kinds.includes(kind))")],
  ['the room goes live without waiting for the other person', (s) => s.replace('  if (st.peerReady) await llGoLive(st, step);\n}\n\nasync function llGoLive', '  await llGoLive(st, step);\n}\n\nasync function llGoLive')],
  ['keys are not wiped on close', (s) => s.replace('  llWipeChain(st.sending);\n  llWipeChain(st.receiving);\n  st.secret', '  st.secret')],
  ['a room can be widened', (s) => s.replace("if (!fine) return refuse('widen', 'A room can be narrowed, never widened');", '')],
  ['the receiving side does not enforce the agreed kinds', (s) => s.replace("} else if (st.charter?.kinds.includes(m.kind)) {\n      step.events.push({ type: 'message'", "} else if (true) {\n      step.events.push({ type: 'message'")],
  ['the agreed time is not enforced', (s) => s.replace('if (t - st.liveAt > ttl) {', 'if (false) {')],
  ['a quiet partner is never noticed', (s) => s.replace('} else if (t - st.lastHeard > timing.staleMs) {', '} else if (false) {')],
  ['a refusal is sent as a message', (s) => s.replace("llClose(st, step, 'declined');\n        return step; // nothing is sent, on purpose", "step.out.push('AAAA'); llClose(st, step, 'declined');\n        return step;")],
  ['a late frame can be used twice', (s) => s.replace('    llWipe(kept.key, kept.nonce);\n    chain.kept.delete(n);', '    llWipe(kept.key, kept.nonce);')],
  ['the words ignore who is on the other end', (s) => s.replace("const checkBytes = await llSha256(llEnc.encode('dyverge/link/1/check'), t0, knockerHash, listenerHash);", "const checkBytes = await llSha256(llEnc.encode('dyverge/link/1/check'), t0); void knockerHash; void listenerHash;"),
    'the words come from the transcript, which both identities have already signed, so a different identity cannot give the same words'],
  ['an invalid point is not refused by name', (s) => s.replace('if (pub.length !== 65 || pub[0] !== 4) return false;', 'if (pub.length < 0) return false;'),
    'the browser refuses a point that is not on the curve itself; the explicit check is a second lock on the same door'],
  ['a knock is not repeated', (s) => s.replace('else if (st.knockFrame && t - st.lastSent >= timing.resendMs) {', 'else if (false) {')],
  ['a lost ready is not repeated', (s) => s
    .replace('} else if (st.readyFrame && !st.peerReady && t - st.lastReady >= timing.resendMs) {', '} else if (false) {')
    .replace('if (st.readyFrame && !st.peerLive && t - st.lastReady >= timing.resendMs) {', 'if (false) {')],
  ['early frames are dropped instead of kept', (s) => s.replace('if (st.stash.length < LINK_LIMITS.stash) st.stash.push(text);', '')],
  ['a room does not speak when it goes live', (s) => s.replace('  const frame = await llSendFrame(st, T_BEAT, LL_EMPTY);\n  if (frame) step.out.push(frame);\n}\n\n/** The handshake is done', '}\n\n/** The handshake is done')],
  ['a narrowing replaces instead of intersecting', (s) => s.replace('const kept = st.charter.kinds.filter((k) => (next as string[]).includes(k));', 'const kept = (next as string[]).slice().sort();')],
];

const root = mkdtempSync(join(tmpdir(), 'dyverge-mutants-'));
const tree = join(root, 'tree');

function fresh() {
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(join(tree, 'dyverge-core', 'test'), { recursive: true });
  cpSync(join(CORE, 'src'), join(tree, 'dyverge-core', 'src'), { recursive: true });
  cpSync(join(CORE, 'test', 'livelink.test.ts'), join(tree, 'dyverge-core', 'test', 'livelink.test.ts'));
  writeFileSync(join(tree, 'dyverge-core', 'package.json'), '{"type":"module"}');
  symlinkSync(APP, join(tree, 'dyverge-app'));
}

let problems = 0;
let caught = 0;
let equivalent = 0;
const lines = [];

// The unchanged copy must pass, or nothing below means anything.
fresh();
writeFileSync(join(tree, 'dyverge-core', 'src', 'livelink.ts'), original);
const base = spawnSync('node', ['--test', 'test/livelink.test.ts'], { cwd: join(tree, 'dyverge-core'), encoding: 'utf8', timeout: TIMEOUT_MS });
if (base.status !== 0) {
  console.error('The unchanged module does not pass its own tests here, so there is nothing to compare against.');
  console.error((base.stdout || '') + (base.stderr || ''));
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

for (const [name, change, why] of mutants) {
  fresh();
  const mutated = change(original);
  if (mutated === original) {
    lines.push(`!! not applied   ${name}`);
    problems++;
    continue;
  }
  writeFileSync(join(tree, 'dyverge-core', 'src', 'livelink.ts'), mutated);
  const r = spawnSync('node', ['--test', 'test/livelink.test.ts'], { cwd: join(tree, 'dyverge-core'), encoding: 'utf8', timeout: TIMEOUT_MS });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [...out.matchAll(/^\s+not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  if (r.error && r.error.code === 'ETIMEDOUT') {
    caught++;
    lines.push(`caught (hang)    ${name}`);
  } else if (failed.length === 0 && !/# pass \d+/.test(out)) {
    lines.push(`!! broke the file ${name}`);
    problems++;
  } else if (failed.length === 0) {
    if (why) {
      equivalent++;
      lines.push(`equivalent       ${name}\n                   because: ${why}`);
    } else {
      lines.push(`!! SURVIVED      ${name}`);
      problems++;
    }
  } else {
    caught++;
    lines.push(`caught (${String(failed.length).padStart(2)})     ${name}\n                   first: ${failed[0]}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(lines.join('\n'));
console.log(`\n${mutants.length} changes: ${caught} caught, ${equivalent} equivalent, ${problems} to look at.`);
process.exit(problems === 0 ? 0 : 1);
