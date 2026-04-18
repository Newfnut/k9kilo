// ─────────────────────────────────────────────
//  K9 Kilo v2 — settings.js
//  Settings screen: unit, theme, account, CSV export.
// ─────────────────────────────────────────────

import {
  getState, setDefaultUnit, getUnit,
  fmtMoney, expNetAmount, activeDogs,
} from './state.js';

// ── Render settings screen ────────────────────
export function renderSettings() {
  const state = getState();
  const unit  = getUnit();
  const theme        = state.settings?.theme        || 'dark';
  const showAvgLine   = state.settings?.showAvgLine   !== false;
  const showIdealLine = state.settings?.showIdealLine !== false;

  // Unit toggle
  document.getElementById('settings-btn-lbs')?.classList.toggle('active', unit === 'lbs');
  document.getElementById('settings-btn-kg')?.classList.toggle('active', unit === 'kg');

  // Theme toggle
  document.getElementById('settings-btn-dark')?.classList.toggle('active', theme === 'dark');
  document.getElementById('settings-btn-light')?.classList.toggle('active', theme === 'light');

  // Chart line toggles
  document.getElementById('settings-btn-avg-on')?.classList.toggle('active', showAvgLine);
  document.getElementById('settings-btn-avg-off')?.classList.toggle('active', !showAvgLine);
  document.getElementById('settings-btn-ideal-on')?.classList.toggle('active', showIdealLine);
  document.getElementById('settings-btn-ideal-off')?.classList.toggle('active', !showIdealLine);

  // Account email
  const emailEl = document.getElementById('settings-user-email');
  if (emailEl) {
    const user = window.__currentUser;
    emailEl.textContent = user ? user.email : '—';
  }
}

// ── Unit ──────────────────────────────────────
export function settingsSetUnit(u) {
  setDefaultUnit(u);
  window.__save?.();
  import('./render.js').then(r => r.render());
}

// ── Theme ─────────────────────────────────────
export function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-mode', isLight);
  document.documentElement.style.background = isLight ? '#F2F2F7' : '#000000';
}

export function settingsSetTheme(theme) {
  const state = getState();
  state.settings.theme = theme;
  applyTheme(theme);
  window.__save?.();
  renderSettings();
}

// ── Chart line toggles ────────────────────────
export function settingsSetAvgLine(on) {
  const state = getState();
  state.settings.showAvgLine = on;
  window.__save?.();
  renderSettings();
  import('./render.js').then(r => r.render());
}

export function settingsSetIdealLine(on) {
  const state = getState();
  state.settings.showIdealLine = on;
  window.__save?.();
  renderSettings();
  import('./render.js').then(r => r.render());
}

// ── CSV Export ────────────────────────────────
export function exportExpensesCSV() {
  const state   = getState();
  const dogs    = activeDogs();
  const expenses = state.expenses || [];

  if (expenses.length === 0) {
    window.__showToast?.('No expenses to export');
    return;
  }

  const rows = [[
    'Date', 'Category', 'Bill Amount', 'Reimbursement', 'Net Amount',
    'Per Dog Share', 'Dog / Allocation', 'Type', 'Location', 'Kind', 'Notes',
  ]];

  [...expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const net   = expNetAmount(e);
    const reimb = e.category === 'Veterinary' ? (parseFloat(e.reimbursement) || 0) : 0;

    let alloc = '', perDogShare = '';
    if (e.splitDogIds && e.splitDogIds.length > 0) {
      alloc = e.splitDogIds
        .map(id => { const d = state.dogs.find(x => x.id === id); return d ? d.name : '?'; })
        .join(', ');
      perDogShare = (net / e.splitDogIds.length).toFixed(2);
    } else if (e.shared) {
      alloc = 'Shared all dogs';
      perDogShare = (net / (dogs.length || 1)).toFixed(2);
    } else {
      const dog = state.dogs.find(d => d.id === e.dogId);
      alloc = dog ? dog.name : 'Unknown';
      perDogShare = net.toFixed(2);
    }

    const locationVal = e.location || e.where || '';
    rows.push([
      e.date,
      e.category,
      (parseFloat(e.amount) || 0).toFixed(2),
      reimb.toFixed(2),
      net.toFixed(2),
      perDogShare,
      alloc,
      e.expType  || '',
      locationVal,
      e.kind     || '',
      e.notes    || '',
    ]);
  });

  const csv  = rows.map(r =>
    r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'k9kilo-expenses.csv';
  a.click();
  URL.revokeObjectURL(url);
  window.__showToast?.('CSV downloaded!');
}
