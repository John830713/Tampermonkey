// ==UserScript==
// @name         nHentai Dynamic Layout
// @version      2.99
// @updateURL    http://localhost:8921/serve/nhentai-dynamic-layout.js
// @downloadURL  http://localhost:8921/serve/nhentai-dynamic-layout.js
// @match        https://nhentai.net/
// @match        https://nhentai.net/g/*
// @match        https://nhentai.net/search*
// @match        https://nhentai.net/tag/*
// @match        https://nhentai.net/artist/*
// @match        https://nhentai.net/character/*
// @match        https://nhentai.net/parody/*
// @match        https://nhentai.net/group/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const PAGE_SIZE = 25;
    let columns = parseInt(localStorage.getItem('nh-col-count')) || 4;
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;
    let numPages = 0;
    let currentQuery = '';
    let visiblePage = 1;
    const isGallery = /^\/g\//.test(location.pathname);
    const isListing = /^\/(search|tag|artist|character|parody|group)/.test(location.pathname);
    const isHome = location.pathname === '/';

    function parseCurrentQuery() {
        if (location.pathname === '/search') {
            const p = new URLSearchParams(location.search);
            return { q: p.get('q') || '', sort: p.get('sort') || 'date' };
        }
        const m = location.pathname.match(/^\/(tag|artist|character|parody|group)\/(.+)/);
        if (m) return { q: `${m[1]}:"${m[2]}"`, sort: 'date' };
        return null;
    }

    GM_addStyle(`
        #nh-layout-control {
            position: fixed; top: 15px; left: 15px; z-index: 99999;
            background: rgba(30,30,35,0.92); border: 1px solid #333;
            padding: 8px 12px; border-radius: 8px; color: #fff;
            display: flex; align-items: center; gap: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); font-family: sans-serif; font-size: 14px;
            flex-wrap: wrap; max-width: calc(100vw - 30px);
        }
        #nh-layout-control button {
            background: #4f535b; border: none; color: white; width: 30px; height: 30px;
            cursor: pointer; font-size: 18px; border-radius: 6px; line-height: 30px;
        }
        #nh-layout-control button:hover { background: #d44141; }
        #nh-layout-control .nh-col-label { min-width: 50px; text-align: center; font-weight: bold; }
        .nh-hide-signin nav .menu-sign-in, .nh-hide-signin nav .menu-register { display: none !important; }

        /* 跳頁器 — 整合進導航欄 flex 中間 */
        #nh-page-indicator {
            display: flex; align-items: center; gap: 3px;
            font-family: sans-serif; font-size: 12px;
            pointer-events: auto; margin-left: 12px;
        }
        .pi-btn {
            background: #444; border: none; color: #eee; padding: 2px 6px;
            border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1.4;
        }
        .pi-btn:disabled { opacity: 0.4; cursor: default; }
        .pi-btn:hover:not(:disabled) { background: #555; }
        .pi-label {
            color: #ccc; padding: 0 4px; white-space: nowrap; min-width: 40px; text-align: center; font-size: 12px;
        }
        .pi-input {
            width: 32px; background: #222; border: 1px solid #555; color: #eee;
            border-radius: 4px; padding: 2px 3px; font-size: 11px; text-align: center;
        }
        .pi-jump { background: #d44141; }
        .pi-jump:hover { background: #e55555 !important; }

        .nh-gallery-float-hidden { display: none !important; }
        #nh-info-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6); z-index: 99998;
            display: none; align-items: flex-start; justify-content: center;
            padding-top: 60px; overflow-y: auto;
        }
        #nh-info-modal-overlay.nh-visible { display: flex; }
        #nh-info-modal {
            background: #1a1a2e; color: #eee; border: 1px solid #333;
            border-radius: 8px; padding: 16px; max-width: 900px; width: 90%;
            max-height: calc(100vh - 100px); overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: sans-serif; font-size: 13px;
        }
        #nh-info-modal .nh-modal-close {
            position: sticky; top: 0; float: right;
            background: #444; border: none; color: #fff;
            width: 28px; height: 28px; border-radius: 50%;
            cursor: pointer; font-size: 16px; z-index: 1;
        }
        #nh-info-modal .nh-modal-close:hover { background: #d44141; }
        #nh-page-badge {
            position: fixed; z-index: 100000;
            background: rgba(0,0,0,0.75); color: #fff;
            padding: 4px 10px; border-radius: 4px;
            font-family: sans-serif; font-size: 13px;
            pointer-events: none; display: none;
        }
        #nh-layout-control .nh-sep {
            width: 1px; height: 24px; background: #555; margin: 0 4px;
        }
        #nh-layout-control .nh-info-btn {
            background: #1e88e5; font-size: 13px; width: auto; padding: 0 10px; height: 30px; line-height: 30px;
        }
        #nh-layout-control .nh-info-btn:hover { background: #1565c0; }

        .nh-gallery #thumbnail-container > .thumbs,
        .nh-gallery #bigcontainer > .thumbs,
        .nh-grid .gallery-grid,
        .nh-sticky-nav .container.index-container {
            display: grid !important;
            gap: 12px !important;
            max-width: none !important;
        }
        .nh-gallery #thumbnail-container > .thumbs .thumb-container,
        .nh-gallery #bigcontainer > .thumbs .thumb-container,
        .nh-grid .gallery {
            width: 100% !important;
            margin: 0 !important;
        }
        .nh-gallery #thumbnail-container > .thumbs .thumb-container a,
        .nh-gallery #bigcontainer > .thumbs .thumb-container a,
        .nh-grid .gallery a.cover {
            display: block !important;
            width: 100% !important;
            overflow: hidden !important;
        }
        .nh-grid .pagination { display: none !important; }
        .nh-gallery .thumbs .thumb-container img {
            width: 100% !important;
            height: auto !important;
        }

        #nh-infinite-status {
            text-align: center; padding: 16px; color: #888;
            font-family: sans-serif; font-size: 13px; clear: both;
        }
        .nh-sticky-nav nav {
            position: sticky !important;
            top: 0 !important;
            z-index: 99995 !important;
            background: #111 !important;
            display: flex !important;
            align-items: center !important;
        }

    `);

    // ─── Rate-limited request queue ──────────────────────────
    let reqQueue = [];
    let reqBusy = false;
    const REQ_DELAY = 800;

    function nhRequest(opts) {
        reqQueue.push(opts);
        if (!reqBusy) processNext();
    }

    function processNext() {
        if (reqQueue.length === 0) { reqBusy = false; return; }
        reqBusy = true;
        const o = reqQueue.shift();
        setTimeout(function() {
            GM_xmlhttpRequest({
                method: o.method || 'GET',
                url: o.url,
                headers: o.headers,
                data: o.data,
                timeout: o.timeout,
                onload: function(r) {
                    reqBusy = false;
                    if (o.onload) o.onload(r);
                    processNext();
                },
                onerror: function(err) {
                    reqBusy = false;
                    if (o.onerror) o.onerror(err);
                    processNext();
                },
                ontimeout: function() {
                    reqBusy = false;
                    if (o.ontimeout) o.ontimeout();
                    processNext();
                }
            });
        }, REQ_DELAY);
    }

    // ─── Floating page indicator (listing pages) ──────────────

    function createPageIndicator() {
        var nav = document.querySelector('#app > nav');
        if (!nav) return;
        var pi = document.createElement('div');
        pi.id = 'nh-page-indicator';
        pi.innerHTML =
            '<button class="pi-btn" id="pi-first">⇤</button>' +
            '<button class="pi-btn" id="pi-prev">‹</button>' +
            '<span class="pi-label" id="pi-label">- / -</span>' +
            '<button class="pi-btn" id="pi-next">›</button>' +
            '<button class="pi-btn" id="pi-last">⇥</button>' +
            '<input class="pi-input" id="pi-input" type="number" min="1" placeholder="頁">' +
            '<button class="pi-btn pi-jump" id="pi-jump">跳</button>';
        var ref = document.getElementById('hamburger') || nav.lastChild;
        nav.insertBefore(pi, ref);

        document.getElementById('pi-first').onclick = function() { goToPage(1); };
        document.getElementById('pi-prev').onclick = function() { goToPage(Math.max(1, currentPage - 1)); };
        document.getElementById('pi-next').onclick = function() { goToPage(currentPage + 1); };
        document.getElementById('pi-last').onclick = function() { goToPage(numPages); };
        document.getElementById('pi-jump').onclick = function() {
            var p = parseInt(document.getElementById('pi-input').value, 10);
            if (!isNaN(p) && p >= 1) goToPage(p);
        };
        document.getElementById('pi-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pi-jump').click(); }
        });
        updatePageIndicator();
    }

    function updatePageIndicator() {
        var label = document.getElementById('pi-label');
        if (!label) return;
        var maxStr = numPages > 0 ? String(numPages) : '?';
        label.textContent = visiblePage + ' / ' + maxStr;
        document.getElementById('pi-first').disabled = currentPage <= 1;
        document.getElementById('pi-prev').disabled = currentPage <= 1;
        document.getElementById('pi-next').disabled = numPages > 0 && currentPage >= numPages;
        document.getElementById('pi-last').disabled = numPages === 0 || currentPage >= numPages;
    }

    function goToPage(target) {
        if (typeof target === 'object') target = target.currentTarget._page;
        if (target < 1) target = 1;
        if (numPages > 0 && target > numPages) target = numPages;
        if (target === currentPage) return;

        var params = new URLSearchParams();
        if (currentQuery) { params.set('query', currentQuery); params.set('sort', 'date'); }
        params.set('page', String(target));

        isLoading = true;
        addInfiniteStatus('載入第 ' + target + ' 頁...');

        nhRequest({
            method: 'GET',
            url: '/api/v2/search?' + params.toString(),
            onload: function(r) {
                try {
                    var data = JSON.parse(r.responseText);
                    var results = data.result || [];
                    if (results.length === 0) { hasMore = false; addInfiniteStatus('— 無更多內容 —'); isLoading = false; return; }
                    currentPage = target;
                    numPages = data.num_pages || 0;

                    var grid = document.querySelector('.gallery-grid');
                    if (!grid) { isLoading = false; return; }
                    grid.innerHTML = '';

                    results.forEach(function(item) {
                        var div = document.createElement('div');
                        div.className = 'gallery lang-' + (item.tag_ids.includes(17249) ? 'cn' : 'jp');
                        div.dataset.galleryId = item.id;
                        div.dataset.page = String(currentPage);
                        var cover = document.createElement('a');
                        cover.href = '/g/' + item.id + '/';
                        cover.className = 'cover';
                        cover.style.padding = '0 0 141.6% 0';
                        var img = document.createElement('img');
                        img.loading = 'lazy';
                        img.alt = item.english_title || item.japanese_title || '';
                        img.className = 'lazyload';
                        img.src = 'https://t2.nhentai.net/' + item.thumbnail;
                        cover.appendChild(img);
                        var cap = document.createElement('div');
                        cap.className = 'caption';
                        cap.textContent = item.english_title || item.japanese_title || '';
                        cover.appendChild(cap);
                        div.appendChild(cover);
                        grid.appendChild(div);
                    });

                    hasMore = currentPage < numPages;
                    addInfiniteStatus('第 ' + currentPage + ' / ' + numPages + ' 頁');
                    applyGrid();
                    updatePageIndicator();
                    isLoading = false;
                    window.scrollTo(0, 0);
                } catch(e) { addInfiniteStatus('解析錯誤: ' + e.message); isLoading = false; }
            },
            onerror: function() { addInfiniteStatus('載入失敗'); isLoading = false; }
        });
    }

    // ─── Column control panel ─────────────────────────────────

    const panel = document.createElement('div');
    panel.id = 'nh-layout-control';
    if (isGallery) {
        panel.innerHTML = `
            <button id="nh-col-minus">−</button>
            <span class="nh-col-label" id="nh-col-display">${columns} 欄</span>
            <button id="nh-col-plus">+</button>
            <span class="nh-sep"></span>
            <button id="nh-toggle-bc" class="nh-info-btn">顯示資訊</button>
        `;
        document.body.appendChild(panel);

        document.getElementById('nh-col-plus').onclick = () => { if (columns < 10) { columns++; applyGrid(); } };
        document.getElementById('nh-col-minus').onclick = () => { if (columns > 1) { columns--; applyGrid(); } };

        let bcVisible = false;
        const bc = document.querySelector('#thumbnail-container, #bigcontainer');
        bc.classList.add('nh-gallery-float-hidden');

        const overlay = document.createElement('div');
        overlay.id = 'nh-info-modal-overlay';
        const modal = document.createElement('div');
        modal.id = 'nh-info-modal';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'nh-modal-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = function() { overlay.classList.remove('nh-visible'); bcVisible = false; document.getElementById('nh-toggle-bc').textContent = '顯示資訊'; };
        modal.appendChild(closeBtn);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { closeBtn.onclick(); }
        });

        document.getElementById('nh-toggle-bc').onclick = function() {
            bcVisible = !bcVisible;
            if (bcVisible) {
                const clone = bc.cloneNode(true);
                clone.classList.remove('nh-gallery-float-hidden');
                clone.style.cssText = 'display:block !important;';
                const existing = modal.querySelector('.nh-modal-content');
                if (existing) existing.remove();
                const wrap = document.createElement('div');
                wrap.className = 'nh-modal-content';
                wrap.appendChild(clone);
                modal.appendChild(wrap);
                overlay.classList.add('nh-visible');
                this.textContent = '隱藏資訊';
            } else {
                overlay.classList.remove('nh-visible');
                this.textContent = '顯示資訊';
            }
        };
    }

    function getGridContainer() {
        if (isGallery) return document.querySelector('#thumbnail-container > .thumbs, #bigcontainer > .thumbs');
        if (isHome) return document.querySelector('.gallery-grid');
        return document.querySelector('.gallery-grid');
    }

    function applyGrid() {
        if (!isGallery && !isListing && !isHome) return;
        const container = getGridContainer();
        if (!container) return;
        if (isGallery) {
            document.body.classList.add('nh-gallery');
        } else {
            document.body.classList.add('nh-grid');
        }
        var cols = isGallery ? columns : 4;
        var containers;
        if (isGallery) {
            containers = document.querySelectorAll('#thumbnail-container > .thumbs, #bigcontainer > .thumbs');
        } else if (isHome) {
            containers = document.querySelectorAll('.gallery-grid');
        } else {
            containers = document.querySelectorAll('.gallery-grid, .container.index-container, .thumbs');
        }
        containers.forEach(function(el) {
            el.style.setProperty('grid-template-columns', `repeat(${cols}, 1fr)`, 'important');
        });
        var display = document.getElementById('nh-col-display');
        if (display) { display.innerText = `${cols} 欄`; }
        if (isGallery) localStorage.setItem('nh-col-count', columns);
    }

    // ─── Infinite scroll (listing pages only) ─────────────────

    function addInfiniteStatus(text) {
        let el = document.getElementById('nh-infinite-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'nh-infinite-status';
            const container = getGridContainer();
            (container || document.body).after(el);
        }
        el.textContent = text;
    }

    function fetchNextPage() {
        if (isLoading || !hasMore) return;
        isLoading = true;
        addInfiniteStatus('載入中...');

        const params = new URLSearchParams();
        if (currentQuery) {
            params.set('query', currentQuery);
            params.set('sort', 'date');
        }
        params.set('page', String(currentPage + 1));

        nhRequest({
            method: 'GET',
            url: `/api/v2/search?${params.toString()}`,
            onload: function(r) {
                try {
                    const data = JSON.parse(r.responseText);
                    const results = data.result || [];
                    if (results.length === 0) { hasMore = false; addInfiniteStatus('— 已無更多內容 —'); isLoading = false; return; }
                    currentPage++;
                    numPages = data.num_pages || 0;

                    const grid = getGridContainer();
                    if (!grid) { isLoading = false; return; }

                    results.forEach(function(item) {
                        const div = document.createElement('div');
                        div.className = 'gallery lang-' + (item.tag_ids.includes(17249) ? 'cn' : 'jp');
                        div.dataset.galleryId = item.id;
                        div.dataset.page = String(currentPage);
                        const cover = document.createElement('a');
                        cover.href = '/g/' + item.id + '/';
                        cover.className = 'cover';
                        cover.style.padding = '0 0 141.6% 0';
                        const img = document.createElement('img');
                        img.loading = 'lazy';
                        img.alt = item.english_title || item.japanese_title || '';
                        img.className = 'lazyload';
                        img.src = 'https://t2.nhentai.net/' + item.thumbnail;
                        cover.appendChild(img);
                        const cap = document.createElement('div');
                        cap.className = 'caption';
                        cap.textContent = item.english_title || item.japanese_title || '';
                        cover.appendChild(cap);
                        div.appendChild(cover);
                        grid.appendChild(div);
                    });

                    hasMore = currentPage < numPages;
                    addInfiniteStatus(`已載入 ${currentPage} / ${numPages} 頁`);
                    applyGrid();
                    updatePageIndicator();
                    isLoading = false;
                } catch(e) { addInfiniteStatus('解析錯誤: ' + e.message); isLoading = false; }
            },
            onerror: function() { addInfiniteStatus('載入失敗，滾動重試'); isLoading = false; }
        });
    }

    function initInfiniteScroll() {
        const q = parseCurrentQuery();
        if (!q) return;
        currentQuery = q.q;

        const m = location.search.match(/page=(\d+)/);
        currentPage = parseInt(m ? m[1] : '1', 10);

        // Mark initial items with page
        document.querySelectorAll('.gallery-grid .gallery, .container.index-container .gallery').forEach(function(el) {
            if (!el.dataset.page) el.dataset.page = String(currentPage);
        });

        // 初始 API 取得總頁數，期間鎖 isLoading 避免雙重請求
        isLoading = true;
        const params = new URLSearchParams();
        params.set('query', currentQuery);
        params.set('sort', 'date');
        params.set('page', String(currentPage));
        nhRequest({
            method: 'GET',
            url: '/api/v2/search?' + params.toString(),
            onload: function(r) {
                try {
                    const data = JSON.parse(r.responseText);
                    numPages = data.num_pages || 0;
                    hasMore = currentPage < numPages;
                    updatePageIndicator();
                    addInfiniteStatus('第 ' + currentPage + ' / ' + numPages + ' 頁，滾動載入更多');
                } catch(e) { addInfiniteStatus('解析失敗'); }
                isLoading = false;
            },
            onerror: function() {
                addInfiniteStatus('載入失敗，重整重試');
                isLoading = false;
            }
        });

        // 根據當前視窗找出可見頁碼
        function syncPageIndicator() {
            var items = document.querySelectorAll('.gallery-grid .gallery[data-page]');
            if (items.length === 0) return;
            var viewportMid = window.scrollY + window.innerHeight / 2;
            var best = visiblePage, bestDist = Infinity;
            for (var i = 0; i < items.length; i++) {
                var el = items[i];
                var dist = Math.abs(el.offsetTop + el.offsetHeight / 2 - viewportMid);
                if (dist < bestDist) { bestDist = dist; best = parseInt(el.dataset.page, 10); }
            }
            if (best !== visiblePage) { visiblePage = best; updatePageIndicator(); }
        }

        // 滾輪式無限載入 + 同步頁碼
        window.addEventListener('scroll', function onScroll() {
            syncPageIndicator();
            if (isLoading || !hasMore) return;
            var grid = document.querySelector('.gallery-grid');
            if (!grid) return;
            var rect = grid.getBoundingClientRect();
            if (rect.bottom <= window.innerHeight + 400) {
                fetchNextPage();
            }
        });
    }

    // ─── Gallery page number badge ────────────────────────────

    function initGalleryPageBadge() {
        const containers = document.querySelectorAll('.thumb-container');
        if (containers.length === 0) return;
        const badge = document.createElement('div');
        badge.id = 'nh-page-badge';
        document.body.appendChild(badge);
        containers.forEach(function(el, i) {
            el.addEventListener('mouseenter', function(e) {
                badge.textContent = (i + 1) + ' / ' + containers.length;
                badge.style.display = 'block';
                badge.style.left = (e.clientX + 12) + 'px';
                badge.style.top = (e.clientY + 12) + 'px';
            });
            el.addEventListener('mousemove', function(e) {
                badge.style.left = (e.clientX + 12) + 'px';
                badge.style.top = (e.clientY + 12) + 'px';
            });
            el.addEventListener('mouseleave', function() {
                badge.style.display = 'none';
            });
        });
    }

    // ─── Init ─────────────────────────────────────────────────

    if (isListing) {
        document.body.classList.add('nh-sticky-nav', 'nh-hide-signin');
        const q = parseCurrentQuery();
        if (q) {
            setTimeout(function() {
                applyGrid();
                createPageIndicator();
                initInfiniteScroll();
            }, 1500);
        } else {
            setTimeout(function() { applyGrid(); }, 1500);
        }
    } else if (isHome) {
        setTimeout(applyGrid, 1500);
    } else if (isGallery) {
        document.body.classList.add('nh-hide-signin');
        const nav = document.querySelector('#app > nav');
        if (nav) nav.style.display = 'none';
        setTimeout(function() { applyGrid(); initGalleryPageBadge(); }, 300);
    }

    const obs = new MutationObserver(function() {
        const c = getGridContainer();
        if (c) {
            applyGrid();
            obs.disconnect();
        }
    });
    const target = document.querySelector('#app, #content') || document.body;
    obs.observe(target, { childList: true, subtree: true });
})();