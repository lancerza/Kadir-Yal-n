document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let activePlayer = null; // This will hold either HLS.js or DASH.js instance
    let channels = {}, currentChannelId = null;
    let controlsTimeout;

    // --- DOM Elements ---
    const body = document.body;
    const video = document.getElementById('video');
    const playerWrapper = document.querySelector('.player-wrapper');
    const customControls = document.querySelector('.custom-controls');
    const channelButtonsContainer = document.getElementById('channel-buttons-container');
    const categorySidebar = document.getElementById('category-sidebar');
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
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
    
    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (isLoading) loadingMessage.textContent = message;
    }

    // --- Universal Player Controls (works with the <video> element) ---
    const playerControls = {
        showError: (message, channelName) => {
            const errorChannelName = document.getElementById('error-channel-name');
            const nameToShow = channelName || (currentChannelId && channels[currentChannelId] ? channels[currentChannelId].name : '');
            
            errorChannelName.textContent = nameToShow || '';
            errorChannelName.style.display = nameToShow ? 'block' : 'none';
            errorMessage.textContent = `Error: ${message}`;
            errorOverlay.classList.remove('hidden');
            
            const retryBtn = document.getElementById('retry-btn');
            const newBtn = retryBtn.cloneNode(true);
            newBtn.addEventListener('click', () => {
                if (currentChannelId) channelManager.loadChannel(currentChannelId);
            });
            retryBtn.parentNode.replaceChild(newBtn, retryBtn);
        },
        hideError: () => errorOverlay.classList.add('hidden'),
        togglePlay: () => {
            if (video.paused) {
                video.play().catch(e => console.error("Play error:", e));
            } else {
                video.pause();
            }
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
            video.muted = !video.muted;
            localStorage.setItem('webtv_muted', video.muted);
        },
        updateMuteButton: () => {
            const isMuted = video.muted || video.volume === 0;
            muteBtn.querySelector('.icon-volume-high').classList.toggle('hidden', isMuted);
            muteBtn.querySelector('.icon-volume-off').classList.toggle('hidden', !isMuted);
        },
        setVolume: () => {
            video.volume = volumeSlider.value;
            localStorage.setItem('webtv_volume', video.volume);
        },
        toggleFullscreen: () => {
            if (!document.fullscreenElement) {
                playerWrapper.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
            } else {
                document.exitFullscreen();
            }
        },
        togglePip: async () => {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await video.requestPictureInPicture();
            }
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
            const categories = Object.keys(groupedChannels);
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
                    tile.className = `channel-tile ${category === 'หนัง' ? 'movie-tile' : ''}`;
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
            setupCategorySidebar(categories);
        },
        loadChannel: (channelId) => {
            if (currentChannelId === channelId) return;
            
            playerControls.hideError();
            showLoadingIndicator(true, 'กำลังโหลดช่อง...');
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            const channel = channels[channelId];
            if (!channel) return;
            
            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();

            // --- Destroy previous player instance ---
            if (activePlayer) {
                if (typeof activePlayer.destroy === 'function') {
                    activePlayer.destroy();
                } else if (typeof activePlayer.reset === 'function') {
                    activePlayer.reset();
                }
                activePlayer = null;
            }

            // --- Select player based on URL ---
            if (channel.url.includes('.m3u8')) {
                // Use HLS.js for HLS streams
                console.log("Using HLS.js player");
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(channel.url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.error('HLS.js Fatal Error:', data);
                            playerControls.showError(`HLS Error: ${data.details}`, channel.name);
                        }
                    });
                    activePlayer = hls;
                } else {
                    playerControls.showError("HLS is not supported on this browser.", channel.name);
                }
            } else if (channel.url.includes('.mpd')) {
                // Use DASH.js for DASH streams
                console.log("Using DASH.js player");
                const dashPlayer = dashjs.MediaPlayer().create();
                dashPlayer.initialize(video, channel.url, true); // true for autoplay
                
                if (channel.drm === 'clearkey' && channel.keyId && channel.key) {
                    console.log(`Configuring Clearkey for ${channel.name} via dash.js`);
                    const protectionData = {
                        "org.w3.clearkey": {
                            "clearkeys": {
                                [channel.keyId]: channel.key
                            }
                        }
                    };
                    dashPlayer.setProtectionData(protectionData);
                }
                dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
                    console.error("DASH.js Error:", e);
                    playerControls.showError(`DASH Error: ${e.error.message}`, channel.name);
                });
                activePlayer = dashPlayer;
            } else {
                // Fallback for direct MP4 or other formats
                console.log("Using native HTML5 player");
                video.src = channel.url;
            }
        }
    };
    
    function setupCategorySidebar(categories) {
        // This function remains the same
        categorySidebar.innerHTML = '';
        categories.forEach(category => {
            const link = document.createElement('a');
            link.className = 'category-link';
            link.textContent = category;
            const categoryId = `category-${category.replace(/\s+/g, '-')}`;
            link.href = `#${categoryId}`;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById(categoryId)?.scrollIntoView({ behavior: 'smooth' });
            });
            categorySidebar.appendChild(link);
        });
    }
    
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

    // --- Main Initialization ---
    async function init() {
        // --- Universal video element event listeners ---
        video.addEventListener('play', playerControls.updatePlayButton);
        video.addEventListener('pause', playerControls.updatePlayButton);
        video.addEventListener('volumechange', playerControls.updateMuteButton);
        video.addEventListener('playing', () => {
            showLoadingIndicator(false);
            playOverlay.classList.add('hidden');
            document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
            playerControls.checkIfLive();
        });
        video.addEventListener('timeupdate', playerControls.updateProgress);

        // --- Custom control listeners ---
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        progressBar.addEventListener('input', playerControls.setProgress);
        muteBtn.addEventListener('click', playerControls.toggleMute);
        volumeSlider.addEventListener('input', playerControls.setVolume);
        fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
        pipBtn.addEventListener('click', playerControls.togglePip);
        playOverlay.addEventListener('click', () => video.play());
        playerWrapper.addEventListener('mousemove', playerControls.showControls);
        playerWrapper.addEventListener('mouseleave', playerControls.hideControls);
        
        themeToggleBtn.addEventListener('click', () => {
            body.classList.toggle('light-theme');
            const isLight = body.classList.contains('light-theme');
            themeToggleBtn.textContent = isLight ? '🌙' : '☀️';
            localStorage.setItem('webtv_theme', isLight ? 'light' : 'dark');
        });
        refreshChannelsBtn.addEventListener('click', () => {
            refreshChannelsBtn.classList.add('refresh-active');
            fetchAndRenderChannels();
            setTimeout(() => refreshChannelsBtn.classList.remove('refresh-active'), 1000);
        });
        
        // Load initial state
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        }

        await fetchAndRenderChannels();
        
        video.volume = localStorage.getItem('webtv_volume') || 0.5;
        volumeSlider.value = video.volume;
        playerControls.updateMuteButton();

        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        
        if (lastChannelId && channels[lastChannelId]) {
            channelManager.loadChannel(lastChannelId);
        } else if (firstChannelId) {
            channelManager.loadChannel(firstChannelId);
        }
    }
    
    init();
});
