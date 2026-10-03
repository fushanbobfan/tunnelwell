import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barrierTransmission, packetTransmission } from '../src/theory.js';
import {
  erf, spectrumMax, transmissionCurve, energyShares, findPeaks, insertPeaks, spectrumFrame, drawSpectrum,
} from '../src/spectrum.js';

const barrier = { left: 0, right: 0, regions: [{ V: 2, width: 1 }] };
const pair = { left: 0, right: 0, regions: [{ V: 3, width: 0.6 }, { V: 0, width: 4 }, { V: 3, width: 0.6 }] };

test('erf matches known values', () => {
  assert.ok(Math.abs(erf(0)) < 1e-9);
  assert.ok(Math.abs(erf(1) - 0.8427007929) < 2e-7);
  assert.ok(Math.abs(erf(-0.5) + 0.5204998778) < 2e-7);
  assert.ok(Math.abs(erf(4) - 1) < 1e-7);
});

test('the energy axis leaves room for the landscape and the packet', () => {
  assert.equal(spectrumMax(barrier), 4);
  assert.equal(spectrumMax(pair), 6);
  assert.equal(spectrumMax({ left: 0, right: 0, regions: [] }), 2.5);
  assert.equal(spectrumMax({ left: 0, right: 1, regions: [] }), 2.5);
  assert.equal(spectrumMax({ left: 0, right: 0, regions: [{ V: -2, width: 6 }] }), 4);
  assert.equal(spectrumMax(barrier, 5), 6.25);
  assert.equal(spectrumMax(barrier, 3), 4);
});

test('the curve samples the exact transmission from zero kinetic energy', () => {
  const c = transmissionCurve(barrier, 4, 81);
  assert.equal(c.E.length, 81);
  assert.equal(c.E[0], 0);
  assert.equal(c.E[80], 4);
  assert.equal(c.T[0], 0);
  assert.ok(Math.abs(c.T[30] - barrierTransmission(2, 1, 1.5)) < 1e-9);
  const shifted = transmissionCurve({ left: 1, right: 1, regions: [{ V: 3, width: 1 }] }, 4, 81);
  assert.ok(Math.abs(shifted.T[30] - c.T[30]) < 1e-9, 'kinetic energy is measured from the incoming lead');
});

test('energy shares add up to the right-moving part of the packet', () => {
  const shares = energyShares(Math.sqrt(3), 4, 4);
  const total = shares.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-6);
  const peak = shares.indexOf(Math.max(...shares));
  assert.ok(Math.abs(((peak + 0.5) / 160) * 4 - 1.5) < 0.05);
  const still = energyShares(0, 3, 2.5);
  assert.ok(Math.abs(still.reduce((s, v) => s + v, 0) - 0.5) < 1e-6, 'half of a packet at rest moves right');
  // The shares reproduce the packet-averaged transmission.
  const k0 = Math.sqrt(1.2);
  const fine = energyShares(k0, 3, 6, 3000);
  let avg = 0;
  for (let b = 0; b < fine.length; b++) {
    const e = ((b + 0.5) / fine.length) * 6;
    avg += fine[b] * barrierTransmission(2, 1, e);
  }
  assert.ok(Math.abs(avg - packetTransmission(barrier, k0, 3)) < 2e-3);
});

test('peaks are found and refined on the double barrier resonances', () => {
  const c = transmissionCurve(pair, 6);
  const peaks = findPeaks(pair, c);
  assert.ok(peaks.length >= 3);
  assert.ok(Math.abs(peaks[0].energy - 0.2049) < 0.001, `first at ${peaks[0].energy}`);
  assert.ok(Math.abs(peaks[1].energy - 0.8194) < 0.001, `second at ${peaks[1].energy}`);
  const sampledTop = Math.max(...c.T.slice(0, Math.round((0.4 / 6) * 800)));
  assert.ok(sampledTop < 0.99, 'the first peak is narrower than the sampling');
  assert.ok(peaks[0].T > 0.9999, 'refinement climbs to the top of a narrow peak');
  const over = findPeaks(barrier, transmissionCurve(barrier, 8), { minHeight: 0.999 });
  assert.equal(over.length, 1, 'one barrier is transparent only where a half wavelength fits over it');
  assert.ok(Math.abs(over[0].energy - (2 + Math.PI ** 2 / 2)) < 1e-4);
  assert.equal(findPeaks(pair, c, { limit: 2 }).length, 2);
});

test('refined peaks are merged into the curve in energy order', () => {
  const c = transmissionCurve(pair, 6);
  const merged = insertPeaks(c, findPeaks(pair, c));
  assert.equal(merged.E.length, c.E.length + findPeaks(pair, c).length);
  for (let i = 1; i < merged.E.length; i++) assert.ok(merged.E[i] >= merged.E[i - 1]);
  const first = Math.max(...merged.T.slice(0, 60));
  assert.ok(first > 0.9999, 'the narrow first resonance now reaches the top');
});

test('the frame maps energy to pixels and clamps clicks', () => {
  const f = spectrumFrame(600, 180, 4);
  assert.ok(Math.abs(f.eAt(f.px(1.25)) - 1.25) < 1e-9);
  assert.equal(f.eAt(-50), 0);
  assert.equal(f.eAt(5000), 4);
  assert.ok(f.py(1) < f.py(0));
});

test('drawing the spectrum runs against a recording context', () => {
  const counts = { arc: 0, fillRect: 0 };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => { if (key in counts) counts[key]++; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  drawSpectrum(ctx, {
    frame: spectrumFrame(600, 180, 6),
    curve: transmissionCurve(pair, 6, 201),
    shares: energyShares(Math.sqrt(1.66), 9, 6),
    energy: 0.83,
    runs: [{ energy: 0.83, measured: 0.4, exact: 0.41 }],
  });
  assert.equal(counts.arc, 2);
  assert.ok(counts.fillRect > 3);
});
