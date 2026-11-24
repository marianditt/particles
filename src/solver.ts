import loadHighs from 'highs';
import { evaluateArrangement, type Evaluation } from './evaluator';
import { Rectangle, type Point } from './geometry';

export interface SolverConfig {
  width: number;
  height: number;
  particleCount: number;
  seed: number;
  tolerance: number;
  maxRuntimeMs: number;
  populationSize: number;
  generations: number;
  restarts: number;
  lpDirectionCount: number;
  globalOptimization: boolean;
  maxNodes: number;
  maxOpenNodes: number;
}

export type SolverStatus =
  | 'running'
  | 'certified'
  | 'best-known'
  | 'resource-limit'
  | 'cancelled'
  | 'numerical-failure';

export interface SolverProgress {
  status: SolverStatus;
  phase: string;
  certification: string;
  bestRadius: number;
  upperBound: number;
  lowerBound: number;
  absoluteGap: number;
  relativeGap: number;
  centers: Point[];
  evaluation: Evaluation;
  exploredNodes: number;
  prunedNodes: number;
  remainingNodes: number;
  heuristicEvaluations: number;
  elapsedMs: number;
  seed: number;
}

type ProgressCallback = (progress: SolverProgress) => void;
type CancelCheck = () => boolean;

interface SearchNode {
  lo: Float64Array;
  hi: Float64Array;
  lowerBound: number;
  depth: number;
}

interface HighsRunner {
  solve(problem: string, options?: {
    output_flag?: boolean;
    primal_feasibility_tolerance?: number;
    dual_feasibility_tolerance?: number;
  }): {
    Status: string;
    ObjectiveValue: number;
    Rows: { Name: string; Dual: number }[];
    Columns: Record<string, { Dual: number }>;
  };
}

const FLOAT_MARGIN = 1e-9;
const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function canonicalize(individual: Float64Array): Float64Array {
  const centers: Point[] = [];
  for (let i = 0; i < individual.length; i += 2) {
    centers.push({ x: individual[i], y: individual[i + 1] });
  }
  centers.sort((a, b) => a.x - b.x || a.y - b.y);
  return Float64Array.from(centers.flatMap((point) => [point.x, point.y]));
}

function asPoints(individual: ArrayLike<number>): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < individual.length; i += 2) {
    points.push({ x: individual[i], y: individual[i + 1] });
  }
  return points;
}

function objective(width: number, height: number, position: ArrayLike<number>): Evaluation {
  return evaluateArrangement(width, height, asPoints(position));
}

function numericSlack(value: number): number {
  return FLOAT_MARGIN * Math.max(1, Math.abs(value));
}

export function makeDirections(count: number): number[] {
  const directions = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  for (let denominator = Math.max(1, count - directions.length); directions.length < count; denominator++) {
    for (let i = 0; i < denominator && directions.length < count; i++) {
      const theta = ((i + 0.5) * Math.PI) / denominator;
      if (!directions.some((angle) => Math.abs(angle - theta) <= 16 * Number.EPSILON)) {
        directions.push(theta);
      }
    }
  }
  return directions.sort((a, b) => a - b);
}

function variableName(prefix: string, particle: number, rank: number): string {
  return `${prefix}_${particle}_${rank}`;
}

interface LinearRow {
  name: string;
  coefficients: Array<[number, string]>;
  lower: number;
  upper: number;
}

interface LinearVariable {
  name: string;
  lower: number;
  upper: number;
  cost: number;
}

function lpExpression(terms: Array<[number, string]>): string {
  return terms
    .map(([coefficient, variable], index) => {
      const sign = coefficient < 0 ? '-' : '+';
      const abs = Math.abs(coefficient);
      const magnitude = abs === 1 ? '' : `${abs} `;
      return `${index === 0 ? (coefficient < 0 ? '-' : '') : ` ${sign} `}${magnitude}${variable}`;
    })
    .join('');
}

