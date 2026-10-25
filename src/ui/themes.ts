/**
 * Visual themes — full revamp of chrome, board geometry, dice, and pawns.
 * Critical game logic never lives here; themes are client-only cosmetics.
 */

export type LudoThemeId =
  | 'rush'
  | 'felt'
  | 'neon'
  | 'ivory'
  | 'midnight'
  | 'king';

/** SVG board geometry / ornament — differs per theme. */
export type BoardShape = {
  boardRx: number;
  yardRx: number;
  yardWellRx: number;
  tileRx: number;
  homeTileRx: number;
  yardWellFill: string;
  yardWellStroke: string;
  yardWellStrokeW: number;
  yardSlotR: number;
  yardSlotFill: string;
  yardSlotStroke: string;
  yardSlotStrokeW: number;
  starGlyph: string;
  starSize: number;
  tileLift: boolean;
  yardGlow: boolean;
  outerStroke: string;
  outerStrokeW: number;
  /** wedges = classic triangles · diamond = rotated square · ring = thick ring only */
  center: 'wedges' | 'diamond' | 'ring';
  pawnStrokeW: number;
  pawnLabel: boolean;
  /** Solid flat yards (Ludo King) vs glossy gradients */
  flatYards: boolean;
  /** classic plastic guti · pin = Ludo King teardrop with white cap */
  pawnStyle: 'classic' | 'pin';
  /** Filled ★ vs outline star */
  starOutline: boolean;
};

export type ThemePalette = {
  id: LudoThemeId;
  label: string;
  /** Player primaries R/G/Y/B */
  players: readonly [string, string, string, string];
  highlights: readonly [string, string, string, string];
  darks: readonly [string, string, string, string];
  homePath: readonly [string, string, string, string];
  tileEmpty: string;
  tileBorder: string;
  tileSafe: string;
  tileStar: string;
  boardBg0: string;
  boardBg1: string;
  spinnerRing: string;
  spinnerCenter: string;
  pawnStroke: string;
  shape: BoardShape;
  /** CSS custom properties applied on `.ludo-sdk` */
  css: Record<string, string>;
  font: string;
};

const SHAPE_RUSH: BoardShape = {
  boardRx: 16,
  yardRx: 14,
  yardWellRx: 16,
  tileRx: 5,
  homeTileRx: 5,
  yardWellFill: 'rgba(255,255,255,0.42)',
  yardWellStroke: 'rgba(255,255,255,0.65)',
  yardWellStrokeW: 1.4,
  yardSlotR: 9.2,
  yardSlotFill: 'rgba(255,255,255,0.22)',
  yardSlotStroke: 'rgba(255,255,255,0.95)',
  yardSlotStrokeW: 2,
  starGlyph: '★',
  starSize: 12,
  tileLift: true,
  yardGlow: true,
  outerStroke: 'none',
  outerStrokeW: 0,
  center: 'wedges',
  pawnStrokeW: 1.2,
  pawnLabel: true,
  flatYards: false,
  pawnStyle: 'classic',
  starOutline: false,
};

const SHAPE_FELT: BoardShape = {
  boardRx: 6,
  yardRx: 4,
  yardWellRx: 3,
  tileRx: 2,
  homeTileRx: 2,
  yardWellFill: 'rgba(0,0,0,0.22)',
  yardWellStroke: 'rgba(253,230,138,0.45)',
  yardWellStrokeW: 1.2,
  yardSlotR: 8.5,
  yardSlotFill: 'rgba(0,0,0,0.18)',
  yardSlotStroke: 'rgba(253,230,138,0.7)',
  yardSlotStrokeW: 1.6,
  starGlyph: '✦',
  starSize: 11,
  tileLift: false,
  yardGlow: false,
  outerStroke: '#292524',
  outerStrokeW: 3,
  center: 'wedges',
  pawnStrokeW: 1.4,
  pawnLabel: true,
  flatYards: false,
  pawnStyle: 'classic',
  starOutline: false,
};

const SHAPE_NEON: BoardShape = {
  boardRx: 2,
  yardRx: 2,
  yardWellRx: 1,
  tileRx: 1,
  homeTileRx: 1,
  yardWellFill: 'rgba(0,0,0,0.55)',
  yardWellStroke: 'rgba(0,240,255,0.55)',
  yardWellStrokeW: 1.5,
  yardSlotR: 7.5,
  yardSlotFill: 'rgba(0,0,0,0.4)',
  yardSlotStroke: 'rgba(255,0,229,0.85)',
  yardSlotStrokeW: 1.8,
  starGlyph: '◆',
  starSize: 10,
  tileLift: false,
  yardGlow: true,
  outerStroke: '#ff00e5',
  outerStrokeW: 2,
  center: 'diamond',
  pawnStrokeW: 1.5,
  pawnLabel: false,
  flatYards: false,
  pawnStyle: 'classic',
  starOutline: false,
};

