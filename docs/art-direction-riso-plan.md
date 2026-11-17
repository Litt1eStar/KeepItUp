# Keep It Up! — Art Direction Plan: "Riso Print Zine"

## Why we're redoing the art

The current look reads as generic ("AI slop"). No single thing is broken; the problem is a stack of default choices with no idea behind them:

- **Stock background:** a purple night sky with a moon, stars, hills, a vignette and drifting lights. It has nothing to do with this game.
- **Every object gets every effect:** gradient, outline, gloss and drop shadow on everything, so nothing has a style.
- **Generic characters:** one capsule recolored three times, with stock googly eyes and blush.
- **Template UI:** dark see-through boxes, centered text, and a generic rounded "game font" with shadows everywhere.

**Decision:** one concept drives every visual choice. **The game is a risograph-printed zine poster that has come to life.** The three riso inks *are* the three players, so the player colors stop being decoration and become the identity of the whole art style.

Approved choices:
- Riso art direction
- Characters with distinct silhouettes
- No university branding

---

## 1. Style rules

These are the rules every asset follows. If something breaks a rule, it gets cut.

| Rule | Spec |
|---|---|
| **Paper** | Warm off-white `#EFE8DA` with fine grain noise. It's slightly darker than pure white so a bright screen in a dark hall isn't glaring. |
| **Inks (only 4)** | Fluoro pink `#FF48B0` (P1), blue `#0078BF` (P2), yellow `#FFE800` (P3), and black `#1E1B1A` for linework and text. Nothing else. |
| **Overprint** | Ink layers use **multiply blending**: where pink and blue overlap they make purple, as on a real riso. A blue ball passing over a pink character visibly overprints. |
| **Misregistration** | Each color layer sits 1–2 px off its black linework, with a fixed random offset per object. It's subtle but always there. |
| **Shading** | Only **halftone dots** and hatching. No gradients anywhere. |
| **Ink texture** | Fills are slightly uneven (mottled with noise), with occasional ink speckles. |
| **Type** | **Anton**, a condensed poster face, for the title, score and stamps. **Space Mono** for labels, keys and the leaderboard. Both are bundled for offline use. Lilita One is removed. |
| **Motion** | Line "boil": linework flips between 3 hand-made-looking variants at about 8 fps. Stepped, snappy animation, not smooth floating. |
| **Banned** | Gradients, glow, gloss, drop shadows, additive-blend particles, vignettes, the moon/stars/hills, centered-everything layouts. |

**Why yellow needs extra care:** yellow on off-white has low contrast. So every yellow element gets black linework, and its shape is never shown in yellow alone.

---

## 2. Characters — round bodies with faces, names and personality

*Updated: all characters are **round circles with faces**. This is already in the game (56 px diameter, circle-vs-circle hit detection).* Because every body has the same silhouette, personality and identity come from the **ink color**, the **face** and a **shape sticker** on the back of the body. The sticker keeps them distinguishable for colorblind players.

| | **PIK** (P1, pink ▲) | **BLOOP** (P2, blue ●) | **BRICK** (P3, yellow ■) |
|---|---|---|---|
| Face | Sharp, narrow eyes, grin | Big round eyes, small "o" mouth | Heavy-lidded eyes, flat mouth |
| Personality | Quick, twitchy | Bouncy, soft | Sturdy, stompy |
| Idle | Small hops and head-tilts | Breathing squash/stretch | Heavy blink, slow wobble |
| Hit reaction | Spins once | Big squash | Ground-shake thump |

- **Face:** simple ink-dot eyes, with no googly eyes or blush. The **pupils track the ball currently targeting that player**. That's both a gameplay cue and personality.
- **Telling them apart from the balls:** balls are bigger, have no face, and carry their shape as a cut-out. Characters always have a face and stay on the floor.
- **Frames** (generated in code): idle ×2, run ×3, jump, fall, dash (with speed-line smear), hit.
- **Layers:** a fill in the character's ink (multiply), a black linework layer, and halftone shading on one side.

## 3. Ball

- A circle in the target player's ink, with the player's shape **knocked out**: the paper shows through it.
- A black ink ring, plus a halftone crescent for shading. Spin is shown by rotating the halftone.
- **When the target changes,** the ball gets a quick "stamp" squash and a ring flash in the new ink. That makes the color handoff impossible to miss.

## 4. Stage

- **Background:** a printed poster composition, not a landscape.
  - Huge halftone shapes in pale ink: a yellow sun-disc, a pink zigzag and a blue grid.
  - Printer's crop marks and a CMYK-style **color test strip** in the corners, like a real riso proof.
- **Floor:** a thick black ink band with ruler ticks and a small mono label, `FLOOR — DO NOT TOUCH`.
- **Danger line:** a dashed ink rule labeled `DANGER` in small mono text.
- **Fall warning (a gameplay cue, restyled):** the ball's floor shadow becomes **halftone dots that get bigger and denser** as the ball falls, and they turn pink inside the danger zone. This replaces the dark ellipse.

