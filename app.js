/* IQ-Čtečka – logika: CSV -> kusy -> QR kódy -> skenování -> persist
   Data jsou oddělená podle firmy (companyId); přístup a oprávnění řídí Auth. */
'use strict';
const LS_PREFIX = 'iq-ctecka-v1';           // klíč dat jedné firmy: iq-ctecka-v1:<companyId>
const emptyState = () => ({ items: [], lastId: 0, history: [], labelSets: [], ui: { tab: 'seznam', openSetId: null }, updatedAt: null });
let state = emptyState();
let lastScannedId = null;
let openSetId = null;            // která uložená sada štítků je právě otevřená k ověření
let html5Qr = null, cameras = [], camIndex = 0, scanning = false;
let setQr = null, setScanning = false;   // samostatný skener pro ověřování sad (záložka Štítky)

/* ---------- stav prostředí (naposledy otevřená záložka a sada) ----------
   Ukládá se do dat firmy, takže se po obnovení stránky i po přihlášení
   v mobilu uživatel vrátí tam, kde skončil. */
let activeTabName = 'seznam';
function syncUi(){ state.ui = { tab: activeTabName, openSetId: openSetId || null }; }
/* Zapíše stav prostředí bez překreslení – používá se při přepnutí záložky. */
function persistUi(){ const cid = activeCompanyId(); if (!cid) return; syncUi(); try { localStorage.setItem(lsKey(cid), JSON.stringify(state)); } catch(e){} }
/* Otevření/zavření sady – vždy se promítne i do uloženého stavu. */
function setOpenSet(id){ openSetId = id || null; persistUi(); }
function restoreUi(){ const u = state.ui || {}; activeTabName = u.tab || 'seznam'; openSetId = u.openSetId || null; }
/* Označí kód v otevřené sadě jako ověřený (pokud tam je a ještě není). Vrací sadu, jinak null. */
function validateSetCode(code, when){
  const set = currentSet(); if (!set) return null;
  const e = set.codes.find(c => c.code.toLowerCase() === String(code || '').trim().toLowerCase());
  if (!e || e.status === 'validated') return null;
  e.status = 'validated';
  e.validatedAt = when || new Date().toISOString();
  set.updatedAt = e.validatedAt;
  return set;
}

// ---------- persistence (odděleně podle firmy) ----------
function lsKey(companyId) { return `${LS_PREFIX}:${companyId}`; }
function activeCompanyId() { return Auth.company(); }
function save() {
  const cid = activeCompanyId(); if (!cid) return;
  state.updatedAt = new Date().toISOString();
  syncUi();
  try { localStorage.setItem(lsKey(cid), JSON.stringify(state)); } catch(e){}
  render();
}
function readState(cid) {
  try { const raw = localStorage.getItem(lsKey(cid)); if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.items)) return normalizeState(s); } } catch(e){}
  return null;
}
/* Doplní chybějící části stavu (starší uložená data bez labelSets apod.). */
function normalizeState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
  s.lastId = Number(s.lastId) || 0;
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.labelSets)) s.labelSets = [];
  s.labelSets = s.labelSets.map(normalizeSet).filter(Boolean);
  if (!s.ui || typeof s.ui !== 'object') s.ui = {};
  s.ui.tab = (s.ui.tab === 'stitky' || s.ui.tab === 'inventura') ? s.ui.tab : 'seznam';
  s.ui.openSetId = s.ui.openSetId ? String(s.ui.openSetId) : null;
  return s;
}
/* Načte data aktivní firmy; při prvním přihlášení je naplní ukázkovými daty. */
function load() {
  const cid = activeCompanyId(); if (!cid) { state = emptyState(); return; }
  const stored = readState(cid);
  state = stored || normalizeState(demoSeedState(cid)) || emptyState();
  if (!stored) { try { localStorage.setItem(lsKey(cid), JSON.stringify(state)); } catch(e){} }
}

// ---------- helpers ----------
const $ = id => document.getElementById(id);
function toast(msg, ok=true){ const t=$('toast'); t.textContent=msg; t.className='toast show '+(ok?'ok':'err'); setTimeout(()=>t.className='toast',2600); }
function beep(ok=true){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(), g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=ok?880:220; o.type=ok?'sine':'sawtooth'; g.gain.value=0.15; o.start(); setTimeout(()=>{o.stop();ctx.close();}, ok?150:400);}catch(e){} if(navigator.vibrate) navigator.vibrate(ok?50:[80,60,80]); }
function norm(s){ return (s||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
/* Vrátí true a ohlásí chybu, pokud je uživatel v režimu čtení (host). */
function denyIfReadOnly(){ if (Auth.isGuest()) { toast('Režim čtení – úpravy nejsou povoleny', false); return true; } return false; }
function pad(n,l=4){ return String(n).padStart(l,'0'); }
function uid(prefix='u'){ return prefix+(++state.lastId)+'-'+Date.now().toString(36); }

// ---------- CSV parsing ----------
function detectDelim(line){ const c=(line.match(/;/g)||[]).length, k=(line.match(/,/g)||[]).length; return c>k?';':','; }
function splitLine(line, d){ const out=[]; let cur='',q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; } else if(ch===d&&!q){ out.push(cur); cur=''; } else cur+=ch; } out.push(cur); return out.map(s=>s.trim().replace(/^"|"$/g,'')); }
function parseCsv(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const lines=text.split('\n').map(l=>l.trim()).filter(l=>l.length);
  if(!lines.length) return [];
  const d=detectDelim(lines[0]);
  const head=splitLine(lines[0],d).map(h=>norm(h));
  const iName=head.findIndex(h=>h.includes('inventar')&&h.includes('majetku')||h.includes('nazev')||h.includes('majetek'));
  const iCount=head.findIndex(h=>h.includes('pocet'));
  const iYears=head.findIndex(h=>h.includes('delka')||h.includes('umor')||h.includes('let'));
  const iCode=head.findIndex(h=>h.includes('kod'));
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const c=splitLine(lines[i],d);
    const name=(c[iName>=0?iName:0]||'').trim(); if(!name) continue;
    const count=Math.max(1,parseInt((c[iCount]||'1').replace(/\s/g,''))||1);
    const years=(c[iYears]||'').trim();
    const code=(c[iCode]||'').trim();
    rows.push({name,count,years,code});
  }
  return rows;
}