function directionRelaxation(
  highs: HighsRunner,
  direction: number,
  support: number,
  intervals: readonly (readonly [number, number])[],
): number {
  const n = intervals.length;
  const rows: LinearRow[] = [];
  const variables: LinearVariable[] = [{ name: 'radius', lower: 0, upper: Infinity, cost: 1 }];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      variables.push({ name: variableName('a', i, k), lower: 0, upper: 1, cost: 0 });
      const [lower, upper] = intervals[i];
      variables.push({
        name: variableName('v', i, k),
        lower: Math.min(0, lower),
        upper: Math.max(0, upper),
        cost: 0,
      });
    }
  }
  const addRow = (
    name: string,
    coefficients: Array<[number, string]>,
    lower: number,
    upper: number,
  ) => rows.push({ name, coefficients, lower, upper });
  for (let i = 0; i < n; i++) {
    addRow(
      `assign_${i}`,
      Array.from({ length: n }, (_, k) => [1, variableName('a', i, k)]),
      1,
      1,
    );
  }
  for (let k = 0; k < n; k++) {
    addRow(
      `rank_${k}`,
      Array.from({ length: n }, (_, i) => [1, variableName('a', i, k)]),
      1,
      1,
    );
  }
  for (let i = 0; i < n; i++) {
    const [lower, upper] = intervals[i];
    for (let k = 0; k < n; k++) {
      const assignment = variableName('a', i, k);
      const projection = variableName('v', i, k);
      addRow(`proj_lo_${i}_${k}`, [[-lower, assignment], [1, projection]], 0, Infinity);
      addRow(`proj_hi_${i}_${k}`, [[1, projection], [-upper, assignment]], -Infinity, 0);
    }
  }
  addRow(
    'left',
    [
      ...Array.from({ length: n }, (_, i) => [1, variableName('v', i, 0)] as [number, string]),
      [-1, 'radius'],
    ],
    -Infinity,
    -support,
  );
  addRow(
    'right',
    [
      ...Array.from({ length: n }, (_, i) => [1, variableName('v', i, n - 1)] as [number, string]),
      [1, 'radius'],
    ],
    support,
    Infinity,
  );
  for (let k = 0; k + 1 < n; k++) {
    addRow(
      `gap_${k}`,
      [
        ...Array.from({ length: n }, (_, i) => [1, variableName('v', i, k + 1)] as [number, string]),
        ...Array.from({ length: n }, (_, i) => [-1, variableName('v', i, k)] as [number, string]),
        [-2, 'radius'],
      ],
      -Infinity,
      0,
    );
  }
  const constraints = rows.map((row) => {
    const expression = lpExpression(row.coefficients);
    if (row.lower === row.upper) return ` ${row.name}: ${expression} = ${row.lower}`;
    if (!Number.isFinite(row.lower)) return ` ${row.name}: ${expression} <= ${row.upper}`;
    if (!Number.isFinite(row.upper)) return ` ${row.name}: ${expression} >= ${row.lower}`;
    return ` ${row.name}: ${row.lower} <= ${expression} <= ${row.upper}`;
  });
  const bounds = variables.map((variable) => {
    if (Number.isFinite(variable.lower) && Number.isFinite(variable.upper)) {
      return ` ${variable.lower} <= ${variable.name} <= ${variable.upper}`;
    }
    if (Number.isFinite(variable.lower)) return ` ${variable.name} >= ${variable.lower}`;
    if (Number.isFinite(variable.upper)) return ` ${variable.name} <= ${variable.upper}`;
    return ` ${variable.name} free`;
  });
  const lp = [
    'Minimize',
    ' obj: radius',
    'Subject To',
    ...constraints,
    'Bounds',
    ...bounds,
    'End',
  ].join('\n');
  const result = highs.solve(lp, {
    output_flag: false,
    primal_feasibility_tolerance: 1e-9,
    dual_feasibility_tolerance: 1e-9,
  });
  if (result.Status !== 'Optimal' || !Number.isFinite(result.ObjectiveValue)) {
    throw new Error(`HiGHS failed for direction ${direction}: ${result.Status}`);
  }
  const rowDuals = new Map(result.Rows.map((row) => [row.Name, row.Dual]));
  let dualObjective = 0;
  let errorScale = 1;
  for (const row of rows) {
    const dual = rowDuals.get(row.name);
    if (dual === undefined || !Number.isFinite(dual)) return 0;
    const bound = dual >= 0 ? row.lower : row.upper;
    if (!Number.isFinite(bound)) return 0;
    const contribution = dual * bound;
    dualObjective += contribution;
    errorScale += Math.abs(contribution);
  }
  for (const variable of variables) {
    let dualActivity = 0;
    for (const row of rows) {
      const dual = rowDuals.get(row.name)!;
      const coefficient = row.coefficients.find(([, name]) => name === variable.name)?.[0] ?? 0;
      const term = dual * coefficient;
      dualActivity += term;
      errorScale += Math.abs(term);
    }
    const reducedCost = variable.cost - dualActivity;
    errorScale += Math.abs(variable.cost);
    if (!Number.isFinite(reducedCost)) return 0;
    const bound = reducedCost >= 0 ? variable.lower : variable.upper;
    if (!Number.isFinite(bound)) return 0;
    const contribution = reducedCost * bound;
    dualObjective += contribution;
    errorScale += Math.abs(contribution);
  }
  errorScale += Math.abs(dualObjective);
  return Math.max(0, dualObjective - numericSlack(errorScale));
}

