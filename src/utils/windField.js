/**
 * Simple curl-like wind: pseudo-vector field from smooth trig layers.
 * nx, ny are normalized 0–1 (particle origin in the field).
 */
export function windVector(nx, ny, mode, stepT) {
  const t = stepT * 0.4;
  const c1 = Math.sin(nx * 8.2 + ny * 3.1 + t);
  const c2 = Math.cos(nx * 5.7 - ny * 6.4 + t * 0.7);
  const c3 = Math.sin(nx * 12 + ny * 9 - t * 0.5) * 0.35;

  if (mode === "right") {
    const vx = 1.05 + c1 * 0.42 + c3 * 0.2;
    const vy = -0.12 + c2 * 0.38 + c1 * 0.15;
    return { vx, vy };
  }

  const vx = 0.18 + c1 * 0.55 + c3 * 0.25;
  const vy = -0.92 + c2 * 0.32 - Math.abs(c3) * 0.12;
  return { vx, vy };
}

/**
 * Euler-integrate a short trajectory through the field → keyframe offsets (px).
 */
export function integrateWindPath(nx, ny, mode, { steps = 6, stepScale = 38 } = {}) {
  let x = 0;
  let y = 0;
  const xs = [0];
  const ys = [0];

  for (let i = 0; i < steps; i += 1) {
    const { vx, vy } = windVector(
      Math.min(1, Math.max(0, nx + x * 0.0012)),
      Math.min(1, Math.max(0, ny + y * 0.0012)),
      mode,
      i * 0.22
    );
    x += vx * stepScale;
    y += vy * stepScale;
    xs.push(x);
    ys.push(y);
  }

  return { xs, ys };
}
