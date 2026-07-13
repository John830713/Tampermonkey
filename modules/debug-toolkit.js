// ==UserScript==
// @name         Debug Toolkit
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Debug 模組主框架：session tagging、側邊欄、功能分頁
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    /* ======================== Config ======================== */
    var SERVER = window.__agent_server || 'http://localhost:8921';
    var STORAGE_KEY = 'dt_sidebar_visible';
    var STORAGE_SIDE = 'dt_side_right';

    /* ======================== State ======================== */
    var sidebarVisible = false;
    var tagged = false;
    var activeFeature = null;
    var sideRight = localStorage.getItem(STORAGE_SIDE) !== 'left';

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
        if (root) {
            root.style.display = sidebarVisible ? 'flex' : 'none';
        }
        var toggle = document.getElementById('dt-toggle');
        if (toggle) {
            toggle.classList.toggle('active', sidebarVisible);
        }
        localStorage.setItem(STORAGE_KEY, sidebarVisible ? '1' : '0');

        if (sidebarVisible && !tagged) {
            postTag(true);
        }
    }

    /* ======================== Side Switch ======================== */
    function switchSide() {
        sideRight = !sideRight;
        localStorage.setItem(STORAGE_SIDE, sideRight ? 'right' : 'left');
        var root = document.getElementById('dt-root');
        var toggle = document.getElementById('dt-toggle');
        if (root) root.classList.toggle('dt-left', !sideRight);
        if (toggle) toggle.classList.toggle('dt-left', !sideRight);
        var swapBtn = document.getElementById('dt-swap-btn');
        if (swapBtn) swapBtn.textContent = sideRight ? '\u21C4' : '\u21C4';
    }

    /* ======================== CSS ======================== */
    function injectStyles() {
        GM_addStyle(
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
            '.dt-panel-hint {' +
            '  color: #565f89; font-size: 11px; text-align: center;' +
            '  padding: 20px 0;' +
            '}' +

            '#dt-root.dt-left {' +
            '  right: auto; left: 0;' +
            '  border-left: none; border-right: 1px solid #33467c;' +
            '  box-shadow: 2px 0 12px rgba(0,0,0,0.4);' +
            '}' +
            '#dt-toggle.dt-left {' +
            '  right: auto; left: 0;' +
            '  border-right: 1px solid #33467c; border-left: none;' +
            '  border-radius: 0 6px 6px 0;' +
            '  transition: background 0.15s, left 0.2s;' +
            '}' +
            '#dt-toggle.dt-left.active { left: 300px; }' +
        '');
    }

    /* ======================== DOM Build ======================== */
    function buildSidebar() {
        injectStyles();

        // Toggle button
        var toggle = document.createElement('div');
        toggle.id = 'dt-toggle';
        toggle.textContent = '\uD83D\uDEE0';  // 🛠
        toggle.title = 'Debug Toolkit';
        if (!sideRight) toggle.classList.add('dt-left');
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebar();
        });
        document.body.appendChild(toggle);

        // Sidebar root
        var root = document.createElement('div');
        root.id = 'dt-root';
        if (!sideRight) root.classList.add('dt-left');

        // Header
        var header = document.createElement('div');
        header.id = 'dt-header';
        var title = document.createElement('span');
        title.textContent = 'Debug Toolkit';
        var swapBtn = document.createElement('button');
        swapBtn.id = 'dt-swap-btn';
        swapBtn.textContent = '\u21C4';
        swapBtn.title = 'Switch side';
        swapBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            switchSide();
        });
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '\u2715';
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSidebar();
        });
        header.appendChild(title);
        header.appendChild(swapBtn);
        header.appendChild(closeBtn);
        root.appendChild(header);

        // Session info
        var session = document.createElement('div');
        session.id = 'dt-session';
        session.innerHTML = '<span class="untagged">Not tagged</span>';
        root.appendChild(session);

        // Tabs
        var tabs = document.createElement('div');
        tabs.id = 'dt-tabs';
        root.appendChild(tabs);

        // Panels container
        var panels = document.createElement('div');
        panels.id = 'dt-panels';
        root.appendChild(panels);

        document.body.appendChild(root);

        // Restore sidebar state
        if (localStorage.getItem(STORAGE_KEY) === '1') {
            toggleSidebar();
        }

        return { root: root, tabs: tabs, panels: panels, session: session };
    }

    /* ======================== Session Update ======================== */
    function updateSessionDisplay(el) {
        var sid = getSessionId();
        if (!sid) {
            el.innerHTML = '<span class="untagged">No session</span>';
            return;
        }
        var tagClass = tagged ? 'tagged' : 'untagged';
        var tagText = tagged ? 'Tagged' : 'Not tagged';
        el.innerHTML = '<span class="' + tagClass + '">' + tagText + '</span> ' +
                       '<span style="color:#565f89">' + sid.slice(0, 12) + '</span>';
    }

    /* ======================== Init ======================== */
    var dom = null;

    function init() {
        dom = buildSidebar();

        // Periodic session update
        setInterval(function() {
            if (sidebarVisible && dom) {
                updateSessionDisplay(dom.session);
            }
        }, 2000);

        console.log('[DebugToolkit] loaded');
    }

    /* ======================== Register Built-in Features ======================== */
    // Placeholder features — each will be expanded later

    registerFeature('inspector', {
        label: 'Inspector',
        icon: '\uD83D\uDD0D',  // 🔍
        init: function() {
            // TODO: migrate from web-element-inspector.js
        },
        destroy: function() {
            // TODO: cleanup
        },
    });

    registerFeature('editor', {
        label: 'Editor',
        icon: '\u270F',  // ✏
        init: function() {
            // TODO: DOM editor
        },
        destroy: function() {
            // TODO: cleanup
        },
    });

    registerFeature('console', {
        label: 'Console',
        icon: '\uD83D\uDCCB',  // 📋
        init: function() {
            // TODO: console viewer
        },
        destroy: function() {
            // TODO: cleanup
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
                    // Update tab active state
                    var allTabs = dom.tabs.querySelectorAll('button');
                    for (var j = 0; j < allTabs.length; j++) {
                        allTabs[j].classList.toggle('active', allTabs[j].dataset.feature === id);
                    }
                };
            })(f.id));
            dom.tabs.appendChild(tab);

            // Create panel
            var panel = document.createElement('div');
            panel.className = 'dt-panel';
            panel.id = 'dt-panel-' + f.id;
            var hint = document.createElement('div');
            hint.className = 'dt-panel-hint';
            hint.textContent = f.label + ' — coming soon';
            panel.appendChild(hint);
            dom.panels.appendChild(panel);
            f.panel = panel;
        }

        // Auto-activate first feature
        if (keys.length > 0) {
            activateFeature(keys[0]);
            dom.tabs.querySelector('button').classList.add('active');
        }
    }

    /* ======================== Bootstrap ======================== */
    function boot() {
        init();
        buildFeatureTabs();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
