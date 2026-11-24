import { Rectangle, type ContainerGeometry, type Harmonic, type Point } from './geometry';

export type ConstraintType = 'left-boundary' | 'right-boundary' | 'adjacent-gap';

export interface ActiveConstraint {
  type: ConstraintType;
  particleIndices: number[];
}

export interface Evaluation {
  radius: number;
  criticalAngle: number;
  activeConstraint: ActiveConstraint;
  criticalAngles: number[];
}

const ANGLE_EPS = 16 * Number.EPSILON;

function normalizeAngle(theta: number): number {
  const pi = Math.PI;
  const normalized = ((theta % pi) + pi) % pi;
  return normalized < ANGLE_EPS || pi - normalized < ANGLE_EPS ? 0 : normalized;
}

function uniqueAngles(angles: number[]): number[] {
  angles.sort((a, b) => a - b);
  const result: number[] = [];
  for (const angle of angles) {
    if (result.length === 0 || angle - result[result.length - 1] > ANGLE_EPS) result.push(angle);
  }
  return result;
}

function projectionsAt(centers: readonly Point[], theta: number): { index: number; value: number }[] {
  const cosine = Math.cos(theta);
  const sine = Math.sin(theta);
  return centers
    .map((point, index) => ({ index, value: point.x * cosine + point.y * sine }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
}

function evaluateAt(
  geometry: ContainerGeometry,
  centers: readonly Point[],
  theta: number,
): { value: number; active: ActiveConstraint } {
  const sorted = projectionsAt(centers, theta);
  const [lower, upper] = geometry.projectionInterval(theta);
  let value = sorted[0].value - lower;
  let active: ActiveConstraint = { type: 'left-boundary', particleIndices: [sorted[0].index] };
  const right = upper - sorted[sorted.length - 1].value;
  if (right > value) {
    value = right;
    active = { type: 'right-boundary', particleIndices: [sorted[sorted.length - 1].index] };
  }
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = (sorted[i + 1].value - sorted[i].value) / 2;
    if (gap > value) {
      value = gap;
      active = {
        type: 'adjacent-gap',
        particleIndices: [sorted[i].index, sorted[i + 1].index],
      };
    }
  }
  return { value, active };
}

function stationaryAngles(harmonic: Harmonic, lo: number, hi: number): number[] {
  if (harmonic.cos === 0 && harmonic.sin === 0) return [];
  const base = Math.atan2(harmonic.sin, harmonic.cos);
  const first = Math.floor((lo - base) / Math.PI) - 1;
  const last = Math.ceil((hi - base) / Math.PI) + 1;
  const result: number[] = [];
  for (let k = first; k <= last; k++) {
    const theta = base + k * Math.PI;
    if (theta > lo + ANGLE_EPS && theta < hi - ANGLE_EPS) result.push(theta);
  }
  return result;
}

function addHarmonicCandidates(
  angles: number[],
  harmonic: Harmonic,
  lo: number,
  hi: number,
): void {
  angles.push(...stationaryAngles(harmonic, lo, hi));
}

export function evaluateWithGeometry(
  geometry: ContainerGeometry,
  centers: readonly Point[],
): Evaluation {
  if (centers.length === 0) throw new RangeError('At least one particle is required');
  for (const point of centers) {
    if (!geometry.contains(point)) throw new RangeError('Every particle center must be inside the container');
  }

  const changes = [0, Math.PI, ...geometry.angularBreakpoints];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const dx = centers[i].x - centers[j].x;
      const dy = centers[i].y - centers[j].y;
      if (dx === 0 && dy === 0) continue;
      changes.push(normalizeAngle(Math.atan2(-dx, dy)));
    }
  }
  const breakpoints = uniqueAngles(changes);
  if (breakpoints[breakpoints.length - 1] < Math.PI - ANGLE_EPS) breakpoints.push(Math.PI);

  const candidates = [...breakpoints];
  for (let interval = 0; interval + 1 < breakpoints.length; interval++) {
    const lo = breakpoints[interval];
    const hi = breakpoints[interval + 1];
    if (hi - lo <= ANGLE_EPS) continue;
    const midpoint = (lo + hi) / 2;
    const sorted = projectionsAt(centers, midpoint);
    const support = geometry.projectionHarmonics(midpoint);
    const leftParticle = centers[sorted[0].index];
    const rightParticle = centers[sorted[sorted.length - 1].index];
    addHarmonicCandidates(
      candidates,
      { cos: leftParticle.x - support.lower.cos, sin: leftParticle.y - support.lower.sin },
      lo,
      hi,
    );
    addHarmonicCandidates(
      candidates,
      { cos: support.upper.cos - rightParticle.x, sin: support.upper.sin - rightParticle.y },
      lo,
      hi,
    );
    for (let i = 0; i + 1 < sorted.length; i++) {
      const before = centers[sorted[i].index];
      const after = centers[sorted[i + 1].index];
      addHarmonicCandidates(
        candidates,
        { cos: (after.x - before.x) / 2, sin: (after.y - before.y) / 2 },
        lo,
        hi,
      );
    }
  }

  const criticalAngles = uniqueAngles(candidates.map(normalizeAngle));
  let radius = -Infinity;
  let criticalAngle = 0;
  let activeConstraint: ActiveConstraint = { type: 'left-boundary', particleIndices: [0] };
  for (const theta of criticalAngles) {
    const current = evaluateAt(geometry, centers, theta);
    if (current.value > radius) {
      radius = current.value;
      criticalAngle = theta;
      activeConstraint = current.active;
    }
  }

  return { radius: Math.max(0, radius), criticalAngle, activeConstraint, criticalAngles };
}

export function evaluateArrangement(
  width: number,
  height: number,
  centers: readonly Point[],
): Evaluation {
  return evaluateWithGeometry(new Rectangle(width, height), centers);
}
