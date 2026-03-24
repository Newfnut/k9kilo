const STORAGE_KEY = 'k9kilo_v1';

function defaultState() {
  return { activeDogId: null, dogs: [], expenses: [] };
}

function load() { try { const s=JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState(); if(!s.expenses) s.expenses=[]; return s; } catch(e) { return defaultState(); } }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  window._state = state;
  if (window._currentUser && window._fbSave) window._fbSave(state);
}
window._onLogin = function(user) {
  if (window._fbLoad) {
    window._fbLoad(user.uid).then(cloudState => {
      if (cloudState) {
        if (cloudState.expenses === null) cloudState.expenses = state.expenses || [];
        state = cloudState;
        window._state = state;
        nextId = state.dogs.length ? Math.max(...state.dogs.map(d=>d.id))+1 : 1;
      }
      render();
      if (window._fbListen) window._fbListen(user.uid);
    });
  } else { render(); }
};

let state = load();
window._state = state;
let unit = 'lbs';
let currentTab = 'home';
let editMode = false;
let pendingDelete = null;
let editEntryIdx = null;
let nextId = state.dogs.length ? Math.max(...state.dogs.map(d=>d.id)) + 1 : 1;

let expenseEditId = null;
let expenseViewMonth = null;

function activeDog() { return state.dogs.find(d => d.id === state.activeDogId); }
function activeDogs() { return state.dogs.filter(d => !d.archived); }
function archivedDogs() { return state.dogs.filter(d => d.archived); }
function sorted(dog) { return [...(dog||activeDog()).entries].sort((a,b)=>new Date(a.date)-new Date(b.date)); }

function cvt(lbs) { return unit==='kg' ? (lbs*0.453592).toFixed(1) : parseFloat(lbs).toFixed(1); }
function fmtDate(d) { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function fmtDateLong(d) { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); }
function fmtMoney(n) { const v=parseFloat(n)||0; return (v<0?'-$':'$')+Math.abs(v).toFixed(2); }

function dogAge(birthday, atDate, dog) {
  if (!birthday) return null;
  let capDate = atDate;
  if (!capDate && dog && dog.archived && dog.archivedDate) capDate = dog.archivedDate;
  const from = new Date(birthday+'T12:00:00'), to = capDate ? new Date(capDate+'T12:00:00') : new Date();
  let years = to.getFullYear()-from.getFullYear();
  let months = to.getMonth()-from.getMonth();
  if (to.getDate() < from.getDate()) months--;
  if (months<0){years--;months+=12;}
  if(years<0)return null;
  if(years===0)return months+'mo'; if(months===0)return years+'y'; return years+'y '+months+'mo';
}

function showToast(msg) {
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

function setUnit(u) {
  unit=u;
  document.getElementById('btn-lbs').classList.toggle('active',u==='lbs');
  document.getElementById('btn-kg').classList.toggle('active',u==='kg');
  render();
}

function updateHeaderSub() {
  const dog=activeDog();
  if(!dog){ document.getElementById('header-sub').textContent=''; return; }
  const a=dogAge(dog.birthday,null,dog);
  document.getElementById('header-sub').textContent=dog.name+' · '+dog.breed+(a?' · '+a:'');
}

function switchTab(tab) {
  if(editMode && currentTab==='profile') {
    editMode=false;
    document.getElementById('edit-btn').textContent='Edit';
    document.getElementById('profile-view').style.display='block';
    document.getElementById('profile-edit').style.display='none';
  }
  currentTab=tab;
  ['home','log','expenses','profile'].forEach(t=>{
    document.getElementById('screen-'+t).style.display=t===tab?'block':'none';
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
  });
  render();
}

function render() {
  updateHeaderSub();
  if(currentTab==='home') renderHome();
  if(currentTab==='log') renderLog();
  if(currentTab==='expenses') renderExpenses();
  if(currentTab==='profile') renderProfile();
}

function renderSwitcher() {
  const dogs=activeDogs();
  const html=dogs.map(d=>
    `<button class="dog-pill ${d.id===state.activeDogId?'active':''}" onclick="selectDog(${d.id})">${d.name}</button>`
  ).join('');
  ['dog-switcher','dog-switcher-log','dog-switcher-profile'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=html;
  });
}

function selectDog(id){
  if(editMode) {
    editMode=false;
    document.getElementById('edit-btn').textContent='Edit';
    document.getElementById('profile-view').style.display='block';
    document.getElementById('profile-edit').style.display='none';
  }
  state.activeDogId=id;
  save();
  render();
}

