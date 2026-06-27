// ==UserScript==
// @name         ExHentai 動態排版
// @version      1.0
// @match        https://exhentai.org/g/*
// @match        https://e-hentai.org/g/*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let columns = parseInt(localStorage.getItem('eh-col-count')) || 4;

    // 1. 樣式設定：包含新增的頁碼標籤 (.eh-page-badge)
    GM_addStyle(`
        #layout-control-panel {
            position: fixed; top: 15px; left: 15px; z-index: 30000;
            background: rgba(30, 30, 35, 0.9); border: 1px solid #5C0D12; padding: 10px;
            border-radius: 8px; color: #fff; display: flex; align-items: center; gap: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        }
        .btn-ctrl {
            background: #4f535b; border: none; color: white; width: 32px; height: 32px;
            cursor: pointer; font-size: 20px; border-radius: 6px;
        }
        .btn-ctrl:hover { background: #5C0D12; }

        #gdt {
            display: grid !important;
            grid-template-columns: repeat(${columns}, 1fr) !important;
            gap: 15px !important;
            width: 98% !important;
            max-width: none !important;
            margin: 20px auto !important;
            padding: 10px !important;
            box-sizing: border-box !important;
            justify-items: center !important;
        }

        #gdt a {
            position: relative !important; /* 讓頁碼可以相對於連結定位 */
            width: 100% !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
            margin: 0 !important;
            height: auto !important;
            text-decoration: none !important;
        }

        /* 頁碼標籤樣式 */
        .eh-page-badge {
            position: absolute;
            top: 5px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            font-family: sans-serif;
            z-index: 10;
            pointer-events: none; /* 不影響點擊圖片 */
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        #gdt a:hover .eh-page-badge {
            opacity: 1;
            background: #5C0D12;
        }

        #gdt a > div {
            margin: 0 !important;
            transform-origin: top center !important;
        }

        .c, .🔓-full-width br { display: none !important; }
        .gm { max-width: none !important; width: 100% !important; }
    `);

    const panel = document.createElement('div');
    panel.id = 'layout-control-panel';
    panel.innerHTML = `
        <button class="btn-ctrl" id="col-minus">−</button>
        <span id="col-display" style="min-width:60px; text-align:center; font-weight:bold;">${columns} 欄</span>
        <button class="btn-ctrl" id="col-plus">+</button>
    `;
    document.body.appendChild(panel);

    function applyLayout() {
        const gdt = document.getElementById('gdt');
        const thumbs = document.querySelectorAll('#gdt a');
        if (!gdt || thumbs.length === 0) return;

        // 【修正核心】使用 replace 移除逗號，確保能正確解析 1,000 以上的數字
        const gpcElement = document.querySelector('.gpc');
        const totalPages = gpcElement ? (gpcElement.innerText.replace(/,/g, '').match(/of (\d+) images/) || [])[1] : '?';

        gdt.style.setProperty('grid-template-columns', `repeat(${columns}, 1fr)`, 'important');
        document.getElementById('col-display').innerText = `${columns} 欄`;
        localStorage.setItem('eh-col-count', columns);

        const containerWidth = gdt.offsetWidth;
        const targetCellWidth = (containerWidth / columns) - 20;
        const zoomRatio = targetCellWidth / 200;

        thumbs.forEach(a => {
            const div = a.querySelector('div');
            if (div) {
                div.style.setProperty('zoom', zoomRatio, 'important');
            }

            // 處理頁碼標籤
            let badge = a.querySelector('.eh-page-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'eh-page-badge';
                a.appendChild(badge);
            }

            // 從連結 href 中提取編號 (例如 ...-1, ...-2)
            const pageNum = a.href.split('-').pop();
            badge.innerText = `${pageNum} / ${totalPages}`;

            // 根據縮放比例微調標籤位置，確保它始終在圖片上方
            badge.style.top = "5px";
        });
    }

    document.getElementById('col-plus').onclick = () => { if (columns < 12) { columns++; applyLayout(); } };
    document.getElementById('col-minus').onclick = () => { if (columns > 1) { columns--; applyLayout(); } };

    window.addEventListener('resize', applyLayout);

    // 監控加載（處理無限捲動或動態加載）
    const observer = new MutationObserver(applyLayout);
    observer.observe(document.getElementById('gdt'), { childList: true });

    setTimeout(applyLayout, 500);
})();