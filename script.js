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
    let hasChannelsError = false; // Flag เพื่อติดตามสถานะข้อผิดพลาดของ channels.json

    // กำหนด URL ของ Backend API
    const BACKEND_API_URL = 'http://localhost:3001'; // ***** สำคัญ: เปลี่ยนตาม Port ที่คุณตั้งค่าใน .env ของ Backend *****

    const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--red-accent').trim();

    /**
     * แสดงสถานะการโหลดสำหรับ container ที่กำหนด
     * @param {HTMLElement} loadingIndicator - องค์ประกอบ loading indicator
     * @param {HTMLElement} noChannelsMessage - องค์ประกอบ no channels message
     */
    function showLoading(loadingIndicator, noChannelsMessage) {
        loadingIndicator.classList.add('active');
        noChannelsMessage.classList.remove('active');
    }

    /**
     * ซ่อนสถานะการโหลดสำหรับ container ที่กำหนด
     * @param {HTMLElement} loadingIndicator - องค์ประกอบ loading indicator
     */
    function hideLoading(loadingIndicator) {
        loadingIndicator.classList.remove('active');
    }

    /**
     * แสดงข้อความ "ไม่พบช่อง" สำหรับ container ที่กำหนด
     * @param {HTMLElement} loadingIndicator - องค์ประกอบ loading indicator
     * @param {HTMLElement} noChannelsMessage - องค์ประกอบ no channels message
     */
    function showNoChannelsMessage(loadingIndicator, noChannelsMessage) {
        hideLoading(loadingIndicator);
        noChannelsMessage.classList.add('active');
    }

    /**
     * ล้างข้อความสถานะทั้งหมด (โหลดและไม่พบช่อง) สำหรับ container ที่กำหนด
     * @param {HTMLElement} loadingIndicator - องค์ประกอบ loading indicator
     * @param {HTMLElement} noChannelsMessage - องค์ประกอบ no channels message
     */
    function clearMessages(loadingIndicator, noChannelsMessage) {
        loadingIndicator.classList.remove('active');
        noChannelsMessage.classList.remove('active');
    }

    /**
     * โหลดข้อมูลจาก Backend API ที่ระบุ
     * @param {string} endpoint - Endpoint ของ API ที่จะเรียก (เช่น '/api/channels')
     * @returns {Promise<Array|Object>} - ข้อมูลที่โหลดมา
     * @throws {Error} - หากการโหลดหรือการแยกวิเคราะห์ข้อมูลล้มเหลว
     */
    async function fetchDataFromBackend(endpoint) {
        try {
            const response = await fetch(`${BACKEND_API_URL}${endpoint}`);
            if (!response.ok) {
                const errorText = response.status === 404
                    ? `Endpoint ${endpoint} not found (HTTP 404).`
                    : `Failed to load ${endpoint}: HTTP error! status: ${response.status}`;
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
     * โหลดข้อมูลช่องจาก Backend
     * @returns {Promise<void>}
     */
    async function loadChannelsData() {
        if (channelsData !== null) return; // ถ้าโหลดแล้วหรือเกิดข้อผิดพลาดไปแล้ว ไม่ต้องโหลดซ้ำ
        try {
            const data = await fetchDataFromBackend('/api/channels'); // เรียกจาก Backend
            if (!Array.isArray(data)) {
                throw new Error('Fetched data from /api/channels is not an array.');
            }
            channelsData = data;
            hasChannelsError = false;
        } catch (error) {
            console.error('Final error handling for channels data from Backend:', error);
            channelsData = [];
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
            const data = await fetchDataFromBackend('/api/texts'); // เรียกจาก Backend
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

    // โหลดข้อมูลเริ่มต้นทั้งหมดพร้อมกัน
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

    // Event listener สำหรับการคลิกช่อง (Channel Link)
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
            const categoryName = categoryButton ? button.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim() : 'Unknown Category';
            
            if (typeof gtag === 'function') {
                gtag('event', 'channel_click', { 'channel_name': channelName, 'category': categoryName, 'link_url': url });
            }
            // หน่วงเวลาเล็กน้อยก่อนเปลี่ยนหน้า เพื่อให้ Google Analytics ส่งข้อมูลทัน
            setTimeout(() => { if (url) window.location.href = url; }, 200);
        }
    });

    /**
     * จัดรูปแบบวันที่และเวลา
     * @param {Date} date - วัตถุ Date ที่จะจัดรูปแบบ
     * @returns {{display: string, iso: string}} วัตถุที่มีสตริงที่จัดรูปแบบและสตริง ISO
     */
    function formatDateTime(date) {
        const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false };
        const datePart = date.toLocaleDateString('th-TH', optionsDate);
        const timePart = date.toLocaleTimeString('th-TH', optionsTime);
        return { display: `${datePart} ${timePart}`, iso: date.toISOString() };
    }

    /**
     * อัปเดตการแสดงผลวันที่และเวลาปัจจุบัน
     */
    function updateDateTime() {
        const now = new Date();
        const formatted = formatDateTime(now);
        datetimeDisplay.textContent = formatted.display;
        datetimeDisplay.setAttribute('datetime', formatted.iso);
    }
    updateDateTime(); // เรียกใช้ครั้งแรกทันที
    setInterval(updateDateTime, 1000); // อัปเดตทุกวินาที

    // จัดการ transitionend เพื่อซ่อน content อย่างสมบูรณ์เมื่อปิด
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

    /**
     * ปิด Accordion ที่กำหนด
     * @param {HTMLElement} contentElement - องค์ประกอบ content ของ Accordion
     * @param {HTMLElement} buttonElement - องค์ประกอบ button ของ Accordion
     */
    function closeAccordion(contentElement, buttonElement) {
        contentElement.classList.remove('show');
        contentElement.style.maxHeight = '0px';
        buttonElement.setAttribute('aria-expanded', 'false');
    }

    /**
     * สร้างและคืนค่า element ของ channel link
     * @param {Object} channel - object ของข้อมูลช่อง
     * @returns {HTMLAnchorElement} - องค์ประกอบ anchor ที่สร้างขึ้น
     */
    function createChannelLinkElement(channel) {
        const link = document.createElement('a');
        link.href = "#";
        link.classList.add('channel-link');
        link.dataset.url = channel.data_url;
        link.setAttribute('aria-label', channel.aria_label);

        const img = document.createElement('img');
        img.src = channel.img_src;
        img.alt = channel.name;
        img.loading = "lazy";
        link.appendChild(img);
        return link;
    }

    /**
     * เปิด Accordion ที่กำหนดและโหลดช่องที่เกี่ยวข้อง
     * @param {HTMLElement} contentElement - องค์ประกอบ content ของ Accordion
     * @param {HTMLElement} buttonElement - องค์ประกอบ button ของ Accordion
     */
    async function openAccordion(contentElement, buttonElement) {
        // ต้องตั้งค่า display: flex ก่อน เพื่อให้ scrollHeight คำนวณได้ถูกต้อง
        contentElement.style.display = 'flex'; 
        buttonElement.setAttribute('aria-expanded', 'true');

        const loadingIndicator = contentElement.querySelector('.loading-indicator');
        const noChannelsMessage = contentElement.querySelector('.no-channels-message');

        // ลบ channel links เก่าออกก่อนเสมอเมื่อจะโหลดใหม่
        const existingChannelLinks = contentElement.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove());

        showLoading(loadingIndicator, noChannelsMessage); // แสดง loading

        if (channelsData === null) { // โหลดข้อมูลหากยังไม่ได้โหลดเลย
            await loadChannelsData();
        }

        // หากยังคงมีข้อผิดพลาดหลังจากพยายามโหลด ให้หยุดทำงาน
        if (hasChannelsError || !Array.isArray(channelsData) || channelsData.length === 0) {
            hideLoading(loadingIndicator);
            // ถ้ามีข้อผิดพลาดในการโหลด channelsData ทั่วไป ข้อความจะถูกแสดงไปแล้วใน Promise.all
            // ถ้าไม่มีข้อมูลช่องสำหรับหมวดหมู่นี้โดยเฉพาะ จะแสดงข้อความ "ไม่พบช่อง"
            if (!hasChannelsError) {
                showNoChannelsMessage(loadingIndicator, noChannelsMessage);
            } else {
                 // หากมีข้อผิดพลาดระดับไฟล์ JSON ข้อความจะถูกจัดการโดย Promise.all
                 // ตรงนี้อาจจะไม่ต้องทำอะไรเพิ่มเติม เพราะเนื้อหาถูกแทนที่ไปแล้ว
            }
            return;
        }

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

    // จัดการการคลิกปุ่ม Accordion ทั้งหมด
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
});