function renderHome() {
  renderSwitcher();
  updateHeaderSub();
  const dog=activeDog(); if(!dog)return;
  const s=sorted(dog);

  if(s.length===0){
    document.getElementById('card-current').style.display='none';
    document.getElementById('card-chart').style.display='none';
    document.getElementById('card-stats').style.display='none';
    document.getElementById('card-history').style.display='none';
    return;
  }
  document.getElementById('card-current').style.display='block';

  const latest=s[s.length-1], prev=s[s.length-2];
  const ageAtEntry=dogAge(dog.birthday,latest.date,dog);
  document.getElementById('cur-weight').textContent=cvt(latest.weight);
  document.getElementById('cur-unit').textContent=' '+unit;
  let meta='Logged '+fmtDateLong(latest.date);
  if(ageAtEntry) meta+=' · Age '+ageAtEntry;
  if(latest.location) meta+='\n📍 '+latest.location;
  if(latest.notes) meta+='\n💬 '+latest.notes;
  document.getElementById('cur-meta').textContent=meta;

  const badge=document.getElementById('cur-badge');
  if(prev){
    const diff=latest.weight-prev.weight; badge.style.display='inline-flex';
    const abs=Math.abs(parseFloat(cvt(Math.abs(diff))));
    if(Math.abs(diff)<0.05){badge.className='badge same';badge.textContent='→ no change';}
    else if(diff>0){badge.className='badge up';badge.textContent='↑ '+abs+' '+unit;}
    else{badge.className='badge down';badge.textContent='↓ '+abs+' '+unit;}
  } else {badge.style.display='none';}

  if(s.length>=2){
    document.getElementById('card-chart').style.display='block';
    document.getElementById('card-stats').style.display='block';
    renderChart(s,dog.targetWeight);
    const twoYearsAgo2 = new Date(); twoYearsAgo2.setFullYear(twoYearsAgo2.getFullYear()-2);
    const sFiltered = s.filter(e=>new Date(e.date+'T12:00:00')>=twoYearsAgo2);
    const statsData = sFiltered.length>=1 ? sFiltered : s;
    const weights=statsData.map(e=>e.weight);
    document.getElementById('stat-max').textContent=cvt(Math.max(...weights));
    document.getElementById('stat-min').textContent=cvt(Math.min(...weights));
    document.getElementById('stat-max-u').textContent=unit;
    document.getElementById('stat-min-u').textContent=unit;
    const avg=statsData.map(e=>e.weight).reduce((a,b)=>a+b,0)/statsData.length;
    document.getElementById('stat-count').textContent=cvt(avg);
    document.getElementById('stat-count-u').textContent=unit;
  } else {
    document.getElementById('card-chart').style.display='none';
    document.getElementById('card-stats').style.display='none';
  }

  document.getElementById('card-history').style.display='block';
  renderHistoryList(dog);
}

let chartData = [];

function renderChart(s, target) {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const filtered = s.filter(e => new Date(e.date + 'T12:00:00') >= twoYearsAgo);
  const displayData = filtered.length >= 2 ? filtered : s;
  chartData = displayData;
  const W=280,H=90;
  const weights=displayData.map(e=>e.weight);
  const allVals=target?[...weights,target]:weights;
  const minV=Math.min(...allVals)-2, maxV=Math.max(...allVals)+2;
  const PAD=4;
  const px=i=>(displayData.length===1)?W/2:(i/(displayData.length-1))*(W-PAD*2)+PAD;
  const py=v=>H-((v-minV)/(maxV-minV))*(H-20)-10;
  const pathD=displayData.map((e,i)=>(i===0?'M':'L')+' '+px(i)+' '+py(e.weight)).join(' ');
  const areaD=pathD+' L '+px(displayData.length-1)+' '+H+' L '+px(0)+' '+H+' Z';
  let targetLine='';
  if(target){
    const ty=py(target);
    targetLine=`<line x1="${PAD}" y1="${ty}" x2="${W-PAD}" y2="${ty}" stroke="#E8621A" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>
    <text x="${W-PAD-2}" y="${ty-4}" font-size="9" fill="#E8621A" text-anchor="end" font-family="-apple-system,sans-serif" opacity="0.8">ideal</text>`;
    document.getElementById('goal-label').textContent='Ideal: '+cvt(target)+' '+unit;
  } else {document.getElementById('goal-label').textContent='';}

  const DOT_R=3;
  const hitTargets=displayData.map((e,i)=>`<circle cx="${px(i)}" cy="${py(e.weight)}" r="16" fill="transparent" class="chart-hit" data-i="${i}" style="cursor:pointer"/>`).join('');
  const dots=displayData.map((e,i)=>`<circle cx="${px(i)}" cy="${py(e.weight)}" r="${DOT_R}" fill="#E8621A" stroke="none" class="chart-dot" data-i="${i}" style="cursor:pointer;transition:r 0.1s"/>`).join('');

  document.getElementById('sparkline').innerHTML=`
    <defs>
      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E8621A" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#E8621A" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#fill)"/>
    <path d="${pathD}" fill="none" stroke="#E8621A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${targetLine}
    ${hitTargets}
    ${dots}`;

  document.getElementById('chart-start').textContent=fmtDate(displayData[0].date).replace(/,.*$/,'');
  document.getElementById('chart-end').textContent=fmtDate(displayData[displayData.length-1].date).replace(/,.*$/,'');

  const svg=document.getElementById('sparkline');
  const tooltip=document.getElementById('chart-tooltip');

  function showTip(i, svgEl) {
    const e=chartData[i];
    document.getElementById('tt-val').textContent=cvt(e.weight)+' '+unit;
    document.getElementById('tt-date').textContent=fmtDate(e.date);
    const wrap=svg.parentElement;
    const svgRect=svg.getBoundingClientRect();
    const wrapRect=wrap.getBoundingClientRect();
    const dotX=parseFloat(svgEl.getAttribute('cx'));
    const dotY=parseFloat(svgEl.getAttribute('cy'));
    const scaleX=svgRect.width/W;
    const scaleY=svgRect.height/H;
    const left=(dotX*scaleX)+(svgRect.left-wrapRect.left);
    const top=(dotY*scaleY)+(svgRect.top-wrapRect.top);
    tooltip.style.display='block';
    tooltip.style.top=top+'px';
    const isFirst = i === 0;
    const isLast  = i === chartData.length - 1;
    if (isFirst) {
      tooltip.style.left = left + 'px';
      tooltip.style.transform = 'translate(0%, -110%)';
    } else if (isLast) {
      tooltip.style.left = left + 'px';
      tooltip.style.transform = 'translate(-100%, -110%)';
    } else {
      tooltip.style.left = left + 'px';
      tooltip.style.transform = 'translate(-50%, -110%)';
    }
    svg.querySelectorAll('.chart-dot').forEach(d=>{ d.setAttribute('r',String(DOT_R)); d.style.fill='#E8621A'; });
    svgEl.setAttribute('r',String(DOT_R+2));
    svgEl.style.fill='#FF7D35';
  }

  function hideTip() {
    tooltip.style.display='none';
    svg.querySelectorAll('.chart-dot').forEach(d=>{ d.setAttribute('r',String(DOT_R)); d.style.fill='#E8621A'; });
  }

  svg.querySelectorAll('.chart-hit, .chart-dot').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const i=parseInt(el.getAttribute('data-i'));
      const dot=svg.querySelectorAll('.chart-dot')[i];
      showTip(i, dot);
    });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      const i=parseInt(el.getAttribute('data-i'));
      const dot=svg.querySelectorAll('.chart-dot')[i];
      showTip(i, dot);
    }, {passive:false});
    el.addEventListener('touchend', () => setTimeout(hideTip, 1800));
  });
}

