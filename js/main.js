// ─────────────────────────────────────────────
//  K9 Kilo v2 — main.js
//  Entry point. Initialises state, wires auth,
//  registers event delegation, kicks off first render.
// ─────────────────────────────────────────────

import { loadLocal, setState, getState, getUnit, setUnit } from './state.js';
import { fbOnAuthStateChanged, fbLoad, fbListen, fbStopListen, fbSignIn, fbSignUp, fbSignOut } from './firebase.js';
import { render, switchTab } from './render.js';
import { applyTheme, settingsSetUnit, settingsSetTheme, exportExpensesCSV } from './settings.js';
import { resetEditMode, toggleEdit } from './profile.js';
import { prevExpenseMonth, nextExpenseMonth } from './expenses.js';
import {
  save, showToast,
  openLogOverlay, closeLogOverlay, addEntry, overlaySetUnit,
  openEditEntry, saveEditEntry, closeEditEntry,
  confirmDeleteEntry,
  openAddDog, closeAddDog, saveNewDog,
  confirmDeletePet, archiveCurrentDog, restoreDog,
  openAddExpense, openEditExpense, saveExpense, closeExpenseOverlay, closeConfirm,
  confirmDeleteExpense, updateExpenseCategoryFields,
  getGPS, toggleBreedOther,
  registerOverlayBackdrops,
} from './overlays.js';

// ── Boot ──────────────────────────────────────
(function init() {
  // 1. Load local state
  const state = loadLocal();
  window.__save      = save;
  window.__showToast = showToast;

  // 2. Seed unit from settings
  setUnit(state.settings?.defaultUnit || 'lbs');

  // 3. Apply theme immediately (before render to avoid flash)
  applyTheme(state.settings?.theme || 'dark');

  // 4. Register overlay backdrops
  registerOverlayBackdrops();

  // 5. Register event delegation (single listener on document)
  _registerEvents();

  // 6. Auth state observer — handles login/logout UI
  fbOnAuthStateChanged(user => {
    window.__currentUser = user || null;

    if (user) {
      document.getElementById('auth-overlay').style.display = 'none';
      document.getElementById('app-root').style.display     = 'block';
      _onLogin(user);
    } else {
      fbStopListen();
      document.getElementById('auth-overlay').style.display = 'flex';
      document.getElementById('app-root').style.display     = 'none';
    }
  });
})();

// ── Login handler ─────────────────────────────
async function _onLogin(user) {
  const localState = getState();

  try {
    const cloudState = await fbLoad(user.uid);

    if (cloudState) {
      // If expenses doc didn't exist yet, keep local expenses
      if (cloudState.expenses === null) {
        cloudState.expenses = localState.expenses || [];
      }
      // Preserve settings (local-only)
      cloudState.settings = localState.settings || { defaultUnit: 'lbs', theme: 'dark' };

      setState(cloudState);
      // Re-seed unit from settings
      setUnit(cloudState.settings?.defaultUnit || 'lbs');
    }
  } catch (e) {
    console.warn('Login cloud load failed:', e);
  }

  render();

  // Start live listener for real-time expense sync
  fbListen(user.uid, incomingList => {
    const state    = getState();
    const incoming = JSON.stringify(incomingList);
    const current  = JSON.stringify(state.expenses);
    if (incoming === current) return; // our own save — skip
    state.expenses = incomingList;
    render();
  });
}

// ── Auth UI ───────────────────────────────────

let _authMode = 'login';

function authSwitchTab(mode) {
  _authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').textContent = '';
}

function authSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; return; }

  const fn = _authMode === 'login' ? fbSignIn : fbSignUp;
  fn(email, password).catch(e => { errEl.textContent = _authError(e.code); });
}

function _authError(code) {
  return ({
    'auth/user-not-found':       'No account with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/weak-password':        'Password must be 6+ characters.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
  })[code] || 'An error occurred.';
}

