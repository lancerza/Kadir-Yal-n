document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let hls, channels = {}, currentChannelId = null;
    let controlsTimeout;

    // --- DOM Elements ---
    const video = document.getElementById('video');
    const playerWrapper = document.querySelector('.player-wrapper');
    const customControls = document.querySelector('.custom-controls');
    const channelButtonsContainer = document.getElementById('channel-buttons-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingVideo = document.getElementById('loading-video');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const progressBar = document.getElementById('progress-bar');
    const timeDisplay = document.getElementById('time-display');
    const muteBtn = document.getElementById('mute-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // --- Player Logic ---
    function showLoadingIndicator(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            if (loadingVideo) loadingVideo.play().catch(() => {});
        } else {
            loadingIndicator.classList.add('hidden');
            if (loadingVideo) {
                loadingVideo.pause();
                loadingVideo.currentTime = 0;
            }
        }
    }

    const playerControls = {
        showError: (message) => {
            if (errorMessage) errorMessage.textContent = message;
            if (errorOverlay) errorOverlay.classList.remove('hidden');
        },
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
        toggleMute: () => video.muted = !video.muted,
        updateMuteButton: () => {
            const isMuted = video.muted || video.volume === 0;
            muteBtn.querySelector('.icon-volume-high').classList.toggle('hidden', isMuted);
            muteBtn.querySelector('.icon-volume-off').classList.toggle('hidden', !isMuted);
        },
        setVolume: () => {
            video.volume = volumeSlider.value;
            video.muted = Number(volumeSlider.value) === 0;
        },
        toggleFullscreen: () => {
            if (!document.fullscreenElement) playerWrapper.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
            else document.exitFullscreen();
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
            document.getElementById('live-indicator').classList.toggle('hidden', !isLive);
        }
    };

    // --- Channel Logic ---
    const channelManager = {
        updateActiveButton: () => {
            const tiles = document.querySelectorAll('.channel-tile');
            tiles.forEach(tile => tile.classList.toggle('active', tile.dataset.channelId === currentChannelId));
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
                        channelManager.loadChannel(channel.id);
                        if (window.innerWidth < 1024) {
                           playerWrapper.scrollIntoView({ behavior: 'smooth' });
                        }
                    });
                    const logoImg = document.createElement('img');
                    logoImg.src = channel.logo;
                    logoImg.alt = channel.name;
                    logoImg.loading = 'lazy';
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'channel-tile-name';
                    nameSpan.innerText = channel.name;
                    tile.appendChild(logoImg);
                    tile.appendChild(nameSpan);

                    if (channel.badge) {
                        const badge = document.createElement('div');
                        badge.className = 'channel-badge';
                        badge.textContent = channel.badge;
                        tile.appendChild(badge);
                    }
                    
                    grid.appendChild(tile);

                    setTimeout(() => {
                        tile.classList.add('visible');
                    }, index * 50);
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
            const channel = channels[channelId];
            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();
            try {
                if (hls) hls.loadSource(channel.url);
                video.play().catch(e => { if (e.name !== 'AbortError') console.error("Error playing video:", e); });
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
            document.getElementById('datetime-display').innerHTML = `🕒 ${thaiDate}, <time>${thaiTime}</time>`;
        },
        start: () => {
            timeManager.update();
            setInterval(timeManager.update, 1000);
        }
    };

    // --- Event Listener Setup ---
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        video.addEventListener('play', () => {
            playerControls.updatePlayButton();
            playerControls.showControls();
        });
        video.addEventListener('playing', () => {
            showLoadingIndicator(false);
            video.classList.add('visible'); 
        });
        video.addEventListener('pause', () => {
            playerControls.updatePlayButton();
            playerControls.showControls();
        });
        video.addEventListener('loadedmetadata', playerControls.checkIfLive);
        progressBar.addEventListener('input', playerControls.setProgress);
        video.addEventListener('timeupdate', playerControls.updateProgress);
        muteBtn.addEventListener('click', playerControls.toggleMute);
        volumeSlider.addEventListener('input', playerControls.setVolume);
        video.addEventListener('volumechange', () => {
            playerControls.updateMuteButton();
        });
        fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
        playerWrapper.addEventListener('mousemove', playerControls.showControls);
        playerWrapper.addEventListener('mouseleave', playerControls.hideControls);
        
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    playerControls.togglePlay();
                    break;
                case 'm':
                    playerControls.toggleMute();
                    break;
                case 'f':
                    playerControls.toggleFullscreen();
                    break;
            }
        });
    }

    // --- Initialization ---
    async function init() {
        try {
            const response = await fetch('channels.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            channels = await response.json();
        } catch (e) {
            console.error("Fatal Error: Could not load channel data.", e);
            playerControls.showError("เกิดข้อผิดพลาด: ไม่สามารถโหลดข้อมูลช่องได้");
            return;
        }

        if (Hls.isSupported()) {
            hls = new Hls({
                liveSyncDurationCount: 5,
                liveMaxLatencyDurationCount: 10,
            });
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            playerControls.showError('เกิดข้อผิดพลาดในการโหลดวิดีโอ\n(Network Error)');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                             playerControls.showError('เกิดข้อผิดพลาดในการเล่นวิดีโอ\n(Media Error)');
                            hls.recoverMediaError();
                            break;
                        default:
                            playerControls.showError('เกิดข้อผิดพลาด ไม่สามารถเล่นวิดีโอได้');
                            hls.destroy();
                            break;
                    }
                }
            });
        }
        
        setupEventListeners();
        timeManager.start();
        channelManager.createChannelButtons();
        
        const firstChannelId = Object.keys(channels)[0];
        if (firstChannelId) {
            await channelManager.loadChannel(firstChannelId);
        }
    }
    
    init();
});
