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
        if (channelsData) return;
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
            Object.values(categoryContentMap).forEach(container => {
                container.innerHTML = `<div class="no-channels-message active" style="color: ${redAccentColor};">
                                            เกิดข้อผิดพลาดในการโหลดช่อง: ${error.message}<br>โปรดลองใหม่อีกครั้งในภายหลัง
                                        </div>`;
            });
            channelsData = [];
        }
    }

    /**
     * โหลดข้อมูลข้อความจาก texts.json
     * @returns {Promise<void>}
     */
    async function loadTextsData() {
        if (textsData) return;
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
            if (runningTextElement) runningTextElement.textContent = "Error loading running text!";
            if (footerTextElement) footerTextElement.textContent = "Error loading footer text!";
        }
    }

    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('All initial data (channels and texts) loaded successfully!');
        })
        .catch(error => {
            console.error('An error occurred during initial data loading:', error);
        });

    document.querySelector('main.categories-container').addEventListener('click', function(event) {
        const link = event.target.closest('.channel-link');
        if (link) {
            event.preventDefault();
            const url = link.dataset.url;
            const imgElement = link.querySelector('img');
            const channelName = imgElement ? imgElement.alt : 'Unknown Channel';
            const categoryElement = link.closest('.category');
            const categoryButton = categoryElement ? categoryElement.querySelector('.accordion-button') : null;
            const categoryName = categoryButton ? categoryButton.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').trim() : 'Unknown Category';
            if (typeof gtag === 'function') {
                gtag('event', 'channel_click', { 'channel_name': channelName, 'category': categoryName, 'link_url': url });
            }
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
    updateDateTime();
    setInterval(updateDateTime, 1000);

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
        contentElement.style.display = 'flex';
        buttonElement.setAttribute('aria-expanded', 'true');

        showLoading(contentElement);

        if (!channelsData) {
            await loadChannelsData();
        }

        clearMessages(contentElement);

        const categoryText = buttonElement.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').trim();
        const filteredChannels = channelsData.filter(channel => channel.category === categoryText);

        if (filteredChannels.length === 0) {
            showNoChannelsMessage(contentElement);
        } else {
            filteredChannels.forEach(channel => {
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

    // --- ส่วนป้องกันการดูโค้ด ---
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());
    document.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') return;
        if (e.ctrlKey || e.metaKey) {
            // **เพิ่มเงื่อนไขนี้เพื่อป้องกัน Ctrl + U**
            if (e.key === 'u' || e.key === 'U') {
                e.preventDefault();
            }
            if (e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) e.preventDefault();
            else {
                const lowerKey = e.key.toLowerCase();
                if (['s', 'p', 'a', 'c', 'x', 'v'].includes(lowerKey)) e.preventDefault();
            }
        }
        if (e.key === 'F12') e.preventDefault();
    });
    // --- สิ้นสุดส่วนป้องกันการดูโค้ด ---
});
