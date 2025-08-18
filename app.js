/* ========================= app.js (FINAL) =========================
   - เปิดเว็บใหม่: ถ้ามี lastId → เล่นช่องนั้น + โชว์การ์ด/เลื่อนให้เห็น
                   ถ้าไม่มี → เล่นช่องแรกของหมวดแรก
   - ปุ่มรีเฟรช: ล้าง cache แอป (ไม่ลบ lastId) แล้วโหลดข้อมูลใหม่
   - เคลียร์แคชอัตโนมัติทุก 6 ชม. (ไม่พึ่งเซิร์ฟเวอร์)
   - now-playing อยู่ตำแหน่งเดิมใน header (ไม่มีกรอบ)
   - Histats ยึดมุมขวา header, กันโหลดซ้ำ, ไม่ลอยทับหน้า
   - Tabs เอฟเฟกต์ครบ + label/ไอคอนใหญ่ขึ้น + จัดกึ่งกลางแบบแม่น (มี tolerance)
=================================================================== */

const CH_URL  = 'channels.json';
const CAT_URL = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS   = 140;
const STAGGER_STEP_MS = 22;

const SHOW_LOGOS = true;        // เปิด/ปิดการแสดงโลโก้ช่อง
const USE_LOGO_PROXY = false;   // ถ้าใช้รูปข้ามโดเมนแล้วโดนบล็อก hotlink ให้ true และตั้ง PROXY_BASE
const PROXY_BASE = window.PROXY_BASE || '';

let categories = null;
let channels   = [];
let currentFilter = '';
let currentIndex  = -1;
let didInitialReveal = false;

