// Runs the real app in headless Chromium and checks the plural-pathways behaviour.
//   npm run smoke
// Needs the dev dependencies (npm install) and a Chromium. Set CHROMIUM_PATH if yours differs.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright-core';

import { TOOL_FAMILY, VIBE_FAMILY } from '../test/app-data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
// DYVERGE_APP_FILE points the run at another copy of the app, so a deliberately broken copy can
// prove a check fails when it should (a negative control) without touching the real file.
const appFile = process.env.DYVERGE_APP_FILE ?? fileURLToPath(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'dyverge-smoke-'));

writeFileSync(
  join(dir, 'entry.jsx'),
  `import React from "react"; import { createRoot } from "react-dom/client"; import App from ${JSON.stringify(appFile)};
createRoot(document.getElementById("root")).render(<App />);`,
);
writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root"></div><script src="out.js"></script>');
await build({
  entryPoints: [join(dir, 'entry.jsx')],
  bundle: true,
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  nodePaths: [join(root, 'node_modules')],
  outfile: join(dir, 'out.js'),
  logLevel: 'error',
});

// Each test gets its own browser with an on-disk profile, which is how a real phone keeps its
// storage. (Playwright's default in-memory context lost storage more often.) Even so, under heavy
// load Chromium has rarely handed a reloaded page an empty localStorage: the new page started with
// no keys at all, before any app code ran, while the page's own clear and removeItem calls (logged
// below) show the app removed nothing. A bare page never did it, so the cause is not fully
// understood. A run that dies that way says so and is repeated once; any other failure stops the
// run as before.
const launchOptions = {
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
  viewport: { width: 390, height: 844 },
};
const openContexts = new Set();
const profileDirs = [];
// Best effort: Chromium can still be flushing files when its context closes, and a leftover
// temp folder must never fail a test.
function removeProfiles() {
  for (const p of profileDirs.splice(0)) {
    try {
      rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
      /* the system's temp cleaner will get it */
    }
  }
}
process.on('exit', removeProfiles);

// What the page itself did to its storage, for the last page opened. If a run fails because storage
// looks empty, this says whether the app removed anything or the browser handed over an empty store.
let storageLog = [];

// True only when the last page opened empty right after a page that held data, and nothing the page
// did removed the open or shared keys or cleared a store that had anything in it.
function browserLostStorage() {
  const notes = storageLog.map((l) => l.slice(l.indexOf(' ') + 1));
  const last = notes.length - 1 - [...notes].reverse().findIndex((n) => /^page starts with \d+ keys$/.test(n));
  if (last < 0 || last >= notes.length || notes[last] !== 'page starts with 0 keys') return false;
  const before = notes.slice(0, last).reverse().find((n) => /^page (ends|starts) with \d+ keys$/.test(n));
  if (!before || !/^page ends with [1-9]\d* keys$/.test(before)) return false;
  const removed = notes.some((n) => /^clear \[\] -> [1-9]\d* keys before$/.test(n) || /^removeItem \["dyverge:(people|settings|words|agreement)"\]/.test(n));
  return !removed;
}

process.on('uncaughtException', (err) => {
  console.error(`\nStorage notes from the last page (newest last):\n${storageLog.join('\n') || '(none)'}\n`);
  console.error(err);
  process.exit(1);
});

// Runs one test. If it dies because the browser lost its own storage (see browserLostStorage), that
// one test is repeated once, out loud. Any other failure, or a second loss, stops the run.
const errors = [];
let repeatedTests = 0;
async function scenario(run) {
  const errorsBefore = errors.length;
  try {
    await run();
  } catch (err) {
    if (!browserLostStorage()) throw err;
    console.error('\nA reloaded page opened with no stored data after a page that had some, and nothing the page did\nremoved it. That is the browser losing its own storage, not the app (see the README). Repeating that one test.\n');
    await Promise.allSettled([...openContexts].map((c) => c.close()));
    errors.length = errorsBefore;
    repeatedTests += 1;
    await run();
  }
}

const PASSPHRASE = 'correct horse battery';

