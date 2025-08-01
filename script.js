document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let hls, channels = {}, currentChannelId = null;
    let controlsTimeout;
    let isAudioUnlocked = false;

    // --- DOM Elements ---
    const body = document.body;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
    const video = document.getElementById('video');
    const playerWrapper = document.querySelector('.player-wrapper');
    const customControls = document.querySelector('.custom-controls');
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

    // --- Audio Unlock Function ---
    function unlockAudio() {
        if (isAudioUnlocked) return;
        
        console.log("Audio unlocked by user interaction.");
        isAudioUnlocked = true;
        
        const savedMuted = localStorage.getItem('webtv_muted') === 'true';
        video.muted = savedMuted;
        playerControls.updateMuteButton();

        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    }

    // --- Player Logic ---
    function showLoadingIndicator(isLoading) {
        loadingIndicator.classList.toggle('hidden', !isLoading);
    }

    const playerControls = {
        // --- ส่วนที่แก้ไข ---
        showError: (message) => {
            const errorChannelName = document.getElementById('error-channel-name');
            if (currentChannelId && channels[currentChannelId]) {
                errorChannelName.textContent = channels[currentChannelId].name;
                errorChannelName.style.display = 'block';
            } else {
                errorChannelName.style.display = 'none';
            }

            if (errorMessage) errorMessage.textContent = message;
            if (errorOverlay) errorOverlay.classList.remove('hidden');

            const oldBtn = document.getElementById('retry-btn');
            const newBtn = oldBtn.cloneNode(true); // สร้างปุ่มใหม่ที่ไม่มี event listener ติดอยู่

            newBtn.addEventListener('click', () => {
                if (currentChannelId) {
                    console.log(`Retrying channel: ${currentChannelId}`);
                    channelManager.loadChannel(currentChannelId);
                }
            });

            oldBtn.parentNode.replaceChild(newBtn, oldBtn); // นำปุ่มใหม่ไปแทนที่ปุ่มเก่า
        },
        // --- สิ้นสุดการแก้ไข ---

        hideError: () => {
            if (errorOverlay) errorOverlay.classList.add('hidden');
        },
        togglePlay: () => {
            if (video.paused) {
                video.play().catch(e => { if (e.name !== 'AbortError') console.error("Error playing video:", e); });
            } else {
                video.pause();
            }
        },
        updatePlayButton: () => {
            playPauseBtn.querySelector('.icon-play').classList.toggle('hidden', !video.paused);
            playPauseBtn.querySelector('.icon-pause').classList.toggle('hidden', video.paused);
        },
        formatTime: (time) => {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        },
        updateProgress: () => {
            progressBar.value = (video.currentTime / video.duration) * 100 || 0;
            timeDisplay.textContent = `${playerControls.formatTime(video.currentTime)} / ${playerControls.formatTime(video.duration || 0)}`;
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
            if (!document.pictureInPictureEnabled) return alert('เบราว์เซอร์ของคุณไม่รองรับ Picture-in-Picture');
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else await video.requestPictureInPicture();
            } catch (error) { console.error("เกิดข้อผิดพลาดในการเปิดโหมด PiP:", error); }
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
            if (liveIndicator) liveIndicator.classList.toggle('hidden', !isLive);
        }
    };

    // --- Channel Logic ---
    const channelManager = {
        updateActiveButton: () => {
            document.querySelectorAll('.channel-tile').forEach(tile => tile.classList.toggle('active', tile.dataset.channelId === currentChannelId));
        },
        createChannelButtons: () => {
            channelButtonsContainer.innerHTML = '';
            const groupedChannels = {};
            for (const channelId in channels) {
                const channel = channels[channelId];
                const category = channel.category || 'ทั่วไป';
                if (!groupedChannels[category]) groupedChannels[category] = [];
                groupedChannels[category].push({ id: channelId, ...channel });
            }
            for (const category in groupedChannels) {
                const header = document.createElement('h2');
                header.className = 'channel-category-header';
                header.textContent = category;
                channelButtonsContainer.appendChild(header);
                const grid = document.createElement('div');
                grid.className = 'channel-buttons';
                groupedChannels[category].forEach((channel, index) => {
                    const tile = document.createElement('a');
                    tile.className = 'channel-tile';
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
                        badge.textContent = channel.badge;
                        tile.appendChild(badge);
                    }
                    
                    tile.style.animationDelay = `${index * 0.05}s`;
                    grid.appendChild(tile);
                });
                channelButtonsContainer.appendChild(grid);
            }
        },
        loadChannel: async (channelId) => {
            if (!channels[channelId] || currentChannelId === channelId) return;
            video.classList.remove('visible');
            playerControls.hideError();
            showLoadingIndicator(true);
            await new Promise(resolve => setTimeout(resolve, 300));
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            const channel = channels[channelId];
            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();
            try {
                if (hls) hls.loadSource(channel.url);
            } catch (error) {
                console.error("Error loading channel:", error);
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

    // --- Event Listener Setup ---
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        video.addEventListener('play', () => { playerControls.updatePlayButton(); playerControls.showControls(); });
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
            themeToggleBtn.textContent = isLight ? '🌙' : '☀️';
            localStorage.setItem('webtv_theme', isLight ? 'light' : 'dark');
        });

        refreshChannelsBtn.addEventListener('click', fetchAndRenderChannels);

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
        console.log("Fetching channel list...");
        try {
            const response = await fetch('channels.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Network response was not ok');
            channels = await response.json();
            channelManager.createChannelButtons();
        } catch (e) {
            console.error("Could not fetch or render channels:", e);
            playerControls.showError("ไม่สามารถรีเฟรชรายการช่องได้");
        }
    }


    // --- Initialization ---
    async function init() {
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        }

        await fetchAndRenderChannels().catch(e => {
            console.error("Fatal Error: Could not load initial channel data.", e);
            playerControls.showError("เกิดข้อผิดพลาด: ไม่สามารถโหลดข้อมูลช่องได้");
            return;
        });

        if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true, maxBufferLength: 30, maxMaxBufferLength: 600, liveSyncDurationCount: 5, liveMaxLatencyDurationCount: 10 });
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => {
                    console.error("Autoplay was prevented.", e);
                });
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR: playerControls.showError('เกิดข้อผิดพลาดในการโหลดวิดีโอ\n(Network Error)'); hls.startLoad(); break;
                        case Hls.ErrorTypes.MEDIA_ERROR: playerControls.showError('เกิดข้อผิดพลาดในการเล่นวิดีโอ\n(Media Error)'); hls.recoverMediaError(); break;
                        default: playerControls.showError('เกิดข้อผิดพลาด ไม่สามารถเล่นวิดีโอได้'); hls.destroy(); break;
                    }
                }
            });
        }
        
        setupEventListeners();
        timeManager.start();
        
        const savedVolume = localStorage.getItem('webtv_volume');
        if (savedVolume !== null) {
            video.volume = savedVolume;
            volumeSlider.value = savedVolume;
        } else {
            video.volume = 0.5;
            volumeSlider.value = 0.5;
        }
        playerControls.updateMuteButton();

        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('keydown', unlockAudio, { once: true });

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
