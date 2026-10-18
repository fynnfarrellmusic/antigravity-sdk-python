# The live link: an encrypted room for two people on two phones

Written 18 Oct 2026. **Status: a spike. It has tests, it is not in the app yet, nobody independent has
reviewed it, and it must not carry real people's words until someone has.**

The code is `dyverge-core/src/livelink.ts`. The tests are `dyverge-core/test/livelink.test.ts`. A page to
try it on two devices is `dyverge-core/lab/` (see "The lab", below).

## What you asked for

In your words, on 18 October:

- Two phones, using a live link.
- "Only the two parties logged in at that time can access the live link content."
- Logins for people, so it "can grow, learn and help people develop their relationships".
- Consent first. "Minimise the platform's need to pull from the internet." "Never send data
  unencrypted."
- "Let's be wild and invent new code and tech."
- Behind all of it: a nervous person should not have to lean on implicit trust. Not in the other
  person, not in you, not in a server. If it can't be that yet, wait.

## What was built

A **room** for exactly two people. It is a small machine that turns strings into strings. It never
opens a connection, never touches storage, and never uses any randomness except the browser's crypto
(a test checks this by reading the source). A transport, which is anything that can carry a short
string between two phones, is a small adapter on the outside.

It is wild in how the parts are put together for consent. It is deliberately **not** wild in the
maths: a home-made cipher is how secure apps get broken. Every primitive is the browser's own:
ECDH and ECDSA on P-256, HKDF, HMAC, AES-GCM, all with SHA-256.

## The idea in one picture

```
  Person A (knocks)                                   Person B (listens)
  -----------------                                   ------------------
  makes a one-time invite  ------ by hand ------>     types or scans the code
  (128 random bits)        (read out, scanned,
                            or sent by whatever
                            they already trust)

  KNOCK  (locked with the invite)  ------------>      reads the TERMS: what may cross,
  holds the terms                                     for how long, and why
                                                      B says yes   (or says no, and sends nothing)
         <---------------  OPEN    (fresh keys; B proves who B is)
  A checks B, only then:
  CONFIRM (A proves who A is)      ------------>      B checks A

  Both phones now show the same FIVE WORDS.
  Each person says "these match"   (or "they don't", which seals the room)

  READY  <------------------------------------>       READY
  Now, and only now, the room is LIVE.

  words, cards ... one key per message, used once, padded to a fixed size
  "still here" every few seconds
  Either person can narrow the terms, never widen them. Either can seal it, or leave quietly.
  If one goes quiet, or the agreed time ends, both sides wipe their keys.
```

## What is different about it

1. **The invite is a key.** It names the room, so the room cannot be guessed, and it locks the knock.
   Someone without it cannot read the terms or give an answer that is believed.
2. **The knock carries the terms, and the terms are part of the keys.** The other person reads what
   may cross, for how long and why, before anything is made. The terms are hashed into the
   handshake, so changing them anywhere along the way means the two phones get different keys and
   nothing opens. (Tested by changing them.)
3. **A "no" leaves no trace.** The listener has made no keys until they say yes, and saying no sends
   nothing at all. To the person who knocked it looks the same as the other person not being there.
   This is for a person who feels pushed.
4. **Nothing flows until both people have checked.** Both phones show the same five easy words from
   the handshake. If a stranger sat in the middle, each person would be shown different words. A
   person you have already trusted (a saved fingerprint) skips the words, and a changed key seals
   the room.
5. **A room lives only while both are here.** One key per message, used once and then gone. If either
   person goes quiet, or the agreed time runs out, both phones wipe their keys. Nothing is written
   down, so there is no record to find afterwards.
6. **A quiet way out.** Leaving without a word sends nothing, and looks like a lost connection.
7. **Lengths are hidden.** A "yes" and a paragraph look the same on the wire.
8. **The relay can only delay or go quiet.** A frame that is dropped, repeated, reordered, altered,
   forged or cut short is never believed, and never moves the keys on.

## What it promises, and where each promise is tested

