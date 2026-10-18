// Live Link Lab: two devices, one private room that exists only while both are in it.
//
// This is a test bench for src/livelink.ts, not part of the app. It imports the real module, so
// what runs here is what the tests cover. The page asks the platform for two things only: a live
// channel between devices that have it open (`room`) and, when a button is pressed, a question to
// Claude on the viewer's own account (`sample`). It stores nothing and has no other access.
//
// Everything that comes from the other device or from the person typing is set with textContent,
// never as HTML.

import {
  LINK_TIMING,
  LinkError,
  linkCheckCharter,
  linkCreateIdentity,
  linkFingerprintWords,
  linkKnock,
  linkListen,
  linkMakeInvite,
  linkParseInvite,
} from '../src/livelink.ts';

const LAB_VERSION = '1';

// ── Tiny helpers ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

/** Build an element. Children that are not nodes become text, so nothing here is ever parsed as HTML. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const clock = () => performance.now();

/** What went wrong, in words, using the platform's own error code when there is one. */
function why(e, fallback) {
  if (e && typeof e === 'object' && typeof e.code === 'string') return `${fallback} The platform said: ${e.code}${e.message ? ` (${String(e.message).slice(0, 80)})` : ''}.`;
  return e instanceof Error ? e.message : fallback;
}
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A test seam: the browser test shortens the waits so it does not have to sit through them.
const timing = () => ({ ...LINK_TIMING, ...(window.__labTiming || {}), ...(S.staleMs ? { staleMs: S.staleMs } : {}) });

// ── What a person can say about how they like to receive messages ───────────────────────────
// Three tick-boxes. This is all that Claude is ever shown about the other person.

const CARD = {
  short: 'Short and direct',
  gentle: 'Gentle and warm',
  plain: 'Plain words, no figures of speech',
};

function readCard(body) {
  try {
    const o = JSON.parse(body);
    const likes = Array.isArray(o.likes) ? o.likes : null;
    if (!likes || likes.length > 3 || new Set(likes).size !== likes.length) return null;
    if (!likes.every((id) => typeof id === 'string' && Object.hasOwn(CARD, id))) return null;
    return likes;
  } catch (e) {
    return null;
  }
}

// ── State ────────────────────────────────────────────────────────────────────────────────────

const S = {
  runtime: { room: null, sample: null, sampleChecked: false },
  me: null,
  trusted: null,
  link: null,
  named: null,
  invite: null,
  role: null,
  screen: 'start',
  phaseSince: clock(),
  consent: null,
  check: null,
  peer: null,
  log: [],
  tape: [],
  tapeTotal: 0,
  ignored: {},
  rtt: [],
  theirCard: null,
  myCard: ['short'],
  mischief: 'none',
  channel: { connected: null, peers: 0, maxPeers: 0 },
  timeline: [],
  endedReason: null,
  staleMs: 0,
  draft: '',
  suggestion: null,
  probe: null,
  startedAt: clock(),
  ticker: null,
  paused: false,
  error: '',
  verifiedByMe: false,
};

function note(text) {
  S.log.push({ who: 'note', text, at: clock() });
}

// ── The live channel (an adapter: strings in, strings out) ──────────────────────────────────

async function withTimeout(promise, ms) {
  let timer;
  const wait = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, wait]);
  } finally {
    clearTimeout(timer);
  }
}

async function openChannel(roomName) {
  const room = await withTimeout(window.claude && window.claude.use ? window.claude.use('room') : Promise.resolve(null), 12000);
  S.runtime.room = Boolean(room);
  if (!room) throw new Error('This page could not reach the live channel. It only works when it is opened from the platform, signed in.');
  const named = await room.join(roomName);
  named.on(
    'f',
    (m) => {
      // The channel echoes our own frames back to this page. `isMe` is true for ANY open copy of the
      // page on the same account, which includes your other device, so only `sameTab` says "this one".
      if (m.sameTab) return;
      const f = m && m.data && m.data.f;
      if (typeof f !== 'string' || !S.link) return;
      tape('in', f);
      S.link.receive(f).then((step) => apply(step));
    },
    (e) => {
      S.channel.connected = false;
      note(`The live channel stopped (${e && e.code ? e.code : 'unknown'}).`);
      refresh();
    },
  );
  named.onConnection((connected) => {
    S.channel.connected = connected;
    refresh();
  });
  named.onPeers((change) => {
    S.channel.peers = change.peers.length;
    S.channel.maxPeers = Math.max(S.channel.maxPeers, change.peers.length);
    refresh();
  });
  S.channel.connected = named.connected();
  try {
    await named.presence({ here: true });
  } catch (e) {
    /* presence is only for the count on screen */
  }
  return named;
}

function tape(dir, frame) {
  S.tapeTotal += 1;
  S.tape.push({ dir, size: frame.length, head: frame.slice(0, 26), at: clock() });
  if (S.tape.length > 14) S.tape.shift();
}

function randomText(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil((n * 3) / 4)));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, n);
}

