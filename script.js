
// script.js — GitHub Pages build (with Deep Refresh / Clear Cache)
document.addEventListener("DOMContentLoaded", () => {
  // --- Global ---
  let hls, channels = {}, currentChannelId = null;
  let controlsTimeout;
  let isAudioUnlocked = false;

  // A global cache-buster stamp (set during deep refresh)
  window.__cacheBuster = null;

  // --- DOM ---
  const body = document.body;
  const categorySidebar = document.getElementById('category-sidebar');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
  const video = document.getElementById('video');
  const playerWrapper = document.querySelector('.player-wrapper');
  const customControls = document.querySelector('.custom-controls');
  const channelButtonsContainer = document.getElementById('channel-buttons-container');
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingMessage = document.getElementById('loading-message');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const progressBar = document.getElementById('progress-bar');
  const timeDisplay = document.getElementById('time-display');
  const muteBtn = document.getElementById('mute-btn');
  const volumeSlider = document.getElementById('volume-slider');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const pipBtn = document.getElementById('pip-btn');
  const liveIndicator = document.getElementById('live-indicator');
  const playOverlay = document.getElementById('play-overlay');

  // GitHub Pages = ไม่มี backend: ซ่อนตัวนับผู้ชม
  const totalViewerWrap = document.getElementById('viewer-count-display');
  if (totalViewerWrap) totalViewerWrap.style.display = 'none';

  // --- Helpers ---
  function showLoadingIndicator(isLoading, message = '') {
    loadingIndicator.classList.toggle('hidden', !isLoading);
    if (isLoading) loadingMessage.textContent = message;
  }
  function unlockAudio() {
    if (isAudioUnlocked) return;
    isAudioUnlocked = true;
    const savedMuted = localStorage.getItem('webtv_muted') === 'true';
    video.muted = savedMuted;
    playerControls.updateMuteButton();
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
  }

  function currentStamp() {
    return window.__cacheBuster || Date.now();
  }

  function buildPlayableUrl(url) {
    // ถ้ามีโหมด cache-bust (deep refresh) ให้เติม param ป้องกัน CDN cache
    const bust = (url.includes('?') ? '&' : '?') + `_=${currentStamp()}`;

    if (window.PROXY_BASE) {
      // ส่งผ่าน Proxy โดยไม่เปลี่ยน base64 เป้าหมาย
      const enc = btoa(url);
      const ua = encodeURIComponent(navigator.userAgent || '');
      const ref = encodeURIComponent(location.href);
      // เพิ่ม ts ที่ฝั่ง proxy เพื่อกัน cache ที่ proxy/cdn
      return `${window.PROXY_BASE}/p/${enc}?ua=${ua}&ref=${ref}&ts=${currentStamp()}`;
    }
    // สำหรับ non-proxy ก็เติม query buster ไปที่ปลายทาง
    return url + bust;
  }

  const playerControls = {
    showError: (message) => {
      const el = document.getElementById('error-channel-name');
      if (currentChannelId && channels[currentChannelId]) {
        el.textContent = channels[currentChannelId].name;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
      errorMessage.textContent = message;
      errorOverlay.classList.remove('hidden');
      const retryBtn = document.getElementById('retry-btn');
      const newBtn = retryBtn.cloneNode(true);
      newBtn.addEventListener('click', () => { if (currentChannelId) channelManager.loadChannel(currentChannelId); });
      retryBtn.parentNode.replaceChild(newBtn, retryBtn);
    },
    hideError: () => errorOverlay.classList.add('hidden'),
    togglePlay: () => {
      if (video.paused) video.play().catch(e => { if (e.name !== 'AbortError') console.error(e); });
      else video.pause();
    },
    updatePlayButton: () => {
      playPauseBtn.querySelector('.icon-play').classList.toggle('hidden', !video.paused);
      playPauseBtn.querySelector('.icon-pause').classList.toggle('hidden', video.paused);
    },
    formatTime: (t) => {
      const time = !isNaN(t) ? t : 0;
      const h = Math.floor(time / 3600);
      const m = Math.floor((time % 3600) / 60).toString().padStart(2,'0');
      const s = Math.floor(time % 60).toString().padStart(2,'0');
      return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
    },
    updateProgress: () => {
      progressBar.value = (video.currentTime / video.duration) * 100 || 0;
      timeDisplay.textContent = `${playerControls.formatTime(video.currentTime)} / ${playerControls.formatTime(video.duration)}`;
    },
    setProgress: () => video.currentTime = (progressBar.value / 100) * video.duration,
    toggleMute: () => {
      unlockAudio();
      video.muted = !video.muted;
      localStorage.setItem('webtv_muted', video.muted);
      playerControls.updateMuteButton();
    },
    updateMuteButton: () => {
      const isMuted = video.muted || video.volume === 0;
      muteBtn.querySelector('.icon-volume-high').classList.toggle('hidden', isMuted);
      muteBtn.querySelector('.icon-volume-off').classList.toggle('hidden', !isMuted);
    },
    setVolume: () => {
      unlockAudio();
      video.volume = volumeSlider.value;
      video.muted = Number(volumeSlider.value) === 0;
      playerControls.updateMuteButton();
      localStorage.setItem('webtv_volume', video.volume);
      localStorage.setItem('webtv_muted', video.muted);
    },
    toggleFullscreen: () => {
      if (!document.fullscreenElement) playerWrapper.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
      else document.exitFullscreen();
    },
    togglePip: async () => {
      if (!document.pictureInPictureEnabled) return;
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch (e) { console.error("PiP Error:", e); }
    },
    hideControls: () => {
      if (video.paused) return;
      customControls.classList.add('controls-hidden');
      playerWrapper.classList.add('hide-cursor');
    },
    showControls: () => {
      customControls.classList.remove('controls-hidden');
      playerWrapper.classList.remove('hide-cursor');
      clearTimeout(controlsTimeout);
      controlsTimeout = setTimeout(playerControls.hideControls, 3000);
    },
    checkIfLive: () => {
      const isLive = !isFinite(video.duration);
      progressBar.style.display = isLive ? 'none' : 'flex';
      timeDisplay.style.display = isLive ? 'none' : 'block';
      liveIndicator.classList.toggle('hidden', !isLive);
    }
  };

  const channelManager = {
    updateActiveButton: () => {
      document.querySelectorAll('.channel-tile').forEach(t => t.classList.toggle('active', t.dataset.channelId === currentChannelId));
    },
    createChannelButtons: () => {
      channelButtonsContainer.innerHTML = '';
      categorySidebar.innerHTML = '';

      const grouped = {};
      for (const id in channels) {
        const ch = channels[id];
        const cat = ch.category || 'ทั่วไป';
        (grouped[cat] ||= []).push({ id, ...ch });
      }

      const categories = Object.keys(grouped).sort();

      for (const cat of categories) {
        const header = document.createElement('h2');
        header.className = 'channel-category-header';
        header.textContent = cat;
        header.id = `category-${cat.replace(/\s+/g, '-')}`;
        channelButtonsContainer.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'channel-buttons';
        if (cat === 'หนัง') grid.classList.add('movie-grid');

        grouped[cat].forEach((ch, index) => {
          const tile = document.createElement('a');
          tile.className = 'channel-tile';
          if (cat === 'หนัง') tile.classList.add('movie-tile');
          tile.dataset.channelId = ch.id;
          tile.addEventListener('click', () => {
            document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
            tile.classList.add('loading');
            channelManager.loadChannel(ch.id);
            playerWrapper.scrollIntoView({ behavior: 'smooth' });
          });

          const logoWrapper = document.createElement('div');
          logoWrapper.className = 'channel-logo-wrapper';
          const logoImg = document.createElement('img');
          logoImg.src = ch.logo;
          logoImg.alt = ch.name;
          logoImg.loading = 'lazy';
          logoWrapper.appendChild(logoImg);
          tile.appendChild(logoWrapper);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'channel-tile-name';
          nameSpan.innerText = ch.name;
          tile.appendChild(nameSpan);

          if (ch.badge) {
            const badge = document.createElement('div');
            badge.className = 'channel-badge';
            badge.innerHTML = `<i class="bi bi-stack"></i> ${ch.badge}`;
            tile.appendChild(badge);
          }

          tile.style.animationDelay = `${index * 0.05}s";
          grid.appendChild(tile);
        });

        channelButtonsContainer.appendChild(grid);
      }

      setupCategorySidebar(categories);
    },
    loadChannel: async (channelId) => {
      if (!channels[channelId]) return;
      if (hls) hls.stopLoad();
      video.classList.remove('visible');
      playerControls.hideError();
      showLoadingIndicator(true, `กำลังโหลดช่อง: ${channels[channelId].name}...`);

      try {
        const raw = channels[channelId].url;
        if (!raw) throw new Error('ไม่พบ URL ของช่อง');

        const streamUrl = buildPlayableUrl(raw);

        currentChannelId = channelId;
        localStorage.setItem('webtv_lastChannelId', channelId);
        const ch = channels[channelId];
        document.title = `▶️ ${ch.name} - Flow TV`;
        channelManager.updateActiveButton();

        if (Hls.isSupported()) {
          hls.loadSource(streamUrl);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
          await video.play().catch(()=>{});
        } else {
          throw new Error('เบราว์เซอร์นี้ไม่รองรับ HLS');
        }
      } catch (e) {
        console.error("Error loading channel:", e);
        playerControls.showError(`เกิดข้อผิดพลาด: ${e.message}`);
        showLoadingIndicator(false);
      }
    }
  };

  // --- Sidebar (scrollspy) ---
  function setupCategorySidebar(categories) {
    const icons = { 'IPTV':'bi-tv-fill', 'การศึกษา':'bi-book-half', 'กีฬา':'bi-dribbble', 'หนัง':'bi-film', 'ทั่วไป':'bi-grid-fill' };
    categories.forEach(cat => {
      const a = document.createElement('a');
      a.className = 'category-link';
      a.innerHTML = `<i class="bi ${icons[cat] || icons['ทั่วไป']}"></i> <span>${cat}</span>`;
      const cid = `category-${cat.replace(/\s+/g, '-')}`;
      a.href = `#${cid}`;
      a.addEventListener('click', (e) => { e.preventDefault(); document.getElementById(cid)?.scrollIntoView({ behavior: 'smooth' }); });
      categorySidebar.appendChild(a);
    });

    const headers = document.querySelectorAll('.channel-category-header');
    const links = document.querySelectorAll('.category-link');
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        let activeId = null;
        const trigger = 150;
        headers.forEach(h => { if (h.getBoundingClientRect().top < trigger) activeId = h.id; });
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href').substring(1) === activeId));
      }, 100);
    });
  }

  // --- Hls init / error handling split so we can re-init after deep refresh ---
  function bindHlsHandlers() {
    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      const p = video.play();
      if (p) p.catch(err => {
        if (err.name !== 'AbortError') {
          playOverlay.classList.remove('hidden');
          playerControls.updatePlayButton();
        }
      });
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        const failedChannelId = currentChannelId;
        const failedChannel = channels[failedChannelId];
        // auto-switch ไป "สำรอง" ถ้ามี
        if (failedChannel && failedChannel.badge !== 'สำรอง' && (data.type === Hls.ErrorTypes.NETWORK_ERROR || data.type === Hls.ErrorTypes.MEDIA_ERROR)) {
          const backupId = Object.keys(channels).find(key =>
            channels[key].name === failedChannel.name &&
            channels[key].badge === 'สำรอง' &&
            key !== failedChannelId
          );
          if (backupId) {
            showLoadingIndicator(true, `ช่องหลักขัดข้อง กำลังลองช่องสำรอง...`);
            setTimeout(() => {
              const oldId = currentChannelId;
              currentChannelId = null;
              channelManager.loadChannel(backupId).catch(() => {
                currentChannelId = oldId;
                playerControls.showError('ช่องสำรองล้มเหลว ไม่สามารถเล่นได้');
              });
            }, 500);
            return;
          }
        }
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
          case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
          default: playerControls.showError('เกิดข้อผิดพลาดร้ายแรง ไม่สามารถเล่นได้'); hls.destroy(); break;
        }
      }
    });
  }

  function initHls() {
    if (!Hls.isSupported()) return;
    hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 600 });
    hls.attachMedia(video);
    bindHlsHandlers();
  }

  function hardResetPlayer() {
    try {
      if (hls) {
        try { hls.detachMedia(); } catch {}
        try { hls.destroy(); } catch {}
      }
      hls = null;
      video.pause();
      video.removeAttribute('src');
      try { video.load(); } catch {}
    } catch (e) {
      console.warn('hardResetPlayer:', e);
    } finally {
      initHls();
    }
  }

  async function clearCacheStorage() {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {
      console.warn('CacheStorage clear failed:', e);
    }
  }

  async function deepRefresh(opts = {}) {
    const { wipeLocal = false } = opts;
    window.__cacheBuster = Date.now(); // activate cache-busting
    showLoadingIndicator(true, wipeLocal ? 'ล้างแคช + รีเฟรช...' : 'รีเฟรชรายการช่อง...');

    // 1) Clear Cache Storage (works even without SW)
    await clearCacheStorage();

    // 2) Reset player buffers and re-init Hls
    hardResetPlayer();

    // 3) Optionally wipe local remembered channel
    if (wipeLocal) {
      try { localStorage.removeItem('webtv_lastChannelId'); } catch {}
    }

    // 4) Fetch fresh channel list with query bust and reload current channel if possible
    await fetchAndRenderChannels(true);
    if (currentChannelId && channels[currentChannelId]) {
      await channelManager.loadChannel(currentChannelId);
    }

    // 5) small UI polish
    setTimeout(() => showLoadingIndicator(false), 200);
  }

  // --- Events ---
  function setupEventListeners() {
    playPauseBtn.addEventListener('click', playerControls.togglePlay);
    video.addEventListener('playing', () => {
      document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
      showLoadingIndicator(false);
      video.classList.add('visible');
    });
    video.addEventListener('pause', () => { playerControls.updatePlayButton(); playerControls.showControls(); });
    video.addEventListener('loadedmetadata', playerControls.checkIfLive);
    progressBar.addEventListener('input', playerControls.setProgress);
    video.addEventListener('timeupdate', playerControls.updateProgress);
    muteBtn.addEventListener('click', playerControls.toggleMute);
    volumeSlider.addEventListener('input', playerControls.setVolume);
    fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
    pipBtn.addEventListener('click', playerControls.togglePip);

    themeToggleBtn.addEventListener('click', () => {
      body.classList.toggle('light-theme');
      const isLight = body.classList.contains('light-theme');
      themeToggleBtn.innerHTML = isLight ? '<i class="bi bi-moon-fill"></i>' : '<i class="bi bi-sun-fill"></i>';
      localStorage.setItem('webtv_theme', isLight ? 'light' : 'dark');
    });

    // New: Refresh button now supports deep refresh on modifier-click
    // - Click = refresh channel list + soft cache-bust
    // - Shift/Ctrl/Meta-click = clear CacheStorage + re-init player + cache-bust + (keep last channel)
    refreshChannelsBtn.title = 'คลิก = รีเฟรชรายการช่อง • Shift/Ctrl/⌘+คลิก = ล้างแคช + รีเฟรช';
    refreshChannelsBtn.addEventListener('click', async (e) => {
      refreshChannelsBtn.classList.add('refresh-active');
      const deep = e.shiftKey || e.ctrlKey || e.metaKey;
      await deepRefresh({ wipeLocal: e.altKey }); // Alt+คลิก = ล้าง localStorage ช่องล่าสุดด้วย
      setTimeout(() => refreshChannelsBtn.classList.remove('refresh-active'), 800);
    });

    playOverlay.addEventListener('click', () => {
      playOverlay.classList.add('hidden');
      showLoadingIndicator(true, 'กำลังเชื่อมต่อ...');
      playerControls.togglePlay();
    });
    video.addEventListener('play', () => {
      playOverlay.classList.add('hidden');
      playerControls.updatePlayButton();
      playerControls.showControls();
    });
    playerWrapper.addEventListener('mousemove', playerControls.showControls);
    playerWrapper.addEventListener('mouseleave', playerControls.hideControls);
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch(e.key.toLowerCase()) {
        case ' ': e.preventDefault(); playerControls.togglePlay(); break;
        case 'm': playerControls.toggleMute(); break;
        case 'f': playerControls.toggleFullscreen(); break;
      }
    });
  }

  // --- Channels loader (GitHub: ใช้ channels.json) ---
  async function fetchAndRenderChannels(forceBust = false) {
    showLoadingIndicator(true, 'กำลังโหลดรายการช่อง...');

    channelButtonsContainer.innerHTML = '';
    const tempGrid = document.createElement('div');
    tempGrid.className = 'channel-buttons';
    for (let i = 0; i < 20; i++) {
      const tile = document.createElement('div');
      tile.className = 'channel-tile skeleton';
      tile.innerHTML = `<div class="channel-logo-wrapper"></div><span class="channel-tile-name">loading</span>`;
      tempGrid.appendChild(tile);
    }
    channelButtonsContainer.appendChild(tempGrid);

    try {
      const bust = (forceBust || !!window.__cacheBuster) ? `?v=${currentStamp()}` : `?u=${Math.random().toString(36).slice(2)}`;
      const response = await fetch('channels.json' + bust, { cache: 'reload' });
      if (!response.ok) throw new Error('โหลด channels.json ไม่สำเร็จ');
      channels = await response.json();
      channelManager.createChannelButtons();
    } catch (e) {
      console.error("Could not fetch channels:", e);
      playerControls.showError("ไม่สามารถรีเฟรชรายการช่องได้");
      channelButtonsContainer.innerHTML = '';
    } finally {
      showLoadingIndicator(false);
    }
  }

  // --- Time (ไทย) ---
  const timeManager = {
    update: () => {
      const now = new Date();
      const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const timeOptions = { hour: '2-digit', minute: '2-digit' };
      const thaiDate = now.toLocaleDateString('th-TH', dateOptions);
      const thaiTime = now.toLocaleTimeString('th-TH', timeOptions);
      document.getElementById('datetime-display').innerHTML = `🕒 ${thaiDate} ${thaiTime}`;
    },
    start: () => { timeManager.update(); setInterval(timeManager.update, 1000); }
  };

  // --- Init ---
  async function init() {
    const savedTheme = localStorage.getItem('webtv_theme');
    if (savedTheme === 'light') {
      body.classList.add('light-theme');
      themeToggleBtn.innerHTML = '<i class="bi bi-moon-fill"></i>';
    } else {
      themeToggleBtn.innerHTML = '<i class="bi bi-sun-fill"></i>';
    }

    if (Hls.isSupported()) {
      initHls();
    }

    setupEventListeners();
    timeManager.start();

    const savedVolume = localStorage.getItem('webtv_volume');
    const savedMuted = localStorage.getItem('webtv_muted') === 'true' || localStorage.getItem('webtv_muted') === null;
    video.volume = savedVolume !== null ? savedVolume : 0.5;
    volumeSlider.value = savedVolume !== null ? savedVolume : 0.5;
    video.muted = savedMuted;
    playerControls.updateMuteButton();
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    await fetchAndRenderChannels(true);

    const last = localStorage.getItem('webtv_lastChannelId');
    if (last && channels[last]) {
      await channelManager.loadChannel(last);
    }
  }

  init();
});