function renderHistoryList(dog) {
  const s=sorted(dog).reverse();
  const list=document.getElementById('history-list');
  if(!list)return;
  if(s.length===0){list.innerHTML='<div class="empty">No entries yet</div>';return;}
  list.innerHTML=s.map((e,i)=>{
    const ageAt=dogAge(dog.birthday,e.date,dog);
    let primary=fmtDate(e.date);
    if(ageAt) primary+=' · '+ageAt;
    let diffHtml='';
    if(i<s.length-1){
      const prev=s[i+1];
      const diff=cvt(e.weight)-cvt(prev.weight);
      const absDiff=Math.abs(diff).toFixed(1);
      if(diff>0) diffHtml=` <span class="history-diff-up">▲ +${absDiff} ${unit}</span>`;
      else if(diff<0) diffHtml=` <span class="history-diff-down">▼ −${absDiff} ${unit}</span>`;
      else diffHtml=` <span class="history-diff-same">— no change</span>`;
    }
    let secondary='';
    if(e.location) secondary+='📍 '+e.location;
    if(e.notes) secondary+=(secondary?'\n':'')+'💬 '+e.notes;
    const realIdx=dog.entries.findIndex(en=>en.date===e.date&&en.weight===e.weight&&(en.notes||'')===(e.notes||''));
    return `<div class="history-item">
      <div style="flex:1;min-width:0">
        <div class="history-weight">${cvt(e.weight)} ${unit}</div>
        <div class="history-meta-primary">${primary}${diffHtml}</div>
        ${secondary?`<div class="history-meta-secondary" style="white-space:pre-line">${secondary}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        <button style="background:none;border:none;color:rgba(232,98,26,0.6);font-size:15px;cursor:pointer;padding:4px 6px;border-radius:8px" onclick="openEditEntry(${realIdx})">✏️</button>
        <button class="delete-btn" onclick="confirmDelete('${e.date}',${e.weight},'${(e.notes||'').replace(/'/g,"\\'")}')">×</button>
      </div>
    </div>`;
  }).join('');
}

function renderLog() {
  renderSwitcher();
  updateHeaderSub();
  const dog=activeDog();
  document.getElementById('input-weight-label').textContent='Weight ('+unit+')';
  document.getElementById('input-weight').placeholder=unit==='lbs'?'62.5':'28.3';
  if(dog&&dog.defaultLocation&&!document.getElementById('input-location').value)
    document.getElementById('input-location').placeholder=dog.defaultLocation;
  if(dog) renderHistoryList(dog);
}

function addEntry() {
  const w=parseFloat(document.getElementById('input-weight').value);
  const d=document.getElementById('input-date').value;
  if(!w||w<=0||!d){showToast('Please enter a weight and date');return;}
  const wLbs=unit==='kg'?w/0.453592:w;
  const dog=activeDog();
  dog.entries.push({date:d,weight:parseFloat(wLbs.toFixed(1)),location:document.getElementById('input-location').value.trim(),notes:document.getElementById('input-notes').value.trim()});
  save();
  document.getElementById('input-weight').value='';
  document.getElementById('input-notes').value='';
  document.getElementById('input-location').value='';
  showToast('Weight logged! 🐾');
  renderLog();
}

function confirmDelete(date,weight,notes){
  pendingDelete={date,weight};
  document.getElementById('confirm-title').textContent='Delete this entry?';
  document.getElementById('confirm-sub').textContent=cvt(weight)+' '+unit+' · '+fmtDate(date)+(notes?'\n"'+notes+'"':'');
  document.getElementById('confirm-ok').textContent='Delete';
  document.getElementById('confirm-ok').onclick=()=>{doDelete();closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('show');
}
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('show');pendingDelete=null;}
function doDelete(){
  if(!pendingDelete)return;
  const dog=activeDog();
  dog.entries=dog.entries.filter(e=>!(e.date===pendingDelete.date&&e.weight===pendingDelete.weight));
  save();renderLog();if(currentTab==='home')renderHome();showToast('Entry deleted');
}

function openEditEntry(idx){
  const dog=activeDog(); const e=dog.entries[idx]; if(!e)return;
  editEntryIdx=idx;
  document.getElementById('ee-date').value=e.date;
  document.getElementById('ee-weight').value=cvt(e.weight);
  document.getElementById('ee-weight-label').textContent='Weight ('+unit+')';
  document.getElementById('ee-location').value=e.location||'';
  document.getElementById('ee-notes').value=e.notes||'';
  document.getElementById('editentry-overlay').classList.add('show');
}
function closeEditEntry(){document.getElementById('editentry-overlay').classList.remove('show');editEntryIdx=null;}
function saveEditEntry(){
  const dog=activeDog(); if(editEntryIdx===null||!dog.entries[editEntryIdx])return;
  const w=parseFloat(document.getElementById('ee-weight').value);
  const d=document.getElementById('ee-date').value;
  if(!w||w<=0||!d){showToast('Please enter a weight and date');return;}
  const wLbs=unit==='kg'?w/0.453592:w;
  dog.entries[editEntryIdx]={date:d,weight:parseFloat(wLbs.toFixed(1)),location:document.getElementById('ee-location').value.trim(),notes:document.getElementById('ee-notes').value.trim()};
  save();closeEditEntry();renderLog();if(currentTab==='home')renderHome();showToast('Entry updated ✓');
}

function renderProfile(){
  renderSwitcher();
  updateHeaderSub();
  const dog=activeDog(); if(!dog)return;
  const a=dogAge(dog.birthday,null,dog);
  document.getElementById('profile-view').innerHTML=`
    <div class="field-wrap"><p class="field-label">Name</p><p class="field-val">${dog.name}</p></div>
    <div class="field-wrap"><p class="field-label">Type / Breed</p><p class="field-val">${dog.breed}</p></div>
    <div class="field-wrap"><p class="field-label">Birthday</p><p class="field-val">${dog.birthday?fmtDateLong(dog.birthday)+(a?' ('+a+')':''):'—'}</p></div>
    <div class="field-wrap"><p class="field-label">Ideal Weight</p><p class="field-val">${dog.targetWeight?cvt(dog.targetWeight)+' '+unit:'—'}</p></div>
    <div class="field-wrap"><p class="field-label">Default Location / Scale</p><p class="field-val">${dog.defaultLocation||'—'}</p></div>`;
  renderArchive();
}

function toggleEdit(){
  editMode=!editMode;
  document.getElementById('edit-btn').textContent=editMode?'Save':'Edit';
  document.getElementById('profile-view').style.display=editMode?'none':'block';
  document.getElementById('profile-edit').style.display=editMode?'block':'none';

  const dog=activeDog();
  if(!dog) return;

  if(editMode){
    const knownBreeds=['Golden Retriever','Newfoundland'];
    const isKnown=knownBreeds.includes(dog.breed);
    document.getElementById('edit-breed').value=isKnown?dog.breed:'Other';
    const otherField=document.getElementById('edit-breed-other');
    if(!isKnown){otherField.style.display='block';otherField.value=dog.breed==='Other'?'':dog.breed;}
    else{otherField.style.display='none';otherField.value='';}
    document.getElementById('edit-name').value=dog.name;
    document.getElementById('edit-birthday').value=dog.birthday||'';
    document.getElementById('edit-goal').value=dog.targetWeight?cvt(dog.targetWeight):'';
    document.getElementById('edit-location').value=dog.defaultLocation||'';
    document.getElementById('edit-goal-label').textContent='Ideal Weight ('+unit+')';
    document.getElementById('archive-date-input').value='';
  } else {
    const breedSel=document.getElementById('edit-breed').value;
    const breedOther=document.getElementById('edit-breed-other').value.trim();
    const goalVal=parseFloat(document.getElementById('edit-goal').value);
    dog.name=document.getElementById('edit-name').value.trim()||dog.name;
    dog.breed=breedSel==='Other'?(breedOther||'Other'):breedSel;
    dog.birthday=document.getElementById('edit-birthday').value;
    dog.targetWeight=goalVal?(unit==='kg'?goalVal/0.453592:goalVal):null;
    dog.defaultLocation=document.getElementById('edit-location').value.trim();
    save();
    clearEditFields();
    showToast('Profile saved!');
    renderProfile();
    renderHome();
  }
}

function clearEditFields() {
  document.getElementById('edit-name').value='';
  document.getElementById('edit-birthday').value='';
  document.getElementById('edit-goal').value='';
  document.getElementById('edit-location').value='';
  document.getElementById('edit-breed-other').value='';
  document.getElementById('edit-breed-other').style.display='none';
  document.getElementById('edit-breed').value='Golden Retriever';
  document.getElementById('archive-date-input').value='';
}

function renderArchive(){
  const archived=archivedDogs();
  const list=document.getElementById('archive-list');
  if(archived.length===0){list.innerHTML='<div class="empty">No remembered pets</div>';return;}
  list.innerHTML=archived.map(d=>`
    <div class="archive-item">
      <div><div class="archive-name">${d.name}</div><div class="archive-meta">${d.breed} · ${d.entries.length} entries</div></div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="restore-btn" onclick="restoreDog(${d.id})">Restore</button>
        <button style="background:var(--red-pale);color:var(--red);border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer" onclick="confirmDeletePet(${d.id})">Delete</button>
      </div>
    </div>`).join('');
}

function archiveCurrentDog(){
  const dog=activeDog(); if(!dog)return;
  if(activeDogs().length<=1){showToast('Cannot archive the only pet');return;}
  const dateStr=document.getElementById('archive-date-input')?.value||'';
  dog.archived=true;
  if(dateStr) dog.archivedDate=dateStr;
  const remaining=activeDogs().filter(d=>d.id!==dog.id);
  state.activeDogId=remaining.length?remaining[0].id:state.dogs.find(d=>d.id!==dog.id)?.id;
  editMode=false;
  document.getElementById('edit-btn').textContent='Edit';
  document.getElementById('profile-view').style.display='block';
  document.getElementById('profile-edit').style.display='none';
  clearEditFields();
  save();renderSwitcher();render();showToast(dog.name+' moved to Remembered');
}

function restoreDog(id){
  const dog=state.dogs.find(d=>d.id===id);
  if(dog){dog.archived=false;save();renderSwitcher();renderProfile();showToast(dog.name+' restored!');}
}

function confirmDeletePet(id){
  const targetId=id!==undefined?id:state.activeDogId;
  const dog=state.dogs.find(d=>d.id===targetId); if(!dog)return;
  document.getElementById('confirm-title').textContent='Delete '+dog.name+'?';
  document.getElementById('confirm-sub').textContent='This will permanently delete '+dog.name+' and all '+dog.entries.length+' weight entries.\n\nThis cannot be undone.';
  document.getElementById('confirm-ok').textContent='Delete Forever';
  document.getElementById('confirm-ok').onclick=()=>{doDeletePet(targetId);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('show');
}

function doDeletePet(id){
  const dog=state.dogs.find(d=>d.id===id); const name=dog?dog.name:'Pet';
  const dogName=dog?dog.name:null;
  state.dogs=state.dogs.filter(d=>d.id!==id);
  if(state.activeDogId===id){const rem=activeDogs();state.activeDogId=rem.length?rem[0].id:(state.dogs.length?state.dogs[0].id:-1);}
  if(editMode) {
    editMode=false;
    document.getElementById('edit-btn').textContent='Edit';
    document.getElementById('profile-view').style.display='block';
    document.getElementById('profile-edit').style.display='none';
    clearEditFields();
  }
  save();
  if(dogName && window._fbDeleteDog) window._fbDeleteDog(dogName);
  renderSwitcher();render();showToast(name+' deleted');
}

function toggleBreedOther(selectId,otherId){
  const sel=document.getElementById(selectId),other=document.getElementById(otherId);
  other.style.display=sel.value==='Other'?'block':'none';
  if(sel.value==='Other')other.focus();
}

function addNewDog(){document.getElementById('adddog-overlay').classList.add('show');}
function closeAddDog(){document.getElementById('adddog-overlay').classList.remove('show');}
function saveNewDog(){
  const name=document.getElementById('newdog-name').value.trim();
  if(!name){showToast('Please enter a name');return;}
  const breedSel=document.getElementById('newdog-breed').value;
  const breedOther=document.getElementById('newdog-breed-other').value.trim();
  const breed=breedSel==='Other'?(breedOther||'Other'):breedSel;
  state.dogs.push({id:nextId++,name,breed,birthday:document.getElementById('newdog-birthday').value,targetWeight:null,defaultLocation:'',archived:false,entries:[]});
  state.activeDogId=state.dogs[state.dogs.length-1].id;
  save();closeAddDog();
  document.getElementById('newdog-name').value='';
  document.getElementById('newdog-birthday').value='';
  document.getElementById('newdog-breed-other').value='';
  document.getElementById('newdog-breed-other').style.display='none';
  document.getElementById('newdog-breed').value='Golden Retriever';
  switchTab('home');showToast(name+' added! 🐾');
}

function getGPS(targetId) {
  const btn=document.getElementById('gps-btn')||document.querySelector('[onclick*="getGPS"]');
  const inp=document.getElementById(targetId);
  if(!inp)return;
  if(!navigator.geolocation){showToast('GPS not supported');return;}
  const origText=(btn&&btn.textContent)||'📍';
  if(btn){btn.textContent='⏳';btn.disabled=true;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude:lat,longitude:lon}=pos.coords;
    try{
      const queries=[
        `[out:json][timeout:10];node(around:200,${lat},${lon})[amenity=veterinary];out 1;`,
        `[out:json][timeout:10];node(around:200,${lat},${lon})[shop=pet];out 1;`
      ];
      let found=null;
      for(const q of queries){
        const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q)});
        const j=await r.json();
        if(j.elements&&j.elements.length>0){
          const el=j.elements[0];
          found=el.tags&&(el.tags.name||el.tags['addr:full'])||null;
          if(found)break;
        }
      }
      if(found){
        inp.value=found;
      } else {
        const gr=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`);
        const gj=await gr.json();
        inp.value=gj.display_name?gj.display_name.split(',').slice(0,2).join(', '):`${lat.toFixed(5)},${lon.toFixed(5)}`;
      }
    }catch(e){inp.value=`${lat.toFixed(5)},${lon.toFixed(5)}`;}
    if(btn){btn.textContent=origText;btn.disabled=false;}
  },err=>{
    showToast('Location error: '+err.message);
    if(btn){btn.textContent=origText;btn.disabled=false;}
  },{timeout:10000});
}