/** What a hostile relay might do to one message of ours on its way out. Used by "Try to break it". */
function spoil(frame) {
  const mode = S.mischief;
  S.mischief = 'none';
  const behave = $('m-none');
  if (behave) behave.checked = true;
  if (mode === 'alter') {
    const i = Math.floor(frame.length / 2);
    return [frame.slice(0, i) + (frame[i] === 'A' ? 'B' : 'A') + frame.slice(i + 1)];
  }
  if (mode === 'twice') return [frame, frame];
  if (mode === 'drop') return [];
  if (mode === 'junk') return [randomText(frame.length)];
  return [frame];
}

// Frames leave one at a time, in the order the link made them, whatever else is happening. The
// channel is remembered when a frame is queued, so a goodbye still goes out after the room has
// been marked closed on screen.
let outbox = Promise.resolve();

function emit(frame, isMessage) {
  const named = S.named;
  const sendIt = async () => {
    if (!named) return;
    const frames = isMessage ? spoil(frame) : [frame];
    for (const f of frames) {
      tape('out', f);
      try {
        await named.emit('f', { f });
      } catch (e) {
        note(`A frame could not be sent (${e && e.code ? e.code : 'unknown'}).`);
      }
    }
  };
  outbox = outbox.then(sendIt, sendIt);
  return outbox;
}

// ── Turning what the link says into what the screen shows ───────────────────────────────────

async function apply(step, opts) {
  // Frames are queued first, in order. What the link says happened is then shown at once and in
  // order too, because sending can take a while and a later step must not overtake an earlier one.
  for (const frame of step.out) emit(frame, Boolean(opts && opts.message));
  handle(step.events);
  watchPhase();
  refresh();
  await outbox;
  refresh();
}

function watchPhase() {
  if (!S.link) return;
  const p = S.link.phase();
  const last = S.timeline[S.timeline.length - 1];
  if (!last || last[1] !== p) {
    S.timeline.push([clock() - S.startedAt, p]);
    S.phaseSince = clock();
  }
}

function handle(events) {
  for (const e of events) {
    if (e.type === 'consent') {
      S.consent = e.charter;
      setScreen('consent');
    } else if (e.type === 'open') {
      S.peer = e.peer;
      S.check = e.check;
      note(e.peer.pinned ? 'Their key matches the device you trusted.' : 'The handshake is done. Compare the five words.');
      setScreen(e.peer.pinned ? 'opening' : 'words');
    } else if (e.type === 'live') {
      note('The room is live.');
      setScreen('live');
    } else if (e.type === 'message') {
      onMessage(e.kind, e.body);
    } else if (e.type === 'narrowed') {
      S.paused = S.link && S.link.charter() ? S.link.charter().kinds.length === 0 : false;
      note(`${e.by === 'you' ? 'You' : 'They'} narrowed the room to: ${e.kinds.length ? e.kinds.join(', ') : 'nothing (paused)'}.`);
    } else if (e.type === 'sealed') {
      endRoom(e.reason);
    } else if (e.type === 'ignored') {
      S.ignored[e.why] = (S.ignored[e.why] || 0) + 1;
    }
  }
}

function onMessage(kind, body) {
  if (kind === 'card') {
    const likes = readCard(body);
    if (!likes) {
      S.ignored['bad-card'] = (S.ignored['bad-card'] || 0) + 1;
      return;
    }
    S.theirCard = likes;
    note('Their card arrived.');
    return;
  }
  if (kind !== 'words') return;
  const ping = /^ping:(\d+)$/.exec(body);
  const pong = /^pong:(\d+)$/.exec(body);
  if (ping) {
    // Answer a round-trip test, quietly.
    if (S.link && !S.paused) S.link.send('words', `pong:${ping[1]}`).then((step) => apply(step, { message: true })).catch(() => {});
    return;
  }
  if (pong) {
    const ms = Math.round(clock() - Number(pong[1]));
    S.rtt.push(ms);
    S.lastRtt = ms;
    return;
  }
  S.log.push({ who: 'them', text: body, at: clock() });
}

const END = {
  'you-sealed': 'You closed the room.',
  'they-sealed': 'They closed the room.',
  declined: 'You said not now. Nothing was sent, so they have not been told.',
  'no-answer': 'Nobody opened the door in time.',
  'peer-gone': 'They went quiet, so the room closed itself.',
  expired: 'The time you agreed ran out.',
  'words-differ': 'The five words did not match, so the room closed.',
  'peer-changed': 'The device that answered was not the one you trusted. The room closed before anything was shown.',
  failed: 'Something did not check out, so the room closed.',
};

