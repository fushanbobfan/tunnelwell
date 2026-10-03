// The transmission spectrum: exact T against the packet's kinetic energy,
// the share of the packet at each energy, and the runs measured so far.

import { transmission } from './theory.js';

// Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7.
export function erf(x) {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

// Kinetic-energy axis for a landscape: room for its tallest feature, and
// for the packet if it is set above that.
export function spectrumMax(potential, energy = 0) {
  let top = Math.abs(potential.right - potential.left);
  for (const r of potential.regions) top = Math.max(top, Math.abs(r.V - potential.left));
  const base = Math.max(2.5, 2 * top);
  return Math.min(16, energy > base ? energy * 1.25 : base);
}

export function transmissionCurve(potential, eMax, samples = 801) {
  const E = new Float64Array(samples);
  const T = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    E[i] = (eMax * i) / (samples - 1);
    T[i] = transmission(potential, potential.left + E[i]);
  }
  return { E, T };
}

// Share of a Gaussian packet (mean k0, position spread sigma) whose kinetic
// energy falls in each of `bins` equal bins on [0, eMax], from the momentum
// distribution's normal CDF. Left-moving components are left out.
export function energyShares(k0, sigma, eMax, bins = 160) {
  const sk = 1 / (2 * sigma);
  const cdf = (k) => 0.5 * (1 + erf((k - k0) / (sk * Math.SQRT2)));
  const share = new Float64Array(bins);
  let prev = cdf(0);
  for (let b = 0; b < bins; b++) {
    const next = cdf(Math.sqrt((2 * eMax * (b + 1)) / bins));
    share[b] = Math.max(0, next - prev);
    prev = next;
  }
  return share;
}

// Energies of the transmission maxima at least `minHeight` tall, refined
// between neighbouring samples by ternary search.
export function findPeaks(potential, curve, { minHeight = 0.5, limit = 8 } = {}) {
  const { E, T } = curve;
  const peaks = [];
  for (let i = 1; i < E.length - 1 && peaks.length < limit; i++) {
    if (!(T[i] > T[i - 1] && T[i] >= T[i + 1] && T[i] >= minHeight)) continue;
    let lo = E[i - 1];
    let hi = E[i + 1];
    const f = (e) => transmission(potential, potential.left + e);
    for (let n = 0; n < 60; n++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) lo = m1;
      else hi = m2;
    }
    const e = (lo + hi) / 2;
    peaks.push({ energy: e, T: f(e) });
  }
  return peaks;
}

// Add the refined peak tops to a sampled curve so narrow resonances are drawn to full height.
export function insertPeaks(curve, peaks) {
  const points = Array.from(curve.E, (e, i) => [e, curve.T[i]]);
  for (const p of peaks) points.push([p.energy, p.T]);
  points.sort((a, b) => a[0] - b[0]);
  return { E: Float64Array.from(points, (p) => p[0]), T: Float64Array.from(points, (p) => p[1]) };
}

export const SPECTRUM_MARGIN = { left: 46, right: 12, top: 10, bottom: 26 };

const COLORS = {
  bg: '#0b0f17',
  grid: '#1c2433',
  axis: '#8b97ad',
  curve: '#9fd3ff',
  share: 'rgba(242, 166, 90, 0.28)',
  marker: '#f2d479',
  run: '#f2a65a',
};

export function spectrumFrame(width, height, eMax) {
  const m = SPECTRUM_MARGIN;
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  return {
    width, height, plotW, plotH, eMax,
    px: (e) => m.left + (e / eMax) * plotW,
    py: (t) => m.top + (1 - t) * plotH,
    eAt: (px) => Math.min(eMax, Math.max(0, ((px - m.left) / plotW) * eMax)),
  };
}

// scene: { frame, curve, shares, energy, runs: [{ energy, measured, exact }] }
export function drawSpectrum(ctx, scene) {
  const { frame, curve, shares } = scene;
  const { width, height, plotW, plotH, px, py, eMax } = frame;
  const m = SPECTRUM_MARGIN;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of [0, 0.5, 1]) {
    const y = Math.round(py(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(m.left, y);
    ctx.lineTo(m.left + plotW, y);
    ctx.stroke();
    ctx.fillText(`${t * 100}%`, m.left - 6, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = niceEnergyStep(eMax, Math.max(3, Math.min(10, Math.floor(plotW / 70))));
  for (let e = 0; e <= eMax + 1e-9; e += step) {
    const x = Math.round(px(e)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, m.top);
    ctx.lineTo(x, m.top + plotH);
    ctx.stroke();
    ctx.fillText(String(Number(e.toFixed(3))), x, m.top + plotH + 6);
  }

  // The packet's energy spread, scaled so its tallest bin reaches halfway.
  const top = Math.max(...shares);
  if (top > 0) {
    const bw = plotW / shares.length;
    ctx.fillStyle = COLORS.share;
    for (let b = 0; b < shares.length; b++) {
      const h = (shares[b] / top) * 0.5 * plotH;
      if (h > 0.2) ctx.fillRect(m.left + b * bw, m.top + plotH - h, Math.ceil(bw), h);
    }
  }

  ctx.strokeStyle = COLORS.curve;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < curve.E.length; i++) {
    const x = px(curve.E[i]);
    const y = py(curve.T[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.marker;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  const ex = Math.round(px(scene.energy)) + 0.5;
  ctx.beginPath();
  ctx.moveTo(ex, m.top);
  ctx.lineTo(ex, m.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const run of scene.runs) {
    const x = px(run.energy);
    ctx.strokeStyle = COLORS.marker;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, py(run.exact), 5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = COLORS.run;
    ctx.beginPath();
    ctx.arc(x, py(run.measured), 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('kinetic energy', width - m.right, 0);
}

function niceEnergyStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
