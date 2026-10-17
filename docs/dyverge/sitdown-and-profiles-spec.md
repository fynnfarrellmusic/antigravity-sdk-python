# dYverge: sit-down and profile module spec (draft 2)

Status: draft 2, 10 Oct 2026. Built from the dYverge Handoff (10 Oct 2026).
The name stays dYverge: this is a module of the app, not a separate product.
"couplesTherapY" was a working title and is retired. Decisions made are in section 8.
Built so far: the framework-free logic in `dyverge-core/` (see section 11).

## 1. What it is

A guided, interactive conversation for two people, with an AI facilitator that
runs the sit-down, and a slow-building picture of how each person tends to
communicate, built from many sessions over time.

It extends the Compass. The Compass translates one message. This module
facilitates a whole conversation, and remembers across conversations.

## 2. The rules it inherits (and where the request collides with them)

| Handoff rule | What it means for this module |
|---|---|
| "dYverge is not therapy, not a crisis service" (persistent Settings line) | Stays true until clinical and legal review say otherwise. It is a guided practice space. See section 10. |
| A profile is only ever edited by its owner | The AI **cannot** write "character profiles". It can only *propose*, to the owner alone. Sections 4 and 5. |
| De-pathologising: two operating systems, never one broken person | No labels, no "traits", no diagnoses, no "your partner's X". |
| No charts or percentages anywhere; no scoreboards | Profiles are plain sentences with evidence. No scores, rankings, or comparisons between the two people. |
| Local-first; only the Compass call leaves the device | This module adds a **second** off-device call. It must be disclosed at the step, minimal, and never silent. |
| Three always-on gates (hard, soft, power) | Run on every turn from both people. Power gate is extra important for profiling (section 6). |
| Interface contracts as capacity drops; no timers, no forced confirmations | Each person checks their battery first. Either person Flooded means no sit-down. |
| Park it / Need space need a required return time | The same applies mid-session. Leaving is never silent. |
| Recognition over generation: menu replies, voice notes, no-typing flows | Facilitator offers A/B/C replies wherever it would ask for text. |
| British English, second person, banned words | Applies to every facilitator line and every prompt. |

## 3. The sit-down (interactive session)

Default: **one device, passed between two people.** This sidesteps the open
Partner-sync question. Two-device is a later phase.

Flow:

1. **Each person checks their battery** (the existing gate, separately).
   Either Flooded: no sit-down offered. Offer Sanctuary, Park, or Need space.
   Skip counts as Steady, as elsewhere.
2. **Pick what this is for**: Before I send / Something I got / Repair / Just
   to talk it through. Tap, not type.
3. **The room.** The facilitator holds structure; it never takes sides and never
   scores. Each turn:
   - one person speaks (text or voice note, equal weight);
   - the gates run;
   - the facilitator reflects the **signal** (what objectively happened) and the
     **noise** (fear layered on top, owned as nervous system) back, in plain
     language, then offers the *other* person A/B/C ways to respond;
   - the other person chooses or writes their own.
4. **Park it** in the footer of every step, with a required return time.
5. **Close.** The facilitator drafts a short shared summary in two parts, "what
   we heard" and "one thing we'll try", both people confirm by name and date
   (same pattern as the Agreement). Anything unconfirmed is dropped.
6. **Private step, per person**, after the session: the facilitator may offer
   profile proposals (section 5), one person at a time, the other not looking.
   The device is handed over explicitly. This is the one moment the design depends
   on the people, so it needs a clear "hand the phone to X" screen.

Facilitator stance, baked into every prompt: the **Double Empathy Problem**.
Neurotypical communication is never the baseline. A misunderstanding is two
operating systems, never one person being wrong.

## 4. Long-term understanding, reconciled with owner-only profiles

Three layers, only the last is the profile:

1. **Session record** (device only): turns, gate outcomes, the confirmed summary.
   Each person's own words belong to them; deleting your words removes them.
