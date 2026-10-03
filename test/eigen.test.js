import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, gaussianPacket, createSolver, meanX } from '../src/wave.js';
import { buildPotential, PRESETS } from '../src/potentials.js';
import { countBelow, boundStates, overlaps, tunnellingTime } from '../src/eigen.js';

const grid = createGrid();

test('Sturm counts match a small matrix with known eigenvalues', () => {
  // [[2,-1,0],[-1,2,-1],[0,-1,2]] has eigenvalues 2 - sqrt2, 2, 2 + sqrt2.
  const d = Float64Array.from([2, 2, 2]);
  assert.equal(countBelow(d, -1, 0.5), 0);
  assert.equal(countBelow(d, -1, 1), 1);
  assert.equal(countBelow(d, -1, 2.5), 2);
  assert.equal(countBelow(d, -1, 4), 3);
});

test('harmonic levels are evenly spaced at omega (n + 1/2)', () => {
  const omega = 0.2;
  const V = grid.x.map((x) => 0.5 * omega * omega * x * x);
  const states = boundStates(grid, V, { limit: 10 });
  assert.equal(states.length, 10);
  states.forEach((s, n) => {
    assert.ok(Math.abs(s.energy - omega * (n + 0.5)) < 1e-3 * (n + 1), `level ${n}: ${s.energy}`);
  });
  const norm = states[3].values.reduce((acc, v) => acc + v * v, 0) * grid.dx;
  assert.ok(Math.abs(norm - 1) < 1e-9);
  let dot = 0;
  for (let i = 0; i < states[0].values.length; i++) dot += states[0].values[i] * states[2].values[i];
  assert.ok(Math.abs(dot * grid.dx) < 1e-6, 'states are orthogonal');
});

test('maxEnergy and limit cut the list', () => {
  const V = buildPotential(grid, { preset: 'harmonic', ...PRESETS.harmonic });
  const omega = Math.sqrt((2 * PRESETS.harmonic.height) / 900);
  const below = boundStates(grid, V, { maxEnergy: 1, limit: 500 });
  assert.equal(below.length, Math.floor(1 / omega + 0.5));
  assert.ok(below.every((s) => s.energy < 1));
  assert.equal(boundStates(grid, V, { limit: 5 }).length, 5);
});

test('a coherent state spreads over levels as a Poisson distribution', () => {
  const omega = 0.2;
  const V = grid.x.map((x) => 0.5 * omega * omega * x * x);
  const states = boundStates(grid, V, { limit: 40 });
  const x0 = -6;
  const psi = gaussianPacket(grid, { x0, sigma: Math.sqrt(1 / (2 * omega)), k0: 0 });
  const w = overlaps(grid, psi, states);
  const mean = (omega * x0 * x0) / 2;
  let fact = 1;
  for (let n = 0; n < 8; n++) {
    if (n > 0) fact *= n;
    const poisson = (Math.exp(-mean) * mean ** n) / fact;
    assert.ok(Math.abs(w[n] - poisson) < 2e-3, `n=${n}: ${w[n]} vs ${poisson}`);
  }
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-3);
});

test('the double well splits its lowest pair and predicts the tunnelling time', () => {
  const s = { preset: 'doublewell', ...PRESETS.doublewell };
  const V = buildPotential(grid, s);
  const states = boundStates(grid, V, { limit: 4 });
  const split = states[1].energy - states[0].energy;
  assert.ok(split > 0 && split < 0.1 * (states[2].energy - states[1].energy), 'a tight doublet');
  const t = tunnellingTime(states);
  const psi = gaussianPacket(grid, { x0: s.x0, sigma: s.sigma, k0: 0 });
  const solver = createSolver(grid, V, { dt: 0.05 });
  solver.step(psi, Math.round(t / solver.dt));
  assert.ok(meanX(grid, psi) > 0.6 * (s.gap / 2), `after ${t.toFixed(0)} the packet sits in the right well: ${meanX(grid, psi)}`);
  assert.equal(tunnellingTime(states.slice(0, 1)), Infinity);
});
