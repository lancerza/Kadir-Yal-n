/* ========================= app.js =========================
   - ARIA Tabs + roving tabindex
   - ลบ Utils ซ้ำ
   - เพิ่ม Fallback: hls.js/dash.js + Auto-Proxy
   - Histats: ใช้ MutationObserver (ไม่มี rAF loop)
=============================================================*/

const CH_URL  = 'channels.json';
const CAT_URL = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS   = 140;
const STAGGER_STEP_MS = 22;

let categories = null;
let channels   = [];
let currentFilter = null;
let currentIndex  = -1;

jwplayer.key = jwplayer.key || 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo';

/* ------------------------ Boot ------------------------ */
(async function boot(){
  scheduleAutoClear();
  mountClock();
  mountNowPlayingInHeader();
  mountHistatsTopRight();
  mountRefreshButton();

  try {
    await loadData();
  } catch (e) {
    console.error('โหลดข้อมูลไม่สำเร็จ:', e);
    window.__setNowPlaying?.('โหลดข้อมูลไม่สำเร็จ');
  }

  buildTabs();
  restoreLastOrPlayFirst();
  centerTabsIfPossible();
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
  const ch = channels[globalIndex]; if(!ch) return;
  currentIndex = globalIndex;

  window.__setNowPlaying?.(ch?.name || '');
  showMobileToast(ch?.name || '');

  const list = (ch.sources && Array.isArray(ch.sources) && ch.sources.length>0)
    ? ch.sources : [{ src: ch.src || ch.file, type: ch.type }];

  tryPlayJW(ch, list, 0, /*triedProxy*/ false);
  highlight(globalIndex);
  if (opt.scrollToCard) revealActiveCardIntoView();
  scrollToPlayer();
}

function tryPlayJW(ch, list, idx, triedProxy){
  if (idx >= list.length) {
    console.warn('ทุกแหล่งบน JW เล่นไม่สำเร็จ → ลอง fallback', ch?.name);
    return fallbackPlay(ch, list);
  }
  const s = list[idx];
  const jwSrc = makeJwSource(s, ch);
  destroyNative(); // เผื่อมี video ค้าง
  const player = jwplayer('player').setup({
    playlist: [{ image: ch.poster || ch.logo || undefined, sources: [jwSrc] }],
    width:'100%', aspectratio:'16:9', autostart:true,
    mute: isMobile(), preload:'metadata',
    displaytitle:false, displaydescription:false,
    playbackRateControls:true,
    // hlsjs: true  // (ไม่บังคับ)
  });

  // บางอุปกรณ์ต้อง mute ครั้งแรก
  player.once('playAttemptFailed', ()=>{ player.setMute(true); player.play(true); });

  player.on('error', (ev)=>{
    console.warn('JW error →', ev?.message || ev);
    // ลองผ่าน Proxy อัตโนมัติถ้ามี PROXY_BASE และยังไม่ลอง
    if (window.PROXY_BASE && ch.proxy !== false && !triedProxy) {
      const viaProxy = withProxyVariant(s, ch);
      console.log('Retry JW via proxy');
      return tryPlayJW({ ...ch, proxy:true }, [{...viaProxy}], 0, true);
    }
    // แหล่งถัดไป
    tryPlayJW(ch, list, idx+1, triedProxy);
  });
}

function fallbackPlay(ch, list){
  // เลือกแหล่งแรกที่ตรงชนิด
  const tryList = [
    ...list.map(s => [detectType(s.src||s.file||''), s]),
  ];

  const hlsItem = tryList.find(([t]) => t==='hls');
  const dashItem = tryList.find(([t]) => t==='dash');
  const mp4Item  = tryList.find(([t]) => t==='auto');

  if (hlsItem) {
    const s = hlsItem[1];
    const url = finalizeUrl(s, ch);
    if (playWithHlsJs(url)) return;
  }
  if (dashItem) {
    const s = dashItem[1];
    const url = finalizeUrl(s, ch);
    if (playWithDashJs(url)) return;
  }
  if (mp4Item) {
    const s = mp4Item[1];
    const url = finalizeUrl(s, ch);
    if (playWithNativeMP4(url)) return;
  }

  window.__setNowPlaying?.(`เล่นไม่สำเร็จ: ${ch?.name||''}`);
  showMobileToast('เล่นไม่สำเร็จ');
}

/* ------------------------ JW helpers ------------------------ */
function makeJwSource(s, ch){
  const file = finalizeUrl(s, ch);
  const type = (s.type || detectType(file)).toLowerCase();
  const out = { file, type, withCredentials: !!ch.withCredentials };
  if (type==='dash' && s.drm?.clearkey?.keyId && s.drm?.clearkey?.key){
    out.drm = { clearkey: { keyId: s.drm.clearkey.keyId, key: s.drm.clearkey.key } };
  }
  return out;
}
function finalizeUrl(s, ch){
  const raw = s.src || s.file || '';
  return wrapWithProxyIfNeeded(raw, ch);
}
function detectType(u){ u=(u||'').split('?')[0].toLowerCase(); if(u.endsWith('.m3u8'))return'hls'; if(u.endsWith('.mpd'))return'dash'; if(u.endsWith('.mp4'))return'auto'; return u.includes('.m3u8')?'hls':(u.includes('.mpd')?'dash':'auto'); }
function wrapWithProxyIfNeeded(url, ch){
  if (window.PROXY_BASE && (ch.proxy || false)) {
    const payload = { src:url, referrer: ch.referrer||'', ua: ch.ua||'', headers: ch.headers||{} };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${window.PROXY_BASE}/p/${b64}`;
  }
  return url;
}
function withProxyVariant(s, ch){
  return { ...s, src: wrapWithProxyIfNeeded(s.src||s.file||'', { ...ch, proxy:true }) };
}

/* ------------------------ Fallback players ------------------------ */
function ensureVideoEl(){
  const host = document.getElementById('player');
  destroyJW(); // กันทับ
  host.innerHTML = '';
  const v = document.createElement('video');
  v.className = 'player-video';
  v.setAttribute('playsinline','');
  v.setAttribute('controls','');
  v.muted = isMobile();
  host.appendChild(v);
  return v;
}
function destroyJW(){ try{ jwplayer('player').remove(); }catch{} }
function destroyNative(){
  const host = document.getElementById('player');
  const v = host?.querySelector('video.player-video');
  if (v){
    try{ v.pause(); }catch{}
    host.removeChild(v);
  }
}

/* HLS */
function playWithHlsJs(url){
  try{
    const v = ensureVideoEl();
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.play().catch(()=>{});
      return true;
    }
    if (window.Hls && Hls.isSupported()){
      const hls = new Hls({ lowLatencyMode:true, enableWorker:true });
      hls.on(Hls.Events.ERROR, (_, data)=>{
        console.warn('hls.js error', data);
      });
      hls.loadSource(url);
      hls.attachMedia(v);
      v.play().catch(()=>{});
      return true;
    }
  }catch(e){ console.warn('fallback HLS fail', e); }
  return false;
}

/* DASH */
function playWithDashJs(url){
  try{
    if (!window.dashjs) return false;
    const v = ensureVideoEl();
    const p = dashjs.MediaPlayer().create();
    p.initialize(v, url, true);
    return true;
  }catch(e){ console.warn('fallback DASH fail', e); return false; }
}

/* MP4 (progressive) */
function playWithNativeMP4(url){
  try{
    const v = ensureVideoEl();
    v.src = url; v.play().catch(()=>{});
    return true;
  }catch(e){ return false; }
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
function ripple(container, x, y){
  const max = Math.max(container.clientWidth, container.clientHeight);
  const s = document.createElement('span'); s.className='ripple';
  s.style.width = s.style.height = `${max}px`;
  s.style.left = `${x - max/2}px`; s.style.top  = `${y - max/2}px`;
  container.querySelector('.ripple')?.remove(); container.appendChild(s);
  s.addEventListener('animationend', ()=>s.remove(), { once:true });
}

/* ------------------------ Icons (เรียบง่าย) ------------------------ */
function getIconSVG(name){
  const c='currentColor';
  return `<svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="${c}" stroke-width="2"/><path d="M9 20h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

/* ------------------------ Tabs ------------------------ */
function buildTabs(){
  const root = document.getElementById('tabs'); if(!root) return;
  root.innerHTML = '';
  (categories?.order || []).forEach(name=>{
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.filter = name;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-selected','false');
    btn.setAttribute('tabindex','-1');
    btn.setAttribute('aria-controls','channel-list');
    btn.innerHTML = `<span class="tab-card"><span class="tab-icon">${getIconSVG(name)}</span><span class="tab-label">${name}</span></span>`;
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
    const sel = b.dataset.filter===name;
    b.setAttribute('aria-selected', sel?'true':'false');
    b.setAttribute('tabindex', sel?'0':'-1');
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
  el.classList.toggle('tabs--center', el.scrollWidth <= el.clientWidth + 1);
}

/* ------------------------ Category rules ------------------------ */
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
  if (list.length===0){ showEmptyState('ไม่มีช่องในหมวดนี้'); return; }

  list.forEach((ch)=>{
    const btn = document.createElement('button');
    btn.className = 'channel';
    btn.dataset.category = getCategory(ch);
    btn.dataset.globalIndex = String(channels.indexOf(ch));
    if (useWideLogo(ch)) btn.dataset.wide = 'true';
    btn.title = ch.name || 'ช่อง';
    btn.setAttribute('aria-label', `เล่นช่อง ${ch.name||'ไม่ทราบชื่อ'}`);
    btn.innerHTML = `
      <div class="ch-card">
        <div class="logo-wrap">
          <img class="logo" loading="lazy" decoding="async" src="${escapeHtml(ch.logo || '')}" alt="${escapeHtml(ch.name||'โลโก้ช่อง')}">
        </div>
        <span class="name">${escapeHtml(ch.name || '')}</span>
      </div>`;
    btn.addEventListener('click', (e)=>{
      const r = e.currentTarget;
      const rect = r.getBoundingClientRect();
      ripple(r.querySelector('.ch-card'), e.clientX - rect.left, e.clientY - rect.top);
      playIndex(Number(r.dataset.globalIndex));
      safeSet('lastId', genIdFrom(ch, channels.indexOf(ch)));
    });
    grid.appendChild(btn);
  });

  grid.style.setProperty('--stagger', `${STAGGER_STEP_MS}ms`);
  if (opt.withEnter){
    grid.classList.add('switch-in');
    setTimeout(()=> grid.classList.remove('switch-in'), 900);
  }
  highlight(currentIndex);
}
function showEmptyState(msg='ไม่พบรายการช่อง'){
  const grid = ensureGrid();
  grid.innerHTML = `<div style="padding:24px 12px;opacity:.8;text-align:center">${escapeHtml(msg)}</div>`;
}
function revealActiveCardIntoView(){
  const active = document.querySelector('.channel[aria-pressed="true"], .channel.active');
  if (!active) { setTimeout(revealActiveCardIntoView, 120); return; }
  const header = document.querySelector('header');
  const pad = 80; const h = (header?.offsetHeight)||0;
  const y = active.getBoundingClientRect().top + window.pageYOffset - h - pad;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/* ------------------------ Clock + Now Playing ------------------------ */
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
function mountNowPlayingInHeader(){
  const host = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;
  let now = document.getElementById('now-playing');
  if (!now) { now = document.createElement('div'); now.id = 'now-playing'; }
  now.className = 'now-playing'; now.setAttribute('aria-live','polite');
  host.appendChild(now);
  window.__setNowPlaying = (name='')=>{
    now.textContent = name || ''; now.title = name || '';
    now.classList.remove('swap'); void now.offsetWidth; now.classList.add('swap');
  };
}
function showMobileToast(text){
  if (!isMobile()) return;
  let t = document.getElementById('mini-toast');
  if (!t){
    t = document.createElement('div');
    t.id = 'mini-toast';
    t.style.cssText = `position:absolute;left:50%;top:10px;transform:translateX(-50%);
      background:rgba(0,0,0,.65);color:#fff;padding:6px 10px;border-radius:8px;
      font-size:13px;font-weight:600;z-index:9;pointer-events:none;opacity:0;transition:opacity .18s ease`;
    const parent = document.getElementById('player');
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(t);
  }
  t.textContent = text;
  requestAnimationFrame(()=>{ t.style.opacity = '1'; });
  setTimeout(()=>{ t.style.opacity = '0'; }, 1500);
}

/* ------------------------ Histats with MutationObserver ------------------------ */
function mountHistatsTopRight(){
  const holder = document.getElementById('histats_counter'); if (!holder) return;
  const tryMove = ()=>{ const c=document.getElementById('histatsC'); if(c && !holder.contains(c)) holder.appendChild(c); };
  tryMove();
  const mo = new MutationObserver(()=>tryMove());
  mo.observe(document.body, { childList:true, subtree:true });
}

/* ------------------------ Refresh + cache clear ------------------------ */
function mountRefreshButton(){
  const btn = document.getElementById('refresh-btn'); if (!btn) return;
  btn.addEventListener('click', async ()=>{
    try{
      btn.disabled = true; btn.querySelector('.t').textContent = 'กำลังรีเฟรช...';
      await clearAppCache(); location.reload();
    } finally { btn.disabled = false; }
  });
}
async function clearAppCache(){
  try{
    const del=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; if(/^(jwplayer|jwSettings|hls|dash)/i.test(k)) del.push(k); }
    del.forEach(k=> localStorage.removeItem(k));
  }catch{}
  if ('caches' in window) {
    try{ const names = await caches.keys(); for (const n of names) await caches.delete(n); }catch{}
  }
}
function scheduleAutoClear(){
  const SIX_HR_MS = 6*60*60*1000, KEY='autoClearAt';
  const last = Number(safeGet(KEY)) || 0, now=Date.now();
  const delay = Math.max(1000, SIX_HR_MS - ((now - last) % SIX_HR_MS || 0));
  setTimeout(function tick(){ clearAppCache(); localStorage.setItem(KEY, String(Date.now())); setTimeout(tick, SIX_HR_MS); }, delay);
}
