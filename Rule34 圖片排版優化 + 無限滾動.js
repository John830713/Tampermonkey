// ==UserScript==
// @name         Rule34 圖片排版優化 + 無限滾動
// @namespace    http://tampermonkey.net/
// @version      3.5.0
// @description  3欄滿版、隱藏無關元件、上下無限滾動、跳頁器
// @author       You
// @match        file:///C:/Users/John/Desktop/Rule%2034_clean.html
// @match        *://*.rule34.xxx/index.php?page=post&s=list*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const PAGE_SIZE = 42;
    const ENABLE_INFINITE = !location.protocol.startsWith('file');

    let currentPid = parseInt(new URLSearchParams(location.search).get('pid') || '0', 10);
    let lowestPid = currentPid;
    let highestPid = currentPid;
    let maxPid = Infinity;
    let isLoadingNext = false;
    let isLoadingPrev = false;
    let consecutiveFailNext = 0;
    let consecutiveFailPrev = 0;
    /* ======================== CSS ======================== */
    GM_addStyle(`

        /* ── 隱藏頂部 ── */
        body.custom-layout #header,
        body.custom-layout #navbar,
        body.custom-layout #subnavbar,
        body.custom-layout .navbar,
        body.custom-layout .subnavbar,
        body.custom-layout #top-menu,
        body.custom-layout .top-menu,
        body.custom-layout #long-notice,
        body.custom-layout #notice,
        body.custom-layout #has-mail-notice,
        body.custom-layout #safe-image-notice,
        body.custom-layout table:first-child > tbody > tr:first-child,
        body.custom-layout tr:has(td[colspan]):first-of-type {
            display: none !important;
        }
        body.custom-layout td:has(> table#navbar),
        body.custom-layout td:has(> .navbar),
        body.custom-layout td:has(> .subnavbar) {
            display: none !important;
        }

        /* ── 控制面板（左上） ── */
        .layout-control-panel {
            position: fixed;
            top: 15px;
            left: 15px;
            z-index: 99999;
            display: flex;
            gap: 10px;
        }
        .layout-btn {
            padding: 10px 15px;
            color: #fff;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        #sidebar-toggle-btn { background-color: #43a047; }

        /* ── 清除廣告 ── */
        body.custom-layout .postListSidebarRight,
        body.custom-layout div:has(> ins[data-zoneid]),
        body.custom-layout div[style*="min-height"],
        body.custom-layout td[valign="top"]:last-child,
        body.custom-layout ins,
        body.custom-layout iframe[src*="ad"],
        body.custom-layout [id*="ad"],
        body.custom-layout [class*="advert"] {
            display: none !important;
        }
        body.custom-layout img[src*="chibi"] {
            display: none !important;
        }

        /* ── 強制表格全寬 ── */
        body.custom-layout table {
            width: 100vw !important;
            max-width: 100vw !important;
            border-spacing: 0 !important;
            table-layout: fixed !important;
        }

        /* ── 左側欄（抽屜） ── */
        body.custom-layout td:first-child,
        body.custom-layout .sidebar,
        body.custom-layout #sidebar {
            position: fixed !important;
            top: 55px;
            left: 0;
            width: 320px !important;
            min-width: 320px !important;
            height: calc(100vh - 55px);
            background-color: rgba(160, 210, 160, 0.98) !important;
            z-index: 99990 !important;
            overflow-y: auto !important;
            box-shadow: 5px 0 15px rgba(0,0,0,0.3);
            padding: 15px !important;
            box-sizing: border-box !important;
            display: none !important;
        }
        body.custom-layout.show-sidebar td:first-child,
        body.custom-layout.show-sidebar .sidebar,
        body.custom-layout.show-sidebar #sidebar {
            display: block !important;
        }
        body.custom-layout td:first-child li,
        body.custom-layout .sidebar li,
        body.custom-layout #sidebar li {
            display: block !important;
            white-space: nowrap !important;
            margin-bottom: 5px !important;
        }
        body.custom-layout td:first-child a,
        body.custom-layout .sidebar a {
            display: inline-block !important;
            width: auto !important;
            margin-right: 5px !important;
        }

        /* ── 主結構 ── */
        body.custom-layout #content {
            display: block !important;
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        body.custom-layout #post-list {
            display: block !important;
            width: 100vw !important;
        }
        body.custom-layout #content > .content {
            display: block !important;
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        body.custom-layout td:nth-child(2) {
            display: block !important;
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /* ── 3 欄 Grid ── */
        body.custom-layout .image-list,
        body.custom-layout .main-grid-container,
        body.custom-layout .grid-container {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            grid-auto-rows: max-content !important;
            align-items: start !important;
            gap: 4px !important;
            width: 100vw !important;
            max-width: 100vw !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
        }
        body.custom-layout .thumb,
        body.custom-layout td:nth-child(2) span.thumb {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
        }
        body.custom-layout .thumb a,
        body.custom-layout td:nth-child(2) a {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        body.custom-layout .thumb img,
        body.custom-layout td:nth-child(2) img,
        body.custom-layout .image-list img,
        body.custom-layout #content img {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            max-height: none !important;
            height: auto !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
        }

        /* ── 頁碼指示器（畫面中上方） ── */
        .page-indicator {
            position: fixed;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99995;
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(0, 0, 0, 0.75);
            padding: 6px 16px;
            border-radius: 20px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #fff;
            backdrop-filter: blur(4px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            user-select: none;
        }
        .page-indicator button {
            background: #555;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 4px 10px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            line-height: 1.4;
        }
        .page-indicator button:hover { background: #777; }
        .page-indicator button:disabled { opacity: 0.4; cursor: default; }
        .page-indicator .page-number {
            font-weight: bold;
            min-width: 80px;
            text-align: center;
        }
        .page-indicator .page-number .cur-tag {
            color: #ffd54f;
            font-size: 11px;
            margin-left: 4px;
        }
        .page-indicator input {
            width: 44px;
            padding: 3px 6px;
            border: 1px solid #666;
            border-radius: 4px;
            background: #333;
            color: #fff;
            font-size: 13px;
            text-align: center;
            outline: none;
        }
        .page-indicator input:focus { border-color: #1e88e5; }
        .page-indicator .jump-btn { background: #1e88e5; }
        .page-indicator .jump-btn:hover { background: #1565c0; }

        /* ── 載入提示 ── */
        #infinite-scroll-loading {
            grid-column: 1 / -1;
            text-align: center;
            padding: 20px;
            font-family: Arial, sans-serif;
            font-size: 16px;
            color: #888;
        }
        #infinite-scroll-loading .spinner {
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 3px solid #ddd;
            border-top: 3px solid #43a047;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        #infinite-scroll-end {
            grid-column: 1 / -1;
            text-align: center;
            padding: 20px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #aaa;
        }
    `);

    /* ====================== DOM 操作 ====================== */

    // ── 控制面板 ──
    const panel = document.createElement('div');
    panel.className = 'layout-control-panel';
    const btnSidebar = document.createElement('button');
    btnSidebar.id = 'sidebar-toggle-btn'; btnSidebar.className = 'layout-btn';
    btnSidebar.innerText = '顯示左側欄';
    panel.appendChild(btnSidebar);
    document.body.appendChild(panel);
    document.body.classList.add('custom-layout');
    document.querySelectorAll('img[src*="chibi"]').forEach(el => el.remove());

    // ── Grid 容器 ──
    function ensureGridContainer() {
        const existing = document.querySelector('.image-list');
        if (existing) return existing;
        const td = document.querySelector('td:nth-child(2)');
        if (!td) return null;
        let gc = td.querySelector('.main-grid-container');
        if (gc) return gc;
        const thumbs = td.querySelectorAll(':scope > span.thumb');
        if (thumbs.length === 0) return null;
        gc = document.createElement('div');
        gc.className = 'main-grid-container';
        const parent = thumbs[0].parentNode;
        parent.insertBefore(gc, thumbs[0]);
        thumbs.forEach(t => gc.appendChild(t));
        return gc;
    }
    ensureGridContainer();

    // ── 清除干擾屬性（不設 inline style，只用 CSS） ──
    function fixInlineStyles() {
        if (!document.body.classList.contains('custom-layout')) return;
        document.querySelectorAll('table, tr, td, div, img, span.thumb').forEach(el => {
            if (el.hasAttribute('width')) el.removeAttribute('width');
            if (el.hasAttribute('height') && el.tagName === 'IMG') el.removeAttribute('height');
        });
    }
    fixInlineStyles();

    function fixNarrowThumbs() {
        document.querySelectorAll('.thumb img').forEach(img => {
            if (img.complete && img.naturalWidth > 0) {
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio < 60 / 200) {
                    img.style.setProperty('width', 'auto', 'important');
                    img.style.setProperty('max-width', '60px', 'important');
                    img.style.setProperty('height', 'auto', 'important');
                }
            }
        });
    }

    setInterval(() => { fixInlineStyles(); fixNarrowThumbs(); }, 500);

    // ── JS 補強隱藏頂部 ──
    function hideTopElements() {
        if (!document.body.classList.contains('custom-layout')) return;
        ['#header','#navbar','#subnavbar','#long-notice','#notice','#has-mail-notice','#safe-image-notice'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
    }
    hideTopElements();
    setInterval(hideTopElements, 500);

    /* ========== 按鈕事件 ========== */
    btnSidebar.addEventListener('click', function() {
        const on = document.body.classList.toggle('show-sidebar');
        btnSidebar.innerText = on ? '隱藏左側欄' : '顯示左側欄';
        btnSidebar.style.backgroundColor = on ? '#fb8c00' : '#43a047';
    });

    /* ========== 工具函式 ========== */
    function updateQueryString(url, key, value) {
        const base = url.includes('://') ? url.split('?')[0] : url;
        const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
        params.set(key, String(value));
        return base + '?' + params.toString();
    }

    function extractThumbs(html) {
        return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('span.thumb');
    }

    function getGridContainer() {
        return document.querySelector('.image-list, .main-grid-container, .grid-container');
    }

    function pidToPage(pid) { return Math.floor(pid / PAGE_SIZE) + 1; }

    /* ========== 解析最大頁數 ========== */
    function parseMaxPage() {
        const paginator = document.querySelector('.pagination');
        if (!paginator) return;
        const links = paginator.querySelectorAll('a[href*="pid="]');
        let lastPid = 0;
        links.forEach(a => {
            const m = (a.getAttribute('href') || '').match(/[?&]pid=(\d+)/);
            if (m) { const p = parseInt(m[1],10); if (p > lastPid) lastPid = p; }
        });
        // 最後一頁的 &gt;&gt; 連結 pid 最大
        const lastLink = paginator.querySelector('a[alt="last page"]');
        if (lastLink) {
            const m = (lastLink.getAttribute('href') || '').match(/[?&]pid=(\d+)/);
            if (m) lastPid = parseInt(m[1],10);
        }
        if (lastPid > 0) maxPid = lastPid;
    }
    parseMaxPage();

    /* ========== 懸浮頁碼 + 跳頁器 ========== */
    function createPageIndicator() {
        const curPage = pidToPage(currentPid);
        const maxPage = maxPid === Infinity ? '?' : pidToPage(maxPid);

        const bar = document.createElement('div');
        bar.className = 'page-indicator';

        const btnFirst = document.createElement('button');
        btnFirst.textContent = '⇤';
        btnFirst.title = '首頁';
        btnFirst.disabled = currentPid <= 0;
        btnFirst.addEventListener('click', () => { location.href = updateQueryString(location.href, 'pid', '0'); });

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '‹';
        btnPrev.title = '上一頁';
        btnPrev.disabled = currentPid <= 0;
        btnPrev.addEventListener('click', () => {
            location.href = updateQueryString(location.href, 'pid', String(Math.max(0, currentPid - PAGE_SIZE)));
        });

        const pageLabel = document.createElement('span');
        pageLabel.className = 'page-number';
        pageLabel.innerHTML = `第 ${curPage} / ${maxPage} 頁 <span class="cur-tag">〔當前〕</span>`;

        const btnNext = document.createElement('button');
        btnNext.textContent = '›';
        btnNext.title = '下一頁';
        btnNext.addEventListener('click', () => {
            location.href = updateQueryString(location.href, 'pid', String(Math.min(maxPid, currentPid + PAGE_SIZE)));
        });

        const btnLast = document.createElement('button');
        btnLast.textContent = '⇥';
        btnLast.title = '末頁';
        btnLast.disabled = maxPid === Infinity;
        btnLast.addEventListener('click', () => { location.href = updateQueryString(location.href, 'pid', String(maxPid)); });

        const input = document.createElement('input');
        input.type = 'number'; input.min = 1; input.placeholder = '頁';
        input.addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });

        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'jump-btn'; jumpBtn.textContent = '跳頁';
        jumpBtn.addEventListener('click', jump);

        function jump() {
            const p = parseInt(input.value, 10);
            if (isNaN(p) || p < 1) return;
            const newPid = Math.min(maxPid, (p - 1) * PAGE_SIZE);
            location.href = updateQueryString(location.href, 'pid', String(Math.max(0, newPid)));
        }

        bar.append(btnFirst, btnPrev, pageLabel, btnNext, btnLast, input, jumpBtn);
        document.body.appendChild(bar);

        // 更新函式給無限滾動呼叫
        bar.__update = function(pid) {
            const p = pidToPage(pid);
            const max = maxPid === Infinity ? '?' : pidToPage(maxPid);
            const isBase = pid === currentPid;
            pageLabel.innerHTML = `第 ${p} / ${max} 頁${isBase ? ' <span class="cur-tag">〔當前〕</span>' : ''}`;
            btnFirst.disabled = pid <= 0;
            btnPrev.disabled = pid <= 0;
            btnLast.disabled = maxPid === Infinity || pid >= maxPid;
        };
    }
    createPageIndicator();

    /* ========== 標記現有縮圖的頁碼 ========== */
    document.querySelectorAll('.thumb').forEach(t => {
        if (!t.dataset.pid) t.dataset.pid = String(currentPid);
    });

    /* ========== 無限滾動（上下） ========== */
    if (ENABLE_INFINITE) {

        const loadedPids = new Set([currentPid]);
        const MAX_FAILURES = 3;

        function isHtmlValid(html) {
            return html.includes('<span') && html.includes('class="thumb"');
        }

        function loadPrevPage() {
            const prevPid = Math.max(0, lowestPid - PAGE_SIZE);
            if (isLoadingPrev || prevPid < 0 || loadedPids.has(prevPid) || consecutiveFailPrev >= MAX_FAILURES) return;
            isLoadingPrev = true;
            const url = updateQueryString(location.href, 'pid', prevPid);
            const container = getGridContainer();
            if (!container) { isLoadingPrev = false; return; }

            const oldScrollH = document.documentElement.scrollHeight;
            const oldScrollY = window.scrollY || window.pageYOffset;

            const loadEl = document.createElement('div');
            loadEl.id = 'infinite-scroll-loading';
            loadEl.innerHTML = '<span class="spinner"></span>載入上一頁...';
            container.insertBefore(loadEl, container.firstChild);

            GM_xmlhttpRequest({
                method: 'GET', url: url,
                onload: function(res) {
                    loadEl.remove();
                    if (res.status >= 200 && res.status < 400 && isHtmlValid(res.responseText)) {
                        const thumbs = extractThumbs(res.responseText);
                        if (thumbs.length > 0) {
                            consecutiveFailPrev = 0;
                            const frag = document.createDocumentFragment();
                            thumbs.forEach(thumb => {
                                const clone = thumb.cloneNode(true);
                                clone.dataset.pid = String(prevPid);
                                frag.appendChild(clone);
                            });
                            container.insertBefore(frag, container.firstChild);
                            loadedPids.add(prevPid);
                            lowestPid = prevPid;

                            const addedH = document.documentElement.scrollHeight - oldScrollH;
                            window.scrollTo(0, oldScrollY + addedH);
                        } else {
                            consecutiveFailPrev++;
                        }
                    } else {
                        consecutiveFailPrev++;
                    }
                    isLoadingPrev = false;
                },
                onerror: function() {
                    loadEl.remove(); isLoadingPrev = false; consecutiveFailPrev++;
                }
            });
        }

        function loadNextPage() {
            const nextPid = highestPid + PAGE_SIZE;
            if (isLoadingNext || loadedPids.has(nextPid) || nextPid > maxPid || consecutiveFailNext >= MAX_FAILURES) return;
            isLoadingNext = true;
            const url = updateQueryString(location.href, 'pid', nextPid);
            const container = getGridContainer();
            if (!container) { isLoadingNext = false; return; }

            const loadEl = document.createElement('div');
            loadEl.id = 'infinite-scroll-loading';
            loadEl.innerHTML = '<span class="spinner"></span>載入下一頁...';
            container.appendChild(loadEl);

            GM_xmlhttpRequest({
                method: 'GET', url: url,
                onload: function(res) {
                    loadEl.remove();
                    if (res.status >= 200 && res.status < 400 && isHtmlValid(res.responseText)) {
                        const thumbs = extractThumbs(res.responseText);
                        if (thumbs.length > 0) {
                            consecutiveFailNext = 0;
                            const frag = document.createDocumentFragment();
                            thumbs.forEach(thumb => {
                                const clone = thumb.cloneNode(true);
                                clone.dataset.pid = String(nextPid);
                                frag.appendChild(clone);
                            });
                            container.appendChild(frag);
                            loadedPids.add(nextPid);
                            highestPid = nextPid;

                            // 已達已知最大 pid 或多個空回應
                            if (highestPid >= maxPid || consecutiveFailNext >= MAX_FAILURES) {
                                const end = document.createElement('div');
                                end.id = 'infinite-scroll-end';
                                end.textContent = '— 已達最後一頁 —';
                                container.appendChild(end);
                            }
                        } else {
                            consecutiveFailNext++;
                        }
                    } else {
                        consecutiveFailNext++;
                    }
                    isLoadingNext = false;
                },
                onerror: function() {
                    loadEl.remove(); isLoadingNext = false; consecutiveFailNext++;
                }
            });
        }

        // 根據捲軸位置更新頁碼顯示
        function syncPageIndicator() {
            const thumbs = document.querySelectorAll('.thumb[data-pid]');
            if (thumbs.length === 0) return;
            const viewportMid = window.scrollY + window.innerHeight / 2;
            let best = currentPid, bestDist = Infinity;
            for (const t of thumbs) {
                const dist = Math.abs(t.offsetTop + t.offsetHeight / 2 - viewportMid);
                if (dist < bestDist) { bestDist = dist; best = parseInt(t.dataset.pid, 10); }
            }
            const pi = document.querySelector('.page-indicator');
            if (pi && pi.__update) pi.__update(best);
        }

        // 監聽滾輪
        let scrollTimer = null;
        window.addEventListener('scroll', function() {
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(function() {
                const y = window.scrollY || window.pageYOffset;
                const dh = document.documentElement.scrollHeight;
                const vh = window.innerHeight;

                if (y <= 200) loadPrevPage();
                if (y >= dh - vh - 400) loadNextPage();
                syncPageIndicator();
            }, 200);
        });
    }
})();
