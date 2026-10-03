// Scene settings: defaults per preset, clamping, and share links that keep
// only what differs from the preset (plus the painted cells, if any).

import { PRESETS, CELL_COUNT, V_MIN, V_MAX } from './potentials.js';

export const RANGES = {
  height: { min: 0, max: 8, step: 0.05 },
  width: { min: 0.2, max: 12, step: 0.1 },
  gap: { min: 0.5, max: 30, step: 0.1 },
  energy: { min: 0, max: 8, step: 0.01 },
  sigma: { min: 0.8, max: 12, step: 0.1 },
  x0: { min: -50, max: 50, step: 0.5 },
  speed: { min: 1, max: 40, step: 1 },
};

const KEYS = { height: 'h', width: 'w', gap: 'g', energy: 'e', sigma: 's', x0: 'x', speed: 'v' };
const DEFAULT_SPEED = 8;

export function fromPreset(name) {
  const key = Object.hasOwn(PRESETS, name) ? name : 'barrier';
  const p = PRESETS[key];
  return {
    preset: key,
    height: p.height,
    width: p.width,
    gap: p.gap,
    energy: p.energy,
    sigma: p.sigma,
    x0: p.x0,
    speed: DEFAULT_SPEED,
    cells: key === 'custom' ? new Array(CELL_COUNT).fill(0) : null,
  };
}

function clampNumber(value, { min, max, step }, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  const snapped = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
}

export function clampSettings(s) {
  const base = fromPreset(s.preset);
  const out = { ...base };
  for (const name of Object.keys(RANGES)) out[name] = clampNumber(s[name], RANGES[name], base[name]);
  if (out.preset === 'custom') {
    const cells = Array.isArray(s.cells) && s.cells.length === CELL_COUNT ? s.cells : base.cells;
    out.cells = cells.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(Math.min(V_MAX, Math.max(V_MIN, n)) * 10) / 10 : 0;
    });
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// One byte per cell: tenths of an energy unit above V_MIN.
export function encodeCells(cells) {
  const bytes = cells.map((v) => Math.round((v - V_MIN) * 10));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  return out;
}

export function decodeCells(text) {
  if (typeof text !== 'string' || text.length !== (CELL_COUNT / 3) * 4) return null;
  const cells = [];
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const d = B64.indexOf(text[i + j]);
      if (d < 0) return null;
      n = (n << 6) | d;
    }
    cells.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return cells.map((b) => Math.round(Math.min(V_MAX, Math.max(V_MIN, b / 10 + V_MIN)) * 10) / 10);
}

export function encodeHash(settings) {
  const s = clampSettings(settings);
  const base = fromPreset(s.preset);
  const parts = [`p=${s.preset}`];
  for (const [name, key] of Object.entries(KEYS)) {
    if (s[name] !== base[name]) parts.push(`${key}=${s[name]}`);
  }
  if (s.preset === 'custom') parts.push(`c=${encodeCells(s.cells)}`);
  return `#${parts.join('&')}`;
}

export function decodeHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const s = fromPreset(params.get('p'));
  for (const [name, key] of Object.entries(KEYS)) {
    if (params.has(key)) s[name] = params.get(key);
  }
  if (s.preset === 'custom') s.cells = decodeCells(params.get('c')) ?? s.cells;
  return clampSettings(s);
}
