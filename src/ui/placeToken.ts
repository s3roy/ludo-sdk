/** Place a token group at board pixels. Pins use SVG transform (tip = 0,0). */

/** Pin tip sinks slightly into the foot/seat so the point doesn’t hover above the disc. */
export const PIN_TIP_PLANT = 1.6;

function setPinTranslate(node: SVGGElement, x: number, y: number) {
  node.style.removeProperty('transition');
  node.style.removeProperty('transform');
  node.setAttribute('transform', `translate(${x}, ${y})`);
}

function parsePinTranslate(node: SVGGElement): { x: number; y: number } | null {
  const m = /translate\(\s*([-\d.]+)(?:px)?\s*,\s*([-\d.]+)(?:px)?\s*\)/.exec(
    node.getAttribute('transform') ?? '',
  );
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export function placeTokenAt(
  node: SVGGElement,
  x: number,
  y: number,
  opts?: { animate?: boolean; durationMs?: number },
) {
  const isPin = node.classList.contains('ludo-sdk__pawn--pin');
  // Yard seats: tip dead-center on the disc (plant offset reads as off-center)
  const lift = isPin
    ? node.getAttribute('data-yard') === '1'
      ? 0
      : PIN_TIP_PLANT
    : 2;
  const tx = x;
  const ty = y + lift;
  const animate = !!opts?.animate;
  const ms = opts?.durationMs ?? 0;

  if (isPin) {
    // Must be SVG attribute — CSS transform-origin can't target local tip (0,0)
    if (animate && ms > 0) {
      const from = parsePinTranslate(node) ?? { x: tx, y: ty };
      const t0 = performance.now();
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / ms);
        const e = 1 - (1 - u) ** 3;
        setPinTranslate(
          node,
          from.x + (tx - from.x) * e,
          from.y + (ty - from.y) * e,
        );
        if (u < 1) requestAnimationFrame(tick);
        else setPinTranslate(node, tx, ty);
      };
      requestAnimationFrame(tick);
    } else {
      setPinTranslate(node, tx, ty);
    }
    return;
  }

  if (!animate) {
    node.style.transition = 'none';
  } else {
    node.style.transition = `transform ${ms}ms cubic-bezier(0.25, 0.85, 0.35, 1)`;
  }
  node.style.transform = `translate(${tx}px, ${ty}px)`;
}

export function tokenTranslateKey(node: SVGGElement): string {
  if (node.classList.contains('ludo-sdk__pawn--pin')) {
    return node.getAttribute('transform') ?? '';
  }
  return node.style.transform ?? '';
}
