// ==UserScript==
// @name         anime1-infinite-scroll
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-exported from modules/Anime1 無限滾動.js
// @author       You
// @match        *://anime1.me/*
// @grant        GM_addStyle
// ==/UserScript==


// ==UserScript==
// @name         Anime1 無限滾動
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  動畫列表無限滾動 + 折疊卡片 + 跳頁器
// @author       You
// @match        *://anime1.me/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const PAGE_SIZE = 20;
    const API_URL = 'https://anime1.me/animelist.json';

    let allData = [];
    let filteredData = null;
    let currentPage = 0;
    let isLoadingNext = false;
    let isLoadingPrev = false;
    let loadedMin = 0;
    let loadedMax = 0;

    /* ======================== CSS ======================== */
    GM_addStyle(`
        /* 固定頂部導覽列 + 縮小高度 */
        body {
            padding-top: 34px !important;
        }
        #masthead {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 9999 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: 34px !important;
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        body.dark #masthead,
        body.darkmode #masthead {
            background: #1a1a2e;
        }
        #masthead .header-content {
            display: flex !important;
            align-items: center !important;
            padding: 4px 10px !important;
            min-height: 0 !important;
        }
        #masthead .site-branding {
            margin: 0 !important;
            padding: 0 !important;
        }
        #masthead .site-title {
            margin: 0 !important;
            padding: 0 !important;
        }
        #masthead .site-title h1 {
            margin: 0 !important;
            padding: 0 !important;
            font-size: 16px !important;
            line-height: 1.2 !important;
        }
        #masthead .site-title a {
            display: flex !important;
            align-items: center !important;
            gap: 6px;
            padding: 0 !important;
            text-decoration: none;
            color: #333;
        }
        #masthead .site-title-long {
            font-size: 12px;
            color: #888;
            font-weight: normal;
        }
        #masthead .main-navigation {
            margin-left: auto !important;
        }
        #masthead .menu-toggle {
            padding: 4px 10px !important;
            font-size: 12px !important;
            min-height: 0 !important;
        }
        #masthead #primary-menu {
            display: flex !important;
            gap: 0 !important;
        }
        #masthead #primary-menu li {
            margin: 0 !important;
            padding: 0 !important;
        }
        #masthead #primary-menu a {
            padding: 4px 10px !important;
            font-size: 12px !important;
            white-space: nowrap;
        }

        /* 隱藏原生表格和分頁 */
        #table-list_wrapper,
        #table-list,
        .dataTables_wrapper,
        .dataTables_paginate,
        .dataTables_info,
        .dataTables_filter {
            display: none !important;
        }

        /* 主容器 — 靠左 */
        #a1-infinite-container {
            max-width: 700px;
            margin: 0;
            margin-left: 10px;
            padding: 8px 10px;
        }

        /* 搜尋框 */
        #a1-search-bar {
            position: sticky;
            top: 34px;
            z-index: 99989;
            background: #fff;
            padding: 6px 10px;
            border-bottom: 1px solid #eee;
        }
        body.dark #a1-search-bar,
        body.darkmode #a1-search-bar {
            background: #1a1a2e;
            border-bottom-color: #333;
        }
        #a1-search-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
            background: #fafafa;
            color: #333;
        }
        #a1-search-input:focus {
            border-color: #1e88e5;
            background: #fff;
        }
        body.dark #a1-search-input,
        body.darkmode #a1-search-input {
            background: #2a2a3e;
            border-color: #444;
            color: #eee;
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

        /* 頁碼指示器 */
        .a1-page-indicator {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(30, 30, 50, 0.92);
            padding: 8px 14px;
            border-radius: 24px;
            font-family: -apple-system, sans-serif;
            font-size: 13px;
            color: #fff;
            backdrop-filter: blur(6px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            user-select: none;
        }
        .a1-page-indicator button {
            background: rgba(255,255,255,0.15);
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 5px 10px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            transition: background 0.15s;
        }
        .a1-page-indicator button:hover {
            background: rgba(255,255,255,0.25);
        }
        .a1-page-indicator button:disabled {
            opacity: 0.35;
            cursor: default;
        }
        .a1-page-indicator .a1-page-num {
            font-weight: bold;
            min-width: 90px;
            text-align: center;
            color: #ffd54f;
        }
        .a1-page-indicator input {
            width: 44px;
            padding: 4px 6px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            background: rgba(255,255,255,0.1);
            color: #fff;
            font-size: 13px;
            text-align: center;
            outline: none;
        }
        .a1-page-indicator input:focus {
            border-color: #1e88e5;
        }
        .a1-page-indicator .a1-jump-btn {
            background: #1e88e5;
        }
        .a1-page-indicator .a1-jump-btn:hover {
            background: #1565c0;
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
            ${link ? `<div style="margin-top:6px"><a href="${link}" target="_blank">前往作品頁面 →</a></div>` : ''}
        `;

        header.addEventListener('click', () => {
            card.classList.toggle('open');
        });

        card.append(header, body);
        return card;
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
        const bar = document.createElement('div');
        bar.className = 'a1-page-indicator';

        const btnFirst = document.createElement('button');
        btnFirst.textContent = '⇤';
        btnFirst.title = '回首頁';
        btnFirst.addEventListener('click', jumpToFirst);

        const btnPrev = document.createElement('button');
        btnPrev.textContent = '‹';
        btnPrev.title = '上一頁';
        btnPrev.addEventListener('click', loadPrevPageJump);

        const pageLabel = document.createElement('span');
        pageLabel.className = 'a1-page-num';

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
        jumpBtn.className = 'a1-jump-btn';
        jumpBtn.textContent = '跳頁';
        jumpBtn.addEventListener('click', jumpToPage);

        bar.append(btnFirst, btnPrev, pageLabel, btnNext, btnLast, input, jumpBtn);
        document.body.appendChild(bar);

        bar._pageLabel = pageLabel;
        bar._btnFirst = btnFirst;
        bar._btnPrev = btnPrev;
        bar._btnNext = btnNext;
        bar._btnLast = btnLast;
    }

    function updatePageIndicator(viewPage) {
        const bar = document.querySelector('.a1-page-indicator');
        if (!bar) return;
        const data = getData();
        const total = totalPages();
        const page = viewPage || currentPage || 1;

        bar._pageLabel.textContent = `第 ${page} / ${total} 頁（${data.length} 部）`;
        bar._btnFirst.disabled = loadedMin <= 0;
        bar._btnPrev.disabled = loadedMin <= 0;
        bar._btnNext.disabled = loadedMax >= data.length;
        bar._btnLast.disabled = loadedMax >= data.length;
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
        masthead.style.cssText = 'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;z-index:9999 !important;height:34px !important;min-height:0 !important;max-height:34px !important;padding:0 !important;overflow:hidden !important;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.1);';
        const content = masthead.querySelector('.header-content');
        if (content) content.style.cssText = 'display:flex !important;align-items:center !important;padding:4px 10px !important;height:34px !important;min-height:0 !important;max-height:34px !important;overflow:hidden !important;';
        const h1 = masthead.querySelector('h1');
        if (h1) h1.style.cssText = 'margin:0 !important;padding:0 !important;font-size:14px !important;line-height:1 !important;';
        const nav = masthead.querySelector('.main-navigation');
        if (nav) {
            const btn = nav.querySelector('.menu-toggle');
            if (btn) btn.style.display = 'none';
            const menu = nav.querySelector('#primary-menu');
            if (menu) menu.style.cssText = 'display:flex !important;gap:0 !important;margin:0 !important;padding:0 !important;list-style:none !important;';
            nav.querySelectorAll('li').forEach(li => li.style.cssText = 'margin:0 !important;padding:0 !important;');
            nav.querySelectorAll('a').forEach(a => a.style.cssText = 'padding:4px 8px !important;font-size:11px !important;white-space:nowrap;color:#333;text-decoration:none;');
        }
    }

    function verifySticky() {
        const masthead = document.getElementById('masthead');
        if (!masthead) return;
        const check = () => {
            const rect = masthead.getBoundingClientRect();
            const ok = rect.top <= 1 && rect.left <= 1;
            console.log(`[A1 Sticky Test] top=${rect.top.toFixed(1)}px height=${rect.height.toFixed(1)}px fixed=${ok ? 'OK' : 'FAIL'}`);
        };
        check();
        window.addEventListener('scroll', check, { passive: true });
    }

    function init() {
        const main = document.querySelector('#main, .site-main, main');
        if (!main) return;

        shrinkHeader();
        verifySticky();
        setInterval(shrinkHeader, 1000);

        const container = document.createElement('div');
        container.id = 'a1-infinite-container';
        main.prepend(container);

        const searchBar = document.createElement('div');
        searchBar.id = 'a1-search-bar';
        const searchInput = document.createElement('input');
        searchInput.id = 'a1-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '搜尋動畫名稱、字幕組、年份...';
        searchBar.appendChild(searchInput);
        container.before(searchBar);

        createPageIndicator();
        createBackTop();
        createLoadingIndicator();

        fetch(API_URL)
            .then(r => r.json())
            .then(data => {
                allData = data;
                renderInitial();
                setupSearch();
                setupScrollListener();
            })
            .catch(err => {
                container.innerHTML = `<div id="a1-end">載入失敗：${err.message}</div>`;
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