function endRoom(reason) {
  S.endedReason = reason;
  S.suggestion = null;
  clearInterval(S.ticker);
  S.ticker = null;
  if (S.named) {
    // Leave the channel only after everything already queued, such as a goodbye, has been sent.
    const named = S.named;
    S.named = null;
    const leave = () => Promise.resolve(named.leave()).catch(() => {});
    outbox = outbox.then(leave, leave);
  }
  setScreen('ended');
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────

function startTicker() {
  clearInterval(S.ticker);
  S.ticker = setInterval(async () => {
    if (!S.link) return;
    const step = await S.link.tick();
    await apply(step);
  }, window.__labTick || 1000);
}

function resetRoom() {
  clearInterval(S.ticker);
  S.ticker = null;
  if (S.named) Promise.resolve(S.named.leave()).catch(() => {});
  Object.assign(S, {
    link: null,
    named: null,
    invite: null,
    role: null,
    consent: null,
    check: null,
    peer: null,
    log: [],
    tape: [],
    tapeTotal: 0,
    ignored: {},
    rtt: [],
    lastRtt: null,
    theirCard: null,
    mischief: 'none',
    channel: { connected: null, peers: 0, maxPeers: 0 },
    timeline: [],
    endedReason: null,
    draft: '',
    suggestion: null,
    paused: false,
    error: '',
    verifiedByMe: false,
    startedAt: clock(),
  });
}

async function makeDoor(form) {
  S.error = '';
  const kinds = ['words', 'card'].filter((k) => form[k]);
  const charter = linkCheckCharter({ kinds, ttlSeconds: form.minutes * 60, purpose: form.purpose.trim() });
  if (!charter) {
    S.error = 'Those terms are not allowed. Pick at least one thing that may cross, and keep the reason to one plain line.';
    return setScreen('make');
  }
  try {
    resetRoom();
    const { code } = await linkMakeInvite();
    const { link, step } = await linkKnock({
      identity: S.me.identity,
      invite: code,
      charter,
      expectedPeer: form.onlyTrusted && S.trusted ? S.trusted : undefined,
      timing: timing(),
    });
    S.link = link;
    S.role = 'knocker';
    S.invite = code;
    S.named = await openChannel(link.room);
    setScreen('door');
    watchPhase();
    startTicker();
    await apply(step);
  } catch (e) {
    resetRoom();
    S.error = why(e, 'Something went wrong making the door.');
    setScreen('make');
  }
}

async function joinWithCode(text, onlyTrusted) {
  S.error = '';
  if (!linkParseInvite(text)) {
    S.error = 'That is not a live link code. Check the letters. The dashes can be left out.';
    return setScreen('enter');
  }
  try {
    resetRoom();
    const link = await linkListen({
      identity: S.me.identity,
      invite: text,
      expectedPeer: onlyTrusted && S.trusted ? S.trusted : undefined,
      timing: timing(),
    });
    S.link = link;
    S.role = 'listener';
    S.named = await openChannel(link.room);
    setScreen('listening');
    watchPhase();
    startTicker();
  } catch (e) {
    resetRoom();
    S.error = why(e, 'Something went wrong joining.');
    setScreen('enter');
  }
}

async function send(kind, body) {
  try {
    const step = await S.link.send(kind, body);
    await apply(step, { message: true });
    return true;
  } catch (e) {
    note(e instanceof LinkError ? `Not sent: ${e.message}.` : 'Not sent.');
    refresh();
    return false;
  }
}

async function sendWords() {
  const box = $('draft');
  const text = box.value.trim();
  if (!text) return;
  if (await send('words', text)) {
    S.log.push({ who: 'you', text, at: clock() });
    box.value = '';
    S.draft = '';
    S.suggestion = null;
    refresh();
  }
}

async function sendCard() {
  if (await send('card', JSON.stringify({ likes: S.myCard }))) note('You shared your card.');
  refresh();
}

async function ping() {
  S.lastRtt = null;
  await send('words', `ping:${Math.round(clock())}`);
}

async function narrowTo(kinds) {
  try {
    await apply(await S.link.narrow(kinds));
  } catch (e) {
    note(e instanceof LinkError ? e.message : 'Could not narrow the room.');
    refresh();
  }
}

async function soften() {
  const sample = S.runtime.sample;
  const draft = $('draft').value.trim();
  if (!sample || !draft || !S.theirCard) return;
  // Claude is shown the writer's own words and the other person's tick-boxes. Nothing else of theirs.
  const prompt =
    `Rewrite the message below so it lands well with someone who likes messages that are: ${S.theirCard.map((id) => CARD[id].toLowerCase()).join('; ')}.\n` +
    `Keep the meaning and the writer's own voice. Add no facts. Reply with only the rewritten message.\n\nMessage:\n${draft}`;
  S.suggestion = { state: 'thinking' };
  refresh();
  try {
    const result = await sample(prompt, { modelTier: 'quick', cache: false });
    S.suggestion = { state: 'ready', text: String(result.text || '').trim() };
  } catch (e) {
    S.suggestion = { state: 'error', code: (e && e.code) || 'unknown' };
  }
  refresh();
}

async function probeClaude() {
  const sample = S.runtime.sample;
  if (!sample) return;
  S.probe = 'asking...';
  refresh();
  try {
    const result = await sample('Reply with the single word: ready', { modelTier: 'quick', cache: false });
    S.probe = `answered (${String(result.text || '').trim().slice(0, 20)})`;
  } catch (e) {
    S.probe = `refused (${(e && e.code) || 'unknown'})`;
  }
  refresh();
}

function report() {
  const st = S.link ? S.link.stats() : { sent: 0, received: 0, missing: 0 };
  const sizes = S.tape.map((t) => t.size);
  const sorted = [...S.rtt].sort((a, b) => a - b);
  return [
    `Live Link Lab v${LAB_VERSION} report (no words, only numbers)`,
    `When: ${new Date().toISOString()}`,
    `Role: ${S.role || 'none'}. Room: ${S.link ? S.link.phase() : 'none'}. Ended because: ${S.endedReason || '-'}`,
    `Live channel: ${S.runtime.room === null ? 'not tried' : S.runtime.room ? 'available' : 'not available'}. Connected now: ${S.channel.connected}. Most people seen in the room: ${S.channel.maxPeers}`,
    `Ask Claude: ${!S.runtime.sampleChecked ? 'still checking' : S.runtime.sample ? 'available' : 'not available'}. Test: ${S.probe || 'not run'}`,
    `Phases (seconds from start): ${S.timeline.map(([t, p]) => `${(t / 1000).toFixed(1)} ${p}`).join(', ') || 'none'}`,
    `Frames sent ${st.sent}, heard ${st.received}, missing ${st.missing}. Seen on the tape (last 14): ${sizes.length ? `${Math.min(...sizes)} to ${Math.max(...sizes)} characters` : 'none'}`,
    `Not believed: ${Object.entries(S.ignored).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`,
    `Round trips (ms): ${sorted.length ? sorted.join(', ') : 'none'}`,
    `Device: ${navigator.userAgent.slice(0, 140)}; window ${innerWidth}x${innerHeight}; page open ${mmss(clock() - S.startedAt)}`,
  ].join('\n');
}

async function copyText(text, where) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Some views refuse the clipboard. Show the text, selected, so it can be copied by hand.
    const box = $(where);
    if (box) {
      box.hidden = false;
      box.value = text;
      box.focus();
      box.select();
    }
    return false;
  }
}

