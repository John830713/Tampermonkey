// ==UserScript==
// @name         Web Agent Universal Loader
// @namespace    http://tampermonkey.net/agent
// @version      2.0
// @description  Universal loader — fetches core + modules from server, with module toggle panel
// @author       You
// @match        *://*/*
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_download
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    var SERVER_PORT = 8921;
    var SERVER = GM_getValue('agent_server', 'http://localhost:' + SERVER_PORT);
    var CHECK_INTERVAL = 60000;
    var OVERRIDES_KEY = 'a1_mod_overrides';

    window.__agent_server = SERVER;

    window.__agent_ui = window.__agent_ui || {
        state: 'starting',
        conn: '⏳ server',
        logs: ['[waiting for core.js]'],
        session: '',
        hostname: location.hostname.slice(0, 30),
    };

    var GRANTS = {
        xhr:    typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null,
        set:    typeof GM_setValue !== 'undefined' ? GM_setValue : null,
        get:    typeof GM_getValue !== 'undefined' ? GM_getValue : null,
        del:    typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : null,
        notify: typeof GM_notification !== 'undefined' ? GM_notification : null,
        open:   typeof GM_openInTab !== 'undefined' ? GM_openInTab : null,
        download: typeof GM_download !== 'undefined' ? GM_download : null,
        addStyle: typeof GM_addStyle !== 'undefined' ? GM_addStyle : null,
    };

    function fetchText(url, cb) {
        if (!GRANTS.xhr) return cb('no GM_xmlhttpRequest');
        GRANTS.xhr({
            method: 'GET',
            url: url,
            timeout: 8000,
            onload: function(r) { cb(null, r.responseText); },
            onerror: function() { cb('fetch error: ' + url); },
            ontimeout: function() { cb('timeout: ' + url); }
        });
    }

    function fetchJSON(url, cb) {
        fetchText(url, function(err, text) {
            if (err) return cb(err);
            try { cb(null, JSON.parse(text)); }
            catch(e) { cb('parse error: ' + e.message); }
        });
    }

    function executeScript(code) {
        try {
            var fn = new Function(
                'GM_xmlhttpRequest', 'GM_setValue', 'GM_getValue', 'GM_deleteValue',
                'GM_notification', 'GM_openInTab', 'GM_download', 'GM_addStyle',
                code
            );
            fn(
                GRANTS.xhr, GRANTS.set, GRANTS.get, GRANTS.del,
                GRANTS.notify, GRANTS.open, GRANTS.download, GRANTS.addStyle
            );
        } catch(e) {
            console.error('[UniversalLoader] script error:', e);
        }
    }

    function matchPattern(pattern, url) {
        try {
            var re = pattern
                .replace(/([.+?^${}()|[\]\\])/g, '\\$1')
                .replace(/\*/g, '.*');
            return new RegExp('^' + re + '$').test(url);
        } catch(e) {
            return false;
        }
    }

    function hashStr(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return h;
    }

    function getOverrides() {
        try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY)) || {}; }
        catch(e) { return {}; }
    }

    function isModuleEnabled(mod, overrides) {
        if (overrides[mod.name] !== undefined) return overrides[mod.name];
        return mod.enabled !== false;
    }

    var currentHash = 0;

    function loadAgentCore() {
        var url = SERVER + '/agent.core.js?t=' + Date.now();
        fetchText(url, function(err, code) {
            if (err) {
                console.error('[UniversalLoader] failed to load agent.core.js:', err);
                return;
            }
            executeScript(code);
            console.log('[UniversalLoader] agent.core.js loaded');
        });
    }

    function loadModules() {
        var url = SERVER + '/modules?t=' + Date.now();
        fetchJSON(url, function(err, modules) {
            if (err) {
                console.error('[UniversalLoader] failed to load modules:', err);
                return;
            }
            if (!Array.isArray(modules)) return;

            var locationHref = location.href;
            var overrides = getOverrides();
            var matchedModules = [];
            var loadedCount = 0;

            modules.forEach(function(m) {
                var patterns = Array.isArray(m.match) ? m.match : [m.match];
                var isMatch = patterns.some(function(p) { return matchPattern(p, locationHref); });
                if (!isMatch) return;

                matchedModules.push(m);

                if (!isModuleEnabled(m, overrides)) {
                    console.log('[UniversalLoader] module disabled: ' + m.name);
                    return;
                }

                loadedCount++;
                var scriptUrl = SERVER + '/serve/' + encodeURIComponent(m.script) + '?t=' + Date.now();
                fetchText(scriptUrl, function(err, code) {
                    if (err) {
                        console.error('[UniversalLoader] failed to load ' + m.name + ':', err);
                        return;
                    }
                    executeScript(code);
                    console.log('[UniversalLoader] module loaded: ' + m.name);
                });
            });

            if (matchedModules.length > 0) {
                console.log('[UniversalLoader] ' + loadedCount + '/' + matchedModules.length + ' module(s) loaded for ' + locationHref);
            }
            buildTogglePanel(matchedModules, overrides);
        });
    }

    /* ===================== Toggle Panel ===================== */
    function buildTogglePanel(matchedModules, overrides) {
        if (document.getElementById('a1-toggle-btn')) return;
        GRANTS.addStyle('\
            #a1-toggle-btn {\
                position: fixed;\
                bottom: 12px;\
                left: 12px;\
                z-index: 2147483647;\
                width: 28px;\
                height: 28px;\
                border-radius: 6px;\
                border: 2px solid #666;\
                background: #444;\
                color: #fff;\
                font-size: 13px;\
                cursor: pointer;\
                display: flex;\
                align-items: center;\
                justify-content: center;\
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);\
                transition: all 0.15s;\
                line-height: 1;\
                padding: 0;\
                font-family: inherit;\
            }\
            #a1-toggle-btn:hover { transform: scale(1.1); }\
            #a1-mod-panel {\
                display: none;\
                position: fixed;\
                bottom: 48px;\
                left: 12px;\
                z-index: 2147483647;\
                background: #fff;\
                border: 1px solid #ddd;\
                border-radius: 8px;\
                box-shadow: 0 4px 16px rgba(0,0,0,0.2);\
                padding: 10px 14px;\
                min-width: 220px;\
                font-family: -apple-system, sans-serif;\
                font-size: 13px;\
                color: #333;\
            }\
            #a1-mod-panel.show { display: block; }\
            #a1-mod-panel .mod-title {\
                font-size: 11px;\
                color: #888;\
                margin-bottom: 8px;\
            }\
            #a1-mod-panel .mod-row {\
                display: flex;\
                align-items: center;\
                justify-content: space-between;\
                padding: 5px 0;\
                border-bottom: 1px solid #f0f0f0;\
            }\
            #a1-mod-panel .mod-row:last-child { border-bottom: none; }\
            #a1-mod-panel .mod-info { flex: 1; min-width: 0; }\
            #a1-mod-panel .mod-label {\
                font-size: 13px;\
                color: #333;\
                white-space: nowrap;\
                overflow: hidden;\
                text-overflow: ellipsis;\
            }\
            #a1-mod-panel .mod-sub {\
                font-size: 10px;\
                color: #999;\
                margin-top: 1px;\
            }\
            #a1-mod-panel .mod-switch {\
                position: relative;\
                width: 36px;\
                height: 20px;\
                cursor: pointer;\
                flex-shrink: 0;\
                margin-left: 8px;\
            }\
            #a1-mod-panel .mod-switch input { display: none; }\
            #a1-mod-panel .mod-slider {\
                position: absolute;\
                inset: 0;\
                background: #ccc;\
                border-radius: 20px;\
                transition: background 0.2s;\
            }\
            #a1-mod-panel .mod-slider::before {\
                content: "";\
                position: absolute;\
                width: 16px;\
                height: 16px;\
                left: 2px;\
                top: 2px;\
                background: #fff;\
                border-radius: 50%;\
                transition: transform 0.2s;\
            }\
            #a1-mod-panel .mod-switch input:checked + .mod-slider {\
                background: #2e7d32;\
            }\
            #a1-mod-panel .mod-switch input:checked + .mod-slider::before {\
                transform: translateX(16px);\
            }\
        ');

        var btn = document.createElement('button');
        btn.id = 'a1-toggle-btn';
        btn.textContent = '\u2699';
        btn.title = '模組開關 (' + matchedModules.length + ')';

        var panel = document.createElement('div');
        panel.id = 'a1-mod-panel';

        document.body.appendChild(panel);
        document.body.appendChild(btn);

        try {

        if (matchedModules.length > 0) {
            var title = document.createElement('div');
            title.className = 'mod-title';
            title.textContent = '本頁模組';
            panel.appendChild(title);

            matchedModules.forEach(function(m) {
                var enabled = isModuleEnabled(m, overrides);
                var row = document.createElement('div');
                row.className = 'mod-row';

                var info = document.createElement('div');
                info.className = 'mod-info';
                var labelDiv = document.createElement('div');
                labelDiv.className = 'mod-label';
                labelDiv.textContent = m.name || m.script;
                var subDiv = document.createElement('div');
                subDiv.className = 'mod-sub';
                subDiv.textContent = m.script;
                info.appendChild(labelDiv);
                info.appendChild(subDiv);

                var label = document.createElement('label');
                label.className = 'mod-switch';
                var input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = enabled;
                var slider = document.createElement('span');
                slider.className = 'mod-slider';
                label.appendChild(input);
                label.appendChild(slider);

                input.addEventListener('change', function() {
                    var o = getOverrides();
                    o[m.name] = input.checked;
                    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
                    setTimeout(function() { location.reload(); }, 100);
                });

                row.appendChild(info);
                row.appendChild(label);
                panel.appendChild(row);
            });
        }

        var waSep = document.createElement('div');
        waSep.style.cssText = 'border-top:1px solid #eee;margin:8px 0 6px;';
        panel.appendChild(waSep);

        var waTitle = document.createElement('div');
        waTitle.className = 'mod-title';
        waTitle.textContent = 'WebAgent';
        panel.appendChild(waTitle);

        var waInfo = document.createElement('div');
        waInfo.style.cssText = 'font-size:11px;color:#666;display:flex;gap:8px;margin-bottom:4px;';
        panel.appendChild(waInfo);

        var waLog = document.createElement('div');
        waLog.style.cssText = 'height:80px;overflow-y:auto;background:#1e1e1e;color:#0f0;font:10px/1.4 monospace;padding:4px 6px;border-radius:4px;white-space:pre-wrap;';
        panel.appendChild(waLog);

        function refreshAgentUI() {
            try {
                var ui = window.__agent_ui;
                if (!ui) return;
                var stateColors = { IDLE: '#666', BUSY: '#f59e0b', ERROR: '#ef4444', CONNECTED: '#22c55e' };
                var connColors = { '⏳ server': '#888', '✓ connected': '#22c55e', '✗ no server': '#ef4444' };
                while (waInfo.firstChild) waInfo.removeChild(waInfo.firstChild);
                var s1 = document.createElement('span');
                s1.style.cssText = 'background:' + (stateColors[ui.state] || '#666') + ';color:#fff;padding:1px 5px;border-radius:6px;';
                s1.textContent = ui.state;
                var s2 = document.createElement('span');
                s2.style.cssText = 'background:' + (connColors[ui.conn] || '#888') + ';color:#fff;padding:1px 5px;border-radius:6px;font-size:10px;';
                s2.textContent = ui.conn;
                var s3 = document.createElement('span');
                s3.textContent = ui.hostname || '';
                var s4 = document.createElement('span');
                s4.textContent = (ui.session || '').slice(0, 6);
                waInfo.appendChild(s1);
                waInfo.appendChild(s2);
                waInfo.appendChild(s3);
                waInfo.appendChild(s4);
                waLog.textContent = (ui.logs || []).slice(-20).join('\n');
                waLog.scrollTop = waLog.scrollHeight;
            } catch(e) {}
        }

        refreshAgentUI();
        setInterval(refreshAgentUI, 2000);

        } catch(e) {}

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('show');
        });

        document.addEventListener('click', function(e) {
            if (!panel.contains(e.target) && e.target !== btn) {
                panel.classList.remove('show');
            }
        });
    }

    function checkForUpdates() {
        fetchJSON(SERVER + '/modules?t=' + Date.now(), function(err, data) {
            if (err || !data) return;
            try {
                var newHash = hashStr(JSON.stringify(data));
                if (currentHash !== 0 && newHash !== currentHash) {
                    console.log('[UniversalLoader] modules changed, reloading...');
                    location.reload();
                }
                currentHash = newHash;
            } catch(e) {}
        });
    }

    loadAgentCore();
    loadModules();

    setTimeout(function() {
        if (!document.getElementById('a1-toggle-btn')) {
            buildTogglePanel([], getOverrides());
        }
    }, 3000);

    currentHash = 0;
    fetchJSON(SERVER + '/modules?t=' + Date.now(), function(err, data) {
        if (!err && data) {
            try { currentHash = hashStr(JSON.stringify(data)); } catch(e) {}
        }
    });

    setInterval(checkForUpdates, CHECK_INTERVAL);
})();
