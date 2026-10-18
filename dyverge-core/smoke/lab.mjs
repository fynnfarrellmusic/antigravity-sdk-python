// Drives the Live Link Lab in two real browser pages, talking through a stand-in for the platform's
// live channel that runs in Node. Because the stand-in is ours, it can record every frame (to check
// the relay only ever sees ciphertext) and misbehave on command. It cannot prove the real platform
// behaves the same; that is what opening the lab on two devices is for.
//
//   npm run smoke:lab
//
// Needs the dev dependencies and a Chromium. Set CHROMIUM_PATH if yours differs.
//
// It runs twice: once as if both pages were the same account (the platform then calls every copy of
// the page "me", which is the likeliest way you will try it: two devices, one login), and once as if
// they were different accounts.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { chromium } from 'playwright-core';

if (!process.env.LAB_ACCOUNT) {
  let status = 0;
  for (const which of ['same', 'different']) {
    console.log(`\n=== ${which === 'same' ? 'One account on both devices' : 'A different account on each device'}`);
    const run = spawnSync('node', [process.argv[1]], { stdio: 'inherit', env: { ...process.env, LAB_ACCOUNT: which } });
    status ||= run.status ?? 1;
  }
  process.exit(status);
}
const SAME_ACCOUNT = process.env.LAB_ACCOUNT === 'same';
const SHOTS = process.env.LAB_SHOTS; // a folder to leave screenshots in, if wanted
const dir = mkdtempSync(join(tmpdir(), 'dyverge-lab-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const built = spawnSync('node', ['lab/build.mjs', join(dir, 'lab.html'), '--wrapped'], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr || built.stdout);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

// ── The stand-in for the platform ────────────────────────────────────────────────────────────

const rooms = new Map(); // room name -> Map(page id -> page)
const relayLog = []; // everything the relay was handed
let adversary = null; // (data, from) => data[]   what to deliver instead

const alive = (name) => rooms.get(name) ?? new Map();
async function announce(name) {
  const members = alive(name);
  for (const page of members.values()) {
    await page.evaluate(([n, count]) => window.__relayPeers(n, count), [name, members.size]).catch(() => {});
  }
}

await context.exposeBinding('__relayJoin', async ({ page }, name, id) => {
  if (!rooms.has(name)) rooms.set(name, new Map());
  rooms.get(name).set(id, page);
  await announce(name);
});
await context.exposeBinding('__relayCount', async (_source, name) => alive(name).size);
await context.exposeBinding('__relayLeave', async (_source, name, id) => {
  rooms.get(name)?.delete(id);
  await announce(name);
});
await context.exposeBinding('__relayEmit', async (_source, name, topic, data, from) => {
  relayLog.push({ name, topic, data, from });
  const out = adversary ? adversary(data, from) : [data];
  for (const page of alive(name).values()) {
    for (const d of out) {
      await page.evaluate(([n, t, dd, f]) => window.__relayDeliver(n, t, dd, f), [name, topic, d, from]).catch(() => {});
    }
  }
});

// What a page sees as `window.claude`: just the two abilities the lab declares.
await context.addInitScript((sameAccount) => {
  const handlers = new Map();
  const peerFns = new Map();
  const id = `page-${Math.random().toString(36).slice(2)}`;
  window.__mockId = id;
  window.__relayDeliver = (room, topic, data, from) => {
    for (const fn of handlers.get(`${room}|${topic}`) || []) {
      // On the real platform `isMe` is true for any open copy of the page on the same account, and
      // `sameTab` is true only for this very page.
      fn({ topic, data, peer: from, by: null, isMe: sameAccount || from === id, sameTab: from === id, kind: 'viewer', guest: false });
    }
  };
  window.__relayPeers = (room, count) => {
    for (const fn of peerFns.get(room) || []) fn({ peers: Array.from({ length: count }, () => ({})), joined: [], left: [], updated: [] });
  };
  window.__samplePrompts = [];
  const room = {
    join: async (name) => {
      await window.__relayJoin(name, id);
      return {
        name,
        emit: async (topic, data) => window.__relayEmit(name, topic, data, id),
        on: (topic, fn) => {
          const key = `${name}|${topic}`;
          handlers.set(key, [...(handlers.get(key) || []), fn]);
          return () => {};
        },
        presence: async () => {},
        peers: () => [],
        onPeers: (fn) => {
          peerFns.set(name, [...(peerFns.get(name) || []), fn]);
          // The real channel presents the room so far as soon as you start listening.
          window.__relayCount(name).then((count) => window.__relayPeers(name, count));
          return () => {};
        },
        connected: () => true,
        onConnection: (fn) => {
          queueMicrotask(() => fn(true));
          return () => {};
        },
        leave: async () => window.__relayLeave(name, id),
      };
    },
  };
  const sample = async (input) => {
    window.__samplePrompts.push(String(input));
    await new Promise((r) => setTimeout(r, 30));
    if (window.__sampleFail) throw { code: window.__sampleFail, message: 'refused' };
    return { text: window.__sampleReply ?? 'You do not seem to listen to me.', truncated: false };
  };
  window.claude = { use: async (name) => (name === 'room' ? room : name === 'sample' ? (window.__noSample ? null : sample) : null) };
  // Quicker clocks, so the test does not sit through the real waits.
  window.__labTick = 120;
  window.__labTiming = { resendMs: 300, beatMs: 500, staleMs: 2500, handshakeMs: 8000, verifyMs: 20000, consentMs: 20000, knockMs: 20000 };
}, SAME_ACCOUNT);

const url = pathToFileURL(join(dir, 'lab.html')).href;
const errors = [];
const pages = new Map();
async function openPage(label) {
  const page = await context.newPage();
  pages.set(label, page);
  page.on('pageerror', (e) => errors.push(`${label}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
  });
  await page.goto(url);
  await page.locator('html[data-ready=yes]').waitFor();
  return page;
}

const steps = [];
const step = (name) => {
  steps.push(name);
  process.stdout.write(`  ${name}\n`);
};
const heading = (page, text) => page.getByRole('heading', { name: text }).waitFor({ timeout: 8000 });
const bodyText = (page) => page.locator('body').innerText();
const logOf = (page) => page.locator('#log').innerText();
async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function openRoom(a, b, { trusted = false } = {}) {
  await a.getByRole('button', { name: /^Make a door/ }).click();
  if (trusted) await a.locator('#f-trusted').check();
  await a.getByRole('button', { name: 'Make the door' }).click();
  await a.locator('#door-code').waitFor();
  const code = (await a.locator('#door-code').innerText()).trim();
  await b.getByRole('button', { name: /^I have a code/ }).click();
  await b.locator('#f-code').fill(code.toLowerCase().replace(/-/g, ' '));
  if (trusted) await b.locator('#f-trusted').check();
  await b.getByRole('button', { name: 'Join the room' }).click();
  await heading(b, 'A knock at the door');
  await b.getByRole('button', { name: 'Open the door' }).click();
  return code;
}

async function goLive(a, b) {
  await heading(a, 'Do the five words match?');
  await heading(b, 'Do the five words match?');
  await a.getByRole('button', { name: 'They match', exact: true }).click();
  await b.getByRole('button', { name: 'They match', exact: true }).click();
  await heading(a, 'The room is live');
  await heading(b, 'The room is live');
}

try {
  console.log('The lab, in two pages:');

  // ── A room, start to finish ──────────────────────────────────────────────────────────────
  const a = await openPage('A');
  const b = await openPage('B');
  await shot(a, '1-start-light');

  step('opens a door, and the other page joins with the code typed any which way');
  await a.getByRole('button', { name: /^Make a door/ }).click();
  await shot(a, '2-make');
  await a.getByRole('button', { name: 'Make the door' }).click();
  await a.locator('#door-code').waitFor();
  const code = (await a.locator('#door-code').innerText()).trim();
  assert.match(code, /^([0-9A-Z]{4}-){6}[0-9A-Z]{4}$/);
  await shot(a, '3-door');
  await b.getByRole('button', { name: /^I have a code/ }).click();
  await b.locator('#f-code').fill('nonsense');
  await b.getByRole('button', { name: 'Join the room' }).click();
  assert.match(await bodyText(b), /not a live link code/);
  await b.locator('#f-code').fill(code.toLowerCase().replace(/-/g, ' '));
  await b.getByRole('button', { name: 'Join the room' }).click();

  step('shows the terms before anything opens, and A hears nothing back yet');
  await heading(b, 'A knock at the door');
  assert.equal(await b.locator('#terms-purpose').innerText(), 'A lab test with made-up words');
  assert.equal(await b.locator('#terms-kinds').innerText(), 'card, words');
  assert.equal(await b.locator('#terms-time').innerText(), '10 minutes');
  assert.match(await bodyText(a), /Waiting for them to open it/);
  await shot(b, '4-consent');
  await b.getByRole('button', { name: 'Open the door' }).click();

  step('shows the same five words on both, and waits until both have checked');
  await heading(a, 'Do the five words match?');
  await heading(b, 'Do the five words match?');
  const wordsA = await a.locator('#check-words li').allInnerTexts();
  const wordsB = await b.locator('#check-words li').allInnerTexts();
  assert.equal(wordsA.length, 5);
  assert.deepEqual(wordsA, wordsB);
  await shot(a, '5-words');
  await a.getByRole('button', { name: 'They match', exact: true }).click();
  await a.locator('#words-wait').waitFor();
  assert.match(await a.locator('h2').innerText(), /five words/);
  await b.getByRole('button', { name: 'They match', exact: true }).click();
  await heading(a, 'The room is live');
  await heading(b, 'The room is live');
  assert.match(await a.locator('#chip-room').innerText(), /live/);

  step('carries words both ways, and the relay only ever sees ciphertext');
  const said = ['I made this up for a test', 'and this is the other side replying'];
  await a.locator('#draft').fill(said[0]);
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText(said[0]).waitFor();
  await b.locator('#draft').fill(said[1]);
  await b.locator('#send-btn').click();
  await a.locator('#log').getByText(said[1]).waitFor();
  assert.ok(relayLog.length >= 6, 'frames crossed');
  for (const e of relayLog) {
    assert.equal(typeof e.data.f, 'string');
    const bytes = Buffer.from(e.data.f, 'base64url');
    for (const word of [...said, 'lab test', 'made-up']) {
      assert.ok(!bytes.includes(Buffer.from(word)) && !e.data.f.includes(word), `"${word}" is visible to the relay`);
    }
  }
  assert.ok((await a.locator('#tape-list li.out').count()) > 0 && (await a.locator('#tape-list li.in').count()) > 0, 'the tape shows both directions');
  assert.match(await a.locator('#tape-total').innerText(), /frames so far/);
  await shot(a, '6-live');

  step('times a round trip');
  await a.locator('#ping-btn').click();
  await a.locator('#rtt').filter({ hasText: /Round trips so far/ }).waitFor();
  assert.ok(!(await logOf(a)).includes('ping:'), 'a test message is not shown as a message');

  step('refuses a changed message, and carries on with the next');
  await a.getByText('Try to break it').click();
  await a.locator('#m-alter').check();
  await a.locator('#draft').fill('this one is damaged on the way');
  await a.locator('#send-btn').click();
  await b.waitForTimeout(500);
  assert.ok(!(await logOf(b)).includes('damaged on the way'));
  assert.equal(await a.locator('#m-none').isChecked(), true, 'the damage was for one message only');
  await a.locator('#draft').fill('this one is fine');
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText('this one is fine').waitFor();
  const tally = await b.locator('#tally').innerText();
  assert.match(tally, /Refused \d+\.[\s\S]*failed its check/);
  assert.match(tally, /known to be missing 1/);

  step('hears a message sent twice only once, and shrugs off junk and a lost message');
  await a.locator('#m-twice').check();
  await a.locator('#draft').fill('sent twice');
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText('sent twice').waitFor();
  await a.locator('#m-junk').check();
  await a.locator('#draft').fill('replaced by junk');
  await a.locator('#send-btn').click();
  await a.locator('#m-drop').check();
  await a.locator('#draft').fill('lost on the way');
  await a.locator('#send-btn').click();
  await a.locator('#draft').fill('after the trouble');
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText('after the trouble').waitFor();
  const log = await logOf(b);
  assert.equal(log.split('sent twice').length - 1, 1, 'once');
  assert.ok(!log.includes('replaced by junk') && !log.includes('lost on the way'));
  assert.match(await b.locator('#tally').innerText(), /known to be missing [2-9]/);

  step('keeps the rule that Claude is shown only the other person\'s tick-boxes');
  await b.locator('#c-gentle').check();
  await b.locator('#card-btn').click();
  await a.locator('#card-status').filter({ hasText: /Their card: short and direct; gentle and warm/ }).waitFor();
  await a.locator('#draft').fill('you never listen to me');
  await a.locator('#soften-btn').click();
  await a.locator('#suggest-text').waitFor();
  assert.equal(await a.locator('#suggest-text').innerText(), 'You do not seem to listen to me.');
  assert.match(await a.locator('#suggestion').innerText(), /has not been sent/);
  assert.ok(!(await logOf(b)).includes('You do not seem'), 'nothing crossed yet');
  const prompts = await a.evaluate(() => window.__samplePrompts);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /short and direct; gentle and warm/);
  assert.match(prompts[0], /you never listen to me/);
  for (const theirs of [said[1], 'Their card'])
    assert.ok(!prompts[0].includes(theirs), `Claude was shown "${theirs}"`);
  await a.locator('#use-suggestion').click();
  assert.equal(await a.locator('#draft').inputValue(), 'You do not seem to listen to me.');
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText('You do not seem to listen to me.').waitFor();

  step('says so when Claude is not allowed, and sends nothing');
  await a.evaluate(() => (window.__sampleFail = 'not_granted'));
  await a.locator('#draft').fill('another draft');
  await a.locator('#soften-btn').click();
  await a.locator('#suggestion').filter({ hasText: /not allowed on this page/ }).waitFor();
  assert.ok(!(await logOf(b)).includes('another draft'));
  await a.evaluate(() => (window.__sampleFail = null));

  step('can be paused by either person, which shuts the composer on both');
  await a.locator('#pause-btn').click();
  await b.locator('#log').getByText(/They narrowed the room to: nothing \(paused\)/).waitFor();
  assert.equal(await b.locator('#send-btn').isDisabled(), true);
  assert.equal(await a.locator('#send-btn').isDisabled(), true);
  assert.equal(await a.locator('#chip-room').innerText(), 'Room: live', 'still open');

  step('copies a report of numbers, never words');
  await a.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('refused'));
  });
  await a.locator('#report-btn').click();
  const reportText = await a.locator('#report-fallback').inputValue();
  assert.match(reportText, /Live Link Lab v1 report \(no words, only numbers\)/);
  assert.match(reportText, /Frames sent \d+, heard \d+, missing \d+/);
  assert.match(reportText, /Round trips \(ms\): \d+/);
  for (const w of [...said, 'damaged', 'sent twice', 'after the trouble', 'you never listen']) assert.ok(!reportText.includes(w), `"${w}" is in the report`);

  step('closes when one person seals it, and both are told');
  await a.locator('#seal-btn').click();
  await heading(a, 'The room is closed');
  await heading(b, 'The room is closed');
  assert.equal(await a.locator('#ended-reason').innerText(), 'You closed the room.');
  assert.equal(await b.locator('#ended-reason').innerText(), 'They closed the room.');
  await shot(b, '7-ended');

  // ── Trusting each other for next time ─────────────────────────────────────────────────────
  step('skips the words when each has trusted the other, in the next room');
  await a.locator('#trust-btn').click();
  await b.locator('#trust-btn').click();
  await a.getByRole('button', { name: 'Start again' }).click();
  await b.getByRole('button', { name: 'Start again' }).click();
  await openRoom(a, b, { trusted: true });
  await heading(a, 'The room is live');
  await heading(b, 'The room is live');
  assert.equal((await a.locator('#check-words').count()) + (await b.locator('#check-words').count()), 0, 'no words were shown');

  // ── Leaving quietly ──────────────────────────────────────────────────────────────────────
  step('looks like a lost connection when someone leaves quietly');
  await b.locator('#leave-btn').click();
  await heading(b, 'The room is closed');
  await heading(a, 'The room is closed');
  // Had a "closed" message been sent, A would say "They closed the room". It says they went quiet.
  assert.equal(await a.locator('#ended-reason').innerText(), 'They went quiet, so the room closed itself.');
  await a.getByRole('button', { name: 'Start again' }).click();
  await b.getByRole('button', { name: 'Start again' }).click();

  // ── Saying no ────────────────────────────────────────────────────────────────────────────
  step('sends nothing at all when the answer is no');
  const idB = await b.evaluate(() => window.__mockId);
  const before = relayLog.filter((e) => e.from === idB).length;
  await a.getByRole('button', { name: /^Make a door/ }).click();
  await a.getByRole('button', { name: 'Make the door' }).click();
  await a.locator('#door-code').waitFor();
  const code2 = (await a.locator('#door-code').innerText()).trim();
  await b.getByRole('button', { name: /^I have a code/ }).click();
  await b.locator('#f-code').fill(code2);
  await b.getByRole('button', { name: 'Join the room' }).click();
  await heading(b, 'A knock at the door');
  await b.getByRole('button', { name: 'Not now' }).click();
  await heading(b, 'The room is closed');
  assert.match(await b.locator('#ended-reason').innerText(), /Nothing was sent/);
  await a.waitForTimeout(900);
  assert.equal(relayLog.filter((e) => e.from === idB).length, before, 'B put nothing on the channel');
  assert.match(await bodyText(a), /Waiting for them to open it/, 'A has heard nothing, not even a refusal');
  await a.getByRole('button', { name: 'Cancel' }).click();
  await heading(a, 'The room is closed');
  await a.getByRole('button', { name: 'Start again' }).click();
  await b.getByRole('button', { name: 'Start again' }).click();

  // ── A relay that repeats everything ──────────────────────────────────────────────────────
  step('copes with a relay that repeats every frame');
  adversary = (data) => [data, data];
  await openRoom(a, b);
  await goLive(a, b);
  await a.locator('#draft').fill('once, though the relay said it twice');
  await a.locator('#send-btn').click();
  await b.locator('#log').getByText('once, though the relay said it twice').waitFor();
  assert.equal((await logOf(b)).split('once, though the relay').length - 1, 1);
  adversary = null;

  // ── Dark, and a narrow phone ─────────────────────────────────────────────────────────────
  step('reads in the dark and at phone width without scrolling sideways');
  await a.emulateMedia({ colorScheme: 'dark' });
  await shot(a, '8-live-dark');
  for (const page of [a, b]) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
  }

  assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`);
  console.log(`\n${steps.length} things checked in the lab, in two pages. The platform's real channel is for you to try.`);
} catch (err) {
  // When something fails, show what each page was showing, which is most of what is needed to see why.
  for (const [label, page] of pages) {
    const text = await page.locator('body').innerText().catch(() => '(page gone)');
    console.error(`\n--- ${label} was showing ---\n${text.split('\n').filter(Boolean).slice(0, 40).join('\n')}`);
  }
  console.error(`\npage errors so far: ${JSON.stringify(errors)}`);
  throw err;
} finally {
  await browser.close();
}
