// Bound states of a confining well: the lowest eigenvalues and eigenvectors
// of the finite-difference Hamiltonian H = -(1/2) d^2/dx^2 + V on the
// visible window, with psi = 0 just outside it.

// Number of eigenvalues of the symmetric tridiagonal matrix below `lambda`
// (diagonal d, constant off-diagonal e), by counting sign changes of the
// LDL^T pivots (Sturm sequence).
export function countBelow(d, e, lambda) {
  let count = 0;
  let q = 1;
  for (let i = 0; i < d.length; i++) {
    q = d[i] - lambda - (i > 0 ? (e * e) / q : 0);
    if (q === 0) q = -1e-300;
    if (q < 0) count++;
  }
  return count;
}

// Solve (T - shift) x = b for a tridiagonal T with constant off-diagonal e.
function solveShifted(d, e, shift, b) {
  const n = d.length;
  const c = new Float64Array(n);
  const x = new Float64Array(n);
  let denom = d[0] - shift;
  if (denom === 0) denom = 1e-300;
  c[0] = e / denom;
  x[0] = b[0] / denom;
  for (let i = 1; i < n; i++) {
    denom = d[i] - shift - e * c[i - 1];
    if (denom === 0) denom = 1e-300;
    c[i] = e / denom;
    x[i] = (b[i] - e * x[i - 1]) / denom;
  }
  for (let i = n - 2; i >= 0; i--) x[i] -= c[i] * x[i + 1];
  return x;
}

// States with energy below `maxEnergy`, at most `limit` of them, as
// { energy, from, values } with values normalised on the grid (sum |phi|^2 dx = 1).
export function boundStates(grid, V, { maxEnergy = Infinity, limit = 60 } = {}) {
  const { from, to } = grid.inner;
  const n = to - from;
  const h = 1 / (grid.dx * grid.dx);
  const d = new Float64Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    d[i] = h + V[from + i];
    lo = Math.min(lo, V[from + i]);
    hi = Math.max(hi, d[i] + h);
  }
  const e = -h / 2;
  const cap = Math.min(limit, countBelow(d, e, Math.min(maxEnergy, hi)));
  const states = [];
  for (let k = 0; k < cap; k++) {
    // Bisection for the k-th eigenvalue.
    let a = lo;
    let b = Math.min(maxEnergy, hi);
    for (let it = 0; it < 80 && b - a > 1e-13 * Math.max(1, Math.abs(b)); it++) {
      const m = (a + b) / 2;
      if (countBelow(d, e, m) > k) b = m;
      else a = m;
    }
    const lambda = (a + b) / 2;
    // Inverse iteration from a smooth start that is not orthogonal to any state.
    let x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = 1 + 0.1 * Math.sin(0.37 * i);
    const shift = lambda - 1e-10 * Math.max(1, Math.abs(lambda));
    for (let it = 0; it < 3; it++) {
      x = solveShifted(d, e, shift, x);
      let norm = 0;
      for (let i = 0; i < n; i++) norm += x[i] * x[i];
      norm = Math.sqrt(norm * grid.dx);
      for (let i = 0; i < n; i++) x[i] /= norm;
    }
    // Fix the sign so the first lobe is positive, for stable pictures.
    let first = 0;
    for (let i = 0; i < n && first === 0; i++) if (Math.abs(x[i]) > 1e-3) first = Math.sign(x[i]);
    if (first < 0) for (let i = 0; i < n; i++) x[i] = -x[i];
    states.push({ energy: lambda, from, values: x });
  }
  return states;
}

// |<phi_n|psi>|^2 for each state.
export function overlaps(grid, psi, states) {
  return states.map(({ from, values }) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < values.length; i++) {
      re += values[i] * psi.re[from + i];
      im += values[i] * psi.im[from + i];
    }
    return (re * re + im * im) * grid.dx * grid.dx;
  });
}

// Time for a packet made of the two lowest states to move from one well to
// the other: half a beat of their splitting.
export function tunnellingTime(states) {
  if (states.length < 2) return Infinity;
  return Math.PI / (states[1].energy - states[0].energy);
}
