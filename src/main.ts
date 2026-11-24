import './style.css';
import { evaluateArrangement } from './evaluator';
import { Rectangle, type Point } from './geometry';
import type { SolverConfig, SolverProgress } from './solver';
import type { AnnealingConfig } from './annealing';

const $ = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

const form = $<HTMLFormElement>('config');
const widthInput = $<HTMLInputElement>('width');
const heightInput = $<HTMLInputElement>('height');
const errorElement = $('error');
const startButton = $<HTMLButtonElement>('start');
const cancelButton = $<HTMLButtonElement>('cancel');
const resetButton = $<HTMLButtonElement>('reset');
const recalculateButton = $<HTMLButtonElement>('recalculate');
const jsonButton = $<HTMLButtonElement>('json');
const csvButton = $<HTMLButtonElement>('csv');
const canvas = $<HTMLCanvasElement>('canvas');
const phaseElement = $('phase');
const certificationElement = $('certification');
const statsElement = $('stats');
const coordinatesElement = $('coordinates');
const criticalElement = $('critical');
const globalTab = $<HTMLButtonElement>('tab-global');
const annealingTab = $<HTMLButtonElement>('tab-annealing');
const globalOptions = $<HTMLFieldSetElement>('global-options');
const annealingOptions = $<HTMLFieldSetElement>('annealing-options');

let worker: Worker | null = null;
let lastProgress: SolverProgress | null = null;
let lastConfig: SolverConfig | AnnealingConfig | null = null;
let method: 'global' | 'annealing' = 'global';
let lastMethod: 'global' | 'annealing' = 'global';
let zoom = 1;
let panX = 0;
let panY = 0;
let drag: { x: number; y: number; panX: number; panY: number } | null = null;

function numberValue(id: string): number {
  const value = Number($<HTMLInputElement>(id).value);
  if (!Number.isFinite(value)) throw new Error(`${id} must be a finite number`);
  return value;
}

