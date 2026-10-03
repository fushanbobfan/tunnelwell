// Exact stationary scattering off a piecewise-constant potential (hbar = m = 1).
// A potential is a list of regions { V, width } between a left lead at
// `left` and a right lead at `right`. The wave arrives from the left.

// Merge equal neighbours so long flat runs cost one matrix, not hundreds.
export function compress(regions) {
  const out = [];
  for (const r of regions) {
    if (!(r.width > 0)) continue;
    const last = out[out.length - 1];
    if (last && last.V === r.V) last.width += r.width;
    else out.push({ V: r.V, width: r.width });
  }
  return out;
}

// Treat every grid point between `from` and `to` as a cell of width dx.
export function regionsFromSamples(V, dx, from, to) {
  const regions = [];
  for (let i = from; i < to; i++) regions.push({ V: V[i], width: dx });
  return { left: V[from - 1] ?? V[from], right: V[to] ?? V[to - 1], regions: compress(regions) };
}

// Transmission probability T(E). Start from a pure outgoing wave on the
// right, carry psi and psi' back through each region with the real transfer
// matrix [[c, -s], [d, c]], and read off the incoming amplitude on the left.
export function transmission(potential, E) {
  const { left, right, regions } = potential;
  if (!(E > left) || !(E > right)) return 0;
  const kL = Math.sqrt(2 * (E - left));
  const kR = Math.sqrt(2 * (E - right));
  let pr = 1;
  let pi = 0;
  let dr = 0;
  let di = kR;
  for (let j = regions.length - 1; j >= 0; j--) {
    const { V, width } = regions[j];
    const q2 = 2 * (E - V);
    let c;
    let s;
    let d;
    if (q2 > 1e-12) {
      const q = Math.sqrt(q2);
      c = Math.cos(q * width);
      s = Math.sin(q * width) / q;
      d = q * Math.sin(q * width);
    } else if (q2 < -1e-12) {
      const q = Math.sqrt(-q2);
      c = Math.cosh(q * width);
      s = Math.sinh(q * width) / q;
      d = -q * Math.sinh(q * width);
    } else {
      c = 1;
      s = width;
      d = 0;
    }
    const nr = c * pr - s * dr;
    const ni = c * pi - s * di;
    const mr = d * pr + c * dr;
    const mi = d * pi + c * di;
    pr = nr; pi = ni; dr = mr; di = mi;
  }
  // psi = A e^{ikx} + B e^{-ikx} on the left: A = (psi + psi' / (i kL)) / 2.
  const ar = (pr + di / kL) / 2;
  const ai = (pi - dr / kL) / 2;
  const t = (kR / kL) / (ar * ar + ai * ai);
  return Math.min(1, t);
}

// Textbook closed form for a single rectangular barrier, used to check the above.
export function barrierTransmission(V0, a, E) {
  if (V0 === 0) return 1;
  if (E < V0) {
    const kappa = Math.sqrt(2 * (V0 - E));
    return 1 / (1 + (V0 * V0 * Math.sinh(kappa * a) ** 2) / (4 * E * (V0 - E)));
  }
  if (E === V0) return 1 / (1 + (V0 * a * a) / 2);
  const q = Math.sqrt(2 * (E - V0));
  return 1 / (1 + (V0 * V0 * Math.sin(q * a) ** 2) / (4 * E * (E - V0)));
}

// T averaged over the momentum spread of a Gaussian packet with mean k0 and
// position spread sigma: |phi(k)|^2 is Gaussian with standard deviation 1/(2 sigma).
// Components moving left from the start never reach the target and count as reflected.
export function packetTransmission(potential, k0, sigma, samples = 401) {
  const sk = 1 / (2 * sigma);
  const lo = k0 - 6 * sk;
  const hi = k0 + 6 * sk;
  const h = (hi - lo) / (samples - 1);
  let num = 0;
  let den = 0;
  for (let j = 0; j < samples; j++) {
    const k = lo + j * h;
    const w = Math.exp(-((k - k0) ** 2) / (2 * sk * sk)) * (j === 0 || j === samples - 1 ? 0.5 : 1);
    den += w;
    if (k > 0) num += w * transmission(potential, potential.left + (k * k) / 2);
  }
  return den > 0 ? num / den : 0;
}
