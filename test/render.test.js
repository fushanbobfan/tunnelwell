import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, gaussianPacket } from '../src/wave.js';
import { buildPotential, PRESETS } from '../src/potentials.js';
import {
  phaseColor, hslToRgb, sampleColumns, energyRange, niceStep, ticks, makeFrame, draw, levelFrame, drawLevelChart,
} from '../src/render.js';

const grid = createGrid();

test('phase colours go once round the hue wheel', () => {
  assert.deepEqual(hslToRgb(0, 1, 0.5), [255, 0, 0]);
  assert.deepEqual(hslToRgb(1 / 3, 1, 0.5), [0, 255, 0]);
  const a = phaseColor(1, 0);
  const b = phaseColor(-1, 1e-12);
  const c = phaseColor(-1, -1e-12);
  assert.notDeepEqual(a, b);
  assert.ok(b.every((v, i) => Math.abs(v - c[i]) <= 1), 'continuous across the branch cut');
  assert.deepEqual(phaseColor(2, 0), a, 'magnitude does not change the colour');
});

test('column sampling averages density and keeps the total', () => {
  const psi = gaussianPacket(grid, { x0: 0, sigma: 5, k0: 0 });
  const cols = sampleColumns(grid, psi, 300);
  const span = grid.view.max - grid.view.min;
  const total = cols.density.reduce((s, d) => s + d, 0) * (span / 300);
  assert.ok(Math.abs(total - 1) < 0.01, `total ${total}`);
  const peak = cols.density.indexOf(Math.max(...cols.density));
  assert.ok(Math.abs(peak - 150) <= 1);
  assert.ok(cols.im.every((v) => Math.abs(v) < 1e-12), 'a packet at rest is real');
  assert.ok(cols.density.every((d) => d > 0 || d === 0));
  const wide = sampleColumns(grid, psi, 4000);
  assert.ok(wide.density.every(Number.isFinite), 'more columns than points still fills every column');
});

test('the energy window holds the landscape and leaves room above the packet', () => {
  const barrier = buildPotential(grid, { preset: 'barrier', ...PRESETS.barrier });
  const r = energyRange(grid, barrier, 1.5);
  assert.ok(r.min < 0 && r.max > 2 && r.max > 1.5 + 0.4 * 2);
  const well = buildPotential(grid, { preset: 'well', ...PRESETS.well });
  assert.ok(energyRange(grid, well, 1).min < -2);
  const dw = buildPotential(grid, { preset: 'doublewell', ...PRESETS.doublewell });
  const capped = energyRange(grid, dw, 0.1, { confining: true, height: 0.3 });
  assert.ok(capped.max < 3, `double well window ${capped.max}`);
});

test('ticks land on round numbers', () => {
  assert.equal(niceStep(10), 2);
  assert.equal(niceStep(120, 8), 20);
  assert.deepEqual(ticks(-60, 60, 8), [-60, -40, -20, 0, 20, 40, 60]);
  assert.deepEqual(ticks(-0.3, 2.4, 5), [0, 0.5, 1, 1.5, 2]);
});

test('frames map positions and energies both ways', () => {
  const f = makeFrame(800, 400, { min: -60, max: 60 }, { min: -1, max: 3 });
  assert.ok(Math.abs(f.xAt(f.px(12.5)) - 12.5) < 1e-9);
  assert.ok(Math.abs(f.eAt(f.py(1.25)) - 1.25) < 1e-9);
  assert.ok(f.py(3) < f.py(-1), 'higher energy is drawn higher');
});

test('drawing runs end to end against a recording context', () => {
  const calls = { fillRect: 0, stroke: 0 };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { if (key in calls) calls[key]++; return args; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const V = buildPotential(grid, { preset: 'barrier', ...PRESETS.barrier });
  const psi = gaussianPacket(grid, { x0: -30, sigma: 4, k0: 1.7 });
  const frame = makeFrame(600, 300, grid.view, energyRange(grid, V, 1.5));
  draw(ctx, { grid, V, psi, frame, baseline: 1.5, densityScale: 10, peakDensity: 0.1, showReal: true });
  assert.ok(calls.fillRect > 20, 'the packet is drawn as columns');
  assert.ok(calls.stroke > 5);
});

test('level lines and the stick chart draw against a recording context', () => {
  const calls = { fillRect: 0, stroke: 0 };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => { if (key in calls) calls[key]++; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const V = buildPotential(grid, { preset: 'harmonic', ...PRESETS.harmonic });
  const psi = gaussianPacket(grid, { x0: -30, sigma: 2.74, k0: 0 });
  const frame = makeFrame(600, 300, grid.view, energyRange(grid, V, 2, { confining: true, height: 2 }));
  draw(ctx, { grid, V, psi, frame, baseline: 2, densityScale: 10, peakDensity: 0.1, levels: [0.5, 1, 1.5, 99] });
  const strokes = calls.stroke;
  draw(ctx, { grid, V, psi, frame, baseline: 2, densityScale: 10, peakDensity: 0.1 });
  assert.equal(strokes - (calls.stroke - strokes), 3, 'one stroke per level inside the window');
  const lf = levelFrame(600, 190, 0, 4);
  assert.equal(lf.px(0), 46);
  assert.equal(lf.px(4), 588);
  const before = calls.fillRect;
  drawLevelChart(ctx, { frame: lf, states: [{ energy: 1 }, { energy: 2 }], weights: [0.7, 0.3] });
  assert.equal(calls.fillRect - before, 5, 'background, then a line and a bar per state');
});
