// One-dimensional Schrodinger equation in units where hbar = m = 1, so a
// plane wave e^{ikx} carries energy k^2/2 and moves at speed k.

import { makeFFT } from './fft.js';

// A periodic grid of n points on [-length/2, length/2). The outer `edge`
// units on each side hold the absorbing layers and stay off screen.
export function createGrid({ n = 2048, length = 160, edge = 20 } = {}) {
  const dx = length / n;
  const x = new Float64Array(n);
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = -length / 2 + i * dx;
    k[i] = ((2 * Math.PI) / length) * (i < n / 2 ? i : i - n);
  }
  const inner = { from: Math.ceil(edge / dx), to: n - Math.ceil(edge / dx) };
  return {
    n, length, dx, x, k, edge, inner,
    view: { min: x[inner.from], max: x[inner.to - 1] },
    fft: makeFFT(n),
  };
}

export function indexOf(grid, x) {
  return Math.min(grid.n - 1, Math.max(0, Math.round((x + grid.length / 2) / grid.dx)));
}

// psi = exp(-(x - x0)^2 / (4 sigma^2) + i k0 x), normalised, so |psi|^2 is a
// Gaussian with standard deviation sigma and the momentum spread is 1/(2 sigma).
export function gaussianPacket(grid, { x0 = 0, sigma = 4, k0 = 0 } = {}) {
  const re = new Float64Array(grid.n);
  const im = new Float64Array(grid.n);
  for (let i = 0; i < grid.n; i++) {
    const d = grid.x[i] - x0;
    const amp = Math.exp(-(d * d) / (4 * sigma * sigma));
    re[i] = amp * Math.cos(k0 * grid.x[i]);
    im[i] = amp * Math.sin(k0 * grid.x[i]);
  }
  const scale = 1 / Math.sqrt(probability(grid, { re, im }));
  for (let i = 0; i < grid.n; i++) {
    re[i] *= scale;
    im[i] *= scale;
  }
  return { re, im };
}

export function probability(grid, psi, from = 0, to = grid.n) {
  let sum = 0;
  for (let i = Math.max(0, from); i < Math.min(grid.n, to); i++) sum += psi.re[i] ** 2 + psi.im[i] ** 2;
  return sum * grid.dx;
}

export function meanX(grid, psi) {
  let sum = 0;
  let total = 0;
  for (let i = 0; i < grid.n; i++) {
    const p = psi.re[i] ** 2 + psi.im[i] ** 2;
    sum += p * grid.x[i];
    total += p;
  }
  return total > 0 ? sum / total : 0;
}

export function spreadX(grid, psi) {
  const mean = meanX(grid, psi);
  let sum = 0;
  let total = 0;
  for (let i = 0; i < grid.n; i++) {
    const p = psi.re[i] ** 2 + psi.im[i] ** 2;
    sum += p * (grid.x[i] - mean) ** 2;
    total += p;
  }
  return total > 0 ? Math.sqrt(sum / total) : 0;
}

// Momentum-space weights |phi(k)|^2, normalised to sum to one over the grid's k values.
export function momentumWeights(grid, psi) {
  const re = Float64Array.from(psi.re);
  const im = Float64Array.from(psi.im);
  grid.fft.forward(re, im);
  const w = new Float64Array(grid.n);
  let total = 0;
  for (let i = 0; i < grid.n; i++) {
    w[i] = re[i] ** 2 + im[i] ** 2;
    total += w[i];
  }
  if (total > 0) for (let i = 0; i < grid.n; i++) w[i] /= total;
  return w;
}

// Mean energy per unit of remaining probability: <k^2/2> + <V>.
export function energy(grid, psi, V) {
  const w = momentumWeights(grid, psi);
  let kinetic = 0;
  for (let i = 0; i < grid.n; i++) kinetic += (w[i] * grid.k[i] ** 2) / 2;
  let potential = 0;
  let total = 0;
  for (let i = 0; i < grid.n; i++) {
    const p = psi.re[i] ** 2 + psi.im[i] ** 2;
    potential += p * V[i];
    total += p;
  }
  return kinetic + (total > 0 ? potential / total : 0);
}

// Strang-split propagator: half a potential kick, a full kinetic step in
// momentum space, another half kick, then the absorbing mask at the edges.
// The probability the mask removes is booked to the side it left from.
export function createSolver(grid, V, { dt = 0.02, absorb = 1.5 } = {}) {
  const { n } = grid;
  const kinRe = new Float64Array(n);
  const kinIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const phase = -(grid.k[i] ** 2 / 2) * dt;
    kinRe[i] = Math.cos(phase);
    kinIm[i] = Math.sin(phase);
  }
  const mask = new Float64Array(n).fill(1);
  const width = grid.edge;
  for (let i = 0; i < n; i++) {
    const depth = Math.max(grid.view.min - grid.x[i], grid.x[i] - grid.view.max, 0);
    if (depth > 0) mask[i] = Math.exp(-absorb * (depth / width) ** 2 * dt);
  }
  const potRe = new Float64Array(n);
  const potIm = new Float64Array(n);

  const solver = {
    dt,
    time: 0,
    absorbed: { left: 0, right: 0 },
    setPotential(next) {
      for (let i = 0; i < n; i++) {
        const phase = (-next[i] * dt) / 2;
        potRe[i] = Math.cos(phase);
        potIm[i] = Math.sin(phase);
      }
    },
    reset() {
      solver.time = 0;
      solver.absorbed.left = 0;
      solver.absorbed.right = 0;
    },
    step(psi, count = 1) {
      const { re, im } = psi;
      const mid = n / 2;
      for (let s = 0; s < count; s++) {
        kick(re, im, potRe, potIm);
        grid.fft.forward(re, im);
        kick(re, im, kinRe, kinIm);
        grid.fft.inverse(re, im);
        kick(re, im, potRe, potIm);
        for (let i = 0; i < n; i++) {
          const m = mask[i];
          if (m === 1) continue;
          const lost = (re[i] ** 2 + im[i] ** 2) * (1 - m * m) * grid.dx;
          if (i < mid) solver.absorbed.left += lost;
          else solver.absorbed.right += lost;
          re[i] *= m;
          im[i] *= m;
        }
        solver.time += dt;
      }
    },
  };
  solver.setPotential(V);
  return solver;
}

function kick(re, im, cr, ci) {
  for (let i = 0; i < re.length; i++) {
    const r = re[i];
    re[i] = r * cr[i] - im[i] * ci[i];
    im[i] = r * ci[i] + im[i] * cr[i];
  }
}
