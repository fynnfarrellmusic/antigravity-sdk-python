# dYverge: internal pre-review (legal and clinical)

Date: 10 Oct 2026. Subject: sit-down and profile module (`sitdown-and-profiles-spec.md`, `dyverge-core/`).

**What this is.** A structured first pass by Claude, using the legal plugin's
compliance-check format and my own reading of the spec and code. It finds
problems early and sharpens the questions for real reviewers.

**What this is not.** Legal advice, clinical advice, or sign-off. Claude is not a
solicitor or a clinician. Laws and evidence below are from my own knowledge, may be
out of date, and are listed for a professional to confirm. Nothing here lets the
restricted modules go to real users. They stay behind the access gate
(`dyverge-core/README.md`) until both reviews are done.

---

## Part 1. Legal: compliance check

### Summary

**Requires further review.** Acceptable to test internally with made-up data behind
the access gate. Not acceptable for real users until the High items are closed.

### Applicable regulations (to confirm)

| Regulation | Why it may apply | Key requirement |
|---|---|---|
| UK GDPR and Data Protection Act 2018 | UK founder; UK users | Health data (neurodivergence, trauma) is special category: needs an Article 9 condition, in practice explicit consent. DPIA likely required. |
| EU GDPR | Intended to cross borders | Same, plus Article 27 representative if no EU establishment. |
| International transfers | Text is sent to a US API provider | Transfer mechanism and a processor agreement with the provider. Check their current terms. |
| UK and EU medical device rules | Software that "assesses" people to select tools | Depends on intended purpose. Wording and claims decide it. |
| EU AI Act | AI that talks to people; profiling | Transparency duty for AI interaction. Check prohibited practices and high-risk lists against the facilitator. |
| US state laws on AI and mental health | Cross-border goal | My understanding is that some states (Illinois, Nevada and Utah, for example) restrict AI presented as providing therapy. Confirm current law and which states to exclude. |
| CCPA / CPRA | California users | Health data is sensitive personal information: notice, limit-use right. |
| Consumer-claims rules (UK ASA/CMA, FTC) | Store listing and in-app wording | Claims like "therapist" or "clinically informed" must be substantiated. |

### Requirements

| # | Requirement | Status | Action |
|---|---|---|---|
| 1 | Explicit consent from **each** person, separately, on a shared device | Not met | Design a per-person consent step before any restricted module. |
| 2 | DPIA | Not met | Commission. The legal pack lists what to cover. |
| 3 | Processor agreement and transfer mechanism for the API | Unknown | Check provider terms, retention and training settings. |
| 4 | Plain statement of what leaves the device, at the step it leaves | Partly met | Compass already discloses. Extend to the facilitator and drafting calls. |
| 5 | Erasure, per person, without the other's consent | Met in logic (`deleteOwnWords`), not wired | Wire to UI and storage. |
| 6 | Data minimisation and retention limit | Partly met | `pruneStaleObservations` (180 days default) built. Reviewer to confirm period. |
| 7 | Age 18+ enforced | Not met | Define the check. |
| 8 | Support routes valid where the user is | Partly met | `jointSessionSupported` blocks unreviewed locales. Needs wiring. UK only today. |
| 9 | Claims about the product reviewed | Not met | Legal pack Q9. |
| 10 | Breach plan (72h to the ICO if applicable) | Unknown | Even device-local apps have API-side exposure. |

### Risk areas

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| L1 | **No privacy between the two users.** The app is local-first on one shared device. Whoever opens it can read the other's profile, worries and observations. | **High** | Per-person encrypted vault, unlocked by that person alone (passphrase or device biometric). Private steps and export sit behind it. Not designed or built yet. |
| L2 | **A vulnerability map.** Triggers, worries and "what helps" are what a controlling partner could use. | **High** | Sharing is explicit and off by default (built for worries and neurotypes). Screening before joint sessions (not built, needs a clinician). Power gate. |
| L3 | **Crisis routes shown to the wrong country.** | **High** | Joint sessions blocked for unreviewed locales (built, needs wiring). Review routes per country before a locale ships. |
| L4 | Special-category data sent to a processor without valid consent or DPIA. | **High** | Items 1 to 3 above. |
| L5 | "Therapist" positioning could make the product a regulated activity or medical device in some places. | Medium to High | Keep the "not therapy" line until reviewed. Reword it as what the product is. |
| L6 | The export function lets a partner take the other's data. | Medium | Export behind the per-person vault. |
| L7 | "Data stays on your device" overstated. Stored data does; sent text does not. | Medium | Never use the phrase without the qualification. |
| L8 | Voice notes: where transcription happens is not specified. | Medium | Decide, then disclose. Check biometric-data rules. |
| L9 | The access gate is client-side. | Low to Medium | Build-time exclusion of restricted modules from production bundles. |

