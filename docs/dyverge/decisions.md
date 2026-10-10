# dYverge: decisions so far

One page. What you decided, what it changed, and what is still open. Newest at the top. All of it was written on 10 October 2026, in three rounds.

## Round 3: the eight clicks

| # | You chose | What it did |
|---|---|---|
| 1 | Build the **second person** next | Two people can each have a private space on one phone. See "Two people" below. |
| 2 | Draft-language safety checks **on, with the notice** | No change: already how it ships. One switch (`GATE_DRAFT_LANGUAGES`) turns them off. |
| 3 | The AI gets **tick-boxes only** for the other person | Their name, pronouns and written words no longer leave the phone. Only the lenses and care they ticked do. A test inspects the real network request. |
| 4 | **Notice before voice**, once | A heads-up before the microphone first starts: audio can go to Google or Apple. Settings now says so, and says fonts load from Google. |
| 5 | **Pick your name first** | With two people, the lock screen lists names. Each person types their own passphrase. |
| 6 | Auto-lock **off** | You tap Lock. Pasting from another app keeps working. |
| 7 | **No reviewers yet** | `finding-reviewers.md`: what to look for and what to ask, ready when you are. |
| 8 | **UK only** | Joint sessions stay UK-only until other countries' support routes are reviewed. |

## Two people, one phone (built in round 3)

- **Each person** has their own private space and passphrase. Neither can read the other's.
- **Only the first person can add the second**, from inside their own unlocked space. Nobody can
  add themselves by picking the phone up. A phone holds two people at most.
- **What crosses over** is only what someone chooses to publish, plus Our words and the agreement:
  - a **profile**, when its owner presses "Share with ..." (they can stop, or share an update);
  - a **spoon level**, if its owner switches it on (never what they spent them on);
  - **one signature each** on the agreement. Nobody can sign for the other person;
  - **names**, kept in the open so the lock screen can show them.
- Until the other person has a space, a **labelled example** (Jordan) stands in so the app can
  still be tried. A real person is never shown as an example.
- **Erasing** your space removes what you published and your signature. The other person's
  things and Our words stay.
- **"Clear my things"** clears only yours, never the other person's, and keeps your passphrase.
- **Use without saving** now keeps shared things in memory too. (It didn't before: Our words and
  the agreement were being saved even though the screen said nothing was kept. Fixed.)

## Round 2: languages and private spaces

- **Languages**: not "decline others until covered", but build them now. English is the baseline;
  nine drafts (Spanish, French, German, Portuguese, Italian, Polish, Russian, Arabic, Hindi) with a
  notice at the point of use. Languages with no gates are declined.
- **Private spaces**: a vault per person, and only shared communication crosses over.

## Round 1: the basics

- **Never one approach**: the app always offers several kinds of help, never one, and always a way
  to say none fit. Professional pathways are built but **off** until reviewed.
- **Both reviews wanted**: clinical and legal. Not done yet.
- **Profiles** are communication profiles the owner writes. Not "character" files.
- **Name**: dYverge. No separate couplesTherapY. Where the module lives: TypeScript inside the
  React app, local-first.

## Still open

| What | Next step |
|---|---|
| A clinician and a solicitor to review | Find them (`finding-reviewers.md`). Nothing goes to real users before. |
| Native-speaker clinician review of the nine draft languages | Part of the clinical review. |
| The "not therapy" line (does the app ever say more?) | Decide after both reviews. Stays as is until then. |
| **Fonts** load from Google when the app opens | Self-host them so nothing leaves the phone at open. Your call. |
| **Safety stop** has no "call your local emergency number" line (the language screen does) | Small, protective. Say yes and I'll add it. |
| **The browser can clear stored data on its own** (Safari after about a week of not opening the site, "clear browsing data", a full phone). With no recovery, a private space could vanish with no warning | Say so in plain words in Settings, ask the browser to keep the data, suggest the Home Screen. Your call (finding A18). |
| **A rare, unexplained loss of stored data** seen in automated browser tests under heavy load (not caused by the app removing anything; not reproduced with a bare page) | One real-phone check once there is a build to try (finding A19). |
| Voice has no on-device option | Revisit when a browser offers one. |
| Translating between languages (the Compass still writes in English) | A later build. |
| The sit-down facilitator, observation drafting, profile proposals | Built as rules and tests only; locked until reviewed. |
