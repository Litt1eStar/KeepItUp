# HANDOFF — Keep It Up! (riso art conversion)

Read this first if you are picking up the work. Last updated 2026-11-18.

## 1. What this is

**Keep It Up!** is a co-op ball-juggling party game for 1–3 players on one machine. It was built for the Game Design booth at a university Open House. Spectators watch, so every piece of feedback must be **big and readable from a distance**.

- **Stack:** Phaser 3.90, Vite, TypeScript (strict) and Vitest. The machine is Windows; PowerShell and Git Bash both work (use `npx.cmd` / `npm.cmd` in PowerShell if execution policy blocks `.ps1` shims).
- **Game rules:** `keep-it-up-game-design.md` is the source of truth.
- **Art direction:** `docs/art-direction-riso-plan.md` is the approved plan, covering style rules, effect table and build order.
- **Branch:** all art work is on **`riso-art`**; `main` holds the pre-riso build. Never push, amend or skip hooks unless the user asks.
- **Commits:** messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 2. Current status

| Step (plan §8) | State |
|---|---|
| 1. Style tile (`?styletile`), palette, riso helpers, fonts | Done, approved |
| 2. Characters, ball and stage (play field) | Done (Task 5, `b4d1cca` + `a96c103`) |
| 3. HUD, popups and effects | Done (Task 6, `a8ff896` + `d53bba7`) |
| 4. Lobby, game over, transitions & old-art cleanup | Done (Task 7, `4c98a8a`) |
| + Pause menu (`ESC`), key rebinding (`Lobby` & `Game`) & `GameOver` `ESC` | Done (`96ea6d2` + `c49afea`) |
| 5. Polish (idle personalities, incoming halo, faint combo, floor splat) | Done (`af1922a`) |
| + Main Menu (`MenuScene`), two-way `PrintRoller` & variable-jump living movement | Done (`433baa1`) |

All planned riso conversion, menu/UI flow and movement polish work is committed on `riso-art` (clean working tree except this untracked `HANDOFF.md`).

## 3. Commands

```powershell
npm.cmd install
npx.cmd vitest run          # 115 tests across 6 suites (logic, riso, art, styleTile, hud, screens)
npx.cmd tsc --noEmit
npx.cmd vite build          # or: npm.cmd run build (tsc + vite)
npx.cmd vite --port 5191 --strictPort   # dev server; http://localhost:5191/  (?styletile = art sheet, ?ball=50 = ball radius)
```

Required checks before every commit:
- `vitest`, `tsc` and `vite build` all pass.
- A recursive **forbidden-pattern grep** over all `.ts` files under `src/` returns nothing: `BlendModes.ADD|createLinearGradient|createRadialGradient|shadowBlur|setAlpha|tweens.add|lilita|textStyle|\balpha\s*:`.
- There are no `'riso:'` string literals outside `src/art/textures.ts`. Use `RISO_KEYS`.

## 4. Riso art rules (non-negotiable; the user approved these)

- **Colours:** paper `#EFE8DA` (`PAPER`) plus exactly 4 inks from `src/art/palette.ts`: pink `#FF48B0` = P1, blue `#0078BF` = P2, yellow `#FFE800` = P3, and black `#1E1B1A`.
- **Rendering:**
  - Ink sprites use **MULTIPLY** blending (overprint), with misregistration, halftone shading and boiling linework (3 variants swapped every `BOIL_MS`).
  - **Banned:** gradients, glow, gloss, drop shadows and ADD blending.
  - Nothing translucent. No alpha rectangles.
- **Motion:**
  - Motion is **stepped and snappy**: values change in whole `STEP_MS` (83 ms) / `MOTION_STEP_MS` (42 ms) ticks (`src/art/motion.ts`).
  - Blinks use visibility, never alpha. No smooth fades or eased tweens.
  - Every time-based visual takes the **scene time in ms** passed in from `update(time)`.
- **Type:** Anton (`DISPLAY_FONT`) for display and Space Mono (`MONO_FONT`) for labels, through `risoText(size, color, 'display'|'mono')` in `src/art/type.ts`. `@fontsource/lilita-one` and legacy `textStyle` have been removed.
- **Yellow readability:**
  - **Yellow type and yellow stamps are never allowed.** `stampTint()` maps yellow to black, and `readableInk()` does the same for text.
  - Yellow shapes get black linework or keylines (`splatNeedsKeyline`, dashed black ring on incoming spawn halo).
- **Layout:**
  - The top band `y < STAGE_QUIET_Y` (72) is reserved for the HUD.
  - The black floor band is `y >= T.floorY` (500); paper-coloured text can be printed on it (centered clear of `FLOOR — DO NOT TOUCH` on the left and the color test strip on the right).
- **Performance:**
  - No per-frame allocations in update loops.
  - Call `setText`/`setTexture`/`setScale` only when the shown value changes; cache the last value.
  - Pool or destroy short-lived effects so nothing grows without bound.
- **Gameplay feel:** variable jump height (hold up to `jumpSpeed`, early release cuts upward `vy`), coyote time (`0.08 s`), jump buffering (`0.09 s`), snappy acceleration/turn-around, apex hang + weighted fall; no scoring/turn/ball-rule changes.

## 5. Code map