function tryAutoGPS(){const loc=document.getElementById('input-location');if(!loc.value&&navigator.geolocation)getGPS('input-location');}

// ══════════════════════════════════════════════
//  EXPENSES — Redesigned
// ══════════════════════════════════════════════

// Category definitions with icon, subfields, and display config
const EXP_CATEGORIES = [
  { key: 'Food',          icon: '🍖', label: 'Food',          fields: ['type','where'] },
  { key: 'Vegetables',    icon: '🥦', label: 'Vegetables',    fields: ['where'] },
  { key: 'Supplements',   icon: '🌿', label: 'Supplements',   fields: ['kind'] },
  { key: 'Pet Insurance', icon: '🛡️', label: 'Pet Insurance', fields: [] },
  { key: 'Veterinary',    icon: '🏥', label: 'Veterinary',    fields: ['reimbursement'] },
];

const EXP_CAT_MAP = {};
EXP_CATEGORIES.forEach(c => { EXP_CAT_MAP[c.key] = c; });

function expCatIcon(key) { return EXP_CAT_MAP[key]?.icon || '💰'; }
function expCatLabel(key) { return EXP_CAT_MAP[key]?.label || key; }

// Net amount for display (bill - reimbursement)
function expNetAmount(exp) {
  const bill = parseFloat(exp.amount) || 0;
  const reimb = parseFloat(exp.reimbursement) || 0;
  return bill - reimb;
}

