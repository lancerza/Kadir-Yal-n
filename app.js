/* ========================= app.js =========================
   - Presence counter ต่อ "ช่อง" ด้วย Cloudflare Worker (มือถือ/คอม)
   - now-playing ใต้ VDO (ไม่มี live-on-player แล้ว)
   - ป้าย Live + ผู้ชม ปรากฏแค่ใต้เวลา (header)
   - หน่วงการนับใหม่เมื่อสลับช่อง 4s (ครั้งแรกนับทันที)
   - Badge "สำรอง" + Auto backup เมื่อเล่นไม่ได้
   - Histats แบบซ่อน, ปุ่มรีเฟรช, Tabs/Grid/JWPlayer ครบ
=========================================================== */

const CH_URL   = 'channels.json';
const CAT_URL  = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS       = 140;
const STAGGER_STEP_MS     = 22;
const SCROLL_CARD_ON_LOAD = false;

let categories = null;
let channels   = [];
let currentFilter = '';
let currentIndex  = -1;
let didInitialReveal = false;

try { jwplayer.key = jwplayer.key || 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo'; } catch {}

/* ===== Presence (Concurrent Viewers) ===== */
const PRESENCE_URL = (window.PRESENCE_URL || 'https://presence-counter.don147ok.workers.dev/hb');
const VIEWER_TTL_S = 120;     // TTL เผื่อมือถือพักจอ
const PING_INTERVAL_S = 25;   // ping ทุก ~25 วิ

// หน่วงการนับใหม่เมื่อสลับช่อง (ครั้งแรกไม่หน่วง)
const PRESENCE_SWITCH_DELAY_MS = 4000;
let presenceTimer = null;
let presenceSwitchTimer = null;
let presenceFirstStart = true;
let currentPresenceKey = null;
let presenceBound = false;
const VIEWER_ID_KEY = 'viewer_id';

/* ------------------------ Boot ------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  window.scrollTo({ top: 0, behavior: 'auto' });

  mountRefreshButton();
  scheduleAutoClear();

  mountClock();
  mountNowBarUnderPlayer();     // now-playing ใต้ VDO (ไม่มี live-on-player)
  mountLiveViewersUnderClock(); // live-pill ใต้เวลา (มี label)
  mountHistatsHidden();

  try { await loadData(); }
  catch (e){ console.error('โหลดข้อมูลไม่สำเร็จ:', e); window.__setNowPlaying?.('โหลดข้อมูลไม่สำเร็จ'); }

  buildTabs();
  autoplayFirst();

  centerTabsIfPossible();
  addEventListener('resize', debounce(centerTabsIfPossible,150));
  addEventListener('load', centerTabsIfPossible);

  bindPresenceWakeEvents();
});

/* ------------------------ Load ------------------------ */
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

  categories = catRes || { order:['IPTV','บันเทิง','กีฬา','สารคดี','เด็ก','หนัง'], default:'IPTV', rules:[] };
  channels = Array.isArray(chRes) ? chRes : (chRes?.channels || []);
  channels.forEach((c,i)=>{ if(!c.id) c.id = genIdFrom(c, i); });
}

