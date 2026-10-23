export { createGame, LudoGame } from './core/game';
export {
  listLegalMoves,
  rollDice,
  rollDiceUpTo,
  countFinished,
  hasWon,
} from './core/moves';
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
  createLudoRoomHost,
  roomConfigFromHost,
  type LudoRoomHost,
  type LudoRoomHostOptions,
} from './sdk/host';

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

/** Server lobby — you pick players, SDK runs the room. */
export {
  createLudoLobby,
  type LudoLobby,
  type LudoLobbyOptions,
  type CreateLobbyRoomInput,
  type CreateMatchInput,
  type CreateMatchPlayer,
  type CreateMatchOk,
  type LobbyPlayer,
  type LobbyRoomStatus,
  type JoinOk,
  type JoinErr,
  type MissTurnAction,
  type RoomLifecyclePolicy,
  type NormalizedRoomPolicy,
} from './server/lobby';

/**
 * Optional in-process queue helper for demos.
 * Prefer matching users in your backend, then `lobby.createMatch({ players })`.
 */
export {
  createLudoMatchmaker,
  type LudoMatchmaker,
  type LudoMatchmakerOptions,
  type MatchTableConfig,
  type PlayInput,
  type PlayResult,
  type PlayQueued,
  type PlayMatched,
  type QueueUpdate,
} from './server/matchmaker';

/** Room lifecycle defaults. */
export {
  normalizeRoomPolicy,
  DEFAULT_ROOM_POLICY,
} from './server/policy';

/** Hosted client — UI + intents only. */
export {
  mountHostedLudo,
  type HostedMountOptions,
  type HostedHandle,
  type HostedTransport,
} from './client/hosted';

/** Visual themes (client cosmetics). */
export {
  LUDO_THEMES,
  THEME_IDS,
  getTheme,
  applyThemeToElement,
  type LudoThemeId,
  type ThemePalette,
} from './ui/themes';

/** Board facing — put your color bottom-left. */
export {
  BOARD_CORNERS,
  boardRotationDeg,
  visualCornerForColor,
  type BoardCorner,
} from './ui/boardFacing';