async function makeSpace(page, pass = PASSPHRASE, name = 'Fynn') {
  await page.locator('#vs-name').fill(name);
  await page.locator('#vs-pass').fill(pass);
  await page.locator('#vs-again').fill(pass);
  await page.getByRole('button', { name: 'Lock my private space' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
}

async function fresh(vibe, history, opts = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'dyverge-profile-'));
  profileDirs.push(profile);
  const context = await chromium.launchPersistentContext(profile, launchOptions);
  openContexts.add(context);
  context.on('close', () => openContexts.delete(context));
  const page = context.pages()[0] ?? (await context.newPage());
  storageLog = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[storage]')) storageLog.push(`${new Date().toISOString().slice(11, 23)} ${m.text().slice(10)}`);
    if (storageLog.length > 60) storageLog.shift();
  });
  // A page whose storage is blocked (a sandboxed viewer) is made before anything else looks at storage.
  if (opts.blockStorage) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException("Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.", 'SecurityError');
        },
      });
    });
  }
  await page.addInitScript(() => {
    const note = (...a) => console.log('[storage]', ...a);
    const count = () => { try { return Object.keys(localStorage).length; } catch (e) { return 'blocked'; } };
    note('page starts with', count(), 'keys');
    window.addEventListener('pagehide', () => note('page ends with', count(), 'keys'));
    for (const method of ['clear', 'removeItem']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (method === 'clear' || !String(args[0]).startsWith('dyverge:vault:')) note(method, JSON.stringify(args).slice(0, 60), '->', count(), 'keys before');
        return original.apply(this, args);
      };
    }
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Seeds older plain-text data on the first load only. The marker is the URL hash, which the
  // script removes as it goes, so a later reload can never re-seed (and wipe what the test saved).
  await page.addInitScript(([v, h]) => {
    if (location.hash !== '#seed') return;
    try { localStorage.length; } catch (e) { return; } // blocked storage: nothing to seed
    localStorage.clear();
    if (v) localStorage.setItem('dyverge:vibe', JSON.stringify(v));
    if (h) localStorage.setItem('dyverge:toolLog', JSON.stringify(h));
    history.replaceState(null, '', location.pathname + location.search);
  }, [vibe, history]);
  await page.goto(`${pathToFileURL(join(dir, 'index.html')).href}#seed`);
  if (!opts.raw && !opts.blockStorage) await makeSpace(page);
  return page;
}

