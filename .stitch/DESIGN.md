# narc-assYst — Design System

A calm, trauma-informed mobile app for noticing and recording difficult relational
patterns. The design must always feel safe, quiet, and non-judgmental.

## Design principles
- **Non-diagnostic.** Never labels people. Describes patterns, not verdicts.
- **Recognition over recall.** Offer choices to tap; "Unclear" / "Unsure" is always a valid, first-class option.
- **Calm, never alarmist.** No red, no fear-based design, no urgency colors.
- **Quiet confidence.** Honest about the app's limits. Soft, warm, paper-like.
- **Safety first.** A "Quick exit" is always visible in the top bar.

## Color palette
Warm, earthy, low-saturation. Clay is used for emphasis — **never red**.

| Token | Hex | Use |
|---|---|---|
| bg | `#EFE7D8` | App background (warm linen) |
| bgDeep | `#E5DBC8` | Deeper background |
| card | `#F8F3E7` | Card / surface (cream paper) |
| cardWarm | `#F2EBDA` | Secondary surface |
| ink | `#1F2530` | Primary text (deep slate) |
| inkSoft | `#5C6470` | Secondary text |
| inkMuted | `#8A8F99` | Tertiary text / hints |
| sage | `#7E8E80` | Primary accent (muted sage) |
| sageDeep | `#4F5F52` | Buttons, active states |
| sageSoft | `#C7CFC4` | Accent tints |
| clay | `#B0846B` | Warm emphasis (never red) |
| clayDeep | `#8C6A52` | Stronger emphasis |
| claySoft | `#E5C8B5` | Clay tints |
| amber | `#B8975C` | Rare highlight |
| line | `#D7CCB6` | Borders |
| lineSoft | `#E2D7C2` | Subtle borders |

## Typography
- **Display / headings:** Fraunces (serif). Often used italic for warmth. Weights 300–600.
- **Body / UI:** Geist (sans-serif). Weights 300–600.
- Section labels: 11px, UPPERCASE, letter-spacing ~0.14–0.18em, inkSoft.
- Headlines: 26–38px, weight 400, letter-spacing -0.02em.

## Shape & texture
- **Cards:** 12–16px radius, 1px `line` border, 16–22px padding.
- **Buttons & chips:** fully rounded pills (999px radius).
- **Texture:** subtle paper grain — a faint radial-dot pattern overlay at ~18% opacity.
- **Layout:** mobile-first, max content width 480px, centered.

## Motion
- Subtle fade + small vertical slide on view changes (~0.28s, ease `[0.2, 0.7, 0.2, 1]`).
- Bars and meters animate width from 0 on load.

## Components
- **Chip** — pill, tap to toggle. Active = `sageDeep` fill, white text. Soft variant = `cardWarm`.
- **Primary button** — `sageDeep` filled pill, cream text.
- **Ghost button** — transparent pill with `line` border.
- **Quiet link** — small underlined text in `inkSoft`.
- **Soft card** — cream surface, used for tappable list rows with a chevron.
- **Top bar** — logo left; Settings icon + "Quick exit" pill right.
- **Bottom nav** — Home, Log, Patterns, Toolkit.
- **Floating grounding button** — always-available calming tools.

## Voice & tone
Gentle, validating, never clinical or alarming. Examples:
- "What you're feeling makes sense."
- "Descriptions, not verdicts."
- "Unsure is a real answer."

## Screens
1. **Onboarding** — 4 skippable cards (welcome, what it can do, what it can't, quick exit).
2. **Home** — greeting; a warm "It's happening right now" action; three log modes; recent notes; a small reminder card.
3. **Quick log** — tap pattern/body/feeling/where chips; everything optional.
4. **Guided check-in** — 6 gentle steps with a progress bar.
5. **Drop a fragment** — free-text + rough "when" chips.
6. **Patterns** — frequency bars, "often together" pairs, weekly timeline.
7. **Entry detail** — read one note; delete with confirmation.
8. **Toolkit** — grounding tools (5-4-3-2-1, breathing, anchor, validation).
9. **Active defense** — paste what was said, pick a stance (Grey rock / Yellow rock / BIFF / Buy time), get calm replies.
10. **Phrasebook** — collapsible de-escalation phrases, tap to copy.
11. **Resources** — helplines and specialist support.
12. **Settings** — clear sample data, etc.
