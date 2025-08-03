document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let playerInstance, channels = {}, currentChannelId = null;

    // --- DOM Elements ---
    const body = document.body;
    const categorySidebar = document.getElementById('category-sidebar');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
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
    };

    // --- Channel Logic ---
    const channelManager = {
        updateActiveButton: () => {
            document.querySelectorAll('.channel-tile').forEach(tile => tile.classList.toggle('active', tile.dataset.channelId === currentChannelId));
        },
        createChannelButtons: () => {
            // ... (โค้ดส่วนนี้เหมือนเดิมทุกประการ) ...
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
                    tile.className = 'channel-tile';
                    if (category === 'หนัง') tile.classList.add('movie-tile');
                    tile.dataset.channelId = channel.id;
                    tile.addEventListener('click', () => {
                        channelManager.loadChannel(channel.id);
                        document.getElementById('player').scrollIntoView({ behavior: 'smooth' });
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
            }
            setupCategorySidebar(categories);
        },
        loadChannel: (channelId) => {
            if (!channels[channelId] || currentChannelId === channelId) return;

            playerControls.hideError();
            currentChannelId = channelId;
            localStorage.setItem('webtv_lastChannelId', channelId);
            const channel = channels[channelId];

            let streamUrl = channel.url || (channel.url_parts ? channel.url_parts.join('') : null);
            if (!streamUrl) {
                playerControls.showError("ไม่พบ URL ของช่องนี้");
                return;
            }

            document.title = `▶️ ${channel.name} - Flow TV`;
            channelManager.updateActiveButton();

            // --- สร้าง Source Object สำหรับ JW Player ---
            const source = {
                file: streamUrl,
                type: streamUrl.includes('.mpd') ? 'dash' : 'hls'
            };

            // --- เพิ่ม DRM ถ้ามี ---
            if (channel.drm && channel.drm.type === 'clearkey') {
                source.drm = {
                    clearkey: {
                        keyId: channel.drm.keyId,
                        key: channel.drm.key
                    }
                };
            }

            playerInstance.load([source]);
            playerInstance.play();
        }
    };
    
    // --- Datetime Logic (เหมือนเดิม) ---
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

    // --- Sidebar Logic (เหมือนเดิม) ---
    function setupCategorySidebar(categories) {
        // ... (โค้ดส่วนนี้เหมือนเดิมทุกประการ) ...
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
        const headers = document.querySelectorAll('.channel-category-header');
        const links = document.querySelectorAll('.category-link');
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                let current = '';
                headers.forEach(header => {
                    const headerTop = header.getBoundingClientRect().top;
                    if (headerTop < window.innerHeight / 2) current = header.getAttribute('id');
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

    // --- Event Listener Setup ---
    function setupEventListeners() {
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
            playerControls.showError("ไม่สามารถรีเฟรชรายการช่องได้: " + e.message);
        }
    }

    // --- Initialization ---
    async function init() {
        const savedTheme = localStorage.getItem('webtv_theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeToggleBtn.textContent = '🌙';
        }

        // --- Initialize JW Player ---
        playerInstance = jwplayer("player");
        playerInstance.on('error', (e) => {
            console.error("JW Player Error:", e);
            playerControls.showError(e.message);
        });

        await fetchAndRenderChannels();
        
        setupEventListeners();
        timeManager.start();

        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        
        let startChannelId = null;
        if (lastChannelId && channels[lastChannelId]) {
            startChannelId = lastChannelId;
        } else if (firstChannelId) {
            startChannelId = firstChannelId;
        }
        
        // --- Setup player with the first or last played channel ---
        if (startChannelId) {
            const channel = channels[startChannelId];
            let streamUrl = channel.url || (channel.url_parts ? channel.url_parts.join('') : null);
            const source = {
                file: streamUrl,
                type: streamUrl.includes('.mpd') ? 'dash' : 'hls'
            };
            if (channel.drm && channel.drm.type === 'clearkey') {
                source.drm = { clearkey: { keyId: channel.drm.keyId, key: channel.drm.key } };
            }
            playerInstance.setup({
                playlist: [source],
                width: "100%",
                aspectratio: "16:9",
                autostart: true,
                mute: true
            });
            currentChannelId = startChannelId;
            channelManager.updateActiveButton();
            document.title = `▶️ ${channel.name} - Flow TV`;
        }
    }
    
    init();
});