async function flood(page) {
  await page.evaluate(() => {
    const el = document.querySelector('input[type=range]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '10');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: /quiet/i }).click();
  await page.waitForTimeout(150);
}

const toolNames = (page) => page.$$eval('button[aria-expanded]', (bs) => bs.map((b) => b.querySelector('span span')?.textContent));

// The app's tool names by id, to map what the screen shows back to a family.
const byName = {};
for (const m of (await import('node:fs')).readFileSync(appFile, 'utf8').matchAll(/^ {2}(\w+): \{ name: "([^"]+)", time:/gm)) byName[m[2]] = m[1];

for (const vibe of [null, 'narrator', 'lightning', 'cocoon', 'spark', 'shapeshifter']) {
  const page = await fresh(vibe);
  await flood(page);
  const names = await toolNames(page);
  const families = names.map((n) => TOOL_FAMILY[byName[n]]);
  assert.equal(names.length, 3, `${vibe}: three cards`);
  assert.ok(new Set(families).size >= 2, `${vibe}: more than one kind of approach, got ${families}`);
  if (vibe) assert.equal(families[0], VIBE_FAMILY[vibe], `${vibe}: leads with its own family`);
  await page.context().close();
}

await scenario(async () => {
  const page = await fresh('cocoon');
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  await page.getByRole('button', { name: /See it/ }).click();
  await page.waitForTimeout(150);
  const headings = await page.$$eval('h2', (h) => h.map((x) => x.textContent));
  assert.ok(headings.some((h) => /Also worth trying/.test(h)), 'Vibe result offers a second kind');
  assert.equal((await toolNames(page)).length, 5);
  assert.ok(await page.getByText(/None of these feel right\?/).count(), 'a way to say none fit');
  await page.locator('button[aria-expanded]').first().click();
  await page.getByRole('button', { name: 'A bit' }).click();
  assert.ok(await page.getByText(/Noted\./).count());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => localStorage.getItem('dyverge:toolLog')), null, 'what helped is not stored in plain text');
  await page.context().close();
});

await scenario(async () => {
  const page = await fresh('cocoon', [{ id: 'song', helped: 'yes' }, { id: 'song', helped: 'yes' }]);
  await flood(page);
  const names = await toolNames(page);
  assert.deepEqual(names, ['Weight on', 'Sound off', 'One song'], 'what helped moves up; nothing is removed');
  await page.context().close();
});

await scenario(async () => {
  const page = await fresh(null);
  await flood(page);
  await page.getByRole('button', { name: 'Support routes' }).click();
  await page.waitForTimeout(150);
  const html = await page.content();
  assert.ok(/Someone you trust/.test(html), 'support is more than a phone number');
  assert.ok(!/Talk to a doctor/.test(html), 'professional kinds stay hidden while the flag is off');
  await page.context().close();
});

// Compass: language handling, driven through the real UI.
async function compass(page, text) {
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByText('Before I send').click();
  await page.locator('#dy-message').fill(text);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(100);
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);

await scenario(async () => {
  const page = await fresh(null);
  await compass(page, 'Çok yorgunum ve ne diyeceğimi bilmiyorum, ben her şeyden bıkmıştım ama bir şey yok');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(150);
  const t = await bodyText(page);
  assert.match(t, /I can't check this language yet\./, 'unsupported language is declined');
  assert.match(t, /Nothing you wrote has been sent or saved/);
  assert.match(t, /Español/, 'tells people which languages it does cover');
  await page.context().close();
});
await scenario(async () => {
  const page = await fresh(null);
  await compass(page, 'Estoy muy cansada y no sé qué decir hoy');
  const t = await bodyText(page);
  assert.match(t, /Safety checks in Español are new/, 'draft language shows the notice');
  assert.ok(await page.getByRole('button', { name: 'Support routes' }).count());
  await page.context().close();
});
await scenario(async () => {
  const page = await fresh(null);
  await compass(page, 'Quiero morirme');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(150);
  assert.match(await bodyText(page), /you deserve a person/, 'a Spanish crisis phrase stops the flow');
  await page.context().close();
});
await scenario(async () => {
  const page = await fresh(null);
  await compass(page, 'Dinner at seven? Let me know.');
  const t = await bodyText(page);
  assert.doesNotMatch(t, /Safety checks in .* are new/, 'English shows no draft notice');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(400);
  assert.doesNotMatch(await bodyText(page), /can't check this language|you deserve a person/, 'English passes the gates as before');
  await page.context().close();
});

// The private space (vault), driven through the real UI.
const storageKeys = (page) => page.evaluate(() => Object.keys(localStorage));
const storageText = (page, except = []) => page.evaluate((skip) => Object.keys(localStorage).filter((k) => !skip.includes(k)).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n'), except);
const NAMES_KEY = 'dyverge:people'; // names are kept in the open on purpose: the lock screen shows them
const HEADER = /^dyverge:vault:[^:]+:__header$/;
const ENTRY = /^dyverge:vault:[^:]+:k:/;
const PRIVATE_PLAIN = ['profiles', 'vibe', 'toolLog', 'translations', 'parks', 'checkins', 'needSpace', 'spoons'].map((k) => `dyverge:${k}`);

await scenario(async () => {
  // Older plain-text data is moved into the vault, and nothing private stays readable.
  const page = await fresh('cocoon', [{ id: 'song', helped: 'yes' }]);
  await page.getByRole('button', { name: /go in/i }).first().click(); // let the app write its state
  await page.waitForTimeout(400);
  const keys = await storageKeys(page);
  for (const k of PRIVATE_PLAIN) assert.ok(!keys.includes(k), `${k} must not be stored in plain text`);
  assert.ok(keys.some((k) => HEADER.test(k)), 'a vault exists');
  assert.ok(keys.some((k) => ENTRY.test(k)), 'private data is stored in the vault');
  const text = await storageText(page, [NAMES_KEY]);
  for (const secret of ['Fynn', 'cocoon', 'Jordan', PASSPHRASE]) assert.ok(!text.includes(secret), `"${secret}" is readable in storage`);
  assert.ok((await storageText(page)).includes('Fynn'), 'the name is kept in the open, only so the lock screen can show it');
  assert.ok(keys.includes('dyverge:words') || keys.includes('dyverge:agreement'), 'shared communication is stored where both can reach it');
  await page.context().close();
});

await scenario(async () => {
  // Locked after a reload. A wrong passphrase is refused. The right one brings everything back.
  const page = await fresh('cocoon', [{ id: 'song', helped: 'yes' }, { id: 'song', helped: 'yes' }]);
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.waitForTimeout(400);
  await page.reload();
  assert.match(await bodyText(page), /Welcome back\./, 'locked after reload');
  assert.doesNotMatch(await bodyText(page), /How is your battery/, 'the app does not render while locked');
  await page.locator('#us-pass').fill('not the passphrase');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.waitForTimeout(300);
  assert.match(await bodyText(page), /That's not it\./, 'a wrong passphrase is refused');
  await page.locator('#us-pass').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await flood(page);
  assert.deepEqual(await toolNames(page), ['Weight on', 'Sound off', 'One song'], 'private data survives a lock and unlock');
  await page.context().close();
});

await scenario(async () => {
  // Lock now, from Settings. Clear everything keeps the passphrase.
  const page = await fresh(null);
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Lock your private space' }).click();
  await page.waitForTimeout(200);
  assert.match(await bodyText(page), /Welcome back\./, 'the Lock button on Home locks');
  await page.locator('#us-pass').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Lock now' }).click();
  await page.waitForTimeout(200);
  assert.match(await bodyText(page), /Welcome back\./, 'Lock now in Settings locks');
  await page.locator('#us-pass').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Clear my things from this phone' }).click();
  await page.getByRole('button', { name: 'Yes, clear it' }).click();
  await page.waitForTimeout(400);
  assert.ok((await storageKeys(page)).some((k) => HEADER.test(k)), 'clearing my things keeps the private space and its passphrase');
  await page.reload();
  assert.match(await bodyText(page), /Welcome back\./, 'still locked after clearing everything');
  await page.context().close();
});

await scenario(async () => {
  // Change passphrase.
  const page = await fresh(null);
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Change passphrase' }).click();
  await page.locator('#cp-cur').fill('nope nope nope');
  await page.locator('#cp-new').fill('a brand new phrase');
  await page.locator('#cp-again').fill('a brand new phrase');
  await page.getByRole('button', { name: 'Change it' }).click();
  await page.waitForTimeout(400);
  assert.match(await bodyText(page), /not your current passphrase/);
  await page.locator('#cp-cur').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Change it' }).click();
  await page.waitForTimeout(600);
  assert.match(await bodyText(page), /Passphrase changed\./);
  await page.reload();
  await page.locator('#us-pass').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.waitForTimeout(300);
  assert.match(await bodyText(page), /That's not it\./, 'the old passphrase stops working');
  await page.locator('#us-pass').fill('a brand new phrase');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.context().close();
});

await scenario(async () => {
  // Use without saving: nothing private ever reaches storage.
  const page = await fresh(null, undefined, { raw: true });
  await page.getByRole('button', { name: 'Use without saving' }).click();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.waitForTimeout(400);
  const keys = await storageKeys(page);
  assert.ok(!keys.some((k) => k.startsWith('dyverge:vault:')), 'no vault is written');
  for (const k of PRIVATE_PLAIN) assert.ok(!keys.includes(k), `${k} must not be stored`);
  assert.ok(!keys.includes(NAMES_KEY), 'no one is added to the phone');
  assert.ok(!(await storageText(page)).includes('Fynn'), 'no private text reaches storage');
  // Even Our words, which are shared when saved, stay in memory when nothing is being saved.
  await page.getByRole('button', { name: /^Us$/ }).click();
  await page.getByLabel('New phrase').fill('EPHEMERAL PHRASE');
  await page.getByLabel('What it means').fill('EPHEMERAL MEANING');
  await page.getByRole('button', { name: 'Add it' }).click();
  assert.match(await bodyText(page), /EPHEMERAL PHRASE/, 'the phrase is there for this session');
  await page.waitForTimeout(300);
  assert.ok(!keys.includes('dyverge:agreement'));
  const after = await storageKeys(page);
  assert.ok(!after.includes('dyverge:words') && !after.includes('dyverge:agreement'), 'shared things are not saved either');
  assert.ok(!(await storageText(page)).includes('EPHEMERAL'), 'nothing written reaches storage');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  assert.doesNotMatch(await bodyText(page), /Who uses this phone/, 'no second person without a saved space');
  await page.reload();
  assert.match(await bodyText(page), /Make your private space\./, 'nothing was kept');
  await page.context().close();
});

await scenario(async () => {
  // Forgotten passphrase: erase and start again. Shared things stay.
  const page = await fresh(null);
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByRole('button', { name: "I've forgotten it" }).click();
  await page.getByRole('button', { name: 'Erase my private space' }).click();
  await page.getByRole('button', { name: 'Yes, erase it' }).click();
  await page.waitForTimeout(200);
  assert.match(await bodyText(page), /Make your private space\./);
  assert.ok(!(await storageKeys(page)).some((k) => k.startsWith('dyverge:vault:')), 'the vault is gone');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('dyverge:people'))), [], 'and so is the person');
  await page.context().close();
});

// What leaves the phone. The AI request is captured and inspected, not assumed.
const READING = {
  signal: 'You asked them to call tonight.',
  noise: 'There may be a worry underneath.',
  pattern: 'A request can land as pressure.',
  pattern_why: 'Double Empathy Problem (Milton, 2012).',
  intended: 'That you miss them.',
  likely_heard: 'A request to answer tonight.',
  bridge_voice: 'Can you call me tonight? I miss you.',
  bridge_frequency: 'I miss you. A call tonight would help me. No need to answer straight away.',
  menu_reply: 'A) Yes, tonight. B) Later. C) Say it another way.',
};

async function captureAI(page) {
  const sent = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    sent.push(req.postData() ?? '');
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(READING) }] }),
    });
  });
  return sent;
}

