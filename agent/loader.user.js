// ==UserScript==
// @name         Web Agent
// @namespace    http://tampermonkey.net/agent
// @version      1.0
// @description  Web Agent Loader — fetches latest agent code from server on every page load
// @author       Gemini
// @match        *://*/*
// @connect      localhost
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_openInTab
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    var GRANTS = {
        xhr:    typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null,
        set:    typeof GM_setValue !== 'undefined' ? GM_setValue : null,
        get:    typeof GM_getValue !== 'undefined' ? GM_getValue : null,
        del:    typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : null,
        notify: typeof GM_notification !== 'undefined' ? GM_notification : null,
        open:   typeof GM_openInTab !== 'undefined' ? GM_openInTab : null,
    };
    var url = 'http://localhost:8921/agent.core.js?t=' + Date.now();
    GRANTS.xhr({
        method: 'GET',
        url: url,
        onload: function(r) {
            try {
                var fn = new Function('grants', r.responseText);
                fn(GRANTS);
            } catch(e) {
                console.error('[WebAgent] load error:', e);
            }
        },
        onerror: function() {
            console.error('[WebAgent] failed to fetch core from', url);
        }
    });
})();