2. **Observations** (device only, per person, AI-drafted): short descriptive
   notes, each citing the session and the quoted words they come from. Never
   shown to the partner. Never contain "traits" or labels.
3. **The profile** (owner-authored, the existing Profile record). The AI adds
   nothing directly. It offers **proposals**, to the owner only: *"Across 4
   sessions, a quiet pause after a direct question seemed to mean 'processing',
   not 'no'. Add to How I receive?"* Owner can accept, edit, decline, or "unsure".
   Declined proposals are not re-proposed unless new evidence appears.

What a person chooses to put on their profile reaches Us only through the
existing share step. Nothing is shared silently.

### What the long-term picture holds (all descriptive, plain language)

- how I tend to receive things (lenses), what I need to hear, how I write;
- what costs me spoons, in my words;
- repair attempts that worked, with the session they happened in;
- what I value, as I said it;
- **what has shifted**: a plain-language timeline ("in March a direct ask
  felt like corner; since June, asking with a reason helps"). No chart.

### Evidence rules

- A pattern needs **3 sessions** before it can be proposed.
- Confidence is never shown as a number. "Unsure" is a first-class state.
- Anything the AI inferred about a person's neurotype is **never** proposed.
  Neurotypes are only what the person selected themselves.
- Observations about one person never use the other's words as evidence of a
  trait. "When X said Y, Z felt cornered" is a pattern about the exchange.

## 5. Data model additions (device-local)

```ts
type Sitdown = {
  id: string; relationshipId: string; startedAt: string; endedAt?: string;
  purpose: 'before-send' | 'got' | 'repair' | 'talk-through';
  batteryAtStart: Record<PersonId, number | 'skipped'>;
  turns: Turn[];
  summary?: { heard: string; tryThis: string; confirmedBy: Record<PersonId, string /* ISO date */> };
  parked?: { returnBy: string; reEntryCard: string };
};

type Turn = {
  id: string; author: PersonId; at: string;
  kind: 'text' | 'voice' | 'menu-choice';
  content: string;
  gate: 'passed' | 'soft' | 'hard' | 'power';
};

type Observation = {                 // never leaves the owner's view
  id: string; owner: PersonId;
  text: string;                      // descriptive, plain language
  evidence: { sitdownId: string; turnId: string; quote: string }[];
  firstSeen: string; lastSeen: string;
};

type ProfileProposal = {
  id: string; owner: PersonId; field: ProfileFieldKey;
  proposedText: string; observationIds: string[];
  state: 'pending' | 'accepted' | 'edited' | 'declined' | 'unsure';
  decidedAt?: string;
};
```

All four stored on device. Export and per-person delete are required, and
deleting your own data needs nobody else's consent.

## 6. Safety

- **Hard / soft / power gates** run on every turn from both people, always on.
- **Power gate and profiling**: if the facilitator sees one person using the
  session to build a case against the other (contempt, "prove it", denying
  sensory reality, weaponising a diagnosis), it refuses, offers the screening
  module, and **stops generating observations for that session**. The profile
  layer must never become a file kept on a partner.
- **Joint sessions are not offered** until a couple-level safety screen has been
  completed by each person *separately*. The screen's content needs the legal
  and trauma-informed clinical review the research synthesis already calls for.
  I have not drafted it, and should not.
- Coercive control risk: a session where one person is guarded or constrained
  looks calm from the outside. Facilitator may offer either person a private
  "pause without saying why" that ends the session neutrally.
- **UK routes only** until the open question on non-UK routes is decided.

## 7. The off-device call

- Provider: Anthropic API, as the Compass.
- Disclosed on the step that sends it ("This part goes to Anthropic"), same
  pattern as the Compass.
- Sent per turn: the current turn, the purpose, and the accepted profile lines
  of the two people (not the observations, not full history).
- Session-end summary and observation drafting are separate calls, disclosed.
  Transcripts stay on device.
- No analytics on any session screen. Ever.

### System-prompt skeleton (facilitator)

```
You are a facilitator, not a therapist. You help two people be understood.
Frame every misunderstanding as two operating systems meeting (the Double
Empathy Problem). Neurotypical communication is never the baseline.
Never take a side. Never diagnose. Never score. Never say "symptoms" or
"your partner's disorder".
British English, second person, present tense. Warm, unhurried.
Banned: journey, unlock, crush it, self-care, tribe, wellness warrior,
high-functioning, special needs, suffers from, "just", "simply".
Offer A/B/C menu replies wherever you would otherwise ask for typing.
If either person's words hit crisis language, stop and say: "This isn't a
tool for this moment, and you deserve a person." Nothing else.
```

## 8. Decisions

Made (Fynn, 10 Oct 2026):

1. **Name:** dYverge. The module is part of the app.
2. **Where it lives:** TypeScript inside the React app, local-first. The Python
   SDK is not used. `dyverge-core/` is framework-free so it drops into `src/core/`.
3. **Device:** one device, passed between two people. Built for people who
   communicate differently across neurotype, culture and language.
4. **Review:** both clinical and legal review are needed. Briefing packs are in
   `review-pack-clinical.md` and `review-pack-legal.md`. Neither review has happened.
5. **Profiles:** each person gets a communication profile (love languages,
   neurotype, how they receive and write, anxieties, sensory needs). Not a
   "character" file. See section 10.

Still open:

- **The "not therapy" line.** See section 10. This is the one that most needs your
  call, and it depends on the legal pack's answers.
- **In-app name for the module.** Working title: "Sit-down".
- Every open question already listed in the handoff (partner sync, which engine
  translates, support routes outside the UK, and the rest).

## 9. Build order

1. Data model and local storage, plus export and delete.
2. Gate runner, shared with the Compass, on every turn.
3. Sit-down room (one device), no long-term layer.
4. Observation drafting, then the private proposal screen.
5. Timeline of "what shifted" in the Us screen.
6. Two-device sync (depends on the open Partner-sync question).

## 10. Meeting people where they are, and therapist-grade attention

The goal: assess each person well enough to hand them the tools that actually
suit them, without the app claiming to be something it is not.

**What "assess" means here.** Three sources, in order of authority:

1. **Self-description**: onboarding and Vibe Check, in menu form. The person's
   own choices. Authoritative.
2. **Context at the time**: battery zone and spoon level, today. Always fresh,
   never accumulated into a score.
3. **Observed patterns across sit-downs**: only ever proposed, never applied
   (section 4), only after 3 sessions.

**Why this is deterministic where it can be.** Tool matching
(`dyverge-core/src/matcher.ts`) is rules over the profile and current capacity,
with a plain-language reason attached to every recommendation. It runs offline,
can be tested, can be reviewed by a clinician line by line, and cannot drift.
The model is used for language and for drafting observations, not for deciding
which tool you get.

**Where the line is.** The app can be therapeutically informed: it uses
established frameworks, reflects patterns back, teaches skills and keeps
continuity across sessions. It must not diagnose, treat, or present itself as a
therapist. I recommend keeping the Settings line, reworded to say what it is:
a guided practice space, not a replacement for a therapist or a crisis service.
Reasons, not caution for its own sake:

- the handoff's own gates and Safety stop assume a tool that hands off to a person;
- couples work is contraindicated where there is coercive control, which the app
  cannot rule out from inside a shared session;
- jurisdictions differ on AI that presents as therapy (see the legal pack).

If clinical and legal review both clear a stronger position, the line can change.
It should change on their sign-off, not on ours.

**Across borders.** Profiles carry locale and languages. `check-the-phrase`
fires when main languages differ. Directness and context style are
self-selected dimensions, not assumptions about a culture or country.
Support routes are per-locale and must be reviewed per country before a locale
ships. UK only until then.

## 11. Built so far: `dyverge-core/` and the app

`dyverge-core/` is framework-free TypeScript, no runtime dependencies, a unit-test suite (`npm test`) and a browser smoke test (`npm run smoke`).
It was rebased on 10 Oct onto the real app's data model (`lenses`, `care`,
`receiveNote`, `needToHear`, `write`: no diagnosis, no ratings). The app is in
`dyverge-app/dyverge-app.jsx`, committed first unmodified so every change is a clean diff.

