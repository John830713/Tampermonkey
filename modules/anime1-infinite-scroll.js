// ==UserScript==
// @name         Anime1 Infinite Scroll
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  動畫列表無限滾動 + 折疊卡片載入集數 + 跳頁器 + 單集自動下載
// @author       You
// @match        *://anime1.me/*
// @match        *://*.v.anime1.me/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_openInTab
// @allFrames    true
// @run-at       document-end
// @connect      localhost
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const PAGE_SIZE = 20;
    const API_URL = 'https://anime1.me/animelist.json';
    const SERVER = window.__agent_server || 'http://localhost:8921';

    let allData = [];
    let filteredData = null;
    let currentPage = 0;
    let isLoadingNext = false;
    let isLoadingPrev = false;
    let loadedMin = 0;
    let loadedMax = 0;

    /* ======================== CSS ======================== */
    GM_addStyle(`
        /* 固定頂部導覽列 */
        body {
            padding-top: 36px !important;
        }
        #masthead {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 9999 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: 36px !important;
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        body.dark #masthead,
        body.darkmode #masthead {
            background: #1e1e2e;
        }
        #masthead .header-content,
        #masthead .header-content.inline,
        .site-header .header-content,
        .site-header .header-content.inline,
        header.site-header .header-content.inline {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 0 !important;
            padding: 0 4px !important;
            margin: 0 !important;
            text-indent: 0 !important;
            text-align: left !important;
            letter-spacing: 0 !important;
            word-spacing: 0 !important;
            height: 36px !important;
            min-height: 0 !important;
            max-height: 36px !important;
            overflow: hidden !important;
        }
        /* 隱藏選單按鈕 */
        .menu-toggle {
            display: none !important;
        }

        /* 站名外層 — layout 上消失，子元素直接受 header-content 控制 */
        #site-branding,
        .site-branding {
            display: contents !important;
        }
        .site-title {
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1 !important;
            flex-shrink: 0 !important;
            width: auto !important;
        }
        .site-title h1 {
            margin: 0 !important;
            padding: 0 !important;
            font-size: 13px !important;
            line-height: 1 !important;
            font-weight: bold !important;
            white-space: nowrap !important;
            width: auto !important;
        }
        .site-title a {
            display: inline !important;
            padding: 0 !important;
            text-decoration: none !important;
            color: #333 !important;
        }
        body.dark .site-title a,
        body.darkmode .site-title a {
            color: #eee !important;
        }
        .site-title-long {
            font-size: 11px !important;
            color: #888 !important;
            font-weight: normal !important;
            margin-left: 2px !important;
        }

        /* 導覽列 — 水平緊湊 */
        .main-navigation,
        #site-navigation {
            display: flex !important;
            align-items: center !important;
            margin: 0 0 0 4px !important;
            padding: 0 !important;
            height: 36px !important;
            float: none !important;
            clear: none !important;
            width: auto !important;
            max-width: none !important;
        }
        #primary-menu {
            display: flex !important;
            align-items: center !important;
            gap: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        #primary-menu li {
            margin: 0 !important;
            padding: 0 !important;
            white-space: nowrap !important;
        }
        #primary-menu li a {
            padding: 4px 4px !important;
            font-size: 11px !important;
            color: #555 !important;
            text-decoration: none !important;
            white-space: nowrap !important;
            line-height: 1 !important;
        }
        #primary-menu li a:hover {
            color: #1e88e5 !important;
        }
        #primary-menu li.current-menu-item a {
            color: #1e88e5 !important;
            font-weight: bold !important;
        }
        body.dark #primary-menu li a,
        body.darkmode #primary-menu li a {
            color: #aaa !important;
        }

        /* 右側工具列 */
        #a1-toolbar {
            display: flex !important;
            align-items: center !important;
            flex-shrink: 0 !important;
            margin-left: 8px !important;
            gap: 4px;
        }

        /* 頁碼 */
        #a1-toolbar-pages {
            display: flex;
            align-items: center;
            gap: 3px;
        }
        #a1-toolbar-pages button {
            background: rgba(0,0,0,0.06);
            color: #333;
            border: none;
            border-radius: 4px;
            padding: 3px 6px;
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
            line-height: 1.3;
            transition: background 0.15s;
        }
        body.dark #a1-toolbar-pages button,
        body.darkmode #a1-toolbar-pages button {
            background: rgba(255,255,255,0.12);
            color: #eee;
        }
        #a1-toolbar-pages button:hover {
            background: rgba(0,0,0,0.12);
        }
        body.dark #a1-toolbar-pages button:hover,
        body.darkmode #a1-toolbar-pages button:hover {
            background: rgba(255,255,255,0.2);
        }
        #a1-toolbar-pages button:disabled {
            opacity: 0.3;
            cursor: default;
        }
        #a1-page-num {
            font-weight: bold;
            font-size: 11px;
            color: #e67e22;
            white-space: nowrap;
        }
        #a1-toolbar-pages input {
            width: 34px;
            padding: 2px 4px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background: #f5f5f5;
            color: #333;
            font-size: 11px;
            text-align: center;
            outline: none;
        }
        body.dark #a1-toolbar-pages input,
        body.darkmode #a1-toolbar-pages input {
            background: #2a2a3e;
            border-color: #555;
            color: #eee;
        }
        #a1-toolbar-pages input:focus {
            border-color: #1e88e5;
        }
        #a1-jump-btn {
            background: #1e88e5 !important;
            color: #fff !important;
            font-size: 11px !important;
            padding: 3px 6px !important;
        }
        #a1-jump-btn:hover {
            background: #1565c0 !important;
        }

        /* 搜尋 */
        #a1-toolbar-search {
            flex-shrink: 0;
            display: flex;
            align-items: center;
        }
        #a1-search-input {
            width: 130px;
            padding: 3px 6px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 11px;
            outline: none;
            box-sizing: border-box;
            background: #f5f5f5;
            color: #333;
            transition: width 0.2s;
        }
        #a1-search-input:focus {
            width: 180px;
            border-color: #1e88e5;
            background: #fff;
        }
        body.dark #a1-search-input,
        body.darkmode #a1-search-input {
            background: #2a2a3e;
            border-color: #444;
            color: #eee;
        }

        /* 隱藏原生表格 */
        .entry-content #table-list_wrapper,
        .entry-content #table-list,
        .entry-content .dataTables_wrapper,
        .entry-content .dataTables_paginate,
        .entry-content .dataTables_info,
        .entry-content .dataTables_filter {
            display: none !important;
        }

        /* 主容器 */
        #a1-infinite-container {
            margin-bottom: 8px;
        }

        /* 卡片 */
        .a1-card {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            margin-bottom: 4px;
            overflow: hidden;
            transition: box-shadow 0.2s;
        }
        .a1-card:hover {
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        body.dark .a1-card,
        body.darkmode .a1-card {
            border-color: #444;
            background: #1e1e2e;
        }
        .a1-card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            cursor: pointer;
            user-select: none;
            background: #f8f8f8;
            transition: background 0.2s;
        }
        .a1-card-header:hover {
            background: #f0f0f0;
        }
        body.dark .a1-card-header,
        body.darkmode .a1-card-header {
            background: #252535;
        }
        body.dark .a1-card-header:hover,
        body.darkmode .a1-card-header:hover {
            background: #2e2e40;
        }
        .a1-card-title {
            font-size: 13px;
            font-weight: 500;
            color: #333;
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-right: 8px;
        }
        body.dark .a1-card-title,
        body.darkmode .a1-card-title {
            color: #e0e0e0;
        }
        .a1-card-toggle {
            font-size: 12px;
            color: #999;
            min-width: 20px;
            text-align: center;
        }
        .a1-card-body {
            display: none;
            padding: 10px 14px;
            border-top: 1px solid #eee;
            font-size: 13px;
            color: #666;
            line-height: 1.8;
        }
        body.dark .a1-card-body,
        body.darkmode .a1-card-body {
            border-top-color: #333;
            color: #aaa;
        }
        .a1-card.open .a1-card-body {
            display: block;
        }
        .a1-card.open .a1-card-toggle {
            transform: rotate(180deg);
        }
        .a1-ep-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
            gap: 5px;
            margin-top: 8px;
        }
        .a1-ep-btn {
            background: #1e88e5;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 5px 2px;
            cursor: pointer;
            font-size: 12px;
            text-align: center;
            transition: background 0.15s;
        }
        .a1-ep-btn:hover {
            background: #1565c0;
        }
        .a1-ep-loading {
            color: #999;
            font-size: 12px;
            margin-top: 6px;
        }
        .a1-ep-error {
            color: #e74c3c;
            font-size: 12px;
            margin-top: 6px;
        }
        .a1-card-body a {
            color: #1e88e5;
            text-decoration: none;
        }
        .a1-card-body a:hover {
            text-decoration: underline;
        }

        /* 載入提示 */
        #a1-loading {
            text-align: center;
            padding: 20px;
            color: #999;
            font-size: 14px;
        }
        #a1-loading .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #ddd;
            border-top-color: #1e88e5;
            border-radius: 50%;
            animation: a1-spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 8px;
        }
        @keyframes a1-spin { to { transform: rotate(360deg); } }

        #a1-end {
            text-align: center;
            padding: 16px;
            color: #aaa;
            font-size: 13px;
        }

        /* 回到頂部按鈕 */
        #a1-back-top {
            position: fixed;
            bottom: 70px;
            right: 20px;
            z-index: 99998;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(30, 30, 50, 0.85);
            color: #fff;
            border: none;
            cursor: pointer;
            font-size: 18px;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(4px);
            transition: opacity 0.2s;
        }
        #a1-back-top:hover {
            background: rgba(50, 50, 70, 0.95);
        }
    `);

    /* ======================== 工具 ======================== */
    function getData() {
        return filteredData !== null ? filteredData : allData;
    }

    function totalPages() {
        return Math.ceil(getData().length / PAGE_SIZE);
    }

    function getCardId(item) {
        return item[0];
    }

    function getCardTitle(item) {
        return item[1];
    }

    function getCardInfo(item) {
        return {
            episodes: item[2] || '-',
            year: item[3] || '-',
            season: item[4] || '-',
            fansub: item[5] || '-'
        };
    }

    function renderCard(item, idx) {
        const id = getCardId(item);
        const title = getCardTitle(item);
        const info = getCardInfo(item);
        const link = id ? `https://anime1.me/?cat=${id}` : null;

        const card = document.createElement('div');
        card.className = 'a1-card';
        card.dataset.id = id;
        card.dataset.idx = idx;

        const header = document.createElement('div');
        header.className = 'a1-card-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'a1-card-title';
        titleEl.innerHTML = title;
        if (link) {
            titleEl.title = '點擊展開查看詳情';
        }

        const toggle = document.createElement('span');
        toggle.className = 'a1-card-toggle';
        toggle.textContent = '▼';

        header.append(titleEl, toggle);

        const body = document.createElement('div');
        body.className = 'a1-card-body';
        body.innerHTML = `
            <div>集數：${info.episodes}</div>
            <div>年份：${info.year}</div>
            <div>季節：${info.season}</div>
            <div>字幕組：${info.fansub}</div>
        `;

        if (link) {
            const epContainer = document.createElement('div');
            epContainer.className = 'a1-ep-grid';
            body.appendChild(epContainer);

            let episodesLoaded = false;
            header.addEventListener('click', () => {
                card.classList.toggle('open');
                if (card.classList.contains('open') && !episodesLoaded) {
                    episodesLoaded = true;
                    fetchEpisodes(id, epContainer);
                }
            });
        } else {
            header.addEventListener('click', () => {
                card.classList.toggle('open');
            });
        }

        card.append(header, body);
        return card;
    }

    function getVideoUrlFromApi(apireq) {
        return fetch('https://v.anime1.me/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'd=' + encodeURIComponent(apireq),
            credentials: 'include'
        })
        .then(r => r.json())
        .then(j => {
            if (j.s && j.s[0] && j.s[0].src) {
                const src = j.s[0].src;
                return src.startsWith('//') ? 'https:' + src : src;
            }
            throw new Error('no video src in response');
        });
    }

    function getEpisodeVideoUrl(epUrl) {
        return fetch(epUrl)
            .then(r => r.text())
            .then(html => {
                const m = html.match(/data-apireq="([^"]+)"/);
                if (!m) throw new Error('no data-apireq found');
                return getVideoUrlFromApi(decodeURIComponent(m[1]));
            });
    }

    function downloadEpisode(epUrl, epTitle, btn) {
        if (btn._downloading) return;
        btn._downloading = true;
        const origText = btn.textContent;
        btn.textContent = '...';
        btn.style.opacity = '0.6';

        getEpisodeVideoUrl(epUrl)
            .then(videoUrl => {
                const match = epTitle.match(/\[(\d+(\.\d+)?)\]/);
                const epNum = match ? match[1] : epTitle.match(/\[([^\]]+)\]/)?.[1] || Date.now();
                const fileName = `${epNum.replace('.', '_')}.mp4`;
                const folderMatch = epTitle.split(' [')[0].trim().replace(/[\\/:*?"<>|]/g, '_');
                const savePath = `${folderMatch}/${fileName}`;

                GM_download({
                    url: videoUrl,
                    name: savePath,
                    saveAs: false,
                    onerror: (err) => {
                        console.error('[A1] download error:', err);
                        btn.textContent = '失敗';
                        setTimeout(() => { btn.textContent = origText; btn.style.opacity = ''; btn._downloading = false; }, 2000);
                        if (err.error === 'not_whitelisted') {
                            GM_notification({ title: '權限提示', text: '請在 Tampermonkey 設定中允許下載子資料夾。' });
                        }
                    }
                });
                btn.textContent = '✓';
                GM_notification({ title: '開始下載', text: savePath, timeout: 2000 });
                setTimeout(() => { btn.textContent = origText; btn.style.opacity = ''; btn._downloading = false; }, 3000);
            })
            .catch(err => {
                console.error('[A1] video fetch error:', err);
                btn.textContent = '錯';
                setTimeout(() => { btn.textContent = origText; btn.style.opacity = ''; btn._downloading = false; }, 2000);
            });
    }

    function fetchEpisodes(catId, container) {
        container.innerHTML = '<div class="a1-ep-loading">載入集數...</div>';
        fetch(`https://anime1.me/?cat=${catId}`)
            .then(r => r.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const links = Array.from(doc.querySelectorAll('h2.entry-title a'));
                const seen = new Set();
                const episodes = [];
                links.forEach(a => {
                    const url = a.href.startsWith('http') ? a.href : 'https://anime1.me' + a.getAttribute('href');
                    const text = a.innerText.trim();
                    if (!seen.has(url) && text.includes('[')) {
                        seen.add(url);
                        episodes.push({ label: text.match(/\[(.*?)\]/)?.[1] || text, url, title: text });
                    }
                });

                if (episodes.length === 0) {
                    container.innerHTML = '<div class="a1-ep-error">無集數資料</div>';
                    return;
                }

                container.innerHTML = '';
                episodes.reverse().forEach(ep => {
                    const btn = document.createElement('button');
                    btn.className = 'a1-ep-btn';
                    btn.textContent = ep.label;
                    btn.title = ep.title + ' (Shift+click 開分頁觀看)';
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                            GM_openInTab(ep.url, { active: true, insert: true });
                        } else {
                            downloadEpisode(ep.url, ep.title, btn);
                        }
                    });
                    container.appendChild(btn);
                });
            })
            .catch(err => {
                container.innerHTML = `<div class="a1-ep-error">載入失敗：${err.message}</div>`;
            });
    }

    /* ======================== 渲染 ======================== */
    function renderInitial() {
        const container = document.getElementById('a1-infinite-container');
        const data = getData();
        const end = document.getElementById('a1-end');
        if (end) end.remove();

        container.innerHTML = '';
        currentPage = 0;
        loadedMin = 0;
        loadedMax = 0;
        isLoadingNext = false;
        isLoadingPrev = false;

        if (data.length === 0) {
            container.innerHTML = '<div id="a1-end">找不到符合的動畫</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        const count = Math.min(PAGE_SIZE, data.length);
        for (let i = 0; i < count; i++) {
            frag.appendChild(renderCard(data[i], i));
        }
        container.appendChild(frag);
        loadedMax = count;
        currentPage = 1;
        updatePageIndicator();
        addEndMarkerIfDone();
    }

    function appendNextPage() {
        const data = getData();
        if (isLoadingNext || loadedMax >= data.length) return;
        isLoadingNext = true;

        const container = document.getElementById('a1-infinite-container');
        const loading = document.getElementById('a1-loading');
        if (loading) loading.style.display = '';

        const frag = document.createDocumentFragment();
        const end = Math.min(loadedMax + PAGE_SIZE, data.length);
        for (let i = loadedMax; i < end; i++) {
            frag.appendChild(renderCard(data[i], i));
        }
        container.appendChild(frag);
        loadedMax = end;
        currentPage = Math.ceil(loadedMax / PAGE_SIZE);
        isLoadingNext = false;

        if (loading) loading.style.display = 'none';
        updatePageIndicator();
        addEndMarkerIfDone();
    }

    function prependPrevPage() {
        const data = getData();
        if (isLoadingPrev || loadedMin <= 0) return;
        isLoadingPrev = true;

        const container = document.getElementById('a1-infinite-container');
        const end = document.getElementById('a1-end');
        if (end) end.remove();

        const oldScrollH = document.documentElement.scrollHeight;
        const oldScrollY = window.scrollY;

        const frag = document.createDocumentFragment();
        const start = Math.max(0, loadedMin - PAGE_SIZE);
        for (let i = start; i < loadedMin; i++) {
            frag.appendChild(renderCard(data[i], i));
        }
        container.insertBefore(frag, container.firstChild);
        loadedMin = start;
        currentPage = Math.ceil(loadedMax / PAGE_SIZE);
        isLoadingPrev = false;

        const addedH = document.documentElement.scrollHeight - oldScrollH;
        window.scrollTo(0, oldScrollY + addedH);

        updatePageIndicator();
    }

    function addEndMarkerIfDone() {
        const data = getData();
        const container = document.getElementById('a1-infinite-container');
        const existing = document.getElementById('a1-end');
        if (existing) existing.remove();

        if (loadedMax >= data.length && loadedMin <= 0) {
            const endEl = document.createElement('div');
            endEl.id = 'a1-end';
            endEl.textContent = `— 共 ${data.length} 部動畫 —`;
            container.appendChild(endEl);
        } else if (loadedMax >= data.length && loadedMin > 0) {
            const endEl = document.createElement('div');
            endEl.id = 'a1-end';
            endEl.textContent = '— 已達最後一頁 —';
            container.appendChild(endEl);
        }
    }

    /* ======================== 頁碼指示器 ======================== */
    function createPageIndicator() {
        let pages = document.getElementById('a1-toolbar-pages');
        if (!pages) return;

        const btnFirst = document.createElement('button');
        btnFirst.textContent = '⇤';
        btnFirst.title = '回首頁';
        btnFirst.addEventListener('click', jumpToFirst);

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '‹';
        btnPrev.title = '上一頁';
        btnPrev.addEventListener('click', loadPrevPageJump);

        const pageLabel = document.createElement('span');
        pageLabel.id = 'a1-page-num';

        const btnNext = document.createElement('button');
        btnNext.textContent = '›';
        btnNext.title = '下一頁';
        btnNext.addEventListener('click', loadNextPageJump);

        const btnLast = document.createElement('button');
        btnLast.textContent = '⇥';
        btnLast.title = '末頁';
        btnLast.addEventListener('click', jumpToLast);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.placeholder = '頁';
        input.addEventListener('keydown', e => { if (e.key === 'Enter') jumpToPage(); });

        const jumpBtn = document.createElement('button');
        jumpBtn.id = 'a1-jump-btn';
        jumpBtn.textContent = '跳頁';
        jumpBtn.addEventListener('click', jumpToPage);

        pages.append(btnFirst, btnPrev, pageLabel, btnNext, btnLast, input, jumpBtn);

        pages._pageLabel = pageLabel;
        pages._btnFirst = btnFirst;
        pages._btnPrev = btnPrev;
        pages._btnNext = btnNext;
        pages._btnLast = btnLast;
    }

    function updatePageIndicator(viewPage) {
        const pages = document.getElementById('a1-toolbar-pages');
        if (!pages) return;
        const data = getData();
        const total = totalPages();
        const page = viewPage || currentPage || 1;

        pages._pageLabel.textContent = `第 ${page} / ${total} 頁（${data.length} 部）`;
        pages._btnFirst.disabled = loadedMin <= 0;
        pages._btnPrev.disabled = loadedMin <= 0;
        pages._btnNext.disabled = loadedMax >= data.length;
        pages._btnLast.disabled = loadedMax >= data.length;
    }

    function syncPageIndicator() {
        const cards = document.querySelectorAll('.a1-card[data-idx]');
        if (cards.length === 0) return;
        const viewportMid = window.scrollY + window.innerHeight / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (const c of cards) {
            const rect = c.getBoundingClientRect();
            const cardMid = window.scrollY + rect.top + rect.height / 2;
            const dist = Math.abs(cardMid - viewportMid);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = parseInt(c.dataset.idx, 10) || 0;
            }
        }
        const viewPage = Math.floor(bestIdx / PAGE_SIZE) + 1;
        updatePageIndicator(viewPage);
    }

    /* ======================== 跳頁 ======================== */
    function jumpToFirst() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function jumpToLast() {
        const data = getData();
        const targetMin = Math.max(0, data.length - PAGE_SIZE);
        loadedMin = 0;
        loadedMax = 0;
        renderInitial();
        if (targetMin > 0) {
            const container = document.getElementById('a1-infinite-container');
            const frag = document.createDocumentFragment();
            for (let i = 0; i < data.length; i++) {
                frag.appendChild(renderCard(data[i], i));
            }
            container.innerHTML = '';
            container.appendChild(frag);
            loadedMax = data.length;
            loadedMin = 0;
            currentPage = totalPages();
            updatePageIndicator();
        }
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }

    function loadPrevPageJump() {
        const data = getData();
        const prevStart = Math.max(0, loadedMin - PAGE_SIZE);
        if (prevStart >= loadedMin) return;
        loadedMin = prevStart;
        renderInitial();
        const container = document.getElementById('a1-infinite-container');
        const frag = document.createDocumentFragment();
        const end = Math.min(PAGE_SIZE, data.length);
        for (let i = 0; i < end; i++) {
            frag.appendChild(renderCard(data[i], i));
        }
        container.innerHTML = '';
        container.appendChild(frag);
        loadedMax = end;
        loadedMin = 0;
        currentPage = 1;
        updatePageIndicator();
    }

    function loadNextPageJump() {
        appendNextPage();
        setTimeout(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }, 50);
    }

    function jumpToPage() {
        const input = document.querySelector('.a1-page-indicator input');
        const p = parseInt(input.value, 10);
        if (isNaN(p) || p < 1) return;
        const data = getData();
        const total = totalPages();
        const page = Math.min(total, Math.max(1, p));

        const startIdx = (page - 1) * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, data.length);

        const container = document.getElementById('a1-infinite-container');
        const end = document.getElementById('a1-end');
        if (end) end.remove();

        container.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i = startIdx; i < endIdx; i++) {
            frag.appendChild(renderCard(data[i], i));
        }
        container.appendChild(frag);
        loadedMin = startIdx;
        loadedMax = endIdx;
        currentPage = page;
        isLoadingNext = false;
        isLoadingPrev = false;

        window.scrollTo({ top: 0, behavior: 'smooth' });
        updatePageIndicator();
        addEndMarkerIfDone();
        input.value = '';
    }

    /* ======================== 搜尋 ======================== */
    function setupSearch() {
        const input = document.getElementById('a1-search-input');
        let debounceTimer = null;

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const q = input.value.trim().toLowerCase();
                if (!q) {
                    filteredData = null;
                } else {
                    filteredData = allData.filter(item => {
                        const title = (item[1] || '').toLowerCase();
                        const fansub = (item[5] || '').toLowerCase();
                        const episodes = (item[2] || '').toLowerCase();
                        const year = String(item[3] || '').toLowerCase();
                        return title.includes(q) || fansub.includes(q) || episodes.includes(q) || year.includes(q);
                    });
                }
                renderInitial();
            }, 200);
        });
    }

    /* ======================== 滾動偵測 ======================== */
    function setupScrollListener() {
        let scrollTimer = null;
        window.addEventListener('scroll', () => {
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const y = window.scrollY || window.pageYOffset;
                const dh = document.documentElement.scrollHeight;
                const vh = window.innerHeight;

                if (y <= 200) prependPrevPage();
                if (y >= dh - vh - 400) appendNextPage();

                syncPageIndicator();

                const backTop = document.getElementById('a1-back-top');
                if (backTop) {
                    backTop.style.display = y > 500 ? 'flex' : 'none';
                }
            }, 150);
        });
    }

    /* ======================== 回到頂部 ======================== */
    function createBackTop() {
        const btn = document.createElement('button');
        btn.id = 'a1-back-top';
        btn.textContent = '↑';
        btn.title = '回到頂部';
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        document.body.appendChild(btn);
    }

    /* ======================== 載入指示 ======================== */
    function createLoadingIndicator() {
        const el = document.createElement('div');
        el.id = 'a1-loading';
        el.innerHTML = '<span class="spinner"></span>載入中...';
        el.style.display = 'none';
        document.getElementById('a1-infinite-container').appendChild(el);
    }

    /* ======================== 初始化 ======================== */
    function shrinkHeader() {
        const masthead = document.getElementById('masthead');
        if (!masthead) return;
        masthead.style.cssText = 'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;z-index:9999 !important;height:36px !important;min-height:0 !important;max-height:36px !important;padding:0 !important;overflow:hidden !important;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.1);';

        const content = masthead.querySelector('.header-content');
        if (!content) return;

        if (!document.getElementById('a1-toolbar')) {
            const toolbar = document.createElement('div');
            toolbar.id = 'a1-toolbar';

            const pages = document.createElement('div');
            pages.id = 'a1-toolbar-pages';
            toolbar.appendChild(pages);

            const searchWrap = document.createElement('div');
            searchWrap.id = 'a1-toolbar-search';
            const searchInput = document.createElement('input');
            searchInput.id = 'a1-search-input';
            searchInput.type = 'text';
            searchInput.placeholder = '搜尋動畫名稱、字幕組...';
            searchWrap.appendChild(searchInput);
            toolbar.appendChild(searchWrap);

            content.appendChild(toolbar);

            createPageIndicator();
            createBackTop();
        }
    }

    function verifySticky() {
        const masthead = document.getElementById('masthead');
        if (!masthead) return;
        const check = () => {
            const rect = masthead.getBoundingClientRect();
            const ok = rect.top <= 1 && rect.left <= 1;
            if (!ok) console.warn(`[A1 Sticky] FAIL top=${rect.top.toFixed(1)}px`);
        };
        check();
    }

    function hideOriginalTable() {
        const entryContent = document.querySelector('.entry-content');
        if (entryContent) {
            entryContent.querySelectorAll('#table-list_wrapper, #table-list, .dataTables_wrapper, .dataTables_paginate, .dataTables_info, .dataTables_filter').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
            const p = entryContent.querySelector('p');
            if (p) p.style.setProperty('display', 'none', 'important');
        }
        const entryHeader = document.querySelector('.entry-header');
        if (entryHeader) entryHeader.style.setProperty('display', 'none', 'important');
        const entryImage = document.querySelector('.entry-image');
        if (entryImage) entryImage.style.setProperty('display', 'none', 'important');
    }

    function applyHiddenElements() {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: SERVER + '/hidden',
                onload: function(res) {
                    if (res.status !== 200) return;
                    try {
                        const data = JSON.parse(res.responseText);
                        const selectors = data.selectors || [];
                        if (selectors.length === 0) return;
                        selectors.forEach(function(sel) {
                            try {
                                document.querySelectorAll(sel).forEach(function(el) {
                                    if (!el.dataset.a1Hidden) {
                                        el.style.setProperty('display', 'none', 'important');
                                        el.dataset.a1Hidden = '1';
                                        console.log('[A1] hidden:', sel);
                                    }
                                });
                            } catch(e) {}
                        });
                    } catch(e) {}
                },
                onerror: function() {}
            });
        } catch(e) {}
    }

    function init() {
        console.log('[A1] init starting');
        const entryContent = document.querySelector('.entry-content');
        if (!entryContent) {
            console.error('[A1] .entry-content not found!');
            return;
        }
        console.log('[A1] found .entry-content');

        shrinkHeader();
        verifySticky();
        hideOriginalTable();
        setInterval(hideOriginalTable, 500);

        // 從 server 讀取隱藏清單
        applyHiddenElements();
        setInterval(applyHiddenElements, 30000);

        const container = document.createElement('div');
        container.id = 'a1-infinite-container';
        entryContent.prepend(container);

        createLoadingIndicator();

        console.log('[A1] fetching', API_URL);
        fetch(API_URL)
            .then(r => r.json())
            .then(data => {
                console.log('[A1] data loaded:', data.length, 'items');
                allData = data;
                renderInitial();
                setupSearch();
                setupScrollListener();
            })
            .catch(err => {
                console.error('[A1] fetch error:', err);
                container.innerHTML = `<div id="a1-end">載入失敗：${err.message}</div>`;
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ======================== 單集頁：自動下載 + 自動播放 ======================== */
    (function initEpisodePage() {
        const isSinglePage = /anime1\.me\/\d+/.test(window.top.location.href);
        const isIframe = location.hostname.includes('v.anime1.me');
        if (!isSinglePage && !isIframe) return;
        if (window.hasFiredDownload) return;

        const getDownloadPath = () => {
            const fullTitle = window.top.document.title;
            const folderName = fullTitle.split(' [')[0].trim().replace(/[\\/:*?"<>|]/g, '_');
            const match = fullTitle.match(/\[(\d+(\.\d+)?)\]/);
            const fileName = match ? `${match[1].replace('.', '_')}.mp4` : `Anime1_${Date.now()}.mp4`;
            return `${folderName}/${fileName}`;
        };

        const closeThisTab = () => {
            window.top.close();
            setTimeout(() => {
                if (!window.top.closed) GM_notification({ title: '下載成功', text: '請手動關閉分頁' });
            }, 500);
        };

        const doDownload = (url) => {
            if (window.hasFiredDownload) return;
            window.hasFiredDownload = true;

            const path = getDownloadPath();
            GM_download({
                url: url,
                name: path,
                saveAs: false,
                onerror: (err) => {
                    console.error('[A1] download error:', err);
                    if (err.error === 'not_whitelisted') {
                        GM_notification({ title: '權限提示', text: '請在 Tampermonkey 設定中允許下載子資料夾。' });
                    }
                }
            });
            GM_notification({ title: '開始下載', text: `路徑: ${path}`, timeout: 1500 });
            setTimeout(closeThisTab, 1500);
        };

        const autoPlay = () => {
            const btn = document.querySelector('.vjs-big-play-button') || document.querySelector('.vjs-play-control');
            if (btn) btn.click();
            else {
                const v = document.querySelector('video');
                if (v) v.play().catch(() => {});
            }
        };

        const orgOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(m, url) {
            if (!window.hasFiredDownload && (url.includes('redirect=1') || url.includes('.mp4'))) doDownload(url);
            return orgOpen.apply(this, arguments);
        };

        setInterval(() => {
            const v = document.querySelector('video');
            if (!window.hasFiredDownload && v && v.src && !v.src.includes('blob:')) doDownload(v.src);
        }, 1000);

        window.addEventListener('load', () => setTimeout(autoPlay, 1000));
    })();
})();
