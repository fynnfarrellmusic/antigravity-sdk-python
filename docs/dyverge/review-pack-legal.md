# dYverge: legal review pack

> **Attached:** `internal-prechecks.md` (Part 1). A first-pass compliance check by Claude, not a lawyer. Please confirm or overturn each requirement and risk, especially L1 to L5.

For a solicitor with UK and EU data protection and health-software experience, and
ideally US state coverage. Questions, not conclusions. Where I mention a law I am
listing it for the reviewer to confirm, not advising on it.

## The product facts that matter

- Mobile-first React app. Data stays on the device. One feature calls the Anthropic
  API (the Compass today; the sit-down facilitator and observation drafting are
  proposed). Each such step is disclosed to the user at that step.
- Users are two adults on one shared device. Founder is UK-based; the product is
  meant to cross borders.
- Data includes: neurodivergence and trauma diagnoses chosen by the user, anxieties,
  relationship details, conversation text and voice notes, and AI-drafted
  descriptions of how a person communicates.
- The app positions itself as not therapy and not a crisis service. The founder
  wants to understand whether it can say more.

## Please advise

**Data protection**
1. Is the profile data special category data (health) under UK GDPR / EU GDPR?
   Relationship content may also touch sex life. What explicit consent, and what
   per-person withdrawal, is needed when two people use one device?
2. A DPIA looks necessary. Is any of this exempt because data is device-local, given
   that conversation text is sent to an API?
3. Anthropic as processor or controller for the API call; UK-US and EU-US transfer
   mechanism; retention and training terms to disclose to users.
4. Voice notes: where is transcription done, and does any of it become biometric data?
5. Right to erasure when one person deletes their own words from a joint session
   (spec section 4 says this needs nobody else's consent).

**Health and AI regulation**
6. Does "assessing each user to select communication tools" bring the product within
   UK or EU medical device rules (intended purpose)? What wording avoids it, and
   what wording would be needed if the founder later wants to claim more?
7. EU AI Act: transparency duties for an AI that talks to people; any prohibition or
   high-risk category the facilitator or profiling might touch.
8. My understanding is that some US states (for example Illinois, Nevada, Utah) have
   recently restricted AI that provides, or presents as providing, mental health
   therapy. Please confirm current law and which states to geo-limit, if any.

**Claims and duty of care**
9. What may the app say about itself ("therapeutically informed", "guided practice")
   without implying treatment? Review the Settings line and any store listing.
10. Duty of care where a user discloses abuse or risk in a session. The app stops and
    shows support routes; is that sufficient, and what must be recorded?
11. Risk that profile data or session records are used against a partner (coercive
    control, family proceedings). Does device-local storage change this, and what
    should the export function include?

**Plural pathways and signposting (added 10 Oct)**
14. The app can point users to kinds of professional help (a doctor, couples support,
    one-to-one therapy, neurodivergence assessment). Does naming these, unranked and
    with "the app does not diagnose", stay clear of providing or recommending treatment?
15. The Compass sends the other person's profile text to the API as well as the user's
    own. What consent and disclosure does that second person need? The Settings line
    currently says only that "the Compass translation" leaves the phone.
16. The safety gates only work in English. What must the app say, or refuse to do, for
    users writing in other languages?

**Languages and the private space (added 10 Oct)**
17. The app now checks text in ten languages and declines others. Gates for nine of them are
    unreviewed drafts. What must it say, and what is the exposure if a draft misses a crisis
    phrase? Does a visible "these checks are new" notice help, or does it create its own risk?
18. Private data is encrypted on the device under a passphrase only its owner knows, and cannot
    be recovered. How does that sit with access and erasure requests, with a person who loses
    their passphrase, and with a court or a partner demanding access?
19. What leaves the private space is Our words and the agreement. Is that the right line for
    "shared communication", and what consent does each person need for a shared item?

**Practice run (added 17 Oct)**
20. A practice run is run by the product owner with friends or partners. I think the household
    exemption does not apply, because it is research on a product, so the owner becomes a
    controller of whatever people send. What lawful basis and what wording of consent do you
    advise, given notes may reveal health or neurodivergence (special category data)?
21. What leaves a person's phone is a file they check and send themselves. The app sends
    nothing. If the person running it pastes the notes into an AI (Anthropic), is Anthropic a
    processor, and what must people be told? The app says so on screen now. Is that enough, and
    what deletion promise can honestly be made once a file has been sent?
22. A combined summary goes back to two people only if both agree, and it is paraphrase only. Is
    there any risk in a summary that draws on both people's data? Is a passphrase-locked file (the
    passphrase told by another route) a sensible minimum for sending by email or text?

**Live link (added 18 Oct)**
23. The live link is an end-to-end encrypted room between two people on two phones, carried by a
    third party's channel (for the trial, the Claude platform's live channel). The product cannot
    read what passes. Does this make the product a "user-to-user service" under the Online Safety
    Act 2023, with duties such as an illegal-content risk assessment? Does it matter that it is
    one-to-one, that nothing is stored, or that it is a trial? (`live-link-design.md`)
24. Does any other UK law on encrypted communications apply to offering a product like this, for
    example the Investigatory Powers Act 2016, or rules on telecommunications providers? I don't
    know, and would rather ask than assume.
25. Accounts and metadata. Today there is no account: a phone holds a key. If accounts are added
    later (to find each other, or restore a lost phone), what changes: controller duties, retention,
    deletion, the data protection assessment? And for a trial on the Claude platform, who is the
    controller of the room's metadata (who met whom, when), and what must people be told? I have not
    checked the platform's or Anthropic's current retention terms.

**Operational**
12. Age: 18+ only. How must that be enforced and recorded?
13. Terms, privacy notice and in-flow disclosures needed per jurisdiction.

## Constraints from the handoff the reviewer should know about

Always-on safety gates. Nothing shared silently. Handoffs only by user action. No
analytics on distress screens, ever. The Compass is currently the only off-device step.