function boxProjectionIntervals(
  node: SearchNode,
  count: number,
  theta: number,
): [number, number][] {
  const cosine = Math.cos(theta);
  const sine = Math.sin(theta);
  const intervals: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const x0 = node.lo[2 * i];
    const x1 = node.hi[2 * i];
    const y0 = node.lo[2 * i + 1];
    const y1 = node.hi[2 * i + 1];
    const xMin = cosine >= 0 ? x0 * cosine : x1 * cosine;
    const xMax = cosine >= 0 ? x1 * cosine : x0 * cosine;
    const yMin = sine >= 0 ? y0 * sine : y1 * sine;
    const yMax = sine >= 0 ? y1 * sine : y0 * sine;
    intervals.push([xMin + yMin, xMax + yMax]);
  }
  return intervals;
}

function lowerBoundForNode(
  highs: HighsRunner,
  node: SearchNode,
  config: SolverConfig,
  directionCount: number,
): number {
  const { width, height, particleCount } = config;
  let lower = Math.max(width, height, Math.hypot(width, height)) / (2 * particleCount);
  lower -= numericSlack(lower);
  for (const theta of makeDirections(directionCount)) {
    const rawSupport =
      (width / 2) * Math.abs(Math.cos(theta)) + (height / 2) * Math.abs(Math.sin(theta));
    const support = Math.max(0, rawSupport - numericSlack(rawSupport));
    const intervals = boxProjectionIntervals(node, particleCount, theta).map(([lo, hi]) => {
      const margin = numericSlack(Math.max(Math.abs(lo), Math.abs(hi)));
      return [lo - margin, hi + margin] as [number, number];
    });
    const lowestPossibleProjection = Math.min(...intervals.map(([lo]) => lo));
    const highestPossibleProjection = Math.max(...intervals.map(([, hi]) => hi));
    lower = Math.max(
      lower,
      support + lowestPossibleProjection - numericSlack(support + lowestPossibleProjection),
      support - highestPossibleProjection - numericSlack(support - highestPossibleProjection),
      directionRelaxation(highs, theta, support, intervals),
    );
  }
  return Math.max(0, lower);
}

function pushHeap(heap: SearchNode[], node: SearchNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].lowerBound <= heap[index].lowerBound) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popHeap(heap: SearchNode[]): SearchNode | undefined {
  if (heap.length === 0) return undefined;
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].lowerBound < heap[smallest].lowerBound) smallest = left;
      if (right < heap.length && heap[right].lowerBound < heap[smallest].lowerBound) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return first;
}

