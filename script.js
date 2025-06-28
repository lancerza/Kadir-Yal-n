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

    const BACKEND_API_URL = 'http://localhost:3001';

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
    document.querySelector('main.categories-container').addEventListener('click', function(event) { /* ... */ });

    // Date/Time display (unchanged)
    function formatDateTime(date) { /* ... */ }
    function updateDateTime() { /* ... */ }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Accordion transitionend (unchanged)
    document.querySelectorAll('.accordion-content').forEach(contentElement => { /* ... */ });

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
        authModal.style.display = 'flex'; // ใช้ flex เพื่อจัดกึ่งกลาง
        if (formType === 'login') {
            showLoginForm();
        } else {
            showRegisterForm();
        }
    }

    // ฟังก์ชันเพื่อปิด Modal
    function closeAuthModal() {
        authModal.style.display = 'none';
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
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        showLoginButton.classList.add('active');
        showRegisterButton.classList.remove('active');
        loginMessage.style.display = 'none'; // ซ่อนข้อความเมื่อสลับฟอร์ม
    }

    // ฟังก์ชันเพื่อสลับไปแสดงฟอร์ม Register
    function showRegisterForm() {
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        showRegisterButton.classList.add('active');
        showLoginButton.classList.remove('active');
        registerMessage.style.display = 'none'; // ซ่อนข้อความเมื่อสลับฟอร์ม
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

    // ยังไม่มี Event Listener สำหรับ loginSubmitBtn และ registerSubmitBtn ในตอนนี้
    // จะเพิ่มในขั้นตอนถัดไปเมื่อเชื่อมต่อกับ Backend

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
        localStorage.removeItem('currentUser'); // ลบข้อมูลผู้ใช้
        updateAuthButtons(); // อัปเดตการแสดงผลปุ่ม
        alert('ออกจากระบบสำเร็จแล้ว');
        // อาจจะต้องรีโหลดหน้า หรือปรับ UI อื่นๆ
        window.location.reload(); // รีโหลดหน้าเพื่อกลับสู่สถานะก่อน Login
    });

    // เรียกใช้เมื่อหน้าโหลดครั้งแรก
    updateAuthButtons();

    // ***** END AUTHENTICATION UI LOGIC *****
});