---

## Part 2. Clinical: structure and form (by a non-clinician)

### Summary

**Requires clinical review before any real couple uses it.** The structure is
cautious in the right places (consent to proposals, owner-only profiles, gates,
no diagnosing). Some foundations are weaker than the handoff implies.

### Evidence behind each framework (my reading; a clinician must confirm)

| Framework | How the module uses it | Evidence status, as I understand it | Risk |
|---|---|---|---|
| Double Empathy Problem (Milton, 2012) | Facilitator stance: misunderstanding between two operating systems | A well-regarded theory, with growing empirical support for autistic and non-autistic mismatches. Little research on couples tools built on it. | Low. Say "informed by", never "proven to improve relationships". |
| Polyvagal Theory (Porges) | "Noise" panel: fear "owned as nervous system"; Flooded zone language | Widely used clinically, but its core physiological claims are disputed by many researchers. | **Medium.** Keep it out of user-facing claims. Plain language only. Ask the reviewer if the "nervous system" framing should stay. |
| Spoon Theory (Miserandino, 2003) | Spoon Bank | A metaphor from lived experience, not a validated measure. | Low as a metaphor. Never present spoon counts as measurement or compare partners. |
| Love languages (Chapman) | Love-language tool, profile fields | Weak empirical support. Studies I know of did not find that matching predicts relationship satisfaction. | **Medium.** Treat as the person's own stated preference, not as science. Do not claim it improves outcomes. |
| Battery / zones | Check-In Gate thresholds (30 / 65) | Self-report scale with chosen cut-offs, not validated. | Low. Thresholds are a design choice a clinician should look at. |

### Structural findings

| # | Finding | Severity | Status |
|---|---|---|---|
| C1 | Joint couples work is generally unsafe where there is coercive control or violence. The app cannot detect this from inside a shared session. | **High** | Screening module not built. Needs a clinician. Joint sessions must not be offered without it. |
| C2 | The facilitator will reflect "signal" and "noise", which is an inference about a person's inner state. Stated as fact it can feel presumptuous or wrong, and for people with trauma it can be destabilising. | **High** | Not built. Reflections must be offered tentatively ("Does this fit?") with "unsure" always available. |
| C3 | Private proposal step depends on handing a phone over, and on the other person not looking. | High | Same fix as L1. |
| C4 | Tool wording claimed "You said..." where the person had only selected a neurotype. | Medium | **Fixed.** Test added so no reason text says this. |
| C5 | A partner's neurotype was being used to pick tools for the other person. | Medium | **Fixed.** Neurotype is now only read if its owner shared it. |
| C6 | The 3-session threshold for proposals has no evidence behind it. | Low | Reviewer to set. Stays configurable. |
| C7 | A proposal's wording could work as a label. | Medium | Reviewer to approve proposal templates. |
| C8 | Observations persisted indefinitely. | Medium | **Fixed.** 180-day pruning, configurable. |
| C9 | The matcher cannot recommend a tool to someone who is flooded beyond rest, space and their own sensory reset. | Low | By design. |

---

## Part 3. What reading the real app showed (10 Oct 2026)

The app file (`dyverge-app/dyverge-app.jsx`) arrived after Parts 1 and 2 were written.
Reading it confirmed some findings, changed others, and added new ones.