function expenseEffectiveAmountForDog(exp, dogId) {
  const net = expNetAmount(exp);
  if (exp.splitDogIds && exp.splitDogIds.length > 0) {
    if (exp.splitDogIds.includes(dogId)) return net / exp.splitDogIds.length;
    return 0;
  }
  if (exp.shared) {
    const numActive = activeDogs().length || 1;
    return net / numActive;
  }
  if (exp.dogId === dogId) return net;
  return 0;
}

function getViewMonthKey() {
  if (expenseViewMonth) return expenseViewMonth;
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
}

function expensesForMonth(monthKey) {
  return (state.expenses || []).filter(e => e.date && e.date.startsWith(monthKey));
}

function prevExpenseMonth() {
  const [y,m] = getViewMonthKey().split('-').map(Number);
  const d = new Date(y, m-2, 1);
  expenseViewMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderExpenses();
}
function nextExpenseMonth() {
  const [y,m] = getViewMonthKey().split('-').map(Number);
  const d = new Date(y, m, 1);
  const now = new Date();
  const nowKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const newKey = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  if (newKey > nowKey) return;
  expenseViewMonth = newKey;
  renderExpenses();
}

function renderExpenses() {
  const monthKey = getViewMonthKey();
  const [y,m] = monthKey.split('-').map(Number);
  const monthLabel = new Date(y, m-1, 1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  document.getElementById('exp-month-label').textContent = monthLabel;

  const now = new Date();
  const nowKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('exp-next-btn').style.opacity = monthKey >= nowKey ? '0.3' : '1';
  document.getElementById('exp-next-btn').style.pointerEvents = monthKey >= nowKey ? 'none' : 'auto';

  const dogs = activeDogs();
  const monthExps = expensesForMonth(monthKey);

  // ── 1. Cost Per Dog summary cards
  const summaryEl = document.getElementById('exp-summary');
  if (dogs.length === 0) {
    summaryEl.innerHTML = '<div class="empty">No pets added yet</div>';
  } else {
    summaryEl.innerHTML = dogs.map(dog => {
      const total = monthExps.reduce((sum, e) => sum + expenseEffectiveAmountForDog(e, dog.id), 0);
      const bycat = {};
      EXP_CATEGORIES.forEach(c => {
        bycat[c.key] = monthExps.filter(e=>e.category===c.key).reduce((sum,e)=>sum+expenseEffectiveAmountForDog(e,dog.id),0);
      });
      const breakdown = EXP_CATEGORIES.map(c =>
        `<span title="${c.label}">${c.icon} ${fmtMoney(bycat[c.key])}</span>`
      ).join('');
      return `<div class="exp-dog-card">
        <div class="exp-dog-name">${dog.name}</div>
        <div class="exp-dog-total">${fmtMoney(total)}</div>
        <div class="exp-dog-breakdown">${breakdown}</div>
      </div>`;
    }).join('');
  }

  // ── 2. Category breakdown
  const catEl = document.getElementById('exp-cat-breakdown');
  const grandTotal = monthExps.reduce((sum,e)=>sum+expNetAmount(e),0);
  catEl.innerHTML = EXP_CATEGORIES.map(cat => {
    const catTotal = monthExps.filter(e=>e.category===cat.key).reduce((sum,e)=>sum+expNetAmount(e),0);
    const pct = grandTotal > 0 ? Math.round(catTotal/grandTotal*100) : 0;
    return `<div class="exp-cat-row">
      <span class="exp-cat-icon">${cat.icon}</span>
      <span class="exp-cat-name">${cat.label}</span>
      <div class="exp-cat-bar-wrap"><div class="exp-cat-bar" style="width:${Math.max(0,pct)}%"></div></div>
      <span class="exp-cat-amt">${fmtMoney(catTotal)}</span>
    </div>`;
  }).join('');
  document.getElementById('exp-grand-total').textContent = fmtMoney(grandTotal);

  // ── 3. Transactions
  const listEl = document.getElementById('exp-list');
  const sortedExps = [...monthExps].sort((a,b)=>b.date.localeCompare(a.date));
  if (sortedExps.length === 0) {
    listEl.innerHTML = '<div class="empty">No expenses this month</div>';
  } else {
    listEl.innerHTML = sortedExps.map(e => {
      // Dog tag
      let dogLabel = '';
      if (e.splitDogIds && e.splitDogIds.length > 0) {
        const names = e.splitDogIds.map(id => { const d = state.dogs.find(x=>x.id===id); return d ? d.name : '?'; });
        const allActive = activeDogs().every(d => e.splitDogIds.includes(d.id)) && e.splitDogIds.length === activeDogs().length;
        dogLabel = allActive
          ? `<span class="exp-tag exp-tag-shared">All ÷${e.splitDogIds.length}</span>`
          : names.map(n=>`<span class="exp-tag exp-tag-shared">${n}</span>`).join('');
      } else if (e.shared) {
        dogLabel = `<span class="exp-tag exp-tag-shared">Shared ÷${dogs.length}</span>`;
      } else {
        const dog = state.dogs.find(d=>d.id===e.dogId);
        dogLabel = dog ? `<span class="exp-tag">${dog.name}</span>` : '';
      }

      // Sub-field lines
      const lines = [];
      if (e.expType) lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Type</span><span class="exp-tx-val">${e.expType}</span></div>`);
      if (e.where) lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Where</span><span class="exp-tx-val">${e.where}</span></div>`);
      if (e.kind) lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Kind</span><span class="exp-tx-val">${e.kind}</span></div>`);
      if (e.reimbursement) lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Reimbursed</span><span class="exp-tx-val exp-tx-credit">−${fmtMoney(e.reimbursement)}</span></div>`);
      if (e.notes) lines.push(`<div class="exp-tx-field"><span class="exp-tx-label">Note</span><span class="exp-tx-val">${e.notes}</span></div>`);

      const net = expNetAmount(e);
      const hasReim = parseFloat(e.reimbursement||0)>0;

      return `<div class="exp-item">
        <div class="exp-item-icon">${expCatIcon(e.category)}</div>
        <div style="flex:1;min-width:0">
          <div class="exp-item-cat">${expCatLabel(e.category)} ${dogLabel}</div>
          <div class="exp-item-date">${fmtDate(e.date)}</div>
          ${lines.join('')}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;padding-left:8px">
          <div style="display:flex;align-items:center;gap:4px">
            <button class="exp-action-btn" onclick="openEditExpense('${e.id}')">✏️</button>
            <button class="exp-action-btn exp-action-del" onclick="confirmDeleteExpense('${e.id}')">×</button>
          </div>
          ${hasReim
            ? `<div class="exp-item-amt-wrap"><div class="exp-item-amt-orig">${fmtMoney(e.amount)}</div><div class="exp-item-amt exp-item-amt-net">${fmtMoney(net)}</div></div>`
            : `<div class="exp-item-amt">${fmtMoney(e.amount)}</div>`}
        </div>
      </div>`;
    }).join('');
  }
}

