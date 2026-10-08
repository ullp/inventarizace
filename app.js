/* IQ-Čtečka – logika: CSV -> kusy -> QR kódy -> skenování -> persist */
'use strict';
const LS_KEY = 'iq-ctecka-v1';
let state = { items: [], lastId: 0, history: [], updatedAt: null };
let lastScannedId = null;
let html5Qr = null, cameras = [], camIndex = 0, scanning = false;

// ---------- persistence ----------
function save() { state.updatedAt = new Date().toISOString(); try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){} render(); }
function load() { try { const raw = localStorage.getItem(LS_KEY); if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.items)) state = s; } } catch(e){} }

// ---------- helpers ----------
const $ = id => document.getElementById(id);
function toast(msg, ok=true){ const t=$('toast'); t.textContent=msg; t.className='toast show '+(ok?'ok':'err'); setTimeout(()=>t.className='toast',2600); }
function beep(ok=true){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(), g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=ok?880:220; o.type=ok?'sine':'sawtooth'; g.gain.value=0.15; o.start(); setTimeout(()=>{o.stop();ctx.close();}, ok?150:400);}catch(e){} if(navigator.vibrate) navigator.vibrate(ok?50:[80,60,80]); }
function norm(s){ return (s||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function pad(n,l=4){ return String(n).padStart(l,'0'); }
function uid(){ return 'u'+(++state.lastId)+'-'+Date.now().toString(36); }

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
function render(){
  const total=state.items.length, found=state.items.filter(i=>i.status==='found').length;
  $('progressMini').textContent=`${found} / ${total}`;
  $('progressText').textContent= total?`${found} z ${total} kusů nalezeno • zbývá ${total-found}`:'Nenahrán žádný seznam';
  const pct=total?Math.round(found/total*100):0;
  $('progressPct').textContent=pct+'%'; $('progressBar').style.width=pct+'%';
  $('statTotal').textContent=total; $('statFound').textContent=found; $('statPending').textContent=total-found;
  // table
  const rows=filtered(), tb=$('tbody'); tb.innerHTML='';
  $('emptyMsg').style.display=rows.length?'none':'block';
  const frag=document.createDocumentFragment();
  rows.slice(0,500).forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><b class="mono">${escapeHtml(it.code)}</b></td><td>${escapeHtml(it.name)} <span class="muted">#${it.idx}</span></td><td class="muted">${escapeHtml(it.group||'')} ${it.years?`· ${escapeHtml(it.years)}r`:''}</td><td>${it.status==='found'?'<span class="pill ok">✅ Nalezeno</span>':'<span class="pill">⏳ Čeká</span>'}</td><td class="muted small">${it.foundAt?new Date(it.foundAt).toLocaleString('cs-CZ'):''}</td>`;
    const td=document.createElement('td');
    const b=document.createElement('button'); b.className='btn small secondary'; b.textContent=it.status==='found'?'↩️':'✔️';
    b.title=it.status==='found'?'Vrátit':'Označit ručně';
    b.onclick=()=>{ toggleItem(it.id); };
    td.appendChild(b); tr.appendChild(td); frag.appendChild(tr);
  });
  tb.appendChild(frag);
  if(rows.length>500) toast('Zobrazeno prvních 500 řádků, použijte filtr/hledání', true);
  // history
  const h=$('history'); h.innerHTML='';
  [...state.history].slice(-10).reverse().forEach(ev=>{
    const li=document.createElement('li');
    li.className='hist '+(ev.result==='found'?'ok':ev.result==='duplicate'?'dup':'err');
    li.innerHTML=`<b class="mono">${escapeHtml(ev.code)}</b> ${escapeHtml(ev.name||'')} <span class="muted">${new Date(ev.at).toLocaleTimeString('cs-CZ')}</span> – ${ev.result==='found'?'✅ nalezeno':ev.result==='duplicate'?'⚠️ duplicitní sken':'❌ neznámý kód'}`;
    h.appendChild(li);
  });
  renderLabelsPreview();
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toggleItem(id){ const it=state.items.find(i=>i.id===id); if(!it)return;
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

// ---------- scanning ----------
function findByCode(code){ const c=(code||'').trim(); return state.items.find(i=>i.code.toLowerCase()===c.toLowerCase()); }
function handleScan(raw){
  const code=(raw||'').trim(); if(!code) return;
  const it=findByCode(code);
  const box=$('lastScan'); box.classList.remove('hidden');
  if(!it){ beep(false); box.className='last-scan err'; box.innerHTML=`❌ <b class="mono">${escapeHtml(code)}</b> – neznámý kód (není v seznamu)`; pushHist(code,'','unknown'); return; }
  if(it.status==='found'){ beep(true); box.className='last-scan dup'; box.innerHTML=`⚠️ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(it.name)} – již naskenováno v ${new Date(it.foundAt).toLocaleTimeString('cs-CZ')}`; pushHist(code,it.name,'duplicate'); render(); return; }
  it.status='found'; it.foundAt=new Date().toISOString(); lastScannedId=it.id;
  pushHist(code,it.name,'found'); save(); beep(true);
  box.className='last-scan ok'; box.innerHTML=`✅ <b class="mono">${escapeHtml(code)}</b> ${escapeHtml(it.name)} #${it.idx} – spárováno!`;
}
function pushHist(code,name,result){ state.history.push({code,name,result,at:new Date().toISOString()}); if(state.history.length>500) state.history=state.history.slice(-500); try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){} }
async function startScan(){
  if(!state.items.length){ toast('Nejprve nahrajte seznam majetku', false); switchTab('seznam'); return; }
  if(typeof Html5Qrcode==='undefined'){ toast('Knihovna skeneru se nenačetla (nutný internet při prvním otevření)', false); return; }
  try{
    if(!html5Qr) html5Qr=new Html5Qrcode('reader');
    cameras=await Html5Qrcode.getCameras();
    const cfg={fps:10, qrbox:{width:260,height:260}, aspectRatio:1.0};
    let camId=null;
    if(cameras.length){ camId=cameras[camIndex%cameras.length].id; }
    await html5Qr.start(camId?{deviceId:{exact:camId}}:{facingMode:'environment'}, cfg, handleScan, ()=>{});
    scanning=true; $('btnStartScan').disabled=true; $('btnStopScan').disabled=false; $('btnFlip').disabled=cameras.length<2;
    $('scanHint').textContent='Namiřte na QR štítek…';
  }catch(e){ toast('Kameru se nepodařilo spustit: '+e, false); $('scanHint').textContent='Povolte přístup ke kameře a použijte HTTPS.'; }
}
async function stopScan(){ try{ if(html5Qr&&scanning) await html5Qr.stop(); }catch(e){} scanning=false; $('btnStartScan').disabled=false; $('btnStopScan').disabled=true; }

// ---------- export/import ----------
function exportCsv(){
  const head='inventární kód;název;skupina;stav;čas nálezu;odpis let';
  const lines=state.items.map(i=>[i.code,i.name,i.group,i.status==='found'?'nalezeno':'nenalezeno',i.foundAt?new Date(i.foundAt).toLocaleString('cs-CZ'):'',i.years||''].map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(';'));
  download(new Blob(['\uFEFF'+head+'\n'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),'inventura-vysledek.csv');
}
function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }

// ---------- tabs ----------
function switchTab(name){ document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name)); document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name)); if(name==='stitky') renderLabelsPreview(); }

