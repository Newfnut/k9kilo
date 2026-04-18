// ─────────────────────────────────────────────
//  K9 Kilo v2 — render.js
//  Top-level render(), renderSwitcher(), updateHeaderSub().
//  Imports tab renderers and delegates.
// ─────────────────────────────────────────────

import { getState, activeDog, activeDogs, dogAge, getUnit } from './state.js';
import { escHtml } from './utils.js';
import { renderHome }     from './home.js';
import { renderExpenses } from './expenses.js';
import { renderProfile, resetEditMode } from './profile.js';
import { renderSettings } from './settings.js';

// ── Current tab state ────────────────────────
let _currentTab = 'home';

export function getCurrentTab() { return _currentTab; }

export function switchTab(tab) {
  if (_currentTab === 'profile') resetEditMode();

  _currentTab = tab;

  ['home', 'expenses', 'profile', 'settings'].forEach(t => {
    const screen = document.getElementById('screen-' + t);
    const tabBtn = document.getElementById('tab-' + t);
    if (screen) screen.style.display = t === tab ? 'block' : 'none';
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
  });

  render();
}

// ── Dog switcher ─────────────────────────────
export function renderSwitcher() {
  const state = getState();
  const dogs  = activeDogs();

  const html = dogs.map(d =>
    `<button class="dog-pill ${d.id === state.activeDogId ? 'active' : ''}"
       data-id="${d.id}">
      ${escHtml(d.name)}
    </button>`
  ).join('');

  ['dog-switcher', 'dog-switcher-expenses', 'dog-switcher-profile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

// ── Header sub-bar ────────────────────────────
export function updateHeaderSub() {
  const dog = activeDog();
  const el  = document.getElementById('header-sub');
  if (!el) return;

  if (!dog) { el.textContent = 'Pet Weight Tracker'; return; }

  const age  = dogAge(dog.birthday, null, dog);
  const parts = [
    `<span style="color:var(--orange);-webkit-text-fill-color:var(--orange)">${escHtml(dog.name)}</span>`,
    dog.breed ? escHtml(dog.breed) : null,
    age || null,
  ].filter(Boolean);

  el.innerHTML = parts.join(' · ');
}

// ── Top-level render ─────────────────────────
export function render() {
  renderSwitcher();
  updateHeaderSub();

  if (_currentTab === 'home')     renderHome();
  if (_currentTab === 'expenses') renderExpenses();
  if (_currentTab === 'profile')  renderProfile();
  if (_currentTab === 'settings') renderSettings();
}

// escHtml lives in utils.js