// ── Expense overlay helpers

function openAddExpense() {
  expenseEditId = null;
  document.getElementById('exp-overlay-title').textContent = 'Log Expense';
  document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-notes').value = '';
  document.getElementById('exp-category').value = EXP_CATEGORIES[0].key;
  updateExpenseCategoryFields();
  document.getElementById('expense-overlay').classList.add('show');
}

function openEditExpense(id) {
  const exp = (state.expenses||[]).find(e=>e.id===id);
  if (!exp) return;
  expenseEditId = id;
  document.getElementById('exp-overlay-title').textContent = 'Edit Expense';
  document.getElementById('exp-date').value = exp.date;
  document.getElementById('exp-amount').value = (parseFloat(exp.amount)||0).toFixed(2);
  document.getElementById('exp-notes').value = exp.notes||'';
  document.getElementById('exp-category').value = exp.category;
  updateExpenseCategoryFields();
  setTimeout(()=>{
    // Restore sub-fields
    if (document.getElementById('exp-field-type')) document.getElementById('exp-field-type').value = exp.expType||'';
    if (document.getElementById('exp-field-where')) document.getElementById('exp-field-where').value = exp.where||'';
    if (document.getElementById('exp-field-kind')) document.getElementById('exp-field-kind').value = exp.kind||'';
    if (document.getElementById('exp-field-reimb')) document.getElementById('exp-field-reimb').value = exp.reimbursement||(exp.reimbursement===0?'0':'');

    // Restore dog assignment
    const catDef = EXP_CAT_MAP[exp.category];
    const splitCats = ['Food','Vegetables','Supplements'];
    if (splitCats.includes(exp.category)) {
      const preChecked = exp.splitDogIds || activeDogs().map(d=>d.id);
      document.querySelectorAll('.exp-split-check').forEach(cb => {
        cb.checked = preChecked.includes(parseInt(cb.value));
      });
    } else {
      const sharedEl = document.getElementById('exp-shared');
      sharedEl.checked = !!(exp.shared || (exp.splitDogIds && exp.splitDogIds.length > 1));
      toggleExpenseShared();
      if (!sharedEl.checked && exp.dogId !== undefined) {
        document.getElementById('exp-dog-select').value = exp.dogId;
      }
    }
  }, 0);
  document.getElementById('expense-overlay').classList.add('show');
}