// ── Event delegation ──────────────────────────
function _registerEvents() {
  // Tab switching
  document.getElementById('tab-home')?.addEventListener('click', () => switchTab('home'));
  document.getElementById('tab-expenses')?.addEventListener('click', () => switchTab('expenses'));
  document.getElementById('tab-profile')?.addEventListener('click', () => switchTab('profile'));
  document.getElementById('tab-settings')?.addEventListener('click', () => switchTab('settings'));

  // Dog switcher pills (delegated — pills are rendered dynamically)
  document.addEventListener('click', e => {
    const pill = e.target.closest('.dog-pill');
    if (pill) {
      const id = parseInt(pill.dataset.id);
      if (!isNaN(id)) {
        resetEditMode();
        getState().activeDogId = id;
        save();
        render();
      }
    }
  });

  // Dashboard actions (delegated)
  document.getElementById('log-weight-btn')?.addEventListener('click', openLogOverlay);

  document.addEventListener('click', e => {
    // Edit entry
    const editBtn = e.target.closest('[data-action="edit-entry"]');
    if (editBtn) {
      openEditEntry(parseInt(editBtn.dataset.idx));
      return;
    }
    // Delete entry
    const delEntryBtn = e.target.closest('[data-action="delete-entry"]');
    if (delEntryBtn) {
      confirmDeleteEntry(
        delEntryBtn.dataset.date,
        delEntryBtn.dataset.weight,
        delEntryBtn.dataset.notes
      );
      return;
    }
    // Edit expense
    const editExpBtn = e.target.closest('[data-action="edit-expense"]');
    if (editExpBtn) { openEditExpense(editExpBtn.dataset.id); return; }
    // Delete expense
    const delExpBtn = e.target.closest('[data-action="delete-expense"]');
    if (delExpBtn) { confirmDeleteExpense(delExpBtn.dataset.id); return; }
    // Restore dog
    const restoreBtn = e.target.closest('[data-action="restore-dog"]');
    if (restoreBtn) { restoreDog(parseInt(restoreBtn.dataset.id)); return; }
    // Delete archived dog
    const delDogBtn = e.target.closest('[data-action="delete-archived-dog"]');
    if (delDogBtn) { confirmDeletePet(parseInt(delDogBtn.dataset.id)); return; }
  });

  // Log weight overlay
  document.getElementById('log-cancel-btn')?.addEventListener('click', closeLogOverlay);
  document.getElementById('log-save-btn')?.addEventListener('click', addEntry);
  document.getElementById('btn-lbs-overlay')?.addEventListener('click', () => overlaySetUnit('lbs'));
  document.getElementById('btn-kg-overlay')?.addEventListener('click', () => overlaySetUnit('kg'));
  document.getElementById('gps-btn')?.setAttribute('data-gps-target', 'input-location');
  document.getElementById('gps-btn')?.addEventListener('click', () => getGPS('input-location'));

  // Edit entry overlay
  document.getElementById('ee-cancel-btn')?.addEventListener('click', closeEditEntry);
  document.getElementById('ee-save-btn')?.addEventListener('click', saveEditEntry);
  document.getElementById('ee-btn-lbs')?.addEventListener('click', () => overlaySetUnit('lbs'));
  document.getElementById('ee-btn-kg')?.addEventListener('click', () => overlaySetUnit('kg'));
  document.getElementById('ee-gps-btn')?.setAttribute('data-gps-target', 'ee-location');
  document.getElementById('ee-gps-btn')?.addEventListener('click', () => getGPS('ee-location'));

  // Confirm overlay
  document.getElementById('confirm-cancel-btn')?.addEventListener('click', closeConfirm);

  // Add pet overlay
  document.getElementById('add-dog-btn')?.addEventListener('click', openAddDog);
  document.getElementById('adddog-cancel-btn')?.addEventListener('click', closeAddDog);
  document.getElementById('adddog-save-btn')?.addEventListener('click', saveNewDog);
  document.getElementById('newdog-breed')?.addEventListener('change', () =>
    toggleBreedOther('newdog-breed', 'newdog-breed-other')
  );

  // Profile actions
  document.getElementById('edit-btn')?.addEventListener('click', toggleEdit);
  document.getElementById('archive-btn')?.addEventListener('click', archiveCurrentDog);
  document.getElementById('delete-pet-btn')?.addEventListener('click', () => confirmDeletePet());
  document.getElementById('edit-breed')?.addEventListener('change', () =>
    toggleBreedOther('edit-breed', 'edit-breed-other')
  );

  // Expense screen
  document.getElementById('log-expense-btn')?.addEventListener('click', openAddExpense);
  document.getElementById('exp-prev-btn')?.addEventListener('click', prevExpenseMonth);
  document.getElementById('exp-next-btn')?.addEventListener('click', nextExpenseMonth);
  document.getElementById('exp-category')?.addEventListener('change', updateExpenseCategoryFields);
  document.getElementById('exp-cancel-btn')?.addEventListener('click', closeExpenseOverlay);
  document.getElementById('exp-save-btn')?.addEventListener('click', saveExpense);

  // Settings
  document.getElementById('settings-btn-lbs')?.addEventListener('click', () => settingsSetUnit('lbs'));
  document.getElementById('settings-btn-kg')?.addEventListener('click', () => settingsSetUnit('kg'));
  document.getElementById('settings-btn-dark')?.addEventListener('click', () => settingsSetTheme('dark'));
  document.getElementById('settings-btn-light')?.addEventListener('click', () => settingsSetTheme('light'));
  document.getElementById('settings-signout-btn')?.addEventListener('click', () => fbSignOut());
  document.getElementById('export-csv-btn')?.addEventListener('click', exportExpensesCSV);

  // Auth
  document.getElementById('auth-tab-login')?.addEventListener('click', () => authSwitchTab('login'));
  document.getElementById('auth-tab-signup')?.addEventListener('click', () => authSwitchTab('signup'));
  document.getElementById('auth-submit-btn')?.addEventListener('click', authSubmit);
  document.getElementById('auth-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') authSubmit();
  });
}
