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

    const redAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--red-accent').trim();

    /**
     * แสดงสถานะการโหลดสำหรับ container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะแสดงสถานะการโหลด
     */
    function showLoading(container) {
        container.querySelector('.loading-indicator').classList.add('active');
        container.querySelector('.no-channels-message').classList.remove('active');
        Array.from(container.children).forEach(child => {
            // ตรวจสอบว่า child ไม่ใช่ loading-indicator หรือ no-channels-message ก่อนลบ
            if (!child.classList.contains('loading-indicator') && !child.classList.contains('no-channels-message')) {
                child.remove();
            }
        });
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
     * โหลดข้อมูลช่องจาก channels.json
     * @returns {Promise<void>}
     */
    async function loadChannelsData() {
        if (channelsData) return; // หากโหลดแล้ว ไม่ต้องโหลดซ้ำ
        try {
            const response = await fetch('channels.json');
            if (!response.ok) {
                const errorText = response.status === 404
                    ? `channels.json not found (HTTP 404). Please ensure the file exists at the root of your server.)`
                    : `Failed to load channels.json: HTTP error! status: ${response.status}`;
                throw new Error(errorText);
            }
            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('Fetched data from channels.json is not an array. Please ensure the JSON is an array of channel objects.');
            }
            channelsData = data;
        } catch (error) {
            console.error('Error loading or parsing channels.json:', error);
            // ปรับปรุงการจัดการข้อผิดพลาด: อัปเดตข้อความใน no-channels-message และแสดง
            Object.values(categoryContentMap).forEach(container => {
                const noChannelsMsg = container.querySelector('.no-channels-message');
                // ล้างเนื้อหาช่องที่อาจจะโหลดบางส่วนไปแล้ว
                Array.from(container.children).forEach(child => {
                    if (!child.classList.contains('loading-indicator') && !child.classList.contains('no-channels-message')) {
                        child.remove();
                    }
                });
                if (noChannelsMsg) {
                    noChannelsMsg.innerHTML = `<span style="color: ${redAccentColor};">เกิดข้อผิดพลาดในการโหลดช่อง: ${error.message}<br>โปรดลองใหม่อีกครั้งในภายหลัง</span>`;
                    showNoChannelsMessage(container); // ใช้ showNoChannelsMessage เพื่อแสดงข้อความ
                }
                hideLoading(container); // ซ่อน loading indicator
            });
            channelsData = []; // ตั้งค่าเป็นอาร์เรย์ว่างเพื่อป้องกันการพยายามโหลดซ้ำ
        }
    }

    /**
     * โหลดข้อมูลข้อความจาก texts.json
     * @returns {Promise<void>}
     */
    async function loadTextsData() {
        if (textsData) return; // หากโหลดแล้ว ไม่ต้องโหลดซ้ำ
        try {
            const response = await fetch('texts.json');
            if (!response.ok) {
                const errorText = response.status === 404
                    ? `texts.json not found (HTTP 404). Please ensure the file exists at the root of your server.)`
                    : `Failed to load texts.json: HTTP error! status: ${response.status}`;
                throw new Error(errorText);
            }
            const data = await response.json();
            if (typeof data !== 'object' || data === null) {
                throw new Error('Fetched data from texts.json is not a valid object.');
            }
            textsData = data;
            if (runningTextElement && textsData.runningText) {
                runningTextElement.textContent = textsData.runningText;
            }
            if (footerTextElement && textsData.footerText) {
                footerTextElement.textContent = textsData.footerText;
            }
        } catch (error) {
            console.error('Error loading or parsing texts.json:', error);
            // แสดงข้อความข้อผิดพลาดเริ่มต้นหากโหลดไม่ได้
            if (runningTextElement) runningTextElement.textContent = "Error loading running text!";
            if (footerTextElement) footerTextElement.textContent = "Error loading footer text!";
        }
    }

    // โหลดข้อมูลเริ่มต้นทั้งหมดพร้อมกัน
    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('All initial data (channels and texts) loaded successfully!');
        })
        .catch(error => {
            console.error('An error occurred during initial data loading:', error);
        });

    // เพิ่ม Event Listener สำหรับการคลิกช่องเพื่อจัดการการนำทางและ analytics
    document.querySelector('main.categories-container').addEventListener('click', function(event) {
        const link = event.target.closest('.channel-link');
        if (link) {
            event.preventDefault(); // ป้องกันการนำทางทันที
            const url = link.dataset.url;
            const imgElement = link.querySelector('img');
            const channelName = imgElement ? imgElement.alt : 'Unknown Channel';
            const categoryElement = link.closest('.category');
            const categoryButton = categoryElement ? categoryElement.querySelector('.accordion-button') : null;
            // ใช้ normalize("NFC").replace(/\s+/g, " ").trim() เพื่อจัดการช่องว่างและ Normalize ตัวอักษรพิเศษ
            const categoryName = categoryButton ? categoryButton.innerText.normalize("NFC").replace(/\s+/g, " ").trim() : 'Unknown Category';
            // ส่งข้อมูลไปยัง Google Analytics (ถ้ามี)
            if (typeof gtag === 'function') {
                gtag('event', 'channel_click', { 'channel_name': channelName, 'category': categoryName, 'link_url': url });
            }
            // หน่วงเวลาเล็กน้อยก่อนนำทาง เพื่อให้ analytics ส่งข้อมูลได้ทัน
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
    // เรียกใช้ครั้งแรกเมื่อโหลดหน้า
    updateDateTime();
    // อัปเดตทุกวินาที
    setInterval(updateDateTime, 1000);

    // จัดการการเปลี่ยนผ่านของ Accordion content
    document.querySelectorAll('.accordion-content').forEach(contentElement => {
        contentElement.addEventListener('transitionend', function() {
            // ซ่อนองค์ประกอบเมื่อ Accordion ปิดสนิท
            if (!this.classList.contains('show')) {
                const computedMaxHeight = window.getComputedStyle(this).maxHeight;
                if (computedMaxHeight === '0px') {
                    this.style.display = 'none';
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
     * เปิด Accordion ที่กำหนดและโหลดช่องที่เกี่ยวข้อง
     * @param {HTMLElement} contentElement - องค์ประกอบ content ของ Accordion
     * @param {HTMLElement} buttonElement - องค์ประกอบ button ของ Accordion
     */
    async function openAccordion(contentElement, buttonElement) {
        contentElement.style.display = 'flex'; // แสดงเนื้อหาเพื่อให้คำนวณความสูงได้
        buttonElement.setAttribute('aria-expanded', 'true');

        showLoading(contentElement);

        if (!channelsData) {
            await loadChannelsData(); // โหลดข้อมูลช่องหากยังไม่ได้โหลด
        }

        clearMessages(contentElement); // ล้างข้อความสถานะก่อนแสดงช่อง

        // ดึงชื่อหมวดหมู่จากข้อความในปุ่ม โดยใช้ normalize("NFC").replace(/\s+/g, " ").trim()
        const categoryText = buttonElement.innerText.normalize("NFC").replace(/\s+/g, " ").trim();
        const filteredChannels = channelsData.filter(channel => channel.category === categoryText);

        if (filteredChannels.length === 0) {
            showNoChannelsMessage(contentElement);
        } else {
            // สร้างและเพิ่มองค์ประกอบช่องทีวี
            filteredChannels.forEach(channel => {
                const link = document.createElement('a');
                link.href = "#";
                link.classList.add('channel-link');
                link.dataset.url = channel.data_url;
                link.setAttribute('aria-label', channel.aria_label);

                const img = document.createElement('img');
                img.src = channel.img_src;
                img.alt = channel.name;
                img.loading = "lazy"; // ใช้ lazy loading เพื่อประสิทธิภาพ
                link.appendChild(img);
                contentElement.appendChild(link);
            });
        }

        // คำนวณความสูงที่ถูกต้องและแสดง Accordion
        requestAnimationFrame(() => {
            const actualContentHeight = contentElement.scrollHeight;
            contentElement.style.maxHeight = (actualContentHeight + 16) + 'px'; // เพิ่ม padding เล็กน้อย
            contentElement.classList.add('show');
        });
        hideLoading(contentElement); // ซ่อน loading indicator หลังจากแสดงเนื้อหา
    }

    // จัดการการทำงานของปุ่ม Accordion ทั้งหมด
    const allAccordionButtons = document.querySelectorAll('.accordion-button');
    allAccordionButtons.forEach(button => {
        const content = button.nextElementSibling; // เนื้อหาของ Accordion
        button.addEventListener('click', function() {
            allAccordionButtons.forEach(otherButton => {
                const otherContent = otherButton.nextElementSibling;
                // ปิด Accordion อื่นๆ ที่กำลังเปิดอยู่
                if (otherButton !== this && otherContent && otherContent.classList.contains('show')) {
                    closeAccordion(otherContent, otherButton);
                }
            });
            // สลับสถานะ Accordion ปัจจุบัน (เปิด/ปิด)
            if (content && content.classList.contains('show')) {
                closeAccordion(content, this);
            } else if (content) {
                openAccordion(content, this);
            }
        });
    });

    // --- ส่วนป้องกันการดูโค้ด ---
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());
    document.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        // อนุญาต spacebar และ Enter
        if (e.key === ' ' || e.key === 'Enter') return;
        // ป้องกัน Ctrl/Cmd + U, S, P, A, C, X, V และ Ctrl/Cmd + Shift + I, J, C (เครื่องมือสำหรับนักพัฒนา)
        if (e.ctrlKey || e.metaKey) {
            const lowerKey = e.key.toLowerCase();
            if (e.shiftKey) {
                if (['i', 'j', 'c'].includes(lowerKey)) { // Ctrl/Cmd + Shift + I, J, C
                    e.preventDefault();
                }
            } else {
                if (['u', 's', 'p', 'a', 'c', 'x', 'v'].includes(lowerKey)) { // Ctrl/Cmd + U, S, P, A, C, X, V
                    e.preventDefault();
                }
            }
        }
        // ป้องกัน F12 (เครื่องมือสำหรับนักพัฒนา)
        if (e.key === 'F12') e.preventDefault();
    });
    // --- สิ้นสุดส่วนป้องกันการดูโค้ด ---
});