| Promise | How it is kept | Tested by (in `livelink.test.ts`) |
|---|---|---|
| Someone without the invite can't read the terms, and the knocker's identity isn't in the knock at all | The knock is locked with a key made from the invite; identities travel only inside the handshake | "keeps the terms from anyone without the invite", "lets an eavesdropper who lacks the invite neither read nor join" |
| Saying no leaves no trace; no keys exist before yes | `decline()` sends nothing; the listener's keys are made in `accept()` | "says nothing at all when the answer is no", "makes no keys of its own until the person agrees" |
| The terms can't be changed between the two people | The terms' hash is part of the transcript the keys come from | "breaks the handshake if the terms are changed between the two people" |
| Each side proves who it is, and a borrowed key fails | A signature over the transcript, and a MAC that binds the key to the session | Six tests where a copy of the handshake written from this note plays the other side |
| The knocker shows its own key only after the listener has proved theirs | The order of the messages | "seals, and reveals nothing, if a trusted contact turns out to be someone else" |
| A changed trusted contact seals the room | The fingerprint is compared before anything is revealed | The two pinned-contact tests |
| Nothing flows until both have checked | A "ready" from each side is needed before `send` works | "lets nothing through until both people have checked", "seals both sides if the words are different" |
| A person in the middle is seen | Their two handshakes get different keys, so the words differ | "shows each person different words if the invite leaked..." |
| The relay can't read, alter, repeat, reorder or forge | AES-GCM on every frame, a one-way chain, a bounded window | The "relay that attacks" group: every byte altered, every cut length, repeats, reordering, loss, 300 forged frames, junk, mutated handshakes |
| The past stays safe if a phone is taken later | A one-way chain: each message key is used once and thrown away | "keeps what was said before safe from someone who gets the phone afterwards" (uses a second, independent copy of the key schedule) |
| Keys are wiped when the room ends | Zeroing on close | "wipes its keys when the room is sealed" and the sealing tests |
| A room ends when it goes quiet or at the agreed time | Timers, driven by `tick()` | The closing-the-room group |
| Lengths are hidden | Padding to fixed sizes | "hides length", "makes every frame different" |
| Only agreed kinds cross, and a room can only be narrowed | Checked on both phones; narrowing keeps what both have kept | "only sends kinds that were agreed, on both sides of the wire", "can agree to less during the room, never to more", "settles on the smaller set when both narrow at the same moment" |
| The module can't touch the network, storage or the page | It has no imports and uses only the browser's crypto | "never touches the network, storage, the page, or a weak random source" |
| The test hooks can't leak into the app | They exist only when asked for | "keeps its test hooks out of the app and out of ordinary links" |

**Do the tests notice when the code is wrong?** `npm run mutate:livelink` breaks the module in 29
specific ways, one at a time (a signature check removed, a key not wiped, a limit dropped, the terms
left out of the keys...) and checks that the tests fail each time. Today: 27 are caught and 2 are
"equivalent", meaning removing them changes nothing anyone can see (the words also commit to both
identities, which the signatures already guarantee; and an explicit invalid-point check repeats what
the browser refuses anyway). The first run of this check found five real gaps in the tests, which
are now closed.

## Who it is built against

| Who | What they can do | What stops them | What doesn't stop them |
|---|---|---|---|
| **The relay** (the platform, a server, a network) | Watch, delay, drop, repeat, reorder, alter, forge | Everything above | They still see **that** two devices talked, **when**, for how long, roughly how often, the size bucket of each frame, and roughly how long the knock's terms are (finding A28) |
| **Someone else in the same room** | Everything the relay can, plus guess a room name | The room name comes from the invite, and without the invite they can't read the terms or be believed | They can make noise |
| **Someone who gets the invite** (it leaked) | Knock, or answer first | The five words differ for the two real people; a saved fingerprint seals it; the invite works once | A rushed person who waves the words through (A29) |
| **The other person** | Ask, pressure, watch the screen | Nothing crosses that wasn't agreed and said; a refusal and a quiet exit leave no trace | Pressure in the room. The app can't see it (A32) |
| **A phone taken during a room** | Read the rest of that room | What was said before is safe | The rest of that room (A31) |
| **Whoever runs the trial, or publishes the page** | Change the code the page runs | Only transparency, not encryption (A27) | This is the one that is you. See below |
| **The AI provider** | Read what the sender chose to send it | The link doesn't carry the AI call; it happens on the sender's own device | The model has to read plain text to do its job |

## What it cannot do

These are also entered as findings in `internal-prechecks.md` (A26 to A34).

- **It is not reviewed.** New cryptography, even built from standard parts, needs an independent
  expert before it protects anyone real (A26).
- **It can't stop whoever publishes the page from changing the page.** Encryption inside a page can't
  protect against the page. For a nervous friend that person is you, and behind you the platform
  that serves it. What helps is transparency: the page shows a fingerprint of the code it is running;
  a build that has been looked at is frozen and its fingerprint is told to people in advance; a
  technical friend can check. (A strict no-network lock for an offline build is on the list. It is
  not built yet.) (A27)
