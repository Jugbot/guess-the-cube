// Persistent score statistics in localStorage, tracked separately for each scoring mode.

const KEYS = {
  all: 'guess-the-cube-stats', // all 8 edges scored (the original key, so existing history is kept)
  visible: 'guess-the-cube-stats-visible', // only visible edges scored
};
const SESSION_KEY = 'guess-the-cube-session-start';
const RECENT = 10;
const HISTORY_MAX = 2000; // per-round entries kept for the chart; aggregates keep counting beyond this

// history: [{ t: timestamp ms, s: score }], oldest first.
const empty = () => ({ rounds: 0, total: 0, best: 0, recent: [], history: [] });

export const statsMode = (scoreHidden) => (scoreHidden ? 'all' : 'visible');

export function loadStats(mode) {
  try {
    const s = JSON.parse(localStorage.getItem(KEYS[mode]));
    if (s && typeof s.rounds === 'number') {
      const stats = { ...empty(), ...s };
      if (!Array.isArray(stats.history)) stats.history = [];
      return stats;
    }
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return empty();
}

function save(mode, stats) {
  try {
    localStorage.setItem(KEYS[mode], JSON.stringify(stats));
  } catch {
    /* storage may be unavailable (private mode); stats just won't persist */
  }
}

export function recordScore(mode, stats, score) {
  const next = {
    rounds: stats.rounds + 1,
    total: stats.total + score,
    best: Math.max(stats.best, score),
    recent: [...stats.recent, score].slice(-RECENT),
    history: [...stats.history, { t: Date.now(), s: score }].slice(-HISTORY_MAX),
  };
  save(mode, next);
  return next;
}

export function resetAllStats() {
  for (const mode of Object.keys(KEYS)) save(mode, empty());
}

export const average = (stats) => (stats.rounds ? Math.round(stats.total / stats.rounds) : 0);

// A session lasts as long as the browser tab: it survives reloads and ends when the tab closes.
let sessionStart = Date.now();
try {
  const saved = Number(sessionStorage.getItem(SESSION_KEY));
  if (saved > 0) sessionStart = saved;
  else sessionStorage.setItem(SESSION_KEY, String(sessionStart));
} catch {
  /* sessionStorage unavailable: the session is this page load */
}

export const sessionEntries = (stats) => stats.history.filter((e) => e.t >= sessionStart);
