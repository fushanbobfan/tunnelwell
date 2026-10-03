import {
  createGrid, gaussianPacket, createSolver, energy, probability, meanX, indexOf,
} from './wave.js';
import { regionsFromSamples, transmission, packetTransmission } from './theory.js';
import {
  PRESETS, buildPotential, cellsFromPotential, paintCells, interactionZone, splitProbability,
} from './potentials.js';
import { RANGES, fromPreset, clampSettings, encodeHash, decodeHash } from './params.js';
import { draw, energyRange, makeFrame } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('plot');
const ctx = canvas.getContext('2d');
const grid = createGrid();

const LANDSCAPE = ['height', 'width', 'gap'];
const VISIBLE = {
  height: ['barrier', 'step', 'double', 'well', 'lattice', 'harmonic', 'doublewell'],
  width: ['barrier', 'double', 'well', 'lattice'],
  gap: ['double', 'lattice', 'doublewell'],
};

const state = {
  settings: decodeHash(location.hash),
  V: null,
  zone: null,
  theory: null,
  psi: null,
  solver: null,
  baseline: 0,
  peakDensity: 1,
  densityScale: 1,
  range: { min: 0, max: 1 },
  size: { width: 600, height: 340 },
  playing: false,
  finished: false,
  painting: false,
  stroke: null,
  showReal: false,
  dirty: true,
};

const pct = (p) => `${(100 * Math.max(0, p)).toFixed(1)} %`;
const scattering = () => PRESETS[state.settings.preset].scatter;

function setStatus(text) {
  $('status').textContent = text;
}

function buildLandscape() {
  const s = state.settings;
  state.V = buildPotential(grid, s);
  const zone = interactionZone(grid, state.V);
  const mid = indexOf(grid, 0);
  state.zone = zone ?? { from: mid, to: mid };
  state.solver?.setPotential(state.V);
}

function computeTheory() {
  const s = state.settings;
  state.theory = null;
  if (!scattering()) return;
  // The exact answer is for a wave arriving from the left; skip it if the packet starts on the landscape.
  if (s.x0 + 3 * s.sigma > grid.x[state.zone.from]) return;
  const pot = regionsFromSamples(state.V, grid.dx, state.zone.from, state.zone.to);
  const k0 = Math.sqrt(2 * s.energy);
  state.theory = {
    packet: packetTransmission(pot, k0, s.sigma),
    plane: s.energy > 0 ? transmission(pot, pot.left + s.energy) : 0,
  };
}

function fitAxes() {
  const s = state.settings;
  state.range = energyRange(grid, state.V, state.baseline, { confining: !scattering(), height: s.height });
  state.densityScale = (0.32 * (state.range.max - state.range.min)) / state.peakDensity;
  state.frame = makeFrame(state.size.width, state.size.height, grid.view, state.range);
}

function resetPacket() {
  const s = state.settings;
  state.psi = gaussianPacket(grid, { x0: s.x0, sigma: s.sigma, k0: Math.sqrt(2 * s.energy) });
  if (state.solver) state.solver.reset();
  else state.solver = createSolver(grid, state.V);
  state.solver.setPotential(state.V);
  state.baseline = energy(grid, state.psi, state.V);
  state.peakDensity = 1 / (s.sigma * Math.sqrt(2 * Math.PI));
  state.finished = false;
  fitAxes();
  computeTheory();
  describe();
  state.dirty = true;
}

function describe() {
  const s = state.settings;
  canvas.setAttribute(
    'aria-label',
    `${PRESETS[s.preset].label}: a packet with kinetic energy ${s.energy} starting at x = ${s.x0}.`,
  );
}

function updateReadout() {
  const t = state.theory;
  const cells = ['m-r', 'm-i', 'm-t', 'x-r', 'x-t', 'p-r', 'p-t'];
  if (!scattering()) {
    for (const id of cells) $(id).textContent = '–';
  } else {
    const parts = splitProbability(grid, state.psi, state.zone, state.solver.absorbed);
    $('m-r').textContent = pct(parts.reflected);
    $('m-i').textContent = pct(parts.inside);
    $('m-t').textContent = pct(parts.transmitted);
    $('x-r').textContent = t ? pct(1 - t.packet) : '–';
    $('x-t').textContent = t ? pct(t.packet) : '–';
    $('p-r').textContent = t ? pct(1 - t.plane) : '–';
    $('p-t').textContent = t ? pct(t.plane) : '–';
  }
  const onScreen = probability(grid, state.psi, grid.inner.from, grid.inner.to);
  const where = onScreen > 0.01 ? ` · ⟨x⟩ = ${meanX(grid, state.psi).toFixed(1)}` : '';
  $('clock').textContent = `t = ${state.solver.time.toFixed(1)}${where} · ${pct(onScreen)} of the wave still on screen`;
}

function render() {
  draw(ctx, {
    grid,
    V: state.V,
    psi: state.psi,
    frame: state.frame,
    baseline: state.baseline,
    densityScale: state.densityScale,
    peakDensity: state.peakDensity,
    showReal: state.showReal,
  });
  updateReadout();
}

function tick() {
  if (state.playing) {
    state.solver.step(state.psi, state.settings.speed);
    state.dirty = true;
    if (scattering() && probability(grid, state.psi) < 0.005) finish();
  }
  if (state.dirty) {
    render();
    state.dirty = false;
  }
  requestAnimationFrame(tick);
}

function finish() {
  setPlaying(false);
  state.finished = true;
  const parts = splitProbability(grid, state.psi, state.zone, state.solver.absorbed);
  const exact = state.theory ? ` The exact answer for this packet is ${pct(state.theory.packet)}.` : '';
  setStatus(`Done: ${pct(parts.transmitted)} got through and ${pct(parts.reflected)} came back.${exact}`);
}

