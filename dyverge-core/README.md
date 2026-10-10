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

## Other modules

| Module | Does |
|---|---|
| `capacity.ts` | Battery to zone. No sit-down while either person is flooded. |
| `matcher.ts` | Up to 3 tools per person, each with its reasons. Reads a partner's neurotype or worries only if the owner shared them. |
| `session.ts` | Observations stop after a hard or power gate. Summaries need both people. Delete your own words alone. |
| `proposals.ts` | Observation to proposal after 3 sessions. Pruning after 180 days. |
| `routes.ts` | Reviewed support routes by locale. Joint sessions only where every person has them. |
| `language.ts` | Lints copy against the handoff's banned words. |