const SHAPE_IVORY: BoardShape = {
  boardRx: 22,
  yardRx: 18,
  yardWellRx: 20,
  tileRx: 8,
  homeTileRx: 8,
  yardWellFill: 'rgba(255,250,240,0.72)',
  yardWellStroke: 'rgba(139,115,85,0.35)',
  yardWellStrokeW: 1.2,
  yardSlotR: 9.8,
  yardSlotFill: 'rgba(212,196,168,0.35)',
  yardSlotStroke: 'rgba(62,50,38,0.35)',
  yardSlotStrokeW: 1.4,
  starGlyph: '✵',
  starSize: 13,
  tileLift: true,
  yardGlow: true,
  outerStroke: '#c4a574',
  outerStrokeW: 2,
  center: 'wedges',
  pawnStrokeW: 1.1,
  pawnLabel: true,
  flatYards: false,
  pawnStyle: 'classic',
  starOutline: false,
};

const SHAPE_MIDNIGHT: BoardShape = {
  boardRx: 0,
  yardRx: 0,
  yardWellRx: 0,
  tileRx: 0,
  homeTileRx: 0,
  yardWellFill: 'rgba(9,9,11,0.65)',
  yardWellStroke: 'rgba(212,175,55,0.55)',
  yardWellStrokeW: 1.5,
  yardSlotR: 8,
  yardSlotFill: 'rgba(0,0,0,0.45)',
  yardSlotStroke: '#d4af37',
  yardSlotStrokeW: 1.5,
  starGlyph: '★',
  starSize: 11,
  tileLift: false,
  yardGlow: false,
  outerStroke: '#d4af37',
  outerStrokeW: 2.5,
  center: 'ring',
  pawnStrokeW: 1.35,
  pawnLabel: true,
  flatYards: false,
  pawnStyle: 'classic',
  starOutline: false,
};

/** Exact Ludo King board language from reference screenshot. */
const SHAPE_KING: BoardShape = {
  boardRx: 2,
  yardRx: 6,
  yardWellRx: 10,
  tileRx: 0,
  homeTileRx: 0,
  yardWellFill: '#FFFFFF',
  yardWellStroke: '#FFFFFF',
  yardWellStrokeW: 0,
  /* Seat discs — sized so foot ring sits clearly in the middle of each pad */
  yardSlotR: 7.8,
  yardSlotFill: '#FFFFFF',
  yardSlotStroke: '#FFFFFF',
  yardSlotStrokeW: 0,
  starGlyph: '☆',
  starSize: 13,
  tileLift: false,
  yardGlow: false,
  outerStroke: '#2A3D5C',
  outerStrokeW: 2,
  center: 'wedges',
  pawnStrokeW: 1.6,
  pawnLabel: false,
  flatYards: true,
  pawnStyle: 'pin',
  starOutline: true,
};

