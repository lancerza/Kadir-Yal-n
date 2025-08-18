/* ========================= app.js =========================
   - JW → JW+Proxy → hls.js → hls.js+Proxy → dash.js → MP4
   - ARIA Tabs + roving tabindex, empty state, Histats via MutationObserver
   - ลบ utils ซ้ำ
=============================================================*/

const CH_URL  = 'channels.json';
const CAT_URL = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS   = 140;
const STAGGER_STEP_MS = 22;
const JW_FIRSTFRAME_TIMEOUT = 4000; // ถ้าไม่ขึ้นเฟรมแรกในเวลา X → fallback

let categories = null;
let channels   = [];
let currentFilter = null;
let currentIndex  = -1;
let lastTriedUrl  = ''; // สำหรับปุ่ม “เปิดลิงก์ดิบ”

jwplayer.key = jwplayer.key || 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo';

/* ------------------------ Boot ------------------------ */
(async function boot(){
  scheduleAutoClear();
  mountClock();
  mountNowPlayingInHeader();
  mountHistatsTopRight();
  mountRefreshButton();

  try { await loadData(); }
  catch (e) { console.error('โหลดข้อมูลไม่สำเร็จ:', e); setBanner('โหลดข้อมูลไม่สำเร็จ'); }

  buildTabs();
  restoreLastOrPlayFirst();
  centerTabsIfPossible();
  addPlayerLinkZone();
  window.addEventListener('resize', debounce(centerTabsIfPossible, 150));
})();

async function loadData(){
  const [chRes, catRes] = await Promise.all([fetchJSONFresh(CH_URL), fetchJSONFresh(CAT_URL)]);
  channels = Array.isArray(chRes) ? chRes : (chRes?.channels || []);
  categories = catRes || { order:['IPTV'], default:'IPTV', rules:[] };
}
function fetchJSONFresh(url){
  return fetch(`${url}?_=${Date.now()}`, { cache:'no-store' }).then(r=>r.json());
}

/* ------------------------ Restore / First Play ------------------------ */
function restoreLastOrPlayFirst(){
  const lastId = safeGet('lastId');
  if (lastId){
    const idx = channels.findIndex((ch,i)=> genIdFrom(ch,i)===lastId );
    if (idx>=0){
      const cat = getCategory(channels[idx]);
      setActiveTab(cat);
      requestAnimationFrame(()=> playIndex(idx, {scrollToCard:true}) );
      return;
    }
  }
  setActiveTab(categories?.order?.[0] || categories?.default || 'IPTV');
  const firstIdx = channels.findIndex(ch=> getCategory(ch) === currentFilter);
  if (firstIdx>=0) playIndex(firstIdx, {scrollToCard:true});
}

/* ------------------------ Player Core ------------------------ */
function playIndex(globalIndex, opt={scrollToCard:false}){
  clearBanner();
  const ch = channels[globalIndex]; if(!ch) return;
  currentIndex = globalIndex;
  window.__setNowPlaying?.(ch?.name || '');
  showMobileToast(ch?.name || '');

  const list = (ch.sources && Array.isArray(ch.sources) && ch.sources.length>0)
    ? ch.sources : [{ src: ch.src || ch.file, type: ch.type }];

  tryJWChain(ch, list);
  highlight(globalIndex);
  if (opt.scrollToCard) revealActiveCardIntoView();
  scrollToPlayer();
}

