export const EPS = 1e-9;
const FEAS_TOL = 1e-9;
const PRUNE_TOL = 1e-4;
const MIN_WIDTH = 1e-4;

export interface Stats {
  status: 'running' | 'done' | 'timeout';
  n: number;
  best: number;
  positions: Float64Array; // x0,y0,x1,y1,...
  globalUpper: number;
  gap: number;
  nodes: number;
  elapsedMs: number;
  exploredFraction: number;
  prunedObjective: number; // volume fractions
  prunedFeasibility: number;
  converged: number;
  prunedObjectiveCount: number;
  prunedFeasibilityCount: number;
  convergedCount: number;
  improvements: number;
  betterLikelihood: number;
  stackSize: number;
}

interface Node {
  lo: Float64Array;
  hi: Float64Array;
  vol: number;
  ub: number;
  depth: number;
}

function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * Branch and bound for N unit-radius particles maximising the area of the convex hull of their centres
 * subject to: for every sampled direction, adjacent projected centres are at most 2 apart.
 * Symmetry breaking: p0 = (0,0), p1 = (x,0) with x>0, p2 has y>=0.
 * Variables: x1, then (x_i, y_i) for i>=2.
 */
export class Solver {
  readonly n: number;
  private readonly dims: number;
  private readonly dirs: Float64Array; // cos, sin pairs
  private readonly levels: number; // depth at which all directions are in use
  private readonly cx: Float64Array;
  private readonly cy: Float64Array;
  private readonly order: Int32Array;
  private readonly hullIdx: Int32Array;
  private hullCount = 0;
  private readonly stack: Node[] = [];
  private readonly xlo: Float64Array;
  private readonly xhi: Float64Array;
  private readonly ylo: Float64Array;
  private readonly yhi: Float64Array;
  private readonly idx: number[];
  private readonly ilo: Float64Array;
  private readonly ihi: Float64Array;
  private best = -Infinity;
  private bestPos: Float64Array;
  private nodes = 0;
  private start = 0;
  private pObj = 0;
  private pFeas = 0;
  private pConv = 0;
  private cObj = 0;
  private cFeas = 0;
  private cConv = 0;
  private improvements = 0;
  private current: Node | null = null;

