import type { AiDifficulty } from '../core/ai';
import { COLOR_NAMES, seatColorsForCount } from '../core/constants';
import type { ColorId, GameEvent, GameMode, GameState, PlayerConfig } from '../core/types';

/**
 * Room config — typically created by your backend, then passed into the SDK.
 * The SDK never creates multiplayer rooms itself; it renders + runs rules.
 */
export type LudoRoomConfig = {
  roomId: string;
  mode: GameMode;
  /** 2–4 seats */
  seats: PlayerConfig[];
  /** Which colors this client may control (empty = spectator). */
  interactiveColors?: ColorId[];
  /** Local AI for empty seats (offline / bots). Off when fully host-driven. */
  autoAi?: boolean;
  aiDifficulty?: AiDifficulty;
  /** When true, local roll/move are intents only — host must applyDice/syncState. */
  controlled?: boolean;
};

/** Intent from a client UI (send to your backend). */
export type LudoClientAction =
  | { type: 'roll'; roomId: string; color: ColorId }
  | { type: 'move'; roomId: string; color: ColorId; tokenId: string };

/** Commands your backend pushes to clients. */
export type LudoHostCommand =
  | { type: 'sync'; state: GameState; event?: GameEvent | null }
  | { type: 'dice'; value: number }
  | { type: 'play'; tokenId: string }
  | {
      type: 'config';
      mode?: GameMode;
      aiDifficulty?: AiDifficulty;
      autoAi?: boolean;
      interactiveColors?: ColorId[];
    };

export type ActionContext = {
  state: GameState;
  roomId?: string;
};

/**
 * Return from `onAction`:
 * - `'allow'` — apply locally (offline / trusted)
 * - `'defer'` — wait for host `applyDice` / `syncState` / `applyMove`
 * - `{ dice }` — allow roll using host-provided face
 */
export type ActionResult =
  | 'allow'
  | 'defer'
  | { dice: number };

export function roomToMountPlayers(room: LudoRoomConfig): {
  players: PlayerConfig[];
  aiColors: ColorId[];
} {
  const seats = room.seats.slice(0, 4);
  const aiColors = seats.filter((s) => s.kind === 'ai').map((s) => s.color);
  return { players: seats, aiColors };
}

/** Helper: build a local offline room (1 human + AI). */
export function offlineRoom(opts: {
  roomId?: string;
  mode?: GameMode;
  players?: number;
  aiDifficulty?: AiDifficulty;
  humanColor?: ColorId;
}): LudoRoomConfig {
  const n = Math.min(4, Math.max(2, opts.players ?? 4));
  const human = opts.humanColor ?? 0;
  const colors = seatColorsForCount(n, human);
  const seats: PlayerConfig[] = colors.map((color) => ({
    id: `seat-${color}`,
    name: COLOR_NAMES[color][0].toUpperCase() + COLOR_NAMES[color].slice(1),
    kind: color === human ? 'human' : 'ai',
    color,
  }));
  return {
    roomId: opts.roomId ?? `local-${Date.now()}`,
    mode: opts.mode ?? 'rush',
    seats,
    interactiveColors: [human],
    autoAi: true,
    aiDifficulty: opts.aiDifficulty ?? 'hard',
    controlled: false,
  };
}