```
src/
  main.ts                 Phaser config (Anton + Space Mono, PAPER bg); exposes window.game (debug/testing)
  config/  tuning.ts (gameplay numbers) · players.ts (P1–P3 defs, customizable key bindings + localStorage persistence) · render.ts (RS, S)
  logic/   pure rules with tests: TurnSystem, Scoring, dashPass, lookTarget, movement
  input/   InputManager (keyboard + gamepad, live rebind() & clearLatched()), BotInput (attract-mode bots)
  entities/ Player (kinematics + variable jump/coyote/buffer + RisoCharacterView + run/air/idle poses + jolt), Ball (physics + RisoBallView + incoming halo)
  game/    World.ts (simulation, events incl. 'land', turn arrows, off-screen indicators) · stage.ts (drawStage)
  systems/ Juice.ts (riso effects + faint combo banner) · AudioManager.ts
  services/ Leaderboard.ts (local, behind an interface; Supabase later)
  scenes/  BootScene -> MenuScene (live bot juggling + zine menu) -> LobbyScene (ticket stubs + receipt + ESC controls) -> GameScene (play/attract + ESC pause) -> GameOverScene (ROUND REPORT + entry + receipt + ESC lobby) · StyleTileScene
  art/     Phaser-free generators + pure timing/layout (unit-tested), except views/ and type.ts
    palette.ts  inks, PLAYER_INK, INK_HEX, hexToCss
    riso.ts / draw.ts  halftone, grain, mottle, misregistration, wobble helpers
    characters.ts, ball.ts (+ incoming halo), shadow.ts, arrow.ts, splat.ts, stage.ts, ui.ts (stamps + faint stamp, ticket, receipts, report/pause cards, letter box, dots)
    textures.ts  RISO_KEYS + generateRisoTextures + runtime receipt/ticket/lazy helpers
    motion.ts    runtime stepped timing (boil, spin, slamScale, joltOffset, inkPunch, idlePose, runPose, airPose, arrows, …)
    hud.ts       HUD layout + labels + effect schedules (splatScale, popupRise, bannerPhase, FLOOR_SPLAT_Y, niceDue, localStampFor, …)
    screens.ts   Menu, Lobby, Game Over, PauseMenu and two-way PrintRoller pure layout, labels & schedules
    styleTileMotion.ts  demo-only schedules for the style tile
    views/  RisoCharacterView, RisoBallView, StampSlam, ComboLabel, PrintRoller, PauseMenu
tests/   logic, riso, art, styleTile, hud, screens (115 tests total)
```

### Juice API (`src/systems/Juice.ts`)

`new Juice(scene, rng?)`. **Call `juice.update(time)` at the top of the scene's `update`.** Every effect is timed from that call; nothing else ticks them.

| Method | What it does |
|---|---|
| `splat(x, y, ink, size='hit'\|'small'\|'jump'\|'floor', holdSteps=3)` | Pooled MULTIPLY ink splat; `'floor'` draws under the characters; `holdSteps: Infinity` keeps it on screen |
| `popup(x, y, text, ink='black', size=18)` | Pooled Space Mono bold; rises in 3 steps, then hides |
| `stamp(id, x, y, ink?, scale=0.9)` | Small StampSlam near a player (NICE/WRONG/PASS); destroyed after `LOCAL_STAMP_MS` |
| `banner(id, { label?, ink?, holdMs?, faintMs?, scale? })` | Centre stamp (PLUS_BALL/COMBO/DROPPED); `COMBO` switches to a halftone `stampFaint` print for `BANNER_FAINT_MS` before clearing |

Stamp IDs are `STAMP_IDS` in `ui.ts`: NICE, PASS, WRONG, PLUS_BALL, COMBO, DROPPED and JOINED. Each has a default ink in `STAMP_INK`.

## 6. Testing in a browser

- Playwright / Chrome DevTools MCP can be used when Chrome remote debugging is active.
- **rAF is throttled when the window is hidden**, so drive the game by hand. Call `window.game.loop.sleep()` once, then advance a time counter `t`:
  - `game.headlessStep(t += 16.67, 16.67)` simulates without rendering (fast).
  - `game.step(t += 16.67, 16.67)` also renders; use it for the frames you screenshot.
- To start a scene: `game.scene.getScene('Lobby').scene.start('Game', { mode: 'attract', players: [0,1,2] })`.
  - Attract mode runs bots. A play round with no input drops the ball within about 4 s, which is handy for testing game over.
- **Bot sanity check (gameplay unchanged):** attract survival should be about 32–41 s across runs. The attract round ends itself at 45 s (`attractMaxS`).
- **Leak check:** the display-list length (`scene.children.list.length`) should stay flat across long sims.
- **Clean up afterwards:** stop the dev server and delete any `.playwright-mcp/` folder created in the repo. Never commit screenshots or debug code.

## 7. Remaining browser / booth verification

- Live browser visual verification (Chrome remote debugging was not active during Tasks 7–Polish):
  - Spot-check `Menu` (live bot juggling, zine cover, two-way `PrintRoller` wipe), `Lobby`, `Game` (variable jump height, run stride, air pose, movement ink puffs, `ESC` pause menu, `+1 BALL` incoming halftone halo, faint `COMBO` ghost print, `FLOOR_SPLAT_Y`), and `GameOver` (`ROUND REPORT`, rubber-stamp entry, Top-10 receipt, `ESC` -> Lobby).
  - Run plan §9 readability checks: grayscale and deuteranopia screenshots, steady 60 fps at `RS = 2` with 3 players and 3 balls, and `headlessStep` attract-mode survival + flat display-list check.
- Minor known behavior noted in `GameScene`: score popups can overlap a ball and multiply into it for a few frames; off-screen indicators intentionally use `NORMAL` blending above the HUD band.

## 8. Working with the user

- The user approves direction at checkpoints. Don't change the approved look without asking.
- Work goes in tasks, each followed by a code review. Fix review items in a follow-up commit; don't amend.
- Report each task with: status, what changed, test count, bot-sim and object-count results, visual checks, files, commit SHA and concerns.