## 5. Interface

- **HUD:**
  - Score: big black Anton numbers, left-aligned.
  - Combo: a **rotated pink stamp**, e.g. `×2.3`, misregistered.
  - Timer: Space Mono.
  - Next-ball countdown: a row of 30 dots that fill in one per second, replacing the bar.
- **Lobby = the zine cover:**
  - The title `KEEP / IT / UP!` is stacked **left-aligned** in overprinted inks.
  - Each player gets a **ticket stub** with their silhouette, name, keys and a "JOINED" stamp that slams on when they join.
  - The leaderboard is a **printed receipt** in mono, with dot leaders: `BOUNCERS ........ 12 840`.
- **Game over = a "ROUND REPORT" receipt:**
  - Stats are printed line by line.
  - Name entry uses rubber-stamp letters.
- **Popups:** stamped words, slightly rotated with an ink-stamp texture (`NICE`, `PASS!`, `WRONG!`). They hit and fade in steps instead of floating up with a glow.
- **Scene transitions:** a quick "print roller" wipe across the screen.

## 6. Effects, restyled to the concept

| Event | Current | New |
|---|---|---|
| Hit | Glowing sparks | An ink splat (2–3 blots) in the hitter's ink, plus hit-stop (kept) |
| Wrong hit | Screen shake | A **misregistration jolt**: the ink layers shift apart for 120 ms, then snap back |
| Combo milestone | Banner | A big rotated stamp, `COMBO 10`, that stays as a faint print for a moment |
| New ball | Banner | A `+1 BALL` stamp and a halftone "incoming" circle where the ball will appear |
| Game over | Red flash + slow motion | Slow motion (kept), an ink splat on the floor, and a `DROPPED` stamp |
| Background motes | Glowing particles | Removed |

---

## 7. Technical approach

- **New `src/art/` module**, all drawn with the browser's 2D canvas API at the current render resolution:
  - `palette.ts`: the 4 inks and the paper color, the single source of truth.
  - `riso.ts`: helpers for halftone pattern fills, paper grain, mottled ink masks, misregistered drawing and seeded line wobble for the boil.
  - `characters.ts`, `ball.ts`, `stage.ts`, `ui.ts`: generators that call the riso helpers.
- **Multiply blending:** ink sprites use Phaser's `BlendModes.MULTIPLY` (WebGL) over the paper. Each character and ball is a small container: fill layer + line layer.
- **Boil:** generate 3 seeded variants of each line texture in BootScene, then swap them every 125 ms. Cheap at runtime.
- **Halftone shadow:** pre-generate 8 density steps and pick one by ball height.
- **Fonts:** `@fontsource/anton` and `@fontsource/space-mono`. Remove `@fontsource/lilita-one`.
- **Kept as is:** the sharp render-scale system, all gameplay code and all tests. This is a visual-only rewrite, so `TUNING` doesn't change.

## 8. Build order, with a checkpoint before the full conversion

1. **Style tile first (checkpoint):** palette, riso helpers, fonts, and a hidden `?styletile` page that shows every element on one sheet:
   - all 3 characters (idle and dash)
   - a ball, halftone shadows, stamps, a ticket stub, a receipt row and the HUD

   **You approve this sheet before anything else changes.** Changing direction here is cheap.
2. Characters, ball and stage.
3. HUD, popups and effects.
4. Lobby, game over and transitions.
5. Polish: boil timing, misregistration jolt, idle personalities and pupil tracking.

## 9. How we'll know it's done

- **Anti-slop checklist,** run on screenshots of every screen:
  - No gradient, glow, gloss or drop shadow anywhere.
  - Only 4 inks + paper.
  - Nothing centered by default.
  - Every effect is tied to the print concept.
- **Readability:**
  - A grayscale screenshot and a simulated deuteranopia (red-green colorblind) screenshot. All three players and the ball targets must still be clear from shape alone.
  - Yellow elements always have black linework.
- **Performance:** a steady 60 fps with 3 players and 3 balls at render scale 2 (1080p). The game loop is measured through `window.game`.
- **No regressions:** `npm test` passes (16 tests), the typecheck is clean, and the bot simulations still survive about 35–40 s. The art change must not change gameplay.

## Risks

- **Multiply blending needs WebGL.** On the rare Canvas fallback, the inks draw normally without overprinting. That's acceptable.
- **A light paper background is a bold change** for a dark booth hall. The warm, slightly darker paper tone reduces glare. We'll check it on the real display during phase 1.
- **Ball size is configurable** (`BALL_RADIUS` in `tuning.ts`, or `?ball=` in the URL). All riso ball art and halftone shadows must be generated from that radius, never fixed pixel sizes.
