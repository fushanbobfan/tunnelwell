// Drawing the landscape and the wave on a 2D canvas. The helpers above
// `draw` are pure so the colour map, sampling and axis fitting can be tested.

export const MARGIN = { left: 46, right: 12, top: 12, bottom: 26 };

// Phase angle to a colour on an even-lightness hue wheel; the height of the
// fill already carries |psi|^2, so the colour only has to show the phase.
export function phaseColor(re, im) {
  const turn = (Math.atan2(im, re) / (2 * Math.PI) + 1) % 1;
  return hslToRgb(turn, 0.75, 0.62);
}

export function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// Average psi and |psi|^2 over the grid points that fall in each pixel column.
export function sampleColumns(grid, psi, columns, view = grid.view) {
  const density = new Float64Array(columns);
  const re = new Float64Array(columns);
  const im = new Float64Array(columns);
  const count = new Uint16Array(columns);
  const span = view.max - view.min;
  for (let i = grid.inner.from; i < grid.inner.to; i++) {
    const c = Math.floor(((grid.x[i] - view.min) / span) * columns);
    if (c < 0 || c >= columns) continue;
    density[c] += psi.re[i] ** 2 + psi.im[i] ** 2;
    re[c] += psi.re[i];
    im[c] += psi.im[i];
    count[c]++;
  }
  for (let c = 0; c < columns; c++) {
    if (count[c] > 0) {
      density[c] /= count[c];
      re[c] /= count[c];
      im[c] /= count[c];
    } else if (c > 0) {
      density[c] = density[c - 1];
      re[c] = re[c - 1];
      im[c] = im[c - 1];
    }
  }
  return { density, re, im };
}

// Energy window: the visible landscape and the packet's energy, with room
// above it for the packet itself. Confining wells are cut off well above the packet.
export function energyRange(grid, V, baseline, { confining = false, height = 0 } = {}) {
  let lo = 0;
  let hi = 0;
  for (let i = grid.inner.from; i < grid.inner.to; i++) {
    if (V[i] < lo) lo = V[i];
    if (V[i] > hi) hi = V[i];
  }
  if (confining) hi = Math.min(hi, Math.max(3 * baseline + 1, 1.5 * height + 0.5));
  const top = Math.max(hi, baseline, 0.5);
  const span0 = top - lo;
  const max = Math.max(hi + 0.08 * span0, baseline + 0.45 * span0);
  const min = lo - 0.08 * span0;
  return { min, max };
}

export function niceStep(span, target = 5) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

export function ticks(min, max, target = 5) {
  const step = niceStep(max - min, target);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Number((Math.abs(v) < step * 1e-9 ? 0 : v).toFixed(6)));
  }
  return out;
}

export function makeFrame(width, height, view, range) {
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  return {
    width, height, plotW, plotH, view, range,
    px: (x) => MARGIN.left + ((x - view.min) / (view.max - view.min)) * plotW,
    py: (e) => MARGIN.top + (1 - (e - range.min) / (range.max - range.min)) * plotH,
    xAt: (px) => view.min + ((px - MARGIN.left) / plotW) * (view.max - view.min),
    eAt: (py) => range.min + (1 - (py - MARGIN.top) / plotH) * (range.max - range.min),
  };
}

const COLORS = {
  bg: '#0b0f17',
  grid: '#1c2433',
  axis: '#8b97ad',
  wall: 'rgba(120, 140, 175, 0.28)',
  wallLine: '#9fb2d6',
  energy: '#f2d479',
  real: '#e8edf7',
};

// scene: { grid, V, psi, frame, baseline, densityScale, showReal, zone }
export function draw(ctx, scene) {
  const { grid, V, psi, frame, baseline, densityScale } = scene;
  const { width, height, plotW, plotH, px, py } = frame;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const e of ticks(frame.range.min, frame.range.max, Math.max(3, Math.floor(plotH / 60)))) {
    const y = Math.round(py(e)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, y);
    ctx.lineTo(MARGIN.left + plotW, y);
    ctx.stroke();
    ctx.fillText(String(e), MARGIN.left - 6, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const x of ticks(frame.view.min, frame.view.max, Math.max(3, Math.min(8, Math.floor(plotW / 80))))) {
    const X = Math.round(px(x)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(X, MARGIN.top);
    ctx.lineTo(X, MARGIN.top + plotH);
    ctx.stroke();
    ctx.fillText(String(x), X, MARGIN.top + plotH + 6);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(MARGIN.left, MARGIN.top, plotW, plotH);
  ctx.clip();

  // Landscape, one sample per pixel column so thin walls never vanish.
  const columns = Math.max(1, Math.round(plotW));
  const vCol = new Float64Array(columns);
  for (let c = 0; c < columns; c++) {
    const x0 = frame.view.min + (c / columns) * (frame.view.max - frame.view.min);
    const x1 = frame.view.min + ((c + 1) / columns) * (frame.view.max - frame.view.min);
    const i0 = Math.max(0, Math.floor((x0 + grid.length / 2) / grid.dx));
    const i1 = Math.min(grid.n - 1, Math.max(i0, Math.ceil((x1 + grid.length / 2) / grid.dx) - 1));
    let best = V[i0];
    for (let i = i0; i <= i1; i++) if (Math.abs(V[i]) > Math.abs(best)) best = V[i];
    vCol[c] = best;
  }
  const zeroY = py(0);
  ctx.fillStyle = COLORS.wall;
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, zeroY);
  for (let c = 0; c < columns; c++) {
    ctx.lineTo(MARGIN.left + c, py(vCol[c]));
    ctx.lineTo(MARGIN.left + c + 1, py(vCol[c]));
  }
  ctx.lineTo(MARGIN.left + columns, zeroY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.wallLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let c = 0; c < columns; c++) {
    const y = py(vCol[c]);
    if (c === 0) ctx.moveTo(MARGIN.left, y);
    else ctx.lineTo(MARGIN.left + c, y);
    ctx.lineTo(MARGIN.left + c + 1, y);
  }
  ctx.stroke();

  // The packet: |psi|^2 rising from its mean energy, coloured by phase.
  const cols = sampleColumns(grid, psi, columns, frame.view);
  const baseY = py(baseline);
  const pxPerUnit = plotH / (frame.range.max - frame.range.min);
  for (let c = 0; c < columns; c++) {
    const h = cols.density[c] * densityScale * pxPerUnit;
    if (h < 0.15) continue;
    const [r, g, b] = phaseColor(cols.re[c], cols.im[c]);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(MARGIN.left + c, baseY - h, 1, h);
  }

  if (scene.showReal) {
    // Scaled so the envelope of Re psi peaks where |psi|^2 started.
    const amp = Math.sqrt(scene.peakDensity) * densityScale * pxPerUnit;
    ctx.strokeStyle = COLORS.real;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c < columns; c++) {
      const y = baseY - cols.re[c] * amp;
      if (c === 0) ctx.moveTo(MARGIN.left, y);
      else ctx.lineTo(MARGIN.left + c, y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.energy;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, Math.round(baseY) + 0.5);
  ctx.lineTo(MARGIN.left + plotW, Math.round(baseY) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.fillStyle = COLORS.energy;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('⟨E⟩', MARGIN.left + 4, baseY - 2);
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('energy', 4, 0);
  ctx.textAlign = 'right';
  ctx.fillText('position x', width - MARGIN.right, 0);
}
