import { describe, expect, it } from 'vitest';
import { anneal, sampledRadius, type AnnealingConfig } from './annealing';
import { evaluateArrangement } from './evaluator';

const config: AnnealingConfig = {
  width: 10,
  height: 2,
  particleCount: 2,
  seed: 12,
  maxRuntimeMs: 20000,
  iterations: 1000,
  restarts: 2,
  directionCount: 4,
};

describe('sampled simulated annealing', () => {
  it('checks boundary and adjacent-gap constraints in sampled directions', () => {
    expect(sampledRadius(10, 2, [{ x: -4, y: 0 }, { x: 4, y: 0 }], 4)).toBeCloseTo(4);
    expect(sampledRadius(10, 2, [{ x: 2, y: 0 }], 4)).toBeCloseTo(7);
  });

  it('reports the continuous-angle radius rather than an underestimated sample', async () => {
    const centered = [{ x: 0, y: 0 }];
    expect(sampledRadius(4, 2, centered, 4)).toBeLessThan(evaluateArrangement(4, 2, centered).radius);
    const oneParticle = await anneal({ ...config, width: 4, particleCount: 1 }, () => {}, () => false);
    expect(oneParticle.bestRadius).toBeCloseTo(Math.hypot(4, 2) / 2, 12);
    const result = await anneal(config, () => {}, () => false);
    const exact = evaluateArrangement(config.width, config.height, result.centers);
    expect(result.bestRadius).toBe(exact.radius);
    expect(result.bestRadius).toBeGreaterThanOrEqual(sampledRadius(config.width, config.height, result.centers, config.directionCount));
    expect(result.bestRadius).toBeLessThan(Math.hypot(config.width, config.height) / 2);
    expect(result.status).toBe('best-known');
    expect(result.certification).toMatch(/not certified/);
    for (const point of result.centers) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(config.width / 2);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(config.height / 2);
    }
  });

  it('is reproducible with a fixed seed', async () => {
    const first = await anneal(config, () => {}, () => false);
    const second = await anneal(config, () => {}, () => false);
    expect(first.centers).toEqual(second.centers);
    expect(first.bestRadius).toBe(second.bestRadius);
  });

  it('preserves a validated result when cancelled after yielding', async () => {
    let cancelled = false;
    let updates = 0;
    const result = await anneal(config, () => {
      if (++updates === 2) setTimeout(() => { cancelled = true; }, 0);
    }, () => cancelled);
    expect(result.status).toBe('cancelled');
    expect(result.bestRadius).toBe(evaluateArrangement(config.width, config.height, result.centers).radius);
  });
});