function splitDimension(node: SearchNode, width: number, height: number): number {
  let selected = -1;
  let largest = 0;
  for (let i = 0; i < node.lo.length; i++) {
    const scale = i % 2 === 0 ? width : height;
    const score = (node.hi[i] - node.lo[i]) / scale;
    if (score > largest) {
      largest = score;
      selected = i;
    }
  }
  return selected;
}

function makeProgress(
  config: SolverConfig,
  status: SolverStatus,
  phase: string,
  certification: string,
  bestPosition: Float64Array,
  bestEvaluation: Evaluation,
  lowerBound: number,
  counts: { nodes: number; pruned: number; remaining: number; evaluations: number },
  start: number,
): SolverProgress {
  const upperBound = bestEvaluation.radius + numericSlack(bestEvaluation.radius);
  const absoluteGap = Math.max(0, upperBound - lowerBound);
  return {
    status,
    phase,
    certification,
    bestRadius: bestEvaluation.radius,
    upperBound,
    lowerBound,
    absoluteGap,
    relativeGap: absoluteGap / Math.max(upperBound, Number.MIN_VALUE),
    centers: asPoints(bestPosition),
    evaluation: bestEvaluation,
    exploredNodes: counts.nodes,
    prunedNodes: counts.pruned,
    remainingNodes: counts.remaining,
    heuristicEvaluations: counts.evaluations,
    elapsedMs: performance.now() - start,
    seed: config.seed,
  };
}

