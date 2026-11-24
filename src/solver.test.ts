import { describe, expect, it } from 'vitest';
import { makeDirections, optimize, type SolverConfig } from './solver';

const baseConfig: SolverConfig = {
  width: 4,
  height: 2,
  particleCount: 1,
  seed: 1,
  tolerance: 1e-3,
  maxRuntimeMs: 20000,
  populationSize: 8,
  generations: 3,
  restarts: 1,
  lpDirectionCount: 4,
  globalOptimization: false,
  maxNodes: 100,
  maxOpenNodes: 100,
};

describe('optimizer', () => {
  it('always samples horizontal, vertical and both diagonal directions', () => {
    for (const count of [4, 5, 8, 13]) {
      const directions = makeDirections(count);
      expect(directions).toHaveLength(count);
      for (const required of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
        expect(directions.some((angle) => Math.abs(angle - required) < 1e-12)).toBe(true);
      }
    }
  });

  it('is reproducible for a fixed random seed', async () => {
    const run = async () => {
      return optimize(baseConfig, () => {}, () => false);
    };
    const first = await run();
    const second = await run();
    expect(first.centers).toEqual(second.centers);
    expect(first.bestRadius).toBe(second.bestRadius);
  });

  it('keeps the global lower bound below the known feasible upper bound', async () => {
    const progress = await optimize(baseConfig, () => {}, () => false);
    expect(progress.lowerBound).toBeLessThanOrEqual(progress.upperBound);
    expect(progress.bestRadius).toBeCloseTo(Math.hypot(4, 2) / 2, 12);
    expect(progress.status).toBe('best-known');
  });

  it('certifies the one-particle analytical benchmark at a loose gap', async () => {
    const progress = await optimize(
      { ...baseConfig, globalOptimization: true, tolerance: 0.01 },
      () => {},
      () => false,
    );
    expect(progress.status).toBe('certified');
    expect(progress.absoluteGap).toBeLessThanOrEqual(0.01);
  });

  it('returns the best-known result when cancelled', async () => {
    const result = await optimize(
      { ...baseConfig, generations: 50 },
      () => {},
      () => true,
    );
    expect(result.status).toBe('cancelled');
    expect(result.bestRadius).toBeCloseTo(Math.hypot(4, 2) / 2, 12);
  });

  it('preserves the unexplored region when the open-node limit is reached', async () => {
    const result = await optimize(
      {
        ...baseConfig,
        width: 6,
        height: 4,
        particleCount: 2,
        globalOptimization: true,
        maxNodes: 10,
        maxOpenNodes: 1,
      },
      () => {},
      () => false,
    );
    expect(result.status).toBe('resource-limit');
    expect(result.remainingNodes).toBe(1);
    expect(result.lowerBound).toBeLessThanOrEqual(result.upperBound);
  });
});
