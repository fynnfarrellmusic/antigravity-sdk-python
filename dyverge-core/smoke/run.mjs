// Runs the real app in headless Chromium and checks the plural-pathways behaviour.
//   npm run smoke
// Needs the dev dependencies (npm install) and a Chromium. Set CHROMIUM_PATH if yours differs.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright-core';

import { TOOL_FAMILY, VIBE_FAMILY } from '../test/app-data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const appFile = fileURLToPath(new URL('../../dyverge-app/dyverge-app.jsx', import.meta.url));
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const errors = [];

const PASSPHRASE = 'correct horse battery';

async function makeSpace(page, pass = PASSPHRASE) {
  await page.locator('#vs-pass').fill(pass);
  await page.locator('#vs-again').fill(pass);
  await page.getByRole('button', { name: 'Lock my private space' }).click();
  await page.getByRole('button', { name: /go in/i }).first().waitFor();
}

async function fresh(vibe, history, opts = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(([v, h]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    if (v) localStorage.setItem('dyverge:vibe', JSON.stringify(v));
    if (h) localStorage.setItem('dyverge:toolLog', JSON.stringify(h));
    sessionStorage.setItem('seeded', '1');
  }, [vibe, history]);
  await page.goto(pathToFileURL(join(dir, 'index.html')).href);
  if (!opts.raw) await makeSpace(page);
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

{
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
}

{
  const page = await fresh('cocoon', [{ id: 'song', helped: 'yes' }, { id: 'song', helped: 'yes' }]);
  await flood(page);
  const names = await toolNames(page);
  assert.deepEqual(names, ['Weight on', 'Sound off', 'One song'], 'what helped moves up; nothing is removed');
  await page.context().close();
}

{
  const page = await fresh(null);
  await flood(page);
  await page.getByRole('button', { name: 'Support routes' }).click();
  await page.waitForTimeout(150);
  const html = await page.content();
  assert.ok(/Someone you trust/.test(html), 'support is more than a phone number');
  assert.ok(!/Talk to a doctor/.test(html), 'professional kinds stay hidden while the flag is off');
  await page.context().close();
}

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

{
  const page = await fresh(null);
  await compass(page, 'Çok yorgunum ve ne diyeceğimi bilmiyorum, ben her şeyden bıkmıştım ama bir şey yok');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(150);
  const t = await bodyText(page);
  assert.match(t, /I can't check this language yet\./, 'unsupported language is declined');
  assert.match(t, /Nothing you wrote has been sent or saved/);
  assert.match(t, /Español/, 'tells people which languages it does cover');
  await page.context().close();
}
{
  const page = await fresh(null);
  await compass(page, 'Estoy muy cansada y no sé qué decir hoy');
  const t = await bodyText(page);
  assert.match(t, /Safety checks in Español are new/, 'draft language shows the notice');
  assert.ok(await page.getByRole('button', { name: 'Support routes' }).count());
  await page.context().close();
}
{
  const page = await fresh(null);
  await compass(page, 'Quiero morirme');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(150);
  assert.match(await bodyText(page), /you deserve a person/, 'a Spanish crisis phrase stops the flow');
  await page.context().close();
}
{
  const page = await fresh(null);
  await compass(page, 'Dinner at seven? Let me know.');
  const t = await bodyText(page);
  assert.doesNotMatch(t, /Safety checks in .* are new/, 'English shows no draft notice');
  await page.getByRole('button', { name: 'Translate it' }).click();
  await page.waitForTimeout(400);
  assert.doesNotMatch(await bodyText(page), /can't check this language|you deserve a person/, 'English passes the gates as before');
  await page.context().close();
}

// The private space (vault), driven through the real UI.
const storageKeys = (page) => page.evaluate(() => Object.keys(localStorage));
const storageText = (page) => page.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n'));
const PRIVATE_PLAIN = ['profiles', 'vibe', 'toolLog', 'translations', 'parks', 'checkins', 'needSpace', 'spoons'].map((k) => `dyverge:${k}`);

{
  // Older plain-text data is moved into the vault, and nothing private stays readable.
  const page = await fresh('cocoon', [{ id: 'song', helped: 'yes' }]);
  await page.getByRole('button', { name: /go in/i }).first().click(); // let the app write its state
  await page.waitForTimeout(400);
  const keys = await storageKeys(page);
  for (const k of PRIVATE_PLAIN) assert.ok(!keys.includes(k), `${k} must not be stored in plain text`);
  assert.ok(keys.includes('dyverge:vault:me:__header'), 'a vault exists');
  assert.ok(keys.some((k) => k.startsWith('dyverge:vault:me:k:')), 'private data is stored in the vault');
  const text = await storageText(page);
  for (const secret of ['Fynn', 'cocoon', 'Jordan', PASSPHRASE]) assert.ok(!text.includes(secret), `"${secret}" is readable in storage`);
  assert.ok(keys.includes('dyverge:words') || keys.includes('dyverge:agreement'), 'shared communication is stored where both can reach it');
  await page.context().close();
}

{
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
}

{
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
  await page.getByRole('button', { name: 'Clear everything on this phone' }).click();
  await page.getByRole('button', { name: 'Yes, clear it' }).click();
  await page.waitForTimeout(400);
  assert.ok((await storageKeys(page)).includes('dyverge:vault:me:__header'), 'clearing everything keeps the private space and its passphrase');
  await page.reload();
  assert.match(await bodyText(page), /Welcome back\./, 'still locked after clearing everything');
  await page.context().close();
}

{
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
}

{
  // Use without saving: nothing private ever reaches storage.
  const page = await fresh(null, undefined, { raw: true });
  await page.getByRole('button', { name: 'Use without saving' }).click();
  await page.getByRole('button', { name: /go in/i }).first().click();
  await page.waitForTimeout(400);
  const keys = await storageKeys(page);
  assert.ok(!keys.some((k) => k.startsWith('dyverge:vault:')), 'no vault is written');
  for (const k of PRIVATE_PLAIN) assert.ok(!keys.includes(k), `${k} must not be stored`);
  assert.ok(!(await storageText(page)).includes('Fynn'), 'no private text reaches storage');
  await page.reload();
  assert.match(await bodyText(page), /Make your private space\./, 'nothing was kept');
  await page.context().close();
}

{
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
  await page.context().close();
}

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('Smoke test passed: plural pathways, multilingual gates and the private space work in the real app.');