  constructor(n: number, resolutionDeg: number) {
    this.n = n;
    this.dims = n >= 2 ? 2 * n - 3 : 0;
    const count = Math.max(1, Math.ceil(180 / resolutionDeg - 1e-9));
    this.dirs = new Float64Array(2 * count);
    for (let k = 0; k < count; k++) {
      const phi = (k * resolutionDeg * Math.PI) / 180;
      this.dirs[2 * k] = Math.cos(phi);
      this.dirs[2 * k + 1] = Math.sin(phi);
    }
    this.levels = Math.max(0, Math.ceil(Math.log2(count) - 1e-9));
    this.xlo = new Float64Array(n);
    this.xhi = new Float64Array(n);
    this.ylo = new Float64Array(n);
    this.yhi = new Float64Array(n);
    this.idx = Array.from({ length: n }, (_, i) => i);
    this.ilo = new Float64Array(n);
    this.ihi = new Float64Array(n);
    this.bestPos = new Float64Array(2 * n);
    this.cx = new Float64Array(4 * n);
    this.cy = new Float64Array(4 * n);
    this.order = new Int32Array(4 * n);
    this.hullIdx = new Int32Array(8 * n + 2);

    if (n >= 2) {
      const r = 2 * (n - 1);
      const lo = new Float64Array(this.dims);
      const hi = new Float64Array(this.dims);
      lo[0] = 0;
      hi[0] = r;
      for (let i = 2; i < n; i++) {
        lo[1 + 2 * (i - 2)] = -r;
        hi[1 + 2 * (i - 2)] = r;
        lo[2 + 2 * (i - 2)] = i === 2 ? 0 : -r;
        hi[2 + 2 * (i - 2)] = r;
      }
      this.stack.push({ lo, hi, vol: 1, ub: Infinity, depth: 0 });
      // Incumbent: particles on a line with spacing 2 is always feasible (hull area 0).
      const line = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) line[2 * i] = 2 * i;
      this.best = this.pointObjective(line);
      this.bestPos = line;
      this.seed(2000);
    } else {
      this.best = 0;
    }
  }

  private unpackBox(lo: Float64Array, hi: Float64Array) {
    const { xlo, xhi, ylo, yhi, n } = this;
    xlo[0] = xhi[0] = ylo[0] = yhi[0] = 0;
    xlo[1] = lo[0];
    xhi[1] = hi[0];
    ylo[1] = yhi[1] = 0;
    for (let i = 2; i < n; i++) {
      const k = 1 + 2 * (i - 2);
      xlo[i] = lo[k];
      xhi[i] = hi[k];
      ylo[i] = lo[k + 1];
      yhi[i] = hi[k + 1];
    }
  }

  /**
   * Area of the convex hull of m points (px, py); fills hullOwner with the point indices on the hull.
   * Monotone chain; px/py are read through `order`, which is sorted in place.
   */
  private hullArea(px: Float64Array, py: Float64Array, m: number): number {
    const order = this.order;
    const h = this.hullIdx;
    const o = order.subarray(0, m);
    for (let k = 0; k < m; k++) o[k] = k;
    o.sort((a, b) => px[a] - px[b] || py[a] - py[b]);
    const cross = (a: number, b: number, c: number) =>
      (px[b] - px[a]) * (py[c] - py[a]) - (py[b] - py[a]) * (px[c] - px[a]);
    let k = 0;
    for (let t = 0; t < m; t++) {
      while (k >= 2 && cross(h[k - 2], h[k - 1], o[t]) <= 0) k--;
      h[k++] = o[t];
    }
    for (let t = m - 2, lower = k + 1; t >= 0; t--) {
      while (k >= lower && cross(h[k - 2], h[k - 1], o[t]) <= 0) k--;
      h[k++] = o[t];
    }
    this.hullCount = Math.max(0, k - 1);
    let area = 0;
    for (let t = 0; t < this.hullCount; t++) {
      const a = h[t];
      const b = h[(t + 1) % this.hullCount];
      area += px[a] * py[b] - px[b] * py[a];
    }
    return Math.abs(area) / 2;
  }

  private pointObjective(pos: Float64Array): number {
    const n = this.n;
    const px = this.cx;
    const py = this.cy;
    for (let i = 0; i < n; i++) {
      px[i] = pos[2 * i];
      py[i] = pos[2 * i + 1];
    }
    return this.hullArea(px, py, n);
  }

  /** Upper bound of the hull area: hull of all box corners (needs unpackBox). Records the hull's boxes. */
  private upperBound(): number {
    const { xlo, xhi, ylo, yhi, n, cx, cy } = this;
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 4; c++) {
        cx[4 * i + c] = c & 1 ? xhi[i] : xlo[i];
        cy[4 * i + c] = c & 2 ? yhi[i] : ylo[i];
      }
    return this.hullArea(cx, cy, 4 * n);
  }

  /** False if the boxes (needs unpackBox) provably contain no feasible configuration. */
  private mayBeFeasible(depth = Infinity): boolean {
    const { xlo, xhi, ylo, yhi, n, idx, ilo, ihi, dirs } = this;
    // Coarse direction subsets (stride 2^k) high in the tree; all directions from depth `levels` on.
    const stride = 1 << Math.max(0, this.levels - depth);
    for (let d = 0; d < dirs.length; d += 2 * stride) {
      const c = dirs[d];
      const s = dirs[d + 1];
      const ac = Math.abs(c);
      const as = Math.abs(s);
      for (let i = 0; i < n; i++) {
        const mid = c * (xlo[i] + xhi[i]) * 0.5 + s * (ylo[i] + yhi[i]) * 0.5;
        const rad = ac * (xhi[i] - xlo[i]) * 0.5 + as * (yhi[i] - ylo[i]) * 0.5;
        ilo[i] = mid - rad;
        ihi[i] = mid + rad;
      }
      idx.sort((a, b) => ilo[a] - ilo[b]);
      let reach = ihi[idx[0]];
      for (let k = 1; k < n; k++) {
        const i = idx[k];
        if (ilo[i] - reach > 2 + FEAS_TOL) return false;
        if (ihi[i] > reach) reach = ihi[i];
      }
    }
    return true;
  }

  /** Random multi-start incumbents, rescaled onto the feasibility boundary. */
  private seed(samples: number) {
    const n = this.n;
    const r = 2 * (n - 1);
    const initialBest = this.best;
    const pos = new Float64Array(2 * n);
    for (let k = 0; k < samples; k++) {
      const span = Math.random() * r;
      for (let i = 1; i < n; i++) {
        pos[2 * i] = (Math.random() * 2 - 1) * span;
        pos[2 * i + 1] = (Math.random() * 2 - 1) * span;
      }
      pos[3] = 0;
      pos[2] = Math.abs(pos[2]);
      pos[5] = Math.abs(pos[5]);
      const g = this.maxGap(pos);
      if (!(g > 0)) continue;
      const cand = pos.map((v) => (v * 2) / g);
      const obj = this.pointObjective(cand);
      if (obj > this.best && this.maxGap(cand) <= 2 + FEAS_TOL) {
        this.best = obj;
        this.bestPos = cand;
      }
    }
    if (this.best > initialBest) this.localSearch();
  }

  /** Largest gap between adjacent projections over all sampled directions. */
  private maxGap(pos: Float64Array): number {
    const { n, dirs, ilo } = this;
    let g = 0;
    for (let d = 0; d < dirs.length; d += 2) {
      for (let i = 0; i < n; i++) ilo[i] = dirs[d] * pos[2 * i] + dirs[d + 1] * pos[2 * i + 1];
      const sorted = Array.from(ilo).sort((a, b) => a - b);
      for (let i = 1; i < n; i++) g = Math.max(g, sorted[i] - sorted[i - 1]);
    }
    return g;
  }

  /** Evaluate the box midpoint as a candidate solution. */
  private tryMidpoint(lo: Float64Array, hi: Float64Array) {
    const n = this.n;
    const pos = new Float64Array(2 * n);
    pos[2] = (lo[0] + hi[0]) / 2;
    for (let i = 2; i < n; i++) {
      const k = 1 + 2 * (i - 2);
      pos[2 * i] = (lo[k] + hi[k]) / 2;
      pos[2 * i + 1] = (lo[k + 1] + hi[k + 1]) / 2;
    }
    // Projected gaps scale linearly, so rescale the point to the feasibility boundary.
    const g = this.maxGap(pos);
    if (!(g > 0)) return;
    const t = 2 / g;
    for (let k = 0; k < pos.length; k++) pos[k] *= t;
    const obj = this.pointObjective(pos);
    if (obj <= this.best + 1e-12) return;
    for (let i = 0; i < n; i++) {
      this.xlo[i] = this.xhi[i] = pos[2 * i];
      this.ylo[i] = this.yhi[i] = pos[2 * i + 1];
    }
    if (!this.mayBeFeasible()) return;
    this.best = obj;
    this.bestPos = pos;
    this.improvements++;
    this.localSearch();
  }

  /**
   * Simulated annealing with a soft feasibility push. Early on, moves are large and only partially rescaled
   * towards the feasibility boundary (exponent w < 1) and violations are barely penalised; w and the penalty
   * grow during the cycle and the last STRICT fraction is fully rescaled, so the walker settles on a valid cloud.
   */
  private localSearch(iters = 50) {
    const n = this.n;
    if (n < 3) return;
    const CYCLE = iters;
    const STRICT = 0.9;
    let saPos = this.bestPos.slice();
    let saObj = this.best;
    for (let it = 0; it < iters; it++) {
      const frac = it / CYCLE;
      const temp = 0.02 * Math.pow(1e-3, frac) * Math.max(this.best, 1e-3);
      const step = 0.3 * Math.pow(0.03, frac);
      const strictness = Math.min(1, frac / STRICT);
      const w = strictness * strictness;
      const mu = 5 * w;
      const cand = saPos.slice();
      const moves = 1 + Math.floor(Math.random() * 2);
      for (let m = 0; m < moves; m++) {
        const i = 1 + Math.floor(Math.random() * (n - 1));
        cand[2 * i] += gauss() * step;
        if (i > 1) cand[2 * i + 1] += gauss() * step;
      }
      cand[3] = 0;
      cand[2] = Math.abs(cand[2]);
      cand[5] = Math.abs(cand[5]);
      let g = this.maxGap(cand);
      if (!(g > 0)) continue;
      const t = Math.pow(2 / g, w);
      for (let k = 0; k < cand.length; k++) cand[k] *= t;
      g *= t;
      const obj = this.pointObjective(cand);
      const score = obj - mu * (this.best + 1) * Math.max(0, g - 2);
      if (score >= saObj || Math.random() < Math.exp((score - saObj) / temp)) {
        saPos = cand;
        saObj = score;
        if (obj > this.best + 1e-12 && g <= 2 + FEAS_TOL) {
          this.best = obj;
          this.bestPos = cand;
          this.improvements++;
        }
      }
    }
  }

  /**
   * Branching variable: the widest coordinate among the boxes that contribute corners to the bound hull
   * (needs unpackBox and upperBound); only these boxes can change the bound.
   */
  private branchDim(node: Node, fallback: number): number {
    const dimOf = (p: number, axis: number) => (p === 0 || (p === 1 && axis === 1) ? -1 : p === 1 ? 0 : 1 + 2 * (p - 2) + axis);
    let bestD = -1;
    let bestW = MIN_WIDTH;
    for (let t = 0; t < this.hullCount; t++) {
      const p = this.hullIdx[t] >> 2;
      for (let axis = 0; axis < 2; axis++) {
        const d = dimOf(p, axis);
        if (d < 0) continue;
        const dw = node.hi[d] - node.lo[d];
        if (dw > bestW) {
          bestW = dw;
          bestD = d;
        }
      }
    }
    return bestD >= 0 ? bestD : fallback;
  }

  get finished(): boolean {
    return this.stack.length === 0 && this.current === null;
  }

  /** Process up to maxNodes nodes. */
  step(maxNodes: number): void {
    if (this.start === 0) this.start = performance.now();
    for (let it = 0; it < maxNodes && this.stack.length > 0; it++) {
      const node = this.stack.pop()!;
      this.nodes++;
      this.unpackBox(node.lo, node.hi);
      const ub = this.upperBound();
      if (ub <= this.best + PRUNE_TOL) {
        this.pObj += node.vol;
        this.cObj++;
        continue;
      }
      if (!this.mayBeFeasible(node.depth)) {
        this.pFeas += node.vol;
        this.cFeas++;
        continue;
      }
      this.tryMidpoint(node.lo, node.hi);
      let widest = 0;
      let w = -1;
      for (let d = 0; d < this.dims; d++) {
        const dw = node.hi[d] - node.lo[d];
        if (dw > w) {
          w = dw;
          widest = d;
        }
      }
      if (w < MIN_WIDTH) {
        this.pConv += node.vol;
        this.cConv++;
        continue;
      }
      this.unpackBox(node.lo, node.hi);
      this.upperBound();
      widest = this.branchDim(node, widest);
      const mid = (node.lo[widest] + node.hi[widest]) / 2;
      const a: Node = { lo: node.lo, hi: node.hi.slice(), vol: node.vol / 2, ub, depth: node.depth + 1 };
      a.hi[widest] = mid;
      const b: Node = { lo: node.lo.slice(), hi: node.hi, vol: node.vol / 2, ub, depth: node.depth + 1 };
      b.lo[widest] = mid;
      // Explore the half containing the better midpoint-ish region first: use ub of each half.
      this.unpackBox(a.lo, a.hi);
      a.ub = this.upperBound();
      this.unpackBox(b.lo, b.hi);
      b.ub = this.upperBound();
      if (a.ub >= b.ub) this.stack.push(b, a);
      else this.stack.push(a, b);
    }
  }

  stats(status: Stats['status'] = 'running'): Stats {
    const explored = Math.min(1, this.pObj + this.pFeas + this.pConv);
    let globalUpper = this.best;
    let likelihood = 0;
    const scale = Math.abs(this.best) * 0.05 + 1e-6;
    for (const nd of this.stack) {
      if (nd.ub > globalUpper) globalUpper = nd.ub;
      likelihood += nd.vol * Math.min(1, Math.max(0, nd.ub - this.best) / scale);
    }
    const done = this.stack.length === 0;
    return {
      status: done ? 'done' : status,
      n: this.n,
      best: this.best,
      positions: this.bestPos,
      globalUpper,
      gap: globalUpper - this.best,
      nodes: this.nodes,
      elapsedMs: this.start ? performance.now() - this.start : 0,
      exploredFraction: done ? 1 : explored,
      prunedObjective: this.pObj,
      prunedFeasibility: this.pFeas,
      converged: this.pConv,
      prunedObjectiveCount: this.cObj,
      prunedFeasibilityCount: this.cFeas,
      convergedCount: this.cConv,
      improvements: this.improvements,
      betterLikelihood: done ? 0 : Math.min(1, likelihood),
      stackSize: this.stack.length,
    };
  }
}

/** Check feasibility of explicit centres (x0,y0,x1,y1,...) for a direction resolution. */
export function isFeasible(pos: ArrayLike<number>, resolutionDeg: number): boolean {
  const n = pos.length / 2;
  const count = Math.max(1, Math.ceil(180 / resolutionDeg - 1e-9));
  for (let k = 0; k < count; k++) {
    const phi = (k * resolutionDeg * Math.PI) / 180;
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push(Math.cos(phi) * pos[2 * i] + Math.sin(phi) * pos[2 * i + 1]);
    p.sort((a, b) => a - b);
    for (let i = 1; i < n; i++) if (p[i] - p[i - 1] > 2 + FEAS_TOL) return false;
  }
  return true;
}
