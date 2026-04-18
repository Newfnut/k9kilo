// ─────────────────────────────────────────────
//  K9 Kilo v2 — home.js
//  Dashboard screen: current weight, chart, stats, history.
// ─────────────────────────────────────────────

import {
  activeDog, sorted, chartEntries,
  cvt, getUnit, fmtDate, fmtDateLong, dogAge,
  getState,
} from './state.js';
import { escHtml } from './utils.js';

// ── Main render ───────────────────────────────
export function renderHome() {
  const dog = activeDog();

  const cardCurrent = document.getElementById('card-current');
  const cardChart   = document.getElementById('card-chart');
  const cardStats   = document.getElementById('card-stats');
  const cardHistory = document.getElementById('card-history');

  if (!dog || sorted(dog).length === 0) {
    if (cardCurrent) cardCurrent.style.display = 'none';
    if (cardChart)   cardChart.style.display   = 'none';
    if (cardStats)   cardStats.style.display   = 'none';
    if (cardHistory) cardHistory.style.display = 'none';
    return;
  }

  // ── Current weight card ──
  if (cardCurrent) cardCurrent.style.display = 'block';
  const s      = sorted(dog);
  const latest = s[s.length - 1];
  const prev   = s[s.length - 2];
  const unit   = getUnit();

  document.getElementById('cur-weight').textContent = cvt(latest.weight);
  document.getElementById('cur-unit').textContent   = ' ' + unit;

  let meta = 'Logged ' + fmtDateLong(latest.date);
  const ageAtEntry = dogAge(dog.birthday, latest.date, dog);
  if (ageAtEntry) meta += ' · Age ' + ageAtEntry;
  if (latest.location) meta += '\n📍 ' + latest.location;
  if (latest.notes)    meta += '\n💬 ' + latest.notes;
  document.getElementById('cur-meta').textContent = meta;

  const badge = document.getElementById('cur-badge');
  if (prev) {
    const diff = latest.weight - prev.weight;
    const abs  = Math.abs(parseFloat(cvt(Math.abs(diff))));
    badge.style.display = 'inline-flex';
    if (Math.abs(diff) < 0.05) {
      badge.className = 'badge same'; badge.textContent = '→ no change';
    } else if (diff > 0) {
      badge.className = 'badge up';   badge.textContent = `↑ ${abs} ${unit}`;
    } else {
      badge.className = 'badge down'; badge.textContent = `↓ ${abs} ${unit}`;
    }
  } else {
    badge.style.display = 'none';
  }

  // ── Chart & Stats ──
  const cEntries = chartEntries(dog);
  if (cEntries.length >= 2) {
    if (cardChart) cardChart.style.display = 'block';
    if (cardStats) cardStats.style.display = 'block';
    const { showAvgLine, showIdealLine } = getState().settings;
    renderChart(cEntries, dog.targetWeight, showAvgLine, showIdealLine);

    const weights = cEntries.map(e => e.weight);
    const avg     = weights.reduce((a, b) => a + b, 0) / weights.length;
    document.getElementById('stat-max').textContent   = cvt(Math.max(...weights));
    document.getElementById('stat-min').textContent   = cvt(Math.min(...weights));
    document.getElementById('stat-avg').textContent   = cvt(avg);
    document.getElementById('stat-max-u').textContent = unit;
    document.getElementById('stat-min-u').textContent = unit;
    document.getElementById('stat-avg-u').textContent = unit;
  } else {
    if (cardChart) cardChart.style.display = 'none';
    if (cardStats) cardStats.style.display = 'none';
  }

  // ── History ──
  if (cardHistory) cardHistory.style.display = 'block';
  renderHistoryList(dog);
}

// ── Chart ─────────────────────────────────────
let _chartData = [];

