import {
  createGrid, gaussianPacket, createSolver, energy, probability, meanX, indexOf,
} from './wave.js';
import { regionsFromSamples, transmission, packetTransmission } from './theory.js';
import {
  PRESETS, buildPotential, cellsFromPotential, paintCells, interactionZone, splitProbability,
} from './potentials.js';
import { RANGES, fromPreset, clampSettings, encodeHash, decodeHash } from './params.js';
import { draw, energyRange, makeFrame, levelFrame, drawLevelChart } from './render.js';
import { boundStates, overlaps, tunnellingTime } from './eigen.js';
import {
  spectrumMax, transmissionCurve, energyShares, findPeaks, insertPeaks, spectrumFrame, drawSpectrum,
} from './spectrum.js';

const $ = (id) => document.getElementById(id);
const canvas = $('plot');
const ctx = canvas.getContext('2d');
const specCanvas = $('spectrum');
const specCtx = specCanvas.getContext('2d');
const levelCanvas = $('levels');
const levelCtx = levelCanvas.getContext('2d');
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
  landscapeVersion: 0,
  spectrum: null,
  specSize: { width: 600, height: 190 },
  runs: [],
  bound: null,
  levelSize: { width: 600, height: 190 },
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
  state.landscapeVersion++;
  state.runs = [];
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

// The curve and its peaks depend only on the landscape; the shares follow the packet.
function computeSpectrum() {
  const s = state.settings;
  const on = scattering();
  $('spectrum-panel').hidden = !on;
  $('levels-panel').hidden = on;
  if (!on) {
    state.spectrum = null;
    return;
  }
  const pot = regionsFromSamples(state.V, grid.dx, state.zone.from, state.zone.to);
  const eMax = spectrumMax(pot, s.energy);
  const key = `${state.landscapeVersion}:${eMax}`;
  let { spectrum } = state;
  if (!spectrum || spectrum.key !== key) {
    const sampled = transmissionCurve(pot, eMax);
    const peaks = findPeaks(pot, sampled, { limit: 6 });
    spectrum = { key, eMax, curve: insertPeaks(sampled, findPeaks(pot, sampled, { limit: 200 })), peaks };
    const text = spectrum.peaks.length
      ? `Full or near-full transmission at kinetic energy ${spectrum.peaks.map((p) => p.energy.toFixed(2)).join(', ')}.`
      : `No transmission peak above 50 % below kinetic energy ${eMax}.`;
    $('peaks').textContent = text;
    specCanvas.setAttribute('aria-label', `Exact transmission against kinetic energy from 0 to ${eMax}. ${text}`);
  }
  spectrum.shares = energyShares(Math.sqrt(2 * s.energy), s.sigma, eMax);
  spectrum.frame = spectrumFrame(state.specSize.width, state.specSize.height, eMax);
  state.spectrum = spectrum;
}

// Stationary states of a confining well and the packet's share in each.
// The states depend on the landscape; the shares are fixed once the packet is placed.
function computeBound() {
  if (scattering()) {
    state.bound = null;
    return;
  }
  const s = state.settings;
  const key = `${state.landscapeVersion}:${state.range.max}`;
  if (!state.bound || state.bound.key !== key) {
    state.bound = { key, states: boundStates(grid, state.V, { maxEnergy: state.range.max, limit: 150 }) };
  }
  const { states } = state.bound;
  const weights = overlaps(grid, state.psi, states);
  state.bound.weights = weights;
  const eMin = Math.min(0, state.range.min);
  const eMax = state.range.max;
  state.bound.frame = levelFrame(state.levelSize.width, state.levelSize.height, eMin, eMax);
  const captured = weights.reduce((a, b) => a + b, 0);
  const best = weights.indexOf(Math.max(...weights));
  const parts = [];
  if (states.length > 0) {
    parts.push(`${states.length} states below energy ${eMax.toFixed(1)} hold ${pct(captured)} of the packet; the largest share, ${pct(weights[best])}, is in state ${best} at energy ${states[best].energy.toFixed(3)}.`);
  }
  if (s.preset === 'doublewell' && states.length >= 2) {
    const split = states[1].energy - states[0].energy;
    parts.push(`The two lowest states are split by ${split.toPrecision(3)}, so a packet in one well crosses to the other in about π/ΔE = ${tunnellingTime(states).toFixed(0)} time units.`);
  } else if (states.length >= 2) {
    const spacing = states[1].energy - states[0].energy;
    parts.push(`The lowest levels are spaced by ${spacing.toFixed(4)}, a classical period of 2π/ΔE = ${((2 * Math.PI) / spacing).toFixed(1)}.`);
  }
  const text = parts.join(' ');
  $('levels-text').textContent = text;
  levelCanvas.setAttribute('aria-label', `Share of the packet in each bound state. ${text}`);
}

