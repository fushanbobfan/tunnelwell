import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromPreset, clampSettings, encodeHash, decodeHash, encodeCells, decodeCells,
} from '../src/params.js';
import { CELL_COUNT } from '../src/potentials.js';

test('presets fill every setting and unknown names fall back to the barrier', () => {
  const s = fromPreset('double');
  assert.equal(s.height, 3);
  assert.equal(s.cells, null);
  assert.equal(fromPreset('nope').preset, 'barrier');
  assert.equal(fromPreset('custom').cells.length, CELL_COUNT);
  assert.equal(fromPreset('constructor').preset, 'barrier');
});

test('clamping bounds and snaps numbers and repairs bad input', () => {
  const s = clampSettings({ ...fromPreset('barrier'), height: 99, width: 'x', energy: 1.234, speed: 0 });
  assert.equal(s.height, 8);
  assert.equal(s.width, 1);
  assert.equal(s.energy, 1.23);
  assert.equal(s.speed, 1);
});

test('an untouched preset encodes to a short link and edits round-trip', () => {
  assert.equal(encodeHash(fromPreset('lattice')), '#p=lattice');
  const s = { ...fromPreset('well'), height: 3.5, energy: 0.42, x0: -20 };
  const hash = encodeHash(s);
  assert.equal(hash, '#p=well&h=3.5&e=0.42&x=-20');
  assert.deepEqual(decodeHash(hash), clampSettings(s));
});

test('painted cells survive the link to a tenth of a unit', () => {
  const cells = Array.from({ length: CELL_COUNT }, (_, i) => Math.round((Math.sin(i / 7) * 4 + 1) * 10) / 10);
  cells[3] = -5;
  cells[4] = 10;
  const text = encodeCells(cells);
  assert.equal(text.length, 320);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCells(text), cells);
  assert.equal(decodeCells('short'), null);
  const s = { ...fromPreset('custom'), cells };
  assert.deepEqual(decodeHash(encodeHash(s)).cells, cells);
  assert.deepEqual(decodeHash('#p=custom&c=broken').cells, new Array(CELL_COUNT).fill(0));
});

test('garbage hashes decode to a valid barrier scene', () => {
  assert.deepEqual(decodeHash('#%%%&h=abc'), fromPreset('barrier'));
  assert.deepEqual(decodeHash(''), fromPreset('barrier'));
});