// ---------- build units ----------
function nextCode(prefix){
  let max=0;
  state.items.forEach(it=>{ const m=/(\d+)\s*$/.exec(it.code||''); if(m) max=Math.max(max,parseInt(m[1],10)); });
  return `${prefix}-${pad(max+1)}`;
}
function generateFromRows(rows){
  if (denyIfReadOnly()) return;
  const prefix=($('inpPrefix').value||'IQ').toUpperCase().replace(/[^A-Z0-9]/g,'')||'IQ';
  const keep=$('chkKeepCodes').checked;
  if(!keep){ state.items=[]; state.history=[]; }
  const existing=new Set(state.items.map(i=>i.code));
  const existingGroup={}; state.items.forEach(i=>{ (existingGroup[i.group]=existingGroup[i.group]||[]).push(i); });
  let counter=state.items.length;
  const findMax=()=>{ let m=0; state.items.forEach(it=>{const x=/(\d+)\s*$/.exec(it.code||''); if(x)m=Math.max(m,+x[1]);}); return m; };
  let seq=findMax();
  rows.forEach(r=>{
    if(r.count===1 && r.code){ // single with preset code
      if(!existing.has(r.code)){ state.items.push({id:uid(),code:r.code,name:r.name,years:r.years,group:r.name,idx:1,status:'pending',foundAt:null}); existing.add(r.code); }
      return;
    }
    for(let k=1;k<=r.count;k++){
      let code;
      if(r.count===1&&r.code) code=r.code;
      else if(r.code&&k===1&&!existing.has(r.code)) code=r.code;
      else { seq++; code=`${prefix}-${pad(seq)}`; }
      while(existing.has(code)){ seq++; code=`${prefix}-${pad(seq)}`; }
      existing.add(code);
      state.items.push({id:uid(),code,name:r.name,years:r.years,group:r.name,idx:k,status:'pending',foundAt:null});
      counter++;
    }
  });
  save(); toast(`Vygenerováno: ${state.items.length} kusů`);
}

