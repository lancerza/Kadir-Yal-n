document.addEventListener('DOMContentLoaded', function() {
// --- Elements ---
const datetimeDisplay = document.getElementById('current-datetime');
const runningTextElement = document.getElementById('running-text');
const footerTextElement = document.getElementById('footer-text');
const categoriesContainer = document.querySelector('main.categories-container');// Modal elements for app install prompt
const appInstallModal = document.getElementById(&#39;appInstallModal&#39;);
const modalTitle = document.getElementById(&#39;modalTitle&#39;);
const modalMessage = document.getElementById(&#39;modalMessage&#39;);
const modalInstallButton = document.getElementById(&#39;modalInstallButton&#39;);
const modalCloseButton = document.getElementById(&#39;modalCloseButton&#39;);
const appInstallModalCloseButtonSpan = appInstallModal.querySelector(&#39;.close-button&#39;);

// Modal elements for desktop video player ถูกลบออกจาก HTML แล้ว
// ดังนั้นจึงไม่ต้องมีตัวแปรอ้างอิงถึง elements เหล่านี้อีกต่อไป
// const videoPlayerModal = document.getElementById(&#39;videoPlayerModal&#39;);
// const videoModalTitle = document.getElementById(&#39;videoModalTitle&#39;);
// const desktopVideoPlayer = document.getElementById(&#39;desktopVideoPlayer&#39;);
// const videoModalCloseButton = document.getElementById(&#39;videoModalCloseButton&#39;);
// const videoPlayerModalCloseButtonSpan = videoPlayerModal.querySelector(&#39;.close-button&#39;);

// Network Status Alert
const networkStatusAlert = document.getElementById(&#39;network-status-alert&#39;);


// --- Data Variables ---
let channelsData = null;
let textsData = null;

// --- Configuration Variables ---
const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue(&#39;--red-accent&#39;).trim();

const APP_CONFIGS = {
    wiseplay: {
        package: &quot;com.wiseplay&quot;,
        userAgent: &quot;android&quot;,
        title: &quot;KTV&quot;,
        scheme: &quot;https&quot;, // scheme ใน intent url
        type: &quot;video/mp4&quot; // type ใน intent url
    },
    liftplay: {
        scheme: &quot;liftplay&quot;, // Custom URL scheme ของ Liftplay (ต้องถูกต้องตามเอกสาร Liftplay)
        action: &quot;play&quot;,      // การกระทำ (ต้องถูกต้องตามเอกสาร Liftplay)
        param_name: &quot;url&quot;    // ชื่อพารามิเตอร์สำหรับ URL วิดีโอของ Liftplay
    }
};

const APP_STORE_URLS = {
    wiseplay: &#39;[https://play.google.com/store/apps/details?id=com.wiseplay](https://play.google.com/store/apps/details?id=com.wiseplay)&#39;,
    liftplay: &#39;[https://apps.apple.com/th/app/liftplay/idYOUR_LIFTPLAY_APP_ID](https://apps.apple.com/th/app/liftplay/idYOUR_LIFTPLAY_APP_ID)&#39; // **สำคัญ: เปลี่ยน YOUR_LIFTPLAY_APP_ID เป็น ID จริงของ Liftplay**
};

// --- ลิงก์รูปภาพ Placeholder และ Error (ใช้ URL สาธารณะ) ---
const PLACEHOLDER_IMG = &#39;[https://via.placeholder.com/50x50?text=NO+IMG](https://via.placeholder.com/50x50?text=NO+IMG)&#39;; // ตัวอย่างลิงก์รูปภาพ Placeholder
const ERROR_IMG = &#39;[https://via.placeholder.com/50x50?text=ERROR](https://via.placeholder.com/50x50?text=ERROR)&#39;;     // ตัวอย่างลิงก์รูปภาพ Error


// --- Helper Functions ---

let lastFocusedElement = null; // เก็บองค์ประกอบที่โฟกัสอยู่ก่อน Modal จะเปิด

/**
 * Handles keyboard navigation (Tab key) within an open modal to create a trap.
 * @param {KeyboardEvent} e - The keyboard event.
 */
function handleModalTab(e) {
    const isTabPressed = (e.key === &#39;Tab&#39; || e.keyCode === 9);
    if (!isTabPressed) {
        return;
    }

    const modalElement = e.currentTarget; // The modal element itself
    const focusableElements = modalElement.querySelectorAll(&#39;button, [href], input, select, textarea, [tabindex]:not([tabindex=&quot;-1&quot;])&#39;);
    if (focusableElements.length === 0) return; // No focusable elements

    const firstFocusableElement = focusableElements