function closeExpenseOverlay() {
  document.getElementById('expense-overlay').classList.remove('show');
  expenseEditId = null;
}

// Categories that split across dogs (checkbox picker)
const SPLIT_CATS = ['Food','Vegetables','Supplements'];

function updateExpenseCategoryFields() {
  const cat = document.getElementById('exp-category').value;
  const catDef = EXP_CAT_MAP[cat] || {};
  const fields = catDef.fields || [];
  const dogs = activeDogs();

  // Show/hide sub-fields
  ['type','where','kind','reimbursement'].forEach(f => {
    const el = document.getElementById('exp-subfield-'+f);
    if (el) el.style.display = fields.includes(f) || (f==='reimbursement' && fields.includes('reimbursement')) ? 'block' : 'none';
  });

  // Dog assignment
  const splitRow = document.getElementById('exp-split-row');
  const sharedRow = document.getElementById('exp-shared-row');
  const dogRow = document.getElementById('exp-dog-row');

  if (SPLIT_CATS.includes(cat)) {
    splitRow.style.display = 'block';
    sharedRow.style.display = 'none';
    dogRow.style.display = 'none';
    splitRow.querySelector('#exp-split-dogs').innerHTML = dogs.map(d =>
      `<label class="exp-split-label">
        <input type="checkbox" class="exp-split-check" value="${d.id}" checked style="accent-color:var(--orange);width:auto">
        ${d.name}
      </label>`
    ).join('');
  } else {
    splitRow.style.display = 'none';
    sharedRow.style.display = 'flex';
    const sel = document.getElementById('exp-dog-select');
    sel.innerHTML = dogs.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
    if (state.activeDogId !== null) sel.value = state.activeDogId;
    document.getElementById('exp-shared').checked = false;
    toggleExpenseShared();
  }
}

function toggleExpenseShared() {
  const shared = document.getElementById('exp-shared').checked;
  const cat = document.getElementById('exp-category').value;
  const dogRow = document.getElementById('exp-dog-row');
  if (SPLIT_CATS.includes(cat)) { dogRow.style.display='none'; return; }
  dogRow.style.display = shared ? 'none' : 'block';
}

