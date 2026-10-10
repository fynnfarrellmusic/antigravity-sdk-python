# Finding your reviewers: what to look for, what to ask

You said you don't have a clinician or a solicitor yet (10 Oct 2026). This is ready for when
you do. Nothing here is urgent: the restricted modules stay locked, and the app is safe to test
with made-up details in the meantime.

## The short version

- You need **two** people. A clinician, and a solicitor. Different jobs, so one can't do both.
- Each is a **bounded job**: a few hours of review, not a long relationship.
- You send a pack, they answer numbered questions in writing, and give a verdict per module.
- Nothing goes to real users until both have said yes, or told you what to change.

## 1. The clinician

**Look for**
- Registered or accredited with a UK professional body. For example the HCPC (practitioner
  psychologists), or BACP or UKCP accreditation (counsellors and psychotherapists).
- Real experience with **neurodivergent adults** (autism, ADHD) and with **couples or
  relationship work**.
- Trauma-informed practice, and comfort with **risk**: suicidal thinking, and coercive control
  in relationships. The app's safety gates rest on this.
- A **neurodiversity-affirming** stance. dYverge treats a clash as two operating systems, not
  one broken person. A reviewer who wants to "correct" the user will fight the whole design.
- Willingness to **consult on a product**. Plenty of good therapists do therapy only.

**Nice to have**
- Has evaluated digital mental health tools. Ask whether the NHS clinical safety standards
  (DCB0129 and DCB0160) would apply if you ever sold into the NHS.

**Red flags**
- Wants the app to diagnose or treat. It doesn't, by design.
- Insists on one therapy or technique as the answer. The app's rule is that it never assumes
  one approach will work.
- Won't look at the safety gates or the crisis wording.

**Where to look**: neurodiversity-affirming practitioner directories; university psychology and
counselling departments (some like research partnerships); autism and ADHD charities; NHS
psychological services staff who do outside consulting. Ask for a **fixed scope and fee up
front**. Some academics and charities will work at a reduced rate for a research partnership.

## 2. The solicitor

**Look for**
- Regulated by the SRA in England and Wales (or the equivalent in Scotland or Northern Ireland).
- **Data protection** experience: UK GDPR and the Data Protection Act 2018, especially
  **special category data** (health) and DPIAs.
- **Digital health or health-tech** experience: when software counts as a medical device
  (MHRA), and what you can say about it without crossing the line.
- Online services and consumer claims. Ideally international (EU and US), or able to bring in
  local counsel, because you intend to cross borders.

**Red flags**
- General small-business lawyer with no data protection or health-tech work.
- Won't give a written scope and fee.

**Where to look**: law firms with a digital health or health-tech practice; the Law Society's
"Find a Solicitor"; the ICO's free guidance as a starting point; and many universities and some
firms run start-up or social-enterprise legal clinics, so ask. A DPO-as-a-service can help with
the DPIA.

## 3. What to send

From `docs/dyverge/`:
- `review-pack-clinical.md` or `review-pack-legal.md` (22 and 19 questions)
- `internal-prechecks.md` (my first-pass findings, for them to confirm or overturn)
- `sitdown-and-profiles-spec.md` (the design, with the rules and the open decisions)

Plus screenshots or a short screen recording of the app. **Never real couples' data.** Use made-up
details only. The restricted modules open in an internal-test build for exactly this.

## 4. The ask (adapt this)

> Hello [name]. I'm building dYverge, a communication app for couples who communicate
> differently (including neurodivergent people). Before anyone real uses it, I'd like an
> independent [clinical / legal] review.
>
> **Scope**: written answers to a numbered list of [22 / 19] questions, and a verdict
> (approve, approve with changes, or don't ship) for each of four modules that are currently
> locked. **Time**: I'd expect about [2 to 3] hours. **Materials**: a pack I'll send, plus
> screenshots. **Please send me**: your fee for that scope, your availability, and whether you
> need an NDA.
>
> The app doesn't diagnose or treat, and the first version is UK only.

## 5. A few questions to ask them before you hire

**Clinician**
1. Have you worked with neurodivergent couples? What did you learn about communication across
   neurotypes?
2. How would you handle a disclosure of abuse or suicidal thinking inside a shared session?
3. Where's your line between a skills tool and therapy?

**Solicitor**
1. Have you advised on special category health data for a consumer app?
2. When does software that helps people communicate become a regulated medical device?
3. What do you need from me to scope a DPIA?

## 6. A good outcome looks like

- For each of the four restricted modules (sit-down facilitator, observation drafting, profile
  proposals, safety screening) plus professional pathways: approve, approve with changes, or
  don't ship, with reasons.
- A list of changes, and the places the product can and can't go (jurisdictions).
- Then I update the app and the spec, and the flags change from locked to open **only** for what
  they signed off.
