import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrid, indexOf, gaussianPacket, probability, meanX, spreadX, energy, momentumWeights, createSolver,
} from '../src/wave.js';

const grid = createGrid();

test('the grid spans the box and keeps the absorbing edges off screen', () => {
  assert.equal(grid.n, 2048);
  assert.ok(Math.abs(grid.x[0] + 80) < 1e-12);
  assert.ok(Math.abs(grid.view.min + 60) < grid.dx);
  assert.ok(Math.abs(grid.view.max - 60) <= grid.dx + 1e-9);
  assert.equal(indexOf(grid, 0), 1024);
  assert.equal(indexOf(grid, -1000), 0);
});

test('a packet is normalised with the requested centre, spread and momentum', () => {
  const psi = gaussianPacket(grid, { x0: -20, sigma: 3, k0: 1.5 });
  assert.ok(Math.abs(probability(grid, psi) - 1) < 1e-12);
  assert.ok(Math.abs(meanX(grid, psi) + 20) < 1e-9);
  assert.ok(Math.abs(spreadX(grid, psi) - 3) < 1e-6);
  const w = momentumWeights(grid, psi);
  let mean = 0;
  for (let i = 0; i < grid.n; i++) mean += w[i] * grid.k[i];
  assert.ok(Math.abs(mean - 1.5) < 1e-6);
  const V = new Float64Array(grid.n);
  assert.ok(Math.abs(energy(grid, psi, V) - (1.5 ** 2 / 2 + 1 / (8 * 9))) < 1e-6);
});

test('a free packet keeps its norm, moves at k0 and spreads as theory says', () => {
  const sigma = 2;
  const psi = gaussianPacket(grid, { x0: -20, sigma, k0: 1 });
  const solver = createSolver(grid, new Float64Array(grid.n));
  solver.step(psi, 1000);
  const t = solver.time;
  assert.ok(Math.abs(t - 20) < 1e-9);
  assert.ok(Math.abs(probability(grid, psi) - 1) < 1e-9);
  assert.ok(Math.abs(meanX(grid, psi) - 0) < 1e-6);
  const want = sigma * Math.sqrt(1 + (t / (2 * sigma * sigma)) ** 2);
  assert.ok(Math.abs(spreadX(grid, psi) - want) < 1e-4, `${spreadX(grid, psi)} vs ${want}`);
});

test('a coherent state in a harmonic well swings with period 2 pi / omega', () => {
  const omega = 0.1;
  const V = grid.x.map((x) => 0.5 * omega * omega * x * x);
  const psi = gaussianPacket(grid, { x0: -20, sigma: Math.sqrt(1 / (2 * omega)), k0: 0 });
  const solver = createSolver(grid, V, { dt: 0.01 });
  const quarter = Math.round(Math.PI / 2 / omega / solver.dt);
  solver.step(psi, quarter);
  assert.ok(Math.abs(meanX(grid, psi)) < 0.05);
  solver.step(psi, quarter);
  assert.ok(Math.abs(meanX(grid, psi) - 20) < 0.05);
  assert.ok(Math.abs(spreadX(grid, psi) - Math.sqrt(5)) < 0.01, 'a coherent state does not breathe');
});

test('the edges absorb an outgoing packet and book it to the side it left from', () => {
  const psi = gaussianPacket(grid, { x0: 30, sigma: 3, k0: 2 });
  const solver = createSolver(grid, new Float64Array(grid.n));
  solver.step(psi, 3000);
  const left = probability(grid, psi);
  assert.ok(left < 1e-4, `remaining ${left}`);
  assert.ok(solver.absorbed.right > 0.999);
  assert.ok(solver.absorbed.left < 1e-3);
  assert.ok(Math.abs(left + solver.absorbed.left + solver.absorbed.right - 1) < 1e-6);
  solver.reset();
  assert.equal(solver.time, 0);
  assert.equal(solver.absorbed.right, 0);
});
