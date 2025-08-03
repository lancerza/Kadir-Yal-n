document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let hls, dashPlayer, channels = {}, currentChannelId = null;
    let controlsTimeout;
    const video = document.getElementById('video');

    // --- DOM Elements ---
    const body = document.body;
    const playerWrapper = document.querySelector('.player-wrapper');
    const channelButtonsContainer = document.getElementById('channel-buttons-container');
    const loadingIndicator = document.getElementById('loading-indicator');
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
    
    // --- Player Logic ---
    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (loadingIndicator.querySelector('.loading-message')) {
            loadingIndicator.querySelector('.loading-message').textContent = message;
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
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        },
        updateProgress: () => {
            const isLive = !isFinite(video.duration);
            if (isLive) {
                progressBar.style.display = 'none';
                timeDisplay.style.display = 'none';
                liveIndicator.classList.remove('hidden');
            } else {
                progressBar.style.display = 'block';
                timeDisplay.style.display = 'block';
                liveIndicator.classList.add('hidden');
                progressBar.value = (video.currentTime / video.duration) * 100 || 0;
                timeDisplay.textContent = `${playerControls.formatTime(video.currentTime)} / ${playerControls.formatTime(video.duration)}`;
            }
        },
        setProgress: () => {
            video.currentTime = (progressBar.value / 100) * video.duration;
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
            playerControls.updateMuteButton();
            localStorage.setItem('webtv_volume', video.volume);
        },
        toggleFullscreen: () => {
            if (!document.fullscreenElement) playerWrapper.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
            else document.exitFullscreen();
        },
        togglePip: () => {
            if (document.pictureInPictureElement) document.exitPictureInPicture();
            else video.requestPictureInPicture();
        },
        hideControls: () => {
            if (video.paused) return;
            playerWrapper.querySelector('.custom-controls').classList.add('controls-hidden');
            playerWrapper.classList.add('hide-cursor');
        },
        showControls: () => {
            playerWrapper.querySelector('.custom-controls').classList.remove('controls-hidden');
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
            // This function remains the same as the previous version.
            // ... (Copy the createChannelButtons function from the previous response) ...
            channelButtonsContainer.innerHTML = '';
            categorySidebar.innerHTML = '';
            const groupedChannels = {};
            for (const channelId in channels) {
                const channel = channels[channelId];
                const category = channel.category || 'ทั่วไป';
                if (!groupedChannels[category]) groupedChannels[category] = [];
                groupedChannels[category].push({ id: channelId, ...channel });
            }
            const categories = Object.keys(groupedChannels);
            for (const category of categories) {
                const header = document.createElement('h2');
                header.className = 'channel-category-header';
                header.textContent = category;
                channelButtonsContainer.appendChild(header);
                const grid = document.createElement('div');
                grid.className = 'channel-buttons';
                if (category === 'หนัง') grid.classList.add('movie-grid');
                groupedChannels[category].forEach((channel, index) => {
                    const tile = document.createElement('a');
                    tile.className = 'channel-tile';
                    if (category === 'หนัง') tile.classList.add('movie-tile');
                    tile.dataset.channelId = channel.id;
                    tile.addEventListener('click', () => channelManager.loadChannel(channel.id));
                    const logoWrapper = document.createElement('div');
                    logoWrapper.className = 'channel-logo-wrapper';
                    const logoImg = document.createElement('img');
                    logoImg.src = channel.logo; logoImg.alt = channel.name; logoImg.loading = 'lazy';
                    logoWrapper.appendChild(logoImg);
                    tile.appendChild(logoWrapper);
                    if (category === 'หนัง' && channel.details) {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'channel-tile-name movie-title'; nameSpan.innerText = channel.name;
                        tile.appendChild(nameSpan);
                        const yearSpan = document.createElement('span');
                        yearSpan.className = 'movie-year'; yearSpan.innerText = channel.details.year;
                        tile.appendChild(yearSpan);
                    } else {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'channel-tile-name'; nameSpan.innerText = channel.name;
                        tile.appendChild(nameSpan);
                    }
                    if (channel.badge) {
                        const badge = document.createElement('div');
                        badge.className = 'channel-badge'; badge.textContent = channel.badge;
                        tile.appendChild(badge);
                    }
                    tile.style.animationDelay = `${index * 0.05}s`;
                    grid.appendChild(tile);
                });
                channelButtonsContainer.appendChild(grid);
            }
            setupCategorySidebar(categories);
        },
        loadChannel: (channelId) => {
            if (!channels[channelId]) return;

            playerControls.hideError();
            showLoadingIndicator(true, 'กำลังโหลดช่อง...');
            currentChannelId = channelId;
            const channel = channels[currentChannelId];
            
            // --- 1. ทำลาย instance ของ player เก่า ---
            if (hls) { hls.destroy(); hls = null; }
            if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }

            // --- 2. หา Stream URL ---
            let streamUrl = channel.url || (channel.url_parts ? channel.url_parts.join('') : null);
            if (!streamUrl) {
                playerControls.showError("ไม่พบ URL ของช่องนี้");
                showLoadingIndicator(false);
                return;
            }
            
            // --- 3. ตรวจสอบประเภทและเรียกใช้ Player ที่ถูกต้อง ---
            if (streamUrl.includes('.mpd')) {
                // --- ใช้ dash.js ---
                console.log("Loading DASH stream...");
                dashPlayer = dashjs.MediaPlayer().create();
                
                // ตั้งค่า DRM (ถ้ามี)
                if (channel.drm && channel.drm.type === 'clearkey') {
                    const drmConfig = {
                        "com.widevine.alpha": {
                            "serverURL": "" // dash.js ต้องการโครงสร้างนี้
                        },
                        "org.w3.clearkey": {
                            "clearkeys": {
                                [channel.drm.keyId]: channel.drm.key
                            }
                        }
                    };
                    dashPlayer.setProtectionData(drmConfig);
                }
                
                dashPlayer.initialize(video, streamUrl, true);

            } else {
                // --- ใช้ hls.js ---
                console.log("Loading HLS stream...");
                if (Hls.isSupported()) {
                    hls = new Hls();
                    hls.loadSource(streamUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) playerControls.showError("เกิดข้อผิดพลาดในการเล่น HLS");
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl; // สำหรับ Safari
                }
            }

            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();
            localStorage.setItem('webtv_lastChannelId', channelId);
        }
    };

    // --- Initialization and other functions ---
    async function init() {
        // ... (This section remains largely the same as the Shaka Player version) ...
        // ... It sets up event listeners for custom controls, fetches channels, etc. ...

        // --- Event Listener Setup ---
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        video.addEventListener('play', playerControls.updatePlayButton);
        video.addEventListener('pause', playerControls.updatePlayButton);
        video.addEventListener('timeupdate', playerControls.updateProgress);
        video.addEventListener('loadedmetadata', playerControls.updateProgress);
        progressBar.addEventListener('input', playerControls.setProgress);
        muteBtn.addEventListener('click', playerControls.toggleMute);
        volumeSlider.addEventListener('input', playerControls.setVolume);
        fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
        pipBtn.addEventListener('click', playerControls.togglePip);
        playerWrapper.addEventListener('mousemove', playerControls.showControls);
        playerWrapper.addEventListener('mouseleave', playerControls.hideControls);
        video.addEventListener('playing', () => showLoadingIndicator(false));

        // Other initializations
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') body.classList.add('light-theme');
        
        await fetchAndRenderChannels();
        
        const savedVolume = localStorage.getItem('webtv_volume');
        if (savedVolume !== null) { video.volume = savedVolume; volumeSlider.value = savedVolume; }
        
        const savedMuted = localStorage.getItem('webtv_muted') === 'true';
        video.muted = savedMuted;
        playerControls.updateMuteButton();

        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        if (lastChannelId && channels[lastChannelId]) {
            channelManager.loadChannel(lastChannelId);
        } else if (firstChannelId) {
            channelManager.loadChannel(firstChannelId);
        }
    }
    
    // Dummy functions for code not included but assumed to exist
    const setupCategorySidebar = () => {}; 
    const fetchAndRenderChannels = async () => {
        try {
            const response = await fetch('channels.json', { cache: 'no-store' });
            channels = await response.json();
            channelManager.createChannelButtons();
        } catch (e) {
            playerControls.showError("ไม่สามารถโหลดรายการช่องได้");
        }
    };
    
    init();
});
