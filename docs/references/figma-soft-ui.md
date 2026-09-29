# Figma technique reference — "Soft UI Design - Neumorphism"

**Status: reference material, not a source of truth.** This file records exact values extracted
from a third-party Figma template so the soft-UI pass has a traceable basis. It does **not**
override anything. The binding sources remain:

1. `docs/UI_theme_palette.pptx.pdf` — visual identity (palette, logo, icons, buttons).
2. `docs/00-product-flow.md` — product scope.
3. `docs/02-ui-ux-standard.md` — tokens, contrast, status presentation, accessibility.

If this file and any of those disagree, **they win.**

## Provenance

| | |
| --- | --- |
| Figma file | `Soft UI Design - Neumorphism (Community)` |
| File key | `PvlH0Mr7LFZLg3fSai4ukX` |
| Last modified | 2026-09-29 |
| Access | Read-only personal access token, `scripts/figma-extract.mjs` |
| Extracted | 2026-09-30 |

It is an **elements/style library**, not an app: a `Cover` page and an `Elements` page holding
`Pastel Color Palette`, `Text Color`, `Color Button` and one `Soft UI` board (3 phone mockups of a
music player, 390×844).

Re-extract with:

```bash
node scripts/figma-extract.mjs --list
node scripts/figma-extract.mjs --dump                       # full JSON to a temp dir
node scripts/figma-extract.mjs --render 128:805 --scale 1    # the Soft UI board as PNG
```

**Trust the JSON, not the labels.** The template's own text labels are buggy: every circle in
`Text Color` and `Color Button` is labelled `E7FDFF`, including the navy and indigo ones. All
values below were read from the node fills, not the labels.

## Palette (as extracted)

| Role | Value | Note |
| --- | --- | --- |
| Primary text | `#3B4F7D` | navy-slate |
| Muted text | `#3B4F7D` @ 75% | their recipe; **fails AA**, see audit |
| Secondary text | `#6A7CA5` | |
| Faint tint | `#6A7CA5` @ 20% | |
| Pastel field | `#D2DEFE` / `#E8DAF4` / `#E7FDFF` | blue / lavender / cyan |
| Neumorphic control fill | `#E6E7FD` | |
| Inset chip fill | `#D1DCFE` | |
| Primary accent | `#5A6BE3`, light variant `#808CEE` | indigo / periwinkle |
| Board background | `#B5CCFF` | |

## The neumorphic recipes (the actual technique)

Every "soft" surface is a **pair** of shadows — a light highlight from the top-left and a darker
shade to the bottom-right, or the pristine pair as inner shadows for the pressed state. All shadow
colours are blue-lavender tints, which is why the technique sits comfortably next to our Navy
`#24436D` palette.

| Component | Fill | Radius | Effects |
| --- | --- | --- | --- |
| Phone frame | `#FFFFFF` | 30 | `DROP #9CB2E4 24,24 blur 48` |
| Raised card | `GRADIENT_LINEAR #E7EEFF 1% → #E0EAFF 100%`, pad 30, gap 10 | 30 | `DROP #EAEFFF -10,-10 blur 16` + `DROP #C2CCEB 10,10 blur 20` |
| Raised circle button (68×68) | `#E6E7FD` | 100 | `DROP #D1D2F2 4,4 blur 8` + `DROP #F6F9FF -4,-4 blur 8` |
| Primary circle button (68×68) | `GRADIENT_LINEAR #7E8BEE 0% → #5E6FE4 100%` | 100 | `DROP #C4CEF2 4,4 blur 8` + `DROP #E9EDFF -4,-4 blur 8` |
| Pressed circle button | `#E6E7FD` | 100 | `INNER #D1D2F2 4,4 blur 8` + `INNER #F6F9FF -4,-4 blur 8` |
| Inset avatar ring (260×260) | `GRADIENT_LINEAR #DEDBF9 0% → #D2DEFD 100%` | 100 | `INNER #E2E9FF -10,-10 blur 20` + `INNER #BFCAE4 10,10 blur 20` |
| Inset chip (30×30) | `#D1DCFE` | 30 | `INNER #EDF2FF -1,-1 blur 2` + `INNER #C2CDEF 2,2 blur 4` |
| Frosted tab bar | `#FFFFFF` @ 10%, stroke `#FFFFFF` @ 20% | 30 | `BACKGROUND_BLUR 60` + `DROP #000000 @25% 0,4 blur 4` |

