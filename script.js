document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let player, channels = {}, currentChannelId = null;

    // --- Helper Function for DRM Key Conversion ---
    function hexToBase64Url(hexString) {
        try {
            const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const base64 = btoa(String.fromCharCode.apply(null, bytes));
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) {
            console.error("Failed to convert hex to base64url", e);
            return "";
        }
    }

    // --- DOM Elements ---
    const body = document.body;
    const categorySidebar = document.getElementById('category-sidebar');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
    const playerWrapper = document.querySelector('.player-wrapper');
    const channelButtonsContainer = document.getElementById('channel-buttons-container');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');

    // --- Player Logic ---
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
                channelButtonsContainer.appendChild(grid);
            });
            setupCategorySidebar(Object.keys(groupedChannels));
        },
        loadChannel: (channelId) => {
            if (!channels[channelId] || currentChannelId === channelId) return;

            playerControls.hideError();
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            const channel = channels[currentChannelId];

            let streamUrl = channel.url || (channel.url_parts ? channel.url_parts.join('') : null);
            if (!streamUrl) {
                playerControls.showError("ไม่พบ URL ของช่องนี้");
                return;
            }

            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();

            const source = {
                src: streamUrl,
                type: streamUrl.includes('.mpd') ? 'application/dash+xml' : 'application/x-mpegURL'
            };

            if (channel.drm && channel.drm.type === 'clearkey') {
                source.keySystems = {
                    'org.w3.clearkey': {
                        keys: [{
                            'kty': 'oct',
                            'k': hexToBase64Url(channel.drm.key),
                            'kid': hexToBase64Url(channel.drm.keyId)
                        }]
                    }
                };
            }

            player.src(source);
        }
    };

    const timeManager = {
        update: () => {
            const now = new Date();
            document.getElementById('datetime-display').textContent = now.toLocaleString('th-TH', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        },
        start: () => {
            timeManager.update();
            setInterval(timeManager.update, 1000);
        }
    };
    
    function setupCategorySidebar(categories) {
        const sidebar = document.getElementById('category-sidebar');
        sidebar.innerHTML = '';
        categories.forEach(category => {
            const link = document.createElement('a');
            link.className = 'category-link';
            link.textContent = category;
            link.href = `#category-${category.replace(/\s+/g, '-')}`;
            link.onclick = (e) => {
                e.preventDefault();
                document.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
            };
            sidebar.appendChild(link);
        });
    }

    async function fetchAndRenderChannels() {
        try {
            const response = await fetch('channels.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Network response was not ok');
            channels = await response.json();
            channelManager.createChannelButtons();
        } catch(e) { 
            console.error("Could not fetch channels:", e);
            playerControls.showError("ไม่สามารถโหลดรายการช่องได้: " + e.message);
        }
    }

    async function init() {
        player = videojs('video');
        player.eme();

        player.on('error', () => {
            const error = player.error();
            if (error) {
                console.error('Video.js Error:', error);
                playerControls.showError(`Error ${error.code}: ${error.message}`);
            }
        });
        
        themeToggleBtn.addEventListener('click', () => {
            body.classList.toggle('light-theme');
            const newTheme = body.classList.contains('light-theme') ? 'light' : 'dark';
            themeToggleBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
            localStorage.setItem('webtv_theme', newTheme);
        });

        refreshChannelsBtn.addEventListener('click', fetchAndRenderChannels);

        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        } else {
            themeToggleBtn.textContent = '☀️';
        }

        await fetchAndRenderChannels();
        
        timeManager.start();
        
        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        
        player.ready(() => {
            if (lastChannelId && channels[lastChannelId]) {
                channelManager.loadChannel(lastChannelId);
            } else if (firstChannelId) {
                channelManager.loadChannel(firstChannelId);
            }
        });
    }

    init();
});
