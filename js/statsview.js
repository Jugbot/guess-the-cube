// The Stats panel: summary tiles, a score-per-round chart and a table view, for all time or this session.
import { average, sessionEntries } from './stats.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 220;
const M = { top: 12, right: 44, bottom: 26, left: 34 }; // right margin holds the average label
const Y_TICKS = [0, 25, 50, 75, 100];
const MAX_DOTS = 40; // beyond this, only the latest point gets a marker

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

function svgEl(name, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

// Clean integer ticks (steps of 1, 2, 5 x 10^k) across [lo, hi], at most ~maxTicks of them.
function roundTicks(lo, hi, maxTicks) {
  if (hi <= lo) return [lo];
  const raw = (hi - lo) / Math.max(1, maxTicks - 1);
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  if (!ticks.length || ticks[0] !== lo) ticks.unshift(lo);
  // Drop a step tick that crowds the first one.
  if (ticks.length > 2 && ticks[1] - ticks[0] < step / 2) ticks.splice(1, 1);
  return ticks;
}

/** The data a range shows: per-round points plus the summary numbers for the tiles. */
function rangeData(stats, range) {
  if (range === 'session') {
    const entries = sessionEntries(stats);
    const scores = entries.map((e) => e.s);
    return {
      points: entries.map((e, i) => ({ round: i + 1, ...e })),
      rounds: entries.length,
      avg: mean(scores),
      best: scores.length ? Math.max(...scores) : 0,
      last10: scores.length >= 10 ? mean(scores.slice(-10)) : null,
    };
  }
  // All time: tiles use the running totals, which also cover rounds from before per-round history existed.
  const offset = stats.rounds - stats.history.length;
  return {
    points: stats.history.map((e, i) => ({ round: offset + i + 1, ...e })),
    rounds: stats.rounds,
    avg: average(stats),
    best: stats.best,
    last10: stats.recent.length >= 10 ? mean(stats.recent) : null,
  };
}

function renderTiles(container, data) {
  const tiles = [
    ['Rounds played', data.rounds.toLocaleString()],
    ['Average', data.rounds ? String(data.avg) : '–'],
    ['Best', data.rounds ? String(data.best) : '–'],
    ['Last 10 average', data.last10 === null ? '–' : String(data.last10)],
  ];
  container.replaceChildren(
    ...tiles.map(([label, value]) => {
      const tile = el('div', 'tile');
      tile.append(el('div', 'tile-label', label), el('div', 'tile-value', value));
      return tile;
    }),
  );
}

function renderTable(container, points) {
  if (!points.length) {
    container.replaceChildren(el('p', 'chart-empty', 'No rounds to list.'));
    return;
  }
  const table = el('table');
  const head = el('tr');
  head.append(el('th', null, 'Round'), el('th', null, 'Score'), el('th', null, 'Played'));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    const row = el('tr');
    row.append(el('td', null, String(p.round)), el('td', null, String(p.s)), el('td', null, dateFmt.format(p.t)));
    body.append(row);
  }
  table.append(body);
  container.replaceChildren(table);
}

