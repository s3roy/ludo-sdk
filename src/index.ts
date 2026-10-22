export { createGame, LudoGame } from './core/game';
export { listLegalMoves, rollDice, countFinished, hasWon } from './core/moves';
export {
  advanceToken,
  enterBoard,
  moveWaypoints,
  progressScore,
} from './core/path';
export {
  chooseAiMove,
  playAiTurn,
  playAiStep,
  currentPlayerIsAi,
  type AiDifficulty,
} from './core/ai';
export {
  COLORS,
  COLOR_NAMES,
  COLOR_HEX,
  COLOR_HIGHLIGHT,
  COLOR_DARK,
  COLOR_PANEL,
  COLOR_BORDER,
  HOME_PATH_HEX,
  TRACK_LEN,
  HOME_LEN,
  START_INDEX,
  HOME_ENTRY_INDEX,
  SAFE_TRACK,
  GAME_MODES,
  tokensToWin,
  canEnterOnRoll,
  nextColor,
  isSafeSquare,
  seatColorsForCount,
} from './core/constants';
export type {
  ColorId,
  GameMode,
  PlayerKind,
  SeatPresence,
  TokenState,
  PlayerConfig,
  Token,
  LegalMove,
  GamePhase,
  GameEvent,
  GameState,
  EngineOptions,
} from './core/types';

export {
  mountLudo,
  mountLudoRoom,
  createLudoGame,
  offlineRoom,
  type LudoMountOptions,
  type LudoHandle,
  type TurnTimerAutoAction,
  type TurnTimerConfig,
  type TurnTimerSnapshot,
  type TurnTimerTickContext,
  type TurnTimeoutContext,
  type AbsentSeatConfig,
  type AbsentSeatAction,
  type RoomDestroyReason,
  type TurnChangeContext,
  type WinContext,
  type DestroyContext,
  type LegalMovesContext,
  type PresenceChangeContext,
  type LudoLifecycleCallbacks,
} from './sdk/mount';

export type {
  LudoRoomConfig,
  LudoClientAction,
  LudoHostCommand,
  ActionContext,
  ActionResult,
} from './sdk/room';

export {
  normalizeTurnTimer,
  DEFAULT_TURN_TIMER,
  type TurnTimerAppliesTo,
} from './sdk/turnTimer';

export {
  isSeatPresent,
  isSeatAbsent,
  isSeatAwaiting,
  normalizePresence,
  presenceLabel,
  withPresence,
} from './sdk/presence';

export { LudoSounds, type SoundName, type SoundOptions } from './audio/sounds';
