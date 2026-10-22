import {
  COLOR_DARK,
  COLOR_HEX,
  COLOR_HIGHLIGHT,
  COLOR_NAMES,
  HOME_PATH_HEX,
  SAFE_TRACK,
  START_INDEX,
} from '../core/constants';
import type { ColorId, GameState, LegalMove, Token } from '../core/types';
import {
  BOARD_PX,
  CELL,
  homeColumnCell,
  tokenPixel,
  trackToCell,
  yardSlots,
} from './boardLayout';

const YARD = COLOR_HEX;
const TILE_EMPTY = '#F1F5F9';
const TILE_BORDER = '#CBD5E1';
const TILE_SAFE = '#FFF1B8';
const TILE_STAR = '#F5A900';
const SPINNER_RING = '#071329';
const SPINNER_CENTER = '#F8FAFC';

/** Static board artwork — Ludo Rush design-system HEX. */
export function renderBoardBase(): string {
  const parts: string[] = [];

  parts.push(`
    <defs>
      <linearGradient id="ludoBoardBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F8FAFC"/>
        <stop offset="100%" stop-color="${TILE_EMPTY}"/>
      </linearGradient>
      <linearGradient id="ludoTile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="${TILE_EMPTY}"/>
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
        <stop offset="0%" stop-color="${COLOR_HIGHLIGHT[c]}"/>
        <stop offset="42%" stop-color="${YARD[c]}"/>
        <stop offset="100%" stop-color="${COLOR_DARK[c]}"/>
      </linearGradient>
      <linearGradient id="ludoHome${c}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lighten(HOME_PATH_HEX[c], 0.12)}"/>
        <stop offset="100%" stop-color="${HOME_PATH_HEX[c]}"/>
      </linearGradient>
      <radialGradient id="ludoPawn${c}" cx="32%" cy="28%" r="70%">
        <stop offset="0%" stop-color="${COLOR_HIGHLIGHT[c]}"/>
        <stop offset="48%" stop-color="${YARD[c]}"/>
        <stop offset="100%" stop-color="${COLOR_DARK[c]}"/>
      </radialGradient>`,
        )
        .join('')}
    </defs>
  `);

  // Outer board plate
  parts.push(
    `<rect width="${BOARD_PX}" height="${BOARD_PX}" fill="url(#ludoBoardBg)" rx="16"/>`,
  );

  // Corner yards — glossy saturated blocks
  const yards: [ColorId, number, number][] = [
    [1, 0, 0],
    [2, 9, 0],
    [0, 0, 9],
    [3, 9, 9],
  ];
  for (const [color, gx, gy] of yards) {
    parts.push(
      `<rect x="${gx * CELL + 1.5}" y="${gy * CELL + 1.5}" width="${6 * CELL - 3}" height="${6 * CELL - 3}" rx="14" fill="url(#ludoYard${color})" filter="url(#ludoYardGlow)"/>`,
    );
    // Recessed inner well
    parts.push(
      `<rect x="${(gx + 1) * CELL + 2}" y="${(gy + 1) * CELL + 2}" width="${4 * CELL - 4}" height="${4 * CELL - 4}" rx="16" fill="rgba(255,255,255,0.42)" stroke="rgba(255,255,255,0.65)" stroke-width="1.4"/>`,
    );
    for (const s of yardSlots(color)) {
      parts.push(
        `<circle cx="${s.x * CELL + CELL / 2}" cy="${s.y * CELL + CELL / 2}" r="9.2" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.95)" stroke-width="2"/>`,
      );
    }
  }

  // Track path — cool slate tiles + safe/star
  for (let i = 0; i < 52; i++) {
    const { x, y } = trackToCell(i);
    const safe = SAFE_TRACK.has(i);
    const start = (Object.values(START_INDEX) as number[]).includes(i);
    let fill = 'url(#ludoTile)';
    let stroke = TILE_BORDER;
    if (start) {
      const color = Number(
        Object.entries(START_INDEX).find(([, v]) => v === i)?.[0] ?? 0,
      ) as ColorId;
      fill = `url(#ludoYard${color})`;
      stroke = 'rgba(255,255,255,0.7)';
    } else if (safe) {
      fill = TILE_SAFE;
    }
    parts.push(
      `<rect x="${x * CELL + 1.2}" y="${y * CELL + 1.2}" width="${CELL - 2.4}" height="${CELL - 2.4}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="0.9" filter="url(#ludoTileLift)"/>`,
    );
    if (safe) {
      const starFill = start ? '#FFFFFF' : TILE_STAR;
      parts.push(
        `<text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="${starFill}" stroke="rgba(0,0,0,0.12)" stroke-width="0.35">★</text>`,
      );
    }
  }

  // Home columns — dedicated home-path HEX
  for (let c = 0; c < 4; c++) {
    const color = c as ColorId;
    for (let i = 0; i < 5; i++) {
      const { x, y } = homeColumnCell(color, i);
      parts.push(
        `<rect x="${x * CELL + 1.2}" y="${y * CELL + 1.2}" width="${CELL - 2.4}" height="${CELL - 2.4}" rx="5" fill="url(#ludoHome${color})" stroke="rgba(255,255,255,0.55)" stroke-width="1" filter="url(#ludoTileLift)"/>`,
      );
    }
  }

  // Center — four wedges + spinner ring (#071329 / #F8FAFC)
  const cx = 7.5 * CELL;
  const cy = 7.5 * CELL;
  const s = 1.58 * CELL;
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${s + 4}" fill="${SPINNER_RING}"/>`);
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
  parts.push(`<circle cx="${cx}" cy="${cy}" r="5.2" fill="${SPINNER_CENTER}"/>`);

  return `<svg class="ludo-sdk__board" viewBox="0 0 ${BOARD_PX} ${BOARD_PX}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ludo board">
    <g class="ludo-sdk__board-base">${parts.join('')}</g>
    <g class="ludo-sdk__tokens" data-ludo-tokens></g>
    <g class="ludo-sdk__fx" data-ludo-fx></g>
  </svg>`;
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

