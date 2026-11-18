/**
 * All gameplay numbers live here so they can be tuned at the booth without hunting through code.
 * Values marked [doc] come straight from keep-it-up-game-design.md "Current Tuning Values".
 */

/**
 * Read a number from the page URL, e.g. `?ball=50`, so booth staff can try a different
 * value without rebuilding. Out-of-range or missing values fall back to the default.
 */
function urlNumber(name: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback; // unit tests
  const raw = new URLSearchParams(window.location.search).get(name);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const FLOOR_Y = 500;

/**
 * BALL SIZE: change the default here (radius in px on the 960×540 stage), or override it
 * per session with `?ball=<20–70>` in the URL. The art, shadows, hit detection, dash-pass
 * aim and bots all derive from this one value.
 */
const BALL_RADIUS = urlNumber('ball', 44, 20, 70);

/** Characters are round: one diameter used for both width and height of the body. */
const PLAYER_SIZE = 56;

export const TUNING = {
  // World
  width: 960, // [doc]
  height: 540, // [doc]
  floorY: FLOOR_Y, // top of the floor strip

  // Ball
  ballRadius: BALL_RADIUS, // was 34 in the doc; bigger = easier to hit
  ballGravity: 520, // [doc] px/s²
  bounceNormal: 560, // [doc] px/s upward
  bounceJump: 720, // [doc] px/s upward
  hitVxFactor: 6, // new: vx = (ballX − playerX) × factor
  hitVxMax: 300, // new: clamp for normal hits
  // new: every normal hit drifts the ball toward its next target so a player who doesn't move
  // can't keep a ball bouncing in place forever (and the ball visibly "heads to" whose turn it is)
  hitDriftToTarget: 70,
  soloDriftMin: 40, // solo: random sideways drift instead
  soloDriftMax: 110,
  hitCooldown: 0.15, // new: s, a ball can't be hit twice in a row this fast
  wallBounce: 0.9, // new: horizontal energy kept on wall hit

  // Speed penalty
  speedPenalty: 0.15, // [doc] +× per wrong hit
  speedRecovery: 0.05, // [doc] −× per correct hit
  speedMax: 1.8, // [doc]
  speedMin: 1.0, // [doc]

  // Player
  playerWidth: PLAYER_SIZE,
  playerHeight: PLAYER_SIZE,
  moveSpeed: 340, // [doc] px/s
  jumpSpeed: 640, // [doc] px/s
  playerGravity: 1500, // [doc] px/s²

  // Dash
  dashSpeed: 1100, // [doc] px/s
  dashDuration: 0.16, // [doc] s
  dashCooldown: 0.6, // [doc] s

  // Dash-pass (new)
  dashPassVy: 620, // upward launch speed for a dash-pass
  dashPassVxMax: 520, // clamp so passes stay readable
  dashPassSoloVx: 380, // straight sideways speed in solo

  // Difficulty
  extraBallInterval: 30, // [doc] s
  spawnDropSpeed: 60, // new: a new ball floats in slowly from the top

  // Scoring [doc]
  pointsPerSecond: 10,
  pointsPerCorrectHit: 50,
  comboMultiplierStep: 0.1,

  // Danger zone (new): a ball whose bottom drops below this line breaks the combo.
  // Must sit BELOW a standing player's head (floorY − playerHeight), otherwise every ordinary
  // hit would cross it. 20 px below the head = a scrappy low save off the body / last-second dash.
  // Derived, so it stays correct if the character size changes.
  dangerLineY: FLOOR_Y - PLAYER_SIZE + 20,

  // Floor-shadow fade range: a ball whose bottom is this far above the floor (or more) gets the faintest shadow.
  shadowMaxHeight: 300,

  // Juice (new)
  hitStopMs: 40,
  slowMoScale: 0.25,
  slowMoMs: 900,

  // Booth (new)
  lobbyIdleToAttractS: 30,
  gameOverAutoReturnS: 15,
  attractMaxS: 45, // attract demo restarts/returns after this long
} as const;
