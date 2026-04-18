// ─────────────────────────────────────────────
//  K9 Kilo v2 — overlays.js
//  All overlay open/close/save handlers.
//  GPS lookup. Toast. Confirm dialog.
//  Dog management: add, delete.
// ─────────────────────────────────────────────

import {
  getState, activeDog, activeDogs,
  cvt, getUnit, setUnit, toLbs,
  fmtDate, todayStr,
  EXP_CATEGORIES, expCatMeta,
  newExpenseId, nextDogId,
  saveLocal,
} from './state.js';
import { fbSave, fbDeleteDog } from './firebase.js';
import { render } from './render.js';
import { renderExpenses } from './expenses.js';
import { renderArchive, restoreDog as _restoreDog, archiveCurrentDog as _archiveDog } from './profile.js';

// ── Save wrapper ──────────────────────────────
export function save() {
  const state = getState();
  saveLocal();
  const user = window.__currentUser;
  if (user) fbSave(state);
}

// Expose globally for cross-module use
window.__save      = save;
window.__showToast = showToast;

// ── Toast ─────────────────────────────────────
export function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Overlay helpers ───────────────────────────
function openOverlay(id)  { document.getElementById(id)?.classList.add('show'); }
function closeOverlay(id) { document.getElementById(id)?.classList.remove('show'); }

export function closeLogOverlay()     { closeOverlay('logweight-overlay'); }
export function closeEditEntry()      { closeOverlay('editentry-overlay'); _editEntryIdx = null; }
export function closeAddDog()         { closeOverlay('adddog-overlay'); }
export function closeExpenseOverlay() { closeOverlay('expense-overlay'); _expenseEditId = null; }
export function closeConfirm()        {
  closeOverlay('confirm-overlay');
  _pendingDelete = null;
}

// ── Unit quick-flip (in-overlay only) ────────
export function overlaySetUnit(u) {
  setUnit(u);
  // Update labels in both weight overlays
  ['input-weight-label', 'ee-weight-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `Weight (${u})`;
  });
  ['input-weight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.placeholder = u === 'lbs' ? '62.5' : '28.3';
  });
  document.getElementById('btn-lbs-overlay')?.classList.toggle('active', u === 'lbs');
  document.getElementById('btn-kg-overlay')?.classList.toggle('active', u === 'kg');
  document.getElementById('ee-btn-lbs')?.classList.toggle('active', u === 'lbs');
  document.getElementById('ee-btn-kg')?.classList.toggle('active', u === 'kg');
}

// ── Log Weight overlay ────────────────────────
export function openLogOverlay() {
  const dog  = activeDog();
  const unit = getUnit();

  document.getElementById('input-date').value   = todayStr();
  document.getElementById('input-weight').value = '';
  document.getElementById('input-notes').value  = '';
  document.getElementById('input-location').value = '';

  document.getElementById('input-weight-label').textContent = `Weight (${unit})`;
  document.getElementById('input-weight').placeholder = unit === 'lbs' ? '62.5' : '28.3';
  if (dog?.defaultLocation)
    document.getElementById('input-location').placeholder = dog.defaultLocation;

  document.getElementById('btn-lbs-overlay')?.classList.toggle('active', unit === 'lbs');
  document.getElementById('btn-kg-overlay')?.classList.toggle('active', unit === 'kg');

  openOverlay('logweight-overlay');
}

export function addEntry() {
  const w = parseFloat(document.getElementById('input-weight').value);
  const d = document.getElementById('input-date').value;
  if (!w || w <= 0 || !d) { showToast('Please enter a weight and date'); return; }

  const wLbs = toLbs(w);
  const dog  = activeDog();
  dog.entries.push({
    date:     d,
    weight:   parseFloat(wLbs.toFixed(1)),
    location: document.getElementById('input-location').value.trim(),
    notes:    document.getElementById('input-notes').value.trim(),
  });
  save();
  closeLogOverlay();
  render();
  showToast('Weight logged! 🐾');
}

// ── Edit Entry overlay ────────────────────────
let _editEntryIdx = null;

