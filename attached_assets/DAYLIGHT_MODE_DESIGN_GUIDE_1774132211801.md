# Buccaneer Wallet — Daylight Mode Design Guide

This guide fixes the specific issues causing daylight mode to look wrong. Follow these rules exactly.

---

## THE #1 PROBLEM: Background Is Too Saturated

The background should be an EXTREMELY SUBTLE warm tint — barely distinguishable from white. If it looks obviously tan/beige/sandy, it's too much.

**Correct background:** `hsl(40, 40%, 96%)` → converts to approximately `#F5F0E8`
- Lightness is 96% — almost white with just a whisper of warmth
- This is NOT a tan or beige. Hold it next to pure white and you'd barely notice the difference.

**Cards are pure white:** `hsl(0, 0%, 100%)` → `#FFFFFF`
- The contrast between the barely-warm background and crisp white cards is what creates the layered, premium feel.
- If the background is too saturated, the white cards look jarring. If the background is too white, the cards disappear. The 96% lightness hits the sweet spot.

**Test:** If your background looks like sand, parchment, or khaki, you've gone too far. It should look like white paper that's been left in the sun for 5 minutes — just barely warm.

---

## COMPLETE COLOR REFERENCE (Daylight Mode Only)

All values in HSL. Convert to your platform's format as needed.

### Core Surfaces
| Token | HSL | Hex (approx) | Usage |
|-------|-----|--------------|-------|
| background | 40, 40%, 96% | #F5F0E8 | Page/screen background |
| card | 0, 0%, 100% | #FFFFFF | Card surfaces, drawers, panels |
| foreground | 215, 40%, 15% | #172331 | Primary text (deep navy, NOT black) |
| muted | 40, 25%, 90% | #E8E3DA | Muted backgrounds (inputs, tags) |
| muted-foreground | 215, 20%, 40% | #556270 | Secondary text, subtitles, labels |
| border | 40, 25%, 85% | #DDD8CE | Borders (use at 50% opacity for subtlety) |

### Brand Colors
| Token | HSL | Hex (approx) | Usage |
|-------|-----|--------------|-------|
| primary | 43, 96%, 58% | #FABA1A | Gold — primary buttons, focus rings |
| primary-foreground | 215, 50%, 10% | #0D1A2D | Text on gold buttons (dark navy) |
| accent | 14, 75%, 55% | #D95030 | Coral/orange — send actions, accent buttons |
| secondary | 198, 60%, 85% | #B8DDE8 | Soft water blue tint |
| destructive | 0, 84%, 60% | #E83030 | Error/delete red |

---

## RECEIVE & SEND BUTTONS — Critical Details

These are the most visually prominent elements. Getting them wrong ruins the whole screen.

### Receive Button
- **Card background:** `#EAF7FA` (very pale icy teal — NOT white, NOT strong blue)
- **Icon circle:** 56x56 (w-14 h-14), fully round
  - Background: `rgba(23, 162, 184, 0.2)` — that's `#17A2B8` at 20% opacity
  - Icon: ArrowDownLeft, stroke-width 3, color `#0D6E7D` (dark teal)
- **Label text:** "Receive" in bold, color `#0D6E7D`

### Send Button
- **Card background:** `#FDE9E6` (very pale blush pink — NOT white, NOT strong red)
- **Icon circle:** 56x56 (w-14 h-14), fully round
  - Background: `rgba(232, 106, 51, 0.2)` — that's `#E86A33` at 20% opacity
  - Icon: ArrowUpRight, stroke-width 3, color `#B54215` (dark burnt orange)
- **Label text:** "Send" in bold, color `#B54215`