function positiveInteger(id: string, label: string, minimum: number): number {
  const value = numberValue(id);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer of at least ${minimum}`);
  }
  return value;
}

function readCommonConfig() {
  const width = numberValue('width');
  const height = numberValue('height');
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive');
  const particleCount = positiveInteger('particleCount', 'Particle count', 1);
  if (particleCount > 10) throw new Error('Particle count must be between 1 and 10');
  const seed = positiveInteger('seed', 'Random seed', 0);
  if (seed > 0xffffffff) throw new Error('Random seed must be in [0, 4294967295]');
  const maxRuntimeSeconds = numberValue('runtime');
  if (maxRuntimeSeconds <= 0 || !Number.isFinite(maxRuntimeSeconds * 1000)) {
    throw new Error('Maximum runtime must be positive and representable in milliseconds');
  }
  return { width, height, particleCount, seed, maxRuntimeMs: maxRuntimeSeconds * 1000 };
}

function readConfig(): SolverConfig {
  const common = readCommonConfig();
  const tolerance = numberValue('tolerance');
  if (tolerance <= 0) throw new Error('Target absolute gap must be positive');
  const populationSize = positiveInteger('population', 'DE population', 4);
  const generations = positiveInteger('generations', 'DE generations', 1);
  const restarts = positiveInteger('restarts', 'Independent restarts', 1);
  const lpDirectionCount = positiveInteger('directions', 'LP direction count', 4);
  if (lpDirectionCount > 180) throw new Error('LP direction count must not exceed 180');
  return {
    ...common,
    tolerance,
    populationSize,
    generations,
    restarts,
    lpDirectionCount,
    globalOptimization: $<HTMLInputElement>('global').checked,
    maxNodes: positiveInteger('maxNodes', 'Maximum explored nodes', 1),
    maxOpenNodes: positiveInteger('maxOpenNodes', 'Maximum open nodes', 1),
  };
}

function readAnnealingConfig(): AnnealingConfig {
  const directionCount = positiveInteger('annealingDirections', 'Sampled direction count', 4);
  if (directionCount > 720) throw new Error('Sampled direction count must not exceed 720');
  return {
    ...readCommonConfig(),
    directionCount,
    iterations: positiveInteger('annealingIterations', 'Iterations per restart', 1),
    restarts: positiveInteger('annealingRestarts', 'Independent restarts', 1),
  };
}

function format(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumSignificantDigits: digits });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function stat(label: string, value: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'stat';
  const name = document.createElement('span');
  name.textContent = label;
  const output = document.createElement('strong');
  output.textContent = value;
  item.append(name, output);
  return item;
}

function render(progress: SolverProgress): void {
  lastProgress = progress;
  phaseElement.textContent = `${progress.phase} · ${progress.status}`;
  certificationElement.textContent = progress.certification;
  certificationElement.className = `certification ${progress.status}`;
  statsElement.replaceChildren(...(lastMethod === 'annealing' ? [
    stat('Best validated radius', format(progress.bestRadius)),
    stat('Sampled evaluations', progress.heuristicEvaluations.toLocaleString()),
    stat('Elapsed', formatDuration(progress.elapsedMs)),
  ] : [
    stat('Best radius', format(progress.bestRadius)),
    stat('Global upper bound', format(progress.upperBound)),
    stat('Global lower bound', format(progress.lowerBound)),
    stat('Absolute gap', format(progress.absoluteGap, 4)),
    stat('Relative gap', `${format(progress.relativeGap * 100, 4)}%`),
    stat('Explored nodes', progress.exploredNodes.toLocaleString()),
    stat('Pruned nodes', progress.prunedNodes.toLocaleString()),
    stat('Remaining nodes', progress.remainingNodes.toLocaleString()),
    stat('Heuristic evaluations', progress.heuristicEvaluations.toLocaleString()),
    stat('Elapsed', formatDuration(progress.elapsedMs)),
  ]));
  coordinatesElement.replaceChildren();
  const list = document.createElement('ol');
  list.className = 'coordinate-list';
  progress.centers.forEach((point, index) => {
    const item = document.createElement('li');
    item.textContent = `P${index + 1}  (${format(point.x)}, ${format(point.y)})`;
    list.append(item);
  });
  coordinatesElement.append(list);
  const constraint = progress.evaluation.activeConstraint;
  const particles = constraint.particleIndices.map((index) => `P${index + 1}`).join(' and ');
  criticalElement.textContent =
    `Critical direction ${format((progress.evaluation.criticalAngle * 180) / Math.PI, 5)}° · ` +
    `${constraint.type.replaceAll('-', ' ')} · ${particles}`;
  recalculateButton.disabled = false;
  jsonButton.disabled = false;
  csvButton.disabled = false;
  draw();
}

function visibleStatus(progress: SolverProgress): boolean {
  return progress.status === 'running';
}

function setWorkerActive(active: boolean): void {
  startButton.disabled = active;
  cancelButton.disabled = !active;
  globalTab.disabled = active;
  annealingTab.disabled = active;
}

function selectMethod(next: 'global' | 'annealing'): void {
  method = next;
  for (const [tab, panel, selected] of [
    [globalTab, globalOptions, next === 'global'],
    [annealingTab, annealingOptions, next === 'annealing'],
  ] as const) {
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
    panel.disabled = !selected;
  }
}

globalTab.addEventListener('click', () => selectMethod('global'));
annealingTab.addEventListener('click', () => selectMethod('annealing'));
for (const tab of [globalTab, annealingTab]) {
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = method === 'global' ? 'annealing' : 'global';
    selectMethod(next);
    (next === 'global' ? globalTab : annealingTab).focus();
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorElement.textContent = '';
  let config: SolverConfig | AnnealingConfig;
  try {
    config = method === 'global' ? readConfig() : readAnnealingConfig();
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : String(error);
    return;
  }
  worker?.terminate();
  lastConfig = config;
  lastMethod = method;
  lastProgress = null;
  recalculateButton.disabled = true;
  jsonButton.disabled = true;
  csvButton.disabled = true;
  phaseElement.textContent = 'Starting optimization';
  certificationElement.textContent = 'No result yet';
  certificationElement.className = 'certification';
  statsElement.replaceChildren();
  coordinatesElement.textContent = 'Coordinates will appear when an arrangement is available.';
  criticalElement.textContent = 'Start an optimization to inspect its best-known arrangement.';
  zoom = 1;
  panX = 0;
  panY = 0;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<SolverProgress | { type: 'error'; message: string }>) => {
    if ('type' in event.data) {
      errorElement.textContent = event.data.message;
      setWorkerActive(false);
      worker?.terminate();
      worker = null;
      return;
    }
    render(event.data);
    if (!visibleStatus(event.data)) {
      setWorkerActive(false);
      worker?.terminate();
      worker = null;
    }
  };
  worker.onerror = (event) => {
    errorElement.textContent = event.message || 'The optimization worker failed';
    setWorkerActive(false);
    worker?.terminate();
    worker = null;
  };
  setWorkerActive(true);
  worker.postMessage({ type: 'start', method, config });
});

cancelButton.addEventListener('click', () => worker?.postMessage({ type: 'cancel' }));

resetButton.addEventListener('click', () => {
  worker?.terminate();
  worker = null;
  form.reset();
  lastProgress = null;
  lastConfig = null;
  setWorkerActive(false);
  errorElement.textContent = '';
  phaseElement.textContent = 'Idle';
  certificationElement.textContent = 'No result yet';
  certificationElement.className = 'certification';
  statsElement.replaceChildren();
  coordinatesElement.textContent = 'Coordinates will appear when an arrangement is available.';
  criticalElement.textContent = 'Start an optimization to inspect its best-known arrangement.';
  recalculateButton.disabled = true;
  jsonButton.disabled = true;
  csvButton.disabled = true;
  zoom = 1;
  panX = 0;
  panY = 0;
  draw();
});

recalculateButton.addEventListener('click', () => {
  if (!lastProgress) return;
  errorElement.textContent = '';
  try {
    const width = numberValue('width');
    const height = numberValue('height');
    const geometry = new Rectangle(width, height);
    const centers = lastProgress.centers;
    if (centers.some((point) => !geometry.contains(point))) {
      throw new Error('The current particle centers must be inside the entered rectangle');
    }
    const evaluation = evaluateArrangement(width, height, centers);
    const previous = lastProgress;
    lastConfig = lastConfig ? { ...lastConfig, width, height, particleCount: centers.length } : null;
    const rawLower = Math.hypot(width, height) / (2 * centers.length);
    const safety = 1e-9 * Math.max(1, Math.abs(rawLower), Math.abs(evaluation.radius));
    const lowerBound = Math.max(0, rawLower - safety);
    const upperBound = evaluation.radius + safety;
    const absoluteGap = Math.max(0, upperBound - lowerBound);
    render({
      ...previous,
      status: 'best-known',
      phase: 'Current arrangement recalculated',
      certification: lastMethod === 'annealing'
        ? 'Heuristic solution validated over all directions; global optimality is not certified'
        : 'Validated feasible arrangement; recalculation does not certify global optimality',
      bestRadius: evaluation.radius,
      upperBound,
      lowerBound,
      absoluteGap,
      relativeGap: absoluteGap / Math.max(upperBound, Number.MIN_VALUE),
      evaluation,
    });
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : String(error);
  }
});

function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

jsonButton.addEventListener('click', () => {
  if (!lastProgress || !lastConfig) return;
  download(
    'particle-blocking-result.json',
    JSON.stringify(
      {
        method: lastMethod,
        configuration: lastConfig,
        status: lastProgress.status,
        certification: lastProgress.certification,
        bestRadius: lastProgress.bestRadius,
        ...(lastMethod === 'global' ? {
          lowerBound: lastProgress.lowerBound,
          upperBound: lastProgress.upperBound,
          absoluteGap: lastProgress.absoluteGap,
          relativeGap: lastProgress.relativeGap,
        } : {}),
        centers: lastProgress.centers,
        criticalAngleRadians: lastProgress.evaluation.criticalAngle,
        activeConstraint: lastProgress.evaluation.activeConstraint,
        elapsedMs: lastProgress.elapsedMs,
        exploredNodes: lastProgress.exploredNodes,
        prunedNodes: lastProgress.prunedNodes,
        heuristicEvaluations: lastProgress.heuristicEvaluations,
      },
      null,
      2,
    ),
    'application/json',
  );
});

csvButton.addEventListener('click', () => {
  if (!lastProgress) return;
  const lines = ['particle,x,y,radius'];
  lastProgress.centers.forEach((point, index) => {
    lines.push(`${index + 1},${point.x},${point.y},${lastProgress!.bestRadius}`);
  });
  download('particle-centers.csv', lines.join('\n'), 'text/csv');
});

function drawCriticalLine(
  context: CanvasRenderingContext2D,
  geometry: Rectangle,
  centers: readonly Point[],
  angle: number,
  activeType: string,
  activeIndices: readonly number[],
  transform: (point: Point) => Point,
): void {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const [lower, upper] = geometry.projectionInterval(angle);
  const projections = centers.map((point) => point.x * cosine + point.y * sine).sort((a, b) => a - b);
  let t = (projections[0] + projections[projections.length - 1]) / 2;
  if (activeType === 'left-boundary') t = lower;
  else if (activeType === 'right-boundary') t = upper;
  else if (activeIndices.length === 2) {
    const left = centers[activeIndices[0]];
    const right = centers[activeIndices[1]];
    t = ((left.x + right.x) * cosine + (left.y + right.y) * sine) / 2;
  }

  const { minX, maxX, minY, maxY } = geometry.bounds;
  const intersections: Point[] = [];
  const add = (point: Point) => {
    if (
      point.x >= minX - 1e-9 &&
      point.x <= maxX + 1e-9 &&
      point.y >= minY - 1e-9 &&
      point.y <= maxY + 1e-9 &&
      !intersections.some((other) => Math.hypot(point.x - other.x, point.y - other.y) < 1e-9)
    ) intersections.push(point);
  };
  if (Math.abs(sine) > 1e-12) {
    add({ x: minX, y: (t - minX * cosine) / sine });
    add({ x: maxX, y: (t - maxX * cosine) / sine });
  }
  if (Math.abs(cosine) > 1e-12) {
    add({ x: (t - minY * sine) / cosine, y: minY });
    add({ x: (t - maxY * sine) / cosine, y: maxY });
  }
  if (intersections.length < 2) return;
  const first = transform(intersections[0]);
  const second = transform(intersections[1]);
  context.save();
  context.setLineDash([6, 5]);
  context.strokeStyle = '#ff746f';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(first.x, first.y);
  context.lineTo(second.x, second.y);
  context.stroke();
  context.restore();
}

function draw(): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const width = lastConfig?.width ?? Number(widthInput.value);
  const height = lastConfig?.height ?? Number(heightInput.value);
  context.fillStyle = '#101723';
  context.fillRect(0, 0, cssWidth, cssHeight);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    context.fillStyle = '#9aa8bc';
    context.font = '14px system-ui, sans-serif';
    context.fillText('Enter rectangle dimensions to preview', 20, 32);
    return;
  }
  let centers = lastProgress?.centers ?? [];
  const radius = lastProgress?.bestRadius ?? 0;
  const geometry = new Rectangle(width, height);
  const margin = 30;
  const scale = Math.min((cssWidth - 2 * margin) / width, (cssHeight - 2 * margin) / height) * zoom;
  const originX = cssWidth / 2 + panX;
  const originY = cssHeight / 2 + panY;
  const transform = (point: Point): Point => ({
    x: originX + point.x * scale,
    y: originY - point.y * scale,
  });

  const topLeft = transform({ x: -width / 2, y: height / 2 });
  context.fillStyle = '#172333';
  context.fillRect(topLeft.x, topLeft.y, width * scale, height * scale);
  context.strokeStyle = '#72b8ff';
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, width * scale, height * scale);

  if (lastProgress) {
    drawCriticalLine(
      context,
      geometry,
      centers,
      lastProgress.evaluation.criticalAngle,
      lastProgress.evaluation.activeConstraint.type,
      lastProgress.evaluation.activeConstraint.particleIndices,
      transform,
    );
  }
  centers.forEach((point, index) => {
    const screen = transform(point);
    context.beginPath();
    context.arc(screen.x, screen.y, radius * scale, 0, 2 * Math.PI);
    context.fillStyle = 'rgba(95, 176, 255, 0.18)';
    context.fill();
    context.strokeStyle = '#5eb0ff';
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.arc(screen.x, screen.y, 3.5, 0, 2 * Math.PI);
    context.fillStyle = '#f2f7ff';
    context.fill();
    context.font = '12px system-ui, sans-serif';
    context.fillStyle = '#f2f7ff';
    context.fillText(String(index + 1), screen.x + 7, screen.y - 7);
  });
  context.fillStyle = '#9aa8bc';
  context.font = '12px system-ui, sans-serif';
  context.fillText(`r = ${format(radius)}`, 12, 20);
}

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const previous = zoom;
  zoom = Math.max(0.25, Math.min(20, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
  if (previous !== zoom) draw();
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, panX, panY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  panX = drag.panX + event.clientX - drag.x;
  panY = drag.panY + event.clientY - drag.y;
  draw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('resize', draw);
widthInput.addEventListener('input', () => { if (!lastConfig) draw(); });
heightInput.addEventListener('input', () => { if (!lastConfig) draw(); });

draw();
