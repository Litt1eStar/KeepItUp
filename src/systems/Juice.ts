import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { INK, INK_HEX, hexToCss, type InkName } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, BOIL_VARIANTS, ensureFaintStamp } from '../art/textures';
import { slamScale } from '../art/motion';
import { STAMP_INK, stampTint, type StampId } from '../art/ui';
import { splatNeedsKeyline } from '../art/splat';
import {
  BANNER_FAINT_MS, BANNER_MS, LOCAL_STAMP_MS, SPLAT_HOLD_STEPS, SPLAT_SIZE_MUL, bannerPhase,
  popupRise, readableInk, splatScale, stampMinY, type SplatSize,
} from '../art/hud';
import { StampSlam } from '../art/views/StampSlam';
import { STAGE_QUIET_Y } from '../art/stage';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const DEPTH = { floorSplat: 4, splat: 30, popup: 50, stamp: 52, banner: 60 } as const;
const BANNER_Y = T.height / 2 - 60;
const POPUP_MIN_Y = STAGE_QUIET_Y + 20;

interface SplatFx {
  fill: Phaser.GameObjects.Image;
  line: Phaser.GameObjects.Image;
  born: number;
  base: number;
  hold: number;
  shown: number;
}

interface PopupFx {
  text: Phaser.GameObjects.Text;
  born: number;
  y: number;
  shown: number;
  /** Last style applied, so a recycled popup only restyles when it must (each change redraws the canvas). */
  color: string;
  size: number;
}

interface StampFx {
  id: StampId;
  slam: StampSlam;
  born: number;
  life: number;
  faint: number;
  faintShown: boolean;
  label: Phaser.GameObjects.Text | null;
  labelScale: number;
}

export interface BannerOpts {
  /** Anton text printed under the stamp (e.g. the combo number). */
  label?: string;
  ink?: InkName | number;
  /** ms before it disappears; Infinity = until the scene ends. */
  holdMs?: number;
  /** Extra ms to linger as a faint halftone ghost print after `holdMs`. */
  faintMs?: number;
  scale?: number;
}

/**
 * Riso game feel: ink splats, stepped Space Mono popups and rubber-stamp slams. Pooled where it
 * matters (splats and popups fire on every hit); everything is retired once its stepped schedule
 * ends, so nothing grows with play time. Call update(time) every frame (scene time, ms) — all
 * effects are timed from it, and spawns made during the frame use that time.
 */
