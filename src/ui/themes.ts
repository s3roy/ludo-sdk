/**
 * Visual themes — chrome (CSS) + board/pawn palette (SVG).
 * Critical game logic never lives here; themes are client-only cosmetics.
 */

export type LudoThemeId =
  | 'rush'
  | 'felt'
  | 'neon'
  | 'ivory'
  | 'midnight';

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
  /** CSS custom properties applied on `.ludo-sdk` */
  css: Record<string, string>;
  font: string;
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
