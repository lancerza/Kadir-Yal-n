document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let player, channels = {}, currentChannelId = null;
    let controlsTimeout;
    let isAudioUnlocked = false;

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
    function showLoadingIndicator(isLoading, message = '') {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (isLoading) {
            loadingMessage.textContent = message;
        }
    }

    const playerControls = {
        showError: (message, channelName) => {
            const errorChannelName = document.getElementById('error-channel-name');
            const nameToShow = channelName || (currentChannelId && channels[currentChannelId] ? channels[currentChannelId].name : null);
            
            if (nameToShow) {
                errorChannelName.textContent = nameToShow;
                errorChannelName.style.display = 'block';
            } else {
                errorChannelName.style.display = 'none';
            }
            if (errorMessage) errorMessage.textContent = message;
            if (errorOverlay) errorOverlay.classList.remove('hidden');
            const retryBtn = document.getElementById('retry-btn');
            const newBtn = retryBtn.cloneNode(true);
            newBtn.addEventListener('click', () => {
                if (currentChannelId) channelManager.loadChannel(currentChannelId);
            });
            retryBtn.parentNode.replaceChild(newBtn, retryBtn);
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
        formatTime: (timeInSeconds) => {
            const time = !isNaN(timeInSeconds) ? timeInSeconds : 0;
            const hours = Math.floor(time / 3600);
            const minutes = Math.floor((time % 3600) / 60);
            const seconds = Math.floor(time % 60);

            const formattedMinutes = minutes.toString().padStart(2, '0');
            const formattedSeconds = seconds.toString().padStart(2, '0');

            if (hours > 0) {
                return `${hours}:${formattedMinutes}:${formattedSeconds}`;
            } else {
                return `${formattedMinutes}:${formattedSeconds}`;
            }
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
            const isLive = player.isLive();
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
                
                if (category === 'หนัง') {
                    grid.classList.add('movie-grid');
                }

                groupedChannels[category].forEach((channel, index) => {
                    const tile = document.createElement('a');
                    tile.className = 'channel-tile';

                    if (category === 'หนัง') {
                        tile.classList.add('movie-tile');
                    }

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
        loadChannel: async (channelId) => {
            if (currentChannelId === channelId) return;

            video.classList.remove('visible');
            playerControls.hideError();
            showLoadingIndicator(true, 'กำลังโหลดช่อง...');
            await new Promise(resolve => setTimeout(resolve, 300));
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            
            const channel = channels[channelId];
            if (!channel) {
                playerControls.showError("ไม่พบข้อมูลช่อง", `ID: ${channelId}`);
                return;
            }
            
            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();

            // --- Shaka Player Configuration ---
            const config = { drm: { clearKeys: {} } };

            // Check if channel is DRM protected
            if (channel.type === 'dash' && channel.drm === 'clearkey' && channel.keyId && channel.key) {
                console.log(`Configuring Clearkey for ${channel.name}`);
                config.drm.clearKeys[channel.keyId] = channel.key;
            }
            
            player.configure(config);
            
            try {
                await player.load(channel.url);
                console.log(`Channel "${channel.name}" loaded successfully.`);
                playOverlay.classList.add('hidden');
            } catch (error) {
                console.error(`Error loading channel: ${channel.name}`, error);
                playerControls.showError(`เกิดข้อผิดพลาดในการโหลดช่อง (code: ${error.code})`, channel.name);
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

        const headers = document.querySelectorAll('.channel-category-header');
        const links = document.querySelectorAll('.category-link');
        let scrollTimeout;

        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                let current = '';
                headers.forEach(header => {
                    const headerTop = header.getBoundingClientRect().top;
                    if (headerTop < window.innerHeight / 2) {
                        current = header.getAttribute('id');
                    }
                });
                
                headers.forEach(h => h.classList.remove('active'));

                links.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${current}`) {
                        link.classList.add('active');
                        document.getElementById(current)?.classList.add('active');
                    }
                });
            }, 100);
        });
    }

    // --- Shaka Player Error Handler ---
    function onPlayerError(error) {
        console.error('Shaka Player Error:', error.detail);
        
        const failedChannelId = currentChannelId;
        const failedChannel = channels[failedChannelId];
        
        // --- Automatic Backup Switch Logic ---
        if (failedChannel && failedChannel.badge !== 'สำรอง') {
            const backupChannelId = Object.keys(channels).find(key =>
                channels[key].name === failedChannel.name &&
                channels[key].badge === 'สำรอง' &&
                key !== failedChannelId
            );

            if (backupChannelId) {
                console.log(`Channel '${failedChannel.name}' failed. Attempting to switch to backup.`);
                showLoadingIndicator(true, `ช่องหลักล้มเหลว กำลังลองช่องสำรอง...`);
                
                setTimeout(() => {
                    channelManager.loadChannel(backupChannelId).catch(err => {
                        playerControls.showError('ช่องสำรองล้มเหลว ไม่สามารถเล่นได้', failedChannel.name);
                    });
                }, 500);
                return;
            }
        }
        
        playerControls.showError(`Error: ${error.detail.message} (code: ${error.detail.code})`, failedChannel.name);
    }
    
    // --- Event Listener Setup ---
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', playerControls.togglePlay);
        
        video.addEventListener('playing', () => {
            document.querySelectorAll('.channel-tile.loading').forEach(t => t.classList.remove('loading'));
            showLoadingIndicator(false);
            video.classList.add('visible'); 
            playerControls.checkIfLive();
        });
        video.addEventListener('play', () => {
            playOverlay.classList.add('hidden');
            playerControls.updatePlayButton();
            playerControls.showControls();
        });
        video.addEventListener('pause', () => { playerControls.updatePlayButton(); playerControls.showControls(); });
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

        refreshChannelsBtn.addEventListener('click', () => {
            refreshChannelsBtn.classList.add('refresh-active');
            fetchAndRenderChannels();
            setTimeout(() => {
                refreshChannelsBtn.classList.remove('refresh-active');
            }, 1000);
        });

        playOverlay.addEventListener('click', () => {
            playOverlay.classList.add('hidden');
            showLoadingIndicator(true, 'กำลังเชื่อมต่อ...');
            playerControls.togglePlay();
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

        // --- Initialize Shaka Player ---
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
            player = new shaka.Player(video);
            player.addEventListener('error', onPlayerError);
        } else {
            console.error('Browser not supported by Shaka Player!');
            playerControls.showError('เบราว์เซอร์นี้ไม่รองรับการเล่นวิดีโอ');
        }
        
        setupEventListeners();
        timeManager.start();
        
        const savedVolume = localStorage.getItem('webtv_volume');
        const savedMuted = localStorage.getItem('webtv_muted') === 'true' || localStorage.getItem('webtv_muted') === null;

        if (savedVolume !== null) {
            video.volume = savedVolume;
            volumeSlider.value = savedVolume;
        } else {
            video.volume = 0.5;
            volumeSlider.value = 0.5;
        }
        
        video.muted = savedMuted;
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
