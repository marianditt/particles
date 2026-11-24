# Particle Blocking Optimizer

A client-side TypeScript SPA for minimizing the common radius of identical disks whose centers lie inside a rectangle, such that every line intersecting the rectangle also intersects at least one disk. Both solver strategies address this same problem. Optimization runs locally in a Web Worker; HiGHS runs locally as WebAssembly.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

The static production site is written to `dist/` and can be served from a subpath, including GitHub Pages. The HiGHS WebAssembly file is bundled into `dist/assets/solver-assets/`, so the app does not require network access after it has loaded.

## Solver design

- `src/geometry.ts` defines the convex-container interface and the rectangle implementation.
- `src/evaluator.ts` partitions `[0, π]` at projection-order changes and rectangle support-function breakpoints, then checks interval endpoints and stationary points of each active sinusoidal term. It does not use angular sampling.
- The **Global solver** (`src/solver.ts`) uses seeded Differential Evolution for feasible upper bounds, then optionally uses branch-and-bound to seek a global certificate. Its direction-wise HiGHS LP uses a fractional assignment relaxation: assignment weights sum to one per particle and rank, and projection contributions are bounded by each particle's coordinate-box projection interval. Fractional assignments enlarge the feasible set, so the LP optimum is a valid lower bound.
- **Simulated annealing** (`src/annealing.ts`) is an alternative seeded heuristic for the same problem. It minimizes the worst boundary or adjacent-gap constraint over evenly sampled directions in `[0, π)`, accepting uphill moves with a decreasing temperature. Sampled checks can miss violations, so promising arrangements are evaluated continuously before a radius is reported. This strategy does not certify global optimality.
- The branch-and-bound search uses axis-aligned coordinate boxes, the rectangle diagonal bound, projection-bound propagation, and the LP relaxation. It is best-first and stops at the requested gap or a configured resource limit.
- `src/worker.ts` runs the search off the UI thread and handles cancellation while preserving the latest result.

The result is explicitly labeled as certified, best-known, resource-limited, cancelled, or a numerical failure. Certification uses outward safety margins for the floating-point calculations and the HiGHS solve; it is a numerical certificate, not an exact-arithmetic proof. Results that do not reach the requested bound gap are never labeled globally certified.

## Inputs and defaults

Width and height are required. The initial controls use seed `1`, absolute gap `1e-3`, 60 seconds, DE population 60, 1,000 generations per restart, 3 restarts, 8 initial LP directions, 20,000 explored nodes, and 10,000 open nodes. Direction sampling grows adaptively during deeper searches.

The simulated annealing tab shares the rectangle, particle count, seed, and runtime controls. Its defaults are 64 sampled directions, 10,000 iterations per restart, and 3 restarts. More directions reduce sampling error at additional computational cost, but do not make the search a global proof.

The radius shown is computed from the exact continuous-angle objective for the reported arrangement. JSON exports include the solver configuration and certification metadata; CSV exports contain particle coordinates and radius.
