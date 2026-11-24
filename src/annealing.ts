import { evaluateArrangement, type Evaluation } from './evaluator';
import { Rectangle, type Point } from './geometry';
import type { SolverProgress, SolverStatus } from './solver';

export interface AnnealingConfig {
  width: number;
  height: number;
  particleCount: number;
  seed: number;
  maxRuntimeMs: number;
  iterations: number;
  restarts: number;
  directionCount: number;
}

export function sampledRadius(width: number, height: number, centers: readonly Point[], directionCount: number): number {
  let radius = 0;
  for (let i = 0; i < directionCount; i++) {
    const theta = i * Math.PI / directionCount;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    const support = (width * Math.abs(cosine) + height * Math.abs(sine)) / 2;
    const projections = centers.map((point) => point.x * cosine + point.y * sine).sort((a, b) => a - b);
    radius = Math.max(radius, projections[0] + support, support - projections[projections.length - 1]);
    for (let j = 1; j < projections.length; j++) {
      radius = Math.max(radius, (projections[j] - projections[j - 1]) / 2);
    }
  }
  return radius;
}

export async function anneal(
  config: AnnealingConfig,
  onProgress: (progress: SolverProgress) => void,
  isCancelled: () => boolean,
): Promise<SolverProgress> {
  const started = performance.now();
  const geometry = new Rectangle(config.width, config.height);
  let state = config.seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let bestCenters: Point[] = Array.from({ length: config.particleCount }, () => ({ x: 0, y: 0 }));
  let bestEvaluation: Evaluation = evaluateArrangement(config.width, config.height, bestCenters);
  let evaluations = 0;
  const lowerRaw = Math.hypot(config.width, config.height) / (2 * config.particleCount);
  const lowerBound = Math.max(0, lowerRaw - 1e-9 * Math.max(1, lowerRaw));
  const progress = (status: SolverStatus, phase: string): SolverProgress => {
    const upperBound = bestEvaluation.radius + 1e-9 * Math.max(1, bestEvaluation.radius);
    const absoluteGap = Math.max(0, upperBound - lowerBound);
    return {
      status, phase,
      certification: 'Heuristic solution; sampled directions guide the search. The displayed radius is validated over all directions, but global optimality is not certified.',
      bestRadius: bestEvaluation.radius, upperBound, lowerBound, absoluteGap,
      relativeGap: absoluteGap / Math.max(upperBound, Number.MIN_VALUE),
      centers: bestCenters, evaluation: bestEvaluation,
      exploredNodes: 0, prunedNodes: 0, remainingNodes: 0,
      heuristicEvaluations: evaluations, elapsedMs: performance.now() - started, seed: config.seed,
    };
  };
  const score = (centers: Point[]) => {
    evaluations++;
    return sampledRadius(config.width, config.height, centers, config.directionCount);
  };
  const consider = (centers: Point[]) => {
    const evaluation = evaluateArrangement(config.width, config.height, centers);
    if (evaluation.radius < bestEvaluation.radius) {
      bestCenters = centers.map((point) => ({ ...point }));
      bestEvaluation = evaluation;
    }
  };

  onProgress(progress('running', 'Annealing initialization'));
  for (let restart = 0; restart < config.restarts; restart++) {
    let current = restart === 0
      ? bestCenters.map((point) => ({ ...point }))
      : Array.from({ length: config.particleCount }, () => ({
          x: geometry.bounds.minX + random() * config.width,
          y: geometry.bounds.minY + random() * config.height,
        }));
    let currentScore = score(current);
    let bestSample = currentScore;
    consider(current);
    for (let iteration = 0; iteration < config.iterations; iteration++) {
      if (iteration % 128 === 0) {
        if (isCancelled()) return progress('cancelled', 'Annealing cancelled');
        if (performance.now() - started >= config.maxRuntimeMs) {
          return progress('resource-limit', 'Maximum runtime reached during annealing');
        }
        onProgress(progress('running', `Annealing (${restart + 1}/${config.restarts}), iteration ${iteration}/${config.iterations}`));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isCancelled()) return progress('cancelled', 'Annealing cancelled');
        if (performance.now() - started >= config.maxRuntimeMs) {
          return progress('resource-limit', 'Maximum runtime reached during annealing');
        }
      }
      const fraction = iteration / Math.max(1, config.iterations - 1);
      const temperature = Math.hypot(config.width, config.height) * 0.1 * Math.pow(0.001, fraction);
      const step = 0.02 + 0.48 * Math.pow(1 - fraction, 2);
      const candidate = current.map((point) => ({ ...point }));
      const particle = candidate[Math.floor(random() * config.particleCount)];
      particle.x = Math.max(geometry.bounds.minX, Math.min(geometry.bounds.maxX, particle.x + (random() * 2 - 1) * config.width * step));
      particle.y = Math.max(geometry.bounds.minY, Math.min(geometry.bounds.maxY, particle.y + (random() * 2 - 1) * config.height * step));
      const candidateScore = score(candidate);
      if (candidateScore < bestSample) {
        bestSample = candidateScore;
        consider(candidate);
      }
      const delta = candidateScore - currentScore;
      if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
        current = candidate;
        currentScore = candidateScore;
      }
    }
  }
  return progress('best-known', 'Annealing complete');
}