Other extracted radii: 100 (circles), 48.7 (a blurred background blob), and 1.3–2.7 (status-bar
battery glyphs — not design tokens).

Type scale (SF Pro, i.e. the platform system font): 34/41, 24/29, 20/24, 18/21, 15/18, 13/16,
11/13 — bold and semibold weights, primary text colour `#3B4F7D`. Layout: 390×844 frame, icon
buttons 44×44, card padding 30 with gap 10.

## Contrast audit — where the template fails our standard

Computed with WCAG relative luminance (the same maths as `scripts/check-contrast.mjs`):

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `#3B4F7D` on `#FFFFFF` | 8.08 | AA text |
| `#3B4F7D` on `#D2DEFE` | 6.01 | AA text |
| `#3B4F7D` on `#E6E7FD` | 6.62 | AA text |
| `#6A7CA5` on `#FFFFFF` | 4.17 | **below AA for body text** |
| `#6A7CA5` on `#D2DEFE` | 3.10 | **below AA** |
| `#6A7CA5` on `#E8DAF4` | 3.13 | **below AA** |
| `#6A7CA5` on `#D1DCFE` | 3.05 | **below AA** |
| `#6A7CA5` on `#E6E7FD` | 3.42 | **below AA** |
| `#3B4F7D` @ 75% on `#FFFFFF` | 4.23 | **below AA** |
| `#6A7CA5` @ 20% on `#FFFFFF` | 1.26 | **far below the 3:1 control boundary** |
| white on `#5A6BE3` | 4.52 | AA text (just) |
| `#3B4F7D` on `#5A6BE3` | 1.79 | fails |
| `#3B4F7D` on `#808CEE` | 2.65 | fails |

**Conclusion.** The template's *structure* is adoptable: dual soft shadows, large radii, circular
controls, generous spacing, and a type scale that happens to match ours at the 18/20/24 tiers. Its
*text and tint colours are not*: the secondary/muted text misses AA on every one of its own
surfaces, and the 20% tint is nowhere near a 3:1 control boundary. For an app whose primary users
are older adults with low vision, that is the one part that must not be copied.

## How it maps onto our tokens

| Adopt | Reject (and why) |
| --- | --- |
| Dual-shadow elevation (light top-left + dark bottom-right), mapped to our Navy-tinted shadows | `#6A7CA5`-family muted text — ours (`textMuted`) passes AA |
| Radius at the top of our range (`lg: 24`); the template's 30 exceeds our standard's 16–24 | The 20% tint as a control boundary — fails 3:1 |
| Circular controls (already applied to app-bar buttons; 48 dp, above the template's 44) | The template's 10–11 px labels — our content floor is 15 dp |
| Subtle gradients on large surfaces | Frosted `BACKGROUND_BLUR` chrome — not an Android idiom, and blurs text legibility |
| Generous card padding and consistent 8 dp rhythm | Inset/pressed controls as the *only* affordance — needs a text/icon state too |

Our type scale needs no change to match it: our `body: 18`, `heading: 20` and `title: 26` mirror
the template's 18/21, 20/24 and 24/29 tiers, with looser line heights, and we already floor content
at 15 dp rather than 11.

## Open at the time of writing

Which of the adoptable items to implement, and in what order, was put to the owner; see the
2026-09-30 changelog entry in `docs/02-ui-ux-standard.md` for the outcome.