| Module | Does |
|---|---|
| `types.ts` | The app's profile, lenses, zones, Vibe profiles and families; sit-down, observation and proposal records. |
| `capacity.ts` | Battery to zone. No sit-down while either person is flooded. |
| `matcher.ts` | Communication tools from each person's own lenses and words. Every tip carries the reason it fired, and only restates what they wrote. |
| `pathways.ts` | **The plural-pathways rule.** Enforced on every set it builds. Inlined into the app by `scripts/build-app.ts`. |
| `gates.ts` | **Safety gates in ten languages.** Section 14. Inlined into the app. |
| `vault.ts` | **Per-person encrypted private spaces.** Section 15. Inlined into the app. |
| `fieldnotes.ts` | **The practice run**: private field notes, an allow-listed pack of exactly what a person chooses to share, a check for details that could identify someone, and reading two packs together. Never sends or saves anything. Inlined into the app. |
| `people.ts` | **Who is on the phone, and what crosses between them**: names, published profile and spoons (allow-listed fields only), and the agreement with one signature each. Inlined into the app. |
| `session.ts`, `proposals.ts`, `routes.ts`, `language.ts`, `access.ts` | As described earlier: sit-down rules, proposals, reviewed routes by locale, copy lint, restricted modules. |

Not built: the sit-down UI, partner sync across devices (not needed while the phone is passed
between two people), the facilitator call, translation between languages.

