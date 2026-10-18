# dYverge: decisions so far

One page. What you decided, what it changed, and what is still open. Newest at the top. Written between 10 and 18 October 2026, in five rounds.

## Round 5: the live link (18 October)

You asked for two phones using a live link, where only the two people in the room at that moment can
read it, with logins so the app can grow, nothing sent unencrypted, as little pulled from the internet
as possible, and consent first. You said to be wild, and that if it couldn't be trustworthy you'd
rather wait. I took "wait" seriously: nothing here is in the app, and nothing here is for real words.

| What I decided | Why |
|---|---|
| **Invent the design, not the cipher.** Every primitive is the browser's own (P-256, HKDF, HMAC, AES-GCM). The new part is how they are put together for consent | A home-made cipher is how secure apps get broken. The wild part is that consent is built into the keys |
| **The invite is a key, the knock carries the terms, and the terms are part of the keys.** Change them anywhere and nothing opens | A nervous person can see exactly what they are agreeing to, and nobody can quietly change it |
| **A "no" sends nothing, and a quiet exit looks like a lost connection** | For a person who feels pushed. A refusal that leaves a mark is a way to be punished for refusing |
| **Nothing flows until both people have checked the same five words** (or saved each other once) | A person in the middle gets caught by people, not by trust |
| **A room lives only while both are here.** Quiet "still here" messages; keys wiped when it ends or goes quiet | "Only the two logged in at that time" is true in the keys, not just the screen |
| **A login is a key on your device** (unlocking your private space unlocks it). No account | You want logins and also no data bank. A key gives the first without the second. Accounts are a separate, later decision |
| **It is a spike.** It has 75 tests, including a hostile relay, a forger, and a check that breaks it 29 ways. It is not in the app | The tests show it does what it says. They can't show it is sound. Only an independent expert can |
| **A lab page to try it on two devices**, with made-up words only | You said it needs to be explored in real time. It shows the relay's view (all ciphertext), lets you damage your own messages to see them refused, and copies a report of numbers, never words, for you to paste back to me |
| **The AI call is not part of the link.** On the hosted route it runs on each person's own device and Claude account | You chose "their own Claude account". Nothing of yours is in the path |

Where it is written down: `live-link-design.md` (what it promises, who it is built against, what it
cannot do, and an exact protocol reference). New findings A26 to A34, legal questions 23 to 25,
clinical questions 26 to 28, and a third reviewer (security) in `finding-reviewers.md`.

**The thing I want you to hear:** encryption inside a web page can't protect people from whoever
publishes the page. For a nervous friend, that is you. What helps is being able to show them: a
fingerprint of the code in the page, a frozen build that has been looked at, a technical friend who
can check. That is finding A27, and it needs your decision more than any cryptography does.

## Round 4: the practice run (17 October)

You asked for a way to try dYverge with a friend or partner, on their own device, with nothing
stored in a data bank, and the analysis made from what each person chooses to share.

| What I decided | Why |
|---|---|
| **A file the person checks and sends themselves.** No server, no account, no shared chat | It is the only route that is local-first, consent-first and has no data bank. A shared Claude project doesn't carry what is in each person's browser, and a shared chat keeps its history |
| **The app never sends the notes.** One network call in the whole app, and the share screens don't make it | So "nothing leaves unless you send it" is something the tests check, not only something we say |
| **Notes are private by default**, in each person's own space | Same rule as everything else: a new kind of data is locked until someone decides otherwise |
| **The reading is for the person running it.** A summary for both comes back only if both ticked yes, and never quotes anyone | Reassurance for both people. Neither can be talked about without having agreed |
| **It is research on the app, never an assessment of the relationship** | Otherwise it becomes an unreviewed relationship verdict, and a tool for "the AI says it's you" |
| **A passphrase lock is optional**, and a serious note stops everything | For email or text, and for the same care the rest of the app takes |
| **On for trial builds** (`PRACTICE_RUN`) | You want to run it now. Switch it off for anything wider |

What isn't possible without a server, and was left out on purpose: live two-way sync between two
phones, and a "send it to me" inbox that expires on its own. Both are a data bank by another name.

**Please do this first:** friends who know it's a trial, not partners, until a clinician and a
solicitor have seen `practice-run-guide.md`.

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
| **A practice run with real people** | Friends first. A clinician and a solicitor to see `practice-run-guide.md` before partners take part (pack questions 20 to 25, findings A20 to A25). |
| **How much a practice-run file promises about deletion** | Only promise what you'll really do. The wording in the guide is a draft for you to edit. |
| **Which route to explore for the live link** | The platform's live channel, using the lab with two of your own devices (`live-link-design.md`). |
| **Accounts** (logins that live somewhere, to find each other or restore a phone) | None for now. Three options are set out in the design note; decide after the lab and the reviews (A33). |
| **Who can change the page** (A27) | Show a code fingerprint in the page, keep a frozen reviewed build for trials, say the fingerprint beforehand. Your call. |
| **A security reviewer** | Needed before real words go over the live link (`finding-reviewers.md`, section 3). |
| **Fonts, again** | You said to minimise what the app pulls from the internet. Self-hosting the fonts is the obvious first step, and a strict no-network lock for an offline build would let the file prove it. Say yes and I'll do both. |
| Voice has no on-device option | Revisit when a browser offers one. |
| Translating between languages (the Compass still writes in English) | A later build. |
| The sit-down facilitator, observation drafting, profile proposals | Built as rules and tests only; locked until reviewed. |