export function renderChart(displayData, target, showAvg = true, showIdeal = true) {
  _chartData = displayData;
  const W = 360, H = 100;
  const unit   = getUnit();
  const weights = displayData.map(e => e.weight);
  const avg     = weights.reduce((a, b) => a + b, 0) / weights.length;
  // Only include reference lines in Y scale if they are visible
  const allVals = [...weights];
  if (showAvg)   allVals.push(avg);
  if (showIdeal && target) allVals.push(target);
  const minV = Math.min(...allVals) - 2;
  const maxV = Math.max(...allVals) + 2;
  const PAD  = 6;

  const px = i =>
    displayData.length === 1
      ? W / 2
      : (i / (displayData.length - 1)) * (W - PAD * 2) + PAD;

  const py = v => H - ((v - minV) / (maxV - minV)) * (H - 18) - 9;

  const pathD = displayData
    .map((e, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(e.weight)}`)
    .join(' ');
  const areaD = pathD
    + ` L ${px(displayData.length - 1)} ${H} L ${px(0)} ${H} Z`;

  const avgY      = py(avg);
  const targetY   = target ? py(target) : null;

  const avgLine = showAvg ? `
    <line x1="${PAD}" y1="${avgY}" x2="${W - PAD}" y2="${avgY}"
      stroke="#E8621A" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.55"/>
    <text x="${W - PAD - 2}" y="${avgY - 4}" font-size="9" fill="#E8621A"
      text-anchor="end" font-family="-apple-system,sans-serif" opacity="0.75">avg</text>` : '';

  const targetLine = (showIdeal && target) ? `
    <line x1="${PAD}" y1="${targetY}" x2="${W - PAD}" y2="${targetY}"
      stroke="#34C759" stroke-width="1.5" stroke-dasharray="3,4" opacity="0.6"/>
    <text x="${W - PAD - 2}" y="${targetY - 4}" font-size="9" fill="#34C759"
      text-anchor="end" font-family="-apple-system,sans-serif" opacity="0.8">ideal</text>` : '';

  document.getElementById('goal-label').textContent =
    (showIdeal && target) ? `Ideal: ${cvt(target)} ${unit}` : '';

  const DOT_R = 3;
  const hitTargets = displayData
    .map((_, i) => `<circle cx="${px(i)}" cy="${py(_.weight)}" r="16" fill="transparent" class="chart-hit" data-i="${i}" style="cursor:pointer"/>`)
    .join('');
  const dots = displayData
    .map((e, i) => `<circle cx="${px(i)}" cy="${py(e.weight)}" r="${DOT_R}" fill="#E8621A" class="chart-dot" data-i="${i}" style="cursor:pointer;transition:r 0.1s"/>`)
    .join('');

  const svg = document.getElementById('sparkline');
  svg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#E8621A" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#E8621A" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#chartFill)"/>
    <path d="${pathD}" fill="none" stroke="#E8621A" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${avgLine}
    ${targetLine}
    ${hitTargets}
    ${dots}`;

  document.getElementById('chart-start').textContent =
    fmtDate(displayData[0].date).replace(/,.*$/, '');
  document.getElementById('chart-end').textContent =
    fmtDate(displayData[displayData.length - 1].date).replace(/,.*$/, '');

  _attachChartTooltips(svg, displayData, DOT_R);
}

function _attachChartTooltips(svg, displayData, DOT_R) {
  const tooltip = document.getElementById('chart-tooltip');
  const W = 360, H = 100;

  function showTip(i, dotEl) {
    const e    = _chartData[i];
    const unit = getUnit();
    document.getElementById('tt-val').textContent  = cvt(e.weight) + ' ' + unit;
    document.getElementById('tt-date').textContent = fmtDate(e.date);

    const svgRect  = svg.getBoundingClientRect();
    const wrapRect = svg.parentElement.getBoundingClientRect();
    const scaleX   = svgRect.width  / W;
    const scaleY   = svgRect.height / H;
    const dotX     = parseFloat(dotEl.getAttribute('cx'));
    const dotY     = parseFloat(dotEl.getAttribute('cy'));
    const left     = dotX * scaleX + (svgRect.left - wrapRect.left);
    const top      = dotY * scaleY + (svgRect.top  - wrapRect.top);

    tooltip.style.display = 'block';
    tooltip.style.top     = top + 'px';
    tooltip.style.left    = left + 'px';

    const isFirst = i === 0;
    const isLast  = i === _chartData.length - 1;
    if (isFirst)      tooltip.style.transform = 'translate(0%, -110%)';
    else if (isLast)  tooltip.style.transform = 'translate(-100%, -110%)';
    else              tooltip.style.transform = 'translate(-50%, -110%)';

    svg.querySelectorAll('.chart-dot').forEach(d => {
      d.setAttribute('r', String(DOT_R)); d.style.fill = '#E8621A';
    });
    dotEl.setAttribute('r', String(DOT_R + 2));
    dotEl.style.fill = '#FF7D35';
  }

  function hideTip() {
    tooltip.style.display = 'none';
    svg.querySelectorAll('.chart-dot').forEach(d => {
      d.setAttribute('r', String(DOT_R)); d.style.fill = '#E8621A';
    });
  }

  svg.querySelectorAll('.chart-hit, .chart-dot').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const i   = parseInt(el.getAttribute('data-i'));
      const dot = svg.querySelectorAll('.chart-dot')[i];
      if (dot) showTip(i, dot);
    });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('touchstart', ev => {
      ev.preventDefault();
      const i   = parseInt(el.getAttribute('data-i'));
      const dot = svg.querySelectorAll('.chart-dot')[i];
      if (dot) showTip(i, dot);
    }, { passive: false });
    el.addEventListener('touchend', () => setTimeout(hideTip, 1800));
  });
}