// ── Screens ──────────────────────────────────────────────────────────────────────────────────

function setScreen(name) {
  S.screen = name;
  S.phaseSince = clock();
  drawStage();
  refresh();
  const head = $('stage').querySelector('h2');
  if (head) {
    head.setAttribute('tabindex', '-1');
    head.focus({ preventScroll: false });
  }
}

const btn = (label, onclick, kind = 'primary', extra = {}) => h('button', { type: 'button', class: `btn ${kind}`, onclick, ...extra }, label);

function field(id, label, input, hint) {
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null);
}

function drawStage() {
  const stage = $('stage');
  stage.replaceChildren();
  shown.clear();
  logShown = 0;
  const draw = SCREENS[S.screen] || SCREENS.start;
  stage.append(draw());
}

const SCREENS = {
  start() {
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Open a private room'),
      h('p', null, 'Two devices, one room that exists only while you are both in it. Nothing is saved. This is a test bench, so please use made-up sentences only.'),
      h(
        'div',
        { class: 'choices' },
        h('button', { type: 'button', class: 'choice', onclick: () => setScreen('make') }, h('strong', null, 'Make a door'), h('span', null, 'I am inviting the other device.')),
        h('button', { type: 'button', class: 'choice', onclick: () => setScreen('enter') }, h('strong', null, 'I have a code'), h('span', null, 'The other device made a door.')),
      ),
      h('p', { class: 'hint' }, 'This device\'s key, as words: ', h('span', { class: 'words-inline', id: 'my-words' }, S.me ? S.me.words : 'making one...'), '. It lasts until you close this page.'),
      S.trusted ? h('p', { class: 'hint' }, 'A device is trusted for the next room (kept in memory until you close this page).') : null,
    );
  },

  make() {
    const trustedBox = S.trusted
      ? h('div', { class: 'check' }, h('input', { type: 'checkbox', id: 'f-trusted' }), h('label', { for: 'f-trusted' }, 'Only open for the device I trusted last time'))
      : null;
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Make a door'),
      S.error ? h('p', { class: 'problem', role: 'alert' }, S.error) : null,
      h(
        'fieldset',
        { class: 'field' },
        h('legend', null, 'What may cross'),
        h('div', { class: 'check' }, h('input', { type: 'checkbox', id: 'f-words', checked: true }), h('label', { for: 'f-words' }, 'Words')),
        h('div', { class: 'check' }, h('input', { type: 'checkbox', id: 'f-card', checked: true }), h('label', { for: 'f-card' }, 'A card (three tick-boxes about how you like to receive messages)')),
      ),
      field('f-purpose', 'Why, in one line (they read this before they open the door)', h('input', { id: 'f-purpose', type: 'text', maxlength: '80', value: 'A lab test with made-up words', autocomplete: 'off' })),
      field(
        'f-minutes',
        'How long the room may stay open',
        h('select', { id: 'f-minutes' }, h('option', { value: '5' }, '5 minutes'), h('option', { value: '10', selected: true }, '10 minutes'), h('option', { value: '30' }, '30 minutes')),
      ),
      trustedBox,
      h(
        'div',
        { class: 'row' },
        btn('Make the door', () =>
          makeDoor({
            words: $('f-words').checked,
            card: $('f-card').checked,
            purpose: $('f-purpose').value,
            minutes: Number($('f-minutes').value),
            onlyTrusted: Boolean($('f-trusted') && $('f-trusted').checked),
          }),
        ),
        btn('Back', () => setScreen('start'), 'quiet'),
      ),
    );
  },

  door() {
    const code = S.invite || '';
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Your door is open'),
      h('p', null, 'Give this code to the other device. They type it in, or paste it. It works once.'),
      h('p', { class: 'code', id: 'door-code', 'aria-label': 'The code' }, code),
      h('div', { class: 'row' }, btn('Copy the code', async (ev) => {
        const ok = await copyText(code, 'copy-fallback');
        ev.target.textContent = ok ? 'Copied' : 'Select it above';
      }, 'secondary')),
      h('textarea', { id: 'copy-fallback', class: 'fallback', hidden: true, readonly: true, rows: '2' }),
      h('p', { class: 'status', id: 'door-status' }, 'Knocking every few seconds. Waiting for them to open it...'),
      h('p', { class: 'hint', id: 'countdown' }),
      h('div', { class: 'row' }, btn('Cancel', () => closeRoom(), 'quiet')),
    );
  },

  enter() {
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Enter the code'),
      S.error ? h('p', { class: 'problem', role: 'alert' }, S.error) : null,
      field('f-code', 'The code from the other device', h('input', { id: 'f-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABCD-EFGH-JKMN-...' })),
      S.trusted ? h('div', { class: 'check' }, h('input', { type: 'checkbox', id: 'f-trusted' }), h('label', { for: 'f-trusted' }, 'Only open for the device I trusted last time')) : null,
      h('div', { class: 'row' }, btn('Join the room', () => joinWithCode($('f-code').value, Boolean($('f-trusted') && $('f-trusted').checked))), btn('Back', () => setScreen('start'), 'quiet')),
    );
  },

  listening() {
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Waiting for the knock'),
      h('p', null, 'You are in the room. When the other device knocks, you will see what they are asking for before anything opens.'),
      h('p', { class: 'hint', id: 'countdown' }),
      h('div', { class: 'row' }, btn('Leave', () => closeRoom(), 'quiet')),
    );
  },

  consent() {
    const c = S.consent || { kinds: [], ttlSeconds: 0, purpose: '' };
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'A knock at the door'),
      h('p', null, 'They have asked for a room on these terms. Nothing opens until you say yes.'),
      h(
        'dl',
        { class: 'terms' },
        h('dt', null, 'Why'),
        h('dd', { id: 'terms-purpose' }, c.purpose),
        h('dt', null, 'May cross'),
        h('dd', { id: 'terms-kinds' }, c.kinds.join(', ')),
        h('dt', null, 'Open for'),
        h('dd', { id: 'terms-time' }, plural(Math.round(c.ttlSeconds / 60), 'minute', 'minutes')),
      ),
      h('p', { class: 'hint' }, 'You can narrow the room or close it any time, and you do not have to give a reason. If you say not now, nothing is sent, so they will not be told.'),
      h('div', { class: 'row' }, btn('Open the door', () => accept()), btn('Not now', () => decline(), 'secondary')),
    );
  },

  opening() {
    return h('article', { class: 'card' }, h('h2', null, 'Opening the room'), h('p', null, S.peer && S.peer.pinned ? 'This is the device you trusted, so there are no words to compare.' : 'One moment.'));
  },

  words() {
    const words = S.check || [];
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'Do the five words match?'),
      h('p', null, 'Say them to each other, out loud or on a call. If they are the same on both devices, nobody is in the middle.'),
      h('ol', { class: 'plate', id: 'check-words', 'aria-label': 'The five words' }, words.map((w) => h('li', null, w))),
      h('p', { class: 'hint' }, 'The other device\'s key, as words: ', h('span', { class: 'words-inline', id: 'their-words' }, S.peer ? S.peer.words.join(' ') : '')),
      S.verifiedByMe
        ? h('p', { class: 'status', id: 'words-wait' }, 'You said they match. Waiting for them to check...')
        : h('div', { class: 'row' }, btn('They match', () => verify(true)), btn('They do not match', () => verify(false), 'secondary')),
    );
  },

  live() {
    const kinds = S.link && S.link.charter() ? S.link.charter().kinds : [];
    const canWords = kinds.includes('words');
    const canCard = kinds.includes('card');
    return h(
      'article',
      { class: 'card live' },
      h('h2', null, 'The room is live'),
      h('p', { class: 'hint', id: 'countdown' }),
      h('ul', { class: 'log', id: 'log', 'aria-live': 'polite', 'aria-label': 'The conversation' }),
      h(
        'div',
        { class: 'composer' },
        h('label', { for: 'draft', class: 'visually' }, 'Your message'),
        h('textarea', { id: 'draft', rows: '3', maxlength: '600', placeholder: 'Type a made-up sentence...', oninput: (ev) => (S.draft = ev.target.value) }),
        h('div', { class: 'row' },
          btn('Send', () => sendWords(), 'primary', { id: 'send-btn' }),
          btn('Soften with Claude', () => soften(), 'secondary', { id: 'soften-btn' }),
        ),
        h('p', { class: 'hint', id: 'soften-hint' }),
        h('div', { id: 'suggestion' }),
      ),
      h('details', { class: 'tools', open: true },
        h('summary', null, 'Your card'),
        h('p', { class: 'hint' }, 'Three tick-boxes about how you like to receive messages. If you share it, the other side can ask Claude to soften their message for you. Claude is shown only these ticks, never your words.'),
        h('div', { class: 'checks' }, Object.entries(CARD).map(([id, label]) =>
          h('div', { class: 'check' },
            h('input', { type: 'checkbox', id: `c-${id}`, checked: S.myCard.includes(id), onchange: (ev) => {
              S.myCard = ev.target.checked ? [...new Set([...S.myCard, id])] : S.myCard.filter((x) => x !== id);
            } }),
            h('label', { for: `c-${id}` }, label)))),
        h('div', { class: 'row' }, btn('Share my card', () => sendCard(), 'secondary', { id: 'card-btn' })),
        h('p', { class: 'hint', id: 'card-status' }),
      ),
      h('div', { class: 'row wrap' },
        btn('Time a round trip', () => ping(), 'quiet', { id: 'ping-btn' }),
        btn('Pause everything', () => narrowTo([]), 'quiet', { id: 'pause-btn' }),
        btn('Seal the room', () => closeRoom(), 'secondary', { id: 'seal-btn' }),
        btn('Leave quietly', () => closeRoom(true), 'quiet', { id: 'leave-btn' }),
      ),
      h('p', { class: 'hint', id: 'rtt' }),
      !canWords && !canCard ? h('p', { class: 'status' }, 'The room is paused: nothing can cross, but it is still open.') : null,
    );
  },

  ended() {
    const reason = S.endedReason ? END[S.endedReason] || 'The room closed.' : 'The room closed.';
    return h(
      'article',
      { class: 'card' },
      h('h2', null, 'The room is closed'),
      h('p', { id: 'ended-reason' }, reason),
      h('p', { class: 'hint' }, 'The keys on this device have been wiped. Nothing was saved.'),
      S.peer && S.endedReason !== 'peer-changed' && S.endedReason !== 'words-differ' && S.endedReason !== 'failed'
        ? h('div', { class: 'row' }, btn(S.trusted === S.peer.fingerprint ? 'Trusted for next time' : 'Trust this device next time', () => { S.trusted = S.peer.fingerprint; setScreen('ended'); }, 'secondary', { id: 'trust-btn', disabled: S.trusted === S.peer.fingerprint }))
        : null,
      h('div', { class: 'row' }, btn('Start again', () => { resetRoom(); setScreen('start'); })),
    );
  },
};