function renderChart(container, points, avg, emptyText) {
  container.replaceChildren();
  container.onpointermove = container.onpointerleave = container.onkeydown = container.onfocus = container.onblur = null;
  container.removeAttribute('tabindex');
  if (!points.length) {
    container.append(el('p', 'chart-empty', emptyText));
    return;
  }

  const n = points.length;
  const width = Math.max(260, container.clientWidth || 480);
  const iw = width - M.left - M.right;
  const ih = HEIGHT - M.top - M.bottom;
  const x = (i) => (n === 1 ? M.left + iw / 2 : M.left + (i * iw) / (n - 1));
  const y = (s) => M.top + ih * (1 - s / 100);
  const base = y(0);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, 'aria-hidden': 'true' });

  // Recessive solid hairline grid with y labels.
  for (const t of Y_TICKS) {
    svgEl('line', { class: 'grid', x1: M.left, x2: width - M.right, y1: y(t), y2: y(t) }, svg);
    svgEl('text', { class: 'tick', x: M.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg)
      .textContent = t;
  }
  // X ticks: round numbers.
  const first = points[0].round, last = points[n - 1].round;
  const maxTicks = Math.max(2, Math.floor(iw / 70));
  for (const r of roundTicks(first, last, Math.min(maxTicks, n))) {
    const i = r - first;
    svgEl('text', { class: 'tick', x: x(i), y: HEIGHT - 6, 'text-anchor': 'middle' }, svg).textContent = r;
  }

  // Area wash and the score line.
  const linePts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.s).toFixed(1)}`);
  if (n > 1) {
    svgEl('path', { class: 'area', d: `M${x(0)},${base}L${linePts.join('L')}L${x(n - 1)},${base}Z` }, svg);
    svgEl('path', { class: 'line', d: `M${linePts.join('L')}` }, svg);
  }

  // Average reference line, labelled in the right margin.
  svgEl('line', { class: 'avg', x1: M.left, x2: width - M.right, y1: y(avg), y2: y(avg) }, svg);
  svgEl('text', { class: 'avg-label', x: width - M.right + 6, y: y(avg), 'dominant-baseline': 'middle' }, svg)
    .textContent = `Avg ${avg}`;

  // Markers: every point when sparse, otherwise only the latest.
  points.forEach((p, i) => {
    if (n <= MAX_DOTS || i === n - 1) svgEl('circle', { class: 'dot', cx: x(i), cy: y(p.s), r: 4 }, svg);
  });

  // Hover layer: a crosshair that snaps to the nearest round, a lifted marker and a tooltip.
  const cross = svgEl('line', { class: 'crosshair', y1: M.top, y2: base, visibility: 'hidden' }, svg);
  const focusDot = svgEl('circle', { class: 'dot dot-focus', r: 5, visibility: 'hidden' }, svg);
  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  const tipValue = el('strong');
  const tipLabel = el('span');
  tip.append(tipValue, tipLabel);
  container.append(svg, tip);

  let active = -1;
  const show = (i) => {
    active = i;
    const p = points[i];
    const px = x(i), py = y(p.s);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    focusDot.setAttribute('cx', px);
    focusDot.setAttribute('cy', py);
    focusDot.setAttribute('visibility', 'visible');
    tipValue.textContent = p.s;
    tipLabel.textContent = `Round ${p.round} · ${dateFmt.format(p.t)}`;
    tip.hidden = false;
    // Keep the tooltip inside the chart horizontally; flip below the point near the top.
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(width - half, Math.max(half, px))}px`;
    tip.style.top = `${py}px`;
    tip.classList.toggle('below', py - tip.offsetHeight - 12 < 0);
  };
  const hide = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    focusDot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };

  container.onpointermove = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = n === 1 ? 0 : Math.round(((px - M.left) / iw) * (n - 1));
    show(Math.max(0, Math.min(n - 1, i)));
  };
  container.onpointerleave = () => {
    if (document.activeElement !== container) hide();
  };

  // Keyboard: focus the chart, then step through rounds with the arrow keys.
  container.tabIndex = 0;
  container.setAttribute('aria-label',
    `Score per round chart, ${n} round${n === 1 ? '' : 's'}, average ${avg}. Use the arrow keys to read each round.`);
  container.onfocus = () => show(active >= 0 ? active : n - 1);
  container.onblur = hide;
  container.onkeydown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const from = active >= 0 ? active : n - 1;
    show(Math.max(0, Math.min(n - 1, from + moves[e.key])));
  };
}

/**
 * Wire up the Stats panel. getStats() returns the current mode's stats; getModeLabel() describes the mode.
 * Returns { open } to show the panel with fresh numbers.
 */
export function createStatsView({ dialog, getStats, getModeLabel }) {
  const tiles = dialog.querySelector('#stats-tiles');
  const chart = dialog.querySelector('#stats-chart');
  const table = dialog.querySelector('#stats-table');
  const modeEl = dialog.querySelector('#stats-mode');
  const note = dialog.querySelector('#stats-note');
  const rangeBtns = [...dialog.querySelectorAll('[data-range]')];
  let range = 'all';
  let data = null;

  const drawChart = () => {
    const emptyText = range === 'session'
      ? 'No rounds yet this session. Reveal a cube to see your scores here.'
      : 'No rounds yet. Reveal a cube to see your scores here.';
    renderChart(chart, data.points, data.avg, emptyText);
  };

  const render = () => {
    const stats = getStats();
    data = rangeData(stats, range);
    for (const b of rangeBtns) b.setAttribute('aria-pressed', String(b.dataset.range === range));
    modeEl.textContent = getModeLabel();
    renderTiles(tiles, data);
    // Older rounds recorded before per-round history existed count in the tiles but can't be charted.
    const uncharted = range === 'all' ? data.rounds - data.points.length : 0;
    note.hidden = !(uncharted > 0 && data.points.length);
    note.textContent = `Showing the last ${data.points.length.toLocaleString()} rounds.`;
    drawChart();
    renderTable(table, data.points);
  };

  for (const b of rangeBtns) {
    b.addEventListener('click', () => {
      range = b.dataset.range;
      render();
    });
  }

  let lastWidth = 0;
  new ResizeObserver(() => {
    if (!dialog.open || !data || chart.clientWidth === lastWidth) return;
    lastWidth = chart.clientWidth;
    drawChart();
  }).observe(chart);

  return {
    open() {
      dialog.showModal();
      render();
      lastWidth = chart.clientWidth;
    },
  };
}
