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
        // ลบ channel links เก่าออกก่อนเสมอเมื่อจะโหลดใหม่
        const existingChannelLinks = container.querySelectorAll('.channel-link');
        existingChannelLinks.forEach(link => link.remove());
        // ตรวจสอบและซ่อนข้อความ error เก่า หากมี
        const errorMessageDiv = container.querySelector('.error-display-message');
        if (errorMessageDiv) {
            errorMessageDiv.classList.remove('active');
        }
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
        const errorMessageDiv = container.querySelector('.error-display-message');
        if (errorMessageDiv) {
            errorMessageDiv.classList.remove('active');
        }
    }

    /**
     * แสดงข้อความข้อผิดพลาดใน container ที่กำหนด
     * @param {HTMLElement} container - องค์ประกอบ container ที่จะแสดงข้อความผิดพลาด
     * @param {string} message - ข้อความผิดพลาดที่จะแสดง
     */
    function displayErrorMessage(container, message) {
        hideLoading(container);
        container.querySelector('.no-channels-message').classList.remove('active'); // ซ่อนข้อความไม่พบช่อง
        
        let errorMessageDiv = container.querySelector('.error-display-message');
        if (!errorMessageDiv) {
            errorMessageDiv = document.createElement('div');
            errorMessageDiv.classList.add('error-display-message');
            errorMessageDiv.style.cssText = `color: ${redAccentColor}; text-align: center; padding: 20px;`;
            container.appendChild(errorMessageDiv);
        }
        errorMessageDiv.textContent = message;
        errorMessageDiv.classList.add('active');
    }

    /**
     * โหลดข้อมูลจากไฟล์ JSON ที่ระบุ
     * @param {string} fileName - ชื่อไฟล์ JSON ที่จะโหลด (เช่น 'channels.json')
     * @returns {Promise<Array|Object>} - ข้อมูลที่โหลดมา
     * @throws {Error} - หากการโหลดหรือการแยกวิเคราะห์ข้อมูลล้มเหลว
     */
    async function fetchData(fileName) {
        try {
            const response = await fetch(fileName);
            if (!response.ok) {
                const errorText = response.status === 404
                    ? `File not found: ${fileName} (HTTP 404). Please ensure the file exists or the path is correct.`
                    : `Failed to load ${fileName}: HTTP error! Status: ${response.status}.`;
                throw new Error(errorText);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Error loading or parsing ${fileName}:`, error);
            throw error; // ส่งต่อข้อผิดพลาดเพื่อให้ Promise.all จัดการ
        }
    }

    /**
     * โหลดข้อมูลช่องจาก channels.json
     * @returns {Promise<void>}
     */
    async function loadChannelsData() {
        if (channelsData) return;
        try {
            const data = await fetchData('channels.json');
            if (!Array.isArray(data)) {
                throw new Error('Fetched data from channels.json is not an array. Please ensure the JSON is an array of channel objects.');
            }
            channelsData = data;
        } catch (error) {
            console.error('Final error handling for channels.json:', error);
            // แสดงข้อความข้อผิดพลาดในทุกหมวดหมู่
            Object.values(categoryContentMap).forEach(container => {
                displayErrorMessage(container, `เกิดข้อผิดพลาดในการโหลดช่อง: ${error.message}\nโปรดลองใหม่อีกครั้งในภายหลัง`);
            });
            channelsData = []; // กำหนดให้เป็น array ว่างเพื่อหลีกเลี่ยงการประมวลผลซ้ำ
        }
    }

    /**
     * โหลดข้อมูลข้อความจาก texts.json
     * @returns {Promise<void>}
     */
    async function loadTextsData() {
        if (textsData) return;
        try {
            const data = await fetchData('texts.json');
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
            console.error('Final error handling for texts.json:', error);
            textsData = {}; // กำหนดเป็น object ว่างเมื่อเกิดข้อผิดพลาด
            if (runningTextElement) runningTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความประกาศ!";
            if (footerTextElement) footerTextElement.textContent = "เกิดข้อผิดพลาดในการโหลดข้อความท้ายหน้า!";
        }
    }

    // โหลดข้อมูลเริ่มต้นทั้งหมดพร้อมกัน
    Promise.all([loadChannelsData(), loadTextsData()])
        .then(() => {
            console.log('All initial data (channels and texts) loaded successfully!');
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
            const categoryName = categoryButton ? categoryButton.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim() : 'Unknown Category';
            
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
     * เปิด Accordion ที่กำหนดและโหลดช่องที่เกี่ยวข้อง
     * @param {HTMLElement} contentElement - องค์ประกอบ content ของ Accordion
     * @param {HTMLElement} buttonElement - องค์ประกอบ button ของ Accordion
     */
    async function openAccordion(contentElement, buttonElement) {
        // ต้องตั้งค่า display: flex ก่อน เพื่อให้ scrollHeight คำนวณได้ถูกต้อง
        contentElement.style.display = 'flex'; 
        buttonElement.setAttribute('aria-expanded', 'true');

        showLoading(contentElement); // แสดง loading และลบ channel links เก่า

        if (!channelsData) {
            await loadChannelsData(); // โหลดข้อมูลหากยังไม่ได้โหลด
        }

        // หากยังคงมีข้อผิดพลาดหลังจากพยายามโหลด ให้หยุดทำงาน
        if (!channelsData || channelsData.length === 0) {
            hideLoading(contentElement);
            // ข้อความ error จะถูกแสดงไปแล้วใน loadChannelsData หากเกิดข้อผิดพลาด
            return; 
        }

        clearMessages(contentElement); // ล้างข้อความสถานะหลังจากโหลดข้อมูลสำเร็จ (หรือจัดการข้อผิดพลาดไปแล้ว)

        // ลบ emoji และ trim ช่องว่างสำหรับชื่อหมวดหมู่
        const categoryText = buttonElement.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim();
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

        // ใช้ requestAnimationFrame เพื่อให้แน่ใจว่า DOM ได้รับการอัปเดตก่อนคำนวณความสูง
        requestAnimationFrame(() => {
            const actualContentHeight = contentElement.scrollHeight;
            contentElement.style.maxHeight = (actualContentHeight + 16) + 'px'; // +16px เพื่อรองรับ padding/margin
            contentElement.classList.add('show');
        });
        hideLoading(contentElement); // ซ่อน loading เมื่อช่องถูกแสดง
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

    // --- ส่วนป้องกันการดูโค้ด (Code View Protection) ---
    // ข้อควรระวัง: ฟังก์ชันเหล่านี้มีวัตถุประสงค์เพื่อลดโอกาสในการเข้าถึงซอร์สโค้ดโดยผู้ใช้ทั่วไป
    // แต่ไม่สามารถป้องกันผู้ใช้ที่มีความรู้ทางเทคนิคสูงได้อย่างสมบูรณ์
    // และอาจส่งผลต่อประสบการณ์ผู้ใช้ในการใช้งานเบราว์เซอร์ปกติ

    // ป้องกันการคลิกขวา
    document.addEventListener('contextmenu', e => {
        e.preventDefault();
    });

    // ป้องกันการเลือกข้อความ
    document.addEventListener('selectstart', e => {
        e.preventDefault();
    });

    // ป้องกันการลากและวาง
    document.addEventListener('dragstart', e => {
        e.preventDefault();
    });
    document.addEventListener('drop', e => {
        e.preventDefault();
    });

    // ป้องกันแป้นพิมพ์ลัดบางอย่าง
    document.addEventListener('keydown', e => {
        // อนุญาตแป้น Spacebar และ Enter เพื่อให้ยังคงใช้งานปกติได้
        if (e.key === ' ' || e.key === 'Enter') {
            return;
        }

        // ดักจับแป้นพิมพ์ลัด Developer Tools และ View Source ที่สำคัญ
        // e.ctrlKey สำหรับ Windows/Linux, e.metaKey สำหรับ macOS (ปุ่ม Command)

        // 1. ป้องกัน F12 (Developer Tools)
        if (e.key === 'F12') {
            e.preventDefault();
            return;
        }

        // 2. ป้องกัน Ctrl/Cmd + Shift + I/J/C (Developer Tools)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey &&
            (e.key === 'I' || e.key === 'J' || e.key === 'C')) {
            e.preventDefault();
            return;
        }

        // 3. ป้องกัน Ctrl/Cmd + U (View Source)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
            e.preventDefault();
            return;
        }

        // 4. ป้องกันแป้นพิมพ์ลัดพื้นฐานอื่นๆ ที่เกี่ยวข้องกับการจัดการเนื้อหา
        if (e.ctrlKey || e.metaKey) {
            const lowerKey = e.key.toLowerCase();
            if (['s', 'p', 'a', 'c', 'x', 'v'].includes(lowerKey)) {
                e.preventDefault();
                return;
            }
        }
    });

    // --- การตรวจจับ Developer Tools เพิ่มเติม ---
    // วิธีนี้พยายามตรวจจับว่า DevTools เปิดอยู่หรือไม่ โดยการตรวจสอบขนาดหน้าต่าง
    // หากพบว่าเปิดอยู่ จะล้างเนื้อหาหน้าและแสดงข้อความเตือน

    const threshold = 160; // ค่าความแตกต่างของขนาดหน้าต่างที่คาดว่าเกิดจาก DevTools (ปรับได้)
    let devtoolsOpen = false;

    function checkDevTools() {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        // ตรวจสอบแนวตั้งและแนวนอน
        if (widthThreshold || heightThreshold) {
            if (!devtoolsOpen) {
                devtoolsOpen = true;
                // ล้างเนื้อหาหน้าเว็บและแสดงข้อความเตือน
                document.body.innerHTML = `<div style="font-size: 2em; text-align: center; margin-top: 100px; color: ${redAccentColor}; height: 100vh; display: flex; align-items: center; justify-content: center;">
                                                ขออภัย ไม่สามารถเข้าถึงหน้านี้ได้เมื่อ Developer Tools เปิดอยู่
                                            </div>`;
            }
        } else {
            if (devtoolsOpen) {
                devtoolsOpen = false;
                // เมื่อ DevTools ปิด คุณอาจต้องรีโหลดหน้าเพื่อคืนค่าเนื้อหาเดิม
                location.reload(); // เปิดคอมเมนต์บรรทัดนี้หากต้องการให้รีโหลดอัตโนมัติ
            }
        }
    }

    // ตรวจสอบทันทีเมื่อโหลดหน้าและตรวจสอบเมื่อมีการรีไซซ์หรือทุกๆ ช่วงเวลา
    checkDevTools();
    setInterval(checkDevTools, 500); // ตรวจสอบทุกๆ 500ms
    window.addEventListener('resize', checkDevTools); // ตรวจสอบเมื่อขนาดหน้าต่างเปลี่ยน

    // --- สิ้นสุดส่วนป้องกันการดูโค้ด ---
});
