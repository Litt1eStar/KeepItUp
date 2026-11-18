import Phaser from 'phaser';
import { CONTROL_ACTIONS, PLAYERS, type PlayerId } from '../config/players';

/** One frame of intent for a player, regardless of whether it came from keys, a pad or a bot. */
export interface PlayerInput {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
}

export const EMPTY_INPUT: PlayerInput = { left: false, right: false, jumpHeld: false, jumpPressed: false, dashPressed: false };

export interface InputSource {
  get(id: PlayerId): PlayerInput;
}

type KeySet = { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; jump: Phaser.Input.Keyboard.Key; dash: Phaser.Input.Keyboard.Key };

const STICK_DEADZONE = 0.35;
// Standard gamepad mapping: 0=A, 1=B, 2=X, 3=Y, 5=RB, 9=Start, 12-15=d-pad
const PAD_JUMP = [0];
const PAD_DASH = [1, 2, 5];
const PAD_START = [9];

/**
 * Merges keyboard + gamepads into PlayerInput per player.
 * Edge detection ("pressed this frame") is done here, so call update() exactly once per frame.
 */
export class InputManager implements InputSource {
  private keys: KeySet[] = [];
  private startKeys: Phaser.Input.Keyboard.Key[] = [];
  private fullscreenKey: Phaser.Input.Keyboard.Key;
  private latchHandlers = new Map<Phaser.Input.Keyboard.Key, () => void>();
  private latched = new Set<Phaser.Input.Keyboard.Key>();
  private prevJump = [false, false, false];
  private prevDash = [false, false, false];
  private prevStart = false;
  private prevAny = false;
  private current: PlayerInput[] = [EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT];
  private startPressedNow = false;
  private anyPressedNow = false;

  private readonly onFullscreen = (): void => {
    if (!this.isKeyBound('F')) this.scene.scale.toggleFullscreen();
  };

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.startKeys = [kb.addKey('SPACE'), kb.addKey('ENTER')];
    this.fullscreenKey = kb.addKey('F');
    this.fullscreenKey.on('down', this.onFullscreen);
    this.rebind();

    // Phaser reuses Key objects when a scene restarts, so drop our listeners on shutdown
    // (otherwise e.g. the fullscreen toggle would fire twice and cancel itself out).
    scene.events.once('shutdown', () => {
      this.clearKeyHandlers();
      this.fullscreenKey.off('down', this.onFullscreen);
    });
  }

  /** Rebuild player Key bindings from `PLAYERS` (call after rebinding keys in pause menu). */
  rebind(): void {
    const kb = this.scene.input.keyboard!;
    this.clearKeyHandlers();
    this.latched.clear();
    this.keys = PLAYERS.map((p) => ({
      left: kb.addKey(p.keys.left),
      right: kb.addKey(p.keys.right),
      jump: kb.addKey(p.keys.jump),
      dash: kb.addKey(p.keys.dash),
    }));
    // Latch presses from the DOM keydown event. Phaser's JustDown is cleared on keyup, so a
    // tap released before the next frame would otherwise be lost.
    for (const key of [...this.keys.flatMap((k) => [k.jump, k.dash]), ...this.startKeys]) {
      this.bindLatch(key);
    }
  }

  /** Drop any buffered key presses (e.g. when returning from the pause menu). */
  clearLatched(): void {
    this.latched.clear();
    this.startPressedNow = false;
    this.anyPressedNow = false;
    this.current = [EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT];
  }

  private bindLatch(key: Phaser.Input.Keyboard.Key): void {
    if (this.latchHandlers.has(key)) return;
    const handler = () => this.latched.add(key);
    key.on('down', handler);
    this.latchHandlers.set(key, handler);
  }

  private clearKeyHandlers(): void {
    for (const [key, handler] of this.latchHandlers) key.off('down', handler);
    this.latchHandlers.clear();
  }

  private isKeyBound(name: string): boolean {
    return PLAYERS.some((p) => CONTROL_ACTIONS.some((act) => p.keys[act] === name));
  }

  /** True if the key was pressed since the last update() (even if already released). */
  private consume(key: Phaser.Input.Keyboard.Key): boolean {
    return this.latched.delete(key);
  }

  private pad(index: number | null): Phaser.Input.Gamepad.Gamepad | null {
    if (index === null || !this.scene.input.gamepad) return null;
    const pads = this.scene.input.gamepad.getAll();
    return pads[index] ?? null;
  }

  private static btn(pad: Phaser.Input.Gamepad.Gamepad | null, ids: number[]): boolean {
    if (!pad) return false;
    return ids.some((i) => pad.buttons[i]?.pressed);
  }

  update(): void {
    let anyHeld = false;
    let anyEdge = false;
    for (const def of PLAYERS) {
      const k = this.keys[def.id];
      const pad = this.pad(def.gamepadIndex);
      const stickX = pad?.leftStick.x ?? 0;
      const left = k.left.isDown || (pad?.left ?? false) || stickX < -STICK_DEADZONE;
      const right = k.right.isDown || (pad?.right ?? false) || stickX > STICK_DEADZONE;
      // Keyboard edges come from the latched keydown events. Gamepads are polled, so we
      // edge-detect them ourselves.
      const kbJump = this.consume(k.jump);
      const kbDash = this.consume(k.dash);
      const padJump = InputManager.btn(pad, PAD_JUMP);
      const padDash = InputManager.btn(pad, PAD_DASH);
      const jumpPressed = kbJump || (padJump && !this.prevJump[def.id]);
      const dashPressed = kbDash || (padDash && !this.prevDash[def.id]);
      const jumpHeld = k.jump.isDown || padJump || kbJump;

      this.current[def.id] = { left, right, jumpHeld, jumpPressed, dashPressed };
      this.prevJump[def.id] = padJump;
      this.prevDash[def.id] = padDash;
      anyHeld ||= left || right || jumpHeld || k.dash.isDown || padDash;
      anyEdge ||= jumpPressed || dashPressed;
    }

    const padStart = this.scene.input.gamepad?.getAll().some((p) => InputManager.btn(p, PAD_START)) ?? false;
    const kbStart = this.startKeys.map((k) => this.consume(k)).some(Boolean);
    this.startPressedNow = kbStart || (padStart && !this.prevStart);
    this.prevStart = padStart;

    anyHeld ||= padStart || this.startKeys.some((k) => k.isDown);
    this.anyPressedNow = anyEdge || this.startPressedNow || (anyHeld && !this.prevAny);
    this.prevAny = anyHeld;
  }

  get(id: PlayerId): PlayerInput {
    return this.current[id];
  }

  /** Space / Enter / gamepad Start pressed this frame. */
  startPressed(): boolean {
    return this.startPressedNow;
  }

  /** Any player control or start pressed this frame (for idle timers / leaving attract mode). */
  anyPressed(): boolean {
    return this.anyPressedNow;
  }

  /** Number of connected gamepads (for lobby badges). */
  padConnected(index: number | null): boolean {
    return this.pad(index) !== null;
  }
}
