/* ========================= app.js (RESUME + SHOW ACTIVE CARD) =========================
   - เปิดเว็บใหม่: ถ้ามี lastId → เปิดหมวดนั้น + เล่นช่องนั้น + เลื่อนให้เห็น ch-card ที่เล่นอยู่
                   ถ้าไม่มี → เล่นช่องแรกของหมวดแรก + เลื่อนให้เห็น ch-card เช่นกัน
   - ปุ่มรีเฟรช + ล้างแคช (ไม่ลบ lastId) + เคลียร์อัตโนมัติทุก 6 ชม.
   - now-playing ตำแหน่งเดิมใน header (ไม่มีกรอบ)
   - Histats ติดมุมขวาใน .h-wrap (โค้ดใหม่ 4970878/10052)
======================================================================================= */

const CH_URL  = 'channels.json';
const CAT_URL = 'categories.json';
const TIMEZONE = 'Asia/Bangkok';

const SWITCH_OUT_MS   = 140;
const STAGGER_STEP_MS = 22;

let categories = null;
let channels   = [];
let currentFilter = null;
let currentIndex  = -1;
let lastId       = null;

/* ------------------------ Boot ------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  mountRefreshButton();
  scheduleAutoClear();

  mountClock();
  mountNowPlayingInHeader();
  mountHistatsTopRight();

  try {
    await loadData();
  } catch (e) {
    console.error('โหลดข้อมูลไม่สำเร็จ:', e);
    window.__setNowPlaying?.('โหลดข้อมูลไม่สำเร็จ');
  }

  try {
    buildTabs();
    restoreLastId();
    resumeLastOrAutoplayFirst();
    centerTabsIfPossible();
  } catch (e) {
    console.error(e);
  }

  addEventListener('resize', debounce(centerTabsIfPossible,150));
  addEventListener('load', centerTabsIfPossible);
});

/* ------------------------ Load (fresh fetch) ------------------------ */
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
  categories = Array.isArray(catRes?.categories) ? catRes.categories : [];
  channels   = Array.isArray(chRes?.channels) ? chRes.channels : (Array.isArray(chRes) ? chRes : []);
}

/* ------------------------ Clock ------------------------ */
function mountClock(){
  const el = document.getElementById('datetime-display') || document.querySelector('.clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('th-TH', {
    timeZone: TIMEZONE, hour:'2-digit', minute:'2-digit', second:'2-digit',
    weekday:'short', day:'2-digit', month:'short', year:'numeric'
  });
  const tick = ()=>{ el.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 1000);
}

/* ------------------------ Now Playing (header) ------------------------ */
function mountNowPlayingInHeader(){
  const el = document.querySelector('.now-playing');
  if (!el) return;
  window.__setNowPlaying = (t='')=>{
    el.classList.remove('swap'); void el.offsetWidth; el.textContent = t || ''; el.classList.add('swap');
  };
}

/* ------------------------ Tabs + Grid (minimal) ------------------------ */
function getCategory(ch){ return ch.category || 'ทั้งหมด'; }