function tryJWChain(ch, list, triedProxy=false, idx=0){
  if (idx >= list.length) {
    console.warn('ทุกแหล่งบน JW ไม่สำเร็จ → fallback');
    return fallbackChain(ch, list, triedProxy);
  }

  const s = list[idx];
  const src = finalizeUrl(s, {...ch, proxy: triedProxy});
  lastTriedUrl = src;
  destroyNative();
  ensurePlayerLinkZone(src);

  const player = jwplayer('player').setup({
    playlist: [{ image: ch.poster || ch.logo || undefined, sources: [{ file: src, type: (s.type || detectType(src)).toLowerCase(), withCredentials: !!ch.withCredentials }] }],
    width:'100%', aspectratio:'16:9', autostart:true,
    mute: isMobile(), preload:'metadata',
    displaytitle:false, displaydescription:false,
    playbackRateControls:true
  });

  let gotFirstFrame = false;
  const timeout = setTimeout(()=> {
    if (!gotFirstFrame) {
      console.warn('JW timeout → ลองถัดไป');
      player.remove();
      // ถ้ายังไม่ได้ลอง proxy และมี PROXY_BASE → ลอง JW + Proxy
      if (!triedProxy && window.PROXY_BASE && ch.proxy !== false) {
        return tryJWChain(ch, list, true, idx);
      }
      return tryJWChain(ch, list, triedProxy, idx+1);
    }
  }, JW_FIRSTFRAME_TIMEOUT);

  player.once('firstFrame', ()=>{ gotFirstFrame = true; clearTimeout(timeout); clearBanner(); });
  player.once('playAttemptFailed', ()=>{ player.setMute(true); player.play(true); });

  player.on('setupError', (e)=>{ clearTimeout(timeout); console.warn('JW setupError', e);
    if (!triedProxy && window.PROXY_BASE && ch.proxy !== false) return tryJWChain(ch, list, true, idx);
    tryJWChain(ch, list, triedProxy, idx+1);
  });

  player.on('error', (e)=>{ clearTimeout(timeout); console.warn('JW error', e);
    if (!triedProxy && window.PROXY_BASE && ch.proxy !== false) return tryJWChain(ch, list, true, idx);
    tryJWChain(ch, list, triedProxy, idx+1);
  });

  setBanner('กำลังโหลด…');
}

/* ------------------------ Fallback chain ------------------------ */
function fallbackChain(ch, list, alreadyTriedProxy=false){
  const choose = (want)=> list.find(s => detectType((s.src||s.file||'')).startsWith(want));
  const hls = choose('hls') || list[0];
  const dash = choose('dash');
  const mp4 = list.find(s => /\.mp4(\?|$)/i.test(s.src||s.file||'')) || list[0];

  // 1) hls.js
  if (hls && playWithHlsJs(finalizeUrl(hls, ch), !!ch.withCredentials)) { clearBanner(); return; }
  // 2) hls.js + Proxy
  if (!alreadyTriedProxy && window.PROXY_BASE && ch.proxy !== false) {
    const via = finalizeUrl(hls || list[0], {...ch, proxy:true});
    if (playWithHlsJs(via, !!ch.withCredentials)) { clearBanner(); return; }
  }
  // 3) dash.js
  if (dash && playWithDashJs(finalizeUrl(dash, ch))) { clearBanner(); return; }
  // 4) MP4 native
  if (mp4 && playWithNativeMP4(finalizeUrl(mp4, ch))) { clearBanner(); return; }

  setBanner('เล่นไม่สำเร็จ');
  window.__setNowPlaying?.(`เล่นไม่สำเร็จ: ${ch?.name||''}`);
  showMobileToast('เล่นไม่สำเร็จ');
}

/* ------------------------ Fallback players ------------------------ */
function ensureVideoEl(){
  const host = document.getElementById('player');
  destroyJW(); host.querySelector('.p-banner')||host.appendChild(document.createElement('div')); // keep banner position
  const old = host.querySelector('video.player-video'); if (old) { try{old.pause()}catch{}; old.remove(); }
  const v = document.createElement('video');
  v.className = 'player-video'; v.setAttribute('playsinline',''); v.setAttribute('controls','');
  v.muted = isMobile(); host.appendChild(v);
  return v;
}
function destroyJW(){ try{ jwplayer('player').remove(); }catch{} }
function destroyNative(){ const v=document.querySelector('#player video.player-video'); if(v){ try{v.pause()}catch{}; v.remove(); } }