- **A relay still sees metadata** (A28).
- **A leaked invite is only as safe as the five words**, which people can wave through (A29).
- **Delivery isn't guaranteed.** A lost message is not sent again. The screen can show how many are
  missing (`stats()`); a "got it" layer can come later. A lost "ready" and the handshake frames are
  sent again (A30).
- **A phone taken mid-room shows the rest of that room**, but not what came before. There is no
  healing inside one room, and rooms are short on purpose (A31).
- **It can't see pressure.** A quiet decline and a quiet exit protect someone who feels pushed. They
  also change what the other person sees, which a clinician should weigh (A32).
- **JavaScript can't promise to erase memory.** It zeroes and drops what it holds. The words on the
  screen, a screenshot, or a keyboard that remembers are outside it.
- **"Never unencrypted"**: every frame is encrypted by the room, and the platform's channel is
  encrypted too. The one deliberate exception is the AI call: a model has to read plain text. It goes
  from the sender's own device, to Anthropic, over an encrypted connection, and it's the sender's
  click that sends it.

## Logins, without a data bank

You want logins so people can "grow, learn and help people develop their relationships". Two
different things hide in that, and they have very different costs.

**A login that is a key (built).** Each phone has a device key. It lives inside the person's private
space (under the key name `linkIdentity`, which the vault already treats as private by default).
Unlocking the private space is logging in to your own key. "Logged in at that time" means: both are in
the room together, each proven by their key, each having said ready. When either leaves, the keys are
wiped. No server holds anything.

**Growing and learning (on the device).** A person's profile and what the app learns about how they
like to communicate can keep developing inside their own encrypted space. That needs no account and
no server.

**An account that lives somewhere (not decided).** Finding each other, or getting your things back on
a new phone, needs a place that holds at least public keys, and probably encrypted backups. That is a
store of who knows whom, even if every blob in it is unreadable. It brings real duties (a controller,
a data protection assessment, retention, deletion), and it is the thing "no data bank" was meant to
avoid. Options:

1. **No account.** Keys only. A lost phone means a new key, and people re-pair. Simplest and safest.
2. **The platform's own sign-in as the account.** For the hosted trial, the platform already knows who
   is signed in, and has a per-person private area. The app would put only encrypted blobs there. No
   server of ours, but you rely on the platform's terms, and people need an account there.
3. **Our own accounts.** Most control, most responsibility. Not before the reviews.

My suggestion: 1 for now, 2 if you want to explore restore and finding each other in the hosted
trial, and decide 3 only after the solicitor has seen this note.

## Where the words travel

The room doesn't care how a string gets across. The adapter does four things: send each string in
`step.out` on the channel named by `link.room`; pass every string it hears to `link.receive`;
call `link.tick()` about once a second; and drop the transport's echoes of its own messages. Frames
are 4000 characters at most.

| Route | What it is | For | Against |
|---|---|---|---|
| **The Claude platform's live channel** (what the lab uses) | A private page on Claude's platform. Its `room` capability carries short messages between people who have the page open and are signed in. It is live only: nothing is stored. | No server of ours, no keys to look after, sign-in comes with it, and the AI call can run on each person's own Claude account | Both people need access to the platform. It can drop messages. The platform sees metadata. The platform's notes say a room name is not secret, so only the encryption keeps one pair apart. How a guest is treated is for the lab to find out |
| **Phone to phone (WebRTC)**, paired by a code or QR | A direct data channel | Nothing in the middle sees even metadata | The platform's page rules say WebRTC does not run inside a page, so it would have to be a file outside the platform. Each phone's network address is shown to the other. It can fail on mobile networks without a relay, which brings a server back. Pairing by hand is clumsy |
| **A blind relay of our own** | A tiny server that forwards strings | Works for anyone, no account | Hosting, cost, abuse, a privacy notice, a processor. Everything you wanted to avoid, in a smaller box |

The lab is for finding out which of these feels right in practice.

## The AI and the live link

The link carries only what a person chose to send. The AI call isn't part of it. On the hosted route
the call runs on **each person's own device and own Claude account**, after that person's own
consent prompt, and sees only that person's text plus the other person's tick-boxes (the rule the app
already has). What comes back is shown to its owner first. Only what they approve is put into the room.
Things I don't know yet, and will say before anyone relies on them: whether the person who published
the page can see what a viewer sends to Claude, and what a viewer's account keeps. The lab has a
button that shows what a guest can and can't do.

