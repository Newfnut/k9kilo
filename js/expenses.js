// ─────────────────────────────────────────────
//  K9 Kilo v2 — expenses.js
//  Expenses screen rendering.
// ─────────────────────────────────────────────

import {
  getState, activeDogs,
  EXP_CATEGORIES, expCatMeta, expNetAmount, expenseEffectiveAmountForDog,
  expensesForMonth, currentMonthKey,
  fmtDate, fmtMoney,
} from './state.js';
import { escHtml } from './utils.js';

// ── View-month state ──────────────────────────
let _viewMonth = null; // null = current month

export function getViewMonthKey() {
  return _viewMonth || currentMonthKey();
}

export function prevExpenseMonth() {
  const [y, m] = getViewMonthKey().split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  _viewMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  renderExpenses();
}

export function nextExpenseMonth() {
  const [y, m] = getViewMonthKey().split('-').map(Number);
  const d      = new Date(y, m, 1);
  const nowKey = currentMonthKey();
  const newKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (newKey > nowKey) return;
  _viewMonth = newKey;
  renderExpenses();
}

// ── Main render ───────────────────────────────
export function renderExpenses() {
  const monthKey = getViewMonthKey();
  const [y, m]   = monthKey.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  document.getElementById('exp-month-label').textContent = monthLabel;

  const nowKey    = currentMonthKey();
  const nextBtn   = document.getElementById('exp-next-btn');
  const isAtNow   = monthKey >= nowKey;
  nextBtn.style.opacity       = isAtNow ? '0.3' : '1';
  nextBtn.style.pointerEvents = isAtNow ? 'none' : 'auto';

  const dogs      = activeDogs();
  const monthExps = expensesForMonth(monthKey);

  // ── 1. Cost Per Dog ──
  const summaryEl = document.getElementById('exp-summary');
  if (dogs.length === 0) {
    summaryEl.innerHTML = '<div class="empty">No pets added yet</div>';
  } else {
    summaryEl.innerHTML = dogs.map(dog => {
      const total = monthExps.reduce(
        (sum, e) => sum + expenseEffectiveAmountForDog(e, dog.id), 0
      );
      const bycat = {};
      EXP_CATEGORIES.forEach(c => {
        bycat[c.key] = monthExps
          .filter(e => e.category === c.key)
          .reduce((sum, e) => sum + expenseEffectiveAmountForDog(e, dog.id), 0);
      });
      const breakdown = EXP_CATEGORIES
        .filter(c => bycat[c.key] > 0)
        .map(c => `<span title="${c.label}">${c.icon} ${fmtMoney(bycat[c.key])}</span>`)
        .join('');
      return `<div class="exp-dog-card">
        <div class="exp-dog-name">${escHtml(dog.name)}</div>
        <div class="exp-dog-total">${fmtMoney(total)}</div>
        ${breakdown ? `<div class="exp-dog-breakdown">${breakdown}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ── 2. Category Breakdown ──
  const catEl      = document.getElementById('exp-cat-breakdown');
  const grandTotal = monthExps.reduce((sum, e) => sum + expNetAmount(e), 0);
  const usedCats   = EXP_CATEGORIES.filter(cat =>
    monthExps.some(e => e.category === cat.key)
  );

  document.getElementById('exp-grand-total').textContent = fmtMoney(grandTotal);

  if (usedCats.length === 0) {
    catEl.innerHTML = '<div class="empty" style="padding:8px 0">No expenses logged yet</div>';
  } else {
    catEl.innerHTML = usedCats.map(cat => {
      const catTotal = monthExps
        .filter(e => e.category === cat.key)
        .reduce((sum, e) => sum + expNetAmount(e), 0);
      const pct = grandTotal > 0 ? Math.round((catTotal / grandTotal) * 100) : 0;
      return `<div class="exp-cat-row">
        <span class="exp-cat-icon">${cat.icon}</span>
        <span class="exp-cat-name">${cat.label}</span>
        <div class="exp-cat-bar-wrap">
          <div class="exp-cat-bar" style="width:${Math.max(0, pct)}%"></div>
        </div>
        <span class="exp-cat-amt">${fmtMoney(catTotal)}</span>
      </div>`;
    }).join('');
  }

  // ── 3. Transactions ──
  const listEl    = document.getElementById('exp-list');
  const sorted    = [...monthExps].sort((a, b) => a.date.localeCompare(b.date));
  const state     = getState();

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="empty">No expenses this month</div>';
    return;
  }

  listEl.innerHTML = sorted.map(e => {
    const meta  = expCatMeta(e.category);
    let titleText = meta.label;
    if (e.expType && e.expType.trim()) titleText += ` — ${e.expType.trim()}`;

    // Dog tag(s)
    let dogLabel = '';
    if (e.splitDogIds && e.splitDogIds.length > 0) {
      const allActive = activeDogs().every(d => e.splitDogIds.includes(d.id))
        && e.splitDogIds.length === activeDogs().length;
      if (allActive) {
        dogLabel = `<span class="exp-tag exp-tag-shared">All dogs</span>`;
      } else {
        dogLabel = e.splitDogIds.map(id => {
          const d = state.dogs.find(x => x.id === id);
          return `<span class="exp-tag exp-tag-shared">${escHtml(d ? d.name : '?')}</span>`;
        }).join('');
      }
    } else if (e.shared) {
      dogLabel = `<span class="exp-tag exp-tag-shared">All dogs</span>`;
    } else {
      const dog = state.dogs.find(d => d.id === e.dogId);
      dogLabel = dog ? `<span class="exp-tag">${escHtml(dog.name)}</span>` : '';
    }

    // Sub-field lines
    const lines = [];
    const loc = e.location || e.where || '';
    if (loc.trim())
      lines.push(`<div class="exp-tx-field"><span class="exp-tx-val">${escHtml(loc)}</span></div>`);
    if (e.kind && e.kind.trim())
      lines.push(`<div class="exp-tx-field"><span class="exp-tx-val">${escHtml(e.kind)}</span></div>`);
    if (e.category === 'Veterinary' && parseFloat(e.reimbursement || 0) > 0)
      lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Reimb.</span><span class="exp-tx-val exp-tx-credit">−${fmtMoney(e.reimbursement)}</span></div>`);
    if (e.notes && e.notes.trim())
      lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Note</span><span class="exp-tx-val">${escHtml(e.notes)}</span></div>`);

    const net      = expNetAmount(e);
    const hasReim  = e.category === 'Veterinary' && parseFloat(e.reimbursement || 0) > 0;

    return `<div class="exp-item">
      <div class="exp-item-icon">${meta.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="exp-item-cat">${escHtml(titleText)} ${dogLabel}</div>
        <div class="exp-item-date">${fmtDate(e.date)}</div>
        ${lines.join('')}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;padding-left:8px">
        <div style="display:flex;align-items:center;gap:4px">
          <button class="exp-action-btn" data-action="edit-expense" data-id="${escHtml(e.id)}" aria-label="Edit">✏️</button>
          <button class="exp-action-btn exp-action-del" data-action="delete-expense" data-id="${escHtml(e.id)}" aria-label="Delete">×</button>
        </div>
        ${hasReim
          ? `<div class="exp-item-amt-wrap">
               <div class="exp-item-amt-orig">${fmtMoney(e.amount)}</div>
               <div class="exp-item-amt exp-item-amt-net">${fmtMoney(net)}</div>
             </div>`
          : `<div class="exp-item-amt">${fmtMoney(e.amount)}</div>`}
      </div>
    </div>`;
  }).join('');
}
