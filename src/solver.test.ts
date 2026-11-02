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
  it('N=3 beats the line configuration and is feasible', () => {
    const s = solve(3, 10);
    expect(s.status).toBe('done');
    expect(s.best).toBeGreaterThanOrEqual(Math.log(2) * 2 + Math.log(4) - 1e-9);
    expect(isFeasible(s.positions, 10)).toBe(true);
  });
  it('reports consistent fractions', () => {
    const s = solve(3, 10);
    expect(s.exploredFraction).toBeCloseTo(1, 6);
  });
});
