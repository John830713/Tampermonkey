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
// @grant        unsafeEval
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
            #_wa_root {\
                position: fixed;\
                bottom: 12px;\
                right: 12px;\
                z-index: 2147483647;\
                width: 380px;\
                font: 12px/1.4 sans-serif;\
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);\
                border-radius: 6px;\
                overflow: hidden;\
            }\
            #_wa_head {\
                background: #333;\
                color: #0f0;\
                padding: 5px 10px;\
                cursor: pointer;\
                display: flex;\
                justify-content: space-between;\
                align-items: center;\
                user-select: none;\
            }\
            #_wa_state_badge {\
                padding: 1px 6px;\
                border-radius: 8px;\
                font-size: 10px;\
            }\
            #_wa_body {\
                background: #1e1e1e;\
                color: #ccc;\
                padding: 6px 8px;\
            }\
            #_wa_info {\
                font-size: 10px;\
                color: #888;\
                display: flex;\
                gap: 10px;\
                margin-bottom: 2px;\
            }\
            #_wa_conn {\
                font-size: 10px;\
                padding: 1px 4px;\
                border-radius: 3px;\
            }\
            #_wa_log {\
                height: 100px;\
                overflow-y: auto;\
                white-space: pre-wrap;\
                font: 11px/1.4 monospace;\
                margin: 4px 0 0;\
                color: #0f0;\
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

        var waRoot = document.createElement('div');
        waRoot.id = '_wa_root';
        waRoot.style.display = 'none';
        var waHead = document.createElement('div');
        waHead.id = '_wa_head';
        var waHeadLabel = document.createElement('span');
        waHeadLabel.textContent = '\uD83E\uDD16 WebAgent';
        var waHeadBadge = document.createElement('span');
        waHeadBadge.id = '_wa_state_badge';
        waHeadBadge.style.cssText = 'background:#666;color:#fff';
        waHeadBadge.textContent = 'starting';
        waHead.appendChild(waHeadLabel);
        waHead.appendChild(waHeadBadge);
        var waBody = document.createElement('div');
        waBody.id = '_wa_body';
        var waInfo = document.createElement('div');
        waInfo.id = '_wa_info';
        var waConn = document.createElement('span');
        waConn.id = '_wa_conn';
        waConn.style.cssText = 'background:#888;color:#fff';
        waConn.textContent = '\u23F3 server';
        var waHostname = document.createElement('span');
        waHostname.textContent = location.hostname.slice(0, 30);
        var waSession = document.createElement('span');
        waSession.id = '_wa_session';
        waInfo.appendChild(waConn);
        waInfo.appendChild(waHostname);
        waInfo.appendChild(waSession);
        var waLog = document.createElement('div');
        waLog.id = '_wa_log';
        waLog.textContent = '[init]';
        waBody.appendChild(waInfo);
        waBody.appendChild(waLog);
        waHead.addEventListener('click', function() {
            waBody.style.display = waBody.style.display === 'none' ? 'block' : 'none';
        });
        waRoot.appendChild(waHead);
        waRoot.appendChild(waBody);
        document.body.appendChild(waRoot);

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

        var waConsoleRow = document.createElement('div');
        waConsoleRow.className = 'mod-row';
        var waConsoleInfo = document.createElement('div');
        waConsoleInfo.className = 'mod-info';
        var waConsoleLabel = document.createElement('div');
        waConsoleLabel.className = 'mod-label';
        waConsoleLabel.textContent = 'Console';
        var waConsoleSub = document.createElement('div');
        waConsoleSub.className = 'mod-sub';
        waConsoleSub.textContent = 'floating window';
        waConsoleInfo.appendChild(waConsoleLabel);
        waConsoleInfo.appendChild(waConsoleSub);
        var waSwitch = document.createElement('label');
        waSwitch.className = 'mod-switch';
        var waInput = document.createElement('input');
        waInput.type = 'checkbox';
        var waSlider = document.createElement('span');
        waSlider.className = 'mod-slider';
        waSwitch.appendChild(waInput);
        waSwitch.appendChild(waSlider);
        var waKey = 'a1_console_visible';
        waInput.checked = localStorage.getItem(waKey) === 'true';
        waRoot.style.display = waInput.checked ? 'block' : 'none';
        waInput.addEventListener('change', function() {
            localStorage.setItem(waKey, waInput.checked);
            waRoot.style.display = waInput.checked ? 'block' : 'none';
        });
        waConsoleRow.appendChild(waConsoleInfo);
        waConsoleRow.appendChild(waSwitch);
        panel.appendChild(waConsoleRow);

        function refreshAgentUI() {
            try {
                var ui = window.__agent_ui;
                if (!ui) return;
                var stateColors = { IDLE: '#666', BUSY: '#f59e0b', ERROR: '#ef4444', starting: '#666' };
                var connColors = { '\u23F3 server': '#888', '\u2713 connected': '#22c55e', '\u2717 no server': '#ef4444' };
                var sb = document.getElementById('_wa_state_badge');
                if (sb) { sb.textContent = ui.state; sb.style.background = stateColors[ui.state] || '#666'; sb.style.color = '#fff'; }
                var cn = document.getElementById('_wa_conn');
                if (cn) { cn.textContent = ui.conn; cn.style.background = connColors[ui.conn] || '#888'; cn.style.color = '#fff'; }
                var se = document.getElementById('_wa_session');
                if (se) se.textContent = (ui.session || '').slice(0, 6);
                var lg = document.getElementById('_wa_log');
                if (lg) { lg.textContent = (ui.logs || []).slice(-30).join('\n'); lg.scrollTop = lg.scrollHeight; }
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
