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
  ctx.strokeStyle = '#232a36';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ty(0)); ctx.lineTo(w, ty(0));
  ctx.moveTo(tx(0), 0); ctx.lineTo(tx(0), h);
  ctx.stroke();
  ctx.strokeStyle = '#5eb0ff';
  ctx.fillStyle = 'rgba(94,176,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(tx(p[2 * i]), ty(p[2 * i + 1]), scale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#e6edf7';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(tx(p[2 * i]), ty(p[2 * i + 1]), 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
window.addEventListener('resize', draw);

const pct = (v: number) => (v > 0 && v < 1e-3 ? '<0.1%' : `${(v * 100).toFixed(1)}%`);
const fmtTime = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : String(n));

function renderStats(s: Stats) {
  const status = { running: 'running', done: 'done', timeout: 'timeout' }[s.status];
  const rows: [string, string][] = [
    ['Status', status],
    ['Time', fmtTime(s.elapsedMs)],
    ['Nodes', `${fmtCount(s.nodes)} (${fmtCount(Math.round(s.nodes / Math.max(s.elapsedMs / 1000, 1e-3)))}/s)`],
    ['Best', s.best.toFixed(3)],
    ['Upper', s.globalUpper.toFixed(3)],
    ['Gap', s.gap.toExponential(1)],
    ['Improv.', String(s.improvements)],
    ['Explored', `<progress max="1" value="${s.exploredFraction}"></progress> ${pct(s.exploredFraction)}`],
    ['Pruned obj.', `${pct(s.prunedObjective)} (${fmtCount(s.prunedObjectiveCount)})`],
    ['Pruned feas.', `${pct(s.prunedFeasibility)} (${fmtCount(s.prunedFeasibilityCount)})`],
    ['Converged', `${pct(s.converged)} (${fmtCount(s.convergedCount)})`],
    ['Open', fmtCount(s.stackSize)],
    ['P(better)', pct(s.betterLikelihood)],
  ];
  statsEl.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
}

draw();
