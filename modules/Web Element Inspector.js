// ==UserScript==
// @name         Web Element Inspector
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  元素偵測工具：左側邊緣 hover 顯現按鈕，click 切換開關
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    let active = false;
    let infoPanel = null;
    let highlight = null;
    let locked = false;
    let toastTimer = null;

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
            opacity: 1 !important;
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
            font: 11px/1 'Consolas', 'Monaco', monospace !important;
            color: #9ece6a !important;
            white-space: nowrap !important;
            opacity: 0 !important;
            transition: opacity 0.2s ease 0.1s !important;
            user-select: none !important;
            pointer-events: none !important;
        }
        #wai-edge-btn:hover .wai-edge-label {
            opacity: 1 !important;
        }
        #wai-edge-btn .wai-edge-dot {
            width: 6px !important;
            height: 6px !important;
            border-radius: 50% !important;
            background: rgba(100, 140, 255, 0.3) !important;
            transition: background 0.2s !important;
            flex-shrink: 0 !important;
        }
        #wai-edge-btn:hover .wai-edge-dot {
            width: 8px !important;
            height: 8px !important;
        }
        #wai-edge-btn.wai-on .wai-edge-dot {
            background: #9ece6a !important;
            box-shadow: 0 0 6px rgba(158, 206, 106, 0.6) !important;
        }
        #wai-edge-btn.wai-on .wai-edge-label {
            color: #9ece6a !important;
        }
        #wai-edge-btn.wai-off .wai-edge-dot {
            background: #f7768e !important;
        }
        #wai-edge-btn.wai-off .wai-edge-label {
            color: #f7768e !important;
        }
        #wai-edge-btn.wai-on {
            border-color: rgba(158, 206, 106, 0.5) !important;
        }
        #wai-edge-btn.wai-off {
            border-color: rgba(247, 118, 142, 0.3) !important;
        }

        /* Toast 通知 */
        #wai-toast {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            z-index: 2147483647 !important;
            background: rgba(20, 20, 30, 0.92) !important;
            color: #eee !important;
            font: 14px/1.4 'Consolas', 'Monaco', monospace !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            border: 1px solid rgba(100, 140, 255, 0.5) !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.6) !important;
            pointer-events: none !important;
            opacity: 0 !important;
            transition: opacity 0.2s !important;
            backdrop-filter: blur(8px) !important;
            text-align: center !important;
            white-space: nowrap !important;
        }
        #wai-toast.wai-show { opacity: 1 !important; }
        #wai-toast .wai-toast-on { color: #9ece6a !important; }
        #wai-toast .wai-toast-off { color: #f7768e !important; }
        #wai-toast .wai-toast-key { color: #7aa2f7 !important; font-size: 12px !important; }

        /* 懸浮資訊面板 */
        #wai-panel {
            position: fixed !important;
            top: 8px !important;
            right: 8px !important;
            z-index: 2147483647 !important;
            background: rgba(20, 20, 30, 0.95) !important;
            color: #eee !important;
            font: 12px/1.5 'Consolas', 'Monaco', monospace !important;
            padding: 10px 14px !important;
            border-radius: 6px !important;
            border: 1px solid rgba(100, 140, 255, 0.4) !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
            pointer-events: auto !important;
            max-width: 420px !important;
            min-width: 280px !important;
            user-select: text !important;
            backdrop-filter: blur(8px) !important;
            display: none !important;
        }
        #wai-panel.wai-visible { display: block !important; }
        #wai-panel .wai-row { display: flex !important; gap: 6px !important; margin-bottom: 2px !important; }
        #wai-panel .wai-label { color: #7aa2f7 !important; flex-shrink: 0 !important; min-width: 52px !important; }
        #wai-panel .wai-value { color: #e0e0e0 !important; word-break: break-all !important; }
        #wai-panel .wai-tag { color: #9ece6a !important; font-weight: bold !important; }
        #wai-panel .wai-id { color: #f7768e !important; }
        #wai-panel .wai-class { color: #e0af68 !important; }
        #wai-panel .wai-selector { color: #bb9af7 !important; font-size: 11px !important; padding-top: 4px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; margin-top: 4px !important; }
        #wai-panel .wai-path { color: #7dcfff !important; font-size: 11px !important; padding-top: 4px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; margin-top: 4px !important; }
        #wai-panel .wai-coord { color: #73daca !important; }
        #wai-panel .wai-hint { color: #666 !important; font-size: 10px !important; margin-top: 6px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; padding-top: 4px !important; }
        #wai-panel .wai-copied { color: #9ece6a !important; font-weight: bold !important; }

        /* 高亮框 */
        #wai-highlight {
            position: fixed !important;
            z-index: 2147483646 !important;
            pointer-events: none !important;
            border: 2px solid rgba(100, 180, 255, 0.8) !important;
            background: rgba(100, 180, 255, 0.08) !important;
            transition: none !important;
            display: none !important;
        }
        #wai-highlight.wai-visible { display: block !important; }
        #wai-highlight.wai-locked { border-color: rgba(255, 180, 50, 0.9) !important; background: rgba(255, 180, 50, 0.1) !important; }

        /* 尺寸標籤 */
        #wai-size-label {
            position: fixed !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            background: rgba(20, 20, 30, 0.9) !important;
            color: #73daca !important;
            font: 11px/1 'Consolas', monospace !important;
            padding: 2px 6px !important;
            border-radius: 3px !important;
            white-space: nowrap !important;
            display: none !important;
        }
        #wai-size-label.wai-visible { display: block !important; }
    `);

    /* ======================== Toast ======================== */
    function showToast(on) {
        let toast = document.getElementById('wai-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'wai-toast';
            document.body.appendChild(toast);
        }
        if (on) {
            toast.innerHTML = '<span class="wai-toast-on">🔍 Inspector ON</span><br><span class="wai-toast-key">Click: 鎖定 | Ctrl+C: 複製 | Esc: 關閉</span>';
        } else {
            toast.innerHTML = '<span class="wai-toast-off">Inspector OFF</span>';
        }
        toast.classList.add('wai-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('wai-show'), 1500);
    }

    /* ======================== 工具函數 ======================== */
    function getSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        let path = [];
        while (el && el.nodeType === 1) {
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                path.unshift(`#${CSS.escape(el.id)}`);
                break;
            }
            if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('wai-'));
                if (classes.length) {
                    selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
                    if (classes.length > 2) selector += '...';
                }
            }
            const parent = el.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (siblings.length > 1) {
                    const idx = siblings.indexOf(el) + 1;
                    selector += `:nth-of-type(${idx})`;
                }
            }
            path.unshift(selector);
            el = el.parentElement;
        }
        return path.join(' > ');
    }

    function getPath(el) {
        const parts = [];
        while (el && el !== document.body && el !== document.documentElement) {
            let name = el.tagName.toLowerCase();
            if (el.id) name += `#${el.id}`;
            else if (el.className && typeof el.className === 'string') {
                const cls = el.className.trim().split(/\s+/)[0];
                if (cls && !cls.startsWith('wai-')) name += `.${cls}`;
            }
            parts.unshift(name);
            el = el.parentElement;
        }
        return parts.join(' / ');
    }

    function getCoords(el) {
        const r = el.getBoundingClientRect();
        return {
            x: Math.round(r.left + window.scrollX),
            y: Math.round(r.top + window.scrollY),
            rx: Math.round(r.left),
            ry: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height)
        };
    }

    /* ======================== 面板更新 ======================== */
    function updatePanel(el) {
        const tag = el.tagName.toLowerCase();
        const id = el.id || '(none)';
        const cls = (el.className && typeof el.className === 'string')
            ? el.className.trim().split(/\s+/).filter(c => !c.startsWith('wai-')).join(' ') || '(none)'
            : '(none)';
        const selector = getSelector(el);
        const path = getPath(el);
        const c = getCoords(el);

        infoPanel.innerHTML = `
            <div class="wai-row"><span class="wai-label">Tag</span><span class="wai-value wai-tag">&lt;${tag}&gt;</span></div>
            <div class="wai-row"><span class="wai-label">ID</span><span class="wai-value wai-id">${id}</span></div>
            <div class="wai-row"><span class="wai-label">Class</span><span class="wai-value wai-class">${cls}</span></div>
            <div class="wai-row"><span class="wai-label">Size</span><span class="wai-value wai-coord">${c.w} × ${c.h}</span></div>
            <div class="wai-row"><span class="wai-label">Page</span><span class="wai-value wai-coord">(${c.x}, ${c.y})</span></div>
            <div class="wai-row"><span class="wai-label">View</span><span class="wai-value wai-coord">(${c.rx}, ${c.ry})</span></div>
            <div class="wai-selector" title="Click to copy">📌 ${selector}</div>
            <div class="wai-path" title="Click to copy">📁 ${path}</div>
            <div class="wai-hint">Click: Lock/Unlock | Ctrl+C: Copy selector | Esc: Close</div>
        `;
    }

    function updateHighlight(el) {
        const r = el.getBoundingClientRect();
        highlight.style.left = r.left + 'px';
        highlight.style.top = r.top + 'px';
        highlight.style.width = r.width + 'px';
        highlight.style.height = r.height + 'px';
        highlight.classList.add('wai-visible');

        const sizeLabel = document.getElementById('wai-size-label');
        sizeLabel.textContent = `${Math.round(r.width)}×${Math.round(r.height)}`;
        sizeLabel.style.left = (r.left + r.width / 2 - 30) + 'px';
        sizeLabel.style.top = (r.top - 22) + 'px';
        if (r.top < 26) sizeLabel.style.top = (r.bottom + 4) + 'px';
        sizeLabel.classList.add('wai-visible');
    }

    /* ======================== 事件處理 ======================== */
    function onMouseMove(e) {
        if (locked) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el.closest('#wai-panel') || el.id === 'wai-highlight' || el.id === 'wai-size-label') return;

        updatePanel(el);
        updateHighlight(el);
    }

    function onClick(e) {
        if (!active) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;
        if (el.closest('#wai-panel') || el.closest('#wai-edge-btn')) return;

        if (locked && highlight.classList.contains('wai-locked')) {
            locked = false;
            highlight.classList.remove('wai-locked');
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        locked = true;
        highlight.classList.add('wai-locked');
        updatePanel(el);
        updateHighlight(el);
    }

    function onKeyDown(e) {
        if (!active) return;
        if (e.key === 'Escape') {
            if (locked) {
                locked = false;
                highlight.classList.remove('wai-locked');
            }
        }
        if (e.key === 'c' && e.ctrlKey && locked) {
            e.preventDefault();
            const selector = infoPanel.querySelector('.wai-selector')?.textContent?.replace('📌 ', '') || '';
            navigator.clipboard.writeText(selector).catch(() => {});
            const copied = document.createElement('span');
            copied.className = 'wai-copied';
            copied.textContent = ' ✓ copied!';
            infoPanel.querySelector('.wai-selector')?.appendChild(copied);
            setTimeout(() => copied.remove(), 1500);
        }
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
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onKeyDown, true);
        } else {
            infoPanel.classList.remove('wai-visible');
            highlight.classList.remove('wai-visible', 'wai-locked');
            document.getElementById('wai-size-label')?.classList.remove('wai-visible');
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            btn.classList.remove('wai-on');
            btn.classList.add('wai-off');
            locked = false;
        }
        showToast(active);
    }

    /* ======================== 初始化 ======================== */
    function init() {
        /* 邊緣隱藏按鈕 */
        const edgeBtn = document.createElement('div');
        edgeBtn.id = 'wai-edge-btn';
        edgeBtn.classList.add('wai-off');
        edgeBtn.innerHTML = '<div class="wai-edge-dot"></div><span class="wai-edge-label">Inspector</span>';
        edgeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActive(!active);
        });
        document.body.appendChild(edgeBtn);

        /* 資訊面板 */
        infoPanel = document.createElement('div');
        infoPanel.id = 'wai-panel';
        document.body.appendChild(infoPanel);

        /* 高亮框 */
        highlight = document.createElement('div');
        highlight.id = 'wai-highlight';
        document.body.appendChild(highlight);

        /* 尺寸標籤 */
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
