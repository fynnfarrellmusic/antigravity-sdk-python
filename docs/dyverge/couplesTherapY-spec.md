# couplesTherapY: module spec (draft 1)

Status: draft for Fynn's decision. Built from the dYverge Handoff (10 Oct 2026).
Nothing here is built yet. Section 8 lists the calls that are yours to make.

## 1. What it is

A guided, interactive conversation for two people, with an AI facilitator that
runs the sit-down, and a slow-building picture of how each person tends to
communicate, built from many sessions over time.

It extends the Compass. The Compass translates one message. This module
facilitates a whole conversation, and remembers across conversations.

## 2. The rules it inherits (and where the request collides with them)

| Handoff rule | What it means for this module |
|---|---|
| "dYverge is not therapy, not a crisis service" (persistent Settings line) | The name couplesTherapY promises therapy. Needs a decision (section 8, Q1). Until then it is a guided practice space, never therapy. |
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

## 8. Decisions that are yours

1. **The name.** The handoff says dYverge is "not therapy" in a line that can't
   be hidden. couplesTherapY promises therapy. Options: keep the name and make it
   a clearly separate product with its own disclaimers (suite naming allows it:
   settlYl, rYse), or keep the module inside dYverge with a plainer in-app name.
   *Recommend the second.*
2. **Where it lives.** dYverge is a React app, not in this repo. This repo is a
   Python SDK. I'd build it as TypeScript inside the React app. The SDK is only
   useful if you add a backend, which would break local-first.
3. **One device or two.** *Recommend one device first.*
4. **Safety screening content.** Needs a clinician and a lawyer.
5. **Profile proposals vs "character profiles".** I've reframed to proposals the
   owner decides on. Confirm that's the intention.

## 9. Build order

1. Data model and local storage, plus export and delete.
2. Gate runner, shared with the Compass, on every turn.
3. Sit-down room (one device), no long-term layer.
4. Observation drafting, then the private proposal screen.
5. Timeline of "what shifted" in the Us screen.
6. Two-device sync (depends on the open Partner-sync question).
