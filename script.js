document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let player, channels = {}, currentChannelId = null;
    let controlsTimeout;
    const video = document.getElementById('video');

    // --- DOM Elements ---
    const body = document.body;
    const categorySidebar = document.getElementById('category-sidebar');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
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
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    
    // --- Player Logic ---
    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }

    const playerControls = {
        showError: (message) => {
            const errorChannelName = document.getElementById('error-channel-name');
            if (currentChannelId && channels[currentChannelId]) {
                errorChannelName.textContent = channels[currentChannelId].name;
            }
            if (errorMessage) errorMessage.textContent = message;
            if (errorOverlay) errorOverlay.classList.remove('hidden');
        },
        hideError: () => {
            if (errorOverlay) errorOverlay.classList.add('hidden');
        },
        togglePlay: () => {
            if (video.paused) { video.play(); } else { video.pause(); }
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
            const isLive = player.isLive();
            progressBar.style.display = isLive ? 'none' : 'flex';
            timeDisplay.style.display = isLive ? 'none' : 'block';
            liveIndicator.classList.toggle('hidden', !isLive);

            if (!isLive) {
                progressBar.value = (video.currentTime / video.duration) * 100 || 0;
                timeDisplay.textContent = `${playerControls.formatTime(video.currentTime)} / ${playerControls.formatTime(video.duration)}`;
            }
        },
        setProgress: () => {
            if (!player.isLive()) {
                video.currentTime = (progressBar.value / 100) * video.duration;
            }
        },
        toggleMute: () => {
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
            video.volume = volumeSlider.value;
            video.muted = Number(volumeSlider.value) === 0;
            localStorage.setItem('webtv_volume', video.volume);
            playerControls.updateMuteButton();
        },
        toggleFullscreen: () => {
            if (!document.fullscreenElement) playerWrapper.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
            else document.exitFullscreen();
        },
        togglePip: async () => {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
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
        }
    };

    // --- Channel Logic ---
    const channelManager = {
        updateActiveButton: () => {
            document.querySelectorAll('.channel-tile').forEach(tile => tile.classList.toggle('active', tile.dataset.channelId === currentChannelId));
        },
        createChannelButtons: () => {
            const container = document.getElementById('channel-buttons-container');
            const sidebar = document.getElementById('category-sidebar');
            container.innerHTML = '';
            sidebar.innerHTML = '';
            const groupedChannels = Object.keys(channels).reduce((acc, channelId) => {
                const channel = { id: channelId, ...channels[channelId] };
                const category = channel.category || 'ทั่วไป';
                if (!acc[category]) acc[category] = [];
                acc[category].push(channel);
                return acc;
            }, {});
            Object.keys(groupedChannels).forEach(category => {
                const header = document.createElement('h2');
                header.className = 'channel-category-header';
                header.textContent = category;
                header.id = `category-${category.replace(/\s+/g, '-')}`;
                container.appendChild(header);
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
                    if (category === 'หนัง' && channel.details) {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'channel-tile-name movie-title';
                        nameSpan.innerText = channel.name;
                        tile.appendChild(nameSpan);
                        const yearSpan = document.createElement('span');
                        yearSpan.className = 'movie-year';
                        yearSpan.innerText = channel.details.year;
                        tile.appendChild(yearSpan);
                    } else {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'channel-tile-name';
                        nameSpan.innerText = channel.name;
                        tile.appendChild(nameSpan);
                    }
                    if (channel.badge) {
                        const badge = document.createElement('div');
                        badge.className = 'channel-badge';
                        badge.textContent = channel.badge;
                        tile.appendChild(badge);
                    }
                    tile.style.animationDelay = `${index * 0.05}s`;
                    grid.appendChild(tile);
                });
                container.appendChild(grid);
            });
            setupCategorySidebar(Object.keys(groupedChannels));
        },
        loadChannel: async (channelId) => {
            if (!channels[channelId]) return;

            playerControls.hideError();
            showLoadingIndicator(true, 'กำลังโหลดช่อง...');
            currentChannelId = channelId;
            const channel = channels[currentChannelId];
            
            let streamUrl = channel.url || (channel.url_parts ? channel.url_parts.join('') : null);
            if (!streamUrl) {
                playerControls.showError("ไม่พบ URL ของช่องนี้");
                showLoadingIndicator(false);
                return;
            }
            
            const drmConfig = { drm: { clearKeys: {} } }; 
            if (channel.drm && channel.drm.type === 'clearkey') {
                drmConfig.drm.clearKeys = {
                    [channel.drm.keyId]: channel.drm.key
                };
            }
            player.configure(drmConfig);

            try {
                await player.load(streamUrl);
                document.title = `▶️ ${channel.name} - Flow TV`;
                channelManager.updateActiveButton();
                localStorage.setItem('webtv_lastChannelId', channelId);
                showLoadingIndicator(false);
            } catch (error) {
                console.error('Error loading video:', error);
                playerControls.showError(`ไม่สามารถเล่นช่องนี้ได้ (Code: ${error.code})`);
                showLoadingIndicator(false);
            }
        }
    };

    // --- Datetime, Sidebar, and other UI functions ---
    const timeManager = { 
        update: () => { document.getElementById('datetime-display').textContent = new Date().toLocaleString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); },
        start: () => { timeManager.update(); setInterval(timeManager.update, 1000); }
    };
    function setupCategorySidebar(categories) {
        const sidebar = document.getElementById('category-sidebar');
        sidebar.innerHTML = '';
        categories.forEach(category => {
            const link = document.createElement('a');
            link.className = 'category-link';
            link.textContent = category;
            link.href = `#category-${category.replace(/\s+/g, '-')}`;
            link.onclick = (e) => { e.preventDefault(); document.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }); };
            sidebar.appendChild(link);
        });
    };
    async function fetchAndRenderChannels() {
        showLoadingIndicator(true, 'กำลังโหลดรายการช่อง...');
        try {
            const response = await fetch('channels.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Network response was not ok');
            channels = await response.json();
            channelManager.createChannelButtons();
        } catch (e) {
            console.error("Could not fetch channels:", e);
            playerControls.showError("ไม่สามารถโหลดรายการช่องได้: " + e.message);
        } finally {
            showLoadingIndicator(false);
        }
    };

    // --- Initialization ---
    async function init() {
        // 1. Initialize Shaka Player
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
            player = new shaka.Player();
            await player.attach(video);
            player.addEventListener('error', event => {
                console.error('Shaka Player Error:', event.detail);
                playerControls.showError(`เกิดข้อผิดพลาดจาก Player (Code: ${event.detail.code})`);
            });
        } else {
            console.error('Browser not supported!');
            alert('บราวเซอร์ของคุณไม่รองรับ Shaka Player');
        }

        // 2. Setup Event Listeners
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        video.addEventListener('play', playerControls.updatePlayButton);
        video.addEventListener('pause', playerControls.updatePlayButton);
        video.addEventListener('timeupdate', playerControls.updateProgress);
        video.addEventListener('playing', () => showLoadingIndicator(false));
        progressBar.addEventListener('input', playerControls.setProgress);
        muteBtn.addEventListener('click', playerControls.toggleMute);
        volumeSlider.addEventListener('input', playerControls.setVolume);
        fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
        pipBtn.addEventListener('click', playerControls.togglePip);
        playerWrapper.addEventListener('mousemove', playerControls.showControls);
        playerWrapper.addEventListener('mouseleave', playerControls.hideControls);
        themeToggleBtn.addEventListener('click', () => {
            body.classList.toggle('light-theme');
            const newTheme = body.classList.contains('light-theme') ? 'light' : 'dark';
            themeToggleBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
            localStorage.setItem('webtv_theme', newTheme);
        });
        refreshChannelsBtn.addEventListener('click', fetchAndRenderChannels);
        settingsBtn.addEventListener('click', () => {
            settingsPanel.classList.toggle('hidden');
        });
        closeSettingsBtn.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
        });
        window.addEventListener('click', (e) => {
            if (!settingsPanel.classList.contains('hidden') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanel.classList.add('hidden');
            }
        });

        // 3. Load UI and Data
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        } else {
            themeToggleBtn.textContent = '☀️';
        }
        await fetchAndRenderChannels();
        timeManager.start();

        // 4. Restore Player State
        const savedVolume = localStorage.getItem('webtv_volume');
        video.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
        volumeSlider.value = video.volume;
        const savedMuted = localStorage.getItem('webtv_muted') === 'true';
        video.muted = savedMuted;
        playerControls.updateMuteButton();
        
        // 5. Load Initial Channel
        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        if (lastChannelId && channels[lastChannelId]) {
            await channelManager.loadChannel(lastChannelId);
        } else if (firstChannelId) {
            await channelManager.loadChannel(firstChannelId);
        }
    }

    init();
});
