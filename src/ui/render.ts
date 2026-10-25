import { COLOR_NAMES, SAFE_TRACK, START_INDEX } from '../core/constants';
import type { ColorId, GameState, LegalMove, Token } from '../core/types';
import {
  BOARD_PX,
  CELL,
  FINISH_HALF,
  homeColumnCell,
  stackPixelOffset,
  tokenPixel,
  trackToCell,
  YARD_WELL_INSET_FLAT,
  yardSlotPixels,
} from './boardLayout';
import { PIN_TIP_PLANT, placeTokenAt, tokenTranslateKey } from './placeToken';
import { getTheme, type ThemePalette } from './themes';

export type BoardBaseOptions = {
  /** Color whose yard is labeled "You" (also usually board-facing). Default 0. */
  facingColor?: ColorId;
};

/** Static board artwork — theme-aware geometry + palette. */
export function renderBoardBase(
  themeInput?: ThemePalette | string,
  baseOpts?: BoardBaseOptions,
): string {
  const theme = typeof themeInput === 'string' || !themeInput
    ? getTheme(themeInput)
    : themeInput;
  void baseOpts; // facingColor used by HTML yard tags in mount, not SVG
  const YARD = theme.players;
  const sh = theme.shape;
  const parts: string[] = [];

  parts.push(`
    <defs>
      <linearGradient id="ludoBoardBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.boardBg0}"/>
        <stop offset="100%" stop-color="${theme.boardBg1}"/>
      </linearGradient>
      <linearGradient id="ludoTile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lighten(theme.tileEmpty, 0.35)}"/>
        <stop offset="100%" stop-color="${theme.tileEmpty}"/>
      </linearGradient>
      <filter id="ludoYardGlow" x="-14%" y="-14%" width="128%" height="128%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.8" flood-opacity="0.32"/>
      </filter>
      <filter id="ludoTileLift" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="0.9" flood-color="#000" flood-opacity="0.18"/>
      </filter>
      ${([0, 1, 2, 3] as ColorId[])
        .map(
          (c) => `
      <linearGradient id="ludoYard${c}" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stop-color="${theme.highlights[c]}"/>
        <stop offset="42%" stop-color="${YARD[c]}"/>
        <stop offset="100%" stop-color="${theme.darks[c]}"/>
      </linearGradient>
      <linearGradient id="ludoHome${c}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lighten(theme.homePath[c], 0.12)}"/>
        <stop offset="100%" stop-color="${theme.homePath[c]}"/>
      </linearGradient>
      <radialGradient id="ludoPawn${c}" cx="32%" cy="28%" r="70%">
        <stop offset="0%" stop-color="${theme.highlights[c]}"/>
        <stop offset="48%" stop-color="${YARD[c]}"/>
        <stop offset="100%" stop-color="${theme.darks[c]}"/>
      </radialGradient>`,
        )
        .join('')}
    </defs>
  `);

  const outerStroke =
    sh.outerStrokeW > 0 && sh.outerStroke !== 'none'
      ? ` stroke="${sh.outerStroke}" stroke-width="${sh.outerStrokeW}"`
      : '';
  parts.push(
    `<rect width="${BOARD_PX}" height="${BOARD_PX}" fill="url(#ludoBoardBg)" rx="${sh.boardRx}"${outerStroke}/>`,
  );

  const yards: [ColorId, number, number][] = [
    [1, 0, 0],
    [2, 9, 0],
    [0, 0, 9],
    [3, 9, 9],
  ];
  for (const [color, gx, gy] of yards) {
    const glow = sh.yardGlow ? ' filter="url(#ludoYardGlow)"' : '';
    const yardFill = sh.flatYards ? YARD[color] : `url(#ludoYard${color})`;
    parts.push(
      `<rect x="${gx * CELL + 1.5}" y="${gy * CELL + 1.5}" width="${6 * CELL - 3}" height="${6 * CELL - 3}" rx="${sh.yardRx}" fill="${yardFill}"${glow}/>`,
    );
    // Inner white pad (Ludo King: inset white well inside colored base)
    const inset = sh.flatYards ? YARD_WELL_INSET_FLAT : 2;
    parts.push(
      `<rect x="${(gx + 1) * CELL + inset}" y="${(gy + 1) * CELL + inset}" width="${4 * CELL - inset * 2}" height="${4 * CELL - inset * 2}" rx="${sh.yardWellRx}" fill="${sh.yardWellFill}" stroke="${sh.yardWellStroke}" stroke-width="${sh.yardWellStrokeW}"/>`,
    );
    // Exact 2×2 seats — same pixel centers as tokenPixel yard positions
    for (const s of yardSlotPixels(color, YARD_WELL_INSET_FLAT)) {
      if (sh.flatYards) {
        // Ludo King seat: player-color disc + thin maroon inner ring
        // Yellow: never lighten (washes to cream on white well)
        // Keep seat discs vivid (same chroma as yard — no mute/wash)
        const slotFill = YARD[color];
        // Seat disc only — dark-red ring lives on each pin, not in the yard box
        parts.push(
          `<circle class="ludo-sdk__yard-seat" cx="${s.x}" cy="${s.y}" r="${sh.yardSlotR}" fill="${slotFill}"/>`,
        );
      } else {
        parts.push(
          `<circle cx="${s.x}" cy="${s.y}" r="${sh.yardSlotR}" fill="${sh.yardSlotFill}" stroke="${sh.yardSlotStroke}" stroke-width="${sh.yardSlotStrokeW}"/>`,
        );
      }
    }
    // Yard name tags are HTML overlays in mount (screen-space) — SVG text
    // inside a CSS-rotated board always drifts to the outer rim.
  }

  const lift = sh.tileLift ? ' filter="url(#ludoTileLift)"' : '';
  for (let i = 0; i < 52; i++) {
    const { x, y } = trackToCell(i);
    const safe = SAFE_TRACK.has(i);
    const start = (Object.values(START_INDEX) as number[]).includes(i);
    let fill = 'url(#ludoTile)';
    let stroke = theme.tileBorder;
    if (start) {
      const color = Number(
        Object.entries(START_INDEX).find(([, v]) => v === i)?.[0] ?? 0,
      ) as ColorId;
      fill = sh.flatYards ? YARD[color] : `url(#ludoYard${color})`;
      stroke = sh.flatYards ? theme.tileBorder : 'rgba(255,255,255,0.7)';
    } else if (safe) {
      fill = theme.tileSafe;
    }
    parts.push(
      `<rect x="${x * CELL + 1.2}" y="${y * CELL + 1.2}" width="${CELL - 2.4}" height="${CELL - 2.4}" rx="${sh.tileRx}" fill="${fill}" stroke="${stroke}" stroke-width="${sh.flatYards ? 1.1 : 0.9}"${lift}/>`,
    );
    if (start && sh.flatYards) {
      const color = Number(
        Object.entries(START_INDEX).find(([, v]) => v === i)?.[0] ?? 0,
      ) as ColorId;
      parts.push(startArrowMarkup(color, x, y, YARD[color]));
    } else if (safe) {
      let starFill = theme.tileStar;
      let starStroke = 'rgba(0,0,0,0.12)';
      let starStrokeW = 0.35;
      if (sh.starOutline) {
        starFill = 'rgba(255,255,255,0.2)';
        starStroke = 'rgba(120,120,120,0.95)';
        starStrokeW = 1.2;
      } else if (start) {
        starFill = '#FFFFFF';
      }
      parts.push(
        `<text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + sh.starSize * 0.32}" text-anchor="middle" font-size="${sh.starSize}" font-weight="900" fill="${starFill}" stroke="${starStroke}" stroke-width="${starStrokeW}">★</text>`,
      );
    }
  }

  const cx = 7.5 * CELL;
  const cy = 7.5 * CELL;
  const s = 1.58 * CELL;

  if (sh.center === 'diamond') {
    const d = s * 0.92;
    parts.push(
      `<rect x="${cx - d}" y="${cy - d}" width="${d * 2}" height="${d * 2}" transform="rotate(45 ${cx} ${cy})" fill="${theme.spinnerRing}" stroke="${theme.spinnerCenter}" stroke-width="2"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy - d * 0.55} ${cx + d * 0.55},${cy} ${cx},${cy + d * 0.55} ${cx - d * 0.55},${cy}" fill="${theme.spinnerCenter}"/>`,
    );
  } else if (sh.center === 'ring') {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${s + 6}" fill="${theme.spinnerRing}"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${s}" fill="${theme.boardBg0}"/>`);
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${s - 4}" fill="none" stroke="${theme.spinnerRing}" stroke-width="2.5"/>`,
    );
    parts.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="${theme.spinnerCenter}"/>`);
  } else if (sh.flatYards) {
    // Stop short of home-stretch cells so step 5 isn’t swallowed by the nest
    const half = FINISH_HALF;
    parts.push(
      `<polygon points="${cx},${cy} ${cx - half},${cy - half} ${cx + half},${cy - half}" fill="${YARD[2]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx + half},${cy - half} ${cx + half},${cy + half}" fill="${YARD[3]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx + half},${cy + half} ${cx - half},${cy + half}" fill="${YARD[0]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx - half},${cy + half} ${cx - half},${cy - half}" fill="${YARD[1]}"/>`,
    );
  } else {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${s + 4}" fill="${theme.spinnerRing}"/>`);
    parts.push(
      `<polygon points="${cx},${cy} ${cx},${cy - s} ${cx + s},${cy}" fill="${YARD[2]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx + s},${cy} ${cx},${cy + s}" fill="${YARD[3]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="${YARD[0]}"/>`,
    );
    parts.push(
      `<polygon points="${cx},${cy} ${cx - s},${cy} ${cx},${cy - s}" fill="${YARD[1]}"/>`,
    );
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${s}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>`,
    );
    parts.push(`<circle cx="${cx}" cy="${cy}" r="5.2" fill="${theme.spinnerCenter}"/>`);
  }

  // Home stretch on top of the nest edge so the last tiles stay clearly outside
  for (let c = 0; c < 4; c++) {
    const color = c as ColorId;
    for (let i = 0; i < 5; i++) {
      const { x, y } = homeColumnCell(color, i);
      const homeFill = sh.flatYards ? YARD[color] : `url(#ludoHome${color})`;
      parts.push(
        `<rect x="${x * CELL + 1.2}" y="${y * CELL + 1.2}" width="${CELL - 2.4}" height="${CELL - 2.4}" rx="${sh.homeTileRx}" fill="${homeFill}" stroke="${sh.flatYards ? theme.tileBorder : 'rgba(255,255,255,0.55)'}" stroke-width="1"${lift}/>`,
      );
    }
  }

  return `<svg class="ludo-sdk__board" viewBox="0 0 ${BOARD_PX} ${BOARD_PX}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ludo board">
    <g class="ludo-sdk__board-base">${parts.join('')}</g>
    <g class="ludo-sdk__tokens" data-ludo-tokens></g>
    <g class="ludo-sdk__fx" data-ludo-fx></g>
  </svg>`;
}