## How to check the work

```sh
cd dyverge-core
npm test                  # all the tests, including the live link ones
npm run typecheck
npm run mutate:livelink   # breaks the module 29 ways; about two minutes
```

## The lab

`dyverge-core/lab/` is a single page for trying the room on two devices. It imports the real
`livelink.ts`, so what it runs is what the tests cover, and it isn't minified, so someone technical
can read exactly what runs. It asks the platform for two abilities only (the live channel, and a
question to Claude on the viewer's own account when a button is pressed) and has no database, files
or other access.

You make a door on one device and give the code to the other. The other device sees the terms before
anything opens, then both show the same five words. Under the room there is:

- **What the relay carries**: a paper tape of every frame the platform sees. It is all strings it
  cannot read.
- **Try to break it**: damages your own next message on its way out (change a character, send it
  twice, lose it, send junk). The other device should refuse what is wrong, say so, and carry on.
- **A card and "Soften with Claude"**: the product's rule in miniature. A card is three tick-boxes
  about how you like to receive messages. Claude, on the other person's side, is shown your tick-boxes
  and their own draft, never your words, and what it suggests is shown to them first. Nothing crosses
  until they press send.
- **Time a round trip**, **Pause everything**, **Seal the room**, **Leave quietly**, and a
  **patience** setting (how long to wait for a quiet partner), which is how you find out how much your
  phone lets a page do in the background.
- **Tell me how it went**: copies a short report of numbers and timings, never any words. Paste it
  into the chat with Claude.

```sh
cd dyverge-core
npm run build:lab    # writes lab/dist/live-link-lab.html (not committed)
npm run smoke:lab    # two real browser pages and a stand-in for the platform's live channel
```

The browser test records everything the stand-in relay was handed, to check it only ever sees
ciphertext, and makes the relay misbehave. It can't prove the real platform behaves the same. That is
what opening the lab on two devices is for.

## Before real people use it

1. **An independent cryptographic review** of `livelink.ts` and this note (`finding-reviewers.md`,
   section 3). What to ask: is the composition sound, are the labels and the transcript complete, is
   the handling of failure safe, and is anything here not what it claims.
2. **A plan for who can change the page** (A27): a fingerprint shown in the page, a frozen reviewed
   build, and what people are told.
3. **A privacy notice that is true**: what the platform sees, what the AI sees, and Anthropic's and the
   platform's current retention terms, which I have not checked and which change.
4. **The solicitor's answers** to legal questions 23 to 25: whether a product like this is a
   user-to-user service under the Online Safety Act, whether any law on encrypted communications
   applies, and what changes if accounts are added.
5. **The clinician's answers** to clinical questions 26 to 28: live help across a distance in the
   middle of a conflict, quiet decline and quiet exit, and the five words between partners.
6. **Friends before partners.** The same rule as the practice run.

## Open decisions (yours)

| What | My suggestion |
|---|---|
| Which route to explore first | The platform's live channel, using the lab, with two of your own devices |
| Accounts | None for now; revisit after the lab and the reviews (above) |
| Self-host the fonts and add the strict no-network lock to the offline build | Yes. You said to minimise what the app pulls from the internet. Today the app loads fonts from Google when it opens |
| A third reviewer, for security | Yes, before real words (`finding-reviewers.md`) |
| How the page proves what it is (A27) | Show a code fingerprint in the page, and keep a frozen build for trials |
| Whether a live link may be used while either person is flooded | No: apply the same rule the sit-down has |

## Protocol reference (version 1)

For a reviewer. Strings are UTF-8. `||` is concatenation. All numbers are big-endian. `H` is
SHA-256. `HKDF(ikm, salt, info, n)` is HKDF-SHA-256 giving `n` bytes. `AEAD` is AES-256-GCM with a
12-byte nonce and a 16-byte tag; "the head" is every byte of a frame before its ciphertext, used as
the additional data.

**Identity.** ECDSA P-256. The public key is 91 bytes (SPKI) and a signature is 64 bytes (r then s).
The fingerprint is `hex(H(spki))`. It is shown as six words from the first six bytes.

**Invite.** `S` is 16 random bytes. It is written in Crockford base32 (26 characters, the last with two
spare zero bits) followed by two typo-check characters, in groups of four. A weighted sum of the 26
symbols modulo 1021 gives the check, so every single wrong character and every swap of neighbours is
caught. `inviteKey = HKDF(S, "", "dyverge/link/1/invite", 32)`. `room = hex(HKDF(S, "", "dyverge/link/1/room", 16))`.

**Terms (charter).** The bytes of `{"kinds":[sorted],"purpose":"...","ttlSeconds":N,"v":1}` with no
spaces. Kinds are 1 to 8 names matching `[a-z][a-z0-9_]{0,23}`. `ttlSeconds` is 60 to 3600. The
purpose is at most 80 characters in NFC, with no control, invisible or direction-changing characters.
Only this one spelling is accepted.

**Frame.** `0x01 || type || sid(16) || ...`, then base64url without padding, at most 4000 characters.
`sid` is 16 random bytes chosen by the knocker.

| Type | Name | Layout after the first 18 bytes |
|---|---|---|
| 0x01 | knock | `epkK(65) || nonce(12) || AEAD(inviteKey, nonce, charterBytes, head)` |
| 0x02 | open | `epkL(65) || nonce(12) || AEAD(toKnocker, nonce, idL(91) || sigL(64) || macL(32), head)` |
| 0x03 | confirm | `nonce(12) || AEAD(toListener, nonce, idK(91) || sigK(64) || macK(32), head)` |
| 0x10 | data | `n(4) || AEAD(...)` on the chain (below) |
| 0x11 | beat | same, empty payload |
| 0x12 | seal | same, one byte: 1 you sealed, 2 expired, 3 the words differ |
| 0x13 | narrow | same, `{"kinds":[...]}` |
| 0x14 | ready | same, empty payload |

`epkK` and `epkL` are fresh ECDH P-256 public keys (65 bytes, uncompressed), made by the knocker when
it knocks and by the listener only when it says yes.

**Handshake.**

```
Z       = ECDH(eskL, epkK) = ECDH(eskK, epkL)                       (32 bytes)
T0      = H("dyverge/link/1/transcript" || 0x01 || sid || epkK || epkL || H(charterBytes))
okm     = HKDF(Z || S, salt = T0, "dyverge/link/1/handshake", 128)
          toKnocker = okm[0:32]   toListener = okm[32:64]
          macL      = okm[64:96]  macK       = okm[96:128]
sigL    = ECDSA(skL, "dyverge/link/1/sig/listener" || T0)
macL'   = HMAC(macL, "dyverge/link/1/id" || idL)
sigK    = ECDSA(skK, "dyverge/link/1/sig/knocker"  || T0 || H(idL))
macK'   = HMAC(macK, "dyverge/link/1/id" || idK)
```

The knocker reveals `idK` (in the confirm) only after it has checked the listener's signature, its
MAC and, if one was given, its pinned fingerprint.

**Session.**

```
root    = HKDF(Z || S, salt = T0, "dyverge/link/1/root", 32)
ckK2L   = HKDF(root, "", "dyverge/link/1/chain/knocker", 32)
ckL2K   = HKDF(root, "", "dyverge/link/1/chain/listener", 32)
words   = first 5 bytes of H("dyverge/link/1/check" || T0 || H(idK) || H(idL)), one word per byte
```

**Chain.** One chain per direction, counter `n` starting at 0, shared by every chain frame type.

```
mk      = HKDF(ck, "", "dyverge/link/1/message", 44)    key = mk[0:32], nonce = mk[32:44]
ck'     = HKDF(ck, "", "dyverge/link/1/chain", 32)
frame   = 0x01 || type || sid || n(4) || AEAD(key, nonce, pad(payload), head || dir)
dir     = 0x4B knocker to listener, 0x4C listener to knocker
pad     = payload || 0x80 || zeros, up to the next of 128, 256, 512, 1024, 2048 bytes
data    = len(kind)(1) || kind || body
```

**Receiving.** A frame with `n` below the next expected is old unless its key was kept. More than
32 ahead is refused. Within the window, keys for the frames skipped are derived and kept (at most
32). The chain moves only if the frame decrypts. A kept key is used once and then zeroed.

**Rooms and time.** The knocker sends the same knock again every 3 s until answered. The listener
sends the same open again if it sees the same knock. A lost "ready" is sent again while the other side
has not yet spoken. A room sends a beat the moment it goes live (which tells the other side it is live, so a
"ready" is only repeated if something was lost), then one every 5 s. It seals itself if it hears
nothing for 20 s, or at `ttlSeconds` after going live. Defaults: knock waits 2 minutes, the choice 5 minutes, the
handshake 30 s, and the words 3 minutes.
