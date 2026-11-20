// User settings persisted in localStorage.

const KEY = 'guess-the-cube-settings';

const DEFAULTS = {
  scoreHidden: true, // whether edges hidden behind the cube count toward the score
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode); settings just won't persist */
  }
}
