import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { PLAYERS, type PlayerId } from '../config/players';
import { Player } from '../entities/Player';
import { Ball } from '../entities/Ball';
import type { InputSource } from '../input/InputManager';
import { entersDangerZone, pickNextTarget, pickSpawnTarget, resolveHit } from '../logic/TurnSystem';
import { solveDashPass } from '../logic/dashPass';

export interface HitEvent {
  ball: Ball;
  player: Player;
  correct: boolean;
  combo: number;
  jumpHit: boolean;
  dashPass: boolean;
}

/**
 * Shared simulation: players, balls, collisions and the turn rules.
 * Used by the game (rules on) and by the lobby practice area (rules off, ball can't fail).
 *
 * Events: 'hit' (HitEvent), 'comboBreak' (ball), 'floor' (ball), 'jump' (player), 'dash' (player)
 */
export class World extends Phaser.Events.EventEmitter {
  players: Player[] = [];
  balls: Ball[] = [];
  combo = 0;
  bestCombo = 0;
  private arrows = new Map<PlayerId, Phaser.GameObjects.Image>();
  private offscreen = new Map<Ball, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    /** When false (lobby practice), hits don't affect combo or speed. */
    readonly rules: boolean,
    private readonly rng: () => number = Math.random,
  ) {
    super();
  }

  get joinedIds(): PlayerId[] {
    return this.players.map((p) => p.id);
  }

  playerById(id: PlayerId): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  addPlayer(id: PlayerId): Player {
    const existing = this.playerById(id);
    if (existing) return existing;
    const p = new Player(this.scene, PLAYERS[id]);
    this.players.push(p);
    this.arrows.set(id, this.scene.add.image(p.x, p.top - 30, `arrow${id}`).setScale(S).setDepth(15).setVisible(false));
    return p;
  }

  spawnBall(x?: number, floatTime = 1.2): Ball {
    const target = pickSpawnTarget(this.joinedIds, this.balls.map((b) => b.target), this.rng) as PlayerId;
    const bx = x ?? Phaser.Math.Between(140, T.width - 140);
    const ball = new Ball(this.scene, bx, 120, target, floatTime); // below the HUD strip
    this.balls.push(ball);
    this.offscreen.set(ball, this.scene.add.image(bx, 18, `offscreen${target}`).setScale(S).setDepth(48) /* above HUD text */.setVisible(false));
    return ball;
  }

  removeBall(ball: Ball): void {
    ball.destroy();
    this.offscreen.get(ball)?.destroy();
    this.offscreen.delete(ball);
    this.balls = this.balls.filter((b) => b !== ball);
  }

  step(dt: number, input: InputSource): void {
    this.stepPlayers(dt, input);
    this.stepBalls(dt);
  }

  private stepPlayers(dt: number, input: InputSource): void {
    for (const p of this.players) {
      const { jumped, dashed } = p.applyInput(input.get(p.id), dt);
      if (jumped) this.emit('jump', p);
      if (dashed) this.emit('dash', p);
    }

    // Side pushing: players can't overlap, so the team has to split up zones.
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.y, b.y) - Math.max(a.top, b.top);
        if (overlapX <= 0 || overlapY <= 12) continue; // 12px slack so stacking isn't treated as a shove
        const dir = a.x < b.x || (a.x === b.x && i < j) ? -1 : 1;
        const half = overlapX / 2;
        a.x += dir * half;
        b.x -= dir * half;
        this.clampToWalls(a, b);
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
      ball.vx = Phaser.Math.Clamp((ball.x - p.x) * T.hitVxFactor, -T.hitVxMax, T.hitVxMax) + this.drift(ball, p, next);
    }

    ball.hitCooldown = T.hitCooldown;
    ball.inDanger = false;
    ball.setTarget(next);
    this.offscreen.get(ball)?.setTexture(`offscreen${next}`);
    const ev: HitEvent = { ball, player: p, correct, combo: this.combo, jumpHit, dashPass };
    this.emit('hit', ev);
  }

  /** Sideways nudge on a normal hit: toward the next target, or random in solo. */
  private drift(ball: Ball, hitter: Player, next: PlayerId): number {
    const mate = this.playerById(next);
    if (mate && mate !== hitter) return (Math.sign(mate.x - ball.x) || 1) * T.hitDriftToTarget;
    const dir = this.rng() < 0.5 ? -1 : 1;
    return dir * (T.soloDriftMin + (T.soloDriftMax - T.soloDriftMin) * this.rng());
  }

  render(dt: number, time: number): void {
    for (const p of this.players) p.render(dt);
    for (const b of this.balls) {
      b.render(dt, time);
      // Off-screen indicator pinned to the top edge when a ball flies above the screen.
      const ind = this.offscreen.get(b);
      if (ind) {
        const above = b.bottom < 0;
        ind.setVisible(above);
        if (above) ind.setPosition(Phaser.Math.Clamp(b.x, 24, T.width - 24), 26).setScale(S * Phaser.Math.Clamp(1.2 - -b.y / 600, 0.6, 1.2));
      }
    }
    // Blinking arrow above every player who has at least one ball targeting them.
    for (const p of this.players) {
      const arrow = this.arrows.get(p.id)!;
      const count = this.balls.filter((b) => b.target === p.id).length;
      const blinkRate = count > 1 ? 0.018 : 0.01;
      arrow.setVisible(count > 0 && Math.sin(time * blinkRate) > -0.3);
      arrow.setPosition(p.x, p.top - 26 + Math.sin(time * 0.012) * 4);
    }
  }

  destroy(): void {
    for (const p of this.players) p.destroy();
    for (const b of [...this.balls]) this.removeBall(b);
    for (const a of this.arrows.values()) a.destroy();
    this.removeAllListeners();
  }
}