export class Juice {
  private now = 0;
  private readonly splats: SplatFx[] = [];
  private readonly freeSplats: SplatFx[] = [];
  private readonly popups: PopupFx[] = [];
  private readonly freePopups: PopupFx[] = [];
  private readonly stamps: StampFx[] = [];
  private currentBanner: StampFx | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly rng: () => number = Math.random) {}

  /** Advance every effect to scene time tMs (stepped; Phaser objects only change on a new step). */
  update(tMs: number): void {
    this.now = tMs;
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      const k = splatScale(tMs - s.born, s.hold);
      if (k === 0) {
        s.fill.setVisible(false);
        s.line.setVisible(false);
        this.freeSplats.push(s);
        removeAt(this.splats, i);
      } else if (k !== s.shown) {
        s.shown = k;
        s.fill.setScale(S * s.base * k);
        s.line.setScale(S * s.base * k);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      const dy = popupRise(tMs - p.born);
      if (Number.isNaN(dy)) {
        p.text.setVisible(false);
        this.freePopups.push(p);
        removeAt(this.popups, i);
      } else if (dy !== p.shown) {
        p.shown = dy;
        p.text.y = p.y + dy;
      }
    }
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      const st = this.stamps[i];
      if (tMs - st.born >= st.life) {
        destroyStamp(st);
        removeAt(this.stamps, i);
      } else tickStamp(st, tMs);
    }
    const b = this.currentBanner;
    if (b) {
      const phase = bannerPhase(tMs - b.born, b.life, b.faint);
      if (phase === 'done') {
        destroyStamp(b);
        this.currentBanner = null;
      } else {
        if (phase === 'faint' && !b.faintShown) {
          b.faintShown = true;
          ensureFaintStamp(this.scene, b.id);
          b.slam.image.setTexture(RISO_KEYS.stampFaint(b.id));
          b.label?.setVisible(false);
        }
        tickStamp(b, tMs);
      }
    }
  }

  /**
   * Ink splat in `ink` at (x, y), MULTIPLY, random variant + rotation; yellow gets its black keyline.
   * Prints at full size, holds SPLAT_HOLD_STEPS steps (or `holdSteps`), shrinks in two steps, then recycles.
   * size 'floor' prints under the characters (depth 4), the rest over the action.
   */
  splat(x: number, y: number, ink: InkName, size: SplatSize = 'hit', holdSteps = SPLAT_HOLD_STEPS): void {
    const s = this.freeSplats.pop() ?? this.makeSplat();
    const v = Math.floor(this.rng() * BOIL_VARIANTS) % BOIL_VARIANTS;
    const rot = this.rng() * Math.PI * 2;
    const tint = INK_HEX[ink];
    const depth = size === 'floor' ? DEPTH.floorSplat : DEPTH.splat;
    s.born = this.now;
    s.base = SPLAT_SIZE_MUL[size];
    s.hold = holdSteps;
    s.shown = 1;
    s.fill.setTexture(RISO_KEYS.splat(v)).setTint(tint).setPosition(x, y).setRotation(rot)
      .setScale(S * s.base).setDepth(depth).setVisible(true);
    s.line.setTexture(RISO_KEYS.splatLine(v)).setPosition(x, y).setRotation(rot)
      .setScale(S * s.base).setDepth(depth).setVisible(splatNeedsKeyline(tint));
    this.splats.push(s);
  }

  /** Space Mono bold popup in `ink` (yellow prints black): rises in POPUP_RISE steps, then disappears. */
  popup(x: number, y: number, text: string, ink: InkName = 'black', size = 18): void {
    const p = this.freePopups.pop() ?? this.makePopup();
    p.born = this.now;
    y = Math.max(POPUP_MIN_Y, y); // balls fly above the screen; keep the text on the paper, under the HUD
    p.y = y;
    p.shown = 0;
    const color = INK[readableInk(ink)];
    if (color !== p.color || size !== p.size) {
      // colour + size in a single restyle (one redraw), only when they differ from the last use
      p.color = color;
      p.size = size;
      p.text.style.color = color;
      p.text.style.fontSize = `${size}px`;
      p.text.style.update(true);
    }
    p.text.setText(text).setPosition(x, y).setVisible(true);
    this.popups.push(p);
  }

  /** Small stamp slammed near a player (NICE / WRONG / PASS); gone after LOCAL_STAMP_MS. */
  stamp(id: StampId, x: number, y: number, ink: InkName | number = STAMP_INK[id], scale = 0.9): void {
    const rot = (this.rng() - 0.5) * 0.4;
    const slam = new StampSlam(this.scene, id, stampTint(ink), rot, scale);
    slam.image.setPosition(Phaser.Math.Clamp(x, 70, T.width - 70), Math.max(stampMinY(scale), y)).setDepth(DEPTH.stamp);
    slam.trigger(this.now);
    slam.tick(this.now);
    this.stamps.push({ id, slam, born: this.now, life: LOCAL_STAMP_MS, faint: 0, faintShown: false, label: null, labelScale: NaN });
  }

  /** Big centre stamp (+1 BALL, COMBO n, DROPPED). A new banner replaces the current one so they never overlap. */
  banner(id: StampId, opts: BannerOpts = {}): void {
    if (this.currentBanner) destroyStamp(this.currentBanner);
    const ink = stampTint(opts.ink ?? STAMP_INK[id]);
    const scale = opts.scale ?? 1.6;
    const slam = new StampSlam(this.scene, id, ink, -0.06, scale);
    slam.image.setPosition(T.width / 2, BANNER_Y).setDepth(DEPTH.banner);
    let label: Phaser.GameObjects.Text | null = null;
    if (opts.label) {
      label = this.scene.add.text(T.width / 2 + 6, BANNER_Y + 30 * scale, opts.label, risoText(56, hexToCss(ink)))
        .setOrigin(0.5, 0).setRotation(0.05).setBlendMode(MULTIPLY).setDepth(DEPTH.banner);
    }
    slam.trigger(this.now);
    const b: StampFx = {
      id,
      slam,
      born: this.now,
      life: opts.holdMs ?? BANNER_MS,
      faint: opts.faintMs ?? (id === 'COMBO' ? BANNER_FAINT_MS : 0),
      faintShown: false,
      label,
      labelScale: NaN,
    };
    tickStamp(b, this.now);
    this.currentBanner = b;
  }

  private makeSplat(): SplatFx {
    const fill = this.scene.add.image(0, 0, RISO_KEYS.splat(0)).setBlendMode(MULTIPLY);
    const line = this.scene.add.image(0, 0, RISO_KEYS.splatLine(0)).setBlendMode(MULTIPLY);
    return { fill, line, born: 0, base: 1, hold: SPLAT_HOLD_STEPS, shown: 1 };
  }

  private makePopup(): PopupFx {
    const text = this.scene.add.text(0, 0, '', risoText(18, INK.black, 'mono'))
      .setFontStyle('bold').setOrigin(0.5).setBlendMode(MULTIPLY).setDepth(DEPTH.popup);
    return { text, born: 0, y: 0, shown: 0, color: INK.black, size: 18 };
  }
}

function tickStamp(st: StampFx, tMs: number): void {
  st.slam.tick(tMs);
  if (st.label) {
    const k = slamScale(tMs - st.born);
    if (k !== st.labelScale) {
      st.labelScale = k;
      st.label.setScale(k);
    }
  }
}

function destroyStamp(st: StampFx): void {
  st.slam.destroy();
  st.label?.destroy();
}

/** Unordered O(1) removal (no splice allocation). */
function removeAt<T>(arr: T[], i: number): void {
  arr[i] = arr[arr.length - 1];
  arr.pop();
}