// ── The actions that need the link ───────────────────────────────────────────────────────────

async function accept() {
  try {
    setScreen('opening');
    await apply(await S.link.accept());
  } catch (e) {
    note('Could not open the door.');
    refresh();
  }
}

async function decline() {
  try {
    await apply(await S.link.decline());
  } catch (e) {
    note('Could not say not now.');
    refresh();
  }
}

async function verify(match) {
  S.verifiedByMe = match;
  try {
    await apply(await S.link.verified(match));
    if (S.link.phase() === 'verify') {
      drawStage();
      const wait = $('words-wait');
      if (wait) {
        wait.setAttribute('tabindex', '-1');
        wait.focus();
      }
    }
  } catch (e) {
    note('Could not record that.');
    refresh();
  }
}

async function closeRoom(quietly) {
  if (!S.link) {
    resetRoom();
    setScreen('start');
    return;
  }
  try {
    await apply(await S.link.seal({ quietly: Boolean(quietly) }));
  } catch (e) {
    endRoom('you-sealed');
  }
}

// ── The bits that change without redrawing the screen ──────────────────────────────────────
// Each region is redrawn only when what it shows has changed. Redrawing every second would swallow
// a click, drop keyboard focus, and make a screen reader read everything again.

const shown = new Map();
function changed(key, value) {
  const sig = typeof value === 'string' ? value : JSON.stringify(value);
  if (shown.get(key) === sig) return false;
  shown.set(key, sig);
  return true;
}

