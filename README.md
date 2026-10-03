# tunnelwell

A quantum wave packet in the browser. Fire a particle at a barrier and
watch its wave split: part of it bounces back, part of it leaks through a
wall it does not have the energy to climb. A table beside the plot puts
the simulated split next to the exact answer.

**Live demo:** https://fushanbobfan.github.io/tunnelwell/

No build step and no dependencies. The FFT, the solver, the exact
transmission, the landscapes, the settings and the drawing helpers are
plain ES modules covered by a Node test suite; only `src/main.js` touches
the DOM.

## Quick start

Open `index.html` through any static server, or run:

```bash
npm run serve
# then visit http://localhost:8080
```

Run the tests with `npm test` (Node 20 or newer).

## Things to try

**Tunnel.** The page opens on a barrier of height 2 and a packet with
energy 1.5. Classically it would always bounce; about a third of the wave
gets through. Drag *Width* from 1 to 2 and the transmitted share drops to
about 7 %: tunnelling falls off exponentially with thickness.

**Find a resonance.** *Double barrier* is tuned so the packet's energy
matches a quasi-bound state of the cavity between the walls. Probability
piles up inside, rings, and leaks out both ways; about 40 % gets through
two walls that each stop most of it alone. Set the energy to 0.6 and
almost nothing does.

**Reflect without a wall.** *Potential step* and *Square well* reflect a
packet that has more than enough energy to pass. In the well, transmission
climbs back to 100 % whenever a whole number of half wavelengths fits
across it.

**See band gaps.** *Six-barrier lattice* is a short crystal. With energy
1.7 the packet sits in a band and mostly passes; at 1.0 it sits in a gap
and is turned back.

**Watch it swing.** *Harmonic well* releases a packet from rest. With the
default width (the coherent-state width) it swings without changing shape;
any other width makes it breathe. *Double well* shows a packet tunnelling
from one well to the other through a hump it cannot climb. For both, a
*Bound states* panel replaces the spectrum: the well's stationary states
are drawn as thin lines on the plot, and bars show how much of the packet
sits in each. The harmonic packet is a Poisson mix centred near state 30;
the double-well packet is almost entirely the lowest pair, whose small
energy splitting ΔE sets the crossing time π/ΔE (about 263 time units),
which you can watch the simulation reproduce.

**Read the spectrum.** Under the table, the transmission spectrum plots
the exact plane-wave T against kinetic energy, shades how the packet's
probability is spread over those energies, and lists the energies where
transmission peaks. Click anywhere on it to fire a packet at that energy.
Every finished run adds a dot for the measured share inside a ring for
the exact one, so a few clicks on *Double barrier* trace its resonances
by experiment. The dots are cleared when the landscape or σ changes.

**Paint a landscape.** Press *Paint landscape* (or <kbd>P</kbd>) and drag
across the plot. The scene switches to *Painted*, starting from whatever
landscape was showing, and the exact columns follow what you draw. Copy
the link to share it.

**Narrow versus wide packets.** A narrow packet holds a wide spread of
energies, so the exact answer for it is an average of the plane-wave
answer over that spread. Widen σ and the two exact rows converge.

Keys: <kbd>Space</kbd> plays and pauses, <kbd>R</kbd> resets,
<kbd>[</kbd> and <kbd>]</kbd> lower and raise the energy, <kbd>P</kbd>
toggles painting. Keys are ignored while a control has focus, so sliders
keep their own arrow keys.

## What is on the plot

The grey shape is the potential V(x). The coloured fill is |ψ|², drawn
upward from the packet's mean energy ⟨E⟩ (the dashed line), as in a
textbook figure. Its colour is the phase of ψ, so a moving packet shows
stripes that march at its wavenumber; a packet at rest is a single colour.
*Show the real part of ψ* overlays Re ψ.

## How it works

Units are ħ = m = 1, so a plane wave e^{ikx} has energy k²/2 and moves at
speed k.

- **Solver.** `src/wave.js` advances ψ on 2048 points over 160 units with
  the split-step Fourier method: half a potential kick, an exact kinetic
  step in momentum space, another half kick. Each step is unitary, so
  probability is conserved to rounding.
- **Absorbing edges.** The outer 20 units on each side are off screen and
  damp ψ smoothly. What they remove is booked to the side it left from, so
  the reflected and transmitted shares stay exact after the packet has
  gone.
- **Exact answer.** `src/theory.js` carries ψ and ψ′ through the same grid
  cells the solver sees with real 2×2 transfer matrices, giving T(E) for
  any piecewise-constant landscape, painted ones included. The packet row
  averages T over the packet's Gaussian momentum distribution, which has
  standard deviation 1/(2σ).
- **Spectrum.** `src/spectrum.js` samples T over the kinetic-energy axis,
  refines each peak by ternary search so narrow resonances are drawn to
  full height, and bins the packet's energy distribution from the normal
  CDF of its momentum.
- **Bound states.** `src/eigen.js` builds the finite-difference
  Hamiltonian on the visible window, finds its lowest eigenvalues by
  Sturm-sequence bisection and the eigenvectors by inverse iteration, and
  projects the packet onto them.
- **Measurement.** The landscape's interaction zone is where V differs
  from its two flat ends. Probability left of it plus the left absorber is
  reflected, right of it plus the right absorber is transmitted, and the
  rest is inside. A run stops on its own when less than 0.5 % of the wave
  remains on the grid.

The test suite checks the FFT against a direct DFT, free spreading and
the harmonic period against closed forms, the transfer matrices against
the textbook barrier, step and well formulas, the harmonic levels and
coherent-state Poisson weights against theory, the double-well crossing
time against the simulation, and the simulated split
against the exact answer on the barrier, step, well, double barrier and
lattice.

## Accessibility

Every control is a native input with a label, and the measurement table
is a real table. The status line announces playing, pausing and the final
result politely. Height carries the probability, so the phase colours are
an extra rather than the only channel. With reduced motion requested, the
page waits for *Play* instead of starting on its own.

## License

MIT
