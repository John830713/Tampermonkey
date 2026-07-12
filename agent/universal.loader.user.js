// ==UserScript==
// @name         Web Agent Universal Loader
// @namespace    http://tampermonkey.net/agent
// @version      1.0
// @description  Universal loader — fetches Web Agent core + all modules from server on every page load
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

    window.__agent_server = SERVER;

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
            var matched = 0;

            modules.forEach(function(m) {
                if (m.enabled === false) return;
                var patterns = Array.isArray(m.match) ? m.match : [m.match];
                var isMatch = patterns.some(function(p) { return matchPattern(p, locationHref); });
                if (!isMatch) return;

                matched++;
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

            if (matched > 0) {
                console.log('[UniversalLoader] ' + matched + ' module(s) matched for ' + locationHref);
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

    currentHash = 0;
    fetchJSON(SERVER + '/modules?t=' + Date.now(), function(err, data) {
        if (!err && data) {
            try { currentHash = hashStr(JSON.stringify(data)); } catch(e) {}
        }
    });

    setInterval(checkForUpdates, CHECK_INTERVAL);
})();
