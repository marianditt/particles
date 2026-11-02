export const EPS = 1e-9;
const FEAS_TOL = 1e-9;
const PRUNE_TOL = 1e-7;
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
}

/**
 * Branch and bound for N unit-radius particles maximising sum_{i<j} ln(EPS + d_ij)
 * subject to: for every sampled direction, adjacent projected centres are at most 2 apart.
 * Symmetry breaking: p0 = (0,0), p1 = (x,0) with x>0, p2 has y>=0.
 * Variables: x1, then (x_i, y_i) for i>=2.
 */
export class Solver {
  readonly n: number;
  private readonly dims: number;
  private readonly dirs: Float64Array; // cos, sin pairs
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
    this.xlo = new Float64Array(n);
    this.xhi = new Float64Array(n);
    this.ylo = new Float64Array(n);
    this.yhi = new Float64Array(n);
    this.idx = Array.from({ length: n }, (_, i) => i);
    this.ilo = new Float64Array(n);
    this.ihi = new Float64Array(n);
    this.bestPos = new Float64Array(2 * n);

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
      this.stack.push({ lo, hi, vol: 1, ub: Infinity });
      // Incumbent: particles on a line with spacing 2 is always feasible.
      const line = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) line[2 * i] = 2 * i;
      this.best = this.pointObjective(line);
      this.bestPos = line;
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

  private pointObjective(pos: Float64Array): number {
    let s = 0;
    for (let i = 0; i < this.n; i++)
      for (let j = i + 1; j < this.n; j++)
        s += Math.log(EPS + Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]));
    return s;
  }

  /** Upper bound of the objective using max distances between boxes (needs unpackBox). */
  private upperBound(): number {
    const { xlo, xhi, ylo, yhi, n } = this;
    let s = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = Math.max(Math.abs(xhi[i] - xlo[j]), Math.abs(xhi[j] - xlo[i]));
        const dy = Math.max(Math.abs(yhi[i] - ylo[j]), Math.abs(yhi[j] - ylo[i]));
        s += Math.log(EPS + Math.hypot(dx, dy));
      }
    return s;
  }

  /** Lower bound of the objective (minimum distances; 0 if boxes overlap). */
  lowerBound(): number {
    const { xlo, xhi, ylo, yhi, n } = this;
    let s = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = Math.max(0, xlo[i] - xhi[j], xlo[j] - xhi[i]);
        const dy = Math.max(0, ylo[i] - yhi[j], ylo[j] - yhi[i]);
        s += Math.log(EPS + Math.hypot(dx, dy));
      }
    return s;
  }

  /** False if the boxes (needs unpackBox) provably contain no feasible configuration. */
  private mayBeFeasible(): boolean {
    const { xlo, xhi, ylo, yhi, n, idx, ilo, ihi, dirs } = this;
    for (let d = 0; d < dirs.length; d += 2) {
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
    const obj = this.pointObjective(pos);
    if (obj <= this.best) return;
    for (let i = 0; i < n; i++) {
      this.xlo[i] = this.xhi[i] = pos[2 * i];
      this.ylo[i] = this.yhi[i] = pos[2 * i + 1];
    }
    if (!this.mayBeFeasible()) return;
    this.best = obj;
    this.bestPos = pos;
    this.improvements++;
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
      if (!this.mayBeFeasible()) {
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
      const mid = (node.lo[widest] + node.hi[widest]) / 2;
      const a: Node = { lo: node.lo, hi: node.hi.slice(), vol: node.vol / 2, ub };
      a.hi[widest] = mid;
      const b: Node = { lo: node.lo.slice(), hi: node.hi, vol: node.vol / 2, ub };
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
