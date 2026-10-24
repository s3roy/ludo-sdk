/**
 * Lightweight canvas confetti for the win overlay — no dependencies.
 */

export type ConfettiHandle = {
  stop: () => void;
};

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  shape: 0 | 1 | 2; // rect | circle | ribbon
};

const GOLD = ['#ffe34d', '#ffc107', '#ff9800', '#fff3c4', '#e8c84a'] as const;

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function spawnBurst(
  pieces: Piece[],
  w: number,
  h: number,
  colors: string[],
  ox: number,
  oy: number,
  count: number,
  power: number,
) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = power * (0.55 + Math.random() * 0.9);
    pieces.push({
      x: ox + (Math.random() - 0.5) * 40,
      y: oy + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 7,
      h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      life: 1,
      shape: (Math.floor(Math.random() * 3) as 0 | 1 | 2),
    });
  }
  // Extra side cannons
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < Math.floor(count * 0.35); i++) {
      const angle = side < 0 ? -0.2 - Math.random() * 1.1 : Math.PI + 0.2 + Math.random() * 1.1;
      const speed = power * (0.7 + Math.random() * 0.8);
      pieces.push({
        x: side < 0 ? 8 : w - 8,
        y: h * 0.55 + (Math.random() - 0.5) * h * 0.2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 4 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        life: 1,
        shape: (Math.floor(Math.random() * 3) as 0 | 1 | 2),
      });
    }
  }
}

/**
 * Run confetti inside `host` (typically the win overlay). Returns a stop handle.
 */
export function fireWinConfetti(
  host: HTMLElement,
  accentColors: string[] = [],
): ConfettiHandle {
  const noop: ConfettiHandle = { stop: () => {} };
  if (prefersReducedMotion()) return noop;

  const canvas = document.createElement('canvas');
  canvas.className = 'ludo-sdk__win-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return noop;
  }

  let w = 0;
  let h = 0;
  const resize = () => {
    const r = host.getBoundingClientRect();
    w = Math.max(1, Math.floor(r.width));
    h = Math.max(1, Math.floor(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const colors = [
    ...GOLD,
    ...accentColors.filter(Boolean),
    '#ffffff',
    '#ff6b9d',
  ];
  const pieces: Piece[] = [];
  spawnBurst(pieces, w, h, colors, w * 0.5, h * 0.28, 70, 11);

  let raf = 0;
  let alive = true;
  let frame = 0;
  const gravity = 0.18;
  const drag = 0.992;

  const tick = () => {
    if (!alive) return;
    frame += 1;
    // Second + third bursts for a richer celebration
    if (frame === 14) spawnBurst(pieces, w, h, colors, w * 0.35, h * 0.32, 36, 9);
    if (frame === 28) spawnBurst(pieces, w, h, colors, w * 0.65, h * 0.3, 36, 9);

    ctx.clearRect(0, 0, w, h);
    let living = 0;
    for (const p of pieces) {
      p.vy += gravity;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.0065;
      if (p.life <= 0 || p.y > h + 40) continue;
      living += 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 2) {
        ctx.fillRect(-p.w * 0.15, -p.h * 1.4, p.w * 0.3, p.h * 2.8);
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (living === 0 && frame > 40) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  const stop = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    canvas.remove();
  };

  raf = requestAnimationFrame(tick);
  // Safety cap
  window.setTimeout(stop, 6500);

  return { stop };
}
