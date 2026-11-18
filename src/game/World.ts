import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { PLAYERS, type CharStyleId, type PlayerId } from '../config/players';
import { Player, type LookTarget } from '../entities/Player';
import { RISO_KEYS, ensureTargetTexture } from '../art/textures';
import { INK, INK_HEX } from '../art/palette';
import { risoText } from '../art/type';
import { STEP_MS, arrowBob, arrowVisible, offscreenScale, slamScale } from '../art/motion';
import { Ball } from '../entities/Ball';
import type { InputSource } from '../input/InputManager';
import { entersDangerZone, pickNextTarget, pickSpawnTarget, resolveHit } from '../logic/TurnSystem';
import { solveDashPass } from '../logic/dashPass';
import { pickLookTarget } from '../logic/lookTarget';
import { computeHitSpin, resolveBallCollision, resolvePlayerBump } from '../logic/movement';

export interface HitEvent {
  ball: Ball;
  player: Player;
  correct: boolean;
  combo: number;
  jumpHit: boolean;
  dashPass: boolean;
  clutch: boolean;
}

export interface BumpEvent {
  x: number;
  y: number;
  ink: PlayerId;
  kind?: 'bump' | 'trampoline';
}

export interface TargetHitEvent {
  x: number;
  y: number;
  kind: 'bonus' | 'calm';
  ball: Ball;
}

interface PosterTarget {
  x: number;
  y: number;
  kind: 'bonus' | 'calm';
  bornS: number;
  spawnedAtMs: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  shownScale: number;
  shownStep: number;
  shownVis: boolean;
}

/**
 * Shared simulation: players, balls, collisions, bumps, poster targets and turn rules.
 * Used by the game (rules on) and by the menu/lobby practice areas (rules off, balls can't fail).
 *
 * Events: 'hit' (HitEvent), 'comboBreak' (ball), 'floor' (ball), 'jump' (player),
 * 'dash' (player), 'land' (player), 'bump' (BumpEvent), 'ballCollide' (BumpEvent), 'targetHit' (TargetHitEvent)
 */
