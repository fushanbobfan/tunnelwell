import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFFT } from '../src/fft.js';

function naiveDFT(re, im) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * j * k) / n;
      outRe[k] += re[j] * Math.cos(a) - im[j] * Math.sin(a);
      outIm[k] += re[j] * Math.sin(a) + im[j] * Math.cos(a);
    }
  }
  return [outRe, outIm];
}

function randomSignal(n, seed) {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  return [Float64Array.from({ length: n }, next), Float64Array.from({ length: n }, next)];
}

test('rejects sizes that are not powers of two', () => {
  assert.throws(() => makeFFT(12), RangeError);
  assert.throws(() => makeFFT(1), RangeError);
});

test('forward transform matches the direct DFT', () => {
  for (const n of [2, 8, 64]) {
    const [re, im] = randomSignal(n, n);
    const [wantRe, wantIm] = naiveDFT(re, im);
    makeFFT(n).forward(re, im);
    for (let k = 0; k < n; k++) {
      assert.ok(Math.abs(re[k] - wantRe[k]) < 1e-9, `re[${k}] for n=${n}`);
      assert.ok(Math.abs(im[k] - wantIm[k]) < 1e-9, `im[${k}] for n=${n}`);
    }
  }
});

test('inverse undoes forward', () => {
  const n = 1024;
  const [re, im] = randomSignal(n, 7);
  const re0 = Float64Array.from(re);
  const im0 = Float64Array.from(im);
  const fft = makeFFT(n);
  fft.forward(re, im);
  fft.inverse(re, im);
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(re[i] - re0[i]) < 1e-12);
    assert.ok(Math.abs(im[i] - im0[i]) < 1e-12);
  }
});

test('a pure tone lands in a single bin and Parseval holds', () => {
  const n = 256;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    re[j] = Math.cos((2 * Math.PI * 5 * j) / n);
    im[j] = Math.sin((2 * Math.PI * 5 * j) / n);
  }
  makeFFT(n).forward(re, im);
  assert.ok(Math.abs(re[5] - n) < 1e-9);
  let other = 0;
  for (let k = 0; k < n; k++) if (k !== 5) other += re[k] ** 2 + im[k] ** 2;
  assert.ok(other < 1e-12);
});
