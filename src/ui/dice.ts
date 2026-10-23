/**
 * CSS 3D die — cube + face map inspired by
 * https://github.com/lauroguedes/3d-dice-roller (MIT), without Vue/GSAP.
 *
 * Face layout (cube local space):
 *   front=1 · back=6 · right=2 · left=5 · top=3 · bottom=4
 */

type Rot = { x: number; y: number; z: number };

/** Rotations that bring each face to the camera. */
const FACE_ROT: Record<number, Rot> = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: 0, y: -90, z: 0 },
  3: { x: -90, y: 0, z: 0 },
  4: { x: 90, y: 0, z: 0 },
  5: { x: 0, y: 90, z: 0 },
  6: { x: 0, y: 180, z: 0 },
};

function clampFace(v: number | null): number {
  if (v == null || Number.isNaN(v) || v < 1) return 1;
  return Math.min(6, Math.max(1, Math.floor(v)));
}

function rotCss(r: Rot, scale = 1): string {
  return `rotateX(${r.x}deg) rotateY(${r.y}deg) rotateZ(${r.z}deg) scale(${scale})`;
}

function parseRot(el: HTMLElement): Rot {
  const t = el.style.transform || '';
  const x = /rotateX\(([-\d.]+)deg\)/.exec(t);
  const y = /rotateY\(([-\d.]+)deg\)/.exec(t);
  const z = /rotateZ\(([-\d.]+)deg\)/.exec(t);
  if (x && y && z) {
    return { x: Number(x[1]), y: Number(y[1]), z: Number(z[1]) };
  }
  return { x: 0, y: 0, z: 0 };
}

function faceDots(value: number): string {
  const spots: Record<number, string[]> = {
    1: ['center'],
    2: ['top-right', 'bottom-left'],
    3: ['top-right', 'center', 'bottom-left'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: [
      'top-left',
      'top-right',
      'middle-left',
      'middle-right',
      'bottom-left',
      'bottom-right',
    ],
  };
  return (spots[value] ?? spots[1]!)
    .map((p) => `<span class="ludo-die__dot ludo-die__dot--${p}"></span>`)
    .join('');
}

/** Idle / landed 3D cube showing `value`. */
export function diceFaceHtml(value: number | null, rolling = false): string {
  const show = clampFace(value);
  const r = FACE_ROT[show]!;
  const cls = [
    'ludo-die',
    'ludo-die--cube',
    `ludo-die--${show}`,
    rolling ? 'is-rolling' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<div class="${cls}" data-ludo-dice data-face="${show}" aria-label="${rolling ? 'Dice rolling' : `Dice showing ${show}`}" role="img">
    <div class="ludo-die__scene">
      <div class="ludo-die__cube" data-ludo-cube style="transform: ${rotCss(r)}">
        <div class="ludo-die__side ludo-die__side--front" data-value="1">${faceDots(1)}</div>
        <div class="ludo-die__side ludo-die__side--back" data-value="6">${faceDots(6)}</div>
        <div class="ludo-die__side ludo-die__side--right" data-value="2">${faceDots(2)}</div>
        <div class="ludo-die__side ludo-die__side--left" data-value="5">${faceDots(5)}</div>
        <div class="ludo-die__side ludo-die__side--top" data-value="3">${faceDots(3)}</div>
        <div class="ludo-die__side ludo-die__side--bottom" data-value="4">${faceDots(4)}</div>
      </div>
    </div>
  </div>`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function waitAnim(anim: Animation | undefined): Promise<void> {
  if (!anim) return Promise.resolve();
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * One continuous tumble that ends on `finalValue` — no second “land spin”.
 * Extra full turns are added onto the target rotation so the result is the end pose.
 */
export async function animateDiceRoll(
  host: HTMLElement,
  finalValue: number,
  durationMs = 1100,
): Promise<void> {
  const final = clampFace(finalValue);
  const target = FACE_ROT[final]!;

  if (prefersReducedMotion()) {
    host.innerHTML = diceFaceHtml(final, false);
    return;
  }

  // Reuse existing cube when possible (avoids a flash that feels like a 2nd roll)
  let cube = host.querySelector<HTMLElement>('[data-ludo-cube]');
  let root = host.querySelector<HTMLElement>('.ludo-die');
  if (!cube || !root) {
    host.innerHTML = diceFaceHtml(final, true);
    cube = host.querySelector<HTMLElement>('[data-ludo-cube]');
    root = host.querySelector<HTMLElement>('.ludo-die');
  }
  if (!cube || !root) {
    host.innerHTML = diceFaceHtml(final, false);
    return;
  }

  root.classList.add('is-rolling');
  root.classList.remove('is-land');
  root.setAttribute('aria-label', 'Dice rolling');

  // Cancel any in-flight WAAPI on this cube
  cube.getAnimations().forEach((a) => a.cancel());

  const from = parseRot(cube);
  // 2 full turns on X/Y so it tumbles once, then stops on the result face
  const turnsX = 2;
  const turnsY = 2 + (Math.random() < 0.5 ? 0 : 1);
  const end: Rot = {
    x: target.x + 360 * turnsX,
    y: target.y + 360 * turnsY,
    z: target.z + (Math.random() < 0.5 ? 0 : 360),
  };

  const total = Math.max(700, Math.min(1400, durationMs));

  // Single keyframe run: squash → tumble → land on face (one motion)
  await waitAnim(
    cube.animate(
      [
        { transform: rotCss(from, 1), offset: 0 },
        { transform: rotCss(from, 0.92), offset: 0.06 },
        {
          transform: rotCss(
            {
              x: from.x + (end.x - from.x) * 0.55,
              y: from.y + (end.y - from.y) * 0.55,
              z: from.z + (end.z - from.z) * 0.55,
            },
            1.04,
          ),
          offset: 0.45,
        },
        { transform: rotCss(end, 1), offset: 1 },
      ],
      {
        duration: total,
        easing: 'cubic-bezier(0.12, 0.7, 0.18, 1)',
        fill: 'forwards',
      },
    ),
  );

  // Normalize to canonical face rotation (same look, no extra spin)
  cube.style.transform = rotCss(target, 1);
  cube.getAnimations().forEach((a) => a.cancel());

  root.classList.remove('is-rolling');
  root.classList.add(`ludo-die--${final}`);
  root.dataset.face = String(final);
  root.setAttribute('aria-label', `Dice showing ${final}`);
  // Drop other face classes
  root.classList.forEach((c) => {
    if (c.startsWith('ludo-die--') && c !== 'ludo-die--cube' && c !== `ludo-die--${final}`) {
      root!.classList.remove(c);
    }
  });
}