function renderLevels() {
  if (!state.bound) return;
  drawLevelChart(levelCtx, { frame: state.bound.frame, states: state.bound.states, weights: state.bound.weights });
}

function renderSpectrum() {
  if (!state.spectrum) return;
  drawSpectrum(specCtx, {
    frame: state.spectrum.frame,
    curve: state.spectrum.curve,
    shares: state.spectrum.shares,
    energy: state.settings.energy,
    runs: state.runs,
  });
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
  computeSpectrum();
  computeBound();
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
  renderSpectrum();
  renderLevels();
  draw(ctx, {
    grid,
    V: state.V,
    psi: state.psi,
    frame: state.frame,
    baseline: state.baseline,
    densityScale: state.densityScale,
    peakDensity: state.peakDensity,
    showReal: state.showReal,
    levels: state.bound?.states.map((st) => st.energy),
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
  if (state.theory) {
    state.runs = [...state.runs.slice(-39), { energy: state.settings.energy, measured: parts.transmitted, exact: state.theory.packet }];
    state.dirty = true;
  }
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
  const before = state.settings;
  state.settings = clampSettings(next);
  if (landscape) buildLandscape();
  else if (state.settings.sigma !== before.sigma) state.runs = [];
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
    computeSpectrum();
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
  const srect = specCanvas.getBoundingClientRect();
  state.specSize = { width: Math.max(200, srect.width), height: Math.max(120, srect.height) };
  specCanvas.width = Math.round(state.specSize.width * dpr);
  specCanvas.height = Math.round(state.specSize.height * dpr);
  specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lrect = levelCanvas.getBoundingClientRect();
  state.levelSize = { width: Math.max(200, lrect.width), height: Math.max(120, lrect.height) };
  levelCanvas.width = Math.round(state.levelSize.width * dpr);
  levelCanvas.height = Math.round(state.levelSize.height * dpr);
  levelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.bound) state.bound.frame = levelFrame(state.levelSize.width, state.levelSize.height, Math.min(0, state.range.min), state.range.max);
  if (state.spectrum) state.spectrum.frame = spectrumFrame(state.specSize.width, state.specSize.height, state.spectrum.eMax);
  state.dirty = true;
}

// Click the spectrum to fire a packet at that kinetic energy.
specCanvas.addEventListener('click', (e) => {
  if (!state.spectrum) return;
  const rect = specCanvas.getBoundingClientRect();
  const energyAt = Math.round(state.spectrum.frame.eAt(e.clientX - rect.left) * 100) / 100;
  setPlaying(false);
  applySettings({ ...state.settings, energy: energyAt }, { landscape: false });
  setPlaying(true);
});

initControls();
initPainting();
buildLandscape();
resetPacket();
syncControls();
const observer = new ResizeObserver(resize);
observer.observe(canvas);
observer.observe(specCanvas);
observer.observe(levelCanvas);
resize();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) setStatus('Ready: press Play');
else setPlaying(true);
window.addEventListener('hashchange', () => applySettings(decodeHash(location.hash)));
requestAnimationFrame(tick);
