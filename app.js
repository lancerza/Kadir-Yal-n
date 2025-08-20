/* ========================= app.js =========================
   - Presence: นับ "คนดูพร้อมกันตอนนี้" ต่อช่อง (รองรับมือถือเต็มรูปแบบ)
   - Now bar ใต้ VDO: now-playing (กึ่งกลาง)
   - Live viewers: ใต้ clock + smoothing แบบ easing + clamp
   - Histats: นับแต่ซ่อนไว้ ไม่โชว์บนหน้า
   - JW Player: กัน listener สะสม + session token กัน fallback ค้าง + auto fallback
   - Offline banner + auto-retry, Wake Lock กันจอดับ (มือถือ)
   - UI: แท็บ/กริด/ริปเปิล/รีเฟรช + ล้าง cache อัตโนมัติ
   - UX: โฟกัสกลับไทล์ที่เล่นอยู่หลัง render + ซ่อนแท็บว่าง
=========================================================== */

const CH_URL   = 'channels.json';
const CAT_URL  = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS       = 140;
const STAGGER_STEP_MS     = 22;
const SCROLL_CARD_ON_LOAD = false;

let categories      = null;
let channels        = [];
let currentFilter   = '';
let currentIndex    = -1;
let didInitialReveal= false;

try { jwplayer.key = jwplayer.key || 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo'; } catch {}

/* ===== Presence (Concurrent Viewers) ===== */
const PRESENCE_URL     = (window.PRESENCE_URL || 'https://presence-counter.don147ok.workers.dev/hb');
const VIEWER_TTL_S     = 120;
const PING_INTERVAL_S  = 25;
const VIEWER_ID_KEY    = 'viewer_id';
let presenceTimer      = null;
let currentPresenceKey = null;
let lastPingAt         = 0;
let presenceBound      = false;

/* Grid re-render เมื่อคอลัมน์เปลี่ยนจริง */
let __lastGridCols = null;

/* JW session token — กัน fallback ค้างเวลาสลับเร็ว ๆ */
let __playToken = 0;
let __lastPlayArgs = { ch: null, list: null };

/* Wake Lock */
let __wakeLock = null;

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  window.scrollTo({ top: 0, behavior: 'auto' });

  showPlayerStatus('กำลังโหลด…');

  mountRefreshButton();
  scheduleAutoClear();

  mountClock();
  mountNowBarUnderPlayer();     // now-playing ใต้ VDO (กึ่งกลาง)
  mountLiveViewersUnderClock(); // live-viewers ใต้ clock ใน header
  mountHistatsHidden();         // Histats แบบซ่อน
  mountOfflineBanner();         // แถบแจ้งเน็ตหลุด

  bindNetworkRetry();           // offline/online handler

  try {
    await loadData();
  } catch (e) {
    console.error('โหลดข้อมูลไม่สำเร็จ:', e);
    window.__setNowPlaying?.('โหลดข้อมูลไม่สำเร็จ');
  }

  buildTabs();
  autoplayFirst();

  centerTabsIfPossible();
  addEventListener('resize', debounce(centerTabsIfPossible,150));
  addEventListener('load', centerTabsIfPossible);

  // realtime grid re-render เฉพาะเมื่อ "จำนวนคอลัมน์" เปลี่ยน
  addEventListener('resize', debounce(rerenderOnResize, 120));
  addEventListener('orientationchange', rerenderOnResize);
});

/* ---------- Fetch data (fresh) ---------- */
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

