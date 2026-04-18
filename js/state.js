// ─────────────────────────────────────────────
//  K9 Kilo v2 — state.js
//  Single source of truth: state object, persistence,
//  selectors, and all pure helper functions.
// ─────────────────────────────────────────────

export const STORAGE_KEY = 'k9kilo_v1'; // keep v1 key for data continuity

// ── Default state shape ──────────────────────
export function defaultState() {
  return {
    activeDogId: null,
    dogs: [],
    expenses: [],
    settings: {
      defaultUnit: 'lbs',
      theme: 'dark',
      showAvgLine:   true,
      showIdealLine: true,
    },
  };
}

// ── Internal mutable state ───────────────────
let _state = defaultState();

// ── Public state accessors ───────────────────
export function getState() { return _state; }

export function setState(newState) {
  _state = newState;
  if (!_state.expenses)  _state.expenses  = [];
  if (!_state.settings)  _state.settings  = { defaultUnit: 'lbs', theme: 'dark', showAvgLine: true, showIdealLine: true };
  if (!_state.settings.defaultUnit) _state.settings.defaultUnit = 'lbs';
  if (!_state.settings.theme)       _state.settings.theme = 'dark';
  if (_state.settings.showAvgLine   === undefined) _state.settings.showAvgLine   = true;
  if (_state.settings.showIdealLine === undefined) _state.settings.showIdealLine = true;
}

// ── Persistence ──────────────────────────────
export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : defaultState();
    const s = { ...defaultState(), ...parsed };

    // Migrate v1 separate theme key
    if (!parsed.settings) {
      const legacyTheme = localStorage.getItem('k9kilo_theme');
      s.settings = {
        defaultUnit: 'lbs',
        theme: legacyTheme === 'light' ? 'light' : 'dark',
      };
    }
    s.expenses = s.expenses || [];
    setState(s);
    return _state;
  } catch (e) {
    setState(defaultState());
    return _state;
  }
}

export function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) { /* storage full — ignore */ }
}

// ── Selectors ────────────────────────────────
export function activeDog() {
  return _state.dogs.find(d => d.id === _state.activeDogId);
}

export function activeDogs() {
  return _state.dogs.filter(d => !d.archived);
}

export function archivedDogs() {
  return _state.dogs.filter(d => d.archived);
}

export function sorted(dog) {
  const target = dog || activeDog();
  if (!target) return [];
  return [...target.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ── Dog ID management ────────────────────────
export function nextDogId() {
  const dogs = _state.dogs;
  return dogs.length ? Math.max(...dogs.map(d => d.id)) + 1 : 1;
}

// ── Unit helpers ─────────────────────────────
// unit is session-level; seeded from settings but flippable in overlays
let _unit = 'lbs';

export function getUnit() { return _unit; }

export function setUnit(u) {
  _unit = u;
}

export function setDefaultUnit(u) {
  _unit = u;
  _state.settings.defaultUnit = u;
}

export function cvt(lbs) {
  return _unit === 'kg'
    ? (lbs * 0.453592).toFixed(1)
    : parseFloat(lbs).toFixed(1);
}

export function toLbs(value) {
  return _unit === 'kg' ? value / 0.453592 : value;
}

// ── Date helpers ─────────────────────────────
export function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function fmtDateLong(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── Age calculation ───────────────────────────
export function dogAge(birthday, atDate, dog) {
  if (!birthday) return null;

  let capDate = atDate;
  if (!capDate && dog && dog.archived && dog.archivedDate) capDate = dog.archivedDate;

  const from = new Date(birthday + 'T12:00:00');
  const to   = capDate ? new Date(capDate + 'T12:00:00') : new Date();

  let years  = to.getFullYear() - from.getFullYear();
  let months = to.getMonth()    - from.getMonth();
  if (to.getDate() < from.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return null;

  if (years === 0)  return `${months}mo`;
  if (months === 0) return `${years}y`;
  return `${years}y ${months}mo`;
}

// ── Money helper ─────────────────────────────
export function fmtMoney(n) {
  const v = parseFloat(n) || 0;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
}

// ── Expense helpers ──────────────────────────
export const EXP_CATEGORIES = [
  { key: 'Meat',          icon: '🥩', label: 'Meat'          },
  { key: 'Vegetables',    icon: '🥦', label: 'Vegetables'    },
  { key: 'Supplements',   icon: '🌿', label: 'Supplements'   },
  { key: 'Pet Insurance', icon: '🛡️', label: 'Pet Insurance' },
  { key: 'Veterinary',    icon: '🏥', label: 'Veterinary'    },
  { key: 'Chiropractor',  icon: '🦴', label: 'Chiropractor'  },
];

export function expCatMeta(key) {
  return EXP_CATEGORIES.find(c => c.key === key) || { icon: '💰', label: key };
}

export function expNetAmount(exp) {
  const bill  = parseFloat(exp.amount) || 0;
  const reimb = exp.category === 'Veterinary' ? (parseFloat(exp.reimbursement) || 0) : 0;
  return bill - reimb;
}

export function expenseEffectiveAmountForDog(exp, dogId) {
  const net = expNetAmount(exp);

  if (exp.splitDogIds && exp.splitDogIds.length > 0) {
    return exp.splitDogIds.includes(dogId) ? net / exp.splitDogIds.length : 0;
  }
  // Legacy: shared
  if (exp.shared) {
    const n = activeDogs().length || 1;
    return net / n;
  }
  // Legacy: single dogId
  if (exp.dogId === dogId) return net;
  return 0;
}

// ── Chart data-range helper ──────────────────
// Returns the filtered entries to use for chart + stats,
// respecting dog.chartStartDate or falling back to 2 years.
export function chartEntries(dog) {
  const s = sorted(dog);
  if (s.length < 2) return s;

  if (dog.chartStartDate) {
    const from = new Date(dog.chartStartDate + 'T12:00:00');
    const filtered = s.filter(e => new Date(e.date + 'T12:00:00') >= from);
    return filtered.length >= 2 ? filtered : s;
  }

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const filtered = s.filter(e => new Date(e.date + 'T12:00:00') >= twoYearsAgo);
  return filtered.length >= 2 ? filtered : s;
}

// ── Expense month helpers ────────────────────
export function currentMonthKey() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

export function expensesForMonth(monthKey) {
  return (_state.expenses || []).filter(e => e.date && e.date.startsWith(monthKey));
}

// ── New expense ID ────────────────────────────
export function newExpenseId() {
  return 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
