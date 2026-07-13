// ==UserScript==
// @name         Web Agent Universal Loader
// @namespace    http://tampermonkey.net/agent
// @version      3.0
// @description  Bootstrapper — fetches loader-core.js from server (self-updating, never reinstall)
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
    window.__agent_server = SERVER;

    // Pass GM_* APIs to loader-core
    window.__gm = {
        xhr:       typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null,
        set:       typeof GM_setValue !== 'undefined' ? GM_setValue : null,
        get:       typeof GM_getValue !== 'undefined' ? GM_getValue : null,
        del:       typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : null,
        notify:    typeof GM_notification !== 'undefined' ? GM_notification : null,
        open:      typeof GM_openInTab !== 'undefined' ? GM_openInTab : null,
        download:  typeof GM_download !== 'undefined' ? GM_download : null,
        addStyle:  typeof GM_addStyle !== 'undefined' ? GM_addStyle : null,
    };

    // Fetch loader-core.js from server (always fresh, never cached)
    if (!window.__gm.xhr) {
        console.error('[Loader] GM_xmlhttpRequest not available');
        return;
    }
    window.__gm.xhr({
        method: 'GET',
        url: SERVER + '/loader-core.js?t=' + Date.now(),
        timeout: 8000,
        onload: function(res) {
            if (res.status === 200) {
                try {
                    new Function(res.responseText)();
                } catch(e) {
                    console.error('[Loader] core exec error:', e);
                }
            } else {
                console.error('[Loader] core fetch failed:', res.status);
            }
        },
        onerror: function() {
            console.error('[Loader] cannot reach server at ' + SERVER);
        },
        ontimeout: function() {
            console.error('[Loader] server timeout at ' + SERVER);
        }
    });
})();