function buildTabs(){
  const tabs = document.getElementById('tabs') || document.querySelector('.tabs');
  if (!tabs) return;
  tabs.innerHTML = '';

  const uniq = ['ทั้งหมด', ...Array.from(new Set(channels.map(getCategory)))];
  uniq.forEach(cat=>{
    const tab = document.createElement('div');
    tab.className = 'tab'; tab.dataset.filter = cat;
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected', String(cat===currentFilter));
    tab.innerHTML = `
      <div class="tab-card">
        <div class="tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg></div>
        <div class="tab-label">${cat}</div>
      </div>`;
    tab.addEventListener('click', ()=>{
      setActiveTab(cat);
      buildGrid();
    });
    tabs.appendChild(tab);
  });

  if (!currentFilter) setActiveTab(uniq[0]);
}
function setActiveTab(cat){
  currentFilter = cat;
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t=> t.setAttribute('aria-selected', String(t.dataset.filter===cat)));
}
function buildGrid(){
  const grid = document.getElementById('channel-list') || document.querySelector('.grid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = currentFilter==='ทั้งหมด' ? channels : channels.filter(c=> getCategory(c)===currentFilter);

  list.forEach((ch, i)=>{
    const idx = channels.indexOf(ch);
    const el = document.createElement('div');
    el.className = 'channel'; el.dataset.index = idx;
    if (ch.wide) el.setAttribute('data-wide','true');
    el.innerHTML = `
      <div class="ch-card">
        <div class="logo-wrap"><img class="logo" src="${ch.logo||''}" alt=""></div>
        <div class="name">${ch.name||''}</div>
      </div>
    `;
    el.addEventListener('click', ()=> playByIndex(idx, { scroll:true }));
    grid.appendChild(el);
  });

  scheduleRevealActiveCard();
}

/* ------------------------ Play / Resume ------------------------ */
function playByIndex(idx, {scroll=false}={}){
  currentIndex = idx;
  const ch = channels[idx];
  if (!ch) return;

  // (ใส่ลอจิก Player จริงของคุณที่นี่) …
  window.__setNowPlaying?.(ch.name || '');

  document.querySelectorAll('.channel').forEach(c=> c.classList.remove('active'));
  const active = document.querySelector(`.channel[data-index="${idx}"]`);
  if (active){ active.classList.add('active'); if (scroll) active.scrollIntoView({behavior:'smooth', block:'center'}); }

  lastId = String(idx);
  try { localStorage.setItem('lastId', lastId); } catch {}
}
function restoreLastId(){
  try { lastId = localStorage.getItem('lastId') || null; } catch { lastId = null; }
}
function resumeLastOrAutoplayFirst(){
  const firstCat = (document.querySelector('.tab')?.dataset.filter) || 'ทั้งหมด';
  if (lastId && Number.isFinite(+lastId) && channels[+lastId]){
    const ch = channels[+lastId];
    setActiveTab(getCategory(ch));
    buildGrid();
    playByIndex(+lastId, { scroll:true });
    return;
  }
  setActiveTab(firstCat);
  buildGrid();
  if (channels.length) playByIndex(0, { scroll:true });
}
function scheduleRevealActiveCard(){
  setTimeout(()=>{
    const act = document.querySelector('.channel.active');
    if (act) act.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
  }, 50);
}

/* ------------------------ Center tabs (nice) ------------------------ */
function centerTabsIfPossible(){
  const el = document.querySelector('.tabs');
  if (!el) return;
  const over = el.scrollWidth - el.clientWidth;
  el.classList.toggle('tabs--center', over <= 8);
}

/* ------------------------ Histats (ติดขวาใน .h-wrap — โค้ดใหม่) ------------------------ */
function mountHistatsTopRight(){
  const anchor = document.querySelector('.h-wrap') || document.querySelector('header') || document.body;

  // จุดยึด
  let holder = document.getElementById('histats_counter');
  if (!holder) { holder = document.createElement('div'); holder.id = 'histats_counter'; }
  if (!holder.parentElement) anchor.appendChild(holder);

  // ตั้งค่า Hasync (ใช้ค่าใหม่ของคุณ)
  window._Hasync = window._Hasync || [];
  window._Hasync.push([
    'Histats.startgif',
    '1,4970878,4,10052,"div#histatsC {position: absolute;top:0px;right:0px;}body>div#histatsC {position: fixed;}"'
  ]);
  window._Hasync.push(['Histats.fasi','1']);
  window._Hasync.push(['Histats.track_hits','']);

  // โหลดสคริปต์ (กันซ้ำ)
  if (!document.getElementById('histats-loader')) {
    const hs = document.createElement('script');
    hs.id = 'histats-loader';
    hs.type = 'text/javascript';
    hs.async = true;
    hs.src = '//s10.histats.com/js15_giftop_as.js';
    (document.head || document.body).appendChild(hs);
  }

  // ย้าย #histatsC มาไว้ใน holder เสมอ + ยกเลิก position เดิม ให้จัดวางตาม CSS เรา
  const ensureInside = () => {
    const c = document.getElementById('histatsC');
    if (c && c.parentNode !== holder) {
      holder.appendChild(c);
      c.style.position = 'static';
      c.style.top = '';
      c.style.right = '';
    }
    // Color sync from Histats image
    const img = holder.querySelector('img');
    if (img) {
      if (img.src) syncRefreshColorFromHistats(img.src);
      hookImgForColor(img);
    }
  };
  ensureInside();
  const obs = new MutationObserver(ensureInside);
  obs.observe(document.documentElement, { childList:true, subtree:true });
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

/* เคลียร์ cache/LS อย่างสุภาพ */
async function clearAppCache(){
  try{
    const ks = Object.keys(localStorage||{}).filter(k=>k.startsWith('_t_'));
    ks.forEach(k=> localStorage.removeItem(k));
  } catch {}
  if ('caches' in self) {
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
  setTimeout(scheduleAutoClear, delay);
}

/* ------------------------ Utils ------------------------ */
function debounce(fn, wait=120){
  let t=0; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
}

/* =================== Utilities: HISTATS COLOR SYNC (refresh button exact match) =================== */
function hookImgForColor(img){
  if (!img || img.__colorHooked) return;
  img.__colorHooked = true;
  img.addEventListener('load', ()=> img.src && syncRefreshColorFromHistats(img.src), { passive:true });
  const mo = new MutationObserver(muts=>{
    for(const m of muts){
      if (m.type==='attributes' && m.attributeName==='src') {
        const u = img.getAttribute('src') || '';
        if (u) syncRefreshColorFromHistats(u);
      }
    }
  });
  mo.observe(img, { attributes:true, attributeFilter:['src'] });
}

function syncRefreshColorFromHistats(url){
  try{
    const m = /@b1:([\-]?\d+)/.exec(url);
    if(!m) return;
    const baseHex = argbIntToRgbHex(parseInt(m[1], 10));
    const top = tint(baseHex, 0.16);
    const mid = baseHex;
    const bot = shade(baseHex, 0.28);
    const border = shade(baseHex, 0.42);
    const glow = hexToRGBA(baseHex, 0.55);
    const ink = pickInkColor(baseHex);
    const root = document.documentElement.style;
    root.setProperty('--hs-base', baseHex);
    root.setProperty('--hs-top', top);
    root.setProperty('--hs-mid', mid);
    root.setProperty('--hs-bot', bot);
    root.setProperty('--hs-border', border);
    root.setProperty('--hs-glow', glow);
    root.setProperty('--hs-ink', ink);
  }catch(e){}
}

// signed int ARGB -> #RRGGBB
function argbIntToRgbHex(n){
  const u = (n >>> 0).toString(16).padStart(8,'0');
  return ('#' + u.slice(2)).toUpperCase();
}

function tint(hex, amount=0.15){
  const {h,s,l} = hexToHsl(hex);
  return hslToHex(h, s * 0.98, clamp01(l + amount));
}
function shade(hex, amount=0.15){
  const {h,s,l} = hexToHsl(hex);
  return hslToHex(h, s * 0.92, clamp01(l - amount));
}
function pickInkColor(hex){
  const {r,g,b} = hexToRgb(hex);
  const y = (0.2126*r + 0.7152*g + 0.0722*b)/255;
  return y > 0.62 ? '#031018' : '#F4FAFF';
}
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function hexToRgb(hex){
  const h = hex.replace('#','');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function rgbToHex(r,g,b){
  const to = v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0');
  return '#'+to(r)+to(g)+to(b);
}
function hexToRGBA(hex, a){
  const {r,g,b} = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hexToHsl(hex){
  let {r,g,b} = hexToRgb(hex);
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b); let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min; s=l>0.5? d/(2-max-min): d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h/=6;
  }
  return {h,s,l};
}
function hslToHex(h,s,l){
  function hue2rgb(p,q,t){
    if(t<0) t+=1; if(t>1) t-=1;
    if(t<1/6) return p+(q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  }
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q=l<0.5 ? l*(1+s) : l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return rgbToHex(Math.round(r*255), Math.round(g*255), Math.round(b*255));
}
