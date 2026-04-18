// ─────────────────────────────────────────────
//  K9 Kilo v2 — profile.js
//  Profile screen: pet info, edit mode, archive, add pet.
// ─────────────────────────────────────────────

import {
  getState, activeDog, activeDogs, archivedDogs,
  cvt, getUnit, fmtDateLong, dogAge, toLbs,
} from './state.js';
import { escHtml } from './utils.js';

// ── Edit mode state ───────────────────────────
let _editMode = false;

export function isEditMode() { return _editMode; }

export function resetEditMode() {
  if (!_editMode) return;
  _editMode = false;
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) editBtn.textContent = 'Edit';
  document.getElementById('profile-view').style.display = 'block';
  document.getElementById('profile-edit').style.display = 'none';
}

// ── Main render ───────────────────────────────
export function renderProfile() {
  const dog = activeDog();
  if (!dog) return;

  // Always re-render view mode (edit mode manages its own DOM)
  if (!_editMode) {
    _renderViewMode(dog);
  }
  renderArchive();
}

function _renderViewMode(dog) {
  const unit = getUnit();
  const a    = dogAge(dog.birthday, null, dog);

  document.getElementById('profile-view').innerHTML = `
    <div class="field-wrap">
      <p class="field-label">Name</p>
      <p class="field-val">${escHtml(dog.name)}</p>
    </div>
    <div class="field-wrap">
      <p class="field-label">Type / Breed</p>
      <p class="field-val">${escHtml(dog.breed) || '—'}</p>
    </div>
    <div class="field-wrap">
      <p class="field-label">Birthday</p>
      <p class="field-val">${dog.birthday ? fmtDateLong(dog.birthday) + (a ? ` (${a})` : '') : '—'}</p>
    </div>
    <div class="field-wrap">
      <p class="field-label">Ideal Weight</p>
      <p class="field-val">${dog.targetWeight ? cvt(dog.targetWeight) + ' ' + unit : '—'}</p>
    </div>
    <div class="field-wrap">
      <p class="field-label">Default Location / Scale</p>
      <p class="field-val">${escHtml(dog.defaultLocation) || '—'}</p>
    </div>
    <div class="field-wrap">
      <p class="field-label">Chart &amp; Stats Start Date</p>
      <p class="field-val">${dog.chartStartDate ? fmtDateLong(dog.chartStartDate) : '— (last 2 years)'}</p>
    </div>`;
}

// ── Toggle edit mode ──────────────────────────
export function toggleEdit() {
  _editMode = !_editMode;

  const editBtn     = document.getElementById('edit-btn');
  const profileView = document.getElementById('profile-view');
  const profileEdit = document.getElementById('profile-edit');

  if (_editMode) {
    editBtn.textContent       = 'Save';
    profileView.style.display = 'none';
    profileEdit.style.display = 'block';
    _populateEditForm();
  } else {
    // Save
    _saveEditForm();
    editBtn.textContent       = 'Edit';
    profileView.style.display = 'block';
    profileEdit.style.display = 'none';
  }
}

function _populateEditForm() {
  const dog  = activeDog();
  if (!dog) return;
  const unit = getUnit();

  const KNOWN_BREEDS = ['Golden Retriever', 'Newfoundland'];
  const isKnown = KNOWN_BREEDS.includes(dog.breed);

  document.getElementById('edit-name').value      = dog.name;
  document.getElementById('edit-breed').value     = isKnown ? dog.breed : 'Other';
  document.getElementById('edit-birthday').value  = dog.birthday || '';
  document.getElementById('edit-goal').value      = dog.targetWeight ? cvt(dog.targetWeight) : '';
  document.getElementById('edit-location').value  = dog.defaultLocation || '';
  document.getElementById('edit-chart-start').value = dog.chartStartDate || '';
  document.getElementById('edit-goal-label').textContent = `Ideal Weight (${unit})`;

  const otherField = document.getElementById('edit-breed-other');
  if (!isKnown) {
    otherField.style.display = 'block';
    otherField.value         = dog.breed === 'Other' ? '' : dog.breed;
  } else {
    otherField.style.display = 'none';
    otherField.value         = '';
  }

  document.getElementById('archive-date-input').value = '';
}

function _saveEditForm() {
  const dog = activeDog();
  if (!dog) return;

  const breedSel   = document.getElementById('edit-breed').value;
  const breedOther = document.getElementById('edit-breed-other').value.trim();
  const goalVal    = parseFloat(document.getElementById('edit-goal').value);

  dog.name            = document.getElementById('edit-name').value.trim()     || dog.name;
  dog.breed           = breedSel === 'Other' ? (breedOther || 'Other') : breedSel;
  dog.birthday        = document.getElementById('edit-birthday').value;
  dog.targetWeight    = goalVal > 0 ? toLbs(goalVal) : null;
  dog.defaultLocation = document.getElementById('edit-location').value.trim();
  dog.chartStartDate  = document.getElementById('edit-chart-start').value || '';

  // Don't save archive date here — only archiveCurrentDog() uses it
  _clearEditFields();

  window.__save?.();
  window.__showToast?.('Profile saved!');

  renderProfile();
  import('./render.js').then(r => r.updateHeaderSub());
}

function _clearEditFields() {
  ['edit-name', 'edit-birthday', 'edit-goal', 'edit-location',
   'edit-breed-other', 'archive-date-input', 'edit-chart-start'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const otherField = document.getElementById('edit-breed-other');
  if (otherField) otherField.style.display = 'none';
  const breedSel = document.getElementById('edit-breed');
  if (breedSel) breedSel.value = 'Golden Retriever';
}

// ── Archive section ───────────────────────────
export function renderArchive() {
  const archived = archivedDogs();
  const list     = document.getElementById('archive-list');
  if (!list) return;

  if (archived.length === 0) {
    list.innerHTML = '<div class="empty">No remembered pets</div>';
    return;
  }

  list.innerHTML = archived.map(d => `
    <div class="archive-item">
      <div>
        <div class="archive-name">${escHtml(d.name)}</div>
        <div class="archive-meta">${escHtml(d.breed)} · ${d.entries.length} entries</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="restore-btn" data-action="restore-dog" data-id="${d.id}">Restore</button>
        <button class="btn-danger-sm" data-action="delete-archived-dog" data-id="${d.id}">Delete</button>
      </div>
    </div>`).join('');
}

// ── Archive current dog ───────────────────────
export function archiveCurrentDog() {
  const dog = activeDog();
  if (!dog) return;

  if (activeDogs().length <= 1) {
    window.__showToast?.('Cannot archive the only pet');
    return;
  }

  const dateStr = document.getElementById('archive-date-input')?.value || '';
  dog.archived  = true;
  if (dateStr) dog.archivedDate = dateStr;

  const state     = getState();
  const remaining = activeDogs().filter(d => d.id !== dog.id);
  state.activeDogId = remaining.length
    ? remaining[0].id
    : (state.dogs.find(d => d.id !== dog.id)?.id ?? null);

  resetEditMode();
  window.__save?.();

  import('./render.js').then(r => r.render());
  window.__showToast?.(dog.name + ' moved to Remembered');
}

// ── Restore dog ───────────────────────────────
export function restoreDog(id) {
  const state = getState();
  const dog   = state.dogs.find(d => d.id === id);
  if (!dog) return;

  dog.archived = false;
  window.__save?.();
  import('./render.js').then(r => r.render());
  window.__showToast?.(dog.name + ' restored!');
}