const setText = (id, text) => {
  const el = $(id);
  if (el && el.textContent !== text) el.textContent = text;
};

function chip(id, label, kind) {
  const el = $(id);
  if (!el) return;
  setText(id, label);
  const cls = `chip ${kind}`;
  if (el.className !== cls) el.className = cls;
}

let logShown = 0;

function refresh() {
  // Channel and room, at the top.
  const c = S.channel;
  if (!S.link && S.runtime.room === null) chip('chip-channel', 'Channel: not used yet', 'idle');
  else if (c.connected) chip('chip-channel', `Channel: connected, ${plural(c.peers, 'device', 'devices')} here`, 'ok');
  else chip('chip-channel', S.runtime.room === false ? 'Channel: not available' : 'Channel: not connected', 'warn');
  const phase = S.link ? S.link.phase() : 'none';
  const names = { none: 'Room: none', knocking: 'Room: knocking', listening: 'Room: listening', consent: 'Room: a knock to answer', handshaking: 'Room: opening', verify: 'Room: checking the words', live: 'Room: live', sealed: 'Room: closed' };
  chip('chip-room', names[phase] || 'Room', phase === 'live' ? 'ok' : phase === 'sealed' ? 'bad' : 'idle');

  // The countdown, on whichever screen has one.
  if ($('countdown') && S.link) {
    const t = timing();
    const elapsed = clock() - S.phaseSince;
    let left = null;
    if (S.screen === 'door' || S.screen === 'listening') left = t.knockMs - elapsed;
    else if (S.screen === 'live' && S.link.charter()) left = S.link.charter().ttlSeconds * 1000 - elapsed;
    setText('countdown', left === null ? '' : S.screen === 'live' ? `The room closes by itself in ${mmss(left)}.` : `Gives up in ${mmss(left)}.`);
  }

  // The conversation: add what is new, and never redraw what is already there.
  const log = $('log');
  if (log) {
    if (logShown > S.log.length) {
      log.replaceChildren();
      logShown = 0;
    }
    const before = logShown;
    for (; logShown < S.log.length; logShown++) {
      const m = S.log[logShown];
      log.append(h('li', { class: `msg ${m.who}` }, m.who === 'note' ? m.text : [h('span', { class: 'who' }, m.who === 'you' ? 'You' : 'Them'), h('span', { class: 'text' }, m.text)]));
    }
    if (logShown !== before) log.scrollTop = log.scrollHeight;
  }

  const live = Boolean(S.link) && S.link.phase() === 'live';
  const kinds = live && S.link.charter() ? S.link.charter().kinds : [];
  const flag = (id, off) => {
    const el = $(id);
    if (el && el.disabled !== off) el.disabled = off;
  };
  flag('send-btn', !live || !kinds.includes('words'));
  flag('card-btn', !live || !kinds.includes('card'));
  flag('pause-btn', !live || kinds.length === 0);
  flag('soften-btn', !live || !kinds.includes('words') || !S.runtime.sample || !S.theirCard);
  setText(
    'soften-hint',
    !S.runtime.sampleChecked
      ? 'Checking whether Claude can be asked from this page...'
      : !S.runtime.sample
      ? 'Asking Claude is not available on this page.'
      : !S.theirCard
        ? 'Waiting for their card. Claude is shown only their tick-boxes, never their words.'
        : `Claude will be shown your draft and their ticks (${S.theirCard.map((id) => CARD[id].toLowerCase()).join('; ')}). It asks your permission first, on your own account.`,
  );
  setText('card-status', S.theirCard ? `Their card: ${S.theirCard.map((id) => CARD[id].toLowerCase()).join('; ')}.` : 'They have not shared a card yet.');
  setText('rtt', S.rtt.length ? `Round trips so far (ms): ${S.rtt.join(', ')}.` : '');

  const sug = $('suggestion');
  if (sug && changed('suggestion', S.suggestion)) drawSuggestion(sug);

  // The bench.
  if (changed('tape', S.tapeTotal)) drawTape();
  if (changed('tally', [S.ignored, S.link ? S.link.stats() : null])) drawTally();
  if (changed('probe', [S.runtime.room, Boolean(S.runtime.sample), S.runtime.sampleChecked, S.probe])) drawProbe();
}

