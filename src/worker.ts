import { optimize, type SolverConfig, type SolverProgress } from './solver';
import { anneal, type AnnealingConfig } from './annealing';

type WorkerRequest =
  | { type: 'start'; method: 'global'; config: SolverConfig }
  | { type: 'start'; method: 'annealing'; config: AnnealingConfig }
  | { type: 'cancel' };

let cancelled = false;
let running = false;
let latest: SolverProgress | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (running) return;
  running = true;
  cancelled = false;
  latest = null;
  const callbacks = [
    (progress: SolverProgress) => {
      latest = progress;
      self.postMessage(progress);
    },
    () => cancelled,
  ] as const;
  const result = event.data.method === 'annealing'
    ? anneal(event.data.config, ...callbacks)
    : optimize(event.data.config, ...callbacks);
  void result
    .then((progress) => self.postMessage(progress))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (latest) {
        self.postMessage({
          ...latest,
          status: 'numerical-failure',
          phase: message,
          certification: 'Numerical failure; do not treat as globally optimal',
        } satisfies SolverProgress);
      } else {
        self.postMessage({ type: 'error', message });
      }
    })
    .finally(() => {
      running = false;
    });
};