function setPlaying(on) {
  if (on && state.finished) resetPacket();
  state.playing = on;
  $('play').textContent = on ? 'Pause' : 'Play';
  if (on) setStatus('Running');
  else if (!state.finished) setStatus(`Paused at t = ${state.solver.time.toFixed(1)}`);
}

function saveHash() {
  history.replaceState(null, '', encodeHash(state.settings));
}

// --- Controls -------------------------------------------------------------

function syncControls() {
  const s = state.settings;
  $('preset').value = s.preset;
  $('note').textContent = PRESETS[s.preset].note;
  for (const key of Object.keys(RANGES)) {
    $(key).value = s[key];
    $(`${key}-out`).textContent = format(key, s[key]);
  }
  for (const [key, presets] of Object.entries(VISIBLE)) {
    document.querySelector(`.slider[data-key="${key}"]`).hidden = !presets.includes(s.preset);
  }
  $('height-label').textContent = s.preset === 'well' ? 'Depth'
    : s.preset === 'harmonic' ? 'Height at x = ±30'
      : s.preset === 'doublewell' ? 'Hump height' : 'Height';
  $('gap-label').textContent = s.preset === 'doublewell' ? 'Well separation' : 'Gap';
}

function format(key, v) {
  if (key === 'speed') return String(v);
  if (key === 'energy') return `${v.toFixed(2)}  (k₀ = ${Math.sqrt(2 * v).toFixed(2)})`;
  return v.toFixed(key === 'height' ? 2 : 1);
}

function applySettings(next, { landscape = true } = {}) {
  state.settings = clampSettings(next);
  if (landscape) buildLandscape();
  resetPacket();
  syncControls();
  saveHash();
  if (state.playing) setStatus('Running');
  else setStatus('Ready: press Play');
}

function initControls() {
  const select = $('preset');
  for (const [name, p] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = p.label;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      applySettings({ ...state.settings, preset: 'custom', cells: cellsFromPotential(grid, state.V) });
    } else {
      applySettings({ ...fromPreset(select.value), speed: state.settings.speed });
    }
  });

  for (const [key, r] of Object.entries(RANGES)) {
    const input = $(key);
    input.min = r.min;
    input.max = r.max;
    input.step = r.step;
    input.addEventListener('input', () => {
      const next = { ...state.settings, [key]: Number(input.value) };
      if (key === 'speed') {
        state.settings = clampSettings(next);
        $('speed-out').textContent = format('speed', state.settings.speed);
        saveHash();
        return;
      }
      applySettings(next, { landscape: LANDSCAPE.includes(key) });
    });
  }

  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('reset').addEventListener('click', () => {
    resetPacket();
    state.finished = false;
    setPlaying(false);
    setStatus('Reset: press Play');
  });
  $('paint').addEventListener('click', () => setPainting(!state.painting));
  $('real').addEventListener('change', (e) => {
    state.showReal = e.target.checked;
    state.dirty = true;
  });
  $('share').addEventListener('click', async () => {
    saveHash();
    try {
      await navigator.clipboard.writeText(location.href);
      setStatus('Link copied');
    } catch {
      setStatus(`Link: ${location.href}`);
    }
  });
  $('png').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tunnelwell-${state.settings.preset}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea, button')) return;
    const s = state.settings;
    if (e.key === ' ') setPlaying(!state.playing);
    else if (e.key === 'r' || e.key === 'R') $('reset').click();
    else if (e.key === 'p' || e.key === 'P') setPainting(!state.painting);
    else if (e.key === '[') applySettings({ ...s, energy: s.energy - 0.05 }, { landscape: false });
    else if (e.key === ']') applySettings({ ...s, energy: s.energy + 0.05 }, { landscape: false });
    else return;
    e.preventDefault();
  });
}

// --- Painting -------------------------------------------------------------

function setPainting(on) {
  state.painting = on;
  $('paint').setAttribute('aria-pressed', String(on));
  canvas.classList.toggle('painting', on);
  setStatus(on ? 'Painting: drag across the plot to draw the landscape' : 'Painting off');
}

function pointerAt(e) {
  const rect = canvas.getBoundingClientRect();
  const f = state.frame;
  return { x: f.xAt(e.clientX - rect.left), v: f.eAt(e.clientY - rect.top) };
}

function paintTo(point) {
  const from = state.stroke ?? point;
  const s = state.settings;
  s.cells = paintCells(s.cells, from.x, from.v, point.x, point.v);
  state.stroke = point;
  buildLandscape();
  state.dirty = true;
}

function initPainting() {
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.painting) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (state.settings.preset !== 'custom') {
      state.settings = clampSettings({ ...state.settings, preset: 'custom', cells: cellsFromPotential(grid, state.V) });
      syncControls();
    }
    state.stroke = null;
    paintTo(pointerAt(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state.stroke) paintTo(pointerAt(e));
  });
  const end = () => {
    if (!state.stroke) return;
    state.stroke = null;
    computeTheory();
    saveHash();
    state.dirty = true;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// --- Layout ---------------------------------------------------------------

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.size = { width: Math.max(200, rect.width), height: Math.max(160, rect.height) };
  canvas.width = Math.round(state.size.width * dpr);
  canvas.height = Math.round(state.size.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.frame = makeFrame(state.size.width, state.size.height, grid.view, state.range);
  state.dirty = true;
}

initControls();
initPainting();
buildLandscape();
resetPacket();
syncControls();
new ResizeObserver(resize).observe(canvas);
resize();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) setStatus('Ready: press Play');
else setPlaying(true);
window.addEventListener('hashchange', () => applySettings(decodeHash(location.hash)));
requestAnimationFrame(tick);