/* ---------- Autoplay + optional scroll ---------- */
function autoplayFirst(){
  // เลือกแท็บแรกที่มีช่องจริง
  const order = (categories?.order || []);
  const firstCatWithItems = order.find(c => channels.some(ch => getCategory(ch) === c));
  const cat = firstCatWithItems || categories?.default || 'IPTV';

  let idx = channels.findIndex(ch => getCategory(ch) === cat);
  if (idx < 0 && channels.length) idx = 0;

  if (idx >= 0) {
    setActiveTab(cat);
    playByIndex(idx, { scroll:false });
    if (SCROLL_CARD_ON_LOAD) scheduleRevealActiveCard();
    // โฟกัสไทล์ที่เล่นอยู่ทันที
    setTimeout(focusActiveTile, 0);
  } else {
    showPlayerStatus('ไม่พบช่องสำหรับเล่น');
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
  const pad = 80;
  const y = active.getBoundingClientRect().top + window.pageYOffset - headerOffset() - pad;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/* ---------- Now bar ใต้ VDO ---------- */
function mountNowBarUnderPlayer(){
  const player = document.getElementById('player') || document.body;

  // inject minimal fallback styles (เผื่อไม่มี styles.css)
  if (!document.getElementById('now-bar-styles')) {
    const css = `
#now-bar.now-bar{display:flex;align-items:center;justify-content:center;gap:12px;margin:10px 0 14px;}
#now-playing{font-weight:700;font-size:14px;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;color:inherit;opacity:.95;text-align:center;}
    `.trim();
    const s = document.createElement('style');
    s.id = 'now-bar-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  let bar = document.getElementById('now-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'now-bar';
    bar.className = 'now-bar';
    player.insertAdjacentElement?.('afterend', bar);
  }

  // now-playing (กึ่งกลาง)
  let now = document.getElementById('now-playing');
  if (!now) {
    now = document.createElement('div');
    now.id = 'now-playing';
    now.className = 'now-playing';
    now.setAttribute('aria-live','polite');
  }
  if (now.parentElement !== bar) bar.appendChild(now);

  // setter
  window.__setNowPlaying = (name='')=>{
    now.textContent = name || '';
    now.title = name || '';
  };
}

/* ---------- Live viewers ใต้ clock + smoothing ---------- */
function mountLiveViewersUnderClock(){
  const header = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  const clock  = document.getElementById('clock');

  let pill = document.getElementById('live-viewers');
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'live-viewers';
    pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="label">ออนไลน์</span><span class="n">0</span>`;
  }
  if (clock) clock.insertAdjacentElement('afterend', pill);
  else header.appendChild(pill);
}
// smoothing: exp easing + clamp per second
const VIEWERS_TAU_MS = 450;
const VIEWERS_MAX_STEP_PER_SEC = 60;
let _viewDisp = 0, _viewTarget = 0, _viewRAF = null, _viewLast = 0;
function updateLiveViewersSmooth(n){
  const val = Math.max(0, Number(n)||0);
  _viewTarget = val;
  if (!_viewRAF) {
    _viewLast = performance.now();
    _viewRAF = requestAnimationFrame(_viewersTick);
  }
}
function _viewersTick(now){
  const el = document.querySelector('#live-viewers .n');
  const dt = Math.max(16, now - _viewLast);
  _viewLast = now;

  const k = 1 - Math.exp(-dt / VIEWERS_TAU_MS);
  let step = (_viewTarget - _viewDisp) * k;
  const max = VIEWERS_MAX_STEP_PER_SEC * (dt/1000);
  if (Math.abs(step) > max) step = Math.sign(step)*max;

  _viewDisp += step;
  if (el) el.textContent = String(Math.round(_viewDisp));

  if (Math.abs(_viewTarget - _viewDisp) < 0.4) {
    _viewDisp = _viewTarget;
    if (el) el.textContent = String(Math.round(_viewDisp));
  }

  if (Math.round(_viewDisp) !== Math.round(_viewTarget)) {
    _viewRAF = requestAnimationFrame(_viewersTick);
  } else {
    cancelAnimationFrame(_viewRAF);
    _viewRAF = null;
  }
}

/* ---------- Header: Clock ---------- */
function mountClock(){
  const el = document.getElementById('clock'); if (!el) return;
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

/* ---------- Tabs ---------- */
function buildTabs(){
  const root = document.getElementById('tabs'); if(!root) return;
  root.innerHTML = '';

  // นับจำนวนต่อหมวด ซ่อนแท็บว่าง
  const counts = {};
  channels.forEach(ch => {
    const c = getCategory(ch);
    counts[c] = (counts[c]||0)+1;
  });

  (categories?.order || []).forEach(name=>{
    if (!counts[name]) return; // ซ่อนหมวดว่าง
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.filter = name;
    btn.setAttribute('aria-selected','false');
    btn.innerHTML = `
      <span class="tab-card">
        <span class="tab-icon">${getIconSVG(name)}</span>
        <span class="tab-label">${name}</span>
      </span>`;
    root.appendChild(btn);
  });
  wireTabs(root);

  // ถ้าหมวดปัจจุบันว่าง/ถูกซ่อน ให้สลับไปหมวดแรกที่มีของ
  if (!counts[currentFilter]) {
    const first = root.querySelector('.tab')?.dataset.filter;
    if (first) currentFilter = first;
  }
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
    // โฟกัสกลับไทล์ที่เล่นอยู่ในหมวดนี้
    setTimeout(focusActiveTile, 0);
  }, SWITCH_OUT_MS);
}
function centerTabsIfPossible(){
  const el = document.getElementById('tabs'); if(!el) return;
  el.classList.toggle('tabs--center', el.scrollWidth <= el.clientWidth + 1);
}

/* ---------- Category logic ---------- */
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
          const re = new RegExp(pat.slice(1,-1),'i'); return re.test(hay) || re.test(src0);
        }
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
function isBackupChannel(ch){
  return !!(ch.backup || ch.isBackup ||
    (Array.isArray(ch.tags) && ch.tags.some(t=>/สำรอง|backup|mirror|alt/i.test(String(t)))));
}

/* ---------- Render grid ---------- */
function ensureGrid(){
  const grid = document.getElementById('channel-list');
  if (!grid.classList.contains('grid')) grid.classList.add('grid');
  return grid;
}
function render(opt={withEnter:false}){
  const grid = ensureGrid(); 
  grid.innerHTML='';

  const list = channels.filter(c => getCategory(c) === currentFilter);
  const cols = computeGridCols(grid);

  list.forEach((ch,i)=>{
    const btn = document.createElement('button');
    btn.className = 'channel';
    btn.dataset.category = getCategory(ch);
    btn.dataset.globalIndex = String(channels.indexOf(ch));
    if (useWideLogo(ch)) btn.dataset.wide = 'true';
    if (isBackupChannel(ch)) btn.dataset.backup = 'true';
    btn.title = ch.name || 'ช่อง';
    btn.tabIndex = -1; // ไม่รับการกดคีย์บอร์ดจากผู้ใช้

    btn.innerHTML = `
      <div class="ch-card">
        ${isBackupChannel(ch) ? `<span class="badge" aria-label="ช่องสำรอง">สำรอง</span>` : ``}
        <div class="logo-wrap">
          <img class="logo" loading="lazy" decoding="async"
               src="${escapeHtml(ch.logo || '')}" alt="${escapeHtml(ch.name||'โลโก้ช่อง')}">
        </div>
        <div class="name">${escapeHtml(ch.name||'ช่อง')}</div>
      </div>`;

    btn.addEventListener('click', e=>{
      ripple(e, btn.querySelector('.ch-card'));
      playByChannel(ch);
      scrollToPlayer();
    });

    const row = Math.floor(i / Math.max(cols,1));
    const col = i % Math.max(cols,1);
    const order = row + col;
    btn.style.setProperty('--i', order);

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

  // เก็บจำนวนคอลัมน์ล่าสุดไว้ เปรียบเทียบตอน resize
  __lastGridCols = computeGridCols(grid);
}
function computeGridCols(container){
  const cs = getComputedStyle(document.documentElement);
  const tileW = parseFloat(cs.getPropertyValue('--tile-w')) || 110;
  const gap   = parseFloat(cs.getPropertyValue('--tile-g')) || 10;
  const fullW = container.clientWidth;
  return Math.max(1, Math.floor((fullW + gap) / (tileW + gap)));
}
function rerenderOnResize(){
  const grid = document.getElementById('channel-list'); 
  if (!grid) return;
  const cols = computeGridCols(grid);
  if (cols !== __lastGridCols){
    render({withEnter:false});
    setTimeout(focusActiveTile, 0);
  }
}

/* ---------- Player (JW) + Status ---------- */
function playByChannel(ch){
  const i = channels.indexOf(ch);
  if (i >= 0) playByIndex(i);
}
function playByIndex(i, opt={scroll:true}){
  const ch = channels[i]; if(!ch) return;
  currentIndex = i;

  const srcList = buildSources(ch);
  __lastPlayArgs = { ch, list: srcList };

  showPlayerStatus(`กำลังเตรียมเล่น: ${ch.name || ''}`);

  // session token ใหม่ทุกครั้งที่เริ่มเล่น
  const token = ++__playToken;
  tryPlayJW(ch, srcList, 0, token);

  window.__setNowPlaying?.(ch.name || '');
  startPresence(ch.id || ch.name || `ch-${i}`);
  highlight(i);
  setTimeout(focusActiveTile, 0);

  if (opt.scroll ?? true) scrollToPlayer();
  showMobileToast(ch.name || '');
  document.title = (ch.name ? `${ch.name} · Flow TV` : 'Flow TV');
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
function tryPlayJW(ch, list, idx, token){
  if (token !== __playToken) return; // ยกเลิกงานเก่า

  if (idx >= list.length) {
    // ทุกแหล่งในช่องนี้ล้มเหลว -> หา "ช่องสำรอง" อัตโนมัติ
    const alt = findBackupChannel(ch);
    if (alt) {
      showPlayerStatus('แหล่งหลักล้มเหลว → สลับไปช่องสำรอง…');
      playByChannel(alt);
      return;
    }
    showPlayerStatus('เล่นไม่ได้ทุกแหล่ง');
    console.warn('ทุกแหล่งเล่นไม่สำเร็จ:', ch?.name);
    return; 
  }

  // กัน event/listener สะสมจากอินสแตนซ์ก่อนหน้า
  try { jwplayer('player').remove(); } catch {}

  const s = list[idx];
  const jwSrc = makeJwSource(s, ch);
  showPlayerStatus(`กำลังเปิดแหล่งที่ ${idx+1}/${list.length}…`);

  const playerEl = document.getElementById('player');
  playerEl.classList.remove('ready');   // ให้ ambient glow แสดงระหว่างรอ

  const player = jwplayer('player').setup({
    playlist: [{ image: ch.poster || ch.logo || undefined, sources: [jwSrc] }],
    width:'100%',
    aspectratio:'16:9',
    autostart: 'viewable',
    mute: true,
    preload:'metadata',
    displaytitle:false,
    displaydescription:false,
    playbackRateControls:true
  });

  player.once('playAttemptFailed', ()=>{ if (token!==__playToken) return; player.setMute(true); player.play(true); });
  player.on('buffer', ()=>{ if (token!==__playToken) return; showPlayerStatus('กำลังบัฟเฟอร์…'); });
  player.on('play',   ()=>{ if (token!==__playToken) return; showPlayerStatus(''); playerEl.classList.add('ready'); enableWakeLock(); });
  player.on('firstFrame', ()=>{ if (token!==__playToken) return; showPlayerStatus(''); playerEl.classList.add('ready'); });

  player.on('setupError', e => {
    if (token!==__playToken) return;
    console.warn('setupError:', e);
    showPlayerStatus('ตั้งค่า player ล้มเหลว → ลองสำรอง…');
    tryPlayJW(ch, list, idx+1, token);
  });
  player.on('error', e => {
    if (token!==__playToken) return;
    console.warn('playError:', e);
    showPlayerStatus('เล่นแหล่งนี้ไม่ได้ → ลองสำรอง…');
    tryPlayJW(ch, list, idx+1, token);
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
  if (window.PROXY_BASE && (ch.proxy || false)) {
    const payload = { src:url, referrer: ch.referrer||'', ua: ch.ua||'', headers: ch.headers||{} };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${window.PROXY_BASE}/p/${b64}`;
  }
  return url;
}

/* ---------- Offline banner + auto-retry ---------- */
function mountOfflineBanner(){
  if (document.getElementById('offline-banner')) return;
  const el = document.createElement('div');
  el.id = 'offline-banner';
  el.setAttribute('aria-live','polite');
  el.innerHTML = `<span class="dot"></span><span class="txt">ออฟไลน์: กำลังพยายามเชื่อมต่อใหม่…</span>`;
  document.body.appendChild(el);
}
function bindNetworkRetry(){
  const banner = ()=>document.getElementById('offline-banner');

  addEventListener('offline', ()=>{
    banner()?.classList.add('on');
  });
  addEventListener('online', ()=>{
    banner()?.classList.remove('on');
    // ลองเล่นใหม่จากต้นของช่องล่าสุด
    if (__lastPlayArgs.ch && __lastPlayArgs.list) {
      const token = ++__playToken;
      tryPlayJW(__lastPlayArgs.ch, __lastPlayArgs.list, 0, token);
    }
    presenceTick(true);
  });
}

/* ---------- Wake Lock ---------- */
async function enableWakeLock(){
  try{
    if (!('wakeLock' in navigator)) return;
    if (__wakeLock) return;
    __wakeLock = await navigator.wakeLock.request('screen');
    __wakeLock.addEventListener?.('release', ()=>{ __wakeLock=null; });
    document.addEventListener('visibilitychange', async ()=>{
      if (document.visibilityState === 'visible' && !__wakeLock) {
        try{ __wakeLock = await navigator.wakeLock.request('screen'); }catch{}
      }
    });
  }catch{}
}

/* ---------- Presence (heartbeat) ---------- */
function getViewerId(){
  try{
    let id = localStorage.getItem(VIEWER_ID_KEY);
    if (!id) { id = (crypto.randomUUID?.() || (Date.now()+Math.random()).toString(36)); localStorage.setItem(VIEWER_ID_KEY, id); }
    return id;
  }catch{ return String(Date.now()); }
}
async function presenceDoFetch(){
  try{
    const v = getViewerId();
    const url = `${PRESENCE_URL}?ch=${encodeURIComponent(currentPresenceKey||'global')}&v=${encodeURIComponent(v)}&ttl=${VIEWER_TTL_S}`;
    const r = await fetch(url, { cache:'no-store', keepalive:true });
    if (!r.ok) throw 0;
    const data = await r.json().catch(()=> ({}));
    if (typeof data.count === 'number') updateLiveViewersSmooth(data.count);
  }catch{}
}
function presenceDoBeacon(){
  try{
    const v = getViewerId();
    const url = `${PRESENCE_URL}?ch=${encodeURIComponent(currentPresenceKey||'global')}&v=${encodeURIComponent(v)}&ttl=${VIEWER_TTL_S}`;
    if ('sendBeacon' in navigator) navigator.sendBeacon(url);
    else fetch(url, { cache:'no-store', keepalive:true }).catch(()=>{});
  }catch{}
}
async function presenceTick(immediate=false){
  clearTimeout(presenceTimer);
  const hidden = document.visibilityState === 'hidden' || document.hidden;

  if (immediate) {
    hidden ? presenceDoBeacon() : await presenceDoFetch();
    lastPingAt = Date.now();
  } else {
    const late = Date.now() - lastPingAt;
    if (late >= PING_INTERVAL_S*1000*0.9) {
      hidden ? presenceDoBeacon() : await presenceDoFetch();
      lastPingAt = Date.now();
    }
  }
  const delay = Math.max(800, PING_INTERVAL_S*1000 - (Date.now()-lastPingAt));
  presenceTimer = setTimeout(()=>presenceTick(false), delay);
}
function bindPresenceEventsOnce(){
  if (presenceBound) return;
  presenceBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') presenceTick(true);
    else presenceDoBeacon();
  });
  addEventListener('pageshow', () => presenceTick(true));
  addEventListener('pagehide', () => presenceDoBeacon(), { capture:true });
  addEventListener('freeze',   () => presenceDoBeacon());
  addEventListener('focus',    () => presenceTick(true));
  addEventListener('blur',     () => presenceDoBeacon());
  addEventListener('online',   () => presenceTick(true));
  addEventListener('beforeunload', () => { try{ presenceDoBeacon(); }catch{} }, { once:true });
}
function startPresence(channelKey){
  currentPresenceKey = String(channelKey || 'global');
  lastPingAt = 0;
  presenceTick(true);
  bindPresenceEventsOnce();
}