/** Glossy plastic guti matching the mock. */
export function tokenMarkup(token: Token, playable: boolean): string {
  const { x, y } = tokenPixel(token.color, token.slot, token.state);
  const fill = `url(#ludoPawn${token.color})`;
  const solid = COLOR_HEX[token.color];
  const cls = [
    'ludo-sdk__token',
    'ludo-sdk__pawn',
    playable ? 'ludo-sdk__token--playable' : '',
    token.state.kind === 'finished' ? 'ludo-sdk__token--home' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<g class="${cls}" data-token-id="${token.id}" style="transform: translate(${x}px, ${y + 2}px)">
    <ellipse class="ludo-sdk__pawn-shadow" cx="0" cy="9.5" rx="8.5" ry="2.4" fill="rgba(0,0,0,0.35)"/>
    <circle class="ludo-sdk__token-ring" cx="0" cy="-4" r="14" fill="none" stroke="#fff" stroke-width="2.2" opacity="0"/>
    <ellipse class="ludo-sdk__pawn-base ludo-sdk__token-body" cx="0" cy="7.4" rx="8.6" ry="3" fill="${fill}" stroke="#141018" stroke-width="1.2"/>
    <path class="ludo-sdk__pawn-body ludo-sdk__token-body" fill="${fill}" stroke="#141018" stroke-width="1.2" stroke-linejoin="round"
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
    <ellipse class="ludo-sdk__pawn-collar" cx="0" cy="-2.7" rx="4.4" ry="1.7" fill="${solid}" stroke="#141018" stroke-width="0.95"/>
    <circle class="ludo-sdk__pawn-head ludo-sdk__token-body" cx="0" cy="-7.8" r="3.8" fill="${fill}" stroke="#141018" stroke-width="1.2"/>
    <circle cx="-1.2" cy="-8.9" r="1.35" fill="#fff" opacity="0.62"/>
    <ellipse cx="1.2" cy="-6.6" rx="1.1" ry="0.55" fill="#fff" opacity="0.18"/>
    <text class="ludo-sdk__token-label" x="0" y="5.4" text-anchor="middle" font-size="7" font-weight="900" fill="#141018">${token.slot + 1}</text>
  </g>`;
}

function stackKey(token: Token): string {
  const s = token.state;
  if (s.kind === 'yard') return `yard:${token.color}:${token.slot}`;
  if (s.kind === 'finished') return `fin:${token.color}:${token.slot}`;
  if (s.kind === 'homeColumn') return `home:${token.color}:${s.index}`;
  return `track:${s.index}`;
}

export function syncTokens(
  layer: SVGGElement,
  state: GameState,
  legal: LegalMove[],
): { moved: string[]; captured: string[] } {
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

  for (const token of state.tokens) {
    const stack = stackOf.get(token.id);
    const { x, y } = tokenPixel(token.color, token.slot, token.state, stack);
    let node = existing.get(token.id);
    if (!node) {
      layer.insertAdjacentHTML(
        'beforeend',
        tokenMarkup(token, playable.has(token.id)),
      );
      node = layer.querySelector(`[data-token-id="${token.id}"]`) as SVGGElement;
      node.style.transition = 'none';
      node.style.transform = `translate(${x}px, ${y + 2}px)`;
      requestAnimationFrame(() => {
        node!.style.transition = '';
      });
    } else {
      const prev = node.style.transform;
      const next = `translate(${x}px, ${y + 2}px)`;
      if (prev !== next) {
        moved.push(token.id);
        node.style.transform = next;
      }
      node.classList.toggle('ludo-sdk__token--playable', playable.has(token.id));
      node.classList.toggle(
        'ludo-sdk__token--home',
        token.state.kind === 'finished',
      );
      const fill = `url(#ludoPawn${token.color})`;
      const solid = COLOR_HEX[token.color];
      node
        .querySelectorAll('.ludo-sdk__token-body')
        .forEach((el) => el.setAttribute('fill', fill));
      node
        .querySelectorAll('.ludo-sdk__pawn-collar')
        .forEach((el) => el.setAttribute('fill', solid));
    }
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