## 13. Never one approach (10 Oct 2026)

Principle, from Fynn: whatever the app assesses, it always offers several pathways and
never assumes one approach or technique will work.

What "several" means, because the handoff also says the interface removes options as
capacity drops: **different kinds of help, not a longer list.** A flooded person gets
few options, but never one kind. The rule, enforced in code and tested:

- at least 3 pathways, from at least 3 categories (regulation families, space, words,
  connection, learn, person, professional);
- any regulation help comes from at least 2 different families (express, move, quiet,
  shift, choose);
- a person is always on offer (support routes where reviewed, someone you trust,
  people who have been there);
- there is always a way to say "none of these feel right", and that counts as an answer;
- nothing is ranked or called best, presentation order is fixed, and copy is linted for
  promises ("cure", "guaranteed", "the only way", "you must");
- a professional pathway offers several kinds together (a doctor, relationship support,
  one-to-one support, neurodivergence support) and is **restricted** until clinical and
  legal review. It ships off.

Learning without collapsing: "Did that help?" (yes, a bit, no, not sure) only reorders
what is shown. A "no" moves a tool down within its family. It never removes a family,
and the person's own Vibe family always stays in their set, because it is their
starting point, not a verdict.

Changes made in the app: Sanctuary shows three cards from at least two families
(Cocoon was weight, sound off, lights; it is now weight, sound off, ask your body); the
Vibe result adds a second family and says it is not a verdict; the support sheet lists
other kinds of support beside the phone numbers; and the Compass is asked for the
likeliest reading plus one other, never a single certain explanation.

Not claimed: that any one pathway works. The app offers; the person decides.

## 12. Restricted modules and the internal pre-review (10 Oct 2026)

Until clinical and legal review sign off, the sit-down facilitator, observation
drafting, profile proposals and screening are **restricted**: off by default, never
on in production builds, and on only in an internal-test build with a tester
passcode. See `dyverge-core/README.md`. This is a gate for safe testing, not a
substitute for review, and not real security on its own.

