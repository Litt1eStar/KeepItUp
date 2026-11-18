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
const BALL_RADIUS = urlNumber('ball', 40, 20, 70);

/** Characters are round: one diameter used for both width and height of the body. */
const PLAYER_SIZE = 56;

/**
 * DASH DISTANCE & DURATION: change the defaults here (distance in px, duration in s),
 * or override per session with `?dash=<40–400>&dashDuration=<0.05–0.5>`.
 */
const DASH_DISTANCE = urlNumber('dash', 150, 40, 400);
const DASH_DURATION = urlNumber('dashDuration', 0.12, 0.05, 0.5);

export const TUNING = {
  // World
  width: 960, // [doc]
  height: 540, // [doc]
  floorY: FLOOR_Y, // top of the floor strip

  // Ball
  ballRadius: BALL_RADIUS, // was 34 in the doc; bigger = easier to hit
  ballSpawnFloatTime: 0.9, // s default telegraph float duration for newly spawned balls
  firstBallFloatTime: 0.7, // s telegraph float duration for the opening ball of a match
  ballInitialSpin: 1.8, // rad/s initial spin on a spawned ball
  ballGravity: 720, // [doc] px/s²
  bounceNormal: 590, // [doc] px/s upward
  bounceJump: 770, // [doc] px/s upward
  hitVxFactor: 7, // new: vx = (ballX − playerX) × factor
  hitVxMax: 260, // new: clamp for normal hits
  hitVxTransferClampMult: 1.25, // multiplier on hitVxMax after adding player momentum transfer and drift
  // new: every normal hit drifts the ball toward its next target so a player who doesn't move
  // can't keep a ball bouncing in place forever (and the ball visibly "heads to" whose turn it is)
  hitDriftToTarget: 95,
  soloDriftMin: 65, // solo: random sideways drift instead
  soloDriftMax: 145,
  hitCooldown: 0.15, // new: s, a ball can't be hit twice in a row this fast
  wallBounce: 0.9, // new: horizontal energy kept on wall hit
  wallSpinRetention: 0.75, // fraction of spin preserved and reversed on wall bounce

  // Speed penalty
  speedPenalty: 0.15, // [doc] +× per wrong hit
  speedRecovery: 0.05, // [doc] −× per correct hit
  speedMax: 1.8, // [doc]
  speedMin: 1.0, // [doc]

  // Player
  playerWidth: PLAYER_SIZE,
  playerHeight: PLAYER_SIZE,
  moveSpeed: 430, // [doc] px/s
  moveAccel: 3800, // px/s² ground acceleration
  moveDecel: 4200, // px/s² ground deceleration
  moveTurnAccel: 6400, // px/s² snappy turn-around when reversing direction
  airAccel: 2900, // px/s² air control acceleration
  airDecel: 1400, // px/s² air momentum retention
  jumpSpeed: 680, // [doc] px/s (capped peak when jump is held)
  jumpCutMultiplier: 0.45, // variable jump: upward vy multiplier when jump is released early
  jumpCutMinVy: -120, // only cut jump when rising faster than this
  playerGravity: 1750, // [doc] px/s²
  fallGravityMult: 1.35, // heavier fall for punchy landings
  apexVyThreshold: 90, // px/s window around jump peak for apex hang
  apexGravityMult: 0.72, // lighter gravity at jump peak
  coyoteTime: 0.08, // s after leaving ground where jump still fires
  jumpBufferTime: 0.09, // s before landing where a jump press is buffered

  // Dash
  dashDistance: DASH_DISTANCE, // px traveled during the active dash (default 150, or ?dash=40–400)
  dashDuration: DASH_DURATION, // [doc] s (default 0.12, or ?dashDuration=0.05–0.5)
  dashSpeed: DASH_DISTANCE / DASH_DURATION, // derived px/s so dashDistance controls total reach
  dashCooldown: 0.45, // [doc] s
  dashExitSpeedMult: 0.35, // fraction of moveSpeed kept at dash end when no direction key is held
  dashVerticalDamp: 0.5, // upward vy damping factor during the dash air-hang

  // Dash-pass (new)
  dashPassVy: 680, // upward launch speed for a dash-pass
  dashPassVxMax: 560, // clamp so passes stay readable
  dashPassSoloVx: 440, // straight sideways speed in solo

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
  hitStopMs: 25,
  slowMoScale: 0.25,
  slowMoMs: 900,

  // Booth (new)
  lobbyIdleToAttractS: 30,
  gameOverAutoReturnS: 15,
  attractMaxS: 45, // attract demo restarts/returns after this long

  // Player bump & trampoline physics
  dashBumpVx: 560, // horizontal launch speed imparted when dashing into a teammate
  dashBumpVy: 240, // upward hop imparted when dashing into a teammate
  dashBumpRecoilVx: 160, // recoil on the dashing player
  dashClashMult: 0.65, // fraction of dashBumpVx applied when two dashing players collide head-on
  playerPushVx: 40, // px/s separation nudge when two non-dashing players walk into each other
  bumpDecayDecel: 2600, // px/s² decay when knocked faster than moveSpeed
  stackLaunchVy: 800, // upward launch given to a rider when the base player jumps

  // Ball spin & momentum transfer
  playerVxTransfer: 0.32, // fraction of player vx added to ball vx on hit
  hitSpinFactor: 8.5, // rad/s spin from off-center hit position
  moveSpinFactor: 3.5, // rad/s spin from player horizontal movement
  ballSpinMax: 9.5, // max abs spin (rad/s)
  magnusFactor: 22, // px/s² horizontal curve per rad/s of ball spin
  spinDecay: 0.35, // per-second fractional spin decay in air
  ballCollideRestitution: 0.95, // bounciness of mid-air ball-to-ball collisions
  ballCollideSpinImpulse: 3.5, // rad/s spin kick imparted when two balls collide mid-air
  ballCollideMinUpVy: 180, // minimum upward pop speed in px/s given to the higher ball on collision

  // Mid-air poster targets
  targetRadius: 38, // hit radius of the stamped poster target ring
  targetFirstSpawnS: 3.5, // s until first poster target appears
  targetRespawnS: 6, // s after collection before next target prints
  targetLifetimeS: 14, // s before an uncollected target expires
  targetBonusPoints: 250, // base points for hitting a BONUS target
  targetCalmPoints: 150, // base points for hitting a SLOW DOWN target
  targetCalmSpeedThreshold: 1.15, // ball speedMult above which a target spawns as SLOW BALL
  targetCalmSpeedDelta: 0.25, // speedMult reduction applied to all balls when SLOW BALL is hit
  targetSpawnMarginX: 180, // px horizontal margin from stage edges for poster target spawns
  targetSpawnMinY: 165, // top Y limit for poster target spawns
  targetSpawnMaxY: 305, // bottom Y limit for poster target spawns
  targetBlinkWarningS: 2.5, // remaining seconds before an uncollected target blinks to warn of expiry
} as const;