try { if (window.jwplayer) jwplayer.key = jwplayer.key || 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo'; } catch {}

/* ------------------------ Boot ------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!SHOW_LOGOS) document.documentElement.classList.add('no-logos');

  mountRefreshButton();
  scheduleAutoClear();

  mountClock();
  mountNowPlayingInHeader();
  mountHistatsTopRight();

  try { await loadData(); }
  catch (e) { console.error('โหลดข้อมูลไม่สำเร็จ:', e); window.__setNowPlaying?.('โหลดข้อมูลไม่สำเร็จ'); }

  buildTabs();
  resumeLastOrAutoplayFirst();

  centerTabsIfPossible();
  addEventListener('resize', debounce(centerTabsIfPossible,150));
  addEventListener('load', centerTabsIfPossible);
  if (document.fonts?.ready) document.fonts.ready.then(centerTabsIfPossible);
});

/* ------------------------ Load (fresh) ------------------------ */
async function fetchJSONFresh(url){
  const u = new URL(url, location.href);
  u.searchParams.set('_t', String(Date.now()));
  const res = await fetch(u.toString(), { cache:'no-store' });
  if (!res.ok) throw new Error('Fetch failed: ' + url + ' (' + res.status + ')');
  return res.json();
}
async function loadData(){
  const [catRes, chRes] = await Promise.all([
    fetchJSONFresh(CAT_URL).catch(()=>null),
    fetchJSONFresh(CH_URL)
  ]);

  categories = catRes || {
    order: ['IPTV','บันเทิง','กีฬา','สารคดี','เด็ก','หนัง'],
    default: 'IPTV',
    rules: []
  };

  channels = Array.isArray(chRes) ? chRes : (chRes?.channels || []);
  channels.forEach((c,i)=>{ if(!c.id) c.id = genIdFrom(c, i); });
}

/* ------------------------ Resume / Autoplay + Reveal card ------------------------ */
function resumeLastOrAutoplayFirst(){
  const firstCat = (categories?.order?.[0]) || categories?.default || 'IPTV';
  const lastId = safeGet('lastId');

  if (lastId){
    const idx = channels.findIndex(c => c.id === lastId);
    if (idx >= 0){
      const cat = getCategory(channels[idx]);
      setActiveTab(cat);
      playByIndex(idx, { scroll:false });
      scheduleRevealActiveCard();
      return;
    }
  }
  setActiveTab(firstCat);
  const firstIdx = channels.findIndex(c => getCategory(c) === firstCat);
  if (firstIdx >= 0) {
    playByIndex(firstIdx, { scroll:false });
    scheduleRevealActiveCard();
  }
}
function scheduleRevealActiveCard(){
  if (didInitialReveal) return;
  didInitialReveal = true;
  setTimeout(()=> revealActiveCardIntoView(), SWITCH_OUT_MS + 220);
}
function revealActiveCardIntoView(){
  const active = document.querySelector('.channel[aria-pressed="true"], .channel.active');
  if (!active) { setTimeout(revealActiveCardIntoView, 120); return; }
  const header = document.querySelector('header');
  const pad = 80;
  const y = active.getBoundingClientRect().top + window.pageYOffset - ((header?.offsetHeight)||0) - pad;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/* ------------------------ Header: Clock + Now Playing ------------------------ */
function mountClock(){
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = new Intl.DateTimeFormat('th-TH',{
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
      hour12:false, timeZone: TIMEZONE
    }).format(now).replace(',', '');
  };
  tick();
  setInterval(tick, 1000);
}
function mountNowPlayingInHeader(){
  const host = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  let now = document.getElementById('now-playing');
  if (!now) { now = document.createElement('div'); now.id = 'now-playing'; }
  now.className = 'now-playing'; now.setAttribute('aria-live','polite');
  host.appendChild(now);
  window.__setNowPlaying = (name='')=>{
    now.textContent = name || '';
    now.title = name || '';
    now.classList.remove('swap'); void now.offsetWidth; now.classList.add('swap');
  };
}

/* ------------------------ Tabs ------------------------ */
function buildTabs(){
  const root = document.getElementById('tabs'); if(!root) return;
  root.innerHTML = '';
  (categories?.order || []).forEach(name=>{
    const btn = document.createElement('button');
    btn.className = 'tab'; btn.dataset.filter = name;
    btn.setAttribute('aria-selected','false');
    btn.innerHTML = `
      <span class="tab-card">
        <span class="tab-icon">${getIconSVG(name)}</span>
        <span class="tab-label">${name}</span>
      </span>`;
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
    if(e.key!=='ArrowRight' && e.key!=='ArrowLeft') return;
    const all = Array.from(root.querySelectorAll('.tab'));
    const i = all.findIndex(b=>b.getAttribute('aria-selected')==='true');
    let n = e.key==='ArrowRight' ? i+1 : i-1;
    if(n<0) n = all.length-1; if(n>=all.length) n = 0;
    all[n].focus(); setActiveTab(all[n].dataset.filter); e.preventDefault();
  });
}
function setActiveTab(name){
  currentFilter = name;
  const root = document.getElementById('tabs');
  root.querySelectorAll('.tab').forEach(b=>{
    const sel = b.dataset.filter===name;
    b.setAttribute('aria-selected', sel?'true':'false');
    if(sel) b.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
  });

  const grid = ensureGrid();
  grid.classList.add('switch-out');
  setTimeout(()=>{
    grid.classList.remove('switch-out');
    render({withEnter:true});
  }, SWITCH_OUT_MS);
}
function centerTabsIfPossible(){
  const el = document.getElementById('tabs'); if(!el) return;
  const TOL = 24; // เผื่อ padding/scrollbar/ฟอนต์
  el.classList.toggle('tabs--center', el.scrollWidth <= el.clientWidth + TOL);
}

/* ------------------------ Category logic ------------------------ */
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
        if (pat.startsWith('/') && pat.endsWith('/')) {
          const re = new RegExp(pat.slice(1,-1),'i');
          return re.test(hay) || re.test(src0);
        }
        const p = pat.toLowerCase();
        return hay.includes(p) || src0.includes(p);
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

/* ------------------------ Render grid ------------------------ */
function ensureGrid(){
  const grid = document.getElementById('channel-list');
  if (!grid.classList.contains('grid')) grid.classList.add('grid');
  return grid;
}
function render(opt={withEnter:false}){
  const grid = ensureGrid(); grid.innerHTML='';

  const list = channels.filter(c => getCategory(c) === currentFilter);
  const cols = computeGridCols(grid);

  list.forEach((ch,i)=>{
    const btn = document.createElement('button');
    btn.className = 'channel';
    btn.dataset.category = getCategory(ch);
    btn.dataset.globalIndex = String(channels.indexOf(ch));
    if (useWideLogo(ch)) btn.dataset.wide = 'true';
    btn.title = ch.name || 'ช่อง';

    const imgUrl = ch.logo ? proxiedImage(ch.logo) : '';
    const logoHTML = (SHOW_LOGOS && ch.logo)
      ? `<img class="logo" loading="lazy" decoding="async" referrerpolicy="no-referrer"
           src="${escapeHtml(imgUrl)}" alt="${escapeHtml(ch.name||'โลโก้ช่อง')}">`
      : `<div class="logo-fallback" aria-hidden="true">${escapeHtml(getInitials(ch.name||''))}</div>`;

    btn.innerHTML = `
      <div class="ch-card">
        <div class="logo-wrap">${logoHTML}</div>
        <div class="name">${escapeHtml(ch.name||'ช่อง')}</div>
      </div>`;

    btn.addEventListener('click', e=>{
      ripple(e, btn.querySelector('.ch-card'));
      playByChannel(ch);
      scrollToPlayer();
    });

    const row = Math.floor(i / Math.max(cols,1));
    const col = i % Math.max(cols,1);
    btn.style.setProperty('--i', row + col);

    grid.appendChild(btn);
  });

  grid.style.setProperty('--stagger', `${STAGGER_STEP_MS}ms`);

  if (opt.withEnter){
    grid.classList.add('switch-in');
    const maxOrder = Math.max(...Array.from(grid.children).map(el => +getComputedStyle(el).getPropertyValue('--i') || 0), 0);
    const total = (maxOrder * STAGGER_STEP_MS) + 420;
    setTimeout(()=> grid.classList.remove('switch-in'), Math.min(total, 1200));
  }

  highlight(currentIndex);
}
function computeGridCols(container){
  const cs = getComputedStyle(document.documentElement);
  const tileW = parseFloat(cs.getPropertyValue('--tile-w')) || 110;
  const gap   = parseFloat(cs.getPropertyValue('--tile-g')) || 10;
  const fullW = container.clientWidth;
  return Math.max(1, Math.floor((fullW + gap) / (tileW + gap)));
}

/* ------------------------ Player (JW) ------------------------ */
function playByChannel(ch){
  const i = channels.indexOf(ch);
  if (i >= 0) playByIndex(i);
}
function playByIndex(i, opt={scroll:true}){
  const ch = channels[i]; if(!ch) return;
  currentIndex = i;

  safeSet('lastId', ch.id); // จำช่องล่าสุดเสมอ

  const srcList = buildSources(ch);
  tryPlayJW(ch, srcList, 0);

  window.__setNowPlaying?.(ch.name || '');
  highlight(i);

  if (opt.scroll ?? true) scrollToPlayer();
  showMobileToast(ch.name || '');
}
function buildSources(ch){
  if (Array.isArray(ch.sources) && ch.sources.length){
    return [...ch.sources].sort((a,b)=>(a.priority||99)-(b.priority||99));
  }
  const s = ch.src || ch.file;
  const t = ch.type || detectType(s);
  const drm = ch.drm || (ch.keyId && ch.key ? {clearkey:{keyId:ch.keyId, key:ch.key}} : undefined);
  return [{ src:s, type:t, drm }];
}
function tryPlayJW(ch, list, idx){
  if (!window.jwplayer) return;
  if (idx >= list.length) { console.warn('ทุกแหล่งเล่นไม่สำเร็จ:', ch?.name); return; }
  const s = list[idx];

  const jwSrc = makeJwSource(s, ch);
  const player = jwplayer('player').setup({
    playlist: [{ image: ch.poster || ch.logo || undefined, sources: [jwSrc] }],
    width:'100%', aspectratio:'16:9', autostart:true,
    mute: isMobile(), preload:'metadata',
    displaytitle:false, displaydescription:false,
    playbackRateControls:true
  });

  player.once('playAttemptFailed', ()=>{ player.setMute(true); player.play(true); });
  player.on('error', ()=> {
    console.warn('แหล่งล้มเหลว ลองตัวถัดไป', s);
    tryPlayJW(ch, list, idx+1);
  });
}
function makeJwSource(s, ch){
  const file = wrapWithProxyIfNeeded(s.src || s.file || '', ch);
  const type = (s.type || detectType(file)).toLowerCase();
  const out = { file, type };
  if (type==='dash' && s.drm?.clearkey?.keyId && s.drm?.clearkey?.key){
    out.drm = { clearkey: { keyId: s.drm.clearkey.keyId, key: s.drm.clearkey.key } };
  }
  return out;
}
function detectType(u){ u=(u||'').split('?')[0].toLowerCase(); if(u.endsWith('.m3u8'))return'hls'; if(u.endsWith('.mpd'))return'dash'; return'auto'; }
function wrapWithProxyIfNeeded(url, ch){
  if (PROXY_BASE && (ch.proxy || false)) {
    const payload = { src:url, referrer: ch.referrer||'', ua: ch.ua||'', headers: ch.headers||{} };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${PROXY_BASE}/p/${b64}`;
  }
  return url;
}

/* ------------------------ Histats (ติดขวาใน .h-wrap) ------------------------ */
function mountHistatsTopRight(){
  if (window.__histatsMounted) return;
  window.__histatsMounted = true;

  const anchor = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  let holder = document.getElementById('histats_counter');
  if (!holder) { holder = document.createElement('div'); holder.id = 'histats_counter'; }
  anchor.appendChild(holder);

  window._Hasync = window._Hasync || [];
  window._Hasync.push(['Histats.startgif','1,4970878,4,10052,""']); // ตัด CSS fixed เดิมทิ้ง
  window._Hasync.push(['Histats.fasi','1']);
  window._Hasync.push(['Histats.track_hits','']);
  const hs = document.createElement('script'); hs.type='text/javascript'; hs.async=true; hs.src='//s10.histats.com/js15_giftop_as.js';
  (document.head || document.body).appendChild(hs);

  const move = () => {
    const c = document.getElementById('histatsC');
    if (c && holder && !holder.contains(c)) holder.appendChild(c);
  };
  const mo = new MutationObserver(move);
  mo.observe(document.body, { childList:true, subtree:true });
  move();
}

/* ------------------------ Refresh + Auto clear ------------------------ */
function mountRefreshButton(){
  const wrap = document.querySelector('.h-wrap') || document.querySelector('header');
  if (!wrap || document.getElementById('refresh-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'refresh-btn';
  btn.className = 'refresh-btn';
  btn.type = 'button';
  btn.title = 'รีเฟรชช่อง + ล้างแคช';
  btn.innerHTML = '<span class="i">↻</span><span class="t">รีเฟรช</span>';
  btn.addEventListener('click', async ()=>{
    try{
      btn.disabled = true;
      btn.querySelector('.t').textContent = 'กำลังรีเฟรช...';
      await clearAppCache();      // ไม่ลบ lastId
      await loadData();
      buildTabs();
      resumeLastOrAutoplayFirst();
    } finally {
      btn.disabled = false;
      btn.querySelector('.t').textContent = 'รีเฟรช';
    }
  });
  wrap.appendChild(btn);
}

async function clearAppCache(){
  try {
    const keys = Object.keys(localStorage);
    // ล้างค่า jwplayer* เท่านั้น (คงค่า lastId)
    for (const k of keys) if (/^jwplayer\./i.test(k) || k.includes('jwplayer')) localStorage.removeItem(k);
  } catch {}
  if (window.caches) {
    try { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))); } catch {}
  }
}

const AUTO_CLEAR_KEY = 'lastAutoClear';
const SIX_HR_MS = 6 * 60 * 60 * 1000;
function scheduleAutoClear(){
  const now = Date.now();
  const last = Number(localStorage.getItem(AUTO_CLEAR_KEY) || 0);
  if (!last || (now - last) >= SIX_HR_MS) {
    clearAppCache(); // ไม่กระทบ lastId
    localStorage.setItem(AUTO_CLEAR_KEY, String(now));
  }
  const delay = Math.max(1000, SIX_HR_MS - ((now - last) % SIX_HR_MS || 0));
  setTimeout(function tick(){
    clearAppCache();
    localStorage.setItem(AUTO_CLEAR_KEY, String(Date.now()));
    setTimeout(tick, SIX_HR_MS);
  }, delay);
}

/* ------------------------ Utils ------------------------ */
function proxiedImage(url){
  if (!USE_LOGO_PROXY || !PROXY_BASE || !url) return url;
  const payload = { src: url };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${PROXY_BASE}/i/${b64}`;
}
function getInitials(name=''){
  const s = String(name).trim(); if (!s) return 'TV';
  const arr = Array.from(s); const a = arr[0]||'T'; const b = /[A-Za-z0-9]/.test(arr[1]||'')?arr[1]:'';
  return (a+b).toUpperCase();
}
function highlight(globalIndex){
  document.querySelectorAll('.channel').forEach(el=>{
    const idx = Number(el.dataset.globalIndex);
    el.classList.toggle('active', idx === globalIndex);
    el.setAttribute('aria-pressed', idx === globalIndex ? 'true':'false');
  });
}
function ripple(event, container){
  if(!container) return;
  const r = container.getBoundingClientRect();
  const max = Math.max(r.width, r.height);
  const x = (event.clientX ?? (r.left + r.width/2)) - r.left;
  const y = (event.clientY ?? (r.top  + r.height/2)) - r.top;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.width = s.style.height = `${max}px`;
  s.style.left = `${x - max/2}px`;
  s.style.top  = `${y - max/2}px`;
  container.querySelector('.ripple')?.remove();
  container.appendChild(s);
  s.addEventListener('animationend', ()=>s.remove(), { once:true });
}
function isMobile(){ return /iPhone|iPad|Android/i.test(navigator.userAgent) }
function scrollToPlayer(){
  const el = document.getElementById('player');
  const header = document.querySelector('header');
  const y = el.getBoundingClientRect().top + window.pageYOffset - ((header?.offsetHeight)||0) - 8;
  window.scrollTo({ top:y, behavior:'smooth' });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"'`=\/]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'
  }[c]));
}
function debounce(fn,wait=150){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function safeGet(k){ try{ return localStorage.getItem(k); }catch{ return null; } }
function safeSet(k,v){ try{ localStorage.setItem(k,v); }catch{} }
function genIdFrom(ch,i){ return (ch.name?.toString().trim() || `ch-${i}`).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'') + '-' + i }