// ── History list ──────────────────────────────
export function renderHistoryList(dog) {
  const list = document.getElementById('history-list');
  if (!list) return;

  const s = sorted(dog).reverse();
  if (s.length === 0) {
    list.innerHTML = '<div class="empty">No entries yet</div>';
    return;
  }

  const unit = getUnit();
  list.innerHTML = s.map((e, i) => {
    const ageAt  = dogAge(dog.birthday, e.date, dog);
    let primary  = fmtDate(e.date);
    if (ageAt) primary += ' · ' + ageAt;

    let diffHtml = '';
    if (i < s.length - 1) {
      const prev = s[i + 1];
      const diff = parseFloat(cvt(e.weight)) - parseFloat(cvt(prev.weight));
      const abs  = Math.abs(diff).toFixed(1);
      if (diff > 0)       diffHtml = ` <span class="history-diff-up">▲ +${abs} ${unit}</span>`;
      else if (diff < 0)  diffHtml = ` <span class="history-diff-down">▼ −${abs} ${unit}</span>`;
      else                diffHtml = ` <span class="history-diff-same">— no change</span>`;
    }

    let secondary = '';
    if (e.location) secondary += '📍 ' + e.location;
    if (e.notes)    secondary += (secondary ? '\n' : '') + '💬 ' + e.notes;

    // Find real index in dog.entries for edit/delete
    const realIdx = dog.entries.findIndex(en =>
      en.date === e.date &&
      en.weight === e.weight &&
      (en.notes || '') === (e.notes || '')
    );

    return `<div class="history-item">
      <div style="flex:1;min-width:0">
        <div class="history-weight">${cvt(e.weight)} ${unit}</div>
        <div class="history-meta-primary">${escHtml(primary)}${diffHtml}</div>
        ${secondary ? `<div class="history-meta-secondary" style="white-space:pre-line">${escHtml(secondary)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        <button class="icon-btn" data-action="edit-entry" data-idx="${realIdx}" aria-label="Edit entry">✏️</button>
        <button class="delete-btn" data-action="delete-entry"
          data-date="${escHtml(e.date)}"
          data-weight="${e.weight}"
          data-notes="${escHtml(e.notes || '')}"
          aria-label="Delete entry">×</button>
      </div>
    </div>`;
  }).join('');
}
