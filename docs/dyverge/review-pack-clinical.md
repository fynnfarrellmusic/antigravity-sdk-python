# dYverge: clinical review pack

> **Attached:** `internal-prechecks.md` (Part 2). A first-pass review by Claude, not a clinician. Please confirm or overturn each finding, especially C1, C2, and the evidence table (Polyvagal Theory and love languages in particular).

For a clinician experienced in couples work, neurodivergence and trauma.
Purpose: sign-off, or changes, on the sit-down and profile module before any
real couple uses it. Nothing here has been reviewed. Source: `sitdown-and-profiles-spec.md`.

## What the module does, in one paragraph

Two people share one phone. Each checks their own energy first. An AI facilitator
helps them through a conversation: reflecting what happened and what fear was layered
on top, offering reply options, and suggesting communication tools matched to each
person's own profile. Over many sessions it drafts private observations and may
*propose* profile updates to the person they are about. Frame throughout: two
different operating systems meeting (Double Empathy Problem), never one person wrong.

## Please decide

**A. Scope and contraindications**
1. Which presentations make a shared-device session unsafe or inappropriate
   (coercive control, active violence, active substance misuse, others)?
2. What must each person complete *separately* before a joint session is offered?
   A screening module is called for but has not been written. Please specify its
   content, or name an existing validated instrument the app may reference.
3. How should a session end if one person may be guarded or constrained? The
   current design offers either person a private "pause without saying why".

**B. Facilitation**
4. Review the facilitator stance and the draft system prompt (spec section 7).
5. Is "signal / noise" (what happened vs. the fear layered on top, owned as nervous
   system) safe to reflect aloud to a *couple*, or only in a single-person step?
6. Should the facilitator ever name a pattern between two people, or only reflect
   each person's own words?

**C. Profiles and assessment**
7. Review the profile fields and tool catalogue (`dyverge-core/src/matcher.ts`,
   16 tools, each with its rule and plain-language reason). Which tools, rules or
   wordings could harm, mislead, or be used against a partner?
8. The rule "a pattern needs 3 sessions before it is proposed": reasonable? Too low?
9. Proposals reach the owner only, with accept, edit, decline or unsure. Could a
   proposal wording itself act as a label or a self-fulfilling description?
10. Neurotype is only what the person selected. The app never infers it. Confirm
    this is the right line, and review the option list.
11. Worries and what-helps are shared with the partner only if the owner marks them.
    Is opt-in per item the right granularity?

**D. Crisis and handoffs**
12. Review the hard-gate language list and the line "This isn't a tool for this
    moment, and you deserve a person." Add or remove terms.
13. Review the soft-gate (attrition and endurance language) question: "The tool, or
    a person?"
14. Support routes by country for any locale beyond the UK.

**E. Positioning**
15. Where is the honest line between "therapeutically informed" and "therapy" for
    this product, in your professional judgement?

**F. Plural pathways (added 10 Oct)**
16. The app now always offers several kinds of help and never one (spec section 13).
    Is the split into five regulation families (express, move, quiet, shift, choose)
    defensible, or would you group the tools differently?
17. Review the professional list, which ships off: a doctor, relationship support,
    one-to-one support, neurodivergence assessment or support. Is anything missing,
    misleading or in the wrong order? It is deliberately unranked.
18. "Did that help?" only reorders options. Any harm in adapting to it?
19. The Compass is now asked for the likeliest reading plus one other. Is this the right
    way to avoid presenting one explanation as certain?
20. The safety gates are keyword lists. English is the original. Spanish, French, German,
    Portuguese, Italian, Polish, Russian, Arabic and Hindi are **drafts written by Claude**
    (`dyverge-core/src/gates.ts`). Please have a native-speaking clinician review each list for
    gaps and for phrases that fire wrongly. Until then, is it acceptable for the app to run them
    with a notice, or should it decline everything except English (one switch)?
21. The soft gate fires on ordinary frustration as well as despair ("I can't take this anymore").
    One gentle question is the cost. Acceptable?
22. A forgotten passphrase loses a person's private history for good. Is that acceptable for
    this audience, and is the warning wording right?

**G. Practice run (added 17 Oct)**
23. A "practice run" lets two people (friends, or partners) try the app on their own devices,
    write short field notes, and each choose what to send to the person running it, who may
    use an AI to read both together. It is framed as research on the app, never an assessment of
    the relationship (spec section 16). Is that framing safe and honest? What would you add or
    remove to protect people, especially partners, where one may pressure the other to take
    part or to share?
24. The notes are free text and may hold distress or a disclosure. The app stops on hard-gate
    phrases when a note is written and again before the person running it reads anything, and
    shows support routes. The reader is likely a friend, not a clinician. What else should happen
    when a note suggests someone is struggling? Is "check in with them first" the right instruction?
25. Who should not take part (anyone in crisis, anyone who feels unsafe with the other person,
    under 18, others?), and how should that be said before they start? Is the briefing in
    `practice-run-guide.md` enough?

## Out of scope for this review

Visual design, storage, anything to do with the Compass translation itself.
