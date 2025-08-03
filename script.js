document.addEventListener("DOMContentLoaded", () => {
    // --- Global Variables ---
    let player, channels = {}, currentChannelId = null;

    // --- Helper Function for DRM Key Conversion (ยังคงต้องใช้) ---
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
            // โค้ดส่วนนี้เหมือนเดิมทุกประการ
            // ... (Copy the createChannelButtons function from the previous response) ...
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

            // --- สร้าง Source Object สำหรับ Video.js ---
            const source = {
                src: streamUrl,
                type: streamUrl.includes('.mpd') ? 'application/dash+xml' : 'application/x-mpegURL'
            };

            // --- ตั้งค่า DRM สำหรับ Video.js EME Plugin ---
            if (channel.drm && channel.drm.type === 'clearkey') {
                source.keySystems = {
                    'org.w3.clearkey': {
                        // ปลั๊กอิน EME ต้องการ Key ในรูปแบบ JSON Web Key (JWK) array
                        keys: [{
                            'kty': 'oct',
                            'k': hexToBase64Url(channel.drm.key),
                            'kid': hexToBase64Url(channel.drm.keyId)
                        }]
                    }
                };
            }

            player.src(source);
            player.play().catch(e => console.error("Play被阻止:", e));
        }
    };

    // --- Initialization ---
    async function init() {
        // --- Initialize Video.js Player ---
        player = videojs('video', {
            autoplay: true,
            muted: true,
            controls: true,
            html5: {
                vhs: {
                    overrideNative: true
                }
            }
        });

        // --- Initialize EME plugin for DRM ---
        player.eme();

        player.on('error', () => {
            const error = player.error();
            if (error) {
                console.error('Video.js Error:', error);
                playerControls.showError(`Error ${error.code}: ${error.message}`);
            }
        });
        
        // --- ส่วนที่เหลือของ init() จะคล้ายเดิม ---
        await fetchAndRenderChannels(); // โหลดข้อมูลช่อง
        //... ตั้งค่าอื่นๆ เช่น theme, time, event listeners ...
    }
    
    // --- ฟังก์ชันอื่นๆ ที่ต้องใช้ (ย่อ) ---
    // (Copy the full versions of these functions from the previous script)
    const setupCategorySidebar = () => { /* ... */ };
    const fetchAndRenderChannels = async () => {
        try {
            channels = await (await fetch('channels.json', { cache: 'no-store' })).json();
            channelManager.createChannelButtons();
        } catch(e) { playerControls.showError("ไม่สามารถโหลดรายการช่องได้: " + e.message); }
    };
    channelManager.createChannelButtons = () => { /* ... full function ... */ }; // ต้องคัดลอกโค้ดเต็มมาใส่
    
    init();

    // --- โหลดช่องเริ่มต้น ---
    player.ready(() => {
        const lastChannelId = localStorage.getItem('webtv_lastChannelId');
        const firstChannelId = Object.keys(channels)[0];
        if (lastChannelId && channels[lastChannelId]) {
            channelManager.loadChannel(lastChannelId);
        } else if (firstChannelId) {
            channelManager.loadChannel(firstChannelId);
        }
    });
});