/* ---------- Player status overlay ---------- */
function showPlayerStatus(text){
  const parent = document.getElementById('player');
  if (!parent) return;
  let box = document.getElementById('player-msg');
  if (!box){
    box = document.createElement('div');
    box.id = 'player-msg';
    box.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      background:rgba(0,0,0,.60);color:#fff;padding:8px 12px;border-radius:10px;
      font-weight:800;letter-spacing:.2px;z-index:5;max-width:70%;text-align:center;
      box-shadow:0 6px 16px rgba(0,0,0,.35)`;
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(box);
  }
  box.textContent = text || '';
  box.style.display = text ? 'block' : 'none';
}

/* ---------- Utilities ---------- */
function headerOffset(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--header-offset');
  const num = parseFloat(v);
  if (!isNaN(num) && num > 0) return num;
  return document.querySelector('.h-wrap')?.offsetHeight || 0;
}
function highlight(globalIndex){
  document.querySelectorAll('.channel').forEach(el=>{
    const idx = Number(el.dataset.globalIndex);
    const sel = idx === globalIndex;
    el.classList.toggle('active', sel);
    el.setAttribute('aria-pressed', sel ? 'true':'false');
    el.tabIndex = sel ? 0 : -1; // โฟกัสได้เฉพาะไทล์ที่เล่นอยู่
  });
}
function focusActiveTile(){
  const sel = document.querySelector(`.channel[data-global-index="${currentIndex}"]`);
  if (sel) {
    sel.focus({ preventScroll: false });
    sel.scrollIntoView({ block:'nearest', inline:'nearest' });
  }
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
function escapeHtml(s){
  return String(s).replace(/[&<>"'`=\/]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'
  }[c]));
}
function debounce(fn,wait=150){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function genIdFrom(ch,i){ return (ch.name?.toString().trim() || `ch-${i}`).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'') + '-' + i }

