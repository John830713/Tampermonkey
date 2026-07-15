// loader-core.js — fetched by bootstrapper on every page load
// All GM_* APIs available via window.__gm
(function() {
    'use strict';

    var SERVER = window.__agent_server || 'http://localhost:8921';
    var CHECK_INTERVAL = 60000;
    var OVERRIDES_KEY = 'a1_mod_overrides';

    var GRANTS = window.__gm || {};

    window.__agent_ui = window.__agent_ui || {
        state: 'starting',
        conn: '\u23F3 server',
        logs: ['[waiting for core.js]'],
        session: '',
        hostname: location.hostname.slice(0, 30),
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
            console.error('[LoaderCore] script error:', e);
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
                console.error('[LoaderCore] failed to load agent.core.js:', err);
                return;
            }
            executeScript(code);
            console.log('[LoaderCore] agent.core.js loaded');
        });
    }

    function loadModules() {
        var url = SERVER + '/modules?t=' + Date.now();
        fetchJSON(url, function(err, modules) {
            if (err) {
                console.error('[LoaderCore] failed to load modules:', err);
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
                    console.log('[LoaderCore] module disabled: ' + m.name);
                    return;
                }

                loadedCount++;
                var scriptUrl = SERVER + '/serve/' + encodeURIComponent(m.script) + '?t=' + Date.now();
                fetchText(scriptUrl, function(err, code) {
                    if (err) {
                        console.error('[LoaderCore] failed to load ' + m.name + ':', err);
                        return;
                    }
                    executeScript(code);
                    console.log('[LoaderCore] module loaded: ' + m.name);
                });
            });

            if (matchedModules.length > 0) {
                console.log('[LoaderCore] ' + loadedCount + '/' + matchedModules.length + ' module(s) loaded for ' + locationHref);
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
        btn.title = '\u6A21\u7D44\u958F\u95DC (' + matchedModules.length + ')';

        var panel = document.createElement('div');
        panel.id = 'a1-mod-panel';

        document.body.appendChild(panel);
        document.body.appendChild(btn);

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('show');
        });

        document.addEventListener('click', function(e) {
            if (!panel.contains(e.target) && e.target !== btn) {
                panel.classList.remove('show');
            }
        });

        try {

        if (matchedModules.length > 0) {
            var title = document.createElement('div');
            title.className = 'mod-title';
            title.textContent = '\u672C\u9801\u6A21\u7D44';
            panel.appendChild(title);

            matchedModules.forEach(function(m) {
                if (m.hidden) return;
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
                subDiv.textContent = m.version ? m.script + ' v' + m.version : m.script;
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

        } catch(e) {}
    }

    function checkForUpdates() {
        fetchJSON(SERVER + '/modules?t=' + Date.now(), function(err, data) {
            if (err || !data) return;
            try {
                var newHash = hashStr(JSON.stringify(data));
                if (currentHash !== 0 && newHash !== currentHash) {
                    console.log('[LoaderCore] modules changed, reloading...');
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