### Common Button Properties
- Both buttons: rounded-3xl (24px radius), subtle shadow, border at 50% opacity
- Press feedback: scale down to 95% on press
- The icon circles sit INSIDE the tinted card with some visual breathing room
- The tinted backgrounds (#EAF7FA / #FDE9E6) are VERY pale — if they look strongly colored, reduce opacity

---

## TRANSACTION LOG PANEL

- **Background:** pure white (card color), NOT the page background
- **Top corners:** rounded at 2.5rem (40px) — `border-top-left-radius: 40px; border-top-right-radius: 40px`
- **Top border only:** `border-top: 1px solid` at border color with 50% opacity
- **Subtle top shadow:** `box-shadow: 0 -8px 30px -15px rgba(0, 0, 0, 0.1)` — this creates a soft lift effect
- **No bottom rounding** — it extends to the bottom of the screen
- **Backdrop blur:** `backdrop-filter: blur(16px)` on the panel, background at 80% opacity for a subtle glass effect

### Transaction Row Colors
- **Receive amount:** `#0D6E7D` (same dark teal as receive button)
- **Send amount:** `#B54215` (same dark burnt orange as send button)
- **Receive icon circle:** `#17A2B8` at 20% opacity background, `#0D6E7D` icon
- **Send icon circle:** `#E86A33` at 20% opacity background, `#B54215` icon
- **Status checkmark:** green-500
- **Date/subtitle text:** muted-foreground color

---

## TEXT COLORS — The Subtle But Critical Part

The foreground text is NOT pure black. It's a deep navy: `hsl(215, 40%, 15%)` ≈ `#172331`.

This is a design choice, not an accident. Pure black on the warm background looks harsh. The navy foreground has a slight blue undertone that complements the warm background and creates a softer, more premium feel.

| Text Role | Color | Opacity |
|-----------|-------|---------|
| Headlines, balance, labels | foreground (#172331) | 100% |
| Subtitle, secondary info | muted-foreground (#556270) | 100% |
| Tertiary, hints | foreground | 50-70% opacity |
| Placeholder text | muted-foreground | 60% opacity |

---

## SETTINGS GEAR (Ship Wheel) ICON

The settings button in the top-left is NOT a standard gear icon. It's a custom ship's wheel:
- 40x40 circle, card-colored background, border at 50% opacity
- Inside: SVG with a center circle (hub), an outer circle (wheel rim), 6 spokes radiating outward, and small filled circles at the end of each spoke (the handles)
- Color: foreground at 50% opacity
- If you can't replicate the ship wheel, use a standard Settings/Gear icon but make sure the button styling matches (40x40 round, card bg, border)

---

## BACKUP BADGE

- Positioned top-right of header
- Pill shape: `rounded-full`, horizontal padding with icon
- **Light mode specifically:**
  - Background: `#FFF3E0` (very pale orange, like `orange-100`)
  - Border: `orange-200`
  - Text: `orange-600`, uppercase, extra-bold, tracking-wider, very small (xs)
  - Icon: ShieldAlert, same orange-600
- NOT a filled orange button — it's a subtle, warm-toned pill

---

## COMMON MISTAKES TO AVOID

1. **Background too saturated** — The #1 issue. Should be barely warm, not visibly tan.
2. **Using pure black text** — Use deep navy `#172331` instead.
3. **Receive/Send buttons too flat** — They need the tinted card backgrounds (#EAF7FA / #FDE9E6), not plain white.
4. **Icon circles too opaque** — The colored circles behind the arrows should be at 20% opacity, creating a soft tint, not a solid colored circle.
5. **Transaction log panel same color as background** — It should be pure white, creating clear separation from the warm background.
6. **Borders too visible** — All borders should be at 50% opacity. They're meant to be felt, not seen.
7. **Missing the warm border color** — Borders are `hsl(40, 25%, 85%)`, a warm grey, not a cool grey. This matters.
8. **Card shadows too strong** — Use `shadow-sm` (small, subtle). The premium feel comes from the background/card contrast, not heavy shadows.

---

## QUICK VISUAL TEST

When daylight mode looks correct, it should feel like:
- A sun-bleached nautical chart — warm but not yellow
- White cards floating gently on a barely-warm surface
- Teal and orange accents that pop without screaming
- Text that's authoritative but not harsh (navy, not black)
- Overall: bright, airy, warm, premium — like a luxury yacht cabin with windows open
