// ==UserScript==
// @name         Debug Toolkit
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Debug 模組主框架：session tagging、側邊欄、Inspector、Editor
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    /* ======================== Config ======================== */
    var SERVER = window.__agent_server || 'http://localhost:8921';
    var STORAGE_KEY = 'dt_sidebar_visible';
    var SITE_FILTER_KEY = 'dt_site_filter';
    var MARK_COLORS = ['#9ece6a','#7aa2f7','#bb9af7','#e0af68','#f7768e','#7dcfff','#73daca','#ff9e64'];

    /* ======================== Site Filter ======================== */
    function getHiddenSites() {
        try { return JSON.parse(GM_getValue(SITE_FILTER_KEY, '[]')); } catch(e) { return []; }
    }

    function getHostname() {
        return location.hostname.replace(/^www\./, '');
    }

    function isSiteEnabled() {
        var hidden = getHiddenSites();
        var host = getHostname();
        return !hidden.some(function(s) {
            return host === s || host.endsWith('.' + s);
        });
    }

    function hideSite(site) {
        var hidden = getHiddenSites();
        if (hidden.indexOf(site) === -1) hidden.push(site);
        GM_setValue(SITE_FILTER_KEY, JSON.stringify(hidden));
    }

    function showSite(site) {
        var hidden = getHiddenSites();
        hidden = hidden.filter(function(s) { return s !== site; });
        GM_setValue(SITE_FILTER_KEY, JSON.stringify(hidden));
    }

    /* ======================== State ======================== */
    var sidebarVisible = false;
    var tagged = false;
    var activeFeature = null;
    var sideRight = true;

    /* ======================== Inspector State ======================== */
    var inspectorActive = false;
    var marked = [];
    var markOverlays = [];
    var highlight = null;
    var sizeLabel = null;
    var toastEl = null;
    var toastTimer = null;
    var inspectorPanel = null;

    /* ======================== Features Registry ======================== */
    var features = {};

    function registerFeature(id, opts) {
        features[id] = {
            id: id,
            label: opts.label || id,
            icon: opts.icon || '?',
            init: opts.init || function() {},
            destroy: opts.destroy || function() {},
            panel: null,
        };
    }

    function activateFeature(id) {
        if (activeFeature === id) return;
        if (activeFeature && features[activeFeature]) {
            features[activeFeature].destroy();
            if (features[activeFeature].panel) {
                features[activeFeature].panel.style.display = 'none';
            }
        }
        activeFeature = id;
        if (features[id]) {
            features[id].init();
            if (features[id].panel) {
                features[id].panel.style.display = 'block';
            }
        }
    }

    /* ======================== Server Communication ======================== */
    function getSessionId() {
        return (window.__agent_ui && window.__agent_ui.session) || null;
    }

    function postTag(tag) {
        var sid = getSessionId();
        if (!sid) return;
        tagged = tag;
        GM_xmlhttpRequest({
            method: 'POST',
            url: SERVER + '/tag',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ session: sid, tagged: tag }),
            timeout: 3000,
            onload: function() {},
            onerror: function() {},
        });
    }

    /* ======================== Sidebar Toggle ======================== */
    function toggleSidebar() {
        sidebarVisible = !sidebarVisible;
        var root = document.getElementById('dt-root');
        if (root) root.style.display = sidebarVisible ? 'flex' : 'none';
        var toggle = document.getElementById('dt-toggle');
        if (toggle) toggle.classList.toggle('active', sidebarVisible);
        localStorage.setItem(STORAGE_KEY, sidebarVisible ? '1' : '0');
        if (sidebarVisible && !tagged) postTag(true);
    }

    /* ======================== Side Switch ======================== */
    function switchSide() {
        sideRight = !sideRight;
        var root = document.getElementById('dt-root');
        var toggle = document.getElementById('dt-toggle');
        if (root) root.classList.toggle('dt-left', !sideRight);
        if (toggle) toggle.classList.toggle('dt-left', !sideRight);
    }

    /* ======================== Toast ======================== */
    function showToast(msg, dur) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'dt-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.innerHTML = msg;
        toastEl.classList.add('dt-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { toastEl.classList.remove('dt-show'); }, dur || 1500);
    }

    /* ======================== Inspector: Utilities ======================== */
    function getSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        var path = [];
        var cur = el;
        while (cur && cur.nodeType === 1) {
            var s = cur.tagName.toLowerCase();
            if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
            if (cur.className && typeof cur.className === 'string') {
                var cls = cur.className.trim().split(/\s+/).filter(function(c) { return c && !c.startsWith('dt-') && !c.startsWith('wai-'); });
                if (cls.length) { s += '.' + cls.slice(0,2).map(function(c) { return CSS.escape(c); }).join('.'); if (cls.length > 2) s += '...'; }
            }
            var p = cur.parentElement;
            if (p) {
                var sibs = Array.prototype.filter.call(p.children, function(c) { return c.tagName === cur.tagName; });
                if (sibs.length > 1) s += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, cur) + 1) + ')';
            }
            path.unshift(s);
            cur = cur.parentElement;
        }
        return path.join(' > ');
    }

    function getPath(el) {
        var parts = [];
        var cur = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
            var name = cur.tagName.toLowerCase();
            if (cur.id) name += '#' + cur.id;
            else if (cur.className && typeof cur.className === 'string') {
                var cls = cur.className.trim().split(/\s+/)[0];
                if (cls && !cls.startsWith('dt-') && !cls.startsWith('wai-')) name += '.' + cls;
            }
            parts.unshift(name);
            cur = cur.parentElement;
        }
        return parts.join(' / ');
    }

    function getInfo(el) {
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: (el.className && typeof el.className === 'string')
                ? el.className.trim().split(/\s+/).filter(function(c) { return !c.startsWith('dt-') && !c.startsWith('wai-'); }).join(' ') || null : null,
            selector: getSelector(el),
            path: getPath(el),
            rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
            scroll: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY) },
            computed: { display: cs.display, position: cs.position, top: cs.top, left: cs.left,
                width: cs.width, height: cs.height, zIndex: cs.zIndex, overflow: cs.overflow,
                opacity: cs.opacity, margin: cs.margin, padding: cs.padding },
            parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
            parentId: el.parentElement ? el.parentElement.id : null,
            outerHTML: el.outerHTML,
            textContent: (el.textContent || '').slice(0, 1000)
        };
    }

    function getParentChain(el, maxDepth) {
        maxDepth = maxDepth || 5;
        var chain = [];
        var cur = el.parentElement;
        while (cur && chain.length < maxDepth && cur !== document.body && cur !== document.documentElement) {
            var r = cur.getBoundingClientRect();
            var cs = getComputedStyle(cur);
            chain.push({
                tag: cur.tagName.toLowerCase(), id: cur.id || null,
                className: (cur.className && typeof cur.className === 'string') ? cur.className.trim().split(/\s+/).filter(function(c) { return !c.startsWith('dt-'); }).join(' ') : null,
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
        var summary = {};
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
        summary.viewport = { w: window.innerWidth, h: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY };
        return summary;
    }

    /* ======================== Inspector: Highlight ======================== */
    function ensureHighlight() {
        if (!highlight) {
            highlight = document.createElement('div');
            highlight.id = 'dt-highlight';
            document.body.appendChild(highlight);
        }
        if (!sizeLabel) {
            sizeLabel = document.createElement('div');
            sizeLabel.id = 'dt-size-label';
            document.body.appendChild(sizeLabel);
        }
    }

    function updateHighlight(el) {
        ensureHighlight();
        var r = el.getBoundingClientRect();
        highlight.style.left = r.left + 'px';
        highlight.style.top = r.top + 'px';
        highlight.style.width = r.width + 'px';
        highlight.style.height = r.height + 'px';
        highlight.classList.add('dt-visible');

        sizeLabel.textContent = Math.round(r.width) + '\u00D7' + Math.round(r.height);
        sizeLabel.style.left = (r.left + r.width / 2 - 30) + 'px';
        sizeLabel.style.top = (r.top - 22) + 'px';
        if (r.top < 26) sizeLabel.style.top = (r.bottom + 4) + 'px';
        sizeLabel.classList.add('dt-visible');
    }

    function hideHighlight() {
        if (highlight) highlight.classList.remove('dt-visible');
        if (sizeLabel) sizeLabel.classList.remove('dt-visible');
    }

    /* ======================== Inspector: Mark Management ======================== */
    function addMark(el) {
        var idx = marked.length;
        var color = MARK_COLORS[idx % MARK_COLORS.length];
        var info = getInfo(el);
        var label = '\u5143\u4EF6' + (idx + 1);
        marked.push({ label: label, color: color, info: info, el: el });

        var r = el.getBoundingClientRect();
        var box = document.createElement('div');
        box.className = 'dt-mark-box';
        box.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:2px solid ' + color + ';background:' + color + '11;';
        var lbl = document.createElement('div');
        lbl.className = 'dt-mark-label';
        lbl.style.background = color;
        lbl.textContent = label;
        box.appendChild(lbl);
        document.body.appendChild(box);
        markOverlays.push(box);

        refreshInspectorPanel();
        showToast('<span style="color:' + color + '">\u2713 ' + label + '</span> \u5DF2\u6A19\u8A18 (' + info.tag + (info.id ? '#' + info.id : '') + ')');
    }

    function removeMark(idx) {
        if (idx < 0 || idx >= marked.length) return;
        marked.splice(idx, 1);
        if (markOverlays[idx]) { markOverlays[idx].remove(); markOverlays.splice(idx, 1); }
        for (var i = 0; i < marked.length; i++) {
            marked[i].label = '\u5143\u4EF6' + (i + 1);
            marked[i].color = MARK_COLORS[i % MARK_COLORS.length];
            if (markOverlays[i]) {
                var lbl = markOverlays[i].querySelector('.dt-mark-label');
                if (lbl) { lbl.textContent = marked[i].label; lbl.style.background = marked[i].color; }
                markOverlays[i].style.borderColor = marked[i].color;
                markOverlays[i].style.background = marked[i].color + '11';
            }
        }
        refreshInspectorPanel();
    }

    function clearMarks() {
        marked = [];
        markOverlays.forEach(function(o) { o.remove(); });
        markOverlays = [];
        refreshInspectorPanel();
        showToast('<span style="color:#f7768e">\u5DF2\u6E05\u9664\u6240\u6709\u6A19\u8A18</span>');
    }

    /* ======================== Inspector: Panel Refresh ======================== */
    function refreshInspectorPanel() {
        if (!inspectorPanel) return;
        var hoverEl = inspectorPanel.querySelector('#dt-insp-hover');
        var markListEl = inspectorPanel.querySelector('#dt-insp-marklist');
        var countEl = inspectorPanel.querySelector('#dt-insp-count');

        if (countEl) countEl.textContent = marked.length > 0 ? '\u5DF2\u6A19\u8A18 ' + marked.length : '';

        if (!markListEl) return;
        var html = '';
        for (var i = 0; i < marked.length; i++) {
            var m = marked[i];
            var shortInfo = '<' + m.info.tag + (m.info.id ? '#' + m.info.id : '') + '> ' + m.info.rect.w + '\u00D7' + m.info.rect.h;
            html += '<div class="dt-insp-mark-item">' +
                '<span class="dt-insp-mark-num" style="background:' + m.color + ';color:#000;">' + m.label + '</span>' +
                '<span class="dt-insp-mark-info" title="' + m.info.selector + '">' + shortInfo + '</span>' +
                '<span class="dt-insp-mark-remove" data-idx="' + i + '">\u2715</span>' +
            '</div>';
        }
        markListEl.innerHTML = html;
    }

    function updateHoverInfo(el) {
        if (!inspectorPanel) return;
        var hoverEl = inspectorPanel.querySelector('#dt-insp-hover');
        if (!hoverEl) return;
        var info = getInfo(el);
        var markedBadge = null;
        for (var i = 0; i < marked.length; i++) {
            if (marked[i].el === el) { markedBadge = marked[i]; break; }
        }
        var badge = markedBadge
            ? '<span style="background:' + markedBadge.color + ';color:#000;padding:1px 4px;border-radius:3px;font-size:10px;">' + markedBadge.label + '</span> '
            : '';

        hoverEl.innerHTML =
            '<div style="font-size:11px;color:#7aa2f7;">' + badge + 'Hover</div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">Tag</span><span class="dt-insp-value dt-insp-tag">&lt;' + info.tag + '&gt;</span></div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">ID</span><span class="dt-insp-value dt-insp-id">' + (info.id || '(none)') + '</span></div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">Class</span><span class="dt-insp-value dt-insp-class">' + (info.className || '(none)') + '</span></div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">Size</span><span class="dt-insp-value dt-insp-coord">' + info.rect.w + ' \u00D7 ' + info.rect.h + '</span></div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">Page</span><span class="dt-insp-value dt-insp-coord">(' + info.scroll.x + ', ' + info.scroll.y + ')</span></div>' +
            '<div class="dt-insp-row"><span class="dt-insp-label">View</span><span class="dt-insp-value dt-insp-coord">(' + info.rect.x + ', ' + info.rect.y + ')</span></div>';
    }

    /* ======================== Inspector: Send ======================== */
    function captureScreenshot(cb) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawWindow(window, 0, 0, canvas.width, canvas.height, 'rgba(0,0,0,0)');
            cb(canvas.toDataURL('image/png'));
        } catch(e) {
            cb(null);
        }
    }

    function sendToServer() {
        if (marked.length === 0) { showToast('<span style="color:#f7768e">\u6C92\u6709\u6A19\u8A18\u7684\u5143\u4EF6</span>'); return; }
        captureScreenshot(function(screenshot) {
            var selectors = marked.map(function(m) { return m.info.selector; });
            var payload = {
                url: location.href,
                title: document.title,
                elements: marked.map(function(m) {
                    return { label: m.label, selector: m.info.selector, tag: m.info.tag, id: m.info.id,
                        className: m.info.className, rect: m.info.rect, scroll: m.info.scroll,
                        computed: m.info.computed, parentChain: getParentChain(m.el), outerHTML: m.info.outerHTML };
                }),
                page: getPageSummary(),
                screenshot: screenshot,
                timestamp: Date.now()
            };
            GM_xmlhttpRequest({
                method: 'POST',
                url: SERVER + '/dump',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                onload: function() {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: SERVER + '/hidden',
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ selectors: selectors, url: location.href }),
                        onload: function() {
                            showToast('<span style="color:#9ece6a">\uD83D\uDCE4 \u5DF2\u9001\u51FA ' + marked.length + ' \u500B\u5143\u4EF6 + \u52A0\u5165\u96B1\u85CF\u6E05\u55AE</span>', 2000);
                        },
                        onerror: function() {
                            showToast('<span style="color:#9ece6a">\uD83D\uDCE4 \u5DF2\u9001\u51FA ' + marked.length + ' \u500B\u5143\u4EF6</span>', 2000);
                        }
                    });
                },
                onerror: function() {
                    showToast('<span style="color:#f7768e">Server \u672A\u555F\u52D5\u6216\u9023\u7DDA\u5931\u6557</span>', 2000);
                }
            });
        });
    }

    /* ======================== Inspector: Events ======================== */
    function isInsideUI(el) {
        if (!el || !el.closest) return false;
        return el.closest('#dt-root') || el.closest('#dt-toggle') || el.closest('.dt-mark-box');
    }

    function onInspectorMouseMove(e) {
        if (isInsideUI(e.target)) return;
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el.classList.contains('dt-mark-box')) return;
        updateHoverInfo(el);
        updateHighlight(el);
    }

    function onInspectorClick(e) {
        if (!inspectorActive) return;
        if (isInsideUI(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (el && !isInsideUI(el)) {
            addMark(el);
        }
    }

    function onInspectorKeyDown(e) {
        if (!inspectorActive) return;
        if (e.key === 'Escape') { setInspectorActive(false); }
    }

    function onInspectorPanelClick(e) {
        var target = e.target;
        if (target.classList.contains('dt-insp-mark-remove')) {
            e.stopPropagation();
            e.preventDefault();
            removeMark(parseInt(target.dataset.idx));
            return;
        }
    }

    /* ======================== Inspector: Activate/Deactivate ======================== */
    function setInspectorActive(state) {
        inspectorActive = state;
        if (inspectorActive) {
            document.addEventListener('mousemove', onInspectorMouseMove, true);
            document.addEventListener('click', onInspectorClick, true);
            document.addEventListener('keydown', onInspectorKeyDown, true);
            if (inspectorPanel) inspectorPanel.addEventListener('click', onInspectorPanelClick, true);
            showToast('<span style="color:#9ece6a">\uD83D\uDD0D Inspector ON</span><br><span style="color:#7aa2f7;font-size:11px;">Click: \u6A19\u8A18 | Esc: \u95DC\u9589</span>');
        } else {
            document.removeEventListener('mousemove', onInspectorMouseMove, true);
            document.removeEventListener('click', onInspectorClick, true);
            document.removeEventListener('keydown', onInspectorKeyDown, true);
            if (inspectorPanel) inspectorPanel.removeEventListener('click', onInspectorPanelClick, true);
            hideHighlight();
            showToast('<span style="color:#f7768e">Inspector OFF</span>');
        }
        var toggleBtn = document.getElementById('dt-insp-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = inspectorActive ? '\u25A0 Stop' : '\u25B6 Start';
            toggleBtn.classList.toggle('dt-insp-active', inspectorActive);
        }
    }

    /* ======================== Console: State ======================== */
    var consolePanel = null;
    var consoleFilter = 'all';
    var consolePollTimer = null;

    /* ======================== Console: Build Panel ======================== */
    function buildConsolePanel(panel) {
        consolePanel = panel;
        panel.innerHTML = '';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';

        // Status bar
        var status = document.createElement('div');
        status.id = 'dt-console-status';
        panel.appendChild(status);

        // Filters
        var filters = document.createElement('div');
        filters.id = 'dt-console-filters';
        var levels = ['all', 'log', 'warn', 'error', 'info', 'agent'];
        for (var i = 0; i < levels.length; i++) {
            var fb = document.createElement('button');
            fb.textContent = levels[i];
            fb.dataset.level = levels[i];
            if (levels[i] === consoleFilter) fb.classList.add('dt-cf-active');
            fb.addEventListener('click', (function(lvl) {
                return function(e) {
                    e.stopPropagation();
                    consoleFilter = lvl;
                    var allBtns = filters.querySelectorAll('button');
                    for (var j = 0; j < allBtns.length; j++) {
                        allBtns[j].classList.toggle('dt-cf-active', allBtns[j].dataset.level === lvl);
                    }
                    refreshConsoleLog();
                };
            })(levels[i]));
            filters.appendChild(fb);
        }

        var clearBtn = document.createElement('button');
        clearBtn.textContent = '\uD83D\uDDD1 Clear';
        clearBtn.style.cssText = 'margin-left:auto;border-color:rgba(247,118,142,0.4);background:rgba(247,118,142,0.1);color:#aaa;';
        clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var logs = window.__agent_consoleLogs;
            if (logs) logs.length = 0;
            var ui = window.__agent_ui;
            if (ui) ui.logs = ['[cleared]'];
            refreshConsoleLog();
        });
        filters.appendChild(clearBtn);
        panel.appendChild(filters);

        // Log area
        var logDiv = document.createElement('div');
        logDiv.id = 'dt-console-log';
        panel.appendChild(logDiv);

        refreshConsoleStatus();
        refreshConsoleLog();

        consolePollTimer = setInterval(function() {
            if (activeFeature === 'console') {
                refreshConsoleStatus();
                refreshConsoleLog();
            }
        }, 1500);
    }

    function refreshConsoleStatus() {
        if (!consolePanel) return;
        var status = consolePanel.querySelector('#dt-console-status');
        if (!status) return;
        var ui = window.__agent_ui || {};
        var stateColors = { IDLE: '#666', BUSY: '#f59e0b', ERROR: '#ef4444', starting: '#666' };
        var connColors = { '\u23F3 server': '#888', '\u2713 connected': '#22c55e', '\u2717 no server': '#ef4444' };

        status.innerHTML =
            '<div class="dt-cs-item"><span class="dt-cs-label">State</span><span class="dt-cs-value" style="background:' + (stateColors[ui.state] || '#666') + '">' + (ui.state || '?') + '</span></div>' +
            '<div class="dt-cs-item"><span class="dt-cs-label">Conn</span><span class="dt-cs-value" style="background:' + (connColors[ui.conn] || '#888') + '">' + (ui.conn || '?') + '</span></div>' +
            '<div class="dt-cs-item"><span class="dt-cs-label">Session</span><span class="dt-cs-value" style="background:#33467c">' + (ui.session || '?').slice(0, 8) + '</span></div>';
    }

    function refreshConsoleLog() {
        if (!consolePanel) return;
        var logDiv = consolePanel.querySelector('#dt-console-log');
        if (!logDiv) return;

        var lines = [];

        // Agent logs
        var ui = window.__agent_ui;
        if (ui && ui.logs) {
            var agentLogs = ui.logs.slice(-50);
            for (var i = 0; i < agentLogs.length; i++) {
                if (consoleFilter !== 'all' && consoleFilter !== 'agent') continue;
                lines.push({ type: 'agent', msg: agentLogs[i] });
            }
        }

        // Page console logs
        var pageLogs = window.__agent_consoleLogs;
        if (pageLogs) {
            var sliced = pageLogs.slice(-100);
            for (var j = 0; j < sliced.length; j++) {
                var entry = sliced[j];
                if (consoleFilter !== 'all' && entry.level !== consoleFilter) continue;
                var time = new Date(entry.time).toLocaleTimeString();
                lines.push({ type: entry.level, msg: entry.msg, time: time });
            }
        }

        // Render
        var html = '';
        var start = Math.max(0, lines.length - 200);
        for (var k = start; k < lines.length; k++) {
            var l = lines[k];
            var cls = 'dt-cl-' + l.type;
            var timeStr = l.time ? '<span class="dt-cl-time">' + l.time + '</span>' : '';
            var tagStr = l.type !== 'log' ? '<span class="dt-cl-tag" style="background:rgba(100,140,255,0.2);color:#7aa2f7;">' + l.type + '</span>' : '';
            html += '<div class="dt-cl-line ' + cls + '">' + timeStr + tagStr + escapeHtml(l.msg) + '</div>';
        }
        logDiv.innerHTML = html || '<div class="dt-cl-line dt-cl-info" style="color:#565f89;">No logs yet</div>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ======================== Console: Cleanup ======================== */
    function destroyConsole() {
        if (consolePollTimer) { clearInterval(consolePollTimer); consolePollTimer = null; }
        consolePanel = null;
    }
    function buildInspectorPanel(panel) {
        inspectorPanel = panel;
        panel.innerHTML = '';

        var btnRow = document.createElement('div');
        btnRow.className = 'dt-insp-btn-row';

        var toggleBtn = document.createElement('button');
        toggleBtn.id = 'dt-insp-toggle';
        toggleBtn.className = 'dt-insp-btn';
        toggleBtn.textContent = '\u25B6 Start';
        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            setInspectorActive(!inspectorActive);
        });

        var sendBtn = document.createElement('button');
        sendBtn.className = 'dt-insp-btn dt-insp-btn-send';
        sendBtn.textContent = '\uD83D\uDCE4 Send';
        sendBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sendToServer();
        });

        var clearBtn = document.createElement('button');
        clearBtn.className = 'dt-insp-btn dt-insp-btn-clear';
        clearBtn.textContent = '\uD83D\uDDD1 Clear';
        clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            clearMarks();
        });

        var countSpan = document.createElement('span');
        countSpan.id = 'dt-insp-count';
        countSpan.style.cssText = 'color:#7aa2f7;font-size:11px;line-height:24px;margin-left:4px;';

        btnRow.appendChild(toggleBtn);
        btnRow.appendChild(sendBtn);
        btnRow.appendChild(clearBtn);
        btnRow.appendChild(countSpan);
        panel.appendChild(btnRow);

        var hoverDiv = document.createElement('div');
        hoverDiv.id = 'dt-insp-hover';
        panel.appendChild(hoverDiv);

        var markList = document.createElement('div');
        markList.id = 'dt-insp-marklist';
        panel.appendChild(markList);

        var hint = document.createElement('div');
        hint.className = 'dt-insp-hint';
        hint.textContent = 'Hover: \u9810\u89BD | Click: \u6A19\u8A18 | Esc: \u95DC\u9589';
        panel.appendChild(hint);
    }

    /* ======================== CSS ======================== */
    function injectStyles() {
        GM_addStyle(
            /* Sidebar core */
            '#dt-toggle {' +
            '  position: fixed; top: 50%; right: 0; z-index: 2147483647;' +
            '  transform: translateY(-50%);' +
            '  background: #1a1b26; color: #7aa2f7; border: 1px solid #33467c;' +
            '  border-right: none; border-radius: 6px 0 0 6px;' +
            '  padding: 6px 8px; cursor: pointer; font-size: 16px;' +
            '  transition: background 0.15s, right 0.2s;' +
            '}' +
            '#dt-toggle:hover { background: #24283b; }' +
            '#dt-toggle.active { right: 300px; }' +

            '#dt-root {' +
            '  position: fixed; top: 0; right: 0; z-index: 2147483646;' +
            '  width: 300px; height: 100vh;' +
            '  background: #1a1b26; color: #c0caf5;' +
            '  border-left: 1px solid #33467c;' +
            '  display: none; flex-direction: column;' +
            '  font: 13px/1.5 "JetBrains Mono", "Fira Code", monospace;' +
            '  box-shadow: -2px 0 12px rgba(0,0,0,0.4);' +
            '}' +

            '#dt-header {' +
            '  display: flex; align-items: center; justify-content: space-between;' +
            '  padding: 8px 12px; background: #16161e;' +
            '  border-bottom: 1px solid #33467c; font-weight: bold;' +
            '}' +
            '#dt-header button {' +
            '  background: none; border: none; color: #7aa2f7;' +
            '  cursor: pointer; font-size: 16px;' +
            '}' +

            '#dt-session {' +
            '  padding: 8px 12px; border-bottom: 1px solid #33467c;' +
            '  font-size: 11px; color: #565f89;' +
            '  display: flex; align-items: center; gap: 8px;' +
            '}' +
            '#dt-session .tagged { color: #9ece6a; }' +
            '#dt-session .untagged { color: #f7768e; }' +

            '#dt-site-filter {' +
            '  display: flex; align-items: center; gap: 6px;' +
            '  padding: 4px 12px; border-bottom: 1px solid #33467c;' +
            '  font-size: 11px; color: #565f89;' +
            '}' +
            '.dt-sf-site { color: #7aa2f7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }' +
            '.dt-sf-mode { color: #565f89; font-size: 10px; flex-shrink: 0; }' +
            '.dt-sf-btn {' +
            '  padding: 1px 6px; border: 1px solid rgba(100,140,255,0.3); border-radius: 3px;' +
            '  background: rgba(247,118,142,0.15); color: #f7768e; cursor: pointer;' +
            '  font: 10px/1.4 "JetBrains Mono", monospace; transition: all 0.15s;' +
            '}' +
            '.dt-sf-btn:hover { background: rgba(247,118,142,0.3); }' +
            '.dt-sf-btn.dt-sf-on { background: rgba(158,206,106,0.15); color: #9ece6a; border-color: rgba(158,206,106,0.4); }' +
            '.dt-sf-btn.dt-sf-on:hover { background: rgba(158,206,106,0.3); }' +

            '#dt-tabs {' +
            '  display: flex; border-bottom: 1px solid #33467c;' +
            '}' +
            '#dt-tabs button {' +
            '  flex: 1; padding: 6px 4px; background: none; border: none;' +
            '  color: #565f89; cursor: pointer; font-size: 12px;' +
            '  border-bottom: 2px solid transparent;' +
            '  transition: color 0.15s, border-color 0.15s;' +
            '}' +
            '#dt-tabs button:hover { color: #c0caf5; }' +
            '#dt-tabs button.active { color: #7aa2f7; border-bottom-color: #7aa2f7; }' +

            '#dt-panels {' +
            '  flex: 1; overflow-y: auto; padding: 8px;' +
            '}' +
            '.dt-panel { display: none; }' +

            /* Left side */
            '#dt-root.dt-left { right: auto; left: 0; border-left: none; border-right: 1px solid #33467c; box-shadow: 2px 0 12px rgba(0,0,0,0.4); }' +
            '#dt-toggle.dt-left { right: auto; left: 0; border-right: 1px solid #33467c; border-left: none; border-radius: 0 6px 6px 0; transition: background 0.15s, left 0.2s; }' +
            '#dt-toggle.dt-left.active { left: 300px; }' +

            /* Toast */
            '#dt-toast {' +
            '  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);' +
            '  z-index: 2147483647; background: rgba(20,20,30,0.92); color: #eee;' +
            '  font: 13px/1.4 "JetBrains Mono", monospace;' +
            '  padding: 10px 20px; border-radius: 8px;' +
            '  border: 1px solid rgba(100,140,255,0.5);' +
            '  box-shadow: 0 4px 24px rgba(0,0,0,0.6);' +
            '  pointer-events: none; opacity: 0; transition: opacity 0.2s;' +
            '  text-align: center; backdrop-filter: blur(8px);' +
            '}' +
            '#dt-toast.dt-show { opacity: 1; }' +

            /* Highlight overlay */
            '#dt-highlight {' +
            '  position: fixed; z-index: 2147483645;' +
            '  pointer-events: none;' +
            '  border: 2px solid rgba(100,180,255,0.8);' +
            '  background: rgba(100,180,255,0.08);' +
            '  display: none;' +
            '}' +
            '#dt-highlight.dt-visible { display: block; }' +

            /* Size label */
            '#dt-size-label {' +
            '  position: fixed; z-index: 2147483647;' +
            '  pointer-events: none;' +
            '  background: rgba(20,20,30,0.9); color: #73daca;' +
            '  font: 11px/1 "JetBrains Mono", monospace;' +
            '  padding: 2px 6px; border-radius: 3px;' +
            '  white-space: nowrap; display: none;' +
            '}' +
            '#dt-size-label.dt-visible { display: block; }' +

            /* Mark boxes */
            '.dt-mark-box {' +
            '  position: fixed; z-index: 2147483644;' +
            '  pointer-events: none; display: block;' +
            '}' +
            '.dt-mark-label {' +
            '  position: absolute; top: -18px; left: 0;' +
            '  font: bold 11px/14px "JetBrains Mono", monospace;' +
            '  padding: 1px 5px; border-radius: 3px;' +
            '  white-space: nowrap; color: #000;' +
            '}' +

            /* Inspector panel */
            '.dt-insp-btn-row {' +
            '  display: flex; gap: 6px; padding-bottom: 6px;' +
            '  border-bottom: 1px solid rgba(100,140,255,0.2);' +
            '}' +
            '.dt-insp-btn {' +
            '  padding: 4px 12px; border: 1px solid rgba(100,140,255,0.4);' +
            '  border-radius: 4px; background: rgba(100,140,255,0.1);' +
            '  color: #ccc; cursor: pointer; font: 11px/1 "JetBrains Mono", monospace;' +
            '  transition: all 0.15s;' +
            '}' +
            '.dt-insp-btn:hover { background: rgba(100,140,255,0.25); color: #fff; }' +
            '.dt-insp-btn.dt-insp-active { background: rgba(158,206,106,0.2); border-color: rgba(158,206,106,0.5); color: #9ece6a; }' +
            '.dt-insp-btn-send { border-color: rgba(158,206,106,0.5); background: rgba(158,206,106,0.1); }' +
            '.dt-insp-btn-send:hover { background: rgba(158,206,106,0.3); }' +
            '.dt-insp-btn-clear { border-color: rgba(247,118,142,0.4); background: rgba(247,118,142,0.1); }' +
            '.dt-insp-btn-clear:hover { background: rgba(247,118,142,0.3); }' +

            '#dt-insp-hover { font-size: 12px; }' +
            '.dt-insp-row { display: flex; gap: 6px; margin-bottom: 2px; }' +
            '.dt-insp-label { color: #7aa2f7; flex-shrink: 0; min-width: 40px; }' +
            '.dt-insp-value { color: #e0e0e0; word-break: break-all; }' +
            '.dt-insp-tag { color: #9ece6a; font-weight: bold; }' +
            '.dt-insp-id { color: #f7768e; }' +
            '.dt-insp-class { color: #e0af68; }' +
            '.dt-insp-coord { color: #73daca; }' +

            '#dt-insp-marklist { margin-top: 6px; }' +
            '.dt-insp-mark-item {' +
            '  display: flex; align-items: center; gap: 6px;' +
            '  padding: 3px 0; font-size: 11px;' +
            '}' +
            '.dt-insp-mark-num {' +
            '  font-weight: bold; flex-shrink: 0;' +
            '  padding: 1px 5px; border-radius: 3px; font-size: 10px;' +
            '}' +
            '.dt-insp-mark-info { color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
            '.dt-insp-mark-remove { color: #666; cursor: pointer; flex-shrink: 0; font-size: 10px; }' +
            '.dt-insp-mark-remove:hover { color: #f7768e; }' +

            '.dt-insp-hint { color: #565f89; font-size: 10px; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; }' +

            /* Console panel */
            '#dt-console-status {' +
            '  display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(100,140,255,0.2);' +
            '  font-size: 11px; flex-wrap: wrap;' +
            '}' +
            '#dt-console-status .dt-cs-item { display: flex; align-items: center; gap: 4px; }' +
            '#dt-console-status .dt-cs-label { color: #565f89; }' +
            '#dt-console-status .dt-cs-value { padding: 1px 6px; border-radius: 3px; font-size: 10px; color: #fff; }' +
            '#dt-console-filters {' +
            '  display: flex; gap: 4px; padding: 6px 0; border-bottom: 1px solid rgba(100,140,255,0.2);' +
            '}' +
            '#dt-console-filters button {' +
            '  padding: 2px 8px; border: 1px solid rgba(100,140,255,0.3); border-radius: 3px;' +
            '  background: rgba(100,140,255,0.1); color: #aaa; cursor: pointer;' +
            '  font: 10px/1.4 "JetBrains Mono", monospace; transition: all 0.15s;' +
            '}' +
            '#dt-console-filters button:hover { background: rgba(100,140,255,0.25); color: #fff; }' +
            '#dt-console-filters button.dt-cf-active { background: rgba(100,140,255,0.3); color: #7aa2f7; border-color: #7aa2f7; }' +
            '#dt-console-log {' +
            '  flex: 1; overflow-y: auto; font: 11px/1.4 "JetBrains Mono", monospace;' +
            '  background: #0d1117; border-radius: 4px; padding: 6px; margin-top: 6px;' +
            '  max-height: 400px; min-height: 200px;' +
            '}' +
            '.dt-cl-line { padding: 1px 4px; border-radius: 2px; white-space: pre-wrap; word-break: break-all; }' +
            '.dt-cl-line:hover { background: rgba(255,255,255,0.05); }' +
            '.dt-cl-log { color: #c9d1d9; }' +
            '.dt-cl-warn { color: #e0af68; background: rgba(224,175,104,0.08); }' +
            '.dt-cl-error { color: #f7768e; background: rgba(247,118,142,0.08); }' +
            '.dt-cl-info { color: #7aa2f7; }' +
            '.dt-cl-agent { color: #9ece6a; background: rgba(158,206,106,0.08); }' +
            '.dt-cl-time { color: #565f89; margin-right: 6px; font-size: 10px; }' +
            '.dt-cl-tag { font-size: 9px; padding: 0 3px; border-radius: 2px; margin-right: 4px; }'
        );
    }

    /* ======================== DOM Build ======================== */
    function buildSidebar() {
        injectStyles();

        var toggle = document.createElement('div');
        toggle.id = 'dt-toggle';
        toggle.textContent = '\uD83D\uDEE0';
        toggle.title = 'Debug Toolkit';
        if (!sideRight) toggle.classList.add('dt-left');
        toggle.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            toggleSidebar();
        });
        document.body.appendChild(toggle);

        var root = document.createElement('div');
        root.id = 'dt-root';
        if (!sideRight) root.classList.add('dt-left');

        var header = document.createElement('div');
        header.id = 'dt-header';
        var title = document.createElement('span');
        title.textContent = 'Debug Toolkit';
        var swapBtn = document.createElement('button');
        swapBtn.id = 'dt-swap-btn';
        swapBtn.textContent = '\u21C4';
        swapBtn.title = 'Switch side';
        swapBtn.addEventListener('click', function(e) { e.stopPropagation(); switchSide(); });
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '\u2715';
        closeBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleSidebar(); });
        header.appendChild(title);
        header.appendChild(swapBtn);
        header.appendChild(closeBtn);
        root.appendChild(header);

        var session = document.createElement('div');
        session.id = 'dt-session';
        session.innerHTML = '<span class="untagged">Not tagged</span>';
        root.appendChild(session);

        var siteFilter = document.createElement('div');
        siteFilter.id = 'dt-site-filter';
        var currentSite = getHostname();
        var isActive = isSiteEnabled();
        var hidden = getHiddenSites();
        var siteLabel = document.createElement('span');
        siteLabel.className = 'dt-sf-site';
        siteLabel.title = location.href;
        siteLabel.textContent = currentSite;
        var modeLabel = document.createElement('span');
        modeLabel.className = 'dt-sf-mode';
        modeLabel.textContent = hidden.length > 0 ? hidden.length + ' hidden' : 'All sites';
        var sfBtn = document.createElement('button');
        sfBtn.className = 'dt-sf-btn' + (isActive ? ' dt-sf-on' : '');
        sfBtn.title = isActive ? 'Hide debug tool on this site' : 'Show debug tool on this site';
        sfBtn.textContent = isActive ? 'Visible' : 'Hidden';
        sfBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var host = getHostname();
            if (isSiteEnabled()) {
                hideSite(host);
                sfBtn.textContent = 'Hidden';
                sfBtn.classList.remove('dt-sf-on');
            } else {
                showSite(host);
                sfBtn.textContent = 'Visible';
                sfBtn.classList.add('dt-sf-on');
            }
            var h = getHiddenSites();
            modeLabel.textContent = h.length > 0 ? h.length + ' hidden' : 'All sites';
        });
        siteFilter.appendChild(siteLabel);
        siteFilter.appendChild(modeLabel);
        siteFilter.appendChild(sfBtn);
        root.appendChild(siteFilter);

        var tabs = document.createElement('div');
        tabs.id = 'dt-tabs';
        root.appendChild(tabs);

        var panels = document.createElement('div');
        panels.id = 'dt-panels';
        root.appendChild(panels);

        document.body.appendChild(root);

        if (localStorage.getItem(STORAGE_KEY) === '1') toggleSidebar();

        return { root: root, tabs: tabs, panels: panels, session: session };
    }

    /* ======================== Session Update ======================== */
    function updateSessionDisplay(el) {
        var sid = getSessionId();
        if (!sid) { el.innerHTML = '<span class="untagged">No session</span>'; return; }
        var tagClass = tagged ? 'tagged' : 'untagged';
        var tagText = tagged ? 'Tagged' : 'Not tagged';
        el.innerHTML = '<span class="' + tagClass + '">' + tagText + '</span> ' +
                       '<span style="color:#565f89">' + sid.slice(0, 12) + '</span>';
    }

    /* ======================== Init ======================== */
    var dom = null;

    function init() {
        dom = buildSidebar();
        setInterval(function() {
            if (sidebarVisible && dom) updateSessionDisplay(dom.session);
        }, 2000);
        console.log('[DebugToolkit] v0.2 loaded');
    }

    /* ======================== Register Features ======================== */
    registerFeature('inspector', {
        label: 'Inspector',
        icon: '\uD83D\uDD0D',
        init: function() {
            if (features.inspector.panel) buildInspectorPanel(features.inspector.panel);
        },
        destroy: function() {
            setInspectorActive(false);
        },
    });

    registerFeature('editor', {
        label: 'Editor',
        icon: '\u270F',
        init: function() {},
        destroy: function() {},
    });

    registerFeature('console', {
        label: 'Console',
        icon: '\uD83D\uDCCB',
        init: function() {
            if (features.console.panel) buildConsolePanel(features.console.panel);
        },
        destroy: function() {
            destroyConsole();
        },
    });

    /* ======================== Build Feature Tabs ======================== */
    function buildFeatureTabs() {
        if (!dom) return;
        var keys = Object.keys(features);
        for (var i = 0; i < keys.length; i++) {
            var f = features[keys[i]];
            var tab = document.createElement('button');
            tab.textContent = f.icon + ' ' + f.label;
            tab.dataset.feature = f.id;
            tab.addEventListener('click', (function(id) {
                return function(e) {
                    e.stopPropagation();
                    activateFeature(id);
                    var allTabs = dom.tabs.querySelectorAll('button');
                    for (var j = 0; j < allTabs.length; j++) {
                        allTabs[j].classList.toggle('active', allTabs[j].dataset.feature === id);
                    }
                };
            })(f.id));
            dom.tabs.appendChild(tab);

            var panel = document.createElement('div');
            panel.className = 'dt-panel';
            panel.id = 'dt-panel-' + f.id;
            dom.panels.appendChild(panel);
            f.panel = panel;
        }

        if (keys.length > 0) {
            activateFeature(keys[0]);
            dom.tabs.querySelector('button').classList.add('active');
        }
    }

    /* ======================== Bootstrap ======================== */
    function boot() {
        if (!isSiteEnabled()) {
            console.log('[DebugToolkit] disabled for this site (' + getHostname() + ')');
            return;
        }
        init();
        buildFeatureTabs();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
