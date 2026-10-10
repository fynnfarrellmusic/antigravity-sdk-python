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

Edit `src/pathways.ts`, never the generated block. The tests read the app file itself
(tool ids, Vibe profiles, families), so a change in the app that breaks the rule fails here.

`PATHWAYS_PROFESSIONAL` in the app ships `false` and a test enforces it.

## Other modules

| Module | Does |
|---|---|
| `capacity.ts` | Battery to zone. No sit-down while either person is flooded. |
| `matcher.ts` | Communication tools from each person's own lenses and words, each with its reason. |
| `pathways.ts` | The plural-pathways rule: at least 3 kinds of help, at least 2 regulation families, always a person, always a way to say none fit. |
| `session.ts` | Observations stop after a hard or power gate. Summaries need both people. Delete your own words alone. |
| `proposals.ts` | Observation to proposal after 3 sessions. Pruning after 180 days. |
| `routes.ts` | Reviewed support routes by locale. Joint sessions only where every person has them. |
| `language.ts` | Lints copy for the handoff's banned words, and for overcertain claims. |