export function openEditEntry(idx) {
  const dog = activeDog();
  const e   = dog?.entries[idx];
  if (!e) return;

  _editEntryIdx = idx;
  const unit = getUnit();

  document.getElementById('ee-date').value     = e.date;
  document.getElementById('ee-weight').value   = cvt(e.weight);
  document.getElementById('ee-location').value = e.location || '';
  document.getElementById('ee-notes').value    = e.notes    || '';
  document.getElementById('ee-weight-label').textContent = `Weight (${unit})`;

  document.getElementById('ee-btn-lbs')?.classList.toggle('active', unit === 'lbs');
  document.getElementById('ee-btn-kg')?.classList.toggle('active', unit === 'kg');

  openOverlay('editentry-overlay');
}

export function saveEditEntry() {
  const dog = activeDog();
  if (_editEntryIdx === null || !dog?.entries[_editEntryIdx]) return;

  const w = parseFloat(document.getElementById('ee-weight').value);
  const d = document.getElementById('ee-date').value;
  if (!w || w <= 0 || !d) { showToast('Please enter a weight and date'); return; }

  const wLbs = toLbs(w);
  dog.entries[_editEntryIdx] = {
    date:     d,
    weight:   parseFloat(wLbs.toFixed(1)),
    location: document.getElementById('ee-location').value.trim(),
    notes:    document.getElementById('ee-notes').value.trim(),
  };
  save();
  closeEditEntry();
  render();
  showToast('Entry updated ✓');
}

// ── Delete entry ──────────────────────────────
let _pendingDelete = null;

export function confirmDeleteEntry(date, weight, notes) {
  _pendingDelete = { type: 'entry', date, weight: parseFloat(weight) };
  document.getElementById('confirm-title').textContent = 'Delete this entry?';
  document.getElementById('confirm-sub').textContent   =
    `${cvt(weight)} ${getUnit()} · ${fmtDate(date)}` + (notes ? `\n"${notes}"` : '');
  document.getElementById('confirm-ok').textContent = 'Delete';
  document.getElementById('confirm-ok').onclick     = () => { _doDeleteEntry(); closeConfirm(); };
  openOverlay('confirm-overlay');
}

function _doDeleteEntry() {
  if (!_pendingDelete) return;
  const dog = activeDog();
  dog.entries = dog.entries.filter(e =>
    !(e.date === _pendingDelete.date && e.weight === _pendingDelete.weight)
  );
  save();
  render();
  showToast('Entry deleted');
}

// ── Add Pet overlay ───────────────────────────
export function openAddDog() { openOverlay('adddog-overlay'); }

export function saveNewDog() {
  const name = document.getElementById('newdog-name').value.trim();
  if (!name) { showToast('Please enter a name'); return; }

  const breedSel   = document.getElementById('newdog-breed').value;
  const breedOther = document.getElementById('newdog-breed-other').value.trim();
  const breed      = breedSel === 'Other' ? (breedOther || 'Other') : breedSel;

  const state = getState();
  const id    = nextDogId();

  state.dogs.push({
    id,
    name,
    breed,
    birthday:        document.getElementById('newdog-birthday').value,
    targetWeight:    null,
    defaultLocation: '',
    chartStartDate:  '',
    archived:        false,
    archivedDate:    '',
    entries:         [],
  });
  state.activeDogId = id;

  save();
  closeAddDog();

  // Reset form
  document.getElementById('newdog-name').value         = '';
  document.getElementById('newdog-birthday').value     = '';
  document.getElementById('newdog-breed-other').value  = '';
  document.getElementById('newdog-breed-other').style.display = 'none';
  document.getElementById('newdog-breed').value        = 'Golden Retriever';

  import('./render.js').then(r => r.switchTab('home'));
  showToast(`${name} added! 🐾`);
}