// ---------- wiring ----------
window.addEventListener('DOMContentLoaded',()=>{
  load(); render();
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
  $('btnHelp').onclick=()=>$('dlgHelp').showModal();
  $('fileCsv').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ const rows=parseCsv(r.result); if(!rows.length){toast('CSV neobsahuje data',false);return;} generateFromRows(rows); }; r.readAsText(f,'UTF-8'); e.target.value=''; };
  $('btnDemo').onclick=()=>{ generateFromRows([{name:'stůl',count:3,years:'1',code:''},{name:'židle',count:5,years:'1',code:''},{name:'auto',count:2,years:'5',code:''},{name:'tiskárna',count:5,years:'2',code:''}]); };
  $('btnGenerate').onclick=()=>{ if(!state.items.length){toast('Nejprve nahrajte CSV nebo ukázková data',false);return;} save(); toast('Kódy přepočítány'); };
  $('btnClear').onclick=()=>{ if(confirm('Smazat všechna data?')){ state={items:[],lastId:0,history:[],updatedAt:null}; save(); } };
  $('search').oninput=render; $('filterStatus').onchange=render;
  $('chkOnlyPending').onchange=renderLabelsPreview;
  $('btnPrint').onclick=doPrint;
  $('btnExportCsv').onclick=exportCsv;
  $('btnExportJson').onclick=()=>download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'inventura-zaloha.json');
  $('fileJson').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const s=JSON.parse(r.result); if(s.items){state=s;save();toast('Záloha obnovena');} }catch(err){toast('Neplatný JSON',false);} }; r.readAsText(f); e.target.value=''; };
  $('btnStartScan').onclick=startScan; $('btnStopScan').onclick=stopScan;
  $('btnFlip').onclick=async()=>{ camIndex++; await stopScan(); await startScan(); };
  $('btnManual').onclick=()=>{ handleScan($('manualCode').value); $('manualCode').value=''; $('manualCode').focus(); };
  $('manualCode').addEventListener('keydown',e=>{ if(e.key==='Enter'){ handleScan(e.target.value); e.target.value=''; } });
  $('btnUndo').onclick=()=>{ if(!lastScannedId){toast('Nic k vrácení',false);return;} const it=state.items.find(i=>i.id===lastScannedId); if(it){it.status='pending';it.foundAt=null;save();toast('Poslední sken vrácen');} lastScannedId=null; };
  $('btnResetScan').onclick=()=>{ if(confirm('Vynulovat výsledky inventury (kódy zůstanou)?')){ state.items.forEach(i=>{i.status='pending';i.foundAt=null;}); state.history=[]; save(); } };
});