// ---------- render ----------
function filtered(){
  const q=norm($('search').value), f=$('filterStatus').value;
  return state.items.filter(it=>{
    if(f==='pending'&&it.status!=='pending')return false;
    if(f==='found'&&it.status!=='found')return false;
    if(q&&!(norm(it.name).includes(q)||norm(it.code).includes(q)))return false;
    return true;
  });
}
function qrDataUrl(text, size=128){
  try{ const qr=qrcode(0,'M'); qr.addData(text); qr.make();
    const mod=qr.getModuleCount(), cell=Math.max(1,Math.floor(size/mod)), s=cell*mod;
    const c=document.createElement('canvas'); c.width=c.height=s; const x=c.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,s,s); x.fillStyle='#000';
    for(let r=0;r<mod;r++)for(let col=0;col<mod;col++) if(qr.isDark(r,col)) x.fillRect(col*cell,r*cell,cell,cell);
    return c.toDataURL('image/png');
  }catch(e){ return ''; }
}
/* Souhrnné ukazatele – hlavička i dlaždice v záložce Inventura. */
function renderStats(){
  const total=state.items.length, found=state.items.filter(i=>i.status==='found').length;
  $('progressMini').textContent=`${found} / ${total}`;
  $('progressText').textContent= total?`${found} z ${total} kusů nalezeno • zbývá ${total-found}`:'Nenahrán žádný seznam';
  const pct=total?Math.round(found/total*100):0;
  $('progressPct').textContent=pct+'%'; $('progressBar').style.width=pct+'%';
  $('statTotal').textContent=total; $('statFound').textContent=found; $('statPending').textContent=total-found;
}
/* Tabulka majetku – záložka Seznam. */
function renderTable(){
  const rows=filtered(), tb=$('tbody'); tb.innerHTML='';
  $('emptyMsg').style.display=rows.length?'none':'block';
  const frag=document.createDocumentFragment();
  rows.slice(0,500).forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><b class="mono">${escapeHtml(it.code)}</b></td><td>${escapeHtml(it.name)} <span class="muted">#${it.idx}</span></td><td class="muted">${escapeHtml(it.group||'')} ${it.years?`· ${escapeHtml(it.years)}r`:''}</td><td>${it.status==='found'?'<span class="pill ok">✅ Nalezeno</span>':'<span class="pill">⏳ Čeká</span>'}</td><td class="muted small">${it.foundAt?new Date(it.foundAt).toLocaleString('cs-CZ'):''}</td>`;
    const td=document.createElement('td');
    if(Auth.canEdit()){
      const b=document.createElement('button'); b.className='btn small secondary'; b.textContent=it.status==='found'?'↩️':'✔️';
      b.title=it.status==='found'?'Vrátit':'Označit ručně';
      b.onclick=()=>{ toggleItem(it.id); };
      td.appendChild(b);
    }
    tr.appendChild(td); frag.appendChild(tr);
  });
  tb.appendChild(frag);
  if(rows.length>500) toast('Zobrazeno prvních 500 řádků, použijte filtr/hledání', true);
}
/* Historie skenů – záložka Inventura. */
function renderHistory(){
  const h=$('history'); h.innerHTML='';
  [...state.history].slice(-10).reverse().forEach(ev=>{
    const li=document.createElement('li');
    li.className='hist '+(ev.result==='found'?'ok':ev.result==='duplicate'?'dup':'err');
    li.innerHTML=`<b class="mono">${escapeHtml(ev.code)}</b> ${escapeHtml(ev.name||'')} <span class="muted">${new Date(ev.at).toLocaleTimeString('cs-CZ')}</span> – ${ev.result==='found'?'✅ nalezeno':ev.result==='duplicate'?'⚠️ duplicitní sken':'❌ neznámý kód'}`;
    h.appendChild(li);
  });
}
/* Vykreslí vše – používá se po každé změně dat. */
function render(){
  renderStats();
  renderTable();
  renderHistory();
  renderLabelsPreview();
  renderLabelSets();
  renderActiveSet();
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toggleItem(id){ if (denyIfReadOnly()) return; const it=state.items.find(i=>i.id===id); if(!it)return;
  if(it.status==='found'){ it.status='pending'; it.foundAt=null; } else { it.status='found'; it.foundAt=new Date().toISOString(); lastScannedId=id; }
  save();
}

// ---------- labels ----------
function renderLabelsPreview(){
  const onlyPending=$('chkOnlyPending').checked;
  const list=state.items.filter(i=>!onlyPending||i.status==='pending');
  const box=$('labelsPreview'); box.innerHTML='';
  list.slice(0,60).forEach(it=>{
    const url=qrDataUrl(it.code,96);
    ['SEZNAM','MAJETEK'].forEach(kind=>{
      const d=document.createElement('div'); d.className='label-card';
      d.innerHTML=`<div class="label-kind ${kind==='SEZNAM'?'k-list':'k-asset'}">${kind}</div><img src="${url}" alt="${escapeHtml(it.code)}"/><b class="mono">${escapeHtml(it.code)}</b><span>${escapeHtml(it.name)} #${it.idx}</span>`;
      box.appendChild(d);
    });
  });
  if(list.length>30){ const p=document.createElement('p'); p.className='muted center'; p.textContent=`Náhled: prvních 30 kusů (60 štítků) z ${list.length}. Plný tisk přes tlačítko Tisknout.`; box.appendChild(p); }
}
function doPrint(){
  const onlyPending=$('chkOnlyPending').checked;
  const size=$('selLabelSize').value;
  const list=state.items.filter(i=>!onlyPending||i.status==='pending');
  if(!list.length){ toast('Není co tisknout', false); return; }
  const area=$('printArea'); area.className='print-area size-'+size; area.innerHTML='';
  list.forEach(it=>{
    const url=qrDataUrl(it.code,160);
    ['SEZNAM • do papírového seznamu','MAJETEK • nalepit na majetek'].forEach(kind=>{
      const d=document.createElement('div'); d.className='plabel';
      d.innerHTML=`<div class="pkind">${kind}</div><img src="${url}"/><div class="pcode">${escapeHtml(it.code)}</div><div class="pname">${escapeHtml(it.name)} · kus ${it.idx}${it.years?` · ${escapeHtml(it.years)}r`:''}</div>`;
      area.appendChild(d);
    });
  });
  window.print();
}

// ---------- sady štítků (uložení, znovuotevření, ověření) ----------
const LABEL_SIZE_NAMES = { small: 'Malý (40×30 mm)', medium: 'Střední (62×40 mm)', large: 'Velký (80×50 mm)' };
function labelSizeName(v){ return LABEL_SIZE_NAMES[v] || LABEL_SIZE_NAMES.medium; }

/* Zvaliduje a sjednotí jednu sadu (např. z importovaného JSON). */
function normalizeSet(s){
  if (!s || typeof s !== 'object' || !Array.isArray(s.codes)) return null;
  const codes = s.codes.filter(c => c && c.code).map(c => ({
    code: String(c.code).trim(),
    name: String(c.name || ''),
    idx: Number(c.idx) || 1,
    group: String(c.group || ''),
    years: String(c.years || ''),
    status: c.status === 'validated' ? 'validated' : 'pending',
    validatedAt: c.validatedAt || null
  })).filter(c => c.code);
  if (!codes.length) return null;
  const now = new Date().toISOString();
  return {
    id: String(s.id || ('s' + Date.now())),
    name: String(s.name || 'Sada').slice(0, 80),
    createdAt: s.createdAt || now,
    updatedAt: s.updatedAt || now,
    labelSize: LABEL_SIZE_NAMES[s.labelSize] ? s.labelSize : 'medium',
    codes
  };
}
function currentSet(){ return (state.labelSets || []).find(s => s.id === openSetId) || null; }
function setStats(set){
  const total = set.codes.length;
  const done = set.codes.filter(c => c.status === 'validated').length;
  return { total, done, pending: total - done, pct: total ? Math.round(done / total * 100) : 0 };
}

/* Uloží aktuální seznam QR kódů jako pojmenovanou sadu a hned ji otevře. */
function saveLabelSet(){
  if (denyIfReadOnly()) return;
  if (!state.items.length){ toast('Nejprve vytvořte kódy (nahrajte CSV nebo ukázková data)', false); return; }
  const inp = $('inpSetName');
  const name = (inp.value || '').trim();
  if (!name){ toast('Zadejte název sady', false); inp.focus(); return; }
  const now = new Date().toISOString();
  const set = {
    id: uid('s'), name, createdAt: now, updatedAt: now,
    labelSize: $('selLabelSize').value,
    codes: state.items.map(it => ({
      code: it.code, name: it.name, idx: it.idx,
      group: it.group || '', years: it.years || '',
      status: 'pending', validatedAt: null
    }))
  };
  state.labelSets.push(set);
  inp.value = '';
  closeSetBanner();             // nová sada začíná s čistou hláškou
  save();                       // uloží sadu a překreslí
  setOpenSet(set.id);           // rovnou ji otevřeme k ověření
  renderLabelSets();
  toast(`Sada „${name}“ uložena (${set.codes.length} kódů)`);
}

function closeSetBanner(){ const b = $('setLastScan'); if (b){ b.classList.add('hidden'); b.innerHTML = ''; } }
function toggleOpenSet(id){
  closeSetBanner();                              // hláska patří k předchozí sadě
  if (openSetId === id){ setOpenSet(null); renderLabelSets(); return; }
  setOpenSet(id);
  renderLabelSets();
  const card = $('openSetCard');
  if (card && !card.classList.contains('hidden')) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteLabelSet(id){
  if (denyIfReadOnly()) return;
  const set = (state.labelSets || []).find(s => s.id === id); if (!set) return;
  if (!confirm(`Smazat sadu „${set.name}“?`)) return;
  state.labelSets = state.labelSets.filter(s => s.id !== id);
  if (openSetId === id){ setOpenSet(null); try { stopSetScan(); } catch(e){} }
  save(); toast('Sada smazána');
}

function resetSetValidation(){
  if (denyIfReadOnly()) return;
  const set = currentSet(); if (!set) return;
  if (!confirm(`Vynulovat ověření sady „${set.name}“?`)) return;
  set.codes.forEach(c => { c.status = 'pending'; c.validatedAt = null; });
  set.updatedAt = new Date().toISOString();
  const box = $('setLastScan'); if (box) box.classList.add('hidden');
  save(); toast('Ověření vynulováno');
}

/* Export / import sady – přenos do telefonu, který pak skenuje kódy z obrazovky. */
function exportLabelSet(id){
  const set = (state.labelSets || []).find(s => s.id === id); if (!set) return;
  set.updatedAt = new Date().toISOString();
  const safe = (set.name || 'sada').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'sada';
  download(new Blob([JSON.stringify(set, null, 2)], { type: 'application/json' }), `sada-stitku-${safe}.json`);
}
/* Sloučí importovanou sadu s uloženou sadou stejného názvu – ověřené kódy aktualizují stav. */
function mergeLabelSet(existing, incoming){
  const byCode = {};
  existing.codes.forEach(c => { byCode[String(c.code).toLowerCase()] = c; });
  let updated = 0, added = 0;
  incoming.codes.forEach(ic => {
    const cur = byCode[String(ic.code).toLowerCase()];
    if (!cur){ existing.codes.push(ic); added++; return; }
    if (ic.status === 'validated' && cur.status !== 'validated'){
      cur.status = 'validated';
      cur.validatedAt = ic.validatedAt || new Date().toISOString();
      updated++;
    } else if (!cur.validatedAt && ic.validatedAt){ cur.validatedAt = ic.validatedAt; }
  });
  existing.updatedAt = new Date().toISOString();
  return { updated, added };
}
function importLabelSet(file){
  if (denyIfReadOnly()) return;
  const r = new FileReader();
  r.onload = () => {
    let norm = null;
    try { norm = normalizeSet(JSON.parse(r.result)); } catch(e){ norm = null; }
    if (!norm){ toast('Neplatný soubor sady (JSON)', false); return; }
    // stejný název = tatáž sada (typicky návrat z telefonu) → aktualizovat stavy, ne duplikovat
    const existing = (state.labelSets || []).find(s => (s.name || '').toLowerCase() === norm.name.toLowerCase());
    if (existing){
      const res = mergeLabelSet(existing, norm);
      closeSetBanner();
      save();
      setOpenSet(existing.id); renderLabelSets();
      const s = setStats(existing);
      toast(`Sada „${existing.name}“ aktualizována – ${s.done} z ${s.total} ověřeno` + (res.updated ? ` (+${res.updated})` : ''));
    } else {
      norm.id = uid('s');                    // nové ID, aby se nepřepsala existující sada
      state.labelSets.push(norm);
      closeSetBanner();
      save();
      setOpenSet(norm.id); renderLabelSets();
      toast(`Sada „${norm.name}“ načtena (${norm.codes.length} kódů)`);
    }
  };
  r.readAsText(file);
}

// ---------- scanning ----------
function findByCode(code){ const c=(code||'').trim(); return state.items.find(i=>i.code.toLowerCase()===c.toLowerCase()); }
function handleScan(raw){
  if (denyIfReadOnly()) return;
  const code=(raw||'').trim(); if(!code) return;
  const it=findByCode(code);
  const box=$('lastScan'); box.classList.remove('hidden');
  if(!it){ beep(false); box.className='last-scan err'; box.innerHTML=`❌ <b class="mono">${escapeHtml(code)}</b> – neznámý kód (není v seznamu)`; pushHist(code,'','unknown'); return; }
  if(it.status==='found'){
    // Kus je v inventuře už nalezený, ale pokud běží ověřování sady štítků,
    // sken ho v sadě přesto ověří – jde o dvě různé kontroly.
    const dupSet = validateSetCode(code);
    if (dupSet){
      save(); beep(true);
      const sd = setStats(dupSet);
      box.className='last-scan ok';
      box.innerHTML=`✅ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(it.name)} #${it.idx}`
        + ` – ověřeno v sadě „${escapeHtml(dupSet.name)}“ (${sd.done} / ${sd.total})`
        + ` <span class="muted">· v inventuře už bylo nalezeno</span>`;
      return;
    }
    beep(true); box.className='last-scan dup';
    box.innerHTML=`⚠️ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(it.name)} – již naskenováno v ${new Date(it.foundAt).toLocaleTimeString('cs-CZ')}`;
    pushHist(code,it.name,'duplicate'); render(); return;
  }
  it.status='found'; it.foundAt=new Date().toISOString(); lastScannedId=it.id;
  const synced = validateSetCode(code, it.foundAt);   // promítne sken i do otevřené sady štítků
  pushHist(code,it.name,'found'); save(); beep(true);
  const sst = synced ? setStats(synced) : null;
  box.className='last-scan ok';
  box.innerHTML=`✅ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(it.name)} #${it.idx} – spárováno!`
    + (sst ? ` <span class="muted">· sada „${escapeHtml(synced.name)}“ ${sst.done} / ${sst.total}</span>` : '');
}
function pushHist(code,name,result){ state.history.push({code,name,result,at:new Date().toISOString()}); if(state.history.length>500) state.history=state.history.slice(-500); try{localStorage.setItem(lsKey(activeCompanyId()),JSON.stringify(state));}catch(e){} }
async function startScan(){
  if (denyIfReadOnly()) return;
  if(!state.items.length){ toast('Nejprve nahrajte seznam majetku', false); switchTab('seznam'); return; }
  if(typeof Html5Qrcode==='undefined'){ toast('Knihovna skeneru se nenačetla (nutný internet při prvním otevření)', false); return; }
  try{
    if(!html5Qr) html5Qr=new Html5Qrcode('reader');
    cameras=await Html5Qrcode.getCameras();
    const cfg={fps:10, qrbox:{width:260,height:260}, aspectRatio:1.0};
    let camId=null;
    if(cameras.length){ camId=cameras[camIndex%cameras.length].id; }
    const box=$('reader'); if(box) box.classList.add('scanning');
    await html5Qr.start(camId?{deviceId:{exact:camId}}:{facingMode:'environment'}, cfg, handleScan, ()=>{});
    scanning=true; $('btnStartScan').disabled=true; $('btnStopScan').disabled=false; $('btnFlip').disabled=cameras.length<2;
    $('scanHint').textContent='Namiřte na QR štítek…';
  }catch(e){ const b=$('reader'); if(b) b.classList.remove('scanning'); toast('Kameru se nepodařilo spustit: '+e, false); $('scanHint').textContent='Povolte přístup ke kameře a použijte HTTPS.'; }
}
async function stopScan(){ try{ if(html5Qr&&scanning) await html5Qr.stop(); }catch(e){} scanning=false; const r=$('reader'); if(r) r.classList.remove('scanning'); $('btnStartScan').disabled=false; $('btnStopScan').disabled=true; }

// ---------- ověřování sady štítků skenerem ----------
/* Označí kód z otevřené sady jako ověřený (a uloží čas). */
function handleSetScan(raw){
  if (denyIfReadOnly()) return;
  const set = currentSet(); if (!set) return;
  const code = (raw || '').trim(); if (!code) return;
  const box = $('setLastScan'); box.classList.remove('hidden');
  const entry = set.codes.find(c => c.code.toLowerCase() === code.toLowerCase());
  if (!entry){
    beep(false); box.className = 'last-scan err';
    box.innerHTML = `❌ <b class="mono">${escapeHtml(code)}</b> – tento kód není v sadě „${escapeHtml(set.name)}“`;
    return;
  }
  if (entry.status === 'validated'){
    beep(true); box.className = 'last-scan dup';
    box.innerHTML = `⚠️ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(entry.name)} – již ověřeno v ${new Date(entry.validatedAt).toLocaleTimeString('cs-CZ')}`;
    return;
  }
  entry.status = 'validated';
  entry.validatedAt = new Date().toISOString();
  set.updatedAt = entry.validatedAt;
  // promítne ověření i do inventury (majetku), aby obě záložky ukazovaly totéž
  const it = findByCode(code);
  let marked = false;
  if (it && it.status !== 'found'){
    it.status = 'found'; it.foundAt = entry.validatedAt; lastScannedId = it.id;
    pushHist(code, it.name, 'found'); marked = true;
  }
  save();                                  // uloží stav a překreslí mřížku i průběh
  beep(true);
  const st = setStats(set);
  box.className = 'last-scan ok';
  box.innerHTML = `✅ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(entry.name)} #${entry.idx} – ověřeno (${st.done} / ${st.total})`
    + (marked ? ' <span class="muted">· označeno v inventuře</span>' : '');
}

async function startSetScan(){
  if (denyIfReadOnly()) return;
  const set = currentSet(); if (!set){ toast('Nejprve otevřete sadu štítků', false); return; }
  if (typeof Html5Qrcode === 'undefined'){ toast('Knihovna skeneru se nenačetla (nutný internet při prvním otevření)', false); return; }
  try{
    await stopScan();                      // uvolní kameru záložky Inventura – jeden přístroj na kameru
    if (!setQr) setQr = new Html5Qrcode('setReader');
    const cfg = { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1.0 };
    let camId = null;
    const cams = await Html5Qrcode.getCameras();
    if (cams.length) camId = cams[0].id;
    const sbox=$('setReader'); if(sbox) sbox.classList.add('scanning');
    await setQr.start(camId ? { deviceId: { exact: camId } } : { facingMode: 'environment' }, cfg, handleSetScan, () => {});
    setScanning = true; $('btnStartSetScan').disabled = true; $('btnStopSetScan').disabled = false;
  }catch(e){ const b=$('setReader'); if(b) b.classList.remove('scanning'); toast('Kameru se nepodařilo spustit: ' + e, false); }
}
async function stopSetScan(){
  try{ if(setQr && setScanning) await setQr.stop(); }catch(e){}
  setScanning = false;
  const b = $('btnStartSetScan'), s = $('btnStopSetScan'), rb = $('setReader');
  if (rb) rb.classList.remove('scanning');
  if (b) b.disabled = false; if (s) s.disabled = true;
}

// ---------- export/import ----------
/* Obnova celé zálohy (majetek + sady štítků + stav ověření) – přenos mezi zařízeními. */
function importFullBackup(file){
  if (denyIfReadOnly()) return;
  const r = new FileReader();
  r.onload = () => {
    let next = null;
    try { next = normalizeState(JSON.parse(r.result)); } catch(e){ next = null; }
    if (!next){ toast('Neplatná záloha (JSON)', false); return; }
    state = next;
    restoreUi();
    closeSetBanner();
    save();
    switchTab(activeTabName);
    toast(`Záloha obnovena – ${state.items.length} kusů, ${(state.labelSets||[]).length} sad`);
  };
  r.readAsText(file);
}

function exportCsv(){
  const head='inventární kód;název;skupina;stav;čas nálezu;odpis let';
  const lines=state.items.map(i=>[i.code,i.name,i.group,i.status==='found'?'nalezeno':'nenalezeno',i.foundAt?new Date(i.foundAt).toLocaleString('cs-CZ'):'',i.years||''].map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(';'));
  download(new Blob(['\uFEFF'+head+'\n'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),'inventura-vysledek.csv');
}
function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }

/* Seznam uložených sad (řádek = název, průběh ověření, akce). */
function renderLabelSets(){
  const list = $('setList'); if (!list) return;
  const canEdit = Auth.canEdit();
  const sets = (state.labelSets || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const empty = $('setEmpty'); if (empty) empty.style.display = sets.length ? 'none' : 'block';
  list.innerHTML = '';
  sets.forEach(s => {
    const st = setStats(s), isOpen = s.id === openSetId;
    const li = document.createElement('li');
    li.className = 'set-row' + (isOpen ? ' is-open' : '');
    li.innerHTML =
      `<div class="set-row-main">
         <b class="set-row-name">${escapeHtml(s.name)}</b>
         <span class="muted small">vytvořeno ${new Date(s.createdAt).toLocaleString('cs-CZ')} · ${st.total} kódů · ${labelSizeName(s.labelSize)}</span>
       </div>
       <div class="set-row-meter">
         <div class="set-row-bar"><i style="width:${st.pct}%"></i></div>
         <span class="pill${st.done === st.total ? ' ok' : ''}">${st.done} / ${st.total} ověřeno</span>
       </div>`;
    const act = document.createElement('div'); act.className = 'set-row-actions';
    const bOpen = document.createElement('button');
    bOpen.className = 'btn small ' + (isOpen ? 'secondary' : 'primary');
    bOpen.textContent = isOpen ? '▲ Zavřít' : '▶ Otevřít';
    bOpen.title = isOpen ? 'Zavřít sadu' : 'Otevřít sadu k ověření';
    bOpen.onclick = () => toggleOpenSet(s.id);
    act.appendChild(bOpen);
    const bExp = document.createElement('button');
    bExp.className = 'btn small'; bExp.textContent = '⬇️ Export'; bExp.title = 'Uložit sadu do souboru (JSON)';
    bExp.onclick = () => exportLabelSet(s.id);
    act.appendChild(bExp);
    if (canEdit){
      const bDel = document.createElement('button');
      bDel.className = 'btn small danger-ghost'; bDel.textContent = '🗑️ Smazat'; bDel.title = 'Smazat sadu';
      bDel.onclick = () => deleteLabelSet(s.id);
      act.appendChild(bDel);
    }
    li.appendChild(act);
    list.appendChild(li);
  });
  renderOpenSet();
  renderActiveSet();
}

/* Otevřená sada: průběh, ovládání a mřížka QR kódů (velké = skenování z obrazovky). */
function renderOpenSet(){
  const card = $('openSetCard'); if (!card) return;
  const set = currentSet();
  if (!set){ card.classList.add('hidden'); const g = $('setGrid'); if (g) g.innerHTML = ''; return; }
  card.classList.remove('hidden');
  const st = setStats(set);
  $('openSetName').textContent = set.name;
  $('openSetMeta').textContent = `Uloženo ${new Date(set.createdAt).toLocaleString('cs-CZ')} · ${st.total} QR kódů · ${labelSizeName(set.labelSize)}`;
  $('openSetProgressText').textContent = `${st.done} z ${st.total} kódů ověřeno • zbývá ${st.pending}`;
  $('openSetPct').textContent = st.pct + '%';
  $('openSetBar').style.width = st.pct + '%';

  const onlyPending = $('chkSetOnlyPending').checked;
  const big = $('chkSetBigQr').checked;
  const grid = $('setGrid');
  grid.className = 'qr-grid' + (big ? ' big' : '');
  grid.innerHTML = '';
  const shown = set.codes.filter(c => !onlyPending || c.status !== 'validated');
  const LIMIT = 150;
  const frag = document.createDocumentFragment();
  shown.slice(0, LIMIT).forEach(c => {
    const d = document.createElement('div');
    d.className = 'qr-cell' + (c.status === 'validated' ? ' validated' : '');
    d.innerHTML =
      `<img src="${qrDataUrl(c.code, big ? 420 : 180)}" alt="${escapeHtml(c.code)}" />
       <b class="mono">${escapeHtml(c.code)}</b>
       <span class="qr-name">${escapeHtml(c.name)} #${c.idx}</span>
       <span class="qr-state">${c.status === 'validated' ? '✅ ' + new Date(c.validatedAt).toLocaleString('cs-CZ') : '⏳ čeká'}</span>`;
    frag.appendChild(d);
  });
  grid.appendChild(frag);
  if (!shown.length){ const p = document.createElement('p'); p.className = 'muted center'; p.textContent = 'Všechny kódy v této sadě jsou ověřené. 🎉'; grid.appendChild(p); }
  else if (shown.length > LIMIT){ const p = document.createElement('p'); p.className = 'muted center'; p.textContent = `Zobrazeno prvních ${LIMIT} z ${shown.length} kódů.`; grid.appendChild(p); }
}

/* Přehled uložených sad v záložce Inventura.
   Uživatel tak vidí uložený seznam i tam, kde skenuje, a může sadu rovnou otevřít. */
function renderActiveSet(){
  const box = $('activeSetBox'); if (!box) return;
  const sets = (state.labelSets || []).slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const open = currentSet();
  /* otevřená sada je vypsaná zvlášť – v seznamu už ji neopakujeme */
  const others = sets.filter(s => !open || s.id !== open.id);
  let html = '';
  if (open){
    const st = setStats(open);
    html += `<div class="active-set-now">
        <b>${escapeHtml(open.name)}</b>
        <span class="muted small">${st.total} kódů · ${labelSizeName(open.labelSize)}</span>
        <div class="set-row-meter">
          <div class="set-row-bar"><i style="width:${st.pct}%"></i></div>
          <span class="pill${st.done===st.total?' ok':''}">${st.done} / ${st.total} ověřeno</span>
        </div>
        <div class="row wrap">
          <button class="btn small secondary" data-openset="${escapeHtml(open.id)}">▲ Zavřít sadu</button>
        </div>
      </div>
      <p class="muted small">Tato sada je otevřená. Skenujte kamerou níže nebo zadejte kód ručně – každý kód se zapíše do sady i do inventury.</p>`;
  } else if (sets.length){
    html += `<p class="muted small">Máte uložené sady. Otevřete některou a skenujte – průběh ověření se ukládá.</p>`;
  } else {
    html += `<p class="muted small">Zatím žádná uložená sada. Vytvořte ji v záložce <b>Štítky</b> (tlačítko „Uložit sadu štítků“).<br>Sady se ukládají <b>do tohoto zařízení</b> – z počítače je do mobilu přenesete přes <b>Záloha JSON</b> (počítač) → <b>Obnova ze zálohy</b> (mobil).</p>`;
  }
  if (others.length){
    html += `<p class="muted small"><b>${open ? 'Další uložené sady' : 'Uložené sady'}</b></p>`
      + '<ul class="set-mini-list">' + others.map(s => {
      const st = setStats(s);
      return `<li class="set-mini-row">
        <span class="set-mini-name">${escapeHtml(s.name)}</span>
        <span class="muted small">${st.total} kódů</span>
        <span class="pill${st.done===st.total?' ok':''}">${st.done} / ${st.total}</span>
        <button class="btn small primary" data-openset="${escapeHtml(s.id)}">▶ Otevřít</button>
      </li>`;
    }).join('') + '</ul>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-openset]').forEach(b => {
    b.onclick = () => { toggleOpenSet(b.getAttribute('data-openset')); renderActiveSet(); };
  });
  const go = $('btnActiveSetGo');
  if (go) go.classList.toggle('hidden', !open);
}

// ---------- tabs ----------
function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
  // kamera může běžet jen v jedné záložce – při přepnutí ji uvolníme
  if(name!=='inventura'){ try{ stopScan(); }catch(e){} }
  if(name!=='stitky'){ try{ stopSetScan(); }catch(e){} }
  activeTabName = name;
  // Každá záložka si při přepnutí překreslí svůj obsah, aby vždy ukazovala aktuální stav.
  if(name==='seznam'){ renderStats(); renderTable(); renderLabelsPreview(); }
  else if(name==='stitky'){ renderLabelsPreview(); renderLabelSets(); }
  else if(name==='inventura'){ renderStats(); renderHistory(); renderActiveSet(); }
  persistUi();
}

// ---------- přihlášení / oprávnění (UI) ----------
const ROLE_LABELS = { admin: '👑 Admin', company: '🏢 Firma', guest: '👁️ Host (čtení)' };
function companyNameOf(id){ const c = demoCompanyList().find(c => c.id === id); return c ? c.name : id; }

function applySession(){
  const s = Auth.current(); if(!s) return;
  const roleEl = $('userRole');
  roleEl.textContent = ROLE_LABELS[s.role] || s.role;
  roleEl.className = 'role-badge role-' + s.role;
  $('userName').textContent = s.name;
  const av = $('userAvatar'); if(av) av.textContent = (s.name || '?').trim().charAt(0).toUpperCase();
  const sel = $('companySelect');
  sel.innerHTML = Auth.companyList().map(id => `<option value="${escapeHtml(id)}">${escapeHtml(companyNameOf(id))}</option>`).join('');
  sel.value = s.currentCompany;
  sel.disabled = Auth.companyList().length <= 1;
  sel.title = sel.disabled ? companyNameOf(s.currentCompany) : 'Přepnout firmu';
}
/* Zviditelní/skryje ovládací prvky podle role. Prvky s data-gate="edit" jsou jen pro editory. */
function applyPermissions(){
  const canEdit = Auth.canEdit();
  document.querySelectorAll('[data-gate="edit"]').forEach(el => {
    if(el.tagName === 'INPUT') el.disabled = !canEdit;
    else el.classList.toggle('hidden', !canEdit);
  });
  $('guestBanner').classList.toggle('hidden', !Auth.isGuest());
}
function showApp(){ $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); document.documentElement.classList.add('has-session'); document.body.classList.add('authed'); }
function showLogin(){ $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden'); document.documentElement.classList.remove('has-session'); document.body.classList.remove('authed'); $('loginPass').value=''; }
function enterApp(){ applySession(); load(); lastScannedId=null; restoreUi(); showApp(); applyPermissions(); render(); switchTab(activeTabName); }
function doLogout(){
  try{ stopScan(); }catch(e){}
  try{ stopSetScan(); }catch(e){}
  Auth.logout();
  state = emptyState(); lastScannedId = null; openSetId = null; activeTabName = 'seznam';
  $('tbody').innerHTML=''; $('history').innerHTML=''; $('lastScan').classList.add('hidden');
  $('loginError').classList.add('hidden'); $('loginError').textContent='';
  showLogin(); $('loginUser').focus();
}
function switchCompany(id){
  if(!Auth.switchCompany(id)){ toast('Na tuto firmu nemáte přístup', false); return; }
  try{ stopScan(); }catch(e){}
  try{ stopSetScan(); }catch(e){}
  applySession(); load(); lastScannedId=null; restoreUi(); applyPermissions(); render(); switchTab(activeTabName);
  toast('Firma: ' + companyNameOf(id));
}

// ---------- wiring ----------
window.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
  $('btnHelp').onclick=()=>$('dlgHelp').showModal();
  $('fileCsv').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ const rows=parseCsv(r.result); if(!rows.length){toast('CSV neobsahuje data',false);return;} generateFromRows(rows); }; r.readAsText(f,'UTF-8'); e.target.value=''; };
  $('btnDemo').onclick=()=>{ generateFromRows([{name:'stůl',count:3,years:'1',code:''},{name:'židle',count:5,years:'1',code:''},{name:'auto',count:2,years:'5',code:''},{name:'tiskárna',count:5,years:'2',code:''}]); };
  $('btnGenerate').onclick=()=>{ if(denyIfReadOnly())return; if(!state.items.length){toast('Nejprve nahrajte CSV nebo ukázková data',false);return;} save(); toast('Kódy přepočítány'); };
  $('btnClear').onclick=()=>{ if(denyIfReadOnly())return; if(confirm('Smazat všechna data?')){ state=emptyState(); save(); } };
  $('search').oninput=render; $('filterStatus').onchange=render;
  $('chkOnlyPending').onchange=renderLabelsPreview;
  $('btnPrint').onclick=doPrint;

  // sady štítků – uložení, otevření, ověření
  $('btnSaveSet').onclick=saveLabelSet;
  $('fileSetJson').onchange=e=>{ const f=e.target.files[0]; if(!f)return; importLabelSet(f); e.target.value=''; };
  $('btnCloseSet').onclick=()=>{ try{ stopSetScan(); }catch(err){} setOpenSet(null); closeSetBanner(); renderLabelSets(); renderActiveSet(); };
  $('btnActiveSetGo').onclick=()=>switchTab('stitky');
  $('btnExportSet').onclick=()=>{ const s=currentSet(); if(s) exportLabelSet(s.id); else toast('Není otevřená žádná sada', false); };
  $('btnResetSet').onclick=resetSetValidation;
  $('btnStartSetScan').onclick=startSetScan;
  $('btnStopSetScan').onclick=stopSetScan;
  $('chkSetBigQr').onchange=renderOpenSet;
  $('chkSetOnlyPending').onchange=renderOpenSet;
  $('btnSetManual').onclick=()=>{ handleSetScan($('setManualCode').value); $('setManualCode').value=''; $('setManualCode').focus(); };
  $('setManualCode').addEventListener('keydown',e=>{ if(e.key==='Enter'){ handleSetScan(e.target.value); e.target.value=''; } });
  $('btnExportCsv').onclick=exportCsv;
  $('btnExportJson').onclick=()=>download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'inventura-zaloha.json');
  $('fileJson').onchange=e=>{ const f=e.target.files[0]; if(!f)return; importFullBackup(f); e.target.value=''; };
  $('fileJson2').onchange=e=>{ const f=e.target.files[0]; if(!f)return; importFullBackup(f); e.target.value=''; };
  $('btnStartScan').onclick=startScan; $('btnStopScan').onclick=stopScan;
  $('btnFlip').onclick=async()=>{ camIndex++; await stopScan(); await startScan(); };
  $('btnManual').onclick=()=>{ handleScan($('manualCode').value); $('manualCode').value=''; $('manualCode').focus(); };
  $('manualCode').addEventListener('keydown',e=>{ if(e.key==='Enter'){ handleScan(e.target.value); e.target.value=''; } });
  $('btnUndo').onclick=()=>{ if(denyIfReadOnly())return; if(!lastScannedId){toast('Nic k vrácení',false);return;} const it=state.items.find(i=>i.id===lastScannedId); if(it){it.status='pending';it.foundAt=null;save();toast('Poslední sken vrácen');} lastScannedId=null; };
  $('btnResetScan').onclick=()=>{ if(denyIfReadOnly())return; if(confirm('Vynulovat výsledky inventury (kódy zůstanou)?')){ state.items.forEach(i=>{i.status='pending';i.foundAt=null;}); state.history=[]; save(); } };

  // přihlášení / odhlášení / přepnutí firmy
  $('loginForm').onsubmit=e=>{
    e.preventDefault();
    const res = Auth.login($('loginUser').value, $('loginPass').value);
    const err = $('loginError');
    if(!res.ok){ err.textContent='❌ '+res.error; err.classList.remove('hidden'); return; }
    err.textContent=''; err.classList.add('hidden');
    $('loginUser').value=''; $('loginPass').value='';
    enterApp();
    toast('Přihlášen: '+Auth.current().name);
  };
  $('btnLogout').onclick=()=>{ if(confirm('Odhlásit se?')) doLogout(); };
  $('companySelect').onchange=e=>switchCompany(e.target.value);

  // start aplikace – obnovení relace nebo přihlášení
  if(Auth.restore()){ enterApp(); } else { showLogin(); $('loginUser').focus(); }
});