// ── Delete pet ────────────────────────────────
export function confirmDeletePet(id) {
  const state    = getState();
  const targetId = id !== undefined ? id : state.activeDogId;
  const dog      = state.dogs.find(d => d.id === targetId);
  if (!dog) return;

  document.getElementById('confirm-title').textContent = `Delete ${dog.name}?`;
  document.getElementById('confirm-sub').textContent   =
    `This will permanently delete ${dog.name} and all ${dog.entries.length} weight entries.\n\nThis cannot be undone.`;
  document.getElementById('confirm-ok').textContent = 'Delete Forever';
  document.getElementById('confirm-ok').onclick     = () => { _doDeletePet(targetId); closeConfirm(); };
  openOverlay('confirm-overlay');
}

function _doDeletePet(id) {
  const state = getState();
  const dog   = state.dogs.find(d => d.id === id);
  const name  = dog?.name;

  state.dogs = state.dogs.filter(d => d.id !== id);

  if (state.activeDogId === id) {
    const rem = activeDogs();
    state.activeDogId = rem.length
      ? rem[0].id
      : (state.dogs.length ? state.dogs[0].id : null);
  }

  import('./profile.js').then(m => m.resetEditMode());
  save();
  if (name) fbDeleteDog(name);
  render();
  showToast(`${name || 'Pet'} deleted`);
}

// ── Archive / restore (delegate to profile.js) ──
export function archiveCurrentDog() { _archiveDog(); }
export function restoreDog(id)      { _restoreDog(id); }

// ── Expense overlay ───────────────────────────
let _expenseEditId = null;

