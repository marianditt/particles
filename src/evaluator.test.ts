import { describe, expect, it } from 'vitest';
import { evaluateArrangement } from './evaluator';
import type { Point } from './geometry';

function denseMaximum(width: number, height: number, centers: readonly Point[], steps = 40000): number {
  let maximum = 0;
  for (let k = 0; k < steps; k++) {
    const theta = (Math.PI * k) / steps;
    const projections = centers
      .map((point) => point.x * Math.cos(theta) + point.y * Math.sin(theta))
      .sort((a, b) => a - b);
    const support =
      (width / 2) * Math.abs(Math.cos(theta)) +
      (height / 2) * Math.abs(Math.sin(theta));
    maximum = Math.max(maximum, support + projections[0], support - projections.at(-1)!);
    for (let i = 0; i + 1 < projections.length; i++) {
      maximum = Math.max(maximum, (projections[i + 1] - projections[i]) / 2);
    }
  }
  return maximum;
}

describe('continuous angular objective evaluator', () => {
  it('returns half the rectangle diagonal for one centered particle', () => {
    const result = evaluateArrangement(4, 2, [{ x: 0, y: 0 }]);
    expect(result.radius).toBeCloseTo(Math.hypot(4, 2) / 2, 12);
    expect(result.activeConstraint.type).toMatch(/boundary/);
  });

  it('handles the square benchmark and its equal horizontal/vertical supports', () => {
    const result = evaluateArrangement(2, 2, [{ x: 0, y: 0 }]);
    expect(result.radius).toBeCloseTo(Math.SQRT2, 12);
    expect(result.criticalAngles).toContain(Math.PI / 4);
  });

  it('treats coincident particles exactly like a single center', () => {
    const centers = [{ x: 0.25, y: -0.5 }, { x: 0.25, y: -0.5 }, { x: 0.25, y: -0.5 }];
    expect(evaluateArrangement(6, 3, centers).radius).toBeCloseTo(
      evaluateArrangement(6, 3, [centers[0]]).radius,
      12,
    );
  });

  it('reports the adjacent particle pair responsible for a projection gap', () => {
    const result = evaluateArrangement(10, 2, [
      { x: -4, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(result.activeConstraint.type).toBe('adjacent-gap');
    expect(result.activeConstraint.particleIndices).toHaveLength(2);
  });

  it('accepts particle centers on the rectangle boundary', () => {
    const result = evaluateArrangement(4, 2, [
      { x: -2, y: -1 },
      { x: 2, y: 1 },
    ]);
    expect(Number.isFinite(result.radius)).toBe(true);
    expect(result.radius).toBeGreaterThan(0);
  });

  it('evaluates ordering changes, equal projections and stationary points continuously', () => {
    const arrangements = [
      [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      [{ x: -1, y: 0.5 }, { x: -1, y: -0.5 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
    ];
    for (const centers of arrangements) {
      const exact = evaluateArrangement(5, 2.5, centers);
      expect(exact.radius + 1e-8).toBeGreaterThanOrEqual(denseMaximum(5, 2.5, centers));
      expect(exact.radius - denseMaximum(5, 2.5, centers)).toBeLessThan(2e-4);
    }
  });

  it('rejects centers outside the rectangle and an empty arrangement', () => {
    expect(() => evaluateArrangement(2, 2, [{ x: 1.1, y: 0 }])).toThrow(/inside/);
    expect(() => evaluateArrangement(2, 2, [])).toThrow(/at least one/i);
  });
});