/* HLS */
function playWithHlsJs(url, withCreds){
  try{
    lastTriedUrl = url; ensurePlayerLinkZone(url);
    const v = ensureVideoEl();
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(()=>{}); return true; }
    if (window.Hls && Hls.isSupported()){
      const hls = new Hls({
        lowLatencyMode:true, enableWorker:true,
        xhrSetup: (xhr)=>{ if(withCreds) xhr.withCredentials = true; }
      });
      hls.on(Hls.Events.ERROR, (_, data)=>{ console.warn('hls.js error', data?.type, data?.details); setBanner('สัญญาณมีปัญหา'); });
      hls.loadSource(url); hls.attachMedia(v); v.play().catch(()=>{});
      return true;
    }
  }catch(e){ console.warn('fallback HLS fail', e); }
  return false;
}
/* DASH */
function playWithDashJs(url){
  try{
    lastTriedUrl = url; ensurePlayerLinkZone(url);
    if (!window.dashjs) return false;
    const v = ensureVideoEl(); const p = dashjs.MediaPlayer().create();
    p.on('error', (e)=>{ console.warn('dash.js error', e); setBanner('สัญญาณมีปัญหา'); });
    p.initialize(v, url, true); return true;
  }catch(e){ console.warn('fallback DASH fail', e); return false; }
}
/* MP4 (progressive) */
function playWithNativeMP4(url){
  try{
    lastTriedUrl = url; ensurePlayerLinkZone(url);
    const v = ensureVideoEl(); v.src = url; v.play().catch(()=>{}); return true;
  }catch(e){ return false; }
}

/* ------------------------ Helpers (general) ------------------------ */
function finalizeUrl(s, ch){ return wrapWithProxyIfNeeded((s.src||s.file||''), ch); }
function detectType(u){ u=(u||'').split('?')[0].toLowerCase(); if(u.endsWith('.m3u8'))return'hls'; if(u.endsWith('.mpd'))return'dash'; if(u.endsWith('.mp4'))return'auto'; return u.includes('.m3u8')?'hls':(u.includes('.mpd')?'dash':'auto'); }
function wrapWithProxyIfNeeded(url, ch){
  if (window.PROXY_BASE && (ch.proxy || false)) {
    const payload = { src:url, referrer: ch.referrer||'', ua: ch.ua||'', headers: ch.headers||{} };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${window.PROXY_BASE}/p/${b64}`;
  }
  return url;
}

/* ------------------------ UI helpers ------------------------ */
function highlight(globalIndex){
  document.querySelectorAll('.channel').forEach(el=>{
    const idx = Number(el.dataset.globalIndex);
    const on = (idx === globalIndex);
    el.setAttribute('aria-pressed', on?'true':'false');
    el.classList.toggle('active', on);
  });
}
function debounce(fn,wait=150){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function escapeHtml(s){return String(s).replace(/[&<>"'`=\/]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c]))}
function safeGet(k){try{return localStorage.getItem(k)}catch{return null}}
function safeSet(k,v){try{localStorage.setItem(k,v)}catch{}}
function genIdFrom(ch,i){return (ch.name?.toString().trim()||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'')+'-'+i}
function isMobile(){return /iPhone|iPad|Android/i.test(navigator.userAgent)}
function scrollToPlayer(){
  const el = document.getElementById('player');
  const header = document.querySelector('header');
  const y = el.getBoundingClientRect().top + window.pageYOffset - ((header?.offsetHeight)||0) - 8;
  window.scrollTo({ top:y, behavior:'smooth' });
}

/* ripple (คงไว้) */
function ripple(container,x,y){const m=Math.max(container.clientWidth,container.clientHeight);const s=document.createElement('span');s.className='ripple';s.style.width=s.style.height=`${m}px`;s.style.left=`${x-m/2}px`;s.style.top=`${y-m/2}px`;container.querySelector('.ripple')?.remove();container.appendChild(s);s.addEventListener('animationend',()=>s.remove(),{once:true});}

/* ------------------------ Icons (เรียบง่าย) ------------------------ */
function getIconSVG(){const c='currentColor';return `<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><rect x="3" y="6" width="18" height="12" rx="2" stroke="${c}" stroke-width="2"/><path d="M9 20h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`}