export async function optimize(
  config: SolverConfig,
  onProgress: ProgressCallback,
  isCancelled: CancelCheck,
): Promise<SolverProgress> {
  const started = performance.now();
  const rng = randomGenerator(config.seed);
  const dimensions = config.particleCount * 2;
  const geometry = new Rectangle(config.width, config.height);
  const low = new Float64Array(dimensions);
  const high = new Float64Array(dimensions);
  for (let i = 0; i < config.particleCount; i++) {
    low[2 * i] = geometry.bounds.minX;
    high[2 * i] = geometry.bounds.maxX;
    low[2 * i + 1] = geometry.bounds.minY;
    high[2 * i + 1] = geometry.bounds.maxY;
  }

  let bestPosition: Float64Array<ArrayBufferLike> = new Float64Array(dimensions);
  let bestEvaluation = objective(config.width, config.height, bestPosition);
  let evaluations = 1;
  let nodes = 0;
  let pruned = 0;
  let remaining = 0;
  const initialLower = Math.max(config.width, config.height, Math.hypot(config.width, config.height)) /
    (2 * config.particleCount);

  onProgress(
    makeProgress(config, 'running', 'Heuristic initialization', 'Not yet certified', bestPosition, bestEvaluation, Math.max(0, initialLower - numericSlack(initialLower)), { nodes, pruned, remaining, evaluations }, started),
  );

  const evaluate = (candidate: Float64Array): Evaluation => {
    evaluations++;
    return objective(config.width, config.height, candidate);
  };
  const populationSize = Math.max(4, config.populationSize);
  const dimensionBounds = (index: number) => [low[index], high[index]] as const;

  for (let restart = 0; restart < config.restarts; restart++) {
    const population: Float64Array[] = [];
    const scores: Evaluation[] = [];
    for (let i = 0; i < populationSize; i++) {
      const candidate = new Float64Array(dimensions);
      if (i !== 0 || restart !== 0) {
        for (let d = 0; d < dimensions; d++) {
          const [min, max] = dimensionBounds(d);
          candidate[d] = min + rng() * (max - min);
        }
      }
      const canonical = canonicalize(candidate);
      const score = evaluate(canonical);
      population.push(canonical);
      scores.push(score);
      if (score.radius < bestEvaluation.radius) {
        bestPosition = canonical;
        bestEvaluation = score;
      }
    }
    onProgress(
      makeProgress(config, 'running', `Differential evolution (${restart + 1}/${config.restarts})`, 'Not yet certified', bestPosition, bestEvaluation, Math.max(0, initialLower - numericSlack(initialLower)), { nodes, pruned, remaining, evaluations }, started),
    );

    for (let generation = 0; generation < config.generations; generation++) {
      if (isCancelled()) {
        return makeProgress(config, 'cancelled', 'Cancelled during heuristic search', 'Best-known solution; no global certificate', bestPosition, bestEvaluation, Math.max(0, initialLower - numericSlack(initialLower)), { nodes, pruned, remaining, evaluations }, started);
      }
      for (let target = 0; target < populationSize; target++) {
        let a = target;
        let b = target;
        let c = target;
        while (a === target) a = Math.floor(rng() * populationSize);
        while (b === target || b === a) b = Math.floor(rng() * populationSize);
        while (c === target || c === a || c === b) c = Math.floor(rng() * populationSize);
        const mutant = new Float64Array(dimensions);
        const forced = Math.floor(rng() * dimensions);
        for (let d = 0; d < dimensions; d++) {
          if (d === forced || rng() < 0.8) {
            const value = population[a][d] + 0.7 * (population[b][d] - population[c][d]);
            mutant[d] = Math.max(low[d], Math.min(high[d], value));
          } else {
            mutant[d] = population[target][d];
          }
        }
        const candidate = canonicalize(mutant);
        const score = evaluate(candidate);
        if (score.radius <= scores[target].radius) {
          population[target] = candidate;
          scores[target] = score;
        }
        if (score.radius < bestEvaluation.radius) {
          bestPosition = candidate;
          bestEvaluation = score;
        }
      }
      if (generation % 10 === 0 || generation + 1 === config.generations) {
        onProgress(
          makeProgress(config, 'running', `Differential evolution (${restart + 1}/${config.restarts}), generation ${generation + 1}/${config.generations}`, 'Not yet certified', bestPosition, bestEvaluation, Math.max(0, initialLower - numericSlack(initialLower)), { nodes, pruned, remaining, evaluations }, started),
        );
        await yieldToWorker();
      }
      if (performance.now() - started >= config.maxRuntimeMs) {
        return makeProgress(config, 'resource-limit', 'Maximum runtime reached during heuristic search', 'Best-known solution; no global certificate', bestPosition, bestEvaluation, Math.max(0, initialLower - numericSlack(initialLower)), { nodes, pruned, remaining, evaluations }, started);
      }
    }
  }

  let lowerBound = Math.max(0, initialLower - numericSlack(initialLower));
  if (!config.globalOptimization) {
    return makeProgress(config, 'best-known', 'Heuristic search complete; global optimization disabled', 'Best-known solution; no global certificate', bestPosition, bestEvaluation, lowerBound, { nodes, pruned, remaining, evaluations }, started);
  }

  let highs: HighsRunner;
  try {
    highs = (await (typeof self === 'undefined'
      ? loadHighs()
      : loadHighs({
          locateFile: (file) => new URL(`./solver-assets/${file}`, self.location.href).href,
        }))) as HighsRunner;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to initialize the local HiGHS WebAssembly solver: ${message}`);
  }

  const root: SearchNode = { lo: low.slice(), hi: high.slice(), lowerBound: lowerBound, depth: 0 };
  root.lowerBound = lowerBoundForNode(highs, root, config, config.lpDirectionCount);
  const heap: SearchNode[] = [];
  pushHeap(heap, root);
  let closedLowerBound = Infinity;
  let directionCount = config.lpDirectionCount;

  while (heap.length > 0) {
    if (isCancelled()) {
      const currentLower = Math.min(closedLowerBound, heap[0]?.lowerBound ?? Infinity);
      return makeProgress(config, 'cancelled', 'Cancelled during branch-and-bound', 'Best-known solution; no global certificate', bestPosition, bestEvaluation, Math.min(lowerBound, currentLower), { nodes, pruned, remaining: heap.length, evaluations }, started);
    }
    const openLower = heap[0].lowerBound;
    lowerBound = Math.min(closedLowerBound, openLower);
    const upperBound = bestEvaluation.radius + numericSlack(bestEvaluation.radius);
    if (upperBound - lowerBound <= config.tolerance) {
      return makeProgress(config, 'certified', 'Branch-and-bound gap target reached', 'Certified within requested absolute tolerance using conservative floating-point margins', bestPosition, bestEvaluation, lowerBound, { nodes, pruned, remaining: heap.length, evaluations }, started);
    }
    if (nodes >= config.maxNodes || performance.now() - started >= config.maxRuntimeMs) {
      remaining = heap.length;
      return makeProgress(config, 'resource-limit', 'Branch-and-bound resource limit reached', 'Best-known solution; global certificate not reached', bestPosition, bestEvaluation, lowerBound, { nodes, pruned, remaining, evaluations }, started);
    }
    const node = popHeap(heap)!;
    nodes++;
    if (nodes > 0 && nodes % 250 === 0 && directionCount < Math.min(36, config.lpDirectionCount * 4)) {
      directionCount = Math.min(36, config.lpDirectionCount * 4, directionCount + config.lpDirectionCount);
    }
    if (node.lowerBound >= upperBound - config.tolerance) {
      closedLowerBound = Math.min(closedLowerBound, node.lowerBound);
      pruned++;
      continue;
    }

    const midpoint = Float64Array.from(node.lo, (value, i) => (value + node.hi[i]) / 2);
    const midpointCanonical = canonicalize(midpoint);
    const midpointEvaluation = evaluate(midpointCanonical);
    if (midpointEvaluation.radius < bestEvaluation.radius) {
      bestPosition = midpointCanonical;
      bestEvaluation = midpointEvaluation;
    }

    const dimension = splitDimension(node, config.width, config.height);
    if (dimension < 0 || node.hi[dimension] === node.lo[dimension]) {
      closedLowerBound = Math.min(closedLowerBound, node.lowerBound);
      pruned++;
      continue;
    }
    const midpointCoordinate = (node.lo[dimension] + node.hi[dimension]) / 2;
    const leftHigh = node.hi.slice();
    leftHigh[dimension] = midpointCoordinate;
    const rightLow = node.lo.slice();
    rightLow[dimension] = midpointCoordinate;
    const children: SearchNode[] = [
      { lo: node.lo, hi: leftHigh, lowerBound: 0, depth: node.depth + 1 },
      { lo: rightLow, hi: node.hi, lowerBound: 0, depth: node.depth + 1 },
    ];
    for (const child of children) {
      child.lowerBound = lowerBoundForNode(highs, child, config, directionCount);
    }
    if (heap.length + children.length > config.maxOpenNodes) {
      pushHeap(heap, node);
      remaining = heap.length;
      return makeProgress(config, 'resource-limit', 'Open-node memory limit reached', 'Best-known solution; global certificate not reached', bestPosition, bestEvaluation, Math.min(closedLowerBound, heap[0]?.lowerBound ?? node.lowerBound), { nodes, pruned, remaining, evaluations }, started);
    }
    for (const child of children) pushHeap(heap, child);
    if (nodes % 5 === 0) {
      const currentLower = Math.min(closedLowerBound, heap[0]?.lowerBound ?? Infinity);
      onProgress(
        makeProgress(config, 'running', `Branch-and-bound (${directionCount} LP directions)`, 'Certification in progress', bestPosition, bestEvaluation, currentLower, { nodes, pruned, remaining: heap.length, evaluations }, started),
      );
      await yieldToWorker();
    }
  }

  lowerBound = closedLowerBound;
  const finalStatus = bestEvaluation.radius + numericSlack(bestEvaluation.radius) - lowerBound <= config.tolerance
    ? 'certified'
    : 'numerical-failure';
  return makeProgress(
    config,
    finalStatus,
    finalStatus === 'certified' ? 'Search space exhausted' : 'Search exhausted without a valid gap certificate',
    finalStatus === 'certified' ? 'Certified within requested absolute tolerance using conservative floating-point margins' : 'Numerical failure; do not treat as globally optimal',
    bestPosition,
    bestEvaluation,
    lowerBound,
    { nodes, pruned, remaining: 0, evaluations },
    started,
  );
}