function drawSuggestion(host) {
  const s = S.suggestion;
  host.replaceChildren();
  if (!s) return;
  if (s.state === 'thinking') host.append(h('p', { class: 'status' }, 'Asking Claude...'));
  else if (s.state === 'error') {
    host.append(h('p', { class: 'problem' }, s.code === 'not_granted' ? 'Claude was not allowed on this page, so there is no suggestion. Nothing was sent to the other device.' : `No suggestion this time (${s.code}). Nothing was sent to the other device.`));
  } else {
    host.append(
      h('div', { class: 'suggestion' },
        h('p', { class: 'hint' }, 'A suggestion. It has not been sent to the other device:'),
        h('p', { class: 'suggest-text', id: 'suggest-text' }, s.text),
        h('div', { class: 'row' },
          btn('Use this', () => { $('draft').value = s.text; S.draft = s.text; S.suggestion = null; refresh(); }, 'secondary', { id: 'use-suggestion' }),
          btn('Keep mine', () => { S.suggestion = null; refresh(); }, 'quiet'))),
    );
  }
}

function drawTape() {
  const list = $('tape-list');
  if (!list) return;
  const rows = S.tape.map((t) => h('li', { class: t.dir }, h('span', { class: 'arrow', 'aria-hidden': 'true' }, t.dir === 'out' ? '↑ sent' : '↓ heard'), h('span', { class: 'size' }, `${t.size} chars`), h('span', { class: 'bits' }, `${t.head}…`)));
  list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, 'Nothing has crossed yet.')]));
  const total = $('tape-total');
  if (total) total.textContent = S.tapeTotal ? `${plural(S.tapeTotal, 'frame', 'frames')} so far. Every one looks like this.` : '';
}

const WHY = {
  old: 'a repeat or a very late one',
  'bad-check': 'failed its check (altered or not ours)',
  'too-far': 'too far ahead',
  'bad-form': 'not shaped like a frame',
  unreadable: 'could not be read',
  'wrong-session': 'from another room',
  'wrong-phase': 'at the wrong moment',
  'not-allowed': 'not on the agreed list',
  'bad-card': 'a card that was not one',
};

