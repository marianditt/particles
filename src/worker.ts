import { optimize, type SolverConfig, type SolverProgress } from './solver';

type WorkerRequest =
  | { type: 'start'; config: SolverConfig }
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
  void optimize(
    event.data.config,
    (progress) => {
      latest = progress;
      self.postMessage(progress);
    },
    () => cancelled,
  )
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