/** Colored chevron on start cell — Ludo King style (arrow matches yard color). */
function startArrowMarkup(
  color: ColorId,
  gx: number,
  gy: number,
  fill: string,
): string {
  const cx = gx * CELL + CELL / 2;
  const cy = gy * CELL + CELL / 2;
  // Travel direction on our board: R↑ G→ Y↓ B←
  const rot = color === 0 ? 0 : color === 1 ? 90 : color === 2 ? 180 : 270;
  const s = 5.8;
  // White chevron on the colored start cell (Ludo King)
  void fill;
  return `<g transform="translate(${cx},${cy}) rotate(${rot})">
    <polygon points="0,${-s} ${s * 0.92},${s * 0.62} ${-s * 0.92},${s * 0.62}" fill="#FFFFFF"/>
  </g>`;
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Glossy plastic guti — theme stroke/fill. */
/** Exact King pin palette (from provided SVG reference). */
const KING_PIN: Record<
  ColorId,
  {
    base: string;
    baseStroke: string;
    gemWell: string;
    gem: string;
    gemStroke: string;
    gemGrad?: [string, string, string];
    hi: number;
  }
> = {
  0: {
    base: '#f23b32',
    baseStroke: '#9a1c18',
    gemWell: '#8a1814',
    gem: '#e92830',
    gemStroke: '#9b111b',
    gemGrad: ['#ffaaa5', '#e92830', '#970b16'],
    hi: 0.75,
  },
  1: {
    base: '#42c94f',
    baseStroke: '#1e7a28',
    gemWell: '#1a6e24',
    gem: '#2ed45a',
    gemStroke: '#1a8a34',
    hi: 0.75,
  },
  2: {
    base: '#ffde00',
    baseStroke: '#b89600',
    gemWell: '#a88800',
    gem: '#ffce16',
    gemStroke: '#b68a00',
    hi: 0.8,
  },
  3: {
    base: '#2196f3',
    baseStroke: '#0d5f9e',
    gemWell: '#0a4e82',
    gem: '#28b4f1',
    gemStroke: '#0877a8',
    hi: 0.8,
  },
};

export function tokenMarkup(
  token: Token,
  playable: boolean,
  themeInput?: ThemePalette | string,
  facingColor: ColorId = 0,
): string {
  const theme = typeof themeInput === 'string' || !themeInput
    ? getTheme(themeInput)
    : themeInput;
  const { x, y } = tokenPixel(token.color, token.slot, token.state);
  const solid = theme.players[token.color];
  const fill = theme.shape.flatYards
    ? solid
    : `url(#ludoPawn${token.color})`;
  const stroke = theme.pawnStroke;
  const sw = theme.shape.pawnStrokeW;
  const isPin = theme.shape.pawnStyle === 'pin';
  const inYard = token.state.kind === 'yard';
  // Yard: tip on seat center. Path: slight plant into the foot disc.
  const ty = isPin ? y + (inYard ? 0 : PIN_TIP_PLANT) : y + 2;
  const cls = [
    'ludo-sdk__token',
    'ludo-sdk__pawn',
    isPin ? 'ludo-sdk__pawn--pin' : '',
    playable ? 'ludo-sdk__token--playable' : '',
    token.state.kind === 'finished' ? 'ludo-sdk__token--home' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = theme.shape.pawnLabel
    ? `<text class="ludo-sdk__token-label" x="0" y="5.4" text-anchor="middle" font-size="7" font-weight="900" fill="${stroke}">${token.slot + 1}</text>`
    : '';

  if (isPin) {
    // Exact Ludo King pin (tip-anchored). Source art: 48×62 viewBox, tip at (24,54).
    const gid = `pin${token.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const pin = KING_PIN[token.color];
    const gemFill =
      pin.gemGrad != null
        ? `url(#${gid}Gem)`
        : pin.gem;
    const gemDefs =
      pin.gemGrad != null
        ? `<linearGradient id="${gid}Gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${pin.gemGrad[0]}"/>
          <stop offset="40%" stop-color="${pin.gemGrad[1]}"/>
          <stop offset="100%" stop-color="${pin.gemGrad[2]}"/>
        </linearGradient>`
        : '';
    // Home stretch: shorter figure so tip-toward-center colors (e.g. red at
    // bottom) don’t plant their ring on the pin in the cell behind — yellow
    // tips point the other way and already clear.
    const onHomeCol = token.state.kind === 'homeColumn';
    const pinScale = onHomeCol ? 0.34 : 0.44;
    const footR = onHomeCol ? 3.8 : 4.6;
    const ringR = onHomeCol ? 5.2 : 6.2;
    const pinTag = onHomeCol ? 'lk21h' : 'lk21';
    // Tip point past (0,0) so it reads planted in the foot, not hovering above it.
    const shellOuter =
      'M0 -50 C-11 -50 -18 -42 -18 -32 C-18 -20 -6 -8 0 5 C6 -8 18 -20 18 -32 C18 -42 11 -50 0 -50Z';
    const shellInner =
      'M0 -48 C-10 -48 -16 -41 -16 -32 C-16 -22 -6 -11 0 3.2 C6 -11 16 -22 16 -32 C16 -41 10 -48 0 -48Z';
    // Board CSS rotate(-facing*90) flips pins tip-up — counter-rotate figure only
    // (foot stays in board space so stack inverse-offset still centers on the cell).
    const upright = facingColor * 90;
    return `<g class="${cls}" data-token-id="${token.id}" data-pin="${pinTag}" data-facing="${facingColor}"${inYard ? ' data-yard="1"' : ''} transform="translate(${x}, ${ty})">
      <defs>
        <linearGradient id="${gid}Shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="45%" stop-color="#F8F8F8"/>
          <stop offset="100%" stop-color="#AEB8BC"/>
        </linearGradient>
        ${gemDefs}
      </defs>
      <!-- Foot + playable ring — board-aligned (not counter-rotated) -->
      <g class="ludo-sdk__pin-base">
        <circle class="ludo-sdk__pin-foot" cx="0" cy="0" r="${footR}" fill="none" stroke="#6B1F2A" stroke-width="1.8"/>
        <circle class="ludo-sdk__token-ring" cx="0" cy="0" r="${ringR}" fill="none"
          stroke="#FFFFFF" stroke-width="1.55" stroke-dasharray="0.95 2.6" stroke-linecap="round"/>
      </g>
      <g class="ludo-sdk__pin-upright" transform="rotate(${upright})">
        <g class="ludo-sdk__pin-figure" transform="scale(${pinScale})">
          <path class="ludo-sdk__pawn-body ludo-sdk__token-body" fill="#29353B" stroke="#111D24" stroke-width="1.6" d="${shellOuter}"/>
          <path class="ludo-sdk__pawn-body ludo-sdk__token-body" fill="url(#${gid}Shell)" stroke="#FFFFFF" stroke-width="1" d="${shellInner}"/>
          <circle cx="0" cy="-33" r="12.5" fill="${pin.gemWell}"/>
          <circle class="ludo-sdk__pawn-head" cx="0" cy="-34" r="11" fill="${gemFill}" stroke="${pin.gemStroke}" stroke-width="1.5"/>
          <ellipse cx="-4" cy="-40" rx="4" ry="2.5" fill="#FFFFFF" opacity="${pin.hi}" transform="rotate(-30 -4 -40)"/>
        </g>
        <circle class="ludo-sdk__token-hit" cx="0" cy="${onHomeCol ? -4 : -5}" r="${onHomeCol ? 11 : 14}" fill="transparent"/>
        ${label}
      </g>
    </g>`;
  }

  return `<g class="${cls}" data-token-id="${token.id}" style="transform: translate(${x}px, ${ty}px)">
    <ellipse class="ludo-sdk__pawn-shadow" cx="0" cy="9.5" rx="8.5" ry="2.4" fill="rgba(0,0,0,0.35)"/>
    <circle class="ludo-sdk__pin-foot" cx="0" cy="8.2" r="7.4" fill="none" stroke="#6B1F2A" stroke-width="2.6"/>
    <circle class="ludo-sdk__token-ring" cx="0" cy="8.2" r="11" fill="none"
      stroke="#FFFFFF" stroke-width="2.6" stroke-dasharray="1.4 3.6" stroke-linecap="round"/>
    <ellipse class="ludo-sdk__pawn-base ludo-sdk__token-body" cx="0" cy="7.4" rx="8.6" ry="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <path class="ludo-sdk__pawn-body ludo-sdk__token-body" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"
      d="M -5.4 6.6
         C -5.8 3.2 -4.4 0.1 -2.9 -2.4
         L -2.5 -3.4
         C -3.9 -3.8 -4.8 -5.2 -4.8 -6.8
         C -4.8 -9.5 -2.5 -11.5 0 -11.5
         C 2.5 -11.5 4.8 -9.5 4.8 -6.8
         C 4.8 -5.2 3.9 -3.8 2.5 -3.4
         L 2.9 -2.4
         C 4.4 0.1 5.8 3.2 5.4 6.6
         Z"/>
    <ellipse class="ludo-sdk__pawn-collar" cx="0" cy="-2.7" rx="4.4" ry="1.7" fill="${solid}" stroke="${stroke}" stroke-width="${Math.max(0.9, sw - 0.25)}"/>
    <circle class="ludo-sdk__pawn-head ludo-sdk__token-body" cx="0" cy="-7.8" r="3.8" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <circle cx="-1.2" cy="-8.9" r="1.35" fill="#fff" opacity="0.62"/>
    <ellipse cx="1.2" cy="-6.6" rx="1.1" ry="0.55" fill="#fff" opacity="0.18"/>
    <circle class="ludo-sdk__token-hit" cx="0" cy="0" r="14" fill="transparent"/>
    ${label}
  </g>`;
}

function stackKey(token: Token): string {
  const s = token.state;
  if (s.kind === 'yard') return `yard:${token.color}:${token.slot}`;
  // Same-color finishers share a stack key so under-pins can hide feet
  if (s.kind === 'finished') return `fin:${token.color}`;
  if (s.kind === 'homeColumn') return `home:${token.color}:${s.index}`;
  return `track:${s.index}`;
}

export function syncTokens(
  layer: SVGGElement,
  state: GameState,
  legal: LegalMove[],
  themeInput?: ThemePalette | string,
  facingColor: ColorId = 0,
): { moved: string[]; captured: string[] } {
  const theme = typeof themeInput === 'string' || !themeInput
    ? getTheme(themeInput)
    : themeInput;
  const upright = facingColor * 90;
  const playable = new Set(legal.map((m) => m.tokenId));
  const moved: string[] = [];
  const existing = new Map<string, SVGGElement>();
  layer.querySelectorAll<SVGGElement>('[data-token-id]').forEach((n) => {
    const id = n.getAttribute('data-token-id');
    if (id) existing.set(id, n);
  });

  const keep = new Set(state.tokens.map((t) => t.id));
  for (const [id, node] of existing) {
    if (!keep.has(id)) node.remove();
  }
  // Drop leftover feet-overlay nodes from the reverted approach
  layer.parentElement?.querySelector('[data-ludo-feet]')?.remove();

  const groups = new Map<string, Token[]>();
  for (const token of state.tokens) {
    const k = stackKey(token);
    const g = groups.get(k) ?? [];
    g.push(token);
    groups.set(k, g);
  }
  const stackOf = new Map<string, { index: number; count: number }>();
  for (const [, group] of groups) {
    group.forEach((t, i) => stackOf.set(t.id, { index: i, count: group.length }));
  }

  const isPin = theme.shape.pawnStyle === 'pin';
  const stackStyle = isPin ? 'pin' : 'default';
  // Paint order:
  // 1) finished (under)
  // 2) home-column outer → inner (so tips don’t cover the next pin’s foot)
  // 3) track/yard, playable last
  const drawOrder = [...state.tokens].sort((a, b) => {
    const rank = (t: Token) => {
      if (t.state.kind === 'finished') return 0;
      if (t.state.kind === 'homeColumn') return 1;
      return 2;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1 && a.color === b.color) {
      const ia = a.state.kind === 'homeColumn' ? a.state.index : 0;
      const ib = b.state.kind === 'homeColumn' ? b.state.index : 0;
      if (ia !== ib) return ia - ib; // outer first
    }
    if (ra === 1 && a.color !== b.color) return a.color - b.color;
    const pa = playable.has(a.id) ? 1 : 0;
    const pb = playable.has(b.id) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const sa = stackOf.get(a.id);
    const sb = stackOf.get(b.id);
    return (sa?.index ?? 0) - (sb?.index ?? 0);
  });
  for (const token of drawOrder) {
    const stack = stackOf.get(token.id);
    const { x, y } = tokenPixel(
      token.color,
      token.slot,
      token.state,
      stack,
      stackStyle,
    );
    let node = existing.get(token.id) ?? null;
    // Rebuild when geometry / home-stretch / yard tag doesn’t match
    const wantPin =
      token.state.kind === 'homeColumn' ? 'lk21h' : 'lk21';
    const yardMismatch =
      (token.state.kind === 'yard') !== (node?.getAttribute('data-yard') === '1');
    if (
      node &&
      isPin &&
      (node.getAttribute('data-pin') !== wantPin ||
        yardMismatch ||
        !node.querySelector('.ludo-sdk__pin-upright') ||
        !node.querySelector('.ludo-sdk__pin-base .ludo-sdk__token-ring'))
    ) {
      node.remove();
      existing.delete(token.id);
      node = null;
    }
    if (node && !node.querySelector('.ludo-sdk__token-hit')) {
      node.remove();
      existing.delete(token.id);
      node = null;
    }
    if (!node) {
      layer.insertAdjacentHTML(
        'beforeend',
        tokenMarkup(token, playable.has(token.id), theme, facingColor),
      );
      node = layer.querySelector(`[data-token-id="${token.id}"]`) as SVGGElement;
      placeTokenAt(node, x, y);
    } else {
      const prev = tokenTranslateKey(node);
      placeTokenAt(node, x, y);
      if (prev !== tokenTranslateKey(node)) {
        moved.push(token.id);
      }
      const solid = theme.players[token.color];
      if (theme.shape.pawnStyle === 'pin') {
        node
          .querySelectorAll('.ludo-sdk__pawn-head')
          .forEach((el) => el.setAttribute('fill', solid));
      } else {
        const fill = `url(#ludoPawn${token.color})`;
        node
          .querySelectorAll('.ludo-sdk__token-body')
          .forEach((el) => el.setAttribute('fill', fill));
        node
          .querySelectorAll('.ludo-sdk__pawn-collar')
          .forEach((el) => el.setAttribute('fill', solid));
      }
    }
    // Always re-order + refresh interaction classes (new + existing)
    layer.appendChild(node);
    const isPlayable = playable.has(token.id);
    node.classList.toggle('ludo-sdk__token--playable', isPlayable);
    node.classList.toggle(
      'ludo-sdk__token--home',
      token.state.kind === 'finished',
    );
    const stacked = (stack?.count ?? 1) > 1;
    const under = stacked && (stack?.index ?? 0) < (stack?.count ?? 1) - 1;
    node.classList.toggle('ludo-sdk__token--stacked', stacked);
    node.classList.toggle('ludo-sdk__token--stack-under', under);
    // Foot + white dash stay on CELL center; tips fan via placeTokenAt offset.
    if (isPin) {
      const uprightEl = node.querySelector('.ludo-sdk__pin-upright');
      if (uprightEl) {
        uprightEl.setAttribute('transform', `rotate(${upright})`);
      }
      node.setAttribute('data-facing', String(facingColor));
      const baseEl = node.querySelector('.ludo-sdk__pin-base');
      if (baseEl) {
        const onPath =
          stacked &&
          token.state.kind !== 'yard' &&
          token.state.kind !== 'finished';
        if (onPath && stack) {
          const o = stackPixelOffset(stack.index, stack.count, stackStyle);
          baseEl.setAttribute('transform', `translate(${-o.x}, ${-o.y})`);
        } else {
          baseEl.removeAttribute('transform');
        }
      }
    }
    node.setAttribute('aria-disabled', isPlayable ? 'false' : 'true');
  }

  return { moved, captured: [] };
}

export function flashCapture(fxLayer: SVGGElement, x: number, y: number) {
  const id = `fx-${Date.now()}`;
  fxLayer.insertAdjacentHTML(
    'beforeend',
    `<g data-fx="${id}" transform="translate(${x},${y})">
      <circle class="ludo-sdk__burst" r="4" fill="#fff"/>
      <circle class="ludo-sdk__burst-ring" r="8" fill="none" stroke="#ff6b6b" stroke-width="2"/>
    </g>`,
  );
  setTimeout(() => {
    fxLayer.querySelector(`[data-fx="${id}"]`)?.remove();
  }, 500);
}

export function statusText(
  state: GameState,
  opts?: { interactive?: Set<ColorId> },
): string {
  if (state.phase === 'finished' && state.winner != null) {
    return `🏆 <strong>${title(COLOR_NAMES[state.winner])}</strong> wins!`;
  }
  const name = title(COLOR_NAMES[state.currentColor]);
  const p = state.players.find((x) => x.color === state.currentColor);
  const you = opts?.interactive?.has(state.currentColor) ?? p?.kind === 'human';
  const kind = you ? 'You' : p?.kind === 'ai' ? 'AI' : p?.name ?? 'Player';
  if (state.phase === 'waiting_roll') {
    return `<span class="ludo-sdk__turn-dot ludo-sdk__turn-dot--c${state.currentColor}"></span> <strong>${name}</strong> · ${kind} — roll`;
  }
  if (state.phase === 'waiting_move') {
    return `<span class="ludo-sdk__turn-dot ludo-sdk__turn-dot--c${state.currentColor}"></span> <strong>${name}</strong> · ${kind} — move`;
  }
  return `<span class="ludo-sdk__turn-dot ludo-sdk__turn-dot--c${state.currentColor}"></span> <strong>${name}</strong> · ${kind}`;
}

function title(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

export { tokenPixel };