/* ------------------------ Tabs ------------------------ */
function buildTabs(){
  const root = document.getElementById('tabs'); if(!root) return;
  root.innerHTML = '';
  (categories?.order || []).forEach(name=>{
    const btn = document.createElement('button');
    btn.className = 'tab'; btn.dataset.filter=name;
    btn.setAttribute('role','tab'); btn.setAttribute('aria-selected','false');
    btn.setAttribute('tabindex','-1'); btn.setAttribute('aria-controls','channel-list');
    btn.innerHTML = `<span class="tab-card"><span class="tab-icon">${getIconSVG()}</span><span class="tab-label">${name}</span></span>`;
    root.appendChild(btn);
  });
  wireTabs(root);
}
function wireTabs(root){
  root.addEventListener('click', e=>{
    const b = e.target.closest('.tab'); if(!b) return;
    setActiveTab(b.dataset.filter);
  });
  root.addEventListener('keydown', e=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    const all = Array.from(root.querySelectorAll('.tab'));
    const i = all.findIndex(b=>b.getAttribute('aria-selected')==='true');
    let n = e.key==='ArrowRight' ? i+1 : e.key==='ArrowLeft' ? i-1 : (e.key==='Home' ? 0 : all.length-1);
    if(n<0) n = all.length-1; if(n>=all.length) n = 0;
    all[n].focus(); setActiveTab(all[n].dataset.filter); e.preventDefault();
  });
}
function setActiveTab(name){
  currentFilter = name;
  const root = document.getElementById('tabs');
  root.querySelectorAll('.tab').forEach(b=>{
    const sel=b.dataset.filter===name; b.setAttribute('aria-selected', sel?'true':'false'); b.setAttribute('tabindex', sel?'0':'-1');
    if(sel) b.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
  });
  const grid = ensureGrid(); grid.classList.add('switch-out');
  setTimeout(()=>{ grid.classList.remove('switch-out'); render({withEnter:true}); }, SWITCH_OUT_MS);
}
function centerTabsIfPossible(){
  const el = document.getElementById('tabs'); if(!el) return;
  el.classList.toggle('tabs--center', el.scrollWidth <= el.clientWidth + 1);
}

/* ------------------------ Categories ------------------------ */
function getCategory(ch){
  if (ch.category) return ch.category;
  if (Array.isArray(ch.tags)) {
    const t = ch.tags.map(x=>String(x).toLowerCase());
    if (t.includes('sports')) return 'กีฬา';
    if (t.includes('documentary')) return 'สารคดี';
    if (t.includes('movie') || t.includes('film')) return 'หนัง';
    if (t.includes('music')) return 'บันเทิง';
    if (t.includes('news'))  return 'IPTV';
    if (t.includes('kids') || t.includes('cartoon') || t.includes('anime')) return 'เด็ก';
  }
  const hay = `${ch.name||''} ${ch.logo||''} ${JSON.stringify(ch.tags||[])}`.toLowerCase();
  const src0 = String((ch.sources?.[0]?.src) || ch.src || ch.file || '').toLowerCase();
  for (const r of (categories?.rules || [])) {
    const ok = (r.include||[]).some(pat=>{
      try {
        if (pat.startsWith('/') && pat.endsWith('/')) return new RegExp(pat.slice(1,-1),'i').test(hay) || new RegExp(pat.slice(1,-1),'i').test(src0);
        const p = pat.toLowerCase(); return hay.includes(p) || src0.includes(p);
      } catch { return false; }
    });
    if (ok) return r.category;
  }
  return categories?.default || 'IPTV';
}
function useWideLogo(ch){
  if (ch.logoWide) return true;
  const cat = getCategory(ch);
  const rule = (categories?.rules||[]).find(r=>r.category===cat && r.useWideLogo);
  return !!rule;
}