| # | Finding | Severity | Status |
|---|---|---|---|
| A1 | **Confirms L1.** Everything was plaintext in `localStorage`, with both people's profiles in one object. Anyone who opened the app on that phone could read the other's profile. | **High** | **Fixed for one person (10 Oct).** Private data is now encrypted per person under a passphrase (`vault.ts`); only Our words, the agreement and display settings stay in the open. Still open: a second person's own vault and the role swap when the phone is passed (spec section 15). |
| A2 | **The safety gates were English-only regular expressions.** Someone writing in another language got no hard, soft or power gate, and no warning. | **High** | **Mostly addressed (10 Oct).** Gates now run in English plus nine draft languages, in every language at once, and text in a language with no gates is declined. The nine are my drafts, unreviewed by native speakers or a clinician, so they cover less than English and will miss things. One switch (`GATE_DRAFT_LANGUAGES`) turns them off. See spec section 14. |
| A3 | **The Compass call sent the other person's profile text** (`receiveNote`, `needToHear`, `write`) to the API, as well as the user's own. Settings said only "the Compass translation" leaves the phone. | Medium to High | **Fixed (10 Oct).** The other person is now described to the AI only by what they ticked (lenses and care). Their name, pronouns and written words stay on the phone. Settings says so. A browser test captures the real request and checks it. |
| A4 | **Prompt injection.** In "Something I got" mode the other person's message is pasted into the model prompt. A message containing instructions could steer the reading the user sees. | Medium | **Fixed** with a prompt rule that messages and profiles are data, not instructions, and a test. Not a complete defence. |
| A5 | **Singular approach.** Each Vibe profile mapped to three tools of one family (Cocoon: weight, sound off, lights). Sanctuary showed only those. The Compass gave one explanation of the pattern. | Medium | **Fixed.** See spec section 13. |
| A6 | The handoff describes neurotypes, 1 to 5 love-language ratings and locale in the profile. The app has none of them: it holds `lenses`, `care` and three free-text fields, and no diagnosis. That is the more de-pathologising choice. | Info | The core now follows the app, not the handoff. The earlier neurotype privacy fix is moot: there is nothing to protect. |
| A7 | The partner is demo data ("Jordan"). There is no partner sync, so the two-person flows are untested with a real second person. | Info | Known to you. Noted for the clinical review. |
| A8 | No locale, language, or per-country support routes. Routes are UK only. | High for cross-border | `routes.ts` blocks unreviewed locales in the core. The app does not use it yet, because the app has no locale. |
| A9 | **What the vault does not protect against.** The data is on the phone, so someone with the phone, time and technical skill can attack a short passphrase offline. A person who is made to hand over their passphrase is not protected either. | Medium | Disclosed on the create screen. Key derivation is slow on purpose (PBKDF2, 210,000 rounds) and a longer phrase is advised. Legal and clinical packs ask whether more is needed. |
| A10 | **No recovery.** A forgotten passphrase means the private space is gone. For someone in a hard time, losing their own history is a harm in itself. | Medium | A deliberate trade: any recovery route is also a way in for the other person. Plain warning on the create screen, and an erase-and-restart path. Clinical pack asks if this is acceptable. |
| A11 | **Language detection is a heuristic.** Cyrillic text is treated as Russian, so Bulgarian or Serbian may be read as Russian. Devanagari is treated as Hindi, so Marathi or Nepali may be too. Latin-script detection uses common words and can be wrong on short or mixed text. | Medium | A crisis phrase in any covered language stops the flow whatever language was guessed. Gaps are in what counts as "covered". Native review needed. |
| A12 | **The soft gate fires on ordinary frustration** in every language ("I can't take this heat anymore"). The English baseline already did. | Low | Left as designed: the cost is one gentle question. Clinician to confirm. |
| A13 | **Voice input can send audio to Google or Apple.** The app uses the browser's speech service. Settings said only the translation leaves the phone. | Medium | **Fixed (10 Oct).** A one-time heads-up before the microphone first starts, per person, and Settings now says plainly what leaves. No on-device option yet. |
| A14 | **Fonts load from Google when the app opens**, so a request leaves the phone before any lock screen. It carries no content, but it does show the app is in use. | Low to Medium | Open. Self-hosting the fonts removes it. Your call (decisions.md). |
| A15 | **"Use without saving" still saved shared things** (Our words, the agreement) even though the screen said nothing was kept. | Medium | **Fixed (10 Oct).** In that mode shared things stay in memory too, and a test proves it. Display settings are still kept: they are not what you write. |
| A16 | **What a person publishes is stored in the open** so the other person can read it. It is not protected by the owner's passphrase: anyone who can inspect the phone's storage can read it. Names are in the open too, by design, so the lock screen can show them. | Medium | By design, and now said where it matters: the Share buttons and the lock screen note it. Only an allow-listed set of fields can ever be published. Legal and clinical packs ask whether that is the right line. |
| A17 | **Two people on one phone raises the coercive-control stakes.** A controlling partner could pressure the other to share a profile or spoon level, or to hand over a passphrase. | High | Sharing is always explicit and reversible, and nothing is shared by default. The app cannot detect pressure from inside. This needs the clinician's view on screening and on how the share step is worded. |
| A18 | **The browser can delete the stored data on its own.** Everything lives in the phone browser's storage, and browsers can clear it without the person doing anything. Safari on iPhone is documented to remove a site's stored data after about seven days of Safari use without opening that site, with a partial exemption for sites added to the Home Screen ([WebKit bug 237350](https://bugs.webkit.org/show_bug.cgi?id=237350), read 10 Oct 2026; check current WebKit notes before relying on the detail). "Clear browsing data" removes it too, and a nearly full phone can free it. With no recovery route (A10), a private space and everything in it can disappear with no warning. | Medium | **Open, and not said in the app yet.** Options for you: say it plainly in Settings; ask the browser to keep the data (`navigator.storage.persist()`: best effort, not a promise); suggest adding the app to the Home Screen; later, an export-and-restore file (it would need the same protection as the vault). For the clinician and solicitor to weigh once the wording is chosen. |
| A19 | **Unexplained, rare loss of stored data in automated browser tests.** Under heavy CPU load, a reloaded page in headless Chromium has occasionally opened with no `localStorage` at all, straight after a page that held 12 keys. Logging every `clear` and `removeItem` shows the app removed nothing (only its own probe key, and two keys that did not exist). A bare page with no app code never did it (0 of 352 tries). The app's flow does it rarely: about 1 in 100 on an on-disk profile when run alone, more often with several browsers busy. I could not find the mechanism. | Low to Medium (unknown) | **Open.** The test run now says so when it happens and repeats once. Worth one real-phone check when there is a build to try: use the app, reload straight after a change, and confirm the private space is still there. Related: A18. |
| A20 | **A trial with real people before the reviews.** The practice run lets friends or partners try the app and share notes. Elsewhere these notes say nothing goes to real users before both reviews. | Medium to High | **Mitigated, not resolved.** Everything is opt-in and local, nothing is sent by the app, and there is a written protocol (`practice-run-guide.md`). A solicitor and a clinician should see it before partners take part (pack questions 20 to 25). Until then: friends who know it is a trial. |
| A21 | **Partners in a practice run.** One partner could pressure the other to take part, to share, or to hand over a file or passphrase. The same risk as A17, now with a reason to ask. | High | **Mitigated, not removed.** Each person shares separately and neither sees the other's notes. Nothing is ticked for anyone. A combined summary needs both. The screens say no one should be pushed. The guide says friends first and sets stop rules. The app cannot see pressure from inside: clinical question 23. |
| A22 | **Free-text notes can identify people or hold distress.** A note may name a third person, or disclose something serious. | Medium | **Mitigated.** A label, never a real name. A check for emails, phone numbers, links, postcodes and known names, with one tap to remove them, and a preview of exactly what leaves. The safety check reads every note when it is written and again before anything is read together. It misses names it does not know, and says so. |
| A23 | **The file travels by a channel the app does not control** (a message, email, AirDrop), and can sit in Downloads or on the clipboard. | Medium | **Mitigated, with limits.** An optional passphrase lock (PBKDF2 and AES-GCM, as in the private space) and a way to say the passphrase another way. A short passphrase can be guessed offline by anyone who gets the file. A sent file cannot be taken back. Legal question 22. |
| A24 | **The AI step.** If the person running it uses an AI to read both sets, the notes go to Anthropic, and a pasted brief stays in a chat's history until it is deleted, which is a data bank by habit. | Medium | **Mitigated, not resolved.** The screen says it before the button, and an on-device count works with no AI. Copying a brief warns to delete the chat. Whether people need more telling, and what Anthropic's terms mean for them: legal question 21. |
| A25 | **The reading could be taken as a verdict on a relationship.** Two people's notes, read by an AI, can sound like a ruling. | Medium | **Mitigated.** The prompt makes it research on the app. It forbids judging, siding, diagnosing and advice about staying together, and refuses on danger. The screen says it is not an assessment. Suggestions are three or more kinds, or none. Prompt injection is only partly defended (A4). Treat it as a hypothesis. |

## What to do next

1. Build the per-person vault (L1 and C3). It is the biggest gap, and everything private depends on it.
2. Wire `jointSessionSupported` and `canStartSitdown` into the sit-down entry point.
3. Write facilitator reflections as tentative offers (C2) and add them to the clinical pack.
4. Send both packs, now with this pre-review attached, to professionals.
5. Close the DPIA, consent and processor items before any real user.
