document.addEventListener('DOMContentLoaded', function() {
    // --- Elements ---
    const datetimeDisplay = document.getElementById('current-datetime');
    const runningTextElement = document.getElementById('running-text');
    const footerTextElement = document.getElementById('footer-text');
    const categoriesContainer = document.querySelector('main.categories-container');

    // Modal elements for app install prompt
    const appInstallModal = document.getElementById('appInstallModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalInstallButton = document.getElementById('modalInstallButton');
    const modalCloseButton = document.getElementById('modalCloseButton');
    const appInstallModalCloseButtonSpan = appInstallModal.querySelector('.close-button');

    // Modal elements for desktop video player
    const videoPlayerModal = document.getElementById('videoPlayerModal');
    const videoModalTitle = document.getElementById('videoModalTitle');
    const desktopVideoPlayer = document.getElementById('desktopVideoPlayer');
    const videoModalCloseButton = document.getElementById('videoModalCloseButton');
    const videoPlayerModalCloseButtonSpan = videoPlayerModal.querySelector('.close-button');

    // Generic Error Modal elements
    const errorModal = document.getElementById('errorModal');
    const errorModalTitle = document.getElementById('errorModalTitle');
    const errorModalMessage = document.getElementById('errorModalMessage');
    const errorModalReloadButton = document.getElementById('errorModalReloadButton');
    const errorModalCloseButton = document.getElementById('errorModalCloseButton');
    const errorModalCloseButtonSpan = errorModal.querySelector('.close-button');


    // Network Status Alert
    const networkStatusAlert = document.getElementById('network-status-alert');


    // --- Data Variables ---
    let channelsData = null;
    let textsData = null;

    // --- Configuration Variables ---
    const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--red-accent').trim();

    const APP_CONFIGS = {
        wiseplay: {
            package: "com.wiseplay",
            userAgent: "android",
            title: "KTV",
            scheme: "https", // scheme ใน intent url
            type: "video/mp4" // type ใน intent url
        },
        liftplay: {
            scheme: "liftplay", // Custom URL scheme ของ Liftplay (ต้องถูกต้องตามเอกสาร Liftplay)
            action: "play",      // การกระทำ (ต้องถูกต้องตามเอกสาร Liftplay)
            param_name: "url"    // ชื่อพารามิเตอร์สำหรับ URL วิดีโอของ Liftplay
        }
    };

    const APP_STORE_URLS = {
        wiseplay: 'https://play.google.com/store/apps/details?id=com.wiseplay',
        liftplay: 'https://apps.apple.com/th/app/liftplay/idYOUR_LIFTPLAY_APP_ID' // **สำคัญ: เปลี่ยน YOUR_LIFTPLAY_APP_ID เป็น ID จริงของ Liftplay**
    };

    const PLACEHOLDER_IMG = 'https://via.placeholder.com/50x50?text=NO+IMG'; // ตัวอย่างลิงก์รูปภาพ Placeholder
    const ERROR_IMG = 'https://via.placeholder.com/50x50?text=ERROR';     // ตัวอย่างลิงก์รูปภาพ Error


    // --- Helper Functions ---

    let lastFocusedElement = null; // เก็บองค์ประกอบที่โฟกัสอยู่ก่อน Modal จะเปิด

    /**
     * Handles keyboard navigation (Tab key) within an open modal to create a trap.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    function handleModalTab(e) {
        const isTabPressed = (e.key === 'Tab' || e.keyCode === 9);
        if (!isTabPressed) {
            return;
        }

        const modalElement = e.currentTarget; // The modal element itself
        const focusableElements = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) return; // No focusable elements

        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstFocusableElement) {
                lastFocusableElement.focus();
                e.preventDefault();
            }
        } else { // Tab
            if (document.activeElement === lastFocusableElement) {
                firstFocusableElement.focus();
                e.preventDefault();
            }
        }
    }

    /**
     * แสดง Modal Dialog และจัดการ Keyboard Trap
     * @param {HTMLElement} modalElement - องค์ประกอบ Modal ที่จะแสดง
     */
    function showModal(modalElement) {
        lastFocusedElement = document.activeElement; // เก็บองค์ประกอบที่โฟกัสอยู่

        modalElement.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // หยุดการเลื่อนของ body เมื่อ Modal เปิด

        // เพิ่ม Event Listener ให้กับ Modal สำหรับการจัดการ Tab (ป้องกันการซ้อนทับ)
        modalElement.removeEventListener('keydown', handleModalTab);
        modalElement.addEventListener('keydown', handleModalTab);

        // ตั้งโฟกัสไปที่ปุ่มปิด Modal หรือองค์ประกอบแรกที่โฟกัสได้
        const focusableElements = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        (focusableElements[0] || modalElement).focus();
    }

    /**
     * ซ่อน Modal Dialog
     * @param {HTMLElement} modalElement - องค์ประกอบ Modal ที่จะซ่อน
     */
    function hideModal(modalElement) {
        modalElement.style.display = 'none';
        document.body.style.overflow = ''; // คืนค่าการเลื่อนของ body
        if (lastFocusedElement) {
            lastFocusedElement.focus(); // คืนโฟกัสไปยังองค์ประกอบเดิม
            lastFocusedElement = null;
        }
        // ลบ Event Listener ออกเมื่อปิด Modal
        modalElement.removeEventListener('keydown', handleModalTab);
    }

    /**
     * แสดงข้อความแจ้งเตือนให้ติดตั้งแอปใน Modal
     * @param {string} appName - ชื่อแอป (เช่น 'Wiseplay', 'Liftplay')
     * @param {string} storeUrl - URL ไปยัง App Store/Google Play Store
     */
    function showAppInstallPromptModal(appName, storeUrl) {
        modalTitle.textContent = `ไม่พบแอป "${appName}"`;
        modalMessage.textContent = `โปรดติดตั้งแอป "${appName}" เพื่อดูช่องนี้`;
        modalInstallButton.textContent = `ติดตั้ง ${appName}`;
        modalInstallButton.onclick = () => {
            window.open(storeUrl, '_blank');
            if (typeof gtag === 'function') {
                gtag('event', 'app_install_accepted', { 'app_name': appName }); // GA Event
            }
            hideModal(appInstallModal);
        };
        modalCloseButton.onclick = () => {
            if (typeof gtag === 'function') {
                gtag('event', 'app_install_declined', { 'app_name': appName }); // GA Event
            }
            hideModal(appInstallModal);
        };
        appInstallModalCloseButtonSpan.onclick = () => {
            if (typeof gtag === 'function') {
                gtag('event', 'app_install_declined', { 'app_name': appName }); // GA Event
            }
            hideModal(appInstallModal);
        };
        
        if (typeof gtag === 'function') {
            gtag('event', 'app_install_prompt_shown', { 'app_name': appName }); // GA Event
        }
        showModal(appInstallModal);
    }

    /**
     * แสดง Modal ข้อผิดพลาดทั่วไป
     * @param {string} title - หัวข้อข้อผิดพลาด
     * @param {string} message - ข้อความอธิบายข้อผิดพลาด
     * @param {Function} [onReload] - ฟังก์ชันที่จะเรียกเมื่อกดปุ่ม "ลองใหม่" (ถ้ามี)
     */
    function showErrorModal(title, message, onReload = null) {
        errorModalTitle.textContent = title;
        errorModalMessage.innerHTML = message; // ใช้ innerHTML เพื่อรองรับ <br>

        errorModalReloadButton.style.display = onReload ? 'inline-block' : 'none';
        errorModalReloadButton.onclick = () => {
            hideModal(errorModal);
            if (onReload) onReload();
            if (typeof gtag === 'function') {
                gtag('event', 'error_modal_reload_clicked', { 'error_title': title });
            }
        };

        errorModalCloseButton.onclick = () => hideModal(errorModal);
        errorModalCloseButtonSpan.onclick = () => hideModal(errorModal);
        
        if (typeof gtag === 'function') {
            gtag('event', 'error_modal_shown', { 'error_title': title, 'error_message': message });
        }
        showModal(errorModal);
    }

    /**
     * แสดงสถานะการโหลดสำหรับ container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะแสดงสถานะการโหลด
     */
    function showLoading(container) {
        container.querySelector('.loading-indicator').classList.add('active');
        container.querySelector('.no-channels-message').classList.remove('active');
        const existingChannelLinks = container.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove()); // ลบช่องเก่าก่อนโหลดใหม่
    }

    /**
     * ซ่อนสถานะการโหลดสำหรับ container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะซ่อนสถานะการโหลด
     */
    function hideLoading(container) {
        container.querySelector('.loading-indicator').classList.remove('active');
    }

    /**
     * แสดงข้อความ "ไม่พบช่อง" สำหรับ container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะแสดงข้อความ
     */
    function showNoChannelsMessage(container) {
        hideLoading(container);
        container.querySelector('.no-channels-message').classList.add('active');
    }

    /**
     * ล้างข้อความสถานะทั้งหมด (โหลดและไม่พบช่อง) สำหรับ container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะล้างข้อความ
     */
    function clearMessages(container) {
        container.querySelector('.loading-indicator').classList.remove('active');
        container.querySelector('.no-channels-message').classList.remove('active');
    }

    /**
     * ตรวจสอบว่าสตริงเป็น URL ที่ถูกต้องหรือไม่ (เบื้องต้น)
     * @param {string} urlString - สตริง URL ที่จะตรวจสอบ
     * @returns {boolean} - true ถ้าเป็น URL ที่ถูกต้องเบื้องต้น, false ถ้าไม่
     */
    function isValidUrl(urlString) {
        try {
            new URL(urlString);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * โหลดข้อมูลจากไฟล์ JSON ที่ระบุ พร้อม Cache Busting และ Retry Mechanism
     * @param {string} fileName - ชื่อไฟล์ JSON ที่จะโหลด (เช่น 'channels.json')
     * @param {number} retries - จำนวนครั้งที่จะลองโหลดซ้ำ (ค่าเริ่มต้น 2)
     * @param {number} delay - ความหน่วงเวลาก่อนลองซ้ำ (ms)
     * @returns {Promise<Array|Object>} - ข้อมูลที่โหลดมา
     * @throws {Error} - หากการโหลดหรือการแยกวิเคราะห์ข้อมูลล้มเหลว
     */
    async function fetchData(fileName, retries = 2, delay = 1000) {
        for (let i = 0; i <= retries; i++) {
            try {
                const cacheBuster = `?v=${Date.now()}`; // Unique timestamp for cache busting
                const response = await fetch(`${fileName}${cacheBuster}`);
                if (!response.ok) {
                    const errorText = response.status === 404
                        ? `${fileName} ไม่พบ (HTTP 404). โปรดตรวจสอบว่าไฟล์อยู่ใน root ของเซิร์ฟเวอร์.)`
                        : `ไม่สามารถโหลด ${fileName}: HTTP error! status: ${response.status}`;
                    throw new Error(errorText);
                }
                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`ข้อผิดพลาดในการโหลดหรือแยกวิเคราะห์ ${fileName} (ครั้งที่ ${i + 1}/${retries + 1}):`, error);
                if (typeof gtag === 'function') {
                    gtag('event', 'load_error', { 'file_name': fileName, 'error_message': error.message, 'attempt': i + 1 });
                }
                if (i < retries) {
                    await new Promise(res => setTimeout(res, delay)); // หน่วงเวลาก่อนลองใหม่
                } else {
                    throw error; // โยน error ถ้าลองครบทุกครั้งแล้วยังไม่สำเร็จ
                }
            }
        }
    }

    /**
     * ตรวจสอบสถานะการเชื่อมต่อเครือข่ายและแสดง/ซ่อนข้อความแจ้งเตือน
     * ใช้ transition เพื่อการแสดงผลที่นุ่มนวล
     */
    function checkNetworkStatus() {
        if (!navigator.onLine) {
            networkStatusAlert.style.opacity = '1';
            networkStatusAlert.style.display = 'block'; // ให้แสดงผลเพื่อเริ่ม transition
            if (typeof gtag === 'function') {
                gtag('event', 'offline_alert_shown');
            }
        } else {
            networkStatusAlert.style.opacity = '0';
            networkStatusAlert.addEventListener('transitionend', function handler() {
                networkStatusAlert.style.display = 'none';
                networkStatusAlert.removeEventListener('transitionend', handler);
            });
        }
    }

    // --- การโหลดข้อมูลเริ่มต้น ---
    async function loadChannelsData() {
        if (channelsData) return;
        try {
            const data = await fetchData('channels.json');
            if (!Array.isArray(data)) {
                throw new Error('ข้อมูลจาก channels.json ไม่ใช่ array โปรดตรวจสอบรูปแบบ JSON.');
            }
            channelsData = data;
        } catch (error) {
            console.error('การจัดการข้อผิดพลาดขั้นสุดท้ายสำหรับ channels.json:', error);
            showErrorModal(
                'เกิดข้อผิดพลาดในการโหลดช่อง!',
                `ไม่สามารถโหลดรายการช่องได้: ${error.message}<br>โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง`,
                loadChannelsData // สามารถกดลองใหม่ได้
            );
            channelsData = [];
        }
    }

    async function loadTextsData() {
        if (textsData) return;
        try {
            const data = await fetchData('texts.json');
            if (typeof data !== 'object' || data === null) {
                throw new Error('ข้อมูลจาก texts.json ไม่ใช่ object ที่ถูกต้อง.');
            }
            textsData = data;
            if (runningTextElement && textsData.runningText) {
                runningTextElement.textContent = textsData.runningText;
            }
            if (footerTextElement && textsData.footerText) {
                footerTextElement.textContent = textsData.footerText;
            }
        } catch (error) {
            console.error('การจัดการข้อผิดพลาดขั้นสุดท้ายสำหรับ texts.json:', error);
            showErrorModal(
                'เกิดข้อผิดพลาด!',
                `ไม่สามารถโหลดข้อมูลข้อความประกาศได้: ${error.message}`,
                loadTextsData // สามารถกดลองใหม่ได้
            );
            textsData = {};
            if (runningTextElement) runningTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความประกาศ!";
            if (footerTextElement) footerTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความท้ายหน้า!";
        }
    }

    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('โหลดข้อมูลเริ่มต้นทั้งหมด (ช่องและข้อความ) สำเร็จแล้ว!');
        })
        .catch(error => {
            console.error('เกิดข้อผิดพลาดระหว่างการโหลดข้อมูลเริ่มต้น บางส่วนของหน้าอาจไม่แสดงผลอย่างถูกต้อง:', error);
            // showErrorModal ถูกเรียกใน loadChannelsData/loadTextsData แล้ว
        });

    /**
     * พยายามเปิด URL วิดีโอหลัก หากล้มเหลว ให้ลอง Fallback URL (ถ้ามี)
     * และจัดการแสดงผลตามแพลตฟอร์ม
     * @param {object} channel - ข้อมูลช่อง
     */
    function tryPlayChannel(channel) {
        let urlToPlay = channel.data_url;
        let isFallback = false;

        // ตรวจสอบความถูกต้องของ URL หลัก
        if (!isValidUrl(urlToPlay)) {
            console.warn(`URL หลักของช่อง "${channel.name}" ไม่ถูกต้อง: ${urlToPlay}`);
            // หาก URL หลักไม่ถูกต้อง จะไม่ลอง Fallback แล้ว แต่แสดงข้อผิดพลาดทันที
            showErrorModal(
                'ลิงก์วิดีโอไม่ถูกต้อง',
                `ลิงก์หลักสำหรับช่อง "${channel.name}" ไม่ถูกต้อง<br>โปรดติดต่อผู้ดูแล`
            );
            return; // หยุดทำงานถ้า URL หลักไม่ถูกต้อง
        }

        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroid = userAgent.includes('android');
        const isIOS = /ipad|iphone|ipod/.test(userAgent) && !window.MSStream;
        const isDesktop = !isAndroid && !isIOS;

        // --- Logic การเปิดแอปตามแพลตฟอร์ม ---
        if (isAndroid) {
            if (APP_CONFIGS.wiseplay) {
                let intentParams = Object.entries(APP_CONFIGS.wiseplay)
                                        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                                        .join(';');
                const finalIntentUrl = `intent://${urlToPlay}#Intent;${intentParams};end`;
                window.location.href = finalIntentUrl;
                
                const lastCheckTime = Date.now();
                setTimeout(() => {
                    if (Date.now() - lastCheckTime >= 1500 && document.visibilityState === 'visible') {
                        showAppInstallPromptModal('Wiseplay', APP_STORE_URLS.wiseplay);
                    }
                }, 1000);
            } else {
                window.open(urlToPlay, '_blank');
            }
        } else if (isIOS) {
            if (APP_CONFIGS.liftplay) {
                const { scheme, action, param_name } = APP_CONFIGS.liftplay;
                if (scheme && action && param_name) {
                    const finalLiftplayUrl = `${scheme}://${action}?${param_name}=${encodeURIComponent(urlToPlay)}`;
                    window.location.href = finalLiftplayUrl;

                    const lastCheckTime = Date.now();
                    setTimeout(() => {
                        if (Date.now() - lastCheckTime >= 1500 && document.visibilityState === 'visible') {
                            showAppInstallPromptModal('Liftplay', APP_STORE_URLS.liftplay);
                        }
                    }, 1000);
                } else {
                    console.warn(`Liftplay config ไม่สมบูรณ์สำหรับ ${channel.name}`);
                    showErrorModal(
                        'ตั้งค่าแอปไม่สมบูรณ์',
                        `การตั้งค่าสำหรับแอป Liftplay ของช่อง "${channel.name}" ไม่สมบูรณ์<br>โปรดติดต่อผู้ดูแล`
                    );
                }
            } else {
                window.open(urlToPlay, '_blank');
            }
        } else if (isDesktop) {
            videoModalTitle.textContent = channel.name;
            desktopVideoPlayer.src = urlToPlay;
            desktopVideoPlayer.load();
            desktopVideoPlayer.play();

            videoModalCloseButton.onclick = () => {
                desktopVideoPlayer.pause();
                desktopVideoPlayer.src = '';
                hideModal(videoPlayerModal);
            };
            videoPlayerModalCloseButtonSpan.onclick = () => {
                desktopVideoPlayer.pause();
                desktopVideoPlayer.src = '';
                hideModal(videoPlayerModal);
            };

            showModal(videoPlayerModal);
        }

        // GA Event
        if (typeof gtag === 'function') {
            gtag('event', 'channel_click', { 'channel_name': channel.name, 'category': channel.category, 'link_url': urlToPlay, 'is_fallback': isFallback });
        }
    }


    // --- Event Listener สำหรับการคลิกช่อง (Channel Link) ---
    categoriesContainer.addEventListener('click', function(event) {
        const link = event.target.closest('.channel-link');
        if (!link) return; // ไม่ใช่ channel link

        event.preventDefault(); // ป้องกันการกระทำเริ่มต้นของลิงก์

        // ตรวจสอบสถานะเครือข่ายก่อนดำเนินการ
        if (!navigator.onLine) {
            checkNetworkStatus(); // แสดงแจ้งเตือนทันที
            return; // หยุดการทำงาน
        }
        
        const channelName = link.querySelector('img').alt;
        const channel = channelsData.find(c => c.name === channelName);

        if (!channel) {
            console.error('ไม่พบข้อมูลช่องสำหรับ:', channelName);
            showErrorModal(
                'ข้อมูลช่องไม่พร้อมใช้งาน',
                `ไม่พบข้อมูลสำหรับช่อง "${channelName}" โปรดลองช่องอื่น หรือติดต่อผู้ดูแล`
            );
            return;
        }

        tryPlayChannel(channel); // เรียกใช้ฟังก์ชันใหม่เพื่อจัดการการเล่นวิดีโอ
    });

    // --- การอัปเดตวันที่และเวลา ---
    function formatDateTime(date) {
        const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false };
        const datePart = date.toLocaleDateString('th-TH', optionsDate);
        const timePart = date.toLocaleTimeString('th-TH', optionsTime);
        return { display: `${datePart} ${timePart}`, iso: date.toISOString() };
    }

    function updateDateTime() {
        const now = new Date();
        const formatted = formatDateTime(now);
        datetimeDisplay.textContent = formatted.display;
        datetimeDisplay.setAttribute('datetime', formatted.iso);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // --- การจัดการ Accordion ---
    document.querySelectorAll('.accordion-content').forEach(contentElement => {
        contentElement.addEventListener('transitionend', function() {
            if (!this.classList.contains('show')) {
                const computedMaxHeight = window.getComputedStyle(this).maxHeight;
                if (computedMaxHeight === '0px') {
                    this.style.display = 'none';
                }
            }
        });
    });

    function closeAccordion(contentElement, buttonElement) {
        contentElement.classList.remove('show');
        contentElement.style.maxHeight = '0px';
        buttonElement.setAttribute('aria-expanded', 'false');
    }

    async function openAccordion(contentElement, buttonElement) {
        contentElement.style.display = 'flex'; 
        buttonElement.setAttribute('aria-expanded', 'true');

        showLoading(contentElement);

        if (!channelsData) {
            await loadChannelsData();
        }

        if (!channelsData || channelsData.length === 0) {
            hideLoading(contentElement);
            // ถ้าไม่มีช่องในหมวดหมู่นี้ อาจพิจารณาซ่อนปุ่มหมวดหมู่นั้นไปเลย
            // buttonElement.style.display = 'none'; // หรือเพิ่ม class เพื่อซ่อน
            return; 
        }

        clearMessages(contentElement);

        const categoryText = buttonElement.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim();
        const filteredChannels = channelsData.filter(channel => channel.category === categoryText);

        if (filteredChannels.length === 0) {
            showNoChannelsMessage(contentElement);
            // ถ้าไม่มีช่องในหมวดหมู่นี้ อาจพิจารณาซ่อนปุ่มหมวดหมู่นั้นไปเลย
            // buttonElement.style.display = 'none'; // หรือเพิ่ม class เพื่อซ่อน
        } else {
            filteredChannels.forEach(channel => {
                const link = document.createElement('a');
                link.href = "#"; // ลิงก์ href เป็น # เพราะจะจัดการด้วย JS
                link.classList.add('channel-link');
                link.setAttribute('aria-label', channel.aria_label);

                const img = document.createElement('img');
                img.src = channel.img_src || PLACEHOLDER_IMG; // ใช้ placeholder ถ้า img_src ว่าง
                img.alt = channel.name;
                img.loading = "lazy";
                
                // การจัดการเมื่อรูปภาพโหลดไม่ได้ (จะใช้ ERROR_IMG ทันทีที่โหลดไม่ได้)
                img.onerror = function() {
                    this.onerror = null; // ป้องกัน infinite loop
                    this.src = ERROR_IMG; // รูปภาพแสดงข้อผิดพลาดสุดท้าย
                    console.warn(`ไม่สามารถโหลดรูปภาพสำหรับช่อง: ${channel.name} จาก ${channel.img_src || 'URL ว่างเปล่า'}. ใช้ภาพ ERROR.`);
                    if (typeof gtag === 'function') {
                        gtag('event', 'image_load_failed', { 'channel_name': channel.name, 'final_url_attempted': channel.img_src });
                    }
                };
                
                link.appendChild(img);
                contentElement.appendChild(link);
            });
        }

        requestAnimationFrame(() => {
            const actualContentHeight = contentElement.scrollHeight;
            contentElement.style.maxHeight = (actualContentHeight + 16) + 'px';
            contentElement.classList.add('show');
        });
        hideLoading(contentElement);
    }

    const allAccordionButtons = document.querySelectorAll('.accordion-button');
    allAccordionButtons.forEach(button => {
        const content = button.nextElementSibling;
        button.addEventListener('click', function() {
            allAccordionButtons.forEach(otherButton => {
                const otherContent = otherButton.nextElementSibling;
                if (otherButton !== this && otherContent && otherContent.classList.contains('show')) {
                    closeAccordion(otherContent, otherButton);
                }
            });
            if (content && content.classList.contains('show')) {
                closeAccordion(content, this);
            } else if (content) {
                openAccordion(content, this);
            }
        });
    });

    // --- ส่วนป้องกันการดูโค้ด (Code View Protection) ---
    document.addEventListener('contextmenu', e => { e.preventDefault(); });
    document.addEventListener('selectstart', e => { e.preventDefault(); });
    document.addEventListener('dragstart', e => { e.preventDefault(); });
    document.addEventListener('drop', e => { e.preventDefault(); });

    document.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') { return; }
        if (e.key === 'F12') { e.preventDefault(); return; }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) { e.preventDefault(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return; }
        if (e.ctrlKey || e.metaKey) {
            const lowerKey = e.key.toLowerCase();
            if (['s', 'p', 'a', 'c', 'x', 'v'].includes(lowerKey)) { e.preventDefault(); return; }
        }
    });

    const threshold = 160;
    let devtoolsOpen = false;
    let initialDevtoolsCheckDone = false; // Flag to run initial check once

    // Debounce function
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    // Function to check for DevTools
    function checkDevTools() {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!devtoolsOpen) {
                devtoolsOpen = true;
                // Store original body content to restore later
                document.body.dataset.originalContent = document.body.innerHTML; 
                document.body.innerHTML = `<div style="font-size: 2em; text-align: center; margin-top: 100px; color: ${redAccentColor}; height: 100vh; display: flex; align-items: center; justify-content: center;">
                                                ขออภัย ไม่สามารถเข้าถึงหน้านี้ได้เมื่อ Developer Tools เปิดอยู่
                                           </div>`;
            }
        } else {
            if (devtoolsOpen) {
                devtoolsOpen = false;
                // Restore original body content
                if (document.body.dataset.originalContent) {
                    document.body.innerHTML = document.body.dataset.originalContent;
                    delete document.body.dataset.originalContent;
                }
                // Reload page to re-initialize scripts and event listeners
                location.reload(); 
            }
        }
        initialDevtoolsCheckDone = true; // Mark initial check as complete
    }

    // --- Initializations ---
    checkDevTools();
    // Apply debounce to resize event
    const debouncedCheckDevTools = debounce(checkDevTools, 250); // Delay 250ms
    window.addEventListener('resize', debouncedCheckDevTools);

    // Set a periodic interval check (less frequent than resize)
    setInterval(() => {
        // Only run full check if initial check is done (to avoid race conditions)
        if (initialDevtoolsCheckDone) {
            checkDevTools();
        }
    }, 1000); // Check every 1 second

    window.addEventListener('online', checkNetworkStatus); // ตรวจสอบเมื่อกลับมาออนไลน์
    window.addEventListener('offline', checkNetworkStatus); // ตรวจสอบเมื่อออฟไลน์
    checkNetworkStatus(); // ตรวจสอบสถานะเริ่มต้นเมื่อโหลดหน้า
});
