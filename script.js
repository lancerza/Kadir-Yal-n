document.addEventListener('DOMContentLoaded', function() {
    const datetimeDisplay = document.getElementById('current-datetime');
    const runningTextElement = document.getElementById('running-text');
    const footerTextElement = document.getElementById('footer-text');
    const categoryContentMap = {
        "ทีวีดิจิตอล": document.getElementById('content-thai-tv'),
        "กีฬา": document.getElementById('content-sport'),
        "หนังทีวี": document.getElementById('content-movies'),
        "สารคดี": document.getElementById('content-documentary'),
        "IPTV": document.getElementById('content-iptv')
    };
    let channelsData = null; // ตั้งค่าเป็น null เพื่อให้โหลดใหม่หลัง Login
    let textsData = null;
    let hasChannelsError = false;

    // กำหนด URL ของ Backend API
    const BACKEND_API_URL = 'http://localhost:3001'; // ***** สำคัญ: เปลี่ยนตาม Port ที่คุณตั้งค่าใน .env ของ Backend *****

    const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--red-accent').trim();

    // ***** DOM Elements สำหรับ Modal และ Authentication *****
    const authModal = document.getElementById('authModal');
    const closeButton = document.querySelector('.close-button');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const showLoginButton = document.getElementById('showLogin');
    const showRegisterButton = document.getElementById('showRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Input fields for Login
    const loginIdentifierInput = document.getElementById('loginIdentifier');
    const loginPasswordInput = document = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmit');
    const loginMessage = document.getElementById('loginMessage');

    // Input fields for Register
    const registerUsernameInput = document.getElementById('registerUsername');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');
    const registerSubmitBtn = document.getElementById('registerSubmit');
    const registerMessage = document.getElementById('registerMessage');


    // Functions for loading and displaying messages (unchanged)
    function showLoading(loadingIndicator, noChannelsMessage) {
        loadingIndicator.classList.add('active');
        noChannelsMessage.classList.remove('active');
        const existingChannelLinks = loadingIndicator.parentElement.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove());
    }
    function hideLoading(loadingIndicator) {
        loadingIndicator.classList.remove('active');
    }
    function showNoChannelsMessage(loadingIndicator, noChannelsMessage) {
        hideLoading(loadingIndicator);
        noChannelsMessage.classList.add('active');
    }
    function clearMessages(loadingIndicator, noChannelsMessage) {
        loadingIndicator.classList.remove('active');
        noChannelsMessage.classList.remove('active');
    }

    /**
     * โหลดข้อมูลจาก Backend API ที่ระบุ พร้อมแนบ Authentication Token (ถ้ามี)
     * @param {string} endpoint - Endpoint ของ API ที่จะเรียก (เช่น '/api/channels')
     * @param {Object} options - ออปชันสำหรับการเรียก fetch (เช่น method, body)
     * @returns {Promise<Array|Object>} - ข้อมูลที่โหลดมา
     * @throws {Error} - หากการโหลดหรือการแยกวิเคราะห์ข้อมูลล้มเหลว
     */
    async function fetchDataFromBackend(endpoint, options = {}) {
        const token = localStorage.getItem('authToken'); // ดึง token จาก localStorage
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers // รวม header ที่ส่งมาด้วย
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`; // เพิ่ม Authorization header
        }

        try {
            const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
                ...options,
                headers: headers
            });

            if (!response.ok) {
                // ถ้าเป็น 401 หรือ 403 และมี token แสดงว่า token ไม่ถูกต้องหรือหมดอายุ
                if ((response.status === 401 || response.status === 403) && token) {
                    console.warn('Authentication failed. Clearing token and redirecting to login.');
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('currentUser');
                    updateAuthButtons();
                    alert('เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง');
                    window.location.reload(); // รีโหลดหน้าเพื่อบังคับให้ Login ใหม่
                }

                const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
                const errorText = errorBody.message || `Failed to load ${endpoint}: HTTP error! status: ${response.status}`;
                throw new Error(errorText);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Error loading or parsing data from ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * โหลดข้อมูลช่องจาก Backend (ต้องใช้ Token เมื่อ API ถูกป้องกัน)
     * @returns {Promise<void>}
     */
    async function loadChannelsData() {
        // ไม่ต้องตรวจสอบ channelsData !== null อีก เพราะเราต้องการให้โหลดใหม่ทุกครั้งที่จำเป็น
        try {
            const data = await fetchDataFromBackend('/api/channels'); // เรียกจาก Backend
            if (!Array.isArray(data)) {
                throw new Error('Fetched data from /api/channels is not an array.');
            }
            channelsData = data;
            hasChannelsError = false;
        } catch (error) {
            console.error('Final error handling for channels data from Backend:', error);
            channelsData = []; // ตั้งค่าเป็น array ว่างเพื่อแสดงสถานะ
            hasChannelsError = true;
        }
    }

    /**
     * โหลดข้อมูลข้อความจาก Backend
     * @returns {Promise<void>}
     */
    async function loadTextsData() {
        if (textsData) return;
        try {
            const data = await fetchDataFromBackend('/api/texts');
            if (typeof data !== 'object' || data === null) {
                throw new Error('Fetched data from /api/texts is not a valid object.');
            }
            textsData = data;
            if (runningTextElement && textsData.runningText) {
                runningTextElement.textContent = textsData.runningText;
            }
            if (footerTextElement && textsData.footerText) {
                footerTextElement.textContent = textsData.footerText;
            }
        } catch (error) {
            console.error('Final error handling for texts data from Backend:', error);
            textsData = {};
            if (runningTextElement) runningTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความประกาศ!";
            if (footerTextElement) footerTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความท้ายหน้า!";
        }
    }

    // Initial data load (unchanged)
    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('All initial data (channels and texts) loaded successfully from Backend!');
            // ถ้ามี Error ในการโหลด channelsData ทั่วไป (เช่น Server Down) จะแสดงข้อความ
            if (hasChannelsError && channelsData.length === 0) { // เพิ่มเช็ค channelsData.length === 0 ด้วย
                Object.values(categoryContentMap).forEach(container => {
                    container.innerHTML = `<div class="no-channels-message active" style="color: ${redAccentColor}; text-align: center; padding: 20px;">
                                               เกิดข้อผิดพลาดในการโหลดช่อง: ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้<br>โปรดตรวจสอบ Backend Server
                                           </div>`;
                });
            }
        })
        .catch(error => {
            console.error('An error occurred during initial data loading. Some parts of the page might not load correctly:', error);
        });

    // Event listener for channel clicks (unchanged)
    document.querySelector('main.categories-container').addEventListener('click', function(event) {
        const link = event.target.closest('.channel-link');
        if (link) {
            event.preventDefault();
            const url = link.dataset.url;
            const imgElement = link.querySelector('img');
            const channelName = imgElement ? imgElement.alt : 'Unknown Channel';
            const categoryElement = link.closest('.category');
            const categoryButton = categoryElement ? categoryElement.querySelector('.accordion-button') : null;
            // ลบ emoji และ trim ช่องว่าง
            const categoryName = categoryButton ? categoryButton.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim() : 'Unknown Category';
            
            if (typeof gtag === 'function') {
                gtag('event', 'channel_click', { 'channel_name': channelName, 'category': categoryName, 'link_url': url });
            }
            // หน่วงเวลาเล็กน้อยก่อนเปลี่ยนหน้า เพื่อให้ Google Analytics ส่งข้อมูลทัน
            setTimeout(() => { if (url) window.location.href = url; }, 200);
        }
    });

    // Date/Time display (unchanged)
    function formatDateTime(date) { /* ... */ }
    function updateDateTime() { /* ... */ }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Accordion transitionend (unchanged)
    document.querySelectorAll('.accordion-content').forEach(contentElement => { /* ... */ });

    // Accordion functions (unchanged)
    function closeAccordion(contentElement, buttonElement) {
        contentElement.classList.remove('show');
        contentElement.style.maxHeight = '0px';
        buttonElement.setAttribute('aria-expanded', 'false');
        // เมื่อปิด accordion ให้ลบช่องรายการเดิมออกด้วย
        const existingChannelLinks = contentElement.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove());
        clearMessages(contentElement.querySelector('.loading-indicator'), contentElement.querySelector('.no-channels-message'));
    }
    function createChannelLinkElement(channel) { /* ... */ }

    /**
     * เปิด Accordion ที่กำหนดและโหลดช่องที่เกี่ยวข้อง
     * @param {HTMLElement} contentElement - องค์ประกอบ content ของ Accordion
     * @param {HTMLElement} buttonElement - องค์ประกอบ button ของ Accordion
     */
    async function openAccordion(contentElement, buttonElement) {
        // ตรวจสอบว่าผู้ใช้เข้าสู่ระบบหรือไม่
        const isLoggedIn = localStorage.getItem('authToken');
        if (!isLoggedIn) {
            // หากยังไม่ได้ Login ให้แสดง Modal Login และไม่โหลดช่อง
            openAuthModal('login');
            alert('กรุณาเข้าสู่ระบบเพื่อดูช่องรายการ');
            // ปิด accordion ถ้าเปิดอยู่ (สำคัญ)
            closeAccordion(contentElement, buttonElement);
            return; // หยุดการทำงาน
        }

        contentElement.style.display = 'flex'; 
        buttonElement.setAttribute('aria-expanded', 'true');

        const loadingIndicator = contentElement.querySelector('.loading-indicator');
        const noChannelsMessage = contentElement.querySelector('.no-channels-message');

        // ลบ channel links เก่าออกก่อนเสมอเมื่อจะโหลดใหม่
        const existingChannelLinks = contentElement.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove());
        clearMessages(loadingIndicator, noChannelsMessage); // เคลียร์ข้อความเก่า

        showLoading(loadingIndicator, noChannelsMessage); // แสดง loading

        // ตรวจสอบว่า channelsData โหลดแล้วหรือยัง หรือเกิดข้อผิดพลาด
        // ถ้า channelsData เป็น null (ยังไม่เคยโหลด) หรือ channelsData เป็น array ว่างเปล่าจากการโหลดครั้งก่อน
        // ให้ลองโหลดใหม่
        if (channelsData === null || channelsData.length === 0 || hasChannelsError) {
            await loadChannelsData();
        }

        // หากยังคงมีข้อผิดพลาดหลังจากพยายามโหลด หรือไม่มีข้อมูล
        if (hasChannelsError || !Array.isArray(channelsData) || channelsData.length === 0) {
            showNoChannelsMessage(loadingIndicator, noChannelsMessage); // แสดงข้อความไม่พบช่อง หรือข้อผิดพลาด
            return;
        }

        // หากมาถึงตรงนี้ แสดงว่า channelsData มีข้อมูลและโหลดสำเร็จ
        clearMessages(loadingIndicator, noChannelsMessage); // ล้างข้อความสถานะหลังจากโหลดข้อมูลสำเร็จ

        // ลบ emoji และ trim ช่องว่างสำหรับชื่อหมวดหมู่
        const categoryText = buttonElement.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim();
        const filteredChannels = channelsData.filter(channel => channel.category === categoryText);

        if (filteredChannels.length === 0) {
            showNoChannelsMessage(loadingIndicator, noChannelsMessage);
        } else {
            filteredChannels.forEach(channel => {
                const link = createChannelLinkElement(channel);
                contentElement.appendChild(link);
            });
        }

        // ใช้ requestAnimationFrame เพื่อให้แน่ใจว่า DOM ได้รับการอัปเดตก่อนคำนวณความสูง
        requestAnimationFrame(() => {
            const actualContentHeight = contentElement.scrollHeight;
            contentElement.style.maxHeight = (actualContentHeight + 16) + 'px'; // +16px เพื่อรองรับ padding/margin
            contentElement.classList.add('show');
        });
        hideLoading(loadingIndicator); // ซ่อน loading เมื่อช่องถูกแสดง
    }

    // Accordion button handlers (unchanged)
    const allAccordionButtons = document.querySelectorAll('.accordion-button');
    allAccordionButtons.forEach(button => {
        const content = button.nextElementSibling;
        button.addEventListener('click', function() {
            // ปิด Accordion อื่นๆ ที่เปิดอยู่
            allAccordionButtons.forEach(otherButton => {
                const otherContent = otherButton.nextElementSibling;
                if (otherButton !== this && otherContent && otherContent.classList.contains('show')) {
                    closeAccordion(otherContent, otherButton);
                }
            });
            // สลับสถานะ Accordion ที่ถูกคลิก
            if (content && content.classList.contains('show')) {
                closeAccordion(content, this);
            } else if (content) {
                openAccordion(content, this);
            }
        });
    });


    // ***** START AUTHENTICATION UI LOGIC *****

    // ฟังก์ชันเพื่อเปิด Modal
    function openAuthModal(formType) {
        authModal.style.display = 'flex';
        requestAnimationFrame(() => {
            authModal.classList.add('show');
        });
        
        if (formType === 'login') {
            showLoginForm();
        } else {
            showRegisterForm();
        }
    }

    // ฟังก์ชันเพื่อปิด Modal
    function closeAuthModal() {
        authModal.classList.remove('show');
        authModal.addEventListener('transitionend', function handler() {
            if (!authModal.classList.contains('show')) {
                authModal.style.display = 'none';
                authModal.removeEventListener('transitionend', handler);
            }
        }, { once: true });

        // ล้างข้อความแจ้งเตือนและค่าในฟอร์มเมื่อปิด Modal
        loginMessage.style.display = 'none';
        registerMessage.style.display = 'none';
        loginIdentifierInput.value = '';
        loginPasswordInput.value = '';
        registerUsernameInput.value = '';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';
    }

    // ฟังก์ชันรวมสำหรับสลับ Tab และ Form
    function showTab(tabName) {
        if (tabName === 'login') {
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            showLoginButton.classList.add('active');
            showRegisterButton.classList.remove('active');
            loginMessage.style.display = 'none';
            registerMessage.style.display = 'none'; // ซ่อนข้อความฟอร์มอื่น
        } else { // register
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            showRegisterButton.classList.add('active');
            showLoginButton.classList.remove('active');
            registerMessage.style.display = 'none';
            loginMessage.style.display = 'none'; // ซ่อนข้อความฟอร์มอื่น
        }
    }
    // ใช้ showTab แทน showLoginForm และ showRegisterForm เดิม
    function showLoginForm() { showTab('login'); }
    function showRegisterForm() { showTab('register'); }

    // Event Listeners สำหรับปุ่มแสดง Modal
    loginBtn.addEventListener('click', () => openAuthModal('login'));
    registerBtn.addEventListener('click', () => openAuthModal('register'));

    // Event Listeners สำหรับปิด Modal
    closeButton.addEventListener('click', closeAuthModal);
    window.addEventListener('click', (event) => {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });

    // Event Listeners สำหรับ Tab Buttons ใน Modal
    showLoginButton.addEventListener('click', showLoginForm);
    showRegisterButton.addEventListener('click', showRegisterForm);

    // ***** FUNCTIONS FOR REGISTER AND LOGIN *****

    /**
     * แสดงข้อความแจ้งเตือนใน UI
     * @param {HTMLElement} element - DOM element ที่จะแสดงข้อความ
     * @param {string} message - ข้อความที่จะแสดง
     * @param {string} type - 'success' หรือ 'error'
     */
    function showMessage(element, message, type) {
        element.textContent = message;
        element.className = `message-box ${type}`; // กำหนด class ทั้งหมดใหม่
        element.style.display = 'block';
    }

    /**
     * ฟังก์ชันลงทะเบียนผู้ใช้
     */
    registerSubmitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = registerUsernameInput.value.trim();
        const email = registerEmailInput.value.trim();
        const password = registerPasswordInput.value.trim();

        if (!username || !email || !password) {
            showMessage(registerMessage, 'กรุณากรอกข้อมูลให้ครบถ้วน.', 'error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_API_URL}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(registerMessage, data.message, 'success');
                // ล้างฟอร์มหลังจากลงทะเบียนสำเร็จ
                registerUsernameInput.value = '';
                registerEmailInput.value = '';
                registerPasswordInput.value = '';
                // อาจจะสลับไปหน้า Login ทันที
                setTimeout(() => showLoginForm(), 1500);
            } else {
                showMessage(registerMessage, data.message || 'การลงทะเบียนไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('Error registering user:', error);
            showMessage(registerMessage, 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
        }
    });

    /**
     * ฟังก์ชันเข้าสู่ระบบ
     */
    loginSubmitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const identifier = loginIdentifierInput.value.trim();
        const password = loginPasswordInput.value.trim();

        if (!identifier || !password) {
            showMessage(loginMessage, 'กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน', 'error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_API_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identifier, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(loginMessage, data.message, 'success');
                localStorage.setItem('authToken', data.token); // เก็บ JWT Token
                localStorage.setItem('currentUser', JSON.stringify(data.user)); // เก็บข้อมูลผู้ใช้
                updateAuthButtons(); // อัปเดต UI ปุ่ม
                closeAuthModal(); // ปิด Modal
                alert('เข้าสู่ระบบสำเร็จแล้ว!');
                // รีเซ็ต channelsData เป็น null เพื่อให้โหลดใหม่เมื่อ Login สำเร็จ
                channelsData = null; // ***** เพิ่มบรรทัดนี้ *****
                hasChannelsError = false; // ***** เพิ่มบรรทัดนี้ *****
                // ไม่ต้องรีโหลดหน้าทั้งหมด แต่โหลดข้อมูลช่องใหม่
                // window.location.reload(); // คอมเมนต์บรรทัดนี้ออก

                // หลังจาก Login สำเร็จ และ token ถูกเก็บแล้ว
                // เราต้องการให้ accordion โหลดช่องใหม่เมื่อผู้ใช้กดเปิด
                // แต่ถ้ามี accordion ที่เปิดอยู่แล้ว (เช่น ตอนที่ระบบบอกให้ Login) เราต้องพยายามโหลดมันใหม่
                const openAccordionButton = document.querySelector('.accordion-button[aria-expanded="true"]');
                if (openAccordionButton) {
                    const openContent = openAccordionButton.nextElementSibling;
                    closeAccordion(openContent, openAccordionButton); // ปิดก่อนเพื่อรีเซ็ต
                    // สามารถเรียก openAccordion(openContent, openAccordionButton); ตรงนี้ได้
                    // หรือปล่อยให้ผู้ใช้คลิกเปิดเอง
                }
                
            } else {
                showMessage(loginMessage, data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error');
            }
        } catch (error) {
            console.error('Error logging in user:', error);
            showMessage(loginMessage, 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
        }
    });

    // ฟังก์ชันสำหรับจัดการการแสดงผลปุ่ม Login/Register/Logout
    function updateAuthButtons() {
        const token = localStorage.getItem('authToken');
        if (token) {
            loginBtn.style.display = 'none';
            registerBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
        } else {
            loginBtn.style.display = 'inline-block';
            registerBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none';
        }
    }

    // Event Listener สำหรับปุ่ม Logout
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        updateAuthButtons();
        alert('ออกจากระบบสำเร็จแล้ว');
        // รีเซ็ต channelsData และ Error flag เมื่อ Logout
        channelsData = null; // ***** เพิ่มบรรทัดนี้ *****
        hasChannelsError = false; // ***** เพิ่มบรรทัดนี้ *****
        // ปิด accordion ที่เปิดอยู่ทั้งหมดเมื่อ Logout
        allAccordionButtons.forEach(button => {
            const content = button.nextElementSibling;
            if (content && content.classList.contains('show')) {
                closeAccordion(content, button);
            }
        });
        // ไม่ต้องรีโหลดหน้าทั้งหมดก็ได้
        // window.location.reload();
    });

    // เรียกใช้เมื่อหน้าโหลดครั้งแรก
    updateAuthButtons();

    // ***** END AUTHENTICATION UI LOGIC *****
});
