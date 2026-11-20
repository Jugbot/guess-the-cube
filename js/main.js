import { generateRound } from './cube.js';
import { Sketch, render } from './draw.js';
import { scoreSketch } from './score.js';
import { loadStats, recordScore, resetAllStats, statsMode } from './stats.js';
import { loadSettings, saveSettings } from './settings.js';
import { createStatsView } from './statsview.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const result = $('result');
const undoBtn = $('undo');
const clearBtn = $('clear');
const primaryBtn = $('primary');
const settingsDialog = $('settings-dialog');
const infoDialog = $('info-dialog');
const statsDialog = $('stats-dialog');
const scoreHiddenInput = $('setting-score-hidden');

let settings = loadSettings();
let stats = loadStats(statsMode(settings.scoreHidden));
let phase = 'drawing';
let round = null;
let size = { w: 0, h: 0 };
let frame = 0;

const sketch = new Sketch(canvas, () => {
  scheduleRender();
  updateControls();
});

function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render(ctx, size.w, size.h, round, sketch.strokes, phase);
  });
}

function rating(score) {
  if (score >= 90) return 'Excellent!';
  if (score >= 75) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Not bad';
  return 'Keep practicing';
}

function updateControls() {
  const drawing = phase === 'drawing';
  const hasStrokes = sketch.strokes.length > 0;
  undoBtn.disabled = !drawing || !hasStrokes;
  clearBtn.disabled = !drawing || !hasStrokes;
  primaryBtn.textContent = drawing ? 'Reveal' : 'Next cube';
  primaryBtn.disabled = drawing && !hasStrokes;
  canvas.classList.toggle('locked', !drawing);
}

function newRound() {
  phase = 'drawing';
  round = generateRound(size.w, size.h);
  sketch.clear();
  sketch.enabled = true;
  result.hidden = true;
  updateControls();
  scheduleRender();
}

function reveal() {
  if (!sketch.strokes.length) return;
  phase = 'revealed';
  sketch.enabled = false;
  sketch.pointerId = null;
  const { score } = scoreSketch(sketch.strokes, round, { scoreHidden: settings.scoreHidden });
  stats = recordScore(statsMode(settings.scoreHidden), stats, score);
  result.innerHTML = '';
  const big = document.createElement('div');
  big.className = 'score';
  big.textContent = score;
  const label = document.createElement('div');
  label.className = 'rating';
  label.textContent = rating(score);
  result.append(big, label);
  result.hidden = false;
  updateControls();
  scheduleRender();
}

function primary() {
  if (phase === 'drawing') reveal();
  else newRound();
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const old = size;
  size = { w, h };
  if (!round) {
    newRound();
    return;
  }
  // Keep the current round: uniformly scale and center the cube and sketch into the new size.
  const s = Math.min(w / old.w, h / old.h);
  const ox = (w - old.w * s) / 2, oy = (h - old.h * s) / 2;
  const remap = (p) => {
    p[0] = p[0] * s + ox;
    p[1] = p[1] * s + oy;
  };
  round.verts.forEach(remap);
  sketch.strokes.forEach((stroke) => stroke.forEach(remap));
  round.edgeLength *= s;
  render(ctx, size.w, size.h, round, sketch.strokes, phase);
}

// --- Toolbar ---
undoBtn.addEventListener('click', () => sketch.undo());
clearBtn.addEventListener('click', () => sketch.clear());
primaryBtn.addEventListener('click', primary);

// --- Settings & info panels ---
$('open-settings').addEventListener('click', () => {
  scoreHiddenInput.checked = settings.scoreHidden;
  settingsDialog.showModal();
});
$('open-info').addEventListener('click', () => infoDialog.showModal());

const statsView = createStatsView({
  dialog: statsDialog,
  getStats: () => stats,
  getModeLabel: () => (settings.scoreHidden ? 'Scoring all 8 edges' : 'Scoring visible edges only'),
});
$('open-stats').addEventListener('click', () => statsView.open());

scoreHiddenInput.addEventListener('change', () => {
  settings = { ...settings, scoreHidden: scoreHiddenInput.checked };
  saveSettings(settings);
  // Applies from the next reveal; a score already shown keeps the mode it was scored with.
  stats = loadStats(statsMode(settings.scoreHidden));
});

$('reset-stats').addEventListener('click', () => {
  if (confirm('Reset your score history for both scoring modes?')) {
    resetAllStats();
    stats = loadStats(statsMode(settings.scoreHidden));
  }
});

// Clicking the dimmed backdrop closes a panel.
for (const dialog of [settingsDialog, infoDialog, statsDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// Keep mouse clicks from leaving focus on buttons, so Space/Enter always mean "Reveal / Next".
for (const btn of document.querySelectorAll('.topbar button, .toolbar button')) {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
}

window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return; // panels handle their own keys (Esc closes)
  if (e.target instanceof HTMLButtonElement) return; // let focused buttons handle their own keys
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (phase === 'drawing') sketch.undo();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    primary();
  } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (phase === 'drawing') sketch.clear();
  }
});

new ResizeObserver(resize).observe(stage);
resize();

// Show the info panel on a first visit. It counts as seen once closed, so a reload before then shows it again.
const SEEN_INFO_KEY = 'guess-the-cube-seen-info';
let seenInfo = true;
try {
  seenInfo = localStorage.getItem(SEEN_INFO_KEY) === '1';
} catch {
  /* storage unavailable: don't nag on every load */
}
if (!seenInfo) {
  infoDialog.addEventListener('close', () => {
    try {
      localStorage.setItem(SEEN_INFO_KEY, '1');
    } catch {
      /* ignore */
    }
  }, { once: true });
  infoDialog.showModal();
}
