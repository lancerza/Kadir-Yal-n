document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let player, channels = {}, currentChannelId = null;
    let controlsTimeout;

    // --- DOM Elements ---
    const body = document.body;
    const videoElement = document.getElementById('video');
    const playerWrapper = document.querySelector('.player-wrapper');
    const channelButtonsContainer = document.getElementById('channel-buttons-container');
    const categorySidebar = document.getElementById('category-sidebar');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingMessage = document.getElementById('loading-message');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    
    // --- Player Control Elements ---
    const customControls = document.querySelector('.custom-controls');
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

    // --- Initialize Video.js Player ---
    player = videojs(videoElement, {
        controls: false,
        autoplay: true,
        muted: true,
        playsinline: true
    });

    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (isLoading) loadingMessage.textContent = message;
    }

    // --- Player Logic (adapted for Video.js) ---
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
            if (player.paused()) {
                player.play().catch(e => console.error("Play error:", e));
            } else {
                player.pause();
            }
        },
        updatePlayButton: () => {
            playPauseBtn.querySelector('.icon-play').classList.toggle('hidden', !player.paused());
            playPauseBtn.querySelector('.icon-pause').classList.toggle('hidden', player.paused());
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
            const currentTime = player.currentTime();
            const duration = player.duration();
            if (isFinite(duration)) {
                progressBar.value = (currentTime / duration) * 100 || 0;
                timeDisplay.textContent = `${playerControls.formatTime(currentTime)} / ${playerControls.formatTime(duration)}`;
            }
        },
        setProgress: () => {
            const newTime = (progressBar.value / 100) * player.duration();
            player.currentTime(newTime);
        },
        toggleMute: () => {
            player.muted(!player.muted());
            localStorage.setItem('webtv_muted', player.muted());
        },
        updateMuteButton: () => {
            const isMuted = player.muted() || player.volume() === 0;
            muteBtn.querySelector('.icon-volume-high').classList.toggle('hidden', isMuted);
            muteBtn.querySelector('.icon-volume-off').classList.toggle('hidden', !isMuted);
        },
        setVolume: () => {
            player.volume(volumeSlider.value);
            localStorage.setItem('webtv_volume', player.volume());
        },
        toggleFullscreen: () => player.requestFullscreen(),
        togglePip: () => {
            try {
                 if (player.isInPictureInPicture()) {
                    player.exitPictureInPicture();
                } else {
                    player.requestPictureInPicture();
                }
            } catch (e) {
                console.error("PiP Error:", e);
            }
        },
        hideControls: () => {
            if (player.paused()) return;
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
            const isLive = !isFinite(player.duration());
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
            // This function remains the same as before
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
            if (currentChannelId === channelId && !player.error()) return;

            playerControls.hideError();
            showLoadingIndicator(true, 'กำลังโหลดช่อง...');
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            const channel = channels[channelId];
            if (!channel) return;

            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();

            // =================================================================
            //  NEW & IMPROVED Video.js Source Configuration
            // =================================================================
            let sourceType;
            const source = {
                src: channel.url,
            };

            if (channel.url.includes('.m3u8')) {
                source.type = 'application/x-mpegURL';
            } else if (channel.url.includes('.mpd')) {
                source.type = 'application/dash+xml';

                // --- Pass DRM keys directly to the DASH plugin ---
                if (channel.drm === 'clearkey' && channel.keyId && channel.key) {
                    console.log(`Configuring Clearkey for ${channel.name} via videojs-dash`);
                    source.keySystemOptions = [{
                        name: 'org.w3.clearkey',
                        options: {
                            serverURL: 'https://example.com/license', // This can be a dummy URL
                            clearkeys: {
                                [channel.keyId]: channel.key
                            }
                        }
                    }];
                }
            }

            player.src(source);
            player.play().catch(e => console.error("Error on load:", e));
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
        player.on('play', playerControls.updatePlayButton);
        player.on('pause', playerControls.updatePlayButton);
        player.on('volumechange', playerControls.updateMuteButton);
        player.on('playing', () => {
            showLoadingIndicator(false);
            playOverlay.classList.add('hidden');
            document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
            playerControls.checkIfLive();
        });
        player.on('timeupdate', playerControls.updateProgress);
        player.on('error', () => {
            const error = player.error();
            if (error) {
                console.error('Video.js Error:', error);
                playerControls.showError(error.message);
            }
        });

        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        progressBar.addEventListener('input', playerControls.setProgress);
        muteBtn.addEventListener('click', playerControls.toggleMute);
        volumeSlider.addEventListener('input', playerControls.setVolume);
        fullscreenBtn.addEventListener('click', playerControls.toggleFullscreen);
        pipBtn.addEventListener('click', playerControls.togglePip);
        playOverlay.addEventListener('click', () => player.play());
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
        
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        }

        await fetchAndRenderChannels();

        const savedVolume = localStorage.getItem('webtv_volume');
        if (savedVolume !== null) player.volume(savedVolume);
        
        playerControls.updatePlayButton();
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
