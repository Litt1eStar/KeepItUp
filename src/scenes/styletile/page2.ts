import Phaser from 'phaser';
import { S } from '../../config/render';
import { PLAYERS } from '../../config/players';
import { INK, INK_HEX, PLAYER_INK } from '../../art/palette';
import { risoText } from '../../art/type';
import { RISO_KEYS } from '../../art/textures';
import { STAMP_IDS, STAMP_INK, TICKET, stampTint } from '../../art/ui';
import { splatNeedsKeyline } from '../../art/splat';
import { boilVariant } from '../../art/motion';
import { SLAM_PERIOD_MS, dotsFilledAt, periodIndex } from '../../art/styleTileMotion';
import { StampSlam } from '../../art/views/StampSlam';
import { MULTIPLY, caption, type TilePage } from './shared';

const TICKET_SCALE = 0.8;

export function buildPage2(scene: Phaser.Scene): TilePage {
  const root = scene.add.container(0, 0);
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { root.add(o); return o; };

  // ---- HUD mock (lives in the quiet top band by design)
  add(scene.add.text(16, 2, '12 840', risoText(48, INK.black)).setOrigin(0, 0));
  const comboG = add(scene.add.graphics().setBlendMode(MULTIPLY));
  comboG.lineStyle(2.5, INK_HEX.pink).strokeRoundedRect(-36, -17, 72, 34, 6).strokeRoundedRect(-32, -13, 64, 26, 4);
  const combo = add(scene.add.container(232, 34, [comboG, scene.add.text(0, 1, '×2.3', risoText(24, INK.pink)).setOrigin(0.5).setBlendMode(MULTIPLY)]));
  combo.setRotation(-0.1);
  add(scene.add.text(944, 6, '01:24', risoText(24, INK.black, 'mono')).setOrigin(1, 0).setFontStyle('bold'));
  const dots: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < 30; i++) dots.push(add(scene.add.image(330 + i * 14, 56, RISO_KEYS.dot).setScale(S * 1.2)));
  caption(scene, root, 330, 6, 'NEXT BALL IN', 0);

  // ---- tickets + JOINED slam
  caption(scene, root, 16, 84, 'TICKETS + JOINED STAMP (RE-SLAMS EVERY 3 S)');
  const tx = (i: number) => 16 + i * (TICKET.w * TICKET_SCALE + 10);
  PLAYERS.forEach((p) => add(scene.add.image(tx(p.id), 102, RISO_KEYS.ticket(p.id)).setOrigin(0).setScale(S * TICKET_SCALE)));
  const joined = new StampSlam(scene, 'JOINED', stampTint(PLAYER_INK[1]), -0.2, 0.7);
  // over the illustration/name area (ticket-local ~(110, 50)), clear of the controls line at y 99
  joined.image.setPosition(tx(1) + 110 * TICKET_SCALE, 102 + 50 * TICKET_SCALE);
  root.add(joined.image);

  // ---- splats
  caption(scene, root, 540, 84, 'SPLATS (YELLOW + KEYLINE)');
  const splats = PLAYERS.map((p, i) => {
    const tint = INK_HEX[PLAYER_INK[p.id]];
    const fill = add(scene.add.image(575 + i * 62, 140, RISO_KEYS.splat(i)).setScale(S).setTint(tint).setBlendMode(MULTIPLY));
    const line = splatNeedsKeyline(tint)
      ? add(scene.add.image(fill.x, fill.y, RISO_KEYS.splatLine(i)).setScale(S).setBlendMode(MULTIPLY))
      : null;
    return { fill, line };
  });

  // ---- receipt
  caption(scene, root, 730, 84, 'RECEIPT');
  add(scene.add.image(730, 102, RISO_KEYS.receipt).setOrigin(0).setScale(S * 0.85));

  // ---- stamps
  caption(scene, root, 16, 232, 'STAMPS (PINK · BLUE · BLACK ONLY)');
  const items = STAMP_IDS.map((id) => ({ id, w: scene.textures.get(RISO_KEYS.stamp(id)).getSourceImage().width * S }));
  const gap = 10;
  const total = items.reduce((a, b) => a + b.w, 0) + gap * (items.length - 1);
  const sc = Math.min(0.75, 690 / total);
  let x = 16;
  items.forEach((it, i) => {
    const w = it.w * sc;
    const cx = x + w / 2;
    add(
      scene.add.image(cx, 280, RISO_KEYS.stamp(it.id)).setScale(S * sc)
        .setTint(stampTint(STAMP_INK[it.id])).setBlendMode(MULTIPLY).setRotation(((i * 37) % 11 - 5) * 0.012),
    );
    x += w + gap * sc;
  });

  // ---- fonts
  caption(scene, root, 16, 330, 'FONTS');
  add(scene.add.text(16, 346, 'ANTON — KEEP IT UP!', risoText(34, INK.black)));
  add(scene.add.text(16, 396, 'SPACE MONO — j/l · i jump · k dash', risoText(16, INK.black, 'mono')).setFontStyle('bold'));
  add(scene.add.text(16, 424, 'Space Mono regular — 0123456789 01:24 ×2.3', risoText(12, INK.black, 'mono')));

  let lastDots = -1;
  let lastBoil = -1;
  let lastSlam = -1;
  const update = (t: number): void => {
    const n = dotsFilledAt(t);
    if (n !== lastDots) {
      lastDots = n;
      dots.forEach((d, i) => d.setTexture(i < n ? RISO_KEYS.dot : RISO_KEYS.dotEmpty));
    }
    const slam = periodIndex(t, SLAM_PERIOD_MS);
    if (slam !== lastSlam) {
      lastSlam = slam;
      joined.trigger(t);
    }
    joined.tick(t);
    const v = boilVariant(t);
    if (v !== lastBoil) {
      lastBoil = v;
      splats.forEach((s, i) => {
        s.fill.setTexture(RISO_KEYS.splat((i + v) % 3));
        s.line?.setTexture(RISO_KEYS.splatLine((i + v) % 3));
      });
    }
  };
  return { root, update };
}
