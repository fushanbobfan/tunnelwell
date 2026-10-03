import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compress, regionsFromSamples, transmission, barrierTransmission, packetTransmission,
} from '../src/theory.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
const barrier = (V0, a) => ({ left: 0, right: 0, regions: [{ V: V0, width: a }] });

test('compress merges equal neighbours and drops empty regions', () => {
  assert.deepEqual(
    compress([{ V: 1, width: 0.5 }, { V: 1, width: 0.5 }, { V: 0, width: 0 }, { V: 2, width: 1 }]),
    [{ V: 1, width: 1 }, { V: 2, width: 1 }],
  );
});

test('a rectangular barrier matches the closed form below, at and above its top', () => {
  for (const [V0, a] of [[2, 1], [3, 0.6], [1, 4]]) {
    for (const E of [0.1, 0.7, 1.5, V0, V0 + 0.3, 2 * V0 + 1]) {
      close(transmission(barrier(V0, a), E), barrierTransmission(V0, a, E), 1e-9);
    }
  }
  close(barrierTransmission(2, 1, 1.5), 1 / (1 + (4 * Math.sinh(1) ** 2) / 3));
});

test('a well is a barrier turned upside down and is transparent at its resonances', () => {
  const well = barrier(-2, 6);
  close(transmission(well, 1), barrierTransmission(-2, 6, 1));
  // Full transmission when the width holds a whole number of half wavelengths.
  const q = (4 * Math.PI) / 6;
  close(transmission(well, (q * q) / 2 - 2), 1, 1e-9);
});

test('a potential step transmits 4 kL kR / (kL + kR)^2 and nothing below its top', () => {
  const step = { left: 0, right: 1, regions: [] };
  const kL = Math.sqrt(3);
  const kR = Math.sqrt(1);
  close(transmission(step, 1.5), (4 * kL * kR) / (kL + kR) ** 2);
  assert.equal(transmission(step, 0.8), 0);
});

test('splitting a region into grid cells does not change the answer', () => {
  const dx = 0.05;
  const V = new Float64Array(200);
  for (let i = 80; i < 100; i++) V[i] = 2;
  const sampled = regionsFromSamples(V, dx, 10, 190);
  assert.equal(sampled.regions.length, 3);
  close(transmission(sampled, 1.2), barrierTransmission(2, 20 * dx, 1.2));
});

test('two thin barriers are almost opaque except at sharp resonances', () => {
  const pair = { left: 0, right: 0, regions: [{ V: 3, width: 0.6 }, { V: 0, width: 4 }, { V: 3, width: 0.6 }] };
  let best = 0;
  let bestE = 0;
  for (let E = 0.05; E < 1.2; E += 0.0005) {
    const t = transmission(pair, E);
    if (t > best) { best = t; bestE = E; }
  }
  assert.ok(best > 0.999, `peak ${best}`);
  assert.ok(transmission(barrier(3, 0.6), bestE) < 0.3, 'one barrier alone stops most of it');
  assert.ok(transmission(pair, bestE + 0.1) < 0.2);
});

test('a packet averages T over its momentum spread', () => {
  const b = barrier(2, 1);
  const k0 = Math.sqrt(3);
  close(packetTransmission(b, k0, 400), transmission(b, 1.5), 1e-4);
  const wide = packetTransmission(b, k0, 2);
  assert.ok(wide > transmission(b, 1.5), 'convex T(E) below the top: spreading raises the average');
  assert.ok(wide < 1);
  close(packetTransmission({ left: 0, right: 0, regions: [] }, 0, 3), 0.5, 1e-2);
});
