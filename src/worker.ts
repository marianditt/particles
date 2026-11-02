import { Solver } from './solver';

export interface StartMessage {
  n: number;
  resolution: number;
  timeLimitMs: number;
}

self.onmessage = (e: MessageEvent<StartMessage>) => {
  const { n, resolution, timeLimitMs } = e.data;
  const solver = new Solver(n, resolution);
  const t0 = performance.now();
  let lastPost = 0;
  const post = (s: ReturnType<Solver['stats']>) => (self as unknown as Worker).postMessage(s);
  post(solver.stats());
  for (;;) {
    solver.step(50);
    const now = performance.now();
    if (solver.finished) {
      post(solver.stats('done'));
      return;
    }
    if (now - t0 > timeLimitMs) {
      post(solver.stats('timeout'));
      return;
    }
    if (now - lastPost > 250) {
      lastPost = now;
      post(solver.stats());
    }
  }
};