await scenario(async () => {
  const page = await fresh(null);
  const sent = await captureAI(page);
  await compass(page, 'Can you call me tonight? I miss you.');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.getByText('You asked them to call tonight.').first().waitFor();
  assert.equal(sent.length, 1, 'exactly one request leaves the phone');
  const prompt = JSON.parse(sent[0]).messages[0].content;
  assert.ok(prompt.includes('Can you call me tonight? I miss you.'), 'the person own message is sent');
  assert.ok(prompt.includes('I take words at face value'), 'what the other person ticked is sent');
  assert.ok(prompt.includes('Help with things'), 'what lands as care for them is sent');
  for (const theirs of ['I read exactly what you wrote', 'What you want, said plainly', "I go short when I'm tired", 'Jordan', 'they/them']) {
    assert.ok(!prompt.includes(theirs), `"${theirs}" is the other person own writing and must not leave the phone`);
  }
  await page.context().close();
});

// Voice: told once, before the microphone ever starts.
await scenario(async () => {
  const page = await fresh(null);
  await page.evaluate(() => {
    window.__mic = 0;
    window.webkitSpeechRecognition = class {
      start() { window.__mic += 1; }
      stop() { if (this.onend) this.onend(); }
    };
    window.SpeechRecognition = window.webkitSpeechRecognition;
  });
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByText('Before I send').click();
  await page.getByRole('button', { name: 'Voice note' }).click();
  assert.match(await bodyText(page), /Before you use voice/, 'the heads-up appears first');
  assert.match(await bodyText(page), /Google or Apple/);
  assert.equal(await page.evaluate(() => window.__mic), 0, 'the microphone has not started');
  await page.getByRole('button', { name: 'Type instead' }).click();
  assert.equal(await page.evaluate(() => window.__mic), 0, 'Type instead keeps the microphone off');
  await page.getByRole('button', { name: 'Voice note' }).click();
  await page.getByRole('button', { name: 'Use voice' }).click();
  assert.equal(await page.evaluate(() => window.__mic), 1, 'Use voice starts the microphone');
  await page.getByRole('button', { name: 'Listening' }).click(); // stop
  await page.getByRole('button', { name: 'Voice note' }).click();
  assert.doesNotMatch(await bodyText(page), /Before you use voice/, 'the heads-up is shown once');
  assert.equal(await page.evaluate(() => window.__mic), 2);
  await page.context().close();
});