function saveExpense() {
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const notes = document.getElementById('exp-notes').value.trim();
  if (!amount || amount <= 0 || !date) { showToast('Please enter amount and date'); return; }

  // Sub-fields
  const expType = document.getElementById('exp-field-type')?.value.trim() || '';
  const where = document.getElementById('exp-field-where')?.value.trim() || '';
  const kind = document.getElementById('exp-field-kind')?.value.trim() || '';
  const reimbursementRaw = document.getElementById('exp-field-reimb')?.value;
  const reimbursement = reimbursementRaw !== '' && reimbursementRaw !== undefined ? parseFloat(reimbursementRaw)||0 : 0;

  // Dog assignment
  let splitDogIds = null;
  let shared = false;
  let dogId = null;

  if (SPLIT_CATS.includes(category)) {
    const checked = [...document.querySelectorAll('.exp-split-check:checked')].map(cb=>parseInt(cb.value));
    if (checked.length === 0) { showToast('Select at least one dog'); return; }
    splitDogIds = checked;
  } else {
    shared = document.getElementById('exp-shared').checked;
    if (shared) {
      splitDogIds = activeDogs().map(d=>d.id);
    } else {
      dogId = parseInt(document.getElementById('exp-dog-select').value);
    }
  }

  if (!state.expenses) state.expenses = [];

  const record = { amount, date, category, notes, expType, where, kind, reimbursement, splitDogIds, shared, dogId };

  if (expenseEditId) {
    const idx = state.expenses.findIndex(e=>e.id===expenseEditId);
    if (idx !== -1) state.expenses[idx] = { ...state.expenses[idx], ...record };
    showToast('Expense updated ✓');
  } else {
    const id = 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    state.expenses.push({ id, ...record });
    showToast('Expense saved! 💰');
  }
  save();
  closeExpenseOverlay();
  renderExpenses();
}

function confirmDeleteExpense(id) {
  const exp = (state.expenses||[]).find(e=>e.id===id);
  if (!exp) return;
  document.getElementById('confirm-title').textContent = 'Delete this expense?';
  document.getElementById('confirm-sub').textContent = expCatLabel(exp.category) + ' · ' + fmtMoney(exp.amount) + '\n' + fmtDate(exp.date);
  document.getElementById('confirm-ok').textContent = 'Delete';
  document.getElementById('confirm-ok').onclick = () => { doDeleteExpense(id); closeConfirm(); };
  document.getElementById('confirm-overlay').classList.add('show');
}

function doDeleteExpense(id) {
  state.expenses = (state.expenses||[]).filter(e=>e.id!==id);
  save();
  renderExpenses();
  showToast('Expense deleted');
}

// Keep old deleteExpense as alias (safety)
function deleteExpense(id) { confirmDeleteExpense(id); }

function exportExpensesCSV() {
  const dogs = activeDogs();
  const expenses = state.expenses || [];
  if (expenses.length === 0) { showToast('No expenses to export'); return; }

  const rows = [['Date','Category','Bill Amount','Reimbursement','Net Amount','Per Dog Share','Dog / Allocation','Type','Where','Kind','Notes']];
  const sortedExps = [...expenses].sort((a,b)=>a.date.localeCompare(b.date));
  sortedExps.forEach(e => {
    const net = expNetAmount(e);
    let alloc = '';
    let perDogShare = '';
    if (e.splitDogIds && e.splitDogIds.length > 0) {
      const names = e.splitDogIds.map(id => { const d = state.dogs.find(x=>x.id===id); return d?d.name:'?'; });
      alloc = names.join(', ');
      perDogShare = (net / e.splitDogIds.length).toFixed(2);
    } else if (e.shared) {
      alloc = 'Shared all dogs';
      perDogShare = (net / (dogs.length||1)).toFixed(2);
    } else {
      const dog = state.dogs.find(d=>d.id===e.dogId);
      alloc = dog ? dog.name : 'Unknown';
      perDogShare = net.toFixed(2);
    }
    rows.push([e.date, e.category, (parseFloat(e.amount)||0).toFixed(2), (parseFloat(e.reimbursement)||0).toFixed(2), net.toFixed(2), perDogShare, alloc, e.expType||'', e.where||'', e.kind||'', e.notes||'']);
  });

  const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'k9kilo-expenses.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded!');
}

// ── AUTH FUNCTIONS ──
let _authMode = 'login';
function authSwitchTab(mode) {
  _authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').textContent = '';
}
function authSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; return; }
  const fn = _authMode === 'login' ? window._fbFns.signInWithEmailAndPassword : window._fbFns.createUserWithEmailAndPassword;
  fn(window._fbAuth, email, password).catch(e => { errEl.textContent = _authError(e.code); });
}
function authSignOut() { window._fbFns.signOut(window._fbAuth); }
function _authError(code) {
  return ({'auth/user-not-found':'No account with that email.','auth/wrong-password':'Incorrect password.',
    'auth/email-already-in-use':'Email already registered.','auth/weak-password':'Password must be 6+ characters.',
    'auth/invalid-email':'Invalid email address.','auth/invalid-credential':'Invalid email or password.',
    'auth/too-many-requests':'Too many attempts. Try again later.'})[code] || 'An error occurred.';
}

// Init
document.getElementById('input-date').value=new Date().toISOString().split('T')[0];
['confirm-overlay','editentry-overlay','adddog-overlay','expense-overlay'].forEach(id=>{
  document.getElementById(id).addEventListener('click',e=>{if(e.target===e.currentTarget)document.getElementById(id).classList.remove('show');});
});
render();
