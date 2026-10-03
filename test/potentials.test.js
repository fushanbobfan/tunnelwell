import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, gaussianPacket, createSolver, probability } from '../src/wave.js';
import { regionsFromSamples, packetTransmission, transmission } from '../src/theory.js';
import {
  PRESETS, CELL_COUNT, presetValue, buildPotential, cellsFromPotential, paintCells, cellIndex,
  interactionZone, splitProbability,
} from '../src/potentials.js';

const grid = createGrid();
const settingsFor = (preset) => ({ preset, ...PRESETS[preset] });

test('every preset has a label, a note and starting values inside the view', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.ok(p.label && p.note, name);
    assert.ok(p.x0 > grid.view.min + 3 * p.sigma && p.x0 < 0, `${name} starts in view`);
  }
});

test('the double barrier and lattice place their walls where the parameters say', () => {
  const s = { height: 3, width: 0.6, gap: 4 };
  assert.equal(presetValue('double', s, 0), 0);
  assert.equal(presetValue('double', s, 2.3), 3);
  assert.equal(presetValue('double', s, -2.3), 3);
  assert.equal(presetValue('double', s, 2.7), 0);
  const l = { height: 2, width: 0.8, gap: 2.2 };
  let walls = 0;
  let prev = 0;
  for (let x = -20; x < 20; x += 0.01) {
    const v = presetValue('lattice', l, x);
    if (v > 0 && prev === 0) walls++;
    prev = v;
  }
  assert.equal(walls, 6);
  assert.equal(presetValue('lattice', l, 1.5), 2, 'centred on the origin');
  assert.equal(presetValue('lattice', l, -1.5), 2, 'centred on the origin');
});

test('a scattering zone covers exactly the barrier cells and is null in free space', () => {
  const V = buildPotential(grid, settingsFor('barrier'));
  const zone = interactionZone(grid, V);
  assert.ok(Math.abs((zone.to - zone.from) * grid.dx - 1) < 2 * grid.dx);
  for (let i = zone.from; i < zone.to; i++) assert.equal(V[i], 2);
  assert.equal(interactionZone(grid, buildPotential(grid, settingsFor('free'))), null);
  const step = interactionZone(grid, buildPotential(grid, settingsFor('step')));
  assert.equal(step.from, step.to);
});

test('painting fills every cell along a stroke and clamps the value', () => {
  const cells = new Array(CELL_COUNT).fill(0);
  const out = paintCells(cells, -2, 1, 2, 3);
  assert.equal(cells[cellIndex(0)], 0, 'input untouched');
  assert.equal(out[cellIndex(-2)], 1);
  assert.equal(out[cellIndex(2)], 3);
  assert.ok(out[cellIndex(0)] > 1.8 && out[cellIndex(0)] < 2.2);
  assert.equal(paintCells(cells, 5, 99, 5, 99)[cellIndex(5)], 10);
  const sampled = cellsFromPotential(grid, buildPotential(grid, settingsFor('well')));
  assert.equal(sampled[cellIndex(0)], -2);
  assert.equal(sampled[cellIndex(10)], 0);
  const custom = buildPotential(grid, { preset: 'custom', cells: sampled });
  assert.equal(custom[grid.n / 2], -2);
});

test('a confining well stays finite in the absorbing layers', () => {
  const V = buildPotential(grid, settingsFor('doublewell'));
  assert.ok(V.every((v) => Number.isFinite(v) && v <= 40));
  assert.equal(V[0], 40);
});

test('the simulated packet splits as the exact transmission predicts', () => {
  for (const name of ['barrier', 'step', 'double', 'well', 'lattice']) {
    const s = settingsFor(name);
    const V = buildPotential(grid, s);
    const zone = interactionZone(grid, V);
    const k0 = Math.sqrt(2 * s.energy);
    const psi = gaussianPacket(grid, { x0: s.x0, sigma: s.sigma, k0 });
    const solver = createSolver(grid, V);
    // Run until the absorbing edges have taken almost everything, as the page does.
    while (probability(grid, psi) > 0.005) solver.step(psi, 100);
    const parts = splitProbability(grid, psi, zone, solver.absorbed);
    const total = parts.reflected + parts.inside + parts.transmitted;
    assert.ok(Math.abs(total - 1) < 1e-6, 'probability is accounted for');
    assert.ok(parts.inside < 0.005);
    const want = packetTransmission(regionsFromSamples(V, grid.dx, zone.from, zone.to), k0, s.sigma);
    assert.ok(Math.abs(parts.transmitted - want) < 0.012, `${name}: measured ${parts.transmitted} vs ${want}`);
  }
});

test('regions sampled from a preset reproduce its plane-wave transmission', () => {
  const V = buildPotential(grid, settingsFor('double'));
  const zone = interactionZone(grid, V);
  const pot = regionsFromSamples(V, grid.dx, zone.from, zone.to);
  assert.equal(pot.regions.length, 3);
  assert.ok(transmission(pot, 0.6) >= 0 && transmission(pot, 0.6) <= 1);
  assert.ok(probability(grid, gaussianPacket(grid, { x0: -30, sigma: 8, k0: 1 })) > 0.999);
});
