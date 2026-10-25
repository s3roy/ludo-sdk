/**
 * Hosted-room client — UI + intents only.
 * Never rolls dice or applies moves locally; host commands via `dispatch`.
 */
import { mountLudo, type LudoHandle, type LudoMountOptions } from '../sdk/mount';
import type { ColorId, GameMode, PlayerConfig } from '../core/types';
import type { LudoClientAction, LudoHostCommand } from '../sdk/room';
import type { LudoThemeId } from '../ui/themes';

export type HostedTransport = {
  /** Send an intent to your backend (which calls lobby.action). */
  send: (action: LudoClientAction) => void | Promise<void>;
  /**
   * Subscribe to host commands for this room.
   * Return an unsubscribe function.
   */
  subscribe: (handler: (cmd: LudoHostCommand) => void) => () => void;
};

export type HostedMountOptions = {
  roomId: string;
  mode?: GameMode;
  /** Seat colour assigned by lobby.join(). */
  myColor: ColorId;
  /** Current seat list from lobby (humans + AI fillers). */
  seats: PlayerConfig[];
  transport: HostedTransport;
  theme?: LudoThemeId | string;
  compact?: boolean;
  /** Fit + center board in mount (default true). */
  fill?: boolean;
  /** Arena match length (ms). */
  matchDurationMs?: number;
  sound?: LudoMountOptions['sound'];
  turnTimer?: LudoMountOptions['turnTimer'];
  onWin?: LudoMountOptions['onWin'];
  onDestroy?: LudoMountOptions['onDestroy'];
  onTurn?: LudoMountOptions['onTurn'];
  onMyTurn?: LudoMountOptions['onMyTurn'];
  onReady?: LudoMountOptions['onReady'];
};

export type HostedHandle = LudoHandle & {
  /** Stop transport subscription + tear down UI. */
  disconnect: () => void;
};

/**
 * Embed a hosted multiplayer client (server-authoritative).
 *
 * ```ts
 * const ui = mountHostedLudo('#board', {
 *   roomId, myColor, seats,
 *   theme: 'felt',
 *   transport: {
 *     send: (a) => socket.emit('ludo:action', a),
 *     subscribe: (fn) => { socket.on('ludo', fn); return () => socket.off('ludo', fn) },
 *   },
 * })
 * ```
 */
export function mountHostedLudo(
  el: string | HTMLElement,
  options: HostedMountOptions,
): HostedHandle {
  const handle = mountLudo(el, {
    roomId: options.roomId,
    mode: options.mode ?? 'rush',
    seats: options.seats,
    interactiveColors: [options.myColor],
    /** Always put this client’s yard at bottom-left. */
    boardFacing: options.myColor,
    controlled: true,
    autoAi: false,
    theme: options.theme ?? 'felt',
    compact: options.compact,
    fill: options.fill,
    matchDurationMs: options.matchDurationMs,
    sound: options.sound,
    // Decorative per-turn ring for every seat (server still enforces timeout)
    turnTimer:
      options.turnTimer === false
        ? false
        : options.turnTimer ?? {
            enabled: true,
            durationMs: 15_000,
            appliesTo: 'all',
            showRing: true,
            onTimeout: 'none',
            pauseWhileBusy: true,
          },
    absentSeat: { action: 'none' },
    onWin: options.onWin,
    onDestroy: options.onDestroy,
    onTurn: options.onTurn,
    onMyTurn: options.onMyTurn,
    onReady: options.onReady,
    onAction: async (action) => {
      await options.transport.send(action);
      return 'defer' as const;
    },
  });

  const unsub = options.transport.subscribe((cmd) => {
    handle.dispatch(cmd);
  });

  return {
    ...handle,
    disconnect: () => {
      unsub();
      handle.destroyRoom('client', true);
    },
  };
}