function drawTally() {
  const el = $('tally');
  if (!el) return;
  const entries = Object.entries(S.ignored);
  const st = S.link ? S.link.stats() : { sent: 0, received: 0, missing: 0 };
  const total = entries.reduce((n, [, v]) => n + v, 0);
  el.replaceChildren(
    h('p', null, `Sent ${st.sent}, heard ${st.received}, known to be missing ${st.missing}.`),
    ...(total
      ? [h('p', null, `Refused ${total}.`), h('ul', { class: 'plain' }, entries.map(([k, v]) => h('li', null, `${WHY[k] || k}: ${v}`)))]
      : [h('p', null, 'Nothing refused so far.')]),
  );
}

function drawProbe() {
  const el = $('probe');
  if (!el) return;
  el.replaceChildren(
    h('li', null, 'Live channel: ', h('strong', null, S.runtime.room === null ? 'not tried yet' : S.runtime.room ? 'available' : 'not available')),
    h('li', null, 'Ask Claude: ', h('strong', null, !S.runtime.sampleChecked ? 'checking...' : S.runtime.sample ? 'available' : 'not available'), S.runtime.sample ? [' ', btn('Test it', () => probeClaude(), 'quiet small', { id: 'probe-btn' })] : null, S.probe ? ` ${S.probe}` : ''),
    h('li', null, 'Encryption in this browser: ', h('strong', null, globalThis.crypto && crypto.subtle ? 'available' : 'not available')),
  );
}

// ── Page furniture ───────────────────────────────────────────────────────────────────────────

function mischiefPanel() {
  const modes = [
    ['none', 'Behave'],
    ['alter', 'Change one character of my next message'],
    ['twice', 'Send my next message twice'],
    ['drop', 'Lose my next message'],
    ['junk', 'Send junk instead of my next message'],
  ];
  return h('details', { class: 'bench-card' },
    h('summary', null, 'Try to break it'),
    h('p', { class: 'hint' }, 'This damages your own next message on its way out, the way a hostile relay might. The other device should refuse what is wrong, say so under "Refused", and carry on.'),
    h('div', { class: 'radios' }, modes.map(([id, label]) => h('div', { class: 'check' },
      h('input', { type: 'radio', name: 'mischief', id: `m-${id}`, checked: S.mischief === id, onchange: () => (S.mischief = id) }),
      h('label', { for: `m-${id}` }, label)))),
  );
}

function buildBench() {
  const bench = $('bench');
  bench.replaceChildren(
    h('section', { class: 'bench-card tapecard' },
      h('h3', null, 'What the relay carries'),
      h('p', { class: 'hint' }, 'This is everything the platform sees: strings it cannot read. The newest are at the bottom.'),
      h('ul', { class: 'tape', id: 'tape-list', 'aria-label': 'Frames seen by the relay' }),
      h('p', { class: 'hint', id: 'tape-total' })),
    mischiefPanel(),
    h('section', { class: 'bench-card' },
      h('h3', null, 'What was refused'),
      h('div', { id: 'tally' })),
    h('section', { class: 'bench-card' },
      h('h3', null, 'What this page can reach'),
      h('ul', { class: 'plain', id: 'probe' }),
      h('p', { class: 'hint' }, 'It asks for these two things only. It has no database, files or other access.')),
    h('section', { class: 'bench-card' },
      h('h3', null, 'Tell me how it went'),
      h('p', { class: 'hint' }, 'Copies a short report of numbers and timings, never any words. Paste it into the chat with Claude.'),
      h('div', { class: 'row' }, btn('Copy the report', async (ev) => {
        const ok = await copyText(report(), 'report-fallback');
        ev.target.textContent = ok ? 'Copied' : 'Select it below';
      }, 'secondary', { id: 'report-btn' })),
      h('textarea', { id: 'report-fallback', class: 'fallback', hidden: true, readonly: true, rows: '8' })),
    h('section', { class: 'bench-card' },
      h('h3', null, 'Patience'),
      field('f-patience', 'How long to wait for a quiet partner before closing the room',
        h('select', { id: 'f-patience', onchange: (ev) => (S.staleMs = Number(ev.target.value)) },
          h('option', { value: '0' }, '20 seconds (default)'), h('option', { value: '60000' }, '1 minute'), h('option', { value: '300000' }, '5 minutes')),
        'Phones pause pages in the background. A longer wait tells you how much your phone allows. Set it before you make or join a room.')),
  );
}

async function boot() {
  buildBench();
  drawStage();
  refresh();
  // Ask for the ability to question Claude without holding the page up: it can take ten seconds to
  // find out it is not there. Nothing is asked of the viewer until a button is pressed.
  Promise.resolve(window.claude && window.claude.use ? withTimeout(window.claude.use('sample'), 12000) : null)
    .catch(() => null)
    .then((fn) => {
      S.runtime.sample = fn || null;
      S.runtime.sampleChecked = true;
      refresh();
    });
  try {
    const { identity } = await linkCreateIdentity();
    S.me = { identity, words: linkFingerprintWords(identity.fingerprint).join(' ') };
  } catch (e) {
    S.error = 'This browser cannot make a device key, so the lab cannot run here.';
  }
  drawStage();
  refresh();
  document.documentElement.dataset.ready = 'yes';
}

boot();