// Two people, one phone. Each has their own space; only what is published crosses over.
await scenario(async () => {
  const P1 = 'fynn passphrase one';
  const P2 = 'jordan passphrase two';
  const page = await fresh(null, undefined, { raw: true });
  await makeSpace(page, P1, 'Fynn');
  const sent = await captureAI(page);

  // Fynn adds the other person, from inside their own unlocked space.
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  assert.match(await bodyText(page), /Only you are set up here/);
  await page.getByRole('button', { name: 'Add the other person' }).click();
  await page.getByRole('button', { name: 'Lock and pass it over' }).click();
  await page.locator('#vs-name').waitFor();
  assert.match(await bodyText(page), /Make your own private space\./, 'the second person makes their own space');
  assert.doesNotMatch(await bodyText(page), /Add the other person/);
  await makeSpace(page, P2, 'Jordan');

  // Jordan: sees no profile from Fynn until Fynn shares one.
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  assert.match(await bodyText(page), /Fynn hasn't shared a profile yet/);
  assert.doesNotMatch(await bodyText(page), /An example, so you can see/, 'a real person is never shown as an example');

  // Jordan writes a profile. It is private until Jordan shares it.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#pf-need').fill('JORDAN SHARED NEED');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  assert.ok(!(await storageText(page)).includes('JORDAN SHARED NEED'), 'a profile is private until it is shared');
  assert.ok(!(await storageKeys(page)).some((k) => k.startsWith('dyverge:published')), 'nothing is published yet');
  assert.match(await bodyText(page), /Fynn sees nothing until you share it|Only you can see this/);
  await page.getByRole('button', { name: 'Share with Fynn' }).click();
  assert.ok((await storageKeys(page)).some((k) => k.startsWith('dyverge:published:')), 'sharing publishes it');
  assert.match(await bodyText(page), /Shared with Fynn on/);

  // Jordan keeps a private translation. Neither the AI request nor storage shows it to anyone else.
  await page.getByRole('button', { name: 'Compass', exact: true }).click();
  await page.getByText('Before I send').click();
  await page.locator('#dy-message').fill('JORDAN PRIVATE MESSAGE');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.getByText('You asked them to call tonight.').first().waitFor();
  const prompt = JSON.parse(sent[sent.length - 1]).messages[0].content;
  assert.ok(prompt.includes('JORDAN PRIVATE MESSAGE'), 'the person own message is sent');
  assert.ok(!prompt.includes('Fynn'), 'the other person name is not sent');
  await page.waitForTimeout(300);
  assert.ok(!(await storageText(page)).includes('JORDAN PRIVATE MESSAGE'), 'readings are stored encrypted');

  // Jordan shares their spoon level. (The Compass hides the bottom bar, so leave it first.)
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Spoons', exact: true }).click();
  assert.ok(!(await storageKeys(page)).some((k) => k.startsWith('dyverge:published-spoons')), 'spoons are not shared by default');
  await page.getByRole('switch', { name: /Share my spoons with Fynn/ }).click();
  await page.waitForTimeout(200);
  assert.ok((await storageKeys(page)).some((k) => k.startsWith('dyverge:published-spoons:')));

  // Lock. The lock screen asks who is opening it, by name.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Lock your private space' }).click();
  await page.waitForTimeout(200);
  const lock = await bodyText(page);
  assert.match(lock, /Who's opening dYverge\?/);
  assert.match(lock, /Fynn/);
  assert.match(lock, /Jordan/);
  // Fynn's passphrase does not open Jordan's space.
  await page.getByRole('button', { name: 'Jordan' }).click();
  assert.match(await bodyText(page), /Welcome back, Jordan\./);
  await page.locator('#us-pass').fill(P1);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.waitForTimeout(300);
  assert.match(await bodyText(page), /That's not it\./, "one person's passphrase does not open the other's space");
  await page.getByRole('button', { name: /Not Jordan\?/ }).click();

  // Fynn opens their own space and sees only what Jordan shared.
  await page.getByRole('button', { name: 'Fynn' }).click();
  await page.locator('#us-pass').fill(P1);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  const fynnSees = await bodyText(page);
  assert.match(fynnSees, /JORDAN SHARED NEED/, 'Fynn sees what Jordan shared');
  assert.match(fynnSees, /Shared by Jordan on/);
  assert.doesNotMatch(fynnSees, /JORDAN PRIVATE MESSAGE/, 'and nothing Jordan kept private');
  await page.getByRole('button', { name: 'Spoons', exact: true }).click();
  assert.match(await bodyText(page), /Jordan, \d+ of \d+/, "Fynn sees Jordan's spoons because Jordan shared them");

  // The agreement: one signature each.
  await page.getByRole('button', { name: /^Us$/ }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  assert.match(await bodyText(page), /Jordan: not signed yet\. Jordan signs from their own private space\./);
  await page.getByRole('button', { name: 'Sign as Fynn' }).click();
  assert.match(await bodyText(page), /Fynn: signed/);
  assert.doesNotMatch(await bodyText(page), /Sign as Jordan/, 'no one can sign for the other person');

  // Settings: both people are shown, and a third cannot be added.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  assert.match(await bodyText(page), /Fynn and Jordan each have their own private space here/);
  assert.doesNotMatch(await bodyText(page), /Add the other person/);

  // Jordan signs from their own space.
  await page.getByRole('button', { name: 'Lock now' }).click();
  await page.getByRole('button', { name: 'Jordan' }).click();
  await page.locator('#us-pass').fill(P2);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  assert.match(await bodyText(page), /Fynn: signed/, "Jordan sees Fynn's signature");
  await page.getByRole('button', { name: 'Sign as Jordan' }).click();
  assert.match(await bodyText(page), /Eight clauses, signed by both/);

  // Jordan forgets their passphrase and erases their space. Fynn's things are untouched.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Lock your private space' }).click();
  await page.getByRole('button', { name: 'Jordan' }).click();
  await page.getByRole('button', { name: "I've forgotten it" }).click();
  await page.getByRole('button', { name: 'Erase my private space' }).click();
  await page.getByRole('button', { name: 'Yes, erase it' }).click();
  await page.waitForTimeout(300);
  const after = await storageKeys(page);
  assert.ok(!after.some((k) => k.startsWith('dyverge:published')), "Jordan's shared things go with their space");
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('dyverge:people'))).length, 1, 'only Fynn is left');
  const agreement = JSON.parse(await page.evaluate(() => localStorage.getItem('dyverge:agreement')));
  assert.equal(Object.keys(agreement.signatures).length, 1, "Jordan's signature is removed, Fynn's stays");
  assert.match(await bodyText(page), /Welcome back\./, 'with one person left the lock screen is simple again');
  await page.locator('#us-pass').fill(P1);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  assert.match(await bodyText(page), /An example, so you can see how a profile reads/, 'with no other person, the labelled example returns');
  await page.context().close();
});

// A viewer that blocks storage (a private window, or a sandboxed page). Nothing can be saved, the
// page says so, and two people passing the page between them still see each other's shared things.
await scenario(async () => {
  const page = await fresh(null, undefined, { raw: true, blockStorage: true });
  assert.match(await bodyText(page), /This page isn't allowed to save anything on your device/, 'the create screen says nothing will be kept');
  await makeSpace(page, 'correct horse battery', 'Alex');
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Add the other person' }).click();
  await page.getByRole('button', { name: 'Lock and pass it over' }).click();
  await page.locator('#vs-name').waitFor();
  assert.match(await bodyText(page), /This page isn't allowed to save anything on your device/, "and so does the second person's");
  await makeSpace(page, 'purple lantern marsh', 'Sam');
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#pf-need').fill('Plain words, and when to expect a reply.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /^Share with Alex$/ }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Lock your private space' }).click();
  await page.getByRole('button', { name: 'Alex' }).click();
  await page.locator('#us-pass').fill('correct horse battery');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.getByRole('button', { name: /^Us$/ }).click();
  assert.match(await bodyText(page), /Plain words, and when to expect a reply\./, "Alex sees what Sam shared, even though nothing is saved");
  await page.reload();
  assert.match(await bodyText(page), /Make your private space\./, 'a refresh starts again, because nothing was kept');
  await page.context().close();
});

assert.deepEqual(errors, [], 'no page errors');
for (const context of [...openContexts]) await context.close();
removeProfiles();
console.log(`Smoke test passed: plural pathways, multilingual gates, private spaces and two people on one phone work in the real app.${repeatedTests ? ` (${repeatedTests} test${repeatedTests === 1 ? '' : 's'} repeated once because the browser lost its own storage.)` : ''}`);
