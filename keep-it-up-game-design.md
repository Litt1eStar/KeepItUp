# Keep It Up! — Game Design Summary

*Working title. Prototype for the Game Design booth at Open House.*

## Overview

| | |
|---|---|
| **Genre** | Co-op party game |
| **Players** | 1–3 on one machine (solo mode supported) |
| **Platform** | Web browser (prototype: HTML5 Canvas, planned build: Phaser 3) |
| **Input** | 1 keyboard + 2 gamepads |
| **Round length** | About 1–3 minutes |
| **Audience** | Students visiting the booth, often in groups |

**Pitch:** Players work together to keep the balls in the air for as long as they can. If a ball touches the floor, the game is over.

## View

- 2D side view.
- Characters run on the floor at the bottom of the screen.
- Balls float and bounce above them.

## Controls

| Player | Color | Move | Jump | Dash |
|---|---|---|---|---|
| P1 | Red | A / D | W | S |
| P2 | Blue | ← / → (or gamepad 1) | ↑ (gamepad A) | ↓ (gamepad B / X / RB) |
| P3 | Yellow | J / L (or gamepad 2) | I (gamepad A) | K (gamepad B / X / RB) |

Each player also has a shape: P1 ▲, P2 ●, P3 ■. The shape appears on the character, on the balls and on the turn arrow, so the game doesn't rely on color alone (colorblind-friendly).

**Start:** In the lobby, each player presses their own jump button to join. Joined players can practice right away on a ball that can't fail. Press Space, Enter or Start on a gamepad to begin with the players who joined. If no one joined, the game starts solo as P1.

## Core Mechanics

1. **Bounce:** A ball that touches a character bounces up. If the character hits it while jumping, it bounces higher.
   - Where the ball hits the character decides its sideways speed: an off-center hit sends it sideways.
   - Every normal hit also drifts the ball a little toward its next target (in solo, a random direction). Without this, a player standing still could bounce a ball in place forever.
2. **Color turns:**
   - The ball takes the color of the player who should hit it next, and an arrow blinks above that player's head.
   - **Who is next:** after any hit, the next target is a random joined player who is *not* the hitter. With 2 players it alternates. A newly added ball goes to the player with the fewest balls.
   - **Right player hits it:** the combo goes up and the ball slows down.
   - **Wrong player hits it:** the combo resets and the ball speeds up, up to 1.8×.
3. **Dash:**
   - A short, fast sideways burst. It goes in the direction you're holding, or the way you last faced.
   - It works in the air too, and you hang briefly while dashing, so jump + dash can catch balls drifting away.
   - **Smart dash-pass:** hitting the ball mid-dash launches it in an arc that lands on the teammate whose turn is next. In solo it flies straight sideways.
4. **Stacking:** Players can land on each other's heads to reach high balls. Whoever is on top rides along when the bottom player moves.
5. **Collision:** Players push against each other, so the team has to split up zones.
6. **Rising difficulty:** One extra ball is added every 30 seconds. It floats in slowly and pulses before it starts to fall. A bar under the timer shows when the next ball is coming.
7. **Fall warning:** A ball's shadow on the floor grows darker as it gets closer to the ground, and turns red in the danger zone.
8. **Danger zone:** If a ball sinks below head height (a scrappy, last-second save), the combo breaks. This is what gives solo a real combo challenge, because in solo every hit is "correct".
9. **Off-screen indicator:** When a ball flies above the top of the screen, an arrow in its color and shape tracks it along the top edge.

**Lose condition:** Any ball touches the floor (instant loss). The game goes into slow motion and shows a red flash, so everyone sees what happened.

## Scoring

- **Time:** 10 points per second × the combo multiplier (1 + combo × 0.1).
- **Correct hit:** 50 × the combo multiplier.
- **Leaderboard:** The top 10 teams are saved on the machine. If a score makes the board, the team enters a name of up to 8 letters on the game-over screen. It works with a keyboard or a gamepad: ◀ ▶ moves the cursor, jump and dash change the letter. The top 5 are shown in the lobby. An online leaderboard can be added later behind the same interface.

## Modes

- **Multiplayer (2–3 players):** The color system forces players to talk to each other ("yours! yours!"). That chaos is the main source of fun and is fun to watch too.
- **Solo:** The ball always takes the player's own color, so every hit counts toward the combo. The challenge comes from extra balls, from random drift, and from keeping saves clean so the combo survives the danger zone.
- **Attract mode (booth):** After 30 s with no input in the lobby, bots play a demo game. Pressing any button returns to the lobby.

## Current Tuning Values

| Parameter | Value |
|---|---|
| Ball radius | 44 px on the 960×540 stage (was 34; bigger = easier to hit). Change `BALL_RADIUS` in `tuning.ts`, or add `?ball=20…70` to the URL |
| Character size | Round, 56 px diameter. Hit detection is circle vs circle |
| Ball gravity | 520 px/s² (floatier than players) |
| Normal bounce / jump bounce | 560 / 720 px/s upward |
| Player move speed | 340 px/s |
| Player jump | 640 px/s, gravity 1500 px/s² |
| Dash speed / duration / cooldown | 1100 px/s / 0.16 s / 0.6 s |
| Speed penalty per wrong hit | +0.15× (max 1.8×) |
| Speed recovery per correct hit | −0.05× (min 1.0×) |
| Extra ball interval | 30 s |
| Sideways speed from hit position | (ball x − player x) × 6, max ±300 px/s |
| Drift toward next target / solo random drift | 70 px/s / 40–110 px/s |
| Danger line | 20 px below a standing player's head (y = 464). Calculated from the character size |
| Dash-pass launch speed / max sideways speed | 620 / 520 px/s |
| Hit-stop on hit | 40 ms |
| Lobby idle → attract / game-over auto-return | 30 s / 15 s |

All values live in `src/config/tuning.ts`.

## Why It Works at a Booth

- **Easy to learn:** Move, jump and dash are understandable within seconds.
- **Short rounds:** The queue keeps moving.
- **Fun to watch:** Shouting and stacking draw a crowd of spectators.
- **Any group size:** It works for 1, 2 or 3 people.

## Development Plan

**Done (Phaser 3 + TypeScript build, rewritten from scratch)**
- 3 characters, ball physics, bounce and jump bounce, hit-position steering, drift toward the next target
- Color + shape turn system, combo and danger zone
- Dash and smart dash-pass
- Stacking (riders move with the bottom player) and collision
- An extra ball every 30 s with a warning and a countdown bar
- Lobby with join, a practice ball and solo fallback; game-over screen with team-name entry; local top-10 leaderboard
- Booth mode: attract demo with bots, auto-return to the lobby, fullscreen (F)
- Game feel: hit-stop, particles, screen shake, popups, slow motion on the losing drop
- Placeholder sound effects synthesized in code (no files needed)

**Next**
- Online leaderboard (Supabase or Firebase): implement `SupabaseLeaderboard` in `src/services/Leaderboard.ts` and keep the local one as the offline fallback
- Real sound effects and music (replace the bodies in `src/systems/AudioManager.ts`)
- Character art and assets (load them in `BootScene` under the same texture keys)
- Playtest with real visitors and tune the values in `src/config/tuning.ts`

**If time allows**
- Power-ups: longer reach, slow ball, shield
- Chaos items: reversed controls, shrinking
- Obstacles: wind, moving walls
- Team skill triggered when everyone presses together
- Solo-specific variant: targets to hit, or a faster second ball
- Limit dash to the player whose color the ball is (if dash proves too strong)
