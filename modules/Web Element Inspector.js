// ==UserScript==
// @name         Web Element Inspector
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  元素標記工具：hover 預覽、Click 標記、Send 打包到 server
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    let active = false;
    let infoPanel = null;
    let highlight = null;
    let toastTimer = null;

    const SERVER = 'http://localhost:8921';
    const MARK_COLORS = ['#9ece6a','#7aa2f7','#bb9af7','#e0af68','#f7768e','#7dcfff','#73daca','#ff9e64'];
    let marked = [];
    let markOverlays = [];

    /* ======================== CSS ======================== */
    GM_addStyle(`
        /* 邊緣隱藏按鈕 */
        #wai-edge-btn {
            position: fixed !important;
            top: 50% !important;
            left: 0 !important;
            transform: translateY(-50%) !important;
            z-index: 2147483647 !important;
            width: 24px !important;
            height: 64px !important;
            background: rgba(30, 30, 40, 0.15) !important;
            border: 1px solid rgba(100, 140, 255, 0.15) !important;
            border-left: none !important;
            border-radius: 0 6px 6px 0 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: all 0.3s ease !important;
            overflow: hidden !important;
        }
        #wai-edge-btn:hover {
            width: 120px !important;
            height: 36px !important;
            background: rgba(30, 30, 40, 0.92) !important;
            border: 1px solid rgba(100, 140, 255, 0.5) !important;
            border-left: none !important;
            backdrop-filter: blur(8px) !important;
            box-shadow: 2px 0 16px rgba(0,0,0,0.5) !important;
        }
        #wai-edge-btn .wai-edge-label {
            font: 11px/1 'Consolas', monospace !important;
            color: #9ece6a !important;
            white-space: nowrap !important;
            opacity: 0 !important;
            transition: opacity 0.2s ease 0.1s !important;
            user-select: none !important;
            pointer-events: none !important;
        }
        #wai-edge-btn:hover .wai-edge-label { opacity: 1 !important; }
        #wai-edge-btn .wai-edge-dot {
            width: 6px !important; height: 6px !important;
            border-radius: 50% !important;
            background: rgba(100, 140, 255, 0.3) !important;
            flex-shrink: 0 !important;
        }
        #wai-edge-btn:hover .wai-edge-dot { width: 8px !important; height: 8px !important; }
        #wai-edge-btn.wai-on .wai-edge-dot { background: #9ece6a !important; box-shadow: 0 0 6px rgba(158,206,106,0.6) !important; }
        #wai-edge-btn.wai-off .wai-edge-dot { background: #f7768e !important; }

        /* Toast */
        #wai-toast {
            position: fixed !important; top: 50% !important; left: 50% !important;
            transform: translate(-50%, -50%) !important; z-index: 2147483647 !important;
            background: rgba(20,20,30,0.92) !important; color: #eee !important;
            font: 14px/1.4 'Consolas', monospace !important;
            padding: 12px 24px !important; border-radius: 8px !important;
            border: 1px solid rgba(100,140,255,0.5) !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.6) !important;
            pointer-events: none !important; opacity: 0 !important;
            transition: opacity 0.2s !important; text-align: center !important;
            backdrop-filter: blur(8px) !important;
        }
        #wai-toast.wai-show { opacity: 1 !important; }
        #wai-toast .wai-toast-on { color: #9ece6a !important; }
        #wai-toast .wai-toast-off { color: #f7768e !important; }
        #wai-toast .wai-toast-key { color: #7aa2f7 !important; font-size: 12px !important; }

        /* 主面板 */
        #wai-panel {
            position: fixed !important; top: 8px !important; right: 8px !important;
            z-index: 2147483647 !important;
            background: rgba(20,20,30,0.95) !important; color: #eee !important;
            font: 12px/1.5 'Consolas', monospace !important;
            padding: 10px 14px !important; border-radius: 6px !important;
            border: 1px solid rgba(100,140,255,0.4) !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
            pointer-events: auto !important; user-select: text !important;
            backdrop-filter: blur(8px) !important;
            display: none !important; max-width: 440px !important;
            max-height: calc(100vh - 16px) !important; overflow-y: auto !important;
            isolation: isolate !important;
        }
        #wai-panel.wai-visible { display: block !important; }
        #wai-panel .wai-row { display: flex !important; gap: 6px !important; margin-bottom: 2px !important; }
        #wai-panel .wai-label { color: #7aa2f7 !important; flex-shrink: 0 !important; min-width: 50px !important; }
        #wai-panel .wai-value { color: #e0e0e0 !important; word-break: break-all !important; }
        #wai-panel .wai-tag { color: #9ece6a !important; font-weight: bold !important; }
        #wai-panel .wai-id { color: #f7768e !important; }
        #wai-panel .wai-class { color: #e0af68 !important; }
        #wai-panel .wai-coord { color: #73daca !important; }
        #wai-panel .wai-hint { color: #555 !important; font-size: 10px !important; margin-top: 4px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; padding-top: 4px !important; }

        /* 分隔線 */
        #wai-panel .wai-divider { border-top: 1px solid rgba(100,140,255,0.3) !important; margin: 8px 0 !important; }

        /* 標記列表 */
        #wai-panel .wai-mark-item {
            display: flex !important; align-items: center !important; gap: 6px !important;
            padding: 3px 0 !important; font-size: 11px !important;
        }
        #wai-panel .wai-mark-num {
            font-weight: bold !important; flex-shrink: 0 !important;
            padding: 1px 5px !important; border-radius: 3px !important;
            font-size: 10px !important;
        }
        #wai-panel .wai-mark-info { color: #aaa !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        #wai-panel .wai-mark-remove {
            color: #666 !important; cursor: pointer !important; flex-shrink: 0 !important;
            font-size: 10px !important;
        }
        #wai-panel .wai-mark-remove:hover { color: #f7768e !important; }

        /* 按鈕列 */
        #wai-panel .wai-btn-row {
            display: flex !important; gap: 6px !important;
            margin: 0 !important; padding-bottom: 6px !important;
            border-bottom: 1px solid rgba(100,140,255,0.2) !important;
        }
        #wai-panel .wai-btn {
            padding: 4px 12px !important; border: 1px solid rgba(100,140,255,0.4) !important;
            border-radius: 4px !important; background: rgba(100,140,255,0.1) !important;
            color: #ccc !important; cursor: pointer !important; font: 11px/1 'Consolas', monospace !important;
            transition: all 0.15s !important;
        }
        #wai-panel .wai-btn:hover { background: rgba(100,140,255,0.25) !important; color: #fff !important; }
        #wai-panel .wai-btn-send {
            border-color: rgba(158,206,106,0.5) !important;
            background: rgba(158,206,106,0.1) !important;
        }
        #wai-panel .wai-btn-send:hover { background: rgba(158,206,106,0.3) !important; }
        #wai-panel .wai-btn-clear {
            border-color: rgba(247,118,142,0.4) !important;
            background: rgba(247,118,142,0.1) !important;
        }
        #wai-panel .wai-btn-clear:hover { background: rgba(247,118,142,0.3) !important; }

        /* Hover 高亮 */
        #wai-highlight {
            position: fixed !important; z-index: 2147483646 !important;
            pointer-events: none !important;
            border: 2px solid rgba(100,180,255,0.8) !important;
            background: rgba(100,180,255,0.08) !important;
            display: none !important;
        }
        #wai-highlight.wai-visible { display: block !important; }

        /* 尺寸標籤 */
        #wai-size-label {
            position: fixed !important; z-index: 2147483647 !important;
            pointer-events: none !important;
            background: rgba(20,20,30,0.9) !important;
            color: #73daca !important;
            font: 11px/1 'Consolas', monospace !important;
            padding: 2px 6px !important; border-radius: 3px !important;
            white-space: nowrap !important; display: none !important;
        }
        #wai-size-label.wai-visible { display: block !important; }

        /* 標記框（持久化） */
        .wai-mark-box {
            position: fixed !important; z-index: 2147483645 !important;
            pointer-events: none !important; display: block !important;
        }
        .wai-mark-label {
            position: absolute !important; top: -18px !important; left: 0 !important;
            font: bold 11px/14px 'Consolas', monospace !important;
            padding: 1px 5px !important; border-radius: 3px !important;
            white-space: nowrap !important; color: #000 !important;
        }
    `);

    /* ======================== Toast ======================== */
    function showToast(msg, dur) {
        let toast = document.getElementById('wai-toast');
        if (!toast) { toast = document.createElement('div'); toast.id = 'wai-toast'; document.body.appendChild(toast); }
        toast.innerHTML = msg;
        toast.classList.add('wai-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('wai-show'), dur || 1500);
    }

    /* ======================== 工具函數 ======================== */
    function getSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        let path = [];
        let cur = el;
        while (cur && cur.nodeType === 1) {
            let s = cur.tagName.toLowerCase();
            if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
            if (cur.className && typeof cur.className === 'string') {
                const cls = cur.className.trim().split(/\s+/).filter(c => c && !c.startsWith('wai-'));
                if (cls.length) { s += '.' + cls.slice(0,2).map(c => CSS.escape(c)).join('.'); if (cls.length > 2) s += '...'; }
            }
            const p = cur.parentElement;
            if (p) {
                const sibs = Array.from(p.children).filter(c => c.tagName === cur.tagName);
                if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
            }
            path.unshift(s);
            cur = cur.parentElement;
        }
        return path.join(' > ');
    }

    function getPath(el) {
        const parts = [];
        let cur = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
            let name = cur.tagName.toLowerCase();
            if (cur.id) name += '#' + cur.id;
            else if (cur.className && typeof cur.className === 'string') {
                const cls = cur.className.trim().split(/\s+/)[0];
                if (cls && !cls.startsWith('wai-')) name += '.' + cls;
            }
            parts.unshift(name);
            cur = cur.parentElement;
        }
        return parts.join(' / ');
    }

    function getInfo(el) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: (el.className && typeof el.className === 'string')
                ? el.className.trim().split(/\s+/).filter(c => !c.startsWith('wai-')).join(' ') || null : null,
            selector: getSelector(el),
            path: getPath(el),
            rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
            scroll: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY) },
            computed: { display: cs.display, position: cs.position, top: cs.top, left: cs.left,
                width: cs.width, height: cs.height, zIndex: cs.zIndex, overflow: cs.overflow,
                opacity: cs.opacity, textIndent: cs.textIndent, margin: cs.margin, padding: cs.padding },
            parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
            parentId: el.parentElement ? el.parentElement.id : null,
            outerHTML: el.outerHTML,
            textContent: (el.textContent || '').slice(0, 1000)
        };
    }

    /* ======================== 標記管理 ======================== */
    function addMark(el) {
        const idx = marked.length;
        const color = MARK_COLORS[idx % MARK_COLORS.length];
        const info = getInfo(el);
        const label = '元件' + (idx + 1);
        marked.push({ label, color, info, el });

        // 建立持久化框
        const r = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'wai-mark-box';
        box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px solid ${color};background:${color}11;`;
        const lbl = document.createElement('div');
        lbl.className = 'wai-mark-label';
        lbl.style.background = color;
        lbl.textContent = label;
        box.appendChild(lbl);
        document.body.appendChild(box);
        markOverlays.push(box);

        refreshPanel();
        showToast(`<span style="color:${color}">✓ ${label}</span> 已標記 (${info.tag}${info.id ? '#'+info.id : ''})`);
    }

    function removeMark(idx) {
        if (idx < 0 || idx >= marked.length) return;
        marked.splice(idx, 1);
        if (markOverlays[idx]) { markOverlays[idx].remove(); markOverlays.splice(idx, 1); }
        // 重新標號
        for (let i = 0; i < marked.length; i++) {
            marked[i].label = '元件' + (i + 1);
            marked[i].color = MARK_COLORS[i % MARK_COLORS.length];
            if (markOverlays[i]) {
                const lbl = markOverlays[i].querySelector('.wai-mark-label');
                if (lbl) { lbl.textContent = marked[i].label; lbl.style.background = marked[i].color; }
                markOverlays[i].style.borderColor = marked[i].color;
                markOverlays[i].style.background = marked[i].color + '11';
            }
        }
        refreshPanel();
    }

    function clearMarks() {
        marked = [];
        markOverlays.forEach(o => o.remove());
        markOverlays = [];
        refreshPanel();
        showToast('<span class="wai-toast-off">已清除所有標記</span>');
    }

    /* ======================== 面板 ======================== */
    function refreshPanel() {
        let listHtml = '';
        if (marked.length > 0) {
            listHtml += '<div class="wai-divider"></div>';
            marked.forEach((m, i) => {
                const shortInfo = `<${m.info.tag}${m.info.id ? '#'+m.info.id : ''}> ${m.info.rect.w}×${m.info.rect.h}`;
                listHtml += `<div class="wai-mark-item">
                    <span class="wai-mark-num" style="background:${m.color};color:#000;">${m.label}</span>
                    <span class="wai-mark-info" title="${m.info.selector}">${shortInfo}</span>
                    <span class="wai-mark-remove" data-idx="${i}">✕</span>
                </div>`;
            });
        }
        infoPanel.querySelector('#wai-mark-list').innerHTML = listHtml;

        // 更新按鈕區的計數
        var countEl = infoPanel.querySelector('#wai-mark-count');
        if (countEl) countEl.textContent = marked.length > 0 ? '已標記 ' + marked.length : '';
    }

    function updatePanel(el) {
        const info = getInfo(el);
        const markedBadge = marked.find(m => m.el === el);
        const badge = markedBadge
            ? `<span style="background:${markedBadge.color};color:#000;padding:1px 4px;border-radius:3px;font-size:10px;">${markedBadge.label}</span> `
            : '';

        infoPanel.querySelector('#wai-hover').innerHTML = `
            <div style="font-size:11px;color:#7aa2f7;">${badge}Hover</div>
            <div class="wai-row"><span class="wai-label">Tag</span><span class="wai-value wai-tag">&lt;${info.tag}&gt;</span></div>
            <div class="wai-row"><span class="wai-label">ID</span><span class="wai-value wai-id">${info.id || '(none)'}</span></div>
            <div class="wai-row"><span class="wai-label">Class</span><span class="wai-value wai-class">${info.className || '(none)'}</span></div>
            <div class="wai-row"><span class="wai-label">Size</span><span class="wai-value wai-coord">${info.rect.w} × ${info.rect.h}</span></div>
            <div class="wai-row"><span class="wai-label">Page</span><span class="wai-value wai-coord">(${info.scroll.x}, ${info.scroll.y})</span></div>
            <div class="wai-row"><span class="wai-label">View</span><span class="wai-value wai-coord">(${info.rect.x}, ${info.rect.y})</span></div>
        `;
    }

    /* ======================== Send ======================== */
    function getParentChain(el, maxDepth) {
        maxDepth = maxDepth || 5;
        const chain = [];
        let cur = el.parentElement;
        while (cur && chain.length < maxDepth && cur !== document.body && cur !== document.documentElement) {
            const r = cur.getBoundingClientRect();
            const cs = getComputedStyle(cur);
            chain.push({
                tag: cur.tagName.toLowerCase(), id: cur.id || null,
                className: (cur.className && typeof cur.className === 'string') ? cur.className.trim().split(/\s+/).filter(c => !c.startsWith('wai-')).join(' ') : null,
                rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
                computed: { display: cs.display, position: cs.position, flexDirection: cs.flexDirection,
                    justifyContent: cs.justifyContent, alignItems: cs.alignItems, gap: cs.gap,
                    overflow: cs.overflow, width: cs.width, height: cs.height }
            });
            cur = cur.parentElement;
        }
        return chain;
    }

    function getPageSummary() {
        const summary = {};
        summary.doctype = document.doctype ? document.doctype.name : null;
        summary.charset = document.characterSet;
        summary.lang = document.documentElement.lang;
        summary.bodySize = document.body ? { scrollW: document.body.scrollWidth, scrollH: document.body.scrollHeight, clientW: document.body.clientWidth, clientH: document.body.clientHeight } : null;
        summary.headings = [];
        document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(h, i) {
            if (i < 15) summary.headings.push({ tag: h.tagName, text: (h.textContent || '').trim().slice(0, 60) });
        });
        summary.stylesheets = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach(function(l, i) {
            if (i < 10) summary.stylesheets.push(l.href);
        });
        summary.scripts = [];
        document.querySelectorAll('script[src]').forEach(function(s, i) {
            if (i < 10) summary.scripts.push(s.src);
        });
        summary.viewport = { w: window.innerWidth, h: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY };
        return summary;
    }

    function captureScreenshot(cb) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawWindow(window, 0, 0, canvas.width, canvas.height, 'rgba(0,0,0,0)');
            cb(canvas.toDataURL('image/png'));
        } catch(e) {
            console.warn('[WAI] screenshot failed:', e.message);
            cb(null);
        }
    }

    function sendToServer() {
        console.log('[WAI] sendToServer called, marked:', marked.length);
        if (marked.length === 0) { showToast('<span class="wai-toast-off">沒有標記的元件</span>'); return; }

        captureScreenshot(function(screenshot) {
            const selectors = marked.map(function(m) { return m.info.selector; });
            const payload = {
                url: location.href,
                title: document.title,
                elements: marked.map(function(m) {
                    return { label: m.label, ...m.info, parentChain: getParentChain(m.el) };
                }),
                page: getPageSummary(),
                screenshot: screenshot,
                timestamp: Date.now()
            };
            console.log('[WAI] payload size:', JSON.stringify(payload).length, 'bytes');
            try {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: SERVER + '/dump',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(payload),
                    onload: function(res) {
                        console.log('[WAI] dump response:', res.status);
                        // 同時把 selector 加到隱藏清單
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: SERVER + '/hidden',
                            headers: { 'Content-Type': 'application/json' },
                            data: JSON.stringify({ selectors: selectors, url: location.href }),
                            onload: function(res2) {
                                console.log('[WAI] hidden response:', res2.status);
                                showToast('<span class="wai-toast-on">📤 已送出 ' + marked.length + ' 個元件 + 加入隱藏清單</span>', 2000);
                            },
                            onerror: function() {
                                showToast('<span class="wai-toast-on">📤 已送出 ' + marked.length + ' 個元件（隱藏清單失敗）</span>', 2000);
                            }
                        });
                    },
                    onerror: function(err) {
                        console.error('[WAI] GM_xmlhttpRequest error:', err);
                        showToast('<span class="wai-toast-off">Server 未啟動或連線失敗</span>', 2000);
                    }
                });
            } catch(e) {
                console.error('[WAI] sendToServer exception:', e);
                showToast('<span class="wai-toast-off">送出例外: ' + e.message + '</span>', 2000);
            }
        });
    }

    /* ======================== 高亮 ======================== */
    function updateHighlight(el) {
        const r = el.getBoundingClientRect();
        highlight.style.left = r.left + 'px';
        highlight.style.top = r.top + 'px';
        highlight.style.width = r.width + 'px';
        highlight.style.height = r.height + 'px';
        highlight.classList.add('wai-visible');

        const sizeLabel = document.getElementById('wai-size-label');
        sizeLabel.textContent = Math.round(r.width) + '×' + Math.round(r.height);
        sizeLabel.style.left = (r.left + r.width / 2 - 30) + 'px';
        sizeLabel.style.top = (r.top - 22) + 'px';
        if (r.top < 26) sizeLabel.style.top = (r.bottom + 4) + 'px';
        sizeLabel.classList.add('wai-visible');
    }

    /* ======================== 事件 ======================== */
    function onMouseMove(e) {
        if (e.target.closest && (e.target.closest('#wai-panel') || e.target.closest('#wai-edge-btn'))) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el.classList.contains('wai-mark-box')) return;
        updatePanel(el);
        updateHighlight(el);
    }

    function onDocClick(e) {
        if (!active) return;
        // 用 e.target 判斷，不用 elementFromPoint
        if (e.target.closest && (e.target.closest('#wai-panel') || e.target.closest('#wai-edge-btn'))) return;
        if (e.target.classList && e.target.classList.contains('wai-mark-box')) return;
        if (e.target.classList && e.target.classList.contains('wai-mark-label')) return;
        e.preventDefault();
        e.stopPropagation();
        // 用 elementFromPoint 取得實際頁面元素
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (el && !el.closest('#wai-panel') && !el.closest('#wai-edge-btn')) {
            addMark(el);
        }
    }

    function onPanelClick(e) {
        const target = e.target;
        if (target.classList.contains('wai-mark-remove')) {
            e.stopPropagation();
            e.preventDefault();
            removeMark(parseInt(target.dataset.idx));
            return;
        }
        if (target.id === 'wai-send' || target.closest('#wai-send')) {
            e.stopPropagation();
            e.preventDefault();
            console.log('[WAI] Send clicked');
            sendToServer();
            return;
        }
        if (target.id === 'wai-clear' || target.closest('#wai-clear')) {
            e.stopPropagation();
            e.preventDefault();
            clearMarks();
            return;
        }
    }

    function onKeyDown(e) {
        if (!active) return;
        if (e.key === 'Escape') { setActive(false); }
    }

    /* ======================== 開關 ======================== */
    function setActive(state) {
        active = state;
        const btn = document.getElementById('wai-edge-btn');
        if (active) {
            infoPanel.classList.add('wai-visible');
            btn.classList.add('wai-on');
            btn.classList.remove('wai-off');
            document.addEventListener('mousemove', onMouseMove, true);
            document.addEventListener('click', onDocClick, true);
            document.addEventListener('keydown', onKeyDown, true);
            infoPanel.addEventListener('click', onPanelClick, true);
        } else {
            infoPanel.classList.remove('wai-visible');
            highlight.classList.remove('wai-visible');
            document.getElementById('wai-size-label')?.classList.remove('wai-visible');
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('click', onDocClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            infoPanel.removeEventListener('click', onPanelClick, true);
            btn.classList.remove('wai-on');
            btn.classList.add('wai-off');
        }
        showToast(active
            ? '<span class="wai-toast-on">🔍 Inspector ON</span><br><span class="wai-toast-key">Click: 標記 | Esc: 關閉</span>'
            : '<span class="wai-toast-off">Inspector OFF</span>');
    }

    /* ======================== 初始化 ======================== */
    function init() {
        const edgeBtn = document.createElement('div');
        edgeBtn.id = 'wai-edge-btn';
        edgeBtn.classList.add('wai-off');
        edgeBtn.innerHTML = '<div class="wai-edge-dot"></div><span class="wai-edge-label">Inspector</span>';
        edgeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setActive(!active); });
        document.body.appendChild(edgeBtn);

        infoPanel = document.createElement('div');
        infoPanel.id = 'wai-panel';
        infoPanel.innerHTML = `
            <div class="wai-btn-row">
                <button class="wai-btn wai-btn-send" id="wai-send">📤 Send</button>
                <button class="wai-btn wai-btn-clear" id="wai-clear">🗑 Clear</button>
                <span id="wai-mark-count" style="color:#7aa2f7;font-size:11px;line-height:24px;margin-left:4px;"></span>
            </div>
            <div id="wai-hover"></div>
            <div id="wai-mark-list"></div>
            <div class="wai-divider"></div>
            <div class="wai-hint">Hover: 預覽 | Click: 標記 | Esc: 關閉</div>
        `;
        document.body.appendChild(infoPanel);

        // 綁定按鈕（只綁一次）
        infoPanel.querySelector('#wai-send').onclick = function(ev) { ev.stopPropagation(); ev.preventDefault(); console.log('[WAI] Send clicked'); sendToServer(); };
        infoPanel.querySelector('#wai-clear').onclick = function(ev) { ev.stopPropagation(); ev.preventDefault(); clearMarks(); };
        infoPanel.addEventListener('click', function(ev) {
            if (ev.target.classList.contains('wai-mark-remove')) {
                ev.stopPropagation(); ev.preventDefault();
                removeMark(parseInt(ev.target.dataset.idx));
            }
        }, true);

        highlight = document.createElement('div');
        highlight.id = 'wai-highlight';
        document.body.appendChild(highlight);

        const sizeLabel = document.createElement('div');
        sizeLabel.id = 'wai-size-label';
        document.body.appendChild(sizeLabel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