An internal pre-review is in `internal-prechecks.md`. It added three things to the
design, all now in `dyverge-core/`: neurotypes are private unless shared; support
routes are checked per locale before a joint session; observations expire after
180 days unless a proposal rests on them. It also found one gap that is **not yet
built and blocks real use**: because the app is local-first on one shared device,
the two people can read each other's private data. It needs a per-person encrypted
vault (internal-prechecks L1).

## 14. Languages (10 Oct 2026)

Fynn's question: why decline other languages when we could cover them now? We can, and
now do, with one honest limit: **only English has been reviewed, and that review was the
original author's, not a clinician's.**

- **English** is the original baseline. The regular expressions are copied verbatim and a
  test compares the new engine with the original code on a corpus and on 4,000 random
  English sentences. Behaviour is unchanged.
- **Nine draft languages**: Spanish, French, German, Portuguese, Italian, Polish, Russian,
  Arabic, Hindi. Written by Claude without native-speaker or clinical review. Each has hard,
  soft and power lists. Tests prove self-consistency only (each pattern fires on what it was
  written for and stays quiet on everyday speech), not real-world coverage.
- **Every language runs on every text.** A crisis phrase in Spanish inside an English
  message still stops. A wrongly guessed language cannot hide one.
- **A hard hit always stops**, in any language, even one the app cannot otherwise check.
- **Languages with no gates are declined**, not passed as if checked: Turkish, Dutch,
  Swedish, Chinese, Japanese, Korean, Hebrew, Greek, Thai, Ukrainian, Persian and the rest.
  The screen says plainly what it covers and that nothing was sent or saved.
- **Draft languages say so**, at the point of use: "Safety checks in Español are new, and
  they cover less than they do in English", with support routes one tap away.
- **One switch**: `GATE_DRAFT_LANGUAGES` in the app. `false` declines everything except
  English until the drafts are reviewed.
- Older iPhones (before iOS 16.4) cannot parse regex lookbehind, which would stop the app
  loading, so the engine does not use it. A test enforces this.

What still has to happen before the drafts lose their notice: a native-speaker clinician
per language reviews the lists, and each language's real support routes are reviewed
(routes are UK only today; the draft screens still say "your local emergency number").

Not done: translating between languages (the Compass still writes its reading in English).

## 15. Private spaces (10 Oct 2026)

Fynn's decision: a vault per person, and only shared communication crosses over.

- Each person's private data is encrypted on the phone (AES-GCM-256, key from PBKDF2-SHA256
  at 210,000 rounds) under a passphrase only they know. The other person cannot read it, even
  with the phone in their hand.
- Every entry is bound to its owner and key, so an entry cannot be moved between people or
  between keys without being caught.
- **What crosses over** is decided in one place, `classifyKey`. Shared: Our words and the
  agreement. Open: display settings, so the lock screen can follow them. **Everything else is
  private by default**, including things not invented yet.
- "Use without saving" keeps nothing on disk at all, instead of leaving things in plain text.
- Older plain-text data is moved into the vault when a private space is made.
- Lock now (Home and Settings), change passphrase, and erase-and-start-again if forgotten.
  There is no recovery: any route back in is also a route in for someone else.
- "Clear my things" empties only that person's own things, what they shared and their signature. It keeps
  their passphrase, and never touches the other person's space, Our words or display settings.

**Honest limits.** It keeps out someone who picks up the phone. A short passphrase would not
stop an expert with the phone and time, and nothing protects a person who is made to hand
their passphrase over. Both are said on the create screen. A third limit is **not** said in the app yet:
a browser can clear a site's stored data on its own (finding A18 in `internal-prechecks.md`), and with no
recovery a private space could then vanish. Whether and how to say it is an open decision (`decisions.md`).