export const LUDO_THEMES: Record<LudoThemeId, ThemePalette> = {
  rush: {
    id: 'rush',
    label: 'Rush',
    players: ['#FF303D', '#18D653', '#FFC21A', '#0785FF'],
    highlights: ['#FF5964', '#49F879', '#FFE45C', '#45B4FF'],
    darks: ['#B51224', '#008C37', '#D98B00', '#0054D6'],
    homePath: ['#F52D38', '#16B84A', '#FFB900', '#087BEB'],
    tileEmpty: '#F1F5F9',
    tileBorder: '#CBD5E1',
    tileSafe: '#FFF1B8',
    tileStar: '#F5A900',
    boardBg0: '#F8FAFC',
    boardBg1: '#F1F5F9',
    spinnerRing: '#071329',
    spinnerCenter: '#F8FAFC',
    pawnStroke: '#141018',
    shape: SHAPE_RUSH,
    font: '"Nunito", "Avenir Next", system-ui, sans-serif',
    css: {
      '--bg-main': '#07152e',
      '--bg-outer': '#172642',
      '--bg-panel': '#0b1933',
      '--border-panel': '#173d78',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#b8c6df',
      '--text-muted': '#8192b0',
      '--player-red': '#ff303d',
      '--player-green': '#18d653',
      '--player-yellow': '#ffc21a',
      '--player-blue': '#0785ff',
      '--board-frame': '#10264a',
      '--board-frame-hi': '#2861aa',
      '--btn-roll-start': '#ffe34d',
      '--btn-roll-end': '#ffae00',
      '--btn-text': '#10213c',
      '--dice-dock': '#0b2b56',
      '--badge-gold': '#ffc21a',
      '--radius-panel': '24px',
      '--radius-button': '20px',
      '--die-face-0': '#ffffff',
      '--die-face-1': '#f4f0ea',
      '--die-face-2': '#e4dcd0',
      '--die-edge': '#c4b49a',
      '--die-border': 'rgba(90, 70, 50, 0.15)',
      '--die-pip-0': '#3a322c',
      '--die-pip-1': '#1a1512',
      '--die-pip-2': '#0d0a08',
      '--die-radius': '12px',
      '--die-hint': '#a89884',
      '--die-dock-radius': '16px',
    },
  },
  felt: {
    id: 'felt',
    label: 'Felt',
    players: ['#E11D48', '#16A34A', '#EAB308', '#2563EB'],
    highlights: ['#FB7185', '#4ADE80', '#FDE047', '#60A5FA'],
    darks: ['#9F1239', '#15803D', '#A16207', '#1D4ED8'],
    homePath: ['#BE123C', '#15803D', '#CA8A04', '#1D4ED8'],
    tileEmpty: '#14532D',
    tileBorder: '#166534',
    tileSafe: '#FEF08A',
    tileStar: '#FACC15',
    boardBg0: '#166534',
    boardBg1: '#14532D',
    spinnerRing: '#1C1917',
    spinnerCenter: '#FEF3C7',
    pawnStroke: '#1C1917',
    shape: SHAPE_FELT,
    font: '"Georgia", "Times New Roman", serif',
    css: {
      '--bg-main': '#0c1f14',
      '--bg-outer': '#14532d',
      '--bg-panel': '#052e16',
      '--border-panel': '#854d0e',
      '--text-primary': '#fef3c7',
      '--text-secondary': '#d6d3d1',
      '--text-muted': '#a8a29e',
      '--player-red': '#e11d48',
      '--player-green': '#16a34a',
      '--player-yellow': '#eab308',
      '--player-blue': '#2563eb',
      '--board-frame': '#292524',
      '--board-frame-hi': '#a16207',
      '--btn-roll-start': '#fde68a',
      '--btn-roll-end': '#ca8a04',
      '--btn-text': '#1c1917',
      '--dice-dock': '#1c1917',
      '--badge-gold': '#fbbf24',
      '--radius-panel': '8px',
      '--radius-button': '6px',
      '--die-face-0': '#fef3c7',
      '--die-face-1': '#fde68a',
      '--die-face-2': '#e7c56a',
      '--die-edge': '#854d0e',
      '--die-border': '#a16207',
      '--die-pip-0': '#451a03',
      '--die-pip-1': '#1c1917',
      '--die-pip-2': '#0c0a09',
      '--die-radius': '4px',
      '--die-hint': '#854d0e',
      '--die-dock-radius': '6px',
    },
  },
  neon: {
    id: 'neon',
    label: 'Neon',
    players: ['#FF2D55', '#39FF14', '#FFF01F', '#00F0FF'],
    highlights: ['#FF6B8A', '#7CFF5C', '#FFF76A', '#5CFFF7'],
    darks: ['#C4002E', '#12A300', '#C4B800', '#0099A8'],
    homePath: ['#FF2D55', '#39FF14', '#FFF01F', '#00F0FF'],
    tileEmpty: '#1A1A2E',
    tileBorder: '#3D3D6B',
    tileSafe: '#2D1B4E',
    tileStar: '#FF00E5',
    boardBg0: '#0F0F1A',
    boardBg1: '#12122A',
    spinnerRing: '#000000',
    spinnerCenter: '#00F0FF',
    pawnStroke: '#FFFFFF',
    shape: SHAPE_NEON,
    font: '"Orbitron", "Segoe UI", system-ui, sans-serif',
    css: {
      '--bg-main': '#050510',
      '--bg-outer': '#0a0a1a',
      '--bg-panel': '#12122a',
      '--border-panel': '#ff00e5',
      '--text-primary': '#f0f0ff',
      '--text-secondary': '#a0a0d0',
      '--text-muted': '#606090',
      '--player-red': '#ff2d55',
      '--player-green': '#39ff14',
      '--player-yellow': '#fff01f',
      '--player-blue': '#00f0ff',
      '--board-frame': '#1a0033',
      '--board-frame-hi': '#ff00e5',
      '--btn-roll-start': '#00f0ff',
      '--btn-roll-end': '#ff00e5',
      '--btn-text': '#050510',
      '--dice-dock': '#1a0033',
      '--badge-gold': '#00f0ff',
      '--radius-panel': '4px',
      '--radius-button': '2px',
      '--die-face-0': '#0a0a1a',
      '--die-face-1': '#12122a',
      '--die-face-2': '#050510',
      '--die-edge': '#00f0ff',
      '--die-border': '#ff00e5',
      '--die-pip-0': '#5cfff7',
      '--die-pip-1': '#00f0ff',
      '--die-pip-2': '#0099a8',
      '--die-radius': '2px',
      '--die-hint': '#00f0ff',
      '--die-dock-radius': '2px',
      '--die-pip-radius': '2px',
    },
  },
  ivory: {
    id: 'ivory',
    label: 'Ivory',
    players: ['#C23B22', '#2F6F4E', '#C9A227', '#2B4C7E'],
    highlights: ['#E07A5F', '#5B9A78', '#E0C35A', '#5A7FB0'],
    darks: ['#8B2E1A', '#1F4A35', '#8A7018', '#1A3358'],
    homePath: ['#C23B22', '#2F6F4E', '#C9A227', '#2B4C7E'],
    tileEmpty: '#F7F1E5',
    tileBorder: '#D4C4A8',
    tileSafe: '#E8D5A3',
    tileStar: '#B8860B',
    boardBg0: '#FFFAF0',
    boardBg1: '#F0E6D3',
    spinnerRing: '#3E3226',
    spinnerCenter: '#FFFAF0',
    pawnStroke: '#3E3226',
    shape: SHAPE_IVORY,
    font: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
    css: {
      '--bg-main': '#f0e6d3',
      '--bg-outer': '#e8dcc8',
      '--bg-panel': '#fffaf0',
      '--border-panel': '#c4a574',
      '--text-primary': '#3e3226',
      '--text-secondary': '#5c4d3c',
      '--text-muted': '#8a7a66',
      '--player-red': '#c23b22',
      '--player-green': '#2f6f4e',
      '--player-yellow': '#c9a227',
      '--player-blue': '#2b4c7e',
      '--board-frame': '#8b7355',
      '--board-frame-hi': '#c4a574',
      '--btn-roll-start': '#c9a227',
      '--btn-roll-end': '#8a7018',
      '--btn-text': '#fffaf0',
      '--dice-dock': '#e8dcc8',
      '--badge-gold': '#8a7018',
      '--radius-panel': '16px',
      '--radius-button': '12px',
      '--die-face-0': '#fffaf0',
      '--die-face-1': '#f7f1e5',
      '--die-face-2': '#e8dcc8',
      '--die-edge': '#c4a574',
      '--die-border': '#8b7355',
      '--die-pip-0': '#5c4d3c',
      '--die-pip-1': '#3e3226',
      '--die-pip-2': '#2a2118',
      '--die-radius': '14px',
      '--die-hint': '#8a7a66',
      '--die-dock-radius': '14px',
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    players: ['#B91C1C', '#047857', '#B45309', '#1D4ED8'],
    highlights: ['#F87171', '#34D399', '#FBBF24', '#93C5FD'],
    darks: ['#7F1D1D', '#064E3B', '#78350F', '#1E3A8A'],
    homePath: ['#991B1B', '#065F46', '#92400E', '#1E40AF'],
    tileEmpty: '#18181B',
    tileBorder: '#3F3F46',
    tileSafe: '#27272A',
    tileStar: '#D4AF37',
    boardBg0: '#09090B',
    boardBg1: '#18181B',
    spinnerRing: '#D4AF37',
    spinnerCenter: '#09090B',
    pawnStroke: '#D4AF37',
    shape: SHAPE_MIDNIGHT,
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    css: {
      '--bg-main': '#09090b',
      '--bg-outer': '#18181b',
      '--bg-panel': '#09090b',
      '--border-panel': '#d4af37',
      '--text-primary': '#fafafa',
      '--text-secondary': '#a1a1aa',
      '--text-muted': '#71717a',
      '--player-red': '#b91c1c',
      '--player-green': '#047857',
      '--player-yellow': '#b45309',
      '--player-blue': '#1d4ed8',
      '--board-frame': '#27272a',
      '--board-frame-hi': '#d4af37',
      '--btn-roll-start': '#d4af37',
      '--btn-roll-end': '#a16207',
      '--btn-text': '#09090b',
      '--dice-dock': '#18181b',
      '--badge-gold': '#d4af37',
      '--radius-panel': '0px',
      '--radius-button': '0px',
      '--die-face-0': '#18181b',
      '--die-face-1': '#27272a',
      '--die-face-2': '#09090b',
      '--die-edge': '#d4af37',
      '--die-border': '#d4af37',
      '--die-pip-0': '#fbbf24',
      '--die-pip-1': '#d4af37',
      '--die-pip-2': '#a16207',
      '--die-radius': '0px',
      '--die-hint': '#d4af37',
      '--die-dock-radius': '0px',
    },
  },
  /** Ludo King reference — royal blue chrome, white path, white die, pin pawns. */
  king: {
    id: 'king',
    label: 'King',
    /* Saturated yard quads — match live Ludo King primaries */
    players: ['#F23B32', '#42C94F', '#FFDE00', '#2196F3'],
    highlights: ['#FF5A52', '#58E066', '#FFF04A', '#4AADFF'],
    darks: ['#C42822', '#2E9A38', '#D4B000', '#1769B8'],
    homePath: ['#F23B32', '#42C94F', '#FFDE00', '#2196F3'],
    tileEmpty: '#FFFFFF',
    tileBorder: '#6A6A6A',
    tileSafe: '#FFFFFF',
    tileStar: '#FFFFFF',
    boardBg0: '#FFFFFF',
    boardBg1: '#FFFFFF',
    spinnerRing: '#FFFFFF',
    spinnerCenter: '#FFFFFF',
    pawnStroke: '#FFFFFF',
    shape: SHAPE_KING,
    font: '"Nunito", "Avenir Next", system-ui, sans-serif',
    css: {
      '--bg-main': '#0f234e',
      '--bg-outer': '#0f234e',
      '--bg-panel': '#1a3366',
      '--border-panel': '#3d5a80',
      '--text-primary': '#ffffff',
      '--text-secondary': '#c5d4ff',
      '--text-muted': '#8fa3d9',
      '--player-red': '#f23b32',
      '--player-green': '#42c94f',
      '--player-yellow': '#ffde00',
      '--player-blue': '#2196f3',
      '--board-frame': '#0f234e',
      '--board-frame-hi': '#e8c84a',
      '--btn-roll-start': '#ffc107',
      '--btn-roll-end': '#ff9800',
      '--btn-text': '#0f234e',
      '--dice-dock': '#ffffff',
      '--dice-glow': '#e8c84a',
      '--badge-gold': '#e8c84a',
      '--radius-panel': '12px',
      '--radius-button': '14px',
      '--die-face-0': '#ffffff',
      '--die-face-1': '#f7f7f7',
      '--die-face-2': '#ebebeb',
      '--die-edge': '#bdbdbd',
      '--die-border': '#9e9e9e',
      '--die-pip-0': '#222222',
      '--die-pip-1': '#111111',
      '--die-pip-2': '#000000',
      '--die-radius': '7px',
      '--die-hint': '#9e9e9e',
      '--die-dock-radius': '8px',
      '--die-pip-radius': '50%',
    },
  },
};

export const THEME_IDS = Object.keys(LUDO_THEMES) as LudoThemeId[];

export function getTheme(id?: LudoThemeId | string | null): ThemePalette {
  if (id && id in LUDO_THEMES) return LUDO_THEMES[id as LudoThemeId];
  return LUDO_THEMES.rush;
}

/** Apply CSS vars + theme class on the mount root. */
export function applyThemeToElement(
  el: HTMLElement,
  theme: ThemePalette,
): void {
  for (const id of THEME_IDS) {
    el.classList.remove(`ludo-sdk--theme-${id}`);
  }
  el.classList.add(`ludo-sdk--theme-${theme.id}`);
  el.dataset.theme = theme.id;
  el.style.fontFamily = theme.font;
  for (const [k, v] of Object.entries(theme.css)) {
    el.style.setProperty(k, v);
  }
  // Keep color aliases in sync
  el.style.setProperty('--red', theme.players[0]);
  el.style.setProperty('--green', theme.players[1]);
  el.style.setProperty('--yellow', theme.players[2]);
  el.style.setProperty('--blue', theme.players[3]);
  el.style.setProperty('--gold', theme.css['--badge-gold'] ?? '#ffc21a');
}
