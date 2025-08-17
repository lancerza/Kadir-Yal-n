 document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let hls, channels = {}, currentChannelId = null;
    let controlsTimeout;
    let isAudioUnlocked = false;
    
    // --- API Endpoint ---
    const API_BASE_URL = 'api';

    // --- DOM Elements ---
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

    // --- Viewer Count Logic ---
    function generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    let sessionId = localStorage.getItem('flowtv_session_id');
    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem('flowtv_session_id', sessionId);
    }

    setInterval(() => {
        if (navigator.sendBeacon) {
            const formData = new FormData();
            formData.append('session_id', sessionId);
            if (currentChannelId) {
                formData.append('channel_id', currentChannelId);
            }
            navigator.sendBeacon(`${API_BASE_URL}/heartbeat.php`, formData);
        }
    }, 15000);

    const updateViewerCount = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/get_viewers.php`);
            if (!response.ok) return;
            const data = await response.json();
            
            const totalViewerCountEl = document.getElementById('viewer-count');
            if(totalViewerCountEl) {
                totalViewerCountEl.textContent = data.total || 0;
            }

            document.querySelectorAll('.channel-tile').forEach(tile => {
                const channelId = tile.dataset.channelId;
                const count = data.channels[channelId] || 0;
                
                let badge = tile.querySelector('.viewer-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'viewer-badge';
                    tile.appendChild(badge);
                }
                
                if (count > 0) {
                    badge.textContent = `👤 ${count}`;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            });

        } catch (error) {
            console.error("Could not update viewer count:", error);
        }
    };
    
    // --- Audio Unlock Function ---
    function unlockAudio() {
        if (isAudioUnlocked) return;
        isAudioUnlocked = true;
        const savedMuted = localStorage.getItem('webtv_muted') === 'true';
        video.muted = savedMuted;
        playerControls.updateMuteButton();
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    }

    // --- Player Logic ---
    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (isLoading) loadingMessage.textContent = message;
    }

    const playerControls = {
        showError: (message) => {
            const errorChannelName = document.getElementById('error-channel-name');
            if (currentChannelId && channels[currentChannelId]) {
                errorChannelName.textContent = channels[currentChannelId].name;
                errorChannelName.style.display = 'block';
            } else {
                errorChannelName.style.display = 'none';
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
            if (video.paused) video.play().catch(e => { if (e.name !== 'AbortError') console.error("Error playing video:", e); });
            else video.pause();
        },
        updatePlayButton: () => {
            playPauseBtn.querySelector('.icon-play').classList.toggle('hidden', !video.paused);
            playPauseBtn.querySelector('.icon-pause').classList.toggle('hidden', video.paused);
        },
        formatTime: (timeInSeconds) => {
            const time = !isNaN(timeInSeconds) ? timeInSeconds : 0;
            const hours = Math.floor(time / 3600);
            const minutes = Math.floor((time % 3600) / 60);
            const seconds = Math.floor(time % 60);
            const formattedMinutes = minutes.toString().padStart(2, '0');
            const formattedSeconds = seconds.toString().padStart(2, '0');
            return hours > 0 ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`;
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
            } catch (error) { console.error("PiP Error:", error); }
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

    // --- Channel Logic ---
    const channelManager = {
        updateActiveButton: () => {
            document.querySelectorAll('.channel-tile').forEach(tile => tile.classList.toggle('active', tile.dataset.channelId === currentChannelId));
        },
        createChannelButtons: () => {
            channelButtonsContainer.innerHTML = '';
            categorySidebar.innerHTML = '';
            const groupedChannels = {};
            for (const channelId in channels) {
                const channel = channels[channelId];
                const category = channel.category || 'ทั่วไป';
                if (!groupedChannels[category]) groupedChannels[category] = [];
                groupedChannels[category].push({ id: channelId, ...channel });
            }
            const categories = Object.keys(groupedChannels).sort();
            for (const category of categories) {
                const header = document.createElement('h2');
                header.className = 'channel-category-header';
                header.textContent = category;
                header.id = `category-${category.replace(/\s+/g, '-')}`;
                channelButtonsContainer.appendChild(header);
                const grid = document.createElement('div');
                grid.className = 'channel-buttons';
                if (category === 'หนัง') grid.classList.add('movie-grid');
                groupedChannels[category].forEach((channel, index) => {
                    const tile = document.createElement('a');
                    tile.className = 'channel-tile';
                    if (category === 'หนัง') tile.classList.add('movie-tile');
                    tile.dataset.channelId = channel.id;
                    tile.addEventListener('click', () => {
                        document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
                        tile.classList.add('loading');
                        channelManager.loadChannel(channel.id);
                        playerWrapper.scrollIntoView({ behavior: 'smooth' });
                    });
                    const logoWrapper = document.createElement('div');
                    logoWrapper.className = 'channel-logo-wrapper';
                    const logoImg = document.createElement('img');
                    logoImg.src = channel.logo;
                    logoImg.alt = channel.name;
                    logoImg.loading = 'lazy';
                    logoWrapper.appendChild(logoImg);
                    tile.appendChild(logoWrapper);
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'channel-tile-name';
                    nameSpan.innerText = channel.name;
                    tile.appendChild(nameSpan);

                    if (channel.badge) {
                        const badge = document.createElement('div');
                        badge.className = 'channel-badge';
                        badge.innerHTML = `<i class="bi bi-stack"></i> ${channel.badge}`;
                        tile.appendChild(badge);
                    }
                    
                    tile.style.animationDelay = `${index * 0.05}s`;
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
                const response = await fetch(`${API_BASE_URL}/get_channel.php?id=${channelId}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'ไม่สามารถโหลดข้อมูลสตรีมได้');
                
                const encryption_key_phrase = "YourSuperSecretKey12345";
                const iv_phrase = "YourInitializationVectorKey";
                const key = CryptoJS.SHA256(encryption_key_phrase);
                const iv = CryptoJS.lib.WordArray.create(CryptoJS.SHA256(iv_phrase).words.slice(0, 4));
                const decrypted_data = CryptoJS.AES.decrypt(data.data, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
                const streamUrl = decrypted_data.toString(CryptoJS.enc.Utf8);
                
                if (!streamUrl) throw new Error('ไม่สามารถถอดรหัส URL ได้');

                currentChannelId = channelId;
                localStorage.setItem('webtv_lastChannelId', channelId);
                const channel = channels[channelId];
                document.title = `▶️ ${channel.name} - Flow TV`;
                channelManager.updateActiveButton();
                if (hls) hls.loadSource(streamUrl);

            } catch (error) {
                console.error("Error loading channel:", error);
                playerControls.showError(`เกิดข้อผิดพลาด: ${error.message}`);
                showLoadingIndicator(false);
            }
        }
    };
    
    // --- Datetime Logic ---
    const timeManager = {
        update: () => {
            const now = new Date();
            const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const timeOptions = { hour: '2-digit', minute: '2-digit' };
            const thaiDate = now.toLocaleDateString('th-TH', dateOptions);
            const thaiTime = now.toLocaleTimeString('th-TH', timeOptions);
            document.getElementById('datetime-display').innerHTML = `🕒 ${thaiDate} ${thaiTime}`;
        },
        start: () => {
            timeManager.update();
            setInterval(timeManager.update, 1000);
        }
    };

    // --- Sidebar Logic ---
    function setupCategorySidebar(categories) {
        const categoryIcons = {
            'IPTV': 'bi-tv-fill',
            'การศึกษา': 'bi-book-half',
            'กีฬา': 'bi-dribbble',
            'หนัง': 'bi-film',
            'ทั่วไป': 'bi-grid-fill'
        };

        categories.forEach(category => {
            const link = document.createElement('a');
            link.className = 'category-link';
            
            const iconClass = categoryIcons[category] || categoryIcons['ทั่วไป'];
            link.innerHTML = `<i class="bi ${iconClass}"></i> <span>${category}</span>`;
            
            const categoryId = `category-${category.replace(/\s+/g, '-')}`;
            link.href = `#${categoryId}`;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById(categoryId)?.scrollIntoView({ behavior: 'smooth' });
            });

            categorySidebar.appendChild(link);
        });

        const headers = document.querySelectorAll('.channel-category-header');
        const links = document.querySelectorAll('.category-link');
        let scrollTimeout;

        // [แก้ไขล่าสุด] ปรับปรุง Scrollspy Logic ให้แม่นยำขึ้น
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                let activeHeaderId = null;
                // ตั้งค่าจุดอ้างอิงสูงขึ้นเล็กน้อย (เช่น 150px จากขอบบน)
                const triggerPoint = 150; 
        
                headers.forEach(header => {
                    const headerTop = header.getBoundingClientRect().top;
                    // ตรวจสอบว่า header ได้เลื่อนผ่านจุดอ้างอิงไปแล้วหรือไม่
                    if (headerTop < triggerPoint) {
                        activeHeaderId = header.getAttribute('id');
                    }
                });
        
                links.forEach(link => {
                    const linkHref = link.getAttribute('href').substring(1);
                    link.classList.toggle('active', linkHref === activeHeaderId);
                });
            }, 100);
        });
    }

    // --- Event Listener Setup ---
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

        refreshChannelsBtn.addEventListener('click', () => {
            refreshChannelsBtn.classList.add('refresh-active');
            fetchAndRenderChannels();
            setTimeout(() => refreshChannelsBtn.classList.remove('refresh-active'), 1000);
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

    // --- Data Fetching ---
    async function fetchAndRenderChannels() {
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
            const response = await fetch(`${API_BASE_URL}/get_channel_list.php`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Network response was not ok');
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

    // --- Initialization ---
    async function init() {
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.innerHTML = '<i class="bi bi-moon-fill"></i>';
        } else {
            themeToggleBtn.innerHTML = '<i class="bi bi-sun-fill"></i>';
        }

        await fetchAndRenderChannels();

        if (Hls.isSupported()) {
            hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 600 });
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            playOverlay.classList.remove('hidden');
                            playerControls.updatePlayButton();
                        }
                    });
                }
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    const failedChannelId = currentChannelId;
                    const failedChannel = channels[failedChannelId];
                    if (failedChannel && failedChannel.badge !== 'สำรอง' && (data.type === Hls.ErrorTypes.NETWORK_ERROR || data.type === Hls.ErrorTypes.MEDIA_ERROR)) {
                        const backupChannelId = Object.keys(channels).find(key =>
                            channels[key].name === failedChannel.name &&
                            channels[key].badge === 'สำรอง' &&
                            key !== failedChannelId
                        );
                        if (backupChannelId) {
                            showLoadingIndicator(true, `ช่องหลักขัดข้อง กำลังลองช่องสำรอง...`);
                            setTimeout(() => {
                                const oldChannelId = currentChannelId;
                                currentChannelId = null; 
                                channelManager.loadChannel(backupChannelId).catch(err => {
                                    currentChannelId = oldChannelId;
                                    playerControls.showError('ช่องสำรองล้มเหลว ไม่สามารถเล่นได้');
                                });
                            }, 500);
                            return;
                        }
                    }
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                        case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                        default: playerControls.showError('เกิดข้อผิดพลาดร้ายแรง ไม่สามารถเล่นได้'); hls.destroy(); break;
                    }
                }
            });
        }
        
        setupEventListeners();
        timeManager.start();
        
        setInterval(updateViewerCount, 60000);
        updateViewerCount();
        
        const savedVolume = localStorage.getItem('webtv_volume');
        const savedMuted = localStorage.getItem('webtv_muted') === 'true' || localStorage.getItem('webtv_muted') === null;
        video.volume = savedVolume !== null ? savedVolume : 0.5;
        volumeSlider.value = savedVolume !== null ? savedVolume : 0.5;
        video.muted = savedMuted;
        playerControls.updateMuteButton();
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('keydown', unlockAudio, { once: true });
        
        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        if (lastChannelId && channels[lastChannelId]) {
            await channelManager.loadChannel(lastChannelId);
        }
    }
    
    init();
})