/* ------------------------ Grid ------------------------ */
function ensureGrid(){ const grid = document.getElementById('channel-list'); if (!grid.classList.contains('grid')) grid.classList.add('grid'); return grid; }
function render(opt={withEnter:false}){
  const grid = ensureGrid(); grid.innerHTML='';
  const list = channels.filter(c => getCategory(c) === currentFilter);
  if (list.length===0){ showEmptyState('ไม่มีช่องในหมวดนี้'); return; }
  list.forEach((ch)=>{
    const btn = document.createElement('button');
    btn.className='channel'; btn.dataset.category=getCategory(ch);
    btn.dataset.globalIndex=String(channels.indexOf(ch));
    if (useWideLogo(ch)) btn.dataset.wide='true';
    btn.title=ch.name||'ช่อง'; btn.setAttribute('aria-label',`เล่นช่อง ${ch.name||'ไม่ทราบชื่อ'}`);
    btn.innerHTML=`<div class="ch-card"><div class="logo-wrap"><img class="logo" loading="lazy" decoding="async" src="${escapeHtml(ch.logo||'')}" alt="${escapeHtml(ch.name||'โลโก้ช่อง')}"></div><span class="name">${escapeHtml(ch.name||'')}</span></div>`;
    btn.addEventListener('click',(e)=>{ const r=e.currentTarget; const rect=r.getBoundingClientRect(); ripple(r.querySelector('.ch-card'), e.clientX-rect.left, e.clientY-rect.top);
      playIndex(Number(r.dataset.globalIndex)); safeSet('lastId', genIdFrom(ch, channels.indexOf(ch))); });
    grid.appendChild(btn);
  });
  grid.style.setProperty('--stagger', `${STAGGER_STEP_MS}ms`);
  if (opt.withEnter){ grid.classList.add('switch-in'); setTimeout(()=> grid.classList.remove('switch-in'), 900); }
  highlight(currentIndex);
}
function showEmptyState(msg='ไม่พบรายการช่อง'){ const grid = ensureGrid(); grid.innerHTML = `<div style="padding:24px 12px;opacity:.8;text-align:center">${escapeHtml(msg)}</div>`; }

/* ------------------------ Clock / Now Playing ------------------------ */
function mountClock(){
  const el = document.getElementById('clock'); if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = new Intl.DateTimeFormat('th-TH',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:TIMEZONE}).format(now).replace(',', '');
  };
  tick(); setInterval(tick, 1000);
}
function mountNowPlayingInHeader(){
  const host = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  let now = document.getElementById('now-playing'); if (!now) { now = document.createElement('div'); now.id = 'now-playing'; }
  now.className='now-playing'; now.setAttribute('aria-live','polite'); host.appendChild(now);
  window.__setNowPlaying = (name='')=>{ now.textContent = name || ''; now.title = name || ''; now.classList.remove('swap'); void now.offsetWidth; now.classList.add('swap'); };
}

/* ------------------------ Histats ------------------------ */
function mountHistatsTopRight(){
  const holder = document.getElementById('histats_counter'); if (!holder) return;
  const tryMove = ()=>{ const c=document.getElementById('histatsC'); if(c && !holder.contains(c)) holder.appendChild(c); };
  tryMove(); new MutationObserver(()=>tryMove()).observe(document.body, { childList:true, subtree:true });
}

/* ------------------------ Refresh / Cache ------------------------ */
function mountRefreshButton(){
  const btn = document.getElementById('refresh-btn'); if (!btn) return;
  btn.addEventListener('click', async ()=>{
    try{ btn.disabled = true; btn.querySelector('.t').textContent = 'กำลังรีเฟรช...'; await clearAppCache(); location.reload(); }
    finally{ btn.disabled = false; }
  });
}
async function clearAppCache(){
  try{ const del=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; if(/^(jwplayer|jwSettings|hls|dash)/i.test(k)) del.push(k); } del.forEach(k=> localStorage.removeItem(k)); }catch{}
  if ('caches' in window) { try{ const names = await caches.keys(); for (const n of names) await caches.delete(n); }catch{} }
}
function scheduleAutoClear(){
  const SIX_HR_MS=21600000, KEY='autoClearAt';
  const last=Number(safeGet(KEY))||0, now=Date.now();
  const delay=Math.max(1000, SIX_HR_MS - ((now-last)%SIX_HR_MS||0));
  setTimeout(function tick(){ clearAppCache(); localStorage.setItem(KEY,String(Date.now())); setTimeout(tick,SIX_HR_MS); }, delay);
}

/* ------------------------ Player banner & link ------------------------ */
function setBanner(msg){ clearBanner(); const p=document.getElementById('player'); const d=document.createElement('div'); d.className='p-banner'; d.textContent=msg; p.appendChild(d); }
function clearBanner(){ const b=document.querySelector('#player .p-banner'); if(b) b.remove(); }
function addPlayerLinkZone(){ const p=document.getElementById('player'); const z=document.createElement('div'); z.className='p-link'; z.innerHTML='<a id="open-raw" href="#" target="_blank" rel="noopener">เปิดลิงก์ดิบ</a>'; p.appendChild(z); }
function ensurePlayerLinkZone(url){ const a=document.getElementById('open-raw'); if(a){ a.href = url||'#'; } }