/* ------------------------ Icons ------------------------ */
function getIconSVG(n){
  const c='currentColor';
  switch(n){
    case 'IPTV':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M4 20h16v-2H4v2zm5-4h6v-2H9v2zm-3-4h12V8H6v4zm4-9 2 2 2-2 1.4 1.4L12 6.8 8.6 4.4 10 3z"/></svg>`;
    case 'เด็ก':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 2a5 5 0 0 1 5 5c0 3.9-3.6 7-5 7s-5-3.1-5-7a5 5 0 0 1 5-5zm1 14c2 3 1 4-1 6h-1l1-3-2 1 2-4h1z"/></svg>`;
    case 'บันเทิง':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.6L12 18.7 6.2 21l1.1-6.6-4.7-4.6 6.5-.9L12 3z"/></svg>`;
    case 'กีฬา':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 6.9 12.1A8 8 0 0 1 5.1 7.1 8 8 0 0 1 12 4z"/></svg>`;
    case 'สารคดี':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M4 5a3 3 0 0 1 3-3h6v18H7a3 3 0 0 0-3 3V5zm10-3h3a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3h-3V2z"/></svg>`;
    case 'หนัง':
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M21 10v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7h18zM4.7 4.1l1.7 3.1h4.2L8.9 4.1h3.8l1.7 3.1h4.2L16.8 4.1H19a2 2 0 0 1 2 2v2H3V6.1a2 2 0 0 1 1.7-2z"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="${c}"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`;
  }
}
