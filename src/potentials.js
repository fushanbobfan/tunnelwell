// Potential landscapes on the simulation grid, the custom painted profile,
// and the bookkeeping that splits a packet into reflected, inside and transmitted parts.

export const V_MIN = -5;
export const V_MAX = 10;
export const CELL = 0.5;
export const CELL_COUNT = 240;
export const CELL_ORIGIN = -60;

export const PRESETS = {
  barrier: {
    label: 'Single barrier', scatter: true, height: 2, width: 1, gap: 4, energy: 1.5, sigma: 4, x0: -30,
    note: 'Below the top of the barrier a classical particle always bounces. The wave leaks through, and the leak shrinks exponentially with the barrier width.',
  },
  step: {
    label: 'Potential step', scatter: true, height: 1, width: 1, gap: 4, energy: 1.5, sigma: 4, x0: -30,
    note: 'Even with enough energy to climb the step, part of the wave reflects off the sudden change. The transmitted part slows down and its wavelength stretches.',
  },
  double: {
    label: 'Double barrier', scatter: true, height: 3, width: 0.6, gap: 4, energy: 0.83, sigma: 9, x0: -30,
    note: 'Two thin walls make a cavity. At the energies of its quasi-bound states the pair turns transparent; in between it is nearly a mirror. This packet is tuned to the second resonance: watch probability pile up inside and leak out both ways. Move the energy to 0.6 and almost nothing gets through.',
  },
  well: {
    label: 'Square well', scatter: true, height: 2, width: 6, gap: 4, energy: 1, sigma: 4, x0: -30,
    note: 'An attractive well also reflects. When a whole number of half wavelengths fits across it the reflections cancel and the well becomes invisible.',
  },
  lattice: {
    label: 'Six-barrier lattice', scatter: true, height: 2, width: 0.8, gap: 2.2, energy: 1.7, sigma: 8, x0: -35,
    note: 'A short crystal. Energies inside a band pass; energies in a gap between bands are reflected. This packet sits in a band; lower its energy to 1.0 and it lands in a gap.',
  },
  harmonic: {
    label: 'Harmonic well', scatter: false, height: 2, width: 1, gap: 4, energy: 0, sigma: 2.74, x0: -30,
    note: 'A packet released from rest swings back and forth with the classical period. With the coherent width it keeps its shape; any other width makes it breathe twice per swing.',
  },
  doublewell: {
    label: 'Double well', scatter: false, height: 0.5, width: 1, gap: 8, energy: 0, sigma: 1, x0: -4,
    note: 'A packet placed in one well tunnels slowly through the hump into the other and back again.',
  },
  free: {
    label: 'Free space', scatter: true, height: 0, width: 1, gap: 4, energy: 1.5, sigma: 2, x0: -30,
    note: 'Nothing in the way. The packet still spreads: the narrower it starts, the faster it spreads.',
  },
  custom: {
    label: 'Painted', scatter: true, height: 2, width: 1, gap: 4, energy: 1.5, sigma: 4, x0: -30,
    note: 'Drag on the plot to paint your own landscape. The exact transmission follows whatever you draw.',
  },
};

export const LATTICE_BARRIERS = 6;

const clampV = (v) => Math.min(V_MAX, Math.max(V_MIN, v));

// Value of the landscape at x for the analytic presets.
export function presetValue(name, { height, width, gap }, x) {
  const h = width / 2;
  switch (name) {
    case 'barrier':
      return Math.abs(x) < h ? height : 0;
    case 'step':
      return x >= 0 ? height : 0;
    case 'double': {
      const c = (gap + width) / 2;
      return Math.abs(Math.abs(x) - c) < h ? height : 0;
    }
    case 'well':
      return Math.abs(x) < h ? -height : 0;
    case 'lattice': {
      const period = width + gap;
      const span = LATTICE_BARRIERS * period - gap;
      const u = x + span / 2;
      if (u < 0 || u >= span) return 0;
      return u % period < width ? height : 0;
    }
    case 'harmonic':
      return height * (x / 30) ** 2;
    case 'doublewell': {
      const d = gap / 2;
      return height * ((x / d) ** 2 - 1) ** 2;
    }
    default:
      return 0;
  }
}

export function cellIndex(x) {
  return Math.min(CELL_COUNT - 1, Math.max(0, Math.floor((x - CELL_ORIGIN) / CELL)));
}

export function buildPotential(grid, settings) {
  const V = new Float64Array(grid.n);
  for (let i = 0; i < grid.n; i++) {
    const x = grid.x[i];
    if (settings.preset === 'custom') {
      V[i] = settings.cells[cellIndex(x)];
    } else {
      // Confining wells keep rising into the absorbing layers, capped so the phases stay tame.
      const v = presetValue(settings.preset, settings, x);
      V[i] = PRESETS[settings.preset]?.scatter === false ? Math.min(v, 40) : clampV(v);
    }
  }
  return V;
}

// Sample the current landscape into paintable cells, rounded to 0.1.
export function cellsFromPotential(grid, V) {
  const cells = new Array(CELL_COUNT);
  for (let c = 0; c < CELL_COUNT; c++) {
    const x = CELL_ORIGIN + (c + 0.5) * CELL;
    const i = Math.min(grid.n - 1, Math.max(0, Math.round((x + grid.length / 2) / grid.dx)));
    cells[c] = Math.round(clampV(V[i]) * 10) / 10;
  }
  return cells;
}

// Paint a straight stroke from (x1, v1) to (x2, v2), touching every cell between.
export function paintCells(cells, x1, v1, x2, v2) {
  const out = cells.slice();
  const c1 = cellIndex(x1);
  const c2 = cellIndex(x2);
  const lo = Math.min(c1, c2);
  const hi = Math.max(c1, c2);
  for (let c = lo; c <= hi; c++) {
    const f = c1 === c2 ? 1 : (c - c1) / (c2 - c1);
    out[c] = Math.round(clampV(v1 + (v2 - v1) * f) * 10) / 10;
  }
  return out;
}

// Grid indices [from, to) where the landscape differs from its two flat ends,
// or null when it is flat everywhere.
export function interactionZone(grid, V) {
  const leftV = V[0];
  const rightV = V[grid.n - 1];
  let from = -1;
  let to = -1;
  for (let i = 0; i < grid.n; i++) if (V[i] !== leftV) { from = i; break; }
  for (let i = grid.n - 1; i >= 0; i--) if (V[i] !== rightV) { to = i + 1; break; }
  if (from < 0 || to < 0) return null;
  if (to < from) to = from;
  return { from, to };
}

export function splitProbability(grid, psi, zone, absorbed) {
  let before = 0;
  let inside = 0;
  let after = 0;
  for (let i = 0; i < grid.n; i++) {
    const p = (psi.re[i] ** 2 + psi.im[i] ** 2) * grid.dx;
    if (i < zone.from) before += p;
    else if (i < zone.to) inside += p;
    else after += p;
  }
  return {
    reflected: before + absorbed.left,
    inside,
    transmitted: after + absorbed.right,
  };
}
