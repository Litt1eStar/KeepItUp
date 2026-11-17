import Phaser from 'phaser';
import { PLAYERS, type Shape } from '../config/players';
import { TUNING as T } from '../config/tuning';
import { RS } from '../config/render';

type Ctx = CanvasRenderingContext2D;

/**
 * Generates all art from code with Canvas 2D at render resolution (RS), so it stays sharp
 * on big booth screens. Images using these textures are displayed at scale S = 1/RS.
 *
 * To swap in real art later: load images with the same keys here
 * (bg, player0-2, ball0-2, arrow0-2, offscreen0-2, spark), drawn at RS× size.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeBackground();
    for (const p of PLAYERS) {
      this.makePlayer(`player${p.id}`, p.color, p.shape);
      this.makeBall(`ball${p.id}`, p.color, p.shape);
      this.makeArrow(`arrow${p.id}`, p.color, p.shape, false);
      this.makeArrow(`offscreen${p.id}`, p.color, p.shape, true);
    }
    this.canvasTexture('spark', 16, 16, (ctx) => {
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
    });

    this.scene.start('Lobby');
  }

  /** Create a canvas texture of logical size w×h, drawn at RS× resolution. */
  private canvasTexture(key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, Math.ceil(w * RS), Math.ceil(h * RS))!;
    const ctx = tex.getContext();
    ctx.save();
    ctx.scale(RS, RS);
    draw(ctx);
    ctx.restore();
    tex.refresh();
  }

  private makeBackground(): void {
    const W = T.width;
    const H = T.height;
    const F = T.floorY;
    this.canvasTexture('bg', W, H, (ctx) => {
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, F);
      sky.addColorStop(0, '#0f1230');
      sky.addColorStop(0.55, '#2a2356');
      sky.addColorStop(1, '#53306b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, F);

      // Soft glow behind the play area
      const glow = ctx.createRadialGradient(W / 2, F - 40, 20, W / 2, F - 40, 520);
      glow.addColorStop(0, 'rgba(255,140,190,0.28)');
      glow.addColorStop(1, 'rgba(255,140,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, F);

      // Stars (seeded so the sky is the same every time)
      const rand = seeded(7);
      for (let i = 0; i < 140; i++) {
        const x = rand() * W;
        const y = rand() * F * 0.7;
        const r = 0.4 + rand() * 1.3;
        ctx.globalAlpha = 0.25 + rand() * 0.6 * (1 - y / F);
        ctx.fillStyle = rand() < 0.15 ? '#ffe9a8' : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Moon
      // Placed in a gap that's clear of the lobby panels and the in-game HUD.
      const mx = 775;
      const my = 66;
      const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 90);
      halo.addColorStop(0, 'rgba(255,240,220,0.35)');
      halo.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - 90, my - 90, 180, 180);
      ctx.fillStyle = '#fff3df';
      ctx.beginPath();
      ctx.arc(mx, my, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,180,170,0.35)';
      for (const [cx, cy, cr] of [[-7, -5, 5], [8, 6, 3.5], [3, -11, 2.5]]) {
        ctx.beginPath();
        ctx.arc(mx + cx, my + cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hills (two parallax layers)
      hills(ctx, W, F, F - 95, 38, 0.006, 1.3, '#3a2558', 0.9);
      hills(ctx, W, F, F - 55, 26, 0.011, 4.1, '#2a1b45', 1);

      // Floor
      const floor = ctx.createLinearGradient(0, F, 0, H);
      floor.addColorStop(0, '#4a3878');
      floor.addColorStop(0.15, '#33275a');
      floor.addColorStop(1, '#17112b');
      ctx.fillStyle = floor;
      ctx.fillRect(0, F, W, H - F);
      // Lit floor edge
      ctx.fillStyle = '#b9a6ff';
      ctx.fillRect(0, F, W, 2);
      const edge = ctx.createLinearGradient(0, F - 10, 0, F);
      edge.addColorStop(0, 'rgba(185,166,255,0)');
      edge.addColorStop(1, 'rgba(185,166,255,0.22)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, F - 10, W, 10);
      // Floor planks
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, F + 6);
        ctx.lineTo(x - 18 + 0.5, H);
        ctx.stroke();
      }

      // Vignette
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    });
  }

  private makePlayer(key: string, color: number, shape: Shape): void {
    const w = T.playerWidth;
    const h = T.playerHeight;
    const pad = 3;
    // Round character: a circle of diameter w that sits on the bottom edge of the texture
    // (sprite origin is 0.5, 1). All face features are proportional to the radius, so the
    // character can be resized from tuning.ts.
    this.canvasTexture(key, w + pad * 2, h + pad, (ctx) => {
      const r = Math.min(w, h) / 2;
      const cx = pad + w / 2;
      const cy = pad + h - r;
      const k = r / 28; // feature scale relative to the 56 px design size

      // Body
      const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.15, cx, cy, r);
      body.addColorStop(0, css(lighten(color, 0.4)));
      body.addColorStop(0.55, css(color));
      body.addColorStop(1, css(darken(color, 0.7)));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = css(darken(color, 0.42));
      ctx.stroke();

      // Gloss
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.38, cy - r * 0.55, r * 0.3, r * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Face is shifted toward +x (the way the character faces; the sprite flips with facing)
      const fx = cx + r * 0.12;

      // Eyes
      for (const ex of [fx - 9 * k, fx + 9 * k]) {
        const ey = cy - 7 * k;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 6.5 * k, 7.5 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = css(darken(color, 0.4));
        ctx.stroke();
        ctx.fillStyle = '#1a1426';
        ctx.beginPath();
        ctx.arc(ex + 2 * k, ey - 1.2 * k, 3.6 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex + 3 * k, ey - 2.6 * k, 1.3 * k, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mouth: a small open smile
      ctx.fillStyle = '#3a1020';
      ctx.beginPath();
      ctx.arc(fx, cy + 5 * k, 5 * k, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath();
      ctx.arc(fx, cy + 8.2 * k, 2.4 * k, 0, Math.PI, false);
      ctx.fill();

      // Cheeks
      ctx.fillStyle = 'rgba(255,120,150,0.5)';
      for (const chx of [fx - 15 * k, fx + 15 * k]) {
        ctx.beginPath();
        ctx.ellipse(chx, cy + 3 * k, 3.6 * k, 2.3 * k, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shape badge on the back of the body, like a sticker (colorblind-friendly identity).
      // Dark outline so it still reads on the yellow character.
      shapePath(ctx, shape, cx - r * 0.6, cy + r * 0.2, 5.5 * k);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = css(darken(color, 0.42));
      ctx.stroke();
    });
  }

  private makeBall(key: string, color: number, shape: Shape): void {
    const r = T.ballRadius;
    const pad = 4;
    const s = r * 2 + pad * 2;
    this.canvasTexture(key, s, s, (ctx) => {
      const c = s / 2;
      const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
      g.addColorStop(0, css(lighten(color, 0.55)));
      g.addColorStop(0.5, css(color));
      g.addColorStop(1, css(darken(color, 0.6)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r - 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = css(darken(color, 0.4));
      ctx.stroke();

      // Rim light
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.beginPath();
      ctx.arc(c, c, r * 0.85, 0.15 * Math.PI, 0.6 * Math.PI);
      ctx.stroke();

      // Shape
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff';
      // Shape icon scales with the ball radius (configurable in tuning.ts)
      shapePath(ctx, shape, c, c + (shape === 'triangle' ? r * 0.06 : 0), r * 0.38);
      ctx.fill();
      ctx.restore();

      // Specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(c - r * 0.4, c - r * 0.48, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makeArrow(key: string, color: number, shape: Shape, up: boolean): void {
    const w = 46;
    const h = 56;
    this.canvasTexture(key, w, h, (ctx) => {
      const cx = w / 2;
      // Triangle, pointing down (turn arrow) or up (off-screen indicator)
      const tipY = up ? 8 : h - 8;
      const baseY = up ? 32 : 24;
      ctx.save();
      ctx.shadowColor = css(color);
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, tipY);
      ctx.lineTo(cx + 15, baseY);
      ctx.lineTo(cx - 15, baseY);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.fillStyle = css(color);
      ctx.fill();
      ctx.restore();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      // Shape tag
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      shapePath(ctx, shape, cx, up ? 44 : 12, 5.5);
      ctx.fill();
      ctx.restore();
    });
  }
}

// ---- drawing helpers ----

function shapePath(ctx: Ctx, shape: Shape, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'triangle': {
      // Slightly rounded triangle
      const pts: [number, number][] = [
        [cx, cy - size * 1.05],
        [cx + size, cy + size * 0.75],
        [cx - size, cy + size * 0.75],
      ];
      roundedPolygon(ctx, pts, size * 0.18);
      break;
    }
    case 'circle':
      ctx.arc(cx, cy, size * 0.95, 0, Math.PI * 2);
      break;
    case 'square':
      roundRect(ctx, cx - size * 0.82, cy - size * 0.82, size * 1.64, size * 1.64, size * 0.22);
      break;
  }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundedPolygon(ctx: Ctx, pts: [number, number][], r: number): void {
  const n = pts.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    ctx.arcTo(p[0], p[1], next[0], next[1], r);
  }
  ctx.closePath();
}

function hills(ctx: Ctx, W: number, F: number, baseY: number, amp: number, freq: number, phase: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, F);
  for (let x = 0; x <= W; x += 4) {
    const y = baseY - amp * (0.6 * Math.sin(x * freq + phase) + 0.4 * Math.sin(x * freq * 2.3 + phase * 1.7));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, F);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function lighten(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red + (255 - c.red) * f, c.green + (255 - c.green) * f, c.blue + (255 - c.blue) * f);
}

function darken(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red * f, c.green * f, c.blue * f);
}
