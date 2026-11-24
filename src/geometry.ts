export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Harmonic {
  cos: number;
  sin: number;
}

export interface ProjectionHarmonics {
  lower: Harmonic;
  upper: Harmonic;
}

export interface ContainerGeometry {
  readonly bounds: Bounds;
  readonly angularBreakpoints: readonly number[];
  contains(point: Point): boolean;
  support(direction: Point): number;
  projectionInterval(theta: number): readonly [number, number];
  projectionHarmonics(theta: number): ProjectionHarmonics;
}

export class Rectangle implements ContainerGeometry {
  readonly bounds: Bounds;
  readonly angularBreakpoints = [0, Math.PI / 2, Math.PI];

  constructor(readonly width: number, readonly height: number) {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new RangeError('Rectangle dimensions must be finite and positive');
    }
    this.bounds = {
      minX: -width / 2,
      maxX: width / 2,
      minY: -height / 2,
      maxY: height / 2,
    };
  }

  contains(point: Point): boolean {
    return (
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= this.bounds.minX &&
      point.x <= this.bounds.maxX &&
      point.y >= this.bounds.minY &&
      point.y <= this.bounds.maxY
    );
  }

  support(direction: Point): number {
    return (
      (this.width / 2) * Math.abs(direction.x) +
      (this.height / 2) * Math.abs(direction.y)
    );
  }

  projectionInterval(theta: number): readonly [number, number] {
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    return [
      -this.support({ x: -cosine, y: -sine }),
      this.support({ x: cosine, y: sine }),
    ];
  }

  projectionHarmonics(theta: number): ProjectionHarmonics {
    const cosSign = Math.cos(theta) < 0 ? -1 : 1;
    const sinSign = Math.sin(theta) < 0 ? -1 : 1;
    const upper = {
      cos: (this.width / 2) * cosSign,
      sin: (this.height / 2) * sinSign,
    };
    return {
      lower: { cos: -upper.cos, sin: -upper.sin },
      upper,
    };
  }
}
