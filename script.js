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
    let channelsData = null;
    let textsData = null;
    let hasChannelsError = false;

    // กำหนด URL ของ Backend API
    const BACKEND_API_URL = 'http://localhost:3001'; // ***** สำคัญ: เปลี่ยนตาม Port ที่คุณตั้งค่าใน .env ของ Backend *****

    const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--red-accent').trim();

    // ***** เพิ่ม DOM Elements สำหรับ Modal และ Authentication *****
    const authModal = document.getElementById('authModal');
    const closeButton = document.querySelector('.close-button');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn'); // ปุ่ม Logout
    const showLoginButton = document.getElementById('showLogin');
    const showRegisterButton = document.getElementById('showRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Input fields for Login
    const loginIdentifierInput = document.getElementById('loginIdentifier');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmit');
    const loginMessage = document.getElementById('loginMessage');

    // Input fields for Register
    const registerUsernameInput = document.getElementById('registerUsername');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');
    const registerSubmitBtn = document.getElementById('registerSubmit');
    const registerMessage = document.getElementById('registerMessage');


    // Functions for loading and displaying messages (unchanged)
    function showLoading(loadingIndicator, noChannelsMessage) { /* ... */ }
    function hideLoading(loadingIndicator) { /* ... */ }
    function showNoChannelsMessage(loadingIndicator, noChannelsMessage) { /* ... */ }
    function clearMessages(loadingIndicator, noChannelsMessage) { /* ... */ }

    // Functions for fetching data from Backend (unchanged)
    async function fetchDataFromBackend(endpoint) { /* ... */ }
    async function loadChannelsData() { /* ... */ }
    async function loadTextsData() { /* ... */ }

    // Initial data load (unchanged)
    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('All initial data (channels and texts) loaded successfully from Backend!');
            if (hasChannelsError) {
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

    // Accordion transitionend (unchanged)
    document.querySelectorAll('.accordion-content').forEach(contentElement => {
        contentElement.addEventListener('transitionend', function() {
            if (!this.classList.contains('show')) {
                const computedMaxHeight = window.getComputedStyle(this).maxHeight;
                if (computedMaxHeight === '0px') {
                    this.style.display = 'none'; // ซ่อนอย่างสมบูรณ์เมื่อปิดและ transition จบ
                }
            }
        });
    });

    // Accordion functions (unchanged)
    function closeAccordion(contentElement, buttonElement) { /* ... */ }
    function createChannelLinkElement(channel) { /* ... */ }
    async function openAccordion(contentElement, buttonElement) { /* ... */ }

    // Accordion button handlers (unchanged)
    const allAccordionButtons = document.querySelectorAll('.accordion-button');
    allAccordionButtons.forEach(button => { /* ... */ });


    // ***** START AUTHENTICATION UI LOGIC *****

    // ฟังก์ชันเพื่อเปิด Modal
    function openAuthModal(formType) {
        authModal.style.display = 'flex'; // ตั้งค่า display เพื่อให้ Modal ปรากฏใน DOM
        // ใช้ requestAnimationFrame เพื่อให้แน่ใจว่า browser ตรวจจับ display change ก่อน
        requestAnimationFrame(() => {
            authModal.classList.add('show'); // เพิ่มคลาส show เพื่อแสดง Modal พร้อม transition
        });
        
        if (formType === 'login') {
            showLoginForm();
        } else {
            showRegisterForm();
        }
    }

    // ฟังก์ชันเพื่อปิด Modal
    function closeAuthModal() {
        authModal.classList.remove('show'); // ลบคลาส show เพื่อซ่อน Modal พร้อม transition
        // รอให้ transition จบก่อนที่จะตั้งค่า display เป็น none
        authModal.addEventListener('transitionend', function handler() {
            if (!authModal.classList.contains('show')) { // ตรวจสอบอีกครั้งว่าถูกซ่อนจริง
                authModal.style.display = 'none'; // ซ่อน Modal จาก DOM
                authModal.removeEventListener('transitionend', handler); // ลบ Event Listener เพื่อป้องกันการเรียกซ้ำ
            }
        }, { once: true }); // ใช้ { once: true } เพื่อให้ listener ถูกลบออกโดยอัตโนมัติหลังทำงานครั้งเดียว

        // ล้างข้อความแจ้งเตือนและค่าในฟอร์มเมื่อปิด Modal
        loginMessage.style.display = 'none';
        registerMessage.style.display = 'none';
        loginIdentifierInput.value = '';
        loginPasswordInput.value = '';
        registerUsernameInput.value = '';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';
    }

    // ฟังก์ชันเพื่อสลับไปแสดงฟอร์ม Login
    function showLoginForm() {
        showTab('login');
    }

    // ฟังก์ชันเพื่อสลับไปแสดงฟอร์ม Register
    function showRegisterForm() {
        showTab('register');
    }

    // ฟังก์ชันรวมสำหรับสลับ Tab และ Form
    function showTab(tabName) {
        if (tabName === 'login') {
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            showLoginButton.classList.add('active');
            showRegisterButton.classList.remove('active');
            loginMessage.style.display = 'none';
        } else { // register
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            showRegisterButton.classList.add('active');
            showLoginButton.classList.remove('active');
            registerMessage.style.display = 'none';
        }
    }


    // Event Listeners สำหรับปุ่มแสดง Modal
    loginBtn.addEventListener('click', () => openAuthModal('login'));
    registerBtn.addEventListener('click', () => openAuthModal('register'));

    // Event Listeners สำหรับปิด Modal
    closeButton.addEventListener('click', closeAuthModal);
    // ปิด Modal เมื่อคลิกนอก Modal Content
    window.addEventListener('click', (event) => {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });

    // Event Listeners สำหรับ Tab Buttons ใน Modal
    showLoginButton.addEventListener('click', showLoginForm);
    showRegisterButton.addEventListener('click', showRegisterForm);

    // ฟังก์ชันสำหรับจัดการการแสดงผลปุ่ม Login/Register/Logout
    function updateAuthButtons() {
        const token = localStorage.getItem('authToken'); // สมมติว่าเก็บ token ใน localStorage
        if (token) {
            loginBtn.style.display = 'none';
            registerBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-block'; // แสดงปุ่ม Logout
        } else {
            loginBtn.style.display = 'inline-block';
            registerBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none'; // ซ่อนปุ่ม Logout
        }
    }

    // Event Listener สำหรับปุ่ม Logout
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken'); // ลบ token
        localStorage.removeItem('currentUser'); // ลบข้อมูลผู้ใช้ (ถ้ามี)
        updateAuthButtons(); // อัปเดตการแสดงผลปุ่ม
        alert('ออกจากระบบสำเร็จแล้ว');
        window.location.reload(); // รีโหลดหน้าเพื่อกลับสู่สถานะก่อน Login
    });

    // เรียกใช้เมื่อหน้าโหลดครั้งแรก
    updateAuthButtons();

    // ***** END AUTHENTICATION UI LOGIC *****
});
