# Finding your reviewers: what to look for, what to ask

You said you don't have a clinician or a solicitor yet (10 Oct 2026). This is ready for when
you do. Nothing here is urgent: the restricted modules stay locked, and the app is safe to test
with made-up details in the meantime.

## The short version

- You need **two** people for the app as it stands: a clinician, and a solicitor. Different jobs, so one
  can't do both. For the live link there is a **third**: a security reviewer (section 3).
- Each is a **bounded job**: a few hours of review, not a long relationship.
- You send a pack, they answer numbered questions in writing, and give a verdict per module.
- Nothing goes to real users until both have said yes, or told you what to change.
  Real words never go over the live link until the security reviewer has said yes too.

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

## 3. The security reviewer (for the live link)

New cryptography, even built from standard parts, needs someone independent to read it before it
protects anyone real. This is a different skill from the other two.

**Look for**
- Published experience **reviewing cryptographic protocols or secure messaging**, not only
  penetration testing. Ask which protocols they have reviewed and what they found.
- Comfort with the **Web Crypto API** and with **browser-delivered encryption**, including its
  built-in weakness: whoever publishes the page can change the code (finding A27).
- Willingness to write a **short report you can show a solicitor**: what they checked, what they
  did not, and what they would change.

**Red flags**
- Wants to swap the standard parts for something of their own.
- "It's AES, so it's fine," without looking at how the parts are put together.
- Won't commit to a written scope and fee.

**Where to look**: NCSC-assured consultancies (CHECK and CREST member firms) that do protocol and
code review; university security and cryptography groups, some of which take a small review as a
research collaboration; independent cryptographers known to the open-source security community.

**What to ask them to check**
- Is the way the parts are put together sound? Are the labels, the transcript and the key schedule
  complete and unambiguous?
- Is every failure handled safely? Can a relay, or the other person, make a phone believe something
  false, learn the terms, or keep keys longer than promised?
- Is anything in `live-link-design.md` not what the code does?
- What is missing before real people use it?

**What to send**: `dyverge-core/src/livelink.ts`, `dyverge-core/test/livelink.test.ts`,
`docs/dyverge/live-link-design.md` (it has an exact protocol reference), and the output of
`npm run mutate:livelink`. The scope is small: a couple of days is a fair guess for a spike this
size, but let them tell you.

## 4. What to send

From `docs/dyverge/`:
- `review-pack-clinical.md` or `review-pack-legal.md` (28 and 25 questions)
- `internal-prechecks.md` (my first-pass findings, for them to confirm or overturn)
- `sitdown-and-profiles-spec.md` (the design, with the rules and the open decisions)
- `practice-run-guide.md` (how a trial with friends or partners would run, and what people are told)
- `live-link-design.md` (the encrypted room for two phones: what it promises, what it cannot do, and
  the questions for each reviewer)

Plus screenshots or a short screen recording of the app. **Never real couples' data.** Use made-up
details only. The restricted modules open in an internal-test build for exactly this.

## 5. The ask (adapt this)

> Hello [name]. I'm building dYverge, a communication app for couples who communicate
> differently (including neurodivergent people). Before anyone real uses it, I'd like an
> independent [clinical / legal] review.
>
> **Scope**: written answers to a numbered list of [28 / 25] questions, and a verdict
> (approve, approve with changes, or don't ship) for each of four modules that are currently
> locked. **Time**: I'd expect about [2 to 3] hours. **Materials**: a pack I'll send, plus
> screenshots. **Please send me**: your fee for that scope, your availability, and whether you
> need an NDA.
>
> The app doesn't diagnose or treat, and the first version is UK only.

## 6. A few questions to ask them before you hire

**Clinician**
1. Have you worked with neurodivergent couples? What did you learn about communication across
   neurotypes?
2. How would you handle a disclosure of abuse or suicidal thinking inside a shared session?
3. Where's your line between a skills tool and therapy?

**Solicitor**
1. Have you advised on special category health data for a consumer app?
2. When does software that helps people communicate become a regulated medical device?
3. What do you need from me to scope a DPIA?

**Security reviewer**
1. Which protocols or messaging systems have you reviewed, and what did you find?
2. How do you treat a page that delivers its own encryption? What would you want to see about who
   can change it?
3. What will your report say you did not check?

## 7. A good outcome looks like

- For each of the four restricted modules (sit-down facilitator, observation drafting, profile
  proposals, safety screening) plus professional pathways: approve, approve with changes, or
  don't ship, with reasons.
- A list of changes, and the places the product can and can't go (jurisdictions).
- Then I update the app and the spec, and the flags change from locked to open **only** for what
  they signed off.
- For the live link: a short written report from the security reviewer. What they checked, what they
  found, what must change before real words, and what they did not look at.
