document.addEventListener('DOMContentLoaded', function() {
    const datetimeDisplay = document.getElementById('current-datetime');
    const runningTextElement = document.getElementById('running-text');
    const footerTextElement = document.getElementById('footer-text');
    const clearCacheButton = document.getElementById('clear-cache-button'); // Get the clear cache button

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

    function showLoading(container) {
        container.querySelector('.loading-indicator').classList.add('active');
        container.querySelector('.no-channels-message').classList.remove('active');
        Array.from(container.children).forEach(child => {
            if (!child.classList.contains('loading-indicator') && !child.classList.contains('no-channels-message')) {
                child.remove();
            }
        });
    }

    function hideLoading(container) {
        container.querySelector('.loading-indicator').classList.remove('active');
    }

    function showNoChannelsMessage(container) {
        hideLoading(container);
        container.querySelector('.no-channels-message').classList.add('active');
    }

    function clearMessages(container) {
        container.querySelector('.loading-indicator').classList.remove('active');
        container.querySelector('.no-channels-message').classList.remove('active');
    }

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
                // Check if container exists before modifying innerHTML
                if (container) {
                    container.innerHTML = `<div class="no-channels-message active" style="color: ${redAccentColor};">
                                            เกิดข้อผิดพลาดในการโหลดช่อง: ${error.message}<br>โปรดลองใหม่อีกครั้งในภายหลัง
                                        </div>`;
                }
            });
            channelsData = [];
        }
    }

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
            // Removed emojis from category name extraction for gtag
            const categoryName = categoryButton ? categoryButton.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}\u{2600}-\u{26FF}]/gu, '').trim() : 'Unknown Category';
            if (typeof gtag === 'function') {
                gtag('event', 'channel_click', { 'channel_name': channelName, 'category': categoryName, 'link_url': url });
            }
            setTimeout(() => { if (url) window.location.href = url; }, 200);
        }
    });

    function formatDateTime(date) {
        // Updated formatting to match "วันพฤหัสบดีที่ 26 มิถุนายน 2568 10:37"
        const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false };

        const datePart = date.toLocaleDateString('th-TH', optionsDate).replace('พ.ศ.', '').trim();
        const timePart = date.toLocaleTimeString('th-TH', optionsTime);

        return { display: `วัน${datePart} ${timePart}`, iso: date.toISOString() };
    }

    function updateDateTime() {
        const now = new Date();
        const formatted = formatDateTime(now);
        datetimeDisplay.textContent = formatted.display;
        datetimeDisplay.setAttribute('datetime', formatted.iso);
    }
    updateDateTime(); // Call immediately on load
    setInterval(updateDateTime, 1000); // Update every second

    // Clear Cache button logic (can be used for refresh)
    const clearCacheButton = document.getElementById('clear-cache-button');
    if (clearCacheButton) {
        clearCacheButton.addEventListener('click', () => {
            if (confirm('คุณต้องการรีเฟรชหน้าเว็บหรือไม่?')) { // Changed confirmation text
                console.log('Reloading the page...');
                // Forces a reload from the server, bypassing cache (same as a hard refresh)
                window.location.reload(true);
                // Optionally add an alert after reload, but usually not needed as page reloads
                // alert('หน้าเว็บถูกรีเฟรชแล้ว');
            }
        });
    }


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
        contentElement.style.paddingTop = '0';
        contentElement.style.paddingBottom = '0';
        buttonElement.setAttribute('aria-expanded', 'false');
    }

    async function openAccordion(contentElement, buttonElement) {
        contentElement.style.display = 'flex';
        buttonElement.setAttribute('aria-expanded', 'true');

        showLoading(contentElement);

        if (!channelsData) {
            await loadChannelsData();
        }

        clearMessages(contentElement);

        const categoryText = buttonElement.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2000}-\u{2BFF}\u{2600}-\u{26FF}]/gu, '').trim(); // Adjusted regex for emojis
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
                img.src = channel.img_src; // ใช้ img_src เพียงอย่างเดียว
                img.alt = channel.name;
                img.loading = "lazy";
                link.appendChild(img);
                contentElement.appendChild(link);
            });
        }

        requestAnimationFrame(() => {
            // Need to set a slightly larger max-height to account for padding and ensure all content fits
            const actualContentHeight = contentElement.scrollHeight;
            contentElement.style.maxHeight = (actualContentHeight + 16) + 'px'; // Add extra space for padding/gap
            contentElement.classList.add('show');
            contentElement.style.paddingTop = 'var(--spacing-sm)'; // Apply padding after calculating max-height
            contentElement.style.paddingBottom = 'var(--spacing-sm)'; // Apply padding after calculating max-height
        });
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
        // Allow space and Enter key presses
        if (e.key === ' ' || e.key === 'Enter') return;

        // Prevent common developer tool shortcuts
        if (e.ctrlKey || e.metaKey) { // Ctrl for Windows/Linux, Meta (Cmd) for Mac
            if (e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) { // Ctrl+Shift+I/J/C
                e.preventDefault();
            } else {
                const lowerKey = e.key.toLowerCase();
                // Ctrl+S (Save), Ctrl+P (Print), Ctrl+U (View Source), Ctrl+A (Select All), Ctrl+C (Copy), Ctrl+X (Cut), Ctrl+V (Paste)
                if (['s', 'p', 'u', 'a', 'c', 'x', 'v'].includes(lowerKey)) {
                    e.preventDefault();
                }
            }
        }
        if (e.key === 'F12') e.preventDefault(); // Prevent F12 key for developer tools
    });
    // --- สิ้นสุดส่วนป้องกันการดูโค้ด ---
});