function _clearExpenseSubfields() {
  ['exp-field-type', 'exp-field-location', 'exp-field-reimb'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

export function updateExpenseCategoryFields() {
  const cat  = document.getElementById('exp-category').value;
  const dogs = activeDogs();

  const reimbEl = document.getElementById('exp-subfield-reimbursement');
  if (reimbEl) reimbEl.style.display = cat === 'Veterinary' ? 'block' : 'none';

  document.getElementById('exp-split-dogs').innerHTML = dogs.map(d =>
    `<label class="exp-split-label">
      <input type="checkbox" class="exp-split-check" value="${d.id}" checked
        style="accent-color:var(--orange);width:auto">
      ${d.name}
    </label>`
  ).join('');
}

export function openAddExpense() {
  _expenseEditId = null;
  document.getElementById('exp-overlay-title').textContent = 'Log Expense';
  document.getElementById('exp-date').value     = todayStr();
  document.getElementById('exp-amount').value   = '';
  document.getElementById('exp-notes').value    = '';
  document.getElementById('exp-category').value = EXP_CATEGORIES[0].key;
  _clearExpenseSubfields();
  updateExpenseCategoryFields();
  openOverlay('expense-overlay');
}

export function openEditExpense(id) {
  const state = getState();
  const exp   = (state.expenses || []).find(e => e.id === id);
  if (!exp) return;

  _expenseEditId = id;
  document.getElementById('exp-overlay-title').textContent = 'Edit Expense';
  document.getElementById('exp-date').value     = exp.date;
  document.getElementById('exp-amount').value   = (parseFloat(exp.amount) || 0).toFixed(2);
  document.getElementById('exp-notes').value    = exp.notes || '';
  document.getElementById('exp-category').value = exp.category;
  _clearExpenseSubfields();
  updateExpenseCategoryFields();

  // Restore sub-fields after DOM settles
  setTimeout(() => {
    // Type field merges expType + kind — prefer expType, fall back to kind for legacy records
    document.getElementById('exp-field-type').value     = exp.expType || exp.kind || '';
    document.getElementById('exp-field-location').value = exp.location || exp.where || '';
    if (exp.category === 'Veterinary')
      document.getElementById('exp-field-reimb').value  = exp.reimbursement || '';

    // Restore dog checkboxes
    const preChecked = exp.splitDogIds || activeDogs().map(d => d.id);
    document.querySelectorAll('.exp-split-check').forEach(cb => {
      cb.checked = preChecked.includes(parseInt(cb.value));
    });
  }, 0);

  openOverlay('expense-overlay');
}

export function saveExpense() {
  const amount   = parseFloat(document.getElementById('exp-amount').value);
  const date     = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const notes    = document.getElementById('exp-notes').value.trim();

  if (!amount || amount <= 0 || !date) {
    showToast('Please enter amount and date');
    return;
  }

  const expType       = document.getElementById('exp-field-type')?.value.trim()     || '';
  const location      = document.getElementById('exp-field-location')?.value.trim() || '';
  const reimbursement = category === 'Veterinary'
    ? (parseFloat(document.getElementById('exp-field-reimb')?.value) || 0)
    : 0;

  const checked = [...document.querySelectorAll('.exp-split-check:checked')]
    .map(cb => parseInt(cb.value));
  if (checked.length === 0) { showToast('Select at least one dog'); return; }

  const record = {
    amount, date, category, notes,
    expType, location, kind: '', reimbursement,
    splitDogIds: checked,
    shared: false,
    dogId: null,
  };

  const state = getState();
  if (!state.expenses) state.expenses = [];

  if (_expenseEditId) {
    const idx = state.expenses.findIndex(e => e.id === _expenseEditId);
    if (idx !== -1) state.expenses[idx] = { ...state.expenses[idx], ...record };
    showToast('Expense updated ✓');
  } else {
    state.expenses.push({ id: newExpenseId(), ...record });
    showToast('Expense saved! 💰');
  }

  save();
  closeExpenseOverlay();
  renderExpenses();
}

export function confirmDeleteExpense(id) {
  const state = getState();
  const exp   = (state.expenses || []).find(e => e.id === id);
  if (!exp) return;

  const meta = expCatMeta(exp.category);
  document.getElementById('confirm-title').textContent = 'Delete this expense?';
  document.getElementById('confirm-sub').textContent   =
    `${meta.label} · $${(parseFloat(exp.amount) || 0).toFixed(2)}\n${fmtDate(exp.date)}`;
  document.getElementById('confirm-ok').textContent = 'Delete';
  document.getElementById('confirm-ok').onclick     = () => { _doDeleteExpense(id); closeConfirm(); };
  openOverlay('confirm-overlay');
}

function _doDeleteExpense(id) {
  const state = getState();
  state.expenses = (state.expenses || []).filter(e => e.id !== id);
  save();
  renderExpenses();
  showToast('Expense deleted');
}

// ── GPS ───────────────────────────────────────
export function getGPS(targetId) {
  const inp = document.getElementById(targetId);
  const btn = document.querySelector(`[data-gps-target="${targetId}"]`);
  if (!inp) return;
  if (!navigator.geolocation) { showToast('GPS not supported'); return; }

  const origText = btn?.textContent || '📍';
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    try {
      const queries = [
        `[out:json][timeout:10];node(around:200,${lat},${lon})[amenity=veterinary];out 1;`,
        `[out:json][timeout:10];node(around:200,${lat},${lon})[shop=pet];out 1;`,
      ];
      let found = null;
      for (const q of queries) {
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', body: 'data=' + encodeURIComponent(q),
        });
        const j = await r.json();
        if (j.elements?.length > 0) {
          const el = j.elements[0];
          found = el.tags?.name || el.tags?.['addr:full'] || null;
          if (found) break;
        }
      }
      if (found) {
        inp.value = found;
      } else {
        const gr = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`);
        const gj = await gr.json();
        inp.value = gj.display_name
          ? gj.display_name.split(',').slice(0, 2).join(', ')
          : `${lat.toFixed(5)},${lon.toFixed(5)}`;
      }
    } catch (e) {
      inp.value = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    }
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }, err => {
    showToast('Location error: ' + err.message);
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }, { timeout: 10000 });
}

// ── Breed "Other" toggle ──────────────────────
export function toggleBreedOther(selectId, otherId) {
  const sel   = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (!sel || !other) return;
  other.style.display = sel.value === 'Other' ? 'block' : 'none';
  if (sel.value === 'Other') other.focus();
}

// ── Backdrop close registration ───────────────
export function registerOverlayBackdrops() {
  [
    'confirm-overlay', 'editentry-overlay', 'adddog-overlay',
    'expense-overlay', 'logweight-overlay',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', e => {
        if (e.target === el) closeOverlay(id);
      });
    }
  });
}
