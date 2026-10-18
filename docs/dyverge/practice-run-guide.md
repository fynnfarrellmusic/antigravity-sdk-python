# Running a practice run

A practice run is how you try dYverge with a friend or partner, on their own device, with no data
bank. This is the one-page way to do it, and what to say to people. Written 17 Oct 2026.

## The idea in one picture

```
Person A's phone ── A checks it, then sends you a file ──┐
                                                          ├──▶  you read both together
Person B's phone ── B checks it, then sends you a file ──┘     (nothing is saved)
```

Nothing is stored anywhere except on each person's own device. There is no server and no account.
The app never sends anyone's notes: a person checks a file and sends it by their own hand.

## Before you start

- **Who.** Adults. Friends first. Partners only if both are clearly keen, neither is under
  pressure, and neither feels unsafe with the other. Never with anyone who is in crisis. (Why:
  finding A21 in `internal-prechecks.md`.)
- **What to give them.** `dyverge.html`, and ask them to open it in their browser's own tab
  (Chrome is the safest). If the first screen says the page can't save anything, they should
  write and share in one sitting, because notes last only until the page is closed.
- **Don't promise what you won't do.** The wording below promises deletion. Edit it to match what
  you will really do.

## What to say (read it out, or send it)

> This is a practice run of an app I'm building. It isn't therapy, and it isn't a test of you or of
> us. It's about how the app worked.
>
> You'll use it for [a few days / one sitting]. When something happens, you can jot a field note:
> what kind of moment it was, whether the app helped, and what you'd change. At the end you choose
> what to share, read exactly what it is, and send it to me. The app can't send it for you, and
> nothing leaves unless you send it.
>
> You don't have to take part, and you can stop any time. Sharing less is fine, and so is sharing
> nothing. Please leave other people's names and details out.
>
> If I use an AI to help read the notes, they go to Anthropic, the company that makes it, for that.
> When we've finished I'll delete what you sent me. If you change your mind after sending, tell me
> and I'll delete it.
>
> If you're having a hard time, or you feel unsafe with anyone, put it down. The Support routes in
> Settings are always there.

## What they do

1. Open dYverge and make their own private space (a name, and a passphrase only they know).
2. **Settings → Practice run.** Add a field note whenever something happens. A note can be one line.
3. At the end: **Choose what to share**. Four short steps: choose, label (not their real name),
   check, share. They can lock the file with a passphrase, which they tell you in person or by
   phone, not in the same message. They send you the file by the share sheet, by copying it, or by
   saving it.

## What you do

1. Collect both files, by whatever route each person chose.
2. **Settings → Practice run → Compare two people's notes.** Paste each one. If a file is locked,
   type the passphrase they gave you.
3. Either **Read them together** (with an AI if it can be reached, otherwise it counts and sets
   them side by side on your device), or **Copy a brief to paste into Claude**, then delete that
   chat once you've kept what you need. The reading is for you. A summary for both of them is
   offered only if both said yes, and it never quotes either of them.

## Afterwards

- Delete the files you were sent, any you saved, and the chat if you used a brief.
- Ask each person, kindly: did you feel free to say no? What almost stopped you sharing? What was
  confusing? What would you change first?
- Keep what you learned in your own words, not their files.

## What the app does to keep this safe

| Promise | How it is kept | Where it is tested |
|---|---|---|
| The app never sends anyone's notes | There is one network call in the whole app, the AI translation. The share screens never call it | `app.test.ts`, and the browser test records every request while notes are written and shared |
| Only what was chosen leaves | `buildPack` copies listed fields one by one. A name, passphrase, profile or anything else on the notebook cannot ride along | `fieldnotes.test.ts` (including 200 odd notebooks) |
| They see exactly what leaves | Step 3 shows the plain text. The file is that text | browser test |
| Names, numbers and links can be taken out | A check for emails, phone numbers, links, postcodes and the names the app knows, with one tap to remove them | `fieldnotes.test.ts` |
| A real name isn't the label | A label that is the person's own name is refused | browser test |
| A file can be locked | PBKDF2 and AES-GCM, the same as the private space. A fresh salt and IV each time | `vault.test.ts` |
| You keep nothing | The compare screen has no storage of any kind, and leaving it drops everything | `app.test.ts`, browser test |
| A serious note stops everything | The safety check reads every word before a note is saved and before anything is read together | unit and browser tests |
| It's research on the app, never a verdict on a relationship | The reading prompt forbids judging, siding, diagnosing and advice about staying together, and refuses on danger | `fieldnotes.test.ts` |
| Never one answer | Fewer than three different suggestions are dropped, and the screen adds that none may fit | `fieldnotes.test.ts` |
| A summary for both needs both | It is asked for, and kept, only if both people agreed | unit and browser tests |

## What it cannot do

- **Take a sent file back.** Once someone has sent it, the app can't. Only you can delete it.
- **Stop a screenshot, or a forward.** It can't control what you or the channel do with a file.
- **Make the channel private.** Messages and email are only as private as the app carrying them.
  A locked file helps, but a short passphrase can be guessed offline by anyone who gets the file.
- **Catch every identifying detail.** It finds common ones. A name it doesn't know can get through,
  so people are asked to read the file themselves.
- **Know whether someone was pressured.** It can't see inside a relationship. This is why friends
  come first, and why nothing is ticked for anyone.
- **Prove consent.** A file says what the person chose in the app. It can't prove they were free to.
- **Keep an AI from being wrong.** The reading is a hypothesis about how the app worked, never a
  finding about two people. Treat it that way.
- **Be anonymous.** A label isn't anonymity. You will probably know who wrote what.

## Stop rules

Stop, and put the app down, if:

- anyone is distressed, or says they feel unsafe, at any point;
- one person seems to be pushing the other to take part or to share;
- either person wants to stop. No reason is needed;
- a note mentions something serious. Check in with them first, before any reading.

## Before partners take part

A clinician should see the protocol first (`review-pack-clinical.md`, questions 23 to 25), and a
solicitor too (`review-pack-legal.md`, questions 20 to 22). Until then, keep to friends who know it
is a trial. The open risks are findings A20 to A25 in `internal-prechecks.md`.