function normalizeName(name){
  return String(name||'').toLowerCase()
    .replace(/[\(\)\[\]\{\}]/g,'')
    .replace(/สำรอง|backup|mirror|alt/gi,'')
    .replace(/\s+/g,' ').trim();
}
function findBackupChannel(ch){
  const baseId = ch.altOf || ch.mainOf || ch.masterOf;
  if (baseId) return channels.find(x => x.id===baseId || x.altOf===baseId || x.masterOf===baseId);
  const base = normalizeName(ch.name);
  return channels.find(o => o!==ch && isBackupChannel(o) && normalizeName(o.name)===base);
}

/* ---------- Histats (ซ่อนแต่ยังนับ) ---------- */
function mountHistatsHidden(){
  let holder = document.getElementById('histats_counter');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'histats_counter';
    document.body.appendChild(holder);
  }
  const hiddenCSS = `
    position:absolute!important; width:1px!important; height:1px!important;
    overflow:hidden!important; clip:rect(0 0 0 0)!important; clip-path: inset(50%)!important;
    opacity:0!important; pointer-events:none!important; z-index:-1!important;`;
  holder.style.cssText = hiddenCSS;

  window._Hasync = window._Hasync || [];
  window._Hasync.push([
    'Histats.startgif',
    '1,4970878,4,10052,"div#histatsC {position: absolute;top:0;right:0;}body>div#histatsC {position: fixed;}"'
  ]);
  window._Hasync.push(['Histats.fasi','1']);
  window._Hasync.push(['Histats.track_hits','']);

  if (!document.getElementById('histats-loader')) {
    const hs = document.createElement('script');
    hs.id = 'histats-loader';
    hs.type = 'text/javascript';
    hs.async = true;
    hs.src = '//s10.histats.com/js15_giftop_as.js';
    (document.head || document.body).appendChild(hs);
  }

  const ensureInside = () => {
    const c = document.getElementById('histatsC');
    if (c && c.parentNode !== holder) holder.appendChild(c);
    if (c) c.style.cssText = hiddenCSS;
  };
  ensureInside();
  const obs = new MutationObserver(ensureInside);
  obs.observe(document.documentElement, { childList:true, subtree:true });
}