**Two people (built 10 Oct).** See `decisions.md`. In short: each person has their own private
space and passphrase; the first person adds the second from inside their own unlocked space;
the lock screen asks who is opening it by name when two people use the phone; what crosses over is
only what someone publishes (their profile, optionally their spoon level), one signature each on
the agreement, Our words, and names. Until the other person exists, a labelled example stands in.
The shared items are kept in the open so the other person can read them, so they are not protected
by the owner's passphrase, and the app says so where they are shared. A name is written to the list
before the passphrase becomes a key (so a third person is refused at once). If the app is closed in
that moment, the name is dropped the next time it opens, so the lock screen never shows someone who
cannot get in (`pruneUnfinished`).

**When the browser will not let the page save** (a private window, or a sandboxed viewer), everything
lives in one shared in-memory store for the page. Two people can still pass the page between them and
see what the other shared, until it is closed or refreshed, and the create screen says plainly that
nothing is kept. This was found while preparing the app for hands-on testing: before it, each screen got
its own empty store, so a second person could not see the first at all and nothing said why.

## 16. The practice run (17 Oct 2026)

Fynn's idea: try dYverge with a friend or partner on their own devices, with no data bank. What each
person chooses and consents to share is read together, as a field research tool: a practice run.
Full how-to and wording: `practice-run-guide.md`.

**The shape.** Two things move, both by a person's own hand, and nothing else does.

1. A person writes **field notes** in their own private space (a vault key, private by default): the
   kind of moment, whether dYverge helped, a line on what happened, what they would change, and
   optionally an end-of-run reflection.
2. They **choose what to share** in four steps (choose, label, check, share). The result is a
   **pack**: plain text they can read exactly, optionally locked with a passphrase. They send it
   themselves, by the share sheet, a copy or a saved file. The app never sends it.
3. The person running the practice run **reads two packs together** (the Compare screen), in memory.
   If an AI can be reached it reads them (both people's notes go to Anthropic). Otherwise it counts
   and sets them side by side on the device. Or they copy a brief and paste it into Claude
   themselves. Nothing is saved.

**Why no server.** Sharing a Claude project does not carry what is in each person's browser, and a
shared chat keeps its history, which is a data bank by another name. A file a person checks and
sends is the one route that is local-first, consent-first and server-free. Live two-way sync, or an
inbox with an expiry, would need a server, so both are left out on purpose.

**What the code guarantees** (each is tested; the table is in the guide).
- One network call in the whole app, and the share screens never make it.
- `buildPack` is an allow-list: a name, passphrase, profile or anything else on the notebook cannot
  ride along. The pack carries a day, never a time.
- A check finds emails, phone numbers, links, postcodes and the names the app knows, and one tap
  takes them out. The label cannot be the person's own name.
- The Compare screen has no storage of any kind. Leaving it drops everything.
- The safety check reads every word before a note is saved and before anything is read together. A
  hard hit stops it, and a language it cannot check never goes to an AI.
- Notes are data, not instructions, and cannot open or close the boxes the prompt puts them in.

**Research on the app, never an assessment of a relationship.** The reading prompt forbids judging
either person, taking a side, diagnosing, and advice about staying together, and sets `refuse` on
danger. Suggestions are at least three different kinds or none, and the screen adds that none may
fit. A summary for both goes back only if both agreed, and is paraphrase only.

**Honest limits.** The app cannot take a sent file back, stop a screenshot, make the channel private,
catch every identifying detail, know whether someone was pressured, or prove consent. A short
passphrase on a locked file can be guessed offline. The AI reading is a hypothesis about how the
app worked. Findings A20 to A25 in `internal-prechecks.md`; questions 23 to 25 (clinical) and 20 to
22 (legal) in the packs.

**Parked.** A QR handshake for the same room, live peer-to-peer, more than two people, hand-redacting
single words, files that expire on their own.

**Switch.** `PRACTICE_RUN`, true while dYverge is tried with people who know it is a trial.