/* ------------------------ Autoplay ------------------------ */
function autoplayFirst(){
  const order = (categories?.order || []);
  let idx = -1;
  let cat = order[0] || categories?.default || 'IPTV';

  for (const c of order) {
    idx = channels.findIndex(ch => getCategory(ch) === c);
    if (idx >= 0) { cat = c; break; }
  }
  if (idx < 0 && channels.length) { idx = 0; cat = getCategory(channels[0]) || cat; }

  if (idx >= 0) {
    setActiveTab(cat);
    playByIndex(idx, { scroll:false });
    if (SCROLL_CARD_ON_LOAD) scheduleRevealActiveCard();
  } else {
    showPlayerStatus('ไม่พบช่องสำหรับเล่น');
  }
}
function scheduleRevealActiveCard(){
  if (didInitialReveal) return; didInitialReveal = true;
  setTimeout(()=> revealActiveCardIntoView(), SWITCH_OUT_MS + 220);
}
function revealActiveCardIntoView(){
  const active = document.querySelector('.channel[aria-pressed="true"], .channel.active');
  if (!active) { setTimeout(revealActiveCardIntoView, 120); return; }
  const pad = 80;
  const y = active.getBoundingClientRect().top + window.pageYOffset - headerOffset() - pad;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/* ------------------------ Now bar ใต้ VDO ------------------------ */
function mountNowBarUnderPlayer(){
  const player = document.getElementById('player') || document.body;

  if (!document.getElementById('now-bar-styles')) {
    const s = document.createElement('style'); s.id='now-bar-styles';
    s.textContent = `
#now-bar{display:flex;align-items:center;justify-content:center;margin:10px 0 14px;}
#now-playing{font-weight:700;font-size:14px;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center;}
    `.trim();
    document.head.appendChild(s);
  }

  let bar = document.getElementById('now-bar');
  if (!bar) { bar = document.createElement('div'); bar.id='now-bar'; player.insertAdjacentElement('afterend', bar); }

  let now = document.getElementById('now-playing');
  if (!now) {
    now = document.createElement('div');
    now.id = 'now-playing';
    now.className = 'now-playing';
    now.setAttribute('aria-live','polite');
  }
  if (now.parentElement !== bar) bar.appendChild(now);

  // ถ้ามี live-on-player ค้างอยู่จากโค้ดเก่า ให้ถอดออกเลย
  const old = document.getElementById('live-on-player');
  if (old && old.parentElement) old.parentElement.removeChild(old);

  window.__setNowPlaying = (name='')=>{
    now.textContent = name || '';
    now.title = name || '';
  };
}

/* ------------------------ Live viewers ใต้ clock (มี label) ------------------------ */
function mountLiveViewersUnderClock(){
  const label = (window.LIVE_LABEL || 'Live');
  const header = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  const clock  = document.getElementById('clock');

  let pill = document.getElementById('live-viewers');
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'live-viewers';
    pill.className = 'live-pill';
    pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="label">${label}</span><span class="n">0</span>`;
  }
  if (clock) clock.insertAdjacentElement('afterend', pill); else header.appendChild(pill);
}
function updateLiveViewers(n){
  const v = (typeof n==='number' && n>=0) ? String(n) : '0';
  const el = document.querySelector('#live-viewers .n');
  if (el) el.textContent = v;
}

/* ------------------------ Clock ------------------------ */
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
  tick(); setInterval(tick, 1000);
}

/* ------------------------ Tabs ------------------------ */
function buildTabs(){
  const root = document.getElementById('tabs'); if(!root) return;
  root.innerHTML = '';
  (categories?.order || []).forEach(name=>{
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
  setTimeout(()=>{ grid.classList.remove('switch-out'); render({withEnter:true}); }, SWITCH_OUT_MS);
}
function centerTabsIfPossible(){
  const el = document.getElementById('tabs'); if(!el) return;
  el.classList.toggle('tabs--center', el.scrollWidth <= el.clientWidth + 1);
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

    const badgeLabel = (typeof ch.badge === 'string' && ch.badge.trim()) ? ch.badge.trim() : (ch.backup ? 'สำรอง' : '');
    const badgeHtml = badgeLabel ? `<span class="ch-badge" data-variant="${ch.backup?'backup':'custom'}" title="${escapeHtml(badgeLabel)}">${escapeHtml(badgeLabel)}</span>` : '';

    btn.innerHTML = `
      <div class="ch-card">
        ${badgeHtml}
        <div class="logo-wrap">
          <img class="logo" loading="lazy" decoding="async" src="${escapeHtml(ch.logo || '')}" alt="${escapeHtml(ch.name||'โลโก้ช่อง')}">
        </div>
        <div class="name">${escapeHtml(ch.name||'ช่อง')}</div>
      </div>`;

    btn.addEventListener('click', e=>{ ripple(e, btn.querySelector('.ch-card')); playByChannel(ch); scrollToPlayer(); });

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
}
function computeGridCols(container){
  const cs = getComputedStyle(document.documentElement);
  const tileW = parseFloat(cs.getPropertyValue('--tile-w')) || 110;
  const gap   = parseFloat(cs.getPropertyValue('--tile-g')) || 10;
  const fullW = container.clientWidth;
  return Math.max(1, Math.floor((fullW + gap) / (tileW + gap)));
}

/* ------------------------ Player (JW) + Auto-backup ------------------------ */
function playByChannel(ch){ const i = channels.indexOf(ch); if (i >= 0) playByIndex(i); }
function playByIndex(i, opt={scroll:true, noAutoBackup:false}){
  const ch = channels[i]; if(!ch) return; currentIndex = i;

  const srcList = buildSources(ch);
  showPlayerStatus(`กำลังเตรียมเล่น: ${ch.name || ''}`);

  const onFailAll = () => {
    if (opt.noAutoBackup) return;
    const cands = getBackupCandidates(ch);
    if (!cands.length){ showPlayerStatus('เล่นไม่ได้ทุกแหล่ง (ไม่มีช่องสำรอง)'); return; }
    tryBackupSequence(cands);
  };

  tryPlayJW(ch, srcList, 0, onFailAll);

  window.__setNowPlaying?.(ch.name || '');
  startPresence(ch.id || ch.name || `ch-${i}`);   // เริ่มนับคนดู (หน่วงเมื่อสลับช่อง)
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
function tryPlayJW(ch, list, idx, onFailAll){
  if (idx >= list.length) { showPlayerStatus('เล่นไม่ได้ทุกแหล่ง'); console.warn('ทุกแหล่งเล่นไม่สำเร็จ:', ch?.name); if (typeof onFailAll === 'function') onFailAll(); return; }
  const s = list[idx];

  const jwSrc = makeJwSource(s, ch);
  showPlayerStatus(`กำลังเปิดแหล่งที่ ${idx+1}/${list.length}…`);

  const player = jwplayer('player').setup({
    playlist: [{ image: ch.poster || ch.logo || undefined, sources: [jwSrc] }],
    width:'100%', aspectratio:'16:9', autostart:'viewable', mute:true, preload:'metadata',
    displaytitle:false, displaydescription:false, playbackRateControls:true
  });

  player.once('playAttemptFailed', ()=>{ player.setMute(true); player.play(true); });
  player.on('buffer', ()=> showPlayerStatus('กำลังบัฟเฟอร์…'));
  player.on('play',   ()=> showPlayerStatus(''));
  player.on('firstFrame', ()=> showPlayerStatus(''));
  player.on('setupError', e => { console.warn('setupError:', e); showPlayerStatus('ตั้งค่า player ล้มเหลว → ลองสำรอง…'); tryPlayJW(ch, list, idx+1, onFailAll); });
  player.on('error',      e => { console.warn('playError:', e);  showPlayerStatus('เล่นแหล่งนี้ไม่ได้ → ลองสำรอง…'); tryPlayJW(ch, list, idx+1, onFailAll); });
}
function makeJwSource(s, ch){
  const file = wrapWithProxyIfNeeded(s.src || s.file || '', ch);
  const type = (s.type || detectType(file)).toLowerCase();
  const out = { file, type };
  if (type==='dash' && s.drm?.clearkey?.keyId && s.drm?.clearkey?.key){ out.drm = { clearkey:{ keyId:s.drm.clearkey.keyId, key:s.drm.clearkey.key } }; }
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
function showMobileToast(text){
  if (!isMobile()) return;
  let t = document.getElementById('mini-toast');
  if (!t){
    t = document.createElement('div'); t.id='mini-toast';
    t.style.cssText = `position:absolute;left:50%;top:10px;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fff;padding:6px 10px;border-radius:8px;font-size:13px;font-weight:600;z-index:9;pointer-events:none;opacity:0;transition:opacity .18s ease`;
    const parent = document.getElementById('player'); parent.style.position = parent.style.position || 'relative'; parent.appendChild(t);
  }
  t.textContent = text; requestAnimationFrame(()=>{ t.style.opacity = '1'; }); setTimeout(()=>{ t.style.opacity = '0'; }, 1500);
}
function isMobile(){ return /iPhone|iPad|Android/i.test(navigator.userAgent) }
function scrollToPlayer(){
  const el = document.getElementById('player');
  const y = el.getBoundingClientRect().top + window.pageYOffset - headerOffset() - 8;
  window.scrollTo({ top:y, behavior:'smooth' });
}

/* --------- Auto-backup helpers --------- */
function tryBackupSequence(cands){
  if (!Array.isArray(cands) || !cands.length){ showPlayerStatus('เล่นช่องสำรองทั้งหมดไม่สำเร็จ'); return; }
  const next = cands.shift();
  const idx = channels.indexOf(next);
  if (idx < 0) return tryBackupSequence(cands);

  const name = next.name || 'สำรอง';
  showPlayerStatus(`สลับไปช่องสำรอง: ${name}`);
  window.__setNowPlaying?.(name);
  currentIndex = idx;
  highlight(idx);
  startPresence(next.id || name || `ch-${idx}`);
  scrollToPlayer();
  showMobileToast(`สำรอง: ${name}`);

  const srcList = buildSources(next);
  tryPlayJW(next, srcList, 0, ()=> tryBackupSequence(cands));
}
function getBackupCandidates(main){
  if (!main) return [];
  const seen = new Set(); const out = [];
  const mainId = main.id || genIdFrom(main, 0);
  const baseKey = (main.group || main.groupId || main.series || main.bundle || null);
  const normMain = normalizeNameForMatch(main.name || '');

  if (main.fallbackId){ const target = channels.find(c => (c.id||'') === main.fallbackId); if (target) pushOnce(target, 10); }
  channels.forEach(c=>{ if (!c||c===main) return; if (c.aliasOf===mainId || c.mainId===mainId || c.primaryId===mainId) pushOnce(c, 8); });

  if (baseKey){ channels.forEach(c=>{ if (!c||c===main) return; if ((c.group||c.groupId||c.series||c.bundle||null)===baseKey) pushOnce(c, scoreBackupLike(c)+4); }); }

  channels.forEach(c=>{ if (!c||c===main) return; const nn=normalizeNameForMatch(c.name||''); if (nn && nn===normMain) pushOnce(c, scoreBackupLike(c)+2); });

  out.sort((a,b)=> (b._score||0) - (a._score||0));
  return out.filter(c => (c && (c.id||c.name) !== (main.id||main.name)));

  function pushOnce(c,score=0){ const key=c.id||c.name||''; if(seen.has(key))return; seen.add(key); c._score=(c._score||0)+score; out.push(c); }
  function scoreBackupLike(c){ const badge=(c.badge||'')+' '+(c.tag||'')+' '+(Array.isArray(c.tags)?c.tags.join(' '):''); const hay=((c.name||'')+' '+badge).toLowerCase(); let s=0; if(c.backup===true)s+=5; if(/สำรอง|ทางสำรอง|backup|mirror|alt/.test(hay))s+=3; if(/hd|uhd|4k/.test(hay))s-=1; return s; }
}
function normalizeNameForMatch(s){
  s = String(s||'').toLowerCase();
  s = s.replace(/[\(\)\[\]\{\}]+/g,' ').replace(/\b(hd|uhd|4k|sd)\b/g,' ');
  s = s.replace(/ช่อง|สำรอง|ทางสำรอง|backup|mirror|alt|live|tv|channel/gi,' ');
  s = s.replace(/[^a-z0-9ก-๙]+/g,''); return s.trim();
}

/* ------------------------ Presence Impl ------------------------ */
function getViewerId(){
  try{
    let id = localStorage.getItem(VIEWER_ID_KEY);
    if (!id){
      const rnd = (crypto?.getRandomValues) ? crypto.getRandomValues(new Uint8Array(8)) : null;
      id = rnd ? Array.from(rnd).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16) : Math.random().toString(36).slice(2,10);
      localStorage.setItem(VIEWER_ID_KEY, id);
    }
    return id;
  }catch{ return Math.random().toString(36).slice(2,10); }
}
function stopPresence(){
  if (presenceTimer){ clearInterval(presenceTimer); presenceTimer = null; }
  if (presenceSwitchTimer){ clearTimeout(presenceSwitchTimer); presenceSwitchTimer = null; }
}
function startPresence(key){
  currentPresenceKey = key;
  stopPresence();

  const delay = presenceFirstStart ? 0 : PRESENCE_SWITCH_DELAY_MS;
  presenceFirstStart = false;

  presenceSwitchTimer = setTimeout(()=>{
    heartbeat(key, true); // ping แรก
    presenceTimer = setInterval(()=>{ if (!document.hidden) heartbeat(key); }, PING_INTERVAL_S * 1000);
  }, delay);
}
async function heartbeat(key){
  const vId = getViewerId();
  const u = `${PRESENCE_URL}?ch=${encodeURIComponent(key)}&v=${encodeURIComponent(vId)}&ttl=${VIEWER_TTL_S}`;
  try{
    const res = await fetch(u, { cache:'no-store' });
    const js  = await res.json().catch(()=> ({}));
    if (typeof js.count === 'number') updateLiveViewers(js.count);
  }catch{ /* เงียบไว้ */ }
}
function bindPresenceWakeEvents(){
  if (presenceBound) return; presenceBound = true;
  const kick = ()=>{ if (currentPresenceKey) heartbeat(currentPresenceKey); };
  ['visibilitychange','focus','pageshow','online','resume'].forEach(ev=>{
    window.addEventListener(ev, kick, { passive:true });
  });
}

/* ------------------------ Player status / Utils / Histats / Refresh ------------------------ */
function showPlayerStatus(text){
  const parent = document.getElementById('player'); if (!parent) return;
  let box = document.getElementById('player-msg');
  if (!box){
    box = document.createElement('div'); box.id='player-msg';
    box.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.60);color:#fff;padding:8px 12px;border-radius:10px;font-weight:800;letter-spacing:.2px;z-index:5;max-width:70%;text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.35)`;
    parent.style.position = parent.style.position || 'relative'; parent.appendChild(box);
  }
  box.textContent = text || ''; box.style.display = text ? 'block' : 'none';
}
function headerOffset(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--header-offset');
  const num = parseFloat(v); if (!isNaN(num) && num > 0) return num;
  return document.querySelector('.h-wrap')?.offsetHeight || 0;
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
function escapeHtml(s){ return String(s).replace(/[&<>"'`=\/]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c])); }
function debounce(fn,wait=150){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function genIdFrom(ch,i){ return (ch.name?.toString().trim() || `ch-${i}`).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'') + '-' + i }

function getIconSVG(n){
  const c='currentColor';
  switch(n){
    case 'IPTV':   return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M4 20h16v-2H4v2zm5-4h6v-2H9v2zm-3-4h12V8H6v4zm4-9 2 2 2-2 1.4 1.4L12 6.8 8.6 4.4 10 3z"/></svg>`;
    case 'เด็ก':    return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 2a5 5 0 0 1 5 5c0 3.9-3.6 7-5 7s-5-3.1-5-7a5 5 0 0 1 5-5zm1 14c2 3 1 4-1 6h-1l1-3-2 1 2-4h1z"/></svg>`;
    case 'บันเทิง': return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.6L12 18.7 6.2 21l1.1-6.6-4.7-4.6 6.5-.9L12 3z"/></svg>`;
    case 'กีฬา':    return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 6.9 12.1A8 8 0 0 1 5.1 7.1 8 8 0 0 1 12 4z"/></svg>`;
    case 'สารคดี':  return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M4 5a3 3 0 0 1 3-3h6v18H7a3 3 0 0 0-3 3V5zm10-3h3a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3h-3V2z"/></svg>`;
    case 'หนัง':    return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M21 10v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7h18zM4.7 4.1l1.7 3.1h4.2L8.9 4.1h3.8l1.7 3.1h4.2L16.8 4.1H19a2 2 0 0 1 2 2v2z"/></svg>`;
    default:        return `<svg viewBox="0 0 24 24" fill="${c}"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`;
  }
}

/* ------------------------ Histats (ซ่อน) ------------------------ */
function mountHistatsHidden(){
  let holder = document.getElementById('histats_counter');
  if (!holder) { holder = document.createElement('div'); holder.id='histats_counter'; document.body.appendChild(holder); }
  const hiddenCSS = `position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;`;
  holder.style.cssText = hiddenCSS;

  window._Hasync = window._Hasync || [];
  window._Hasync.push(['Histats.startgif','1,4970878,4,10052,"div#histatsC {position:absolute;top:0;right:0;}body>div#histatsC {position:fixed;}"']);
  window._Hasync.push(['Histats.fasi','1']);
  window._Hasync.push(['Histats.track_hits','']);

  if (!document.getElementById('histats-loader')) {
    const hs = document.createElement('script'); hs.id='histats-loader'; hs.async=true; hs.src='//s10.histats.com/js15_giftop_as.js';
    (document.head || document.body).appendChild(hs);
  }
  const ensureInside = () => { const c = document.getElementById('histatsC'); if (c && c.parentNode !== holder) holder.appendChild(c); if (c) c.style.cssText = hiddenCSS; };
  ensureInside();
  const obs = new MutationObserver(ensureInside);
  obs.observe(document.documentElement, { childList:true, subtree:true });
}

/* ------------------------ Refresh + Auto clear ------------------------ */
function mountRefreshButton(){
  const wrap = document.querySelector('.h-wrap') || document.querySelector('header');
  if (!wrap || document.getElementById('refresh-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'refresh-btn'; btn.className='refresh-btn'; btn.type='button'; btn.title='รีเฟรชช่อง + ล้างแคช';
  btn.innerHTML = '<span class="i">↻</span><span class="t">รีเฟรช</span>';

  let status = document.getElementById('refresh-status');
  if (!status){ status = document.createElement('span'); status.id='refresh-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); }

  const updateBtnW = () => { const w = btn.getBoundingClientRect().width; document.documentElement.style.setProperty('--refresh-btn-w', `${Math.ceil(w)}px`); };

  let hideTimer=null;
  const showStatus = (text) => { status.textContent = text; status.classList.add('on'); if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(()=> status.classList.remove('on'), 2600); };

  btn.addEventListener('click', async ()=>{
    try{
      btn.disabled = true; btn.querySelector('.t').textContent = 'กำลังรีเฟรช...'; updateBtnW();
      await clearAppCache(); await loadData(); buildTabs(); autoplayFirst();
      const t = new Intl.DateTimeFormat('th-TH',{ timeStyle:'medium', hour12:false, timeZone: TIMEZONE }).format(new Date());
      showStatus(`รีเฟรชเสร็จแล้ว • ${t}`);
    } finally { btn.disabled = false; btn.querySelector('.t').textContent = 'รีเฟรช'; updateBtnW(); }
  });

  wrap.appendChild(btn); wrap.appendChild(status);
  updateBtnW();
  if ('ResizeObserver' in window){ const ro = new ResizeObserver(updateBtnW); ro.observe(btn); }
  addEventListener('resize', debounce(updateBtnW, 120));
}
async function clearAppCache(){
  try { const keys = Object.keys(localStorage); for (const k of keys) if (/^jwplayer\./i.test(k) || k.includes('jwplayer')) localStorage.removeItem(k); } catch {}
  if (window.caches) { try { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))); } catch {} }
}
const AUTO_CLEAR_KEY = 'lastAutoClear';
const SIX_HR_MS = 6 * 60 * 60 * 1000;
function scheduleAutoClear(){
  const now = Date.now(); const last = Number(localStorage.getItem(AUTO_CLEAR_KEY) || 0);
  if (!last || (now - last) >= SIX_HR_MS) { clearAppCache(); localStorage.setItem(AUTO_CLEAR_KEY, String(now)); }
  const delay = Math.max(1000, SIX_HR_MS - ((now - last) % SIX_HR_MS || 0));
  setTimeout(function tick(){ clearAppCache(); localStorage.setItem(AUTO_CLEAR_KEY, String(Date.now())); setTimeout(tick, SIX_HR_MS); }, delay);
}
