/**
 * Single classic die face — 3×3 pip grid.
 *
 *   1 2 3
 *   4 5 6
 *   7 8 9
 */
const FACE: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function faceCells(v: number): string {
  const active = new Set(FACE[v] ?? []);
  return Array.from({ length: 9 }, (_, i) => {
    const n = i + 1;
    return active.has(n)
      ? `<span class="ludo-die__pip" data-cell="${n}"></span>`
      : `<span class="ludo-die__slot" data-cell="${n}"></span>`;
  }).join('');
}

/** One die only — never a cube of 6 faces. */
export function diceFaceHtml(value: number | null, rolling = false): string {
  const v =
    value == null || Number.isNaN(value)
      ? 0
      : Math.min(6, Math.max(0, Math.floor(value)));

  if (v === 0 && !rolling) {
    return `<div class="ludo-die" data-ludo-dice aria-label="Dice" role="img">
      <div class="ludo-die__face ludo-die__face--blank">
        <span class="ludo-die__hint">roll</span>
      </div>
    </div>`;
  }

  const show = v === 0 ? 1 : v;
  const cls = [
    'ludo-die',
    `ludo-die--${show}`,
    rolling ? 'is-rolling' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<div class="${cls}" data-ludo-dice data-face="${show}" aria-label="${rolling ? 'Dice rolling' : `Dice showing ${show}`}" role="img">
    <div class="ludo-die__face" data-ludo-face>${faceCells(show)}</div>
  </div>`;
}

/**
 * Clean roll: spin the die (blurred), then snap to the final face with a soft land.
 * No frantic pip flicker — that reads as broken UI.
 */
export function animateDiceRoll(
  host: HTMLElement,
  finalValue: number,
  durationMs = 650,
): Promise<void> {
  const final = Math.min(6, Math.max(1, Math.floor(finalValue)));
  host.innerHTML = diceFaceHtml(final, true);

  const die = host.querySelector<HTMLElement>('.ludo-die');
  const faceEl = host.querySelector<HTMLElement>('[data-ludo-face]');
  if (!die || !faceEl) return Promise.resolve();

  // Hold a neutral mid-face during the spin so motion reads clearly
  faceEl.innerHTML = faceCells(1 + Math.floor(Math.random() * 6));

  const spinMs = Math.max(400, durationMs - 120);
  die.style.setProperty('--die-spin-ms', `${spinMs}ms`);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      die.classList.remove('is-rolling');
      die.classList.add('is-land');
      faceEl.innerHTML = faceCells(final);
      die.dataset.face = String(final);
      die.className = `ludo-die ludo-die--${final} is-land`;
      die.setAttribute('aria-label', `Dice showing ${final}`);

      window.setTimeout(() => {
        host.innerHTML = diceFaceHtml(final, false);
        resolve();
      }, 220);
    }, spinMs);
  });
}