export class World extends Phaser.Events.EventEmitter {
  players: Player[] = [];
  balls: Ball[] = [];
  combo = 0;
  bestCombo = 0;
  private arrows = new Map<PlayerId, Phaser.GameObjects.Image>();
  private offscreen = new Map<Ball, Phaser.GameObjects.Image>();
  /** Last scale step shown per off-screen indicator (avoid re-setting every frame). */
  private offscreenShownScale = new Map<Ball, number>();
  private readonly look: LookTarget = { x: 0, y: 0 };
  private lastRenderTime = 0;
  private elapsedRulesS = 0;
  private nextTargetAtS: number = T.targetFirstSpawnS;
  private target: PosterTarget | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    /** When false (menu/lobby practice), hits don't affect combo or speed and targets stay off. */
    readonly rules: boolean,
    private readonly rng: () => number = Math.random,
  ) {
    super();
  }

  get joinedIds(): PlayerId[] {
    return [...new Set(this.players.map((p) => p.id))];
  }

  playerById(id: PlayerId): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Rebind player/ball/arrow sprite textures after regenerating player ink textures at runtime. */
  refreshPlayerArt(id: PlayerId): void {
    for (const p of this.players) {
      if (p.id === id) p.view.refreshStyle();
    }
    this.arrows.get(id)?.setTexture(RISO_KEYS.arrow(id));
    for (const b of this.balls) {
      if (b.target === id) {
        b.view.refreshInk(id);
        this.offscreen.get(b)?.setTexture(RISO_KEYS.offscreen(id));
      }
    }
  }

  addPlayer(id: PlayerId, x?: number, styleOverride?: CharStyleId): Player {
    if (styleOverride === undefined) {
      const existing = this.playerById(id);
      if (existing) return existing;
    }
    const p = new Player(this.scene, PLAYERS[id], x ?? PLAYERS[id].spawnX, styleOverride);
    this.players.push(p);
    if (!this.arrows.has(id)) {
      this.arrows.set(id, this.scene.add.image(p.x, p.top - 30, RISO_KEYS.arrow(id)).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(25).setVisible(false));
    }
    return p;
  }

  spawnBall(x?: number, floatTime: number = T.ballSpawnFloatTime): Ball {
    const target = pickSpawnTarget(this.joinedIds, this.balls.map((b) => b.target), this.rng) as PlayerId;
    const bx = x ?? Phaser.Math.Between(140, T.width - 140);
    const ball = new Ball(this.scene, bx, 120, target, floatTime); // below the HUD strip
    this.balls.push(ball);
    // Above the HUD (depth 45) and NORMAL blend, not MULTIPLY: it sits in the top band over black HUD
    // type, where a multiplied ink would vanish. Printed opaque like a sticker, it always reads.
    this.offscreen.set(ball, this.scene.add.image(bx, 18, RISO_KEYS.offscreen(target)).setScale(S).setDepth(48).setVisible(false));
    return ball;
  }

  removeBall(ball: Ball): void {
    ball.destroy();
    this.offscreen.get(ball)?.destroy();
    this.offscreen.delete(ball);
    this.offscreenShownScale.delete(ball);
    this.balls = this.balls.filter((b) => b !== ball);
  }

  step(dt: number, input: InputSource): void {
    if (this.rules) {
      this.elapsedRulesS += dt;
      if (!this.target && this.elapsedRulesS >= this.nextTargetAtS) {
        this.spawnTarget();
      } else if (this.target && this.elapsedRulesS - this.target.bornS >= T.targetLifetimeS) {
        this.clearTarget(T.targetRespawnS);
      }
    }
    this.stepPlayers(dt, input);
    this.stepBalls(dt);
  }

  private stepPlayers(dt: number, input: InputSource): void {
    const ridersByBase = new Map<Player, Player[]>();
    for (const p of this.players) {
      if (p.standingOn) {
        const list = ridersByBase.get(p.standingOn) ?? [];
        list.push(p);
        ridersByBase.set(p.standingOn, list);
      }
    }

    for (const p of this.players) {
      const { jumped, dashed } = p.applyInput(input.get(p.id, p), dt);
      if (jumped) {
        this.emit('jump', p);
        for (const rider of ridersByBase.get(p) ?? []) {
          rider.vy = -T.stackLaunchVy;
          rider.grounded = false;
          rider.standingOn = null;
          this.emit('bump', { x: rider.x, y: p.top, ink: p.id, kind: 'trampoline' } satisfies BumpEvent);
        }
      }
      if (dashed) this.emit('dash', p);
    }

    // Side pushing + dash-bump launch: players collide physically instead of phasing.
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.y, b.y) - Math.max(a.top, b.top);
        if (overlapX <= 0 || overlapY <= 12) continue; // 12px slack so stacking isn't treated as a shove
        const dir = a.x < b.x || (a.x === b.x && i < j) ? -1 : 1;
        const dirAtoB = (-dir) as 1 | -1;
        const half = overlapX / 2;
        a.x += dir * half;
        b.x -= dir * half;
        this.clampToWalls(a, b);
        if (resolvePlayerBump(a, b, dirAtoB, T)) {
          a.jolt(this.lastRenderTime);
          b.jolt(this.lastRenderTime);
          this.emit('bump', {
            x: (a.x + b.x) / 2,
            y: Math.min(a.y, b.y) - 28,
            ink: a.dashing ? a.id : b.id,
            kind: 'bump',
          } satisfies BumpEvent);
        }
      }
    }

    // Vertical: lowest players first so bases settle before riders land on them.
    const byHeight = [...this.players].sort((a, b) => b.y - a.y);
    for (const p of byHeight) p.integrateY(dt);
    for (const a of byHeight) {
      if (a.vy < 0) continue;
      for (const b of byHeight) {
        if (a === b) continue;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (overlapX > 6 && a.prevY <= b.top + 4 && a.y >= b.top) {
          a.landOn(b);
          break;
        }
      }
    }
    // Riders move with whoever they're standing on.
    for (const p of byHeight) {
      if (p.standingOn) p.x = Phaser.Math.Clamp(p.x + p.standingOn.dxThisFrame, p.w / 2, T.width - p.w / 2);
      if (p.landedThisFrame) this.emit('land', p);
    }
  }

  /** If a shove pushed one player into a wall, give the full separation to the other one. */
  private clampToWalls(a: Player, b: Player): void {
    const minX = a.w / 2;
    const maxX = T.width - a.w / 2;
    for (const [p, q] of [[a, b], [b, a]] as const) {
      if (p.x < minX) {
        q.x += minX - p.x;
        p.x = minX;
      } else if (p.x > maxX) {
        q.x -= p.x - maxX;
        p.x = maxX;
      }
    }
  }

  private stepBalls(dt: number): void {
    for (const ball of [...this.balls]) {
      ball.step(dt);
      if (ball.floatTime > 0) continue;

      if (ball.hitCooldown <= 0) {
        for (const p of this.players) {
          if (this.touching(ball, p)) {
            this.hitBall(ball, p);
            break;
          }
        }
      }

      if (this.target && Math.hypot(ball.x - this.target.x, ball.y - this.target.y) <= ball.r + T.targetRadius) {
        const hit: TargetHitEvent = { x: this.target.x, y: this.target.y, kind: this.target.kind, ball };
        this.clearTarget(T.targetRespawnS);
        this.emit('targetHit', hit);
      }

      if (entersDangerZone(ball.prevBottom, ball.bottom, T.dangerLineY)) {
        ball.inDanger = true;
        if (this.rules && this.combo > 0) {
          this.combo = 0;
          this.emit('comboBreak', ball);
        }
      } else if (ball.bottom < T.dangerLineY) {
        ball.inDanger = false;
      }

      if (ball.bottom >= T.floorY) {
        ball.y = T.floorY - ball.r;
        this.emit('floor', ball);
      }
    }

    // Mid-air ball-to-ball clacks
    for (let i = 0; i < this.balls.length; i++) {
      const a = this.balls[i];
      if (a.floatTime > 0) continue;
      for (let j = i + 1; j < this.balls.length; j++) {
        const b = this.balls[j];
        if (b.floatTime > 0) continue;
        if (resolveBallCollision(a, b, T)) {
          this.emit('ballCollide', {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            ink: a.target,
          } satisfies BumpEvent);
        }
      }
    }
  }

  /** Circle vs circle: characters are round, so the hit area matches what players see. */
  private touching(ball: Ball, p: Player): boolean {
    const pr = Math.min(p.w, p.h) / 2;
    const dx = ball.x - p.x;
    const dy = ball.y - (p.y - pr);
    const reach = ball.r + pr;
    if (dx * dx + dy * dy > reach * reach) return false;
    // Only when ball and player are closing vertically (falling ball, or player jumping into it).
    return ball.vy * ball.speedMult - p.vy > -100;
  }

  private hitBall(ball: Ball, p: Player): void {
    const hitter = p.id;
    let correct = true;
    if (this.rules) {
      const res = resolveHit(hitter, ball.target, this.combo, ball.speedMult, T);
      correct = res.correct;
      this.combo = res.combo;
      ball.speedMult = res.speedMult;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }

    const next = pickNextTarget(hitter, this.joinedIds, this.rng) as PlayerId;
    const jumpHit = !p.grounded && p.vy < 0;
    const dashPass = p.dashing;
    ball.y = Math.min(ball.y, p.top - ball.r);
    ball.spin = computeHitSpin(ball.x, p.x, ball.r + p.w / 2, p.vx, T);

    if (dashPass) {
      const mate = this.playerById(next);
      if (mate && mate !== p) {
        const v = solveDashPass({
          ballX: ball.x,
          ballY: ball.y,
          targetX: mate.x,
          landY: mate.top - ball.r,
          launchVy: T.dashPassVy,
          gravity: T.ballGravity,
          vxMax: T.dashPassVxMax,
        });
        ball.vx = v.vx;
        ball.vy = v.vy;
      } else {
        ball.vx = p.dashDir * T.dashPassSoloVx;
        ball.vy = -T.dashPassVy;
      }
    } else {
      ball.vy = -(jumpHit ? T.bounceJump : T.bounceNormal);
      const rawVx =
        Phaser.Math.Clamp((ball.x - p.x) * T.hitVxFactor, -T.hitVxMax, T.hitVxMax) +
        p.vx * T.playerVxTransfer +
        this.drift(ball, p, next);
      ball.vx = Phaser.Math.Clamp(rawVx, -T.hitVxMax * T.hitVxTransferClampMult, T.hitVxMax * T.hitVxTransferClampMult);
    }

    const clutch = ball.inDanger;
    ball.hitCooldown = T.hitCooldown;
    ball.inDanger = false;
    ball.setTarget(next);
    this.offscreen.get(ball)?.setTexture(RISO_KEYS.offscreen(next));
    const ev: HitEvent = { ball, player: p, correct, combo: this.combo, jumpHit, dashPass, clutch };
    this.emit('hit', ev);
  }

  /** Sideways nudge on a normal hit: toward the next target, or random in solo. */
  private drift(ball: Ball, hitter: Player, next: PlayerId): number {
    const mate = this.playerById(next);
    if (mate && mate !== hitter) return (Math.sign(mate.x - ball.x) || 1) * T.hitDriftToTarget;
    const dir = this.rng() < 0.5 ? -1 : 1;
    return dir * (T.soloDriftMin + (T.soloDriftMax - T.soloDriftMin) * this.rng());
  }

  private spawnTarget(): void {
    ensureTargetTexture(this.scene);
    const kind: 'bonus' | 'calm' = this.balls.some((b) => b.speedMult > T.targetCalmSpeedThreshold) ? 'calm' : 'bonus';
    const x = T.targetSpawnMarginX + Math.floor(this.rng() * (T.width - T.targetSpawnMarginX * 2));
    const y = T.targetSpawnMinY + Math.floor(this.rng() * (T.targetSpawnMaxY - T.targetSpawnMinY));
    const inkHex = kind === 'calm' ? INK_HEX.blue : INK_HEX.pink;
    const inkCss = kind === 'calm' ? INK.blue : INK.pink;
    const ring = this.scene.add.image(0, 0, RISO_KEYS.targetRing).setScale(S).setTint(inkHex).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const label = this.scene.add
      .text(0, 0, kind === 'calm' ? 'SLOW BALL' : '★ +250', risoText(10, inkCss, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    const container = this.scene.add.container(x, y, [ring, label]).setDepth(8);
    this.target = {
      x,
      y,
      kind,
      bornS: this.elapsedRulesS,
      spawnedAtMs: this.lastRenderTime,
      container,
      ring,
      label,
      shownScale: NaN,
      shownStep: -1,
      shownVis: true,
    };
  }

  private clearTarget(delayS: number): void {
    if (this.target) {
      this.target.container.destroy();
      this.target = null;
    }
    this.nextTargetAtS = this.elapsedRulesS + delayS;
  }

  render(dt: number, time: number): void {
    this.lastRenderTime = time;
    for (const p of this.players) p.render(dt, time, pickLookTarget(p.x, p.y - p.h / 2, p.id, this.balls, this.look));
    for (const b of this.balls) {
      b.render(dt, time);
      // Off-screen indicator pinned to the top edge when a ball flies above the screen.
      const ind = this.offscreen.get(b);
      if (ind) {
        const above = b.bottom < 0;
        ind.setVisible(above);
        if (above) {
          ind.setPosition(Phaser.Math.Clamp(b.x, 24, T.width - 24), 26);
          const sc = offscreenScale(b.y);
          if (this.offscreenShownScale.get(b) !== sc) {
            this.offscreenShownScale.set(b, sc);
            ind.setScale(S * sc);
          }
        }
      }
    }
    // Blinking arrow above every player who has at least one ball targeting them (stepped blink + bob).
    const bob = arrowBob(time);
    for (const p of this.players) {
      const arrow = this.arrows.get(p.id)!;
      let count = 0;
      for (const b of this.balls) if (b.target === p.id) count++;
      const on = count > 0 && arrowVisible(time, count > 1);
      arrow.setVisible(on);
      if (on) arrow.setPosition(p.x, p.top - 22 + bob);
    }

    if (this.target) {
      const t = this.target;
      const sc = slamScale(time - t.spawnedAtMs);
      if (sc !== t.shownScale) {
        t.shownScale = sc;
        t.container.setScale(sc);
      }
      const step = Math.floor(Math.max(0, time) / (STEP_MS * 2));
      if (step !== t.shownStep) {
        t.shownStep = step;
        t.ring.setRotation(step * 0.08);
      }
      const rem = T.targetLifetimeS - (this.elapsedRulesS - t.bornS);
      const vis = rem > T.targetBlinkWarningS || Math.floor(Math.max(0, time) / STEP_MS) % 2 === 0;
      if (vis !== t.shownVis) {
        t.shownVis = vis;
        t.container.setVisible(vis);
      }
    }
  }

  destroy(): void {
    this.clearTarget(0);
    for (const p of this.players) p.destroy();
    for (const b of [...this.balls]) this.removeBall(b);
    for (const a of this.arrows.values()) a.destroy();
    this.removeAllListeners();
  }
}
