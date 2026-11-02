import './style.css';
import type { Stats } from './solver';
import type { StartMessage } from './worker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nIn = $<HTMLInputElement>('n');
const resIn = $<HTMLInputElement>('res');
const timeIn = $<HTMLInputElement>('time');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const errorEl = $('error');
const canvas = $<HTMLCanvasElement>('canvas');
const statsEl = $('stats');

let worker: Worker | null = null;
let last: Stats | null = null;

function read(el: HTMLInputElement, min: number, max: number, name: string): number {
  const v = Number(el.value);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be in [${min}, ${max}]`);
  return v;
}

function stop() {
  worker?.terminate();
  worker = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.onclick = () => {
  let msg: StartMessage;
  try {
    const n = read(nIn, 1, 100, 'N');
    if (!Number.isInteger(n)) throw new Error('N must be an integer');
    msg = {
      n,
      resolution: read(resIn, 0.1, 90, 'Resolution'),
      timeLimitMs: read(timeIn, 1, 60, 'Time threshold') * 60000,
    };
  } catch (e) {
    errorEl.textContent = (e as Error).message;
    return;
  }
  errorEl.textContent = '';
  stop();
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Stats>) => {
    last = e.data;
    draw();
    renderStats(last);
    if (last.status !== 'running') stop();
  };
  startBtn.disabled = true;
  stopBtn.disabled = false;
  worker.postMessage(msg);
};
stopBtn.onclick = stop;

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!last) return;
  const p = last.positions;
  const n = last.n;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, p[2 * i] - 1);
    maxX = Math.max(maxX, p[2 * i] + 1);
    minY = Math.min(minY, p[2 * i + 1] - 1);
    maxY = Math.max(maxY, p[2 * i + 1] + 1);
  }
  const pad = 20;
  const scale = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad) / (maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * scale;
  const oy = h / 2 + ((minY + maxY) / 2) * scale;
  const tx = (x: number) => ox + x * scale;
  const ty = (y: number) => oy - y * scale;
  // axes
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ty(0)); ctx.lineTo(w, ty(0));
  ctx.moveTo(tx(0), 0); ctx.lineTo(tx(0), h);
  ctx.stroke();
  ctx.strokeStyle = '#1565c0';
  ctx.fillStyle = 'rgba(21,101,192,0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(tx(p[2 * i]), ty(p[2 * i + 1]), scale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(tx(p[2 * i]), ty(p[2 * i + 1]), 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
window.addEventListener('resize', draw);

const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 1e-4 ? 8 : 4)} %`;
const fmtTime = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function renderStats(s: Stats) {
  const status = { running: 'running', done: 'finished (search space exhausted)', timeout: 'stopped (time threshold)' }[s.status];
  const rows: [string, string][] = [
    ['Status', status],
    ['Elapsed', fmtTime(s.elapsedMs)],
    ['Nodes processed', `${s.nodes} (${Math.round(s.nodes / Math.max(s.elapsedMs / 1000, 1e-3))}/s)`],
    ['Best objective', s.best.toFixed(6)],
    ['Global upper bound', s.globalUpper.toFixed(6)],
    ['Gap (upper bound − best)', s.gap.toExponential(3)],
    ['Incumbent improvements', String(s.improvements)],
    ['Explored solution space', `<progress max="1" value="${s.exploredFraction}"></progress> ${pct(s.exploredFraction)}`],
    ['Pruned by objective bound', `${pct(s.prunedObjective)} (${s.prunedObjectiveCount} regions)`],
    ['Pruned by feasibility bound', `${pct(s.prunedFeasibility)} (${s.prunedFeasibilityCount} regions)`],
    ['Converged (region below min. size)', `${pct(s.converged)} (${s.convergedCount} regions)`],
    ['Open regions', String(s.stackSize)],
    ['Likelihood a better solution exists (heuristic)', pct(s.betterLikelihood)],
  ];
  statsEl.innerHTML = `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

draw();
