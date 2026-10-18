# @dyverge/core

Framework-free logic for dYverge. No runtime dependencies. Meant to drop into the
React app as `src/core/`.

```sh
npm install
npm run typecheck
npm test
```

## Restricted modules (testing clinical and diagnostic features safely)

Four modules have not been through clinical or legal review: `sitdown-facilitator`,
`observation-drafting`, `profile-proposals`, `screening`. They are **off by default**.

| Build | What happens |
|---|---|
| `production` | They can never be turned on, whatever passcode is entered. |
| `internal-test` | A tester can turn on one module with the tester passcode. It relocks every time the app starts. Five wrong tries and unlocking is refused until restart. |

Every screen of an unlocked module must show `access.banner(id)`. Use made-up details
only while testing.

### Set up a test build

1. Make a verifier. The passcode is read from the environment, never from argv:

   ```sh
   DYVERGE_TESTER_PASSCODE='a long passcode only testers know' node scripts/make-verifier.ts
   ```

2. Put the printed `saltHex`, `hashHex` and `iterations` into your build secrets.
   Never commit them, and never commit the passcode.

3. In the app:

   ```ts
   const access = createAccess({
     environment: import.meta.env.MODE === 'internal-test' ? 'internal-test' : 'production',
     verifier, // from build secrets; undefined in production
   });

   // Every entry point:
   const propose = guard(access, 'profile-proposals', proposalsFromObservations);
   ```

### What this does not protect against

This is a gate in client code, in an app that runs on the user's own device. It stops
accidental exposure and casual use. It does not stop someone who has the code and a
debugger. The real protection is **not shipping restricted modules in production
builds at all**: import them only from an `internal-test` entry point so the bundler
leaves them out. Do that before any release.

`access.auditLog()` records unlocks, failures, relocks and denials, never passcodes or
user content.

## Working with the app

The app (`../dyverge-app/dyverge-app.jsx`) is a single file by design, so it cannot import
this package. The plural-pathways code lives in `src/pathways.ts`, is tested here, and is
inlined into the app between two markers with the types stripped:

```sh
npm run build:app     # rewrite the block in the app from src/pathways.ts
npm run check:app     # fail if the app's block is out of date (a test also does this)
npm run smoke         # build and drive the real app in headless Chromium, with assertions
```

The live link has its own check, which is not part of `npm test` because it takes about two minutes:

```sh
npm run mutate:livelink   # breaks livelink.ts in 29 specific ways; the tests must notice each one
```

It reports each change as caught, or "equivalent" (removing it changes nothing anyone can see, with the
reason), and exits with 1 if a real one survives. The first run found five gaps in the tests, now closed.

The lab page for trying the room on two devices lives in `lab/`:

```sh
npm run build:lab   # writes lab/dist/live-link-lab.html (not committed)
npm run smoke:lab   # two real browser pages and a stand-in for the platform's live channel
```

Edit `src/pathways.ts`, never the generated block. The tests read the app file itself
(tool ids, Vibe profiles, families), so a change in the app that breaks the rule fails here.

The smoke run gives each scenario its own browser with an on-disk profile, the way a phone keeps
its storage. **A known oddity:** under heavy load, headless Chromium has rarely handed a reloaded
page an empty `localStorage`, straight after a page that held data. The run logs every `clear` and
`removeItem` the page makes, so a failure like that is checkable: if the page removed nothing, it
says so and repeats that one test once (the final line then says how many were repeated). Any
other failure, or a second loss, stops the run at once with the page's storage notes printed. The cause is not understood (a bare page never did it; see
finding A19 in `docs/dyverge/internal-prechecks.md`). To check that a test fails when it should,
break a copy of the app and run `DYVERGE_APP_FILE=/path/to/copy.jsx npm run smoke`.

Five generated blocks are inlined: `vault`, `people`, `fieldnotes`, `gates` and `pathways`.

Switches in the app, all enforced by tests:

| Switch | Ships as | Meaning |
|---|---|---|
| `PATHWAYS_PROFESSIONAL` | `false` | Kinds of professional help are hidden until clinical and legal review. |
| `GATE_DRAFT_LANGUAGES` | `true` | The nine draft gate languages are used, with a notice. `false` declines everything but English. |
| `PRACTICE_RUN` | `true` | The practice run: field notes a person writes and chooses to share, and a screen for reading two people's notes together. Nothing in it sends or keeps anything on its own. `false` takes its card out of Settings. |

## Other modules

| Module | Does |
|---|---|
| `capacity.ts` | Battery to zone. No sit-down while either person is flooded. |
| `matcher.ts` | Communication tools from each person's own lenses and words, each with its reason. |
| `gates.ts` | Safety gates in English plus nine draft languages, run on every text. A hard hit always stops. Languages with no gates are declined. `assessText(text, { allowDrafts })`. |
| `vault.ts` | Per-person encrypted private spaces. `classifyKey` decides what is private, shared or open (default-deny). `createVault`, `openVault`, `ephemeralVault`, `migrateLegacy`, and `lockText`/`unlockText` to lock a file with a passphrase. |
| `fieldnotes.ts` | The practice run: private field notes, `buildPack` (an allow-list of exactly what can be shared), the identifying-details check, a strict `parsePack`, and reading two packs together (`comparePrompt`, `parseComparison`, `localComparison`). Never sends or saves anything. |
| `livelink.ts` | The live link: an encrypted room for two people on two phones. The invite is a key, the knock carries the terms, the terms are part of the keys, nothing flows until both have checked five words, and a room lives only while both are here. It only turns strings into strings: it never opens a connection or touches storage. **A spike: tested, not independently reviewed, not in the app.** See `docs/dyverge/live-link-design.md`. |
| `people.ts` | Who is on the phone (two at most), and what crosses between them: names, a published profile and spoon level (allow-listed fields only), and the agreement with one signature each. |
| `pathways.ts` | The plural-pathways rule: at least 3 kinds of help, at least 2 regulation families, always a person, always a way to say none fit. |
| `session.ts` | Observations stop after a hard or power gate. Summaries need both people. Delete your own words alone. |
| `proposals.ts` | Observation to proposal after 3 sessions. Pruning after 180 days. |
| `routes.ts` | Reviewed support routes by locale. Joint sessions only where every person has them. |
| `language.ts` | Lints copy for the handoff's banned words, and for overcertain claims. |
