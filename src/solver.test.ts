import { describe, expect, it } from 'vitest';
import { Solver, isFeasible } from './solver';

function solve(n: number, res: number) {
  const s = new Solver(n, res);
  const t = Date.now();
  while (!s.finished && Date.now() - t < 20000) s.step(100);
  return s.stats();
}

describe('solver', () => {
  it('N=1 is trivially done', () => {
    expect(solve(1, 5).status).toBe('done');
  });
  it('N=2 places particles at distance 2', () => {
    const s = solve(2, 5);
    expect(s.status).toBe('done');
    expect(s.positions[2]).toBeCloseTo(2, 6);
  });
  it('N=3 is at least the line configuration and is feasible', () => {
    const s = solve(3, 10);
    expect(s.status).toBe('done');
    expect(s.best).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(isFeasible(s.positions, 10)).toBe(true);
  });
  it('reports consistent fractions', () => {
    const s = solve(3, 10);
    const classifiedFraction = s.prunedObjective + s.prunedFeasibility + s.converged;
    expect(s.exploredFraction).toBeCloseTo(classifiedFraction, 6);
    expect(s.exploredFraction).toBeGreaterThanOrEqual(0);
    expect(s.exploredFraction).toBeLessThanOrEqual(1);
  });
});