/* ---------- Refresh + Auto clear ---------- */
function mountRefreshButton(){
  const wrap = document.querySelector('.h-wrap') || document.querySelector('header');
  if (!wrap || document.getElementById('refresh-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'refresh-btn';
  btn.className = 'refresh-btn';
  btn.type = 'button';
  btn.title = 'รีเฟรชช่อง + ล้างแคช';
  btn.innerHTML = '<span class="i">↻</span><span class="t">รีเฟรช</span>';

  let status = document.getElementById('refresh-status');
  if (!status){
    status = document.createElement('span');
    status.id = 'refresh-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
  }

  const updateBtnW = () => {
    const w = btn.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--refresh-btn-w', `${Math.ceil(w)}px`);
  };

  let hideTimer = null;
  const showStatus = (text) => {
    status.textContent = text;
    status.classList.add('on');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(()=> status.classList.remove('on'), 2600);
  };

  btn.addEventListener('click', async ()=>{
    try{
      btn.disabled = true;
      btn.querySelector('.t').textContent = 'กำลังรีเฟรช...';
      updateBtnW();

      await clearAppCache();
      await loadData();
      buildTabs();
      autoplayFirst();

      const t = new Intl.DateTimeFormat('th-TH', { timeStyle:'medium', hour12:false, timeZone: TIMEZONE }).format(new Date());
      showStatus(`รีเฟรชเสร็จแล้ว • ${t}`);
    } finally {
      btn.disabled = false;
      btn.querySelector('.t').textContent = 'รีเฟรช';
      updateBtnW();
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(status);

  updateBtnW();
  if ('ResizeObserver' in window){
    const ro = new ResizeObserver(updateBtnW);
    ro.observe(btn);
  }
  addEventListener('resize', debounce(updateBtnW, 120));
}
async function clearAppCache(){
  try {
    const keys = Object.keys(localStorage);
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
    clearAppCache();
    localStorage.setItem(AUTO_CLEAR_KEY, String(now));
  }
  const delay = Math.max(1000, SIX_HR_MS - ((now - last) % SIX_HR_MS || 0));
  setTimeout(function tick(){
    clearAppCache();
    localStorage.setItem(AUTO_CLEAR_KEY, String(Date.now()));
    setTimeout(tick, SIX_HR_MS);
  }, delay);
}
