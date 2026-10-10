# dYverge: internal pre-review (legal and clinical)

Date: 11 Oct 2026. Subject: sit-down and profile module (`sitdown-and-profiles-spec.md`, `dyverge-core/`).

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

## What to do next

1. Build the per-person vault (L1 and C3). It is the biggest gap, and everything private depends on it.
2. Wire `jointSessionSupported` and `canStartSitdown` into the sit-down entry point.
3. Write facilitator reflections as tentative offers (C2) and add them to the clinical pack.
4. Send both packs, now with this pre-review attached, to professionals.
5. Close the DPIA, consent and processor items before any real user.
