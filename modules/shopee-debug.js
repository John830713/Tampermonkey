// ==UserScript==
// @name         Shopee Debug
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  攔截 Shopee coins 頁所有 API 請求，右上角小 badge 點擊展開；其他頁面只攔截簽到相關
// @author       Debug
// @match        https://shopee.tw/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    var captured = [];

    function shouldIntercept(url) {
        if (isCoinsPage) return true;
        try {
            var u = new URL(url);
            if (u.hostname !== 'shopee.tw' && !u.hostname.endsWith('.shopee.tw')) return false;
        } catch(e) { return false; }
        var lower = url.toLowerCase();
        return KEYWORDS.some(function(kw) { return lower.includes(kw); });
    }

    var KEYWORDS = ['checkin', 'coin', 'points', 'sign', 'daily', 'reward', 'check_in', 'checkin_new'];

    function escapeHtml(str) {
        if (str === null || str === undefined) return '(null)';
        if (typeof str === 'string' && str === '') return '(empty string)';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatBody(body) {
        if (!body) return '(empty)';
        if (typeof body === 'string') return body;
        if (body instanceof URLSearchParams) return body.toString();
        try { return JSON.stringify(body, null, 2); } catch (e) { return String(body); }
    }

    function record(entry) {
        captured.push(entry);
        console.log('[Debug #' + captured.length + ']', entry.method, entry.url);
        updateBadge();
    }

    function showSummary() {
        if (!captured.length) return;
        var existing = document.getElementById('shopee-debug-modal');
        if (existing) existing.remove();

        var html = '';
        for (var i = 0; i < captured.length; i++) {
            var c = captured[i];
            var respSnippet = (c.respBody || '').substring(0, 200);
            html += '<div style="margin-bottom:16px;border:1px solid #ddd;border-radius:6px;padding:12px;">'
                + '<div style="font-weight:700;font-size:13px;color:#2c3e50;margin-bottom:6px;">'
                + '#' + (i+1) + ' ' + escapeHtml(c.method) + ' ' + escapeHtml(c.url) + '</div>'
                + (c.body && c.body !== '(empty)' ? '<pre style="background:#fff3e0;padding:6px 8px;border-radius:4px;margin:4px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;">Body: ' + escapeHtml(c.body) + '</pre>' : '')
                + (c.respStatus ? '<pre style="background:#e8f5e9;padding:6px 8px;border-radius:4px;margin:4px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;">' + escapeHtml(c.respStatus) + '\n' + escapeHtml(respSnippet) + '</pre>' : '')
                + '</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'shopee-debug-modal';
        modal.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;">'
            + '<div style="background:#fff;color:#222;border-radius:10px;padding:24px 28px;max-width:92vw;max-height:88vh;overflow:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.6;box-shadow:0 8px 40px rgba(0,0,0,0.4);">'
            + '<h2 style="margin:0 0 4px;font-size:17px;color:#c0392b;">Shopee API Requests (' + captured.length + ')</h2>'
            + '<p style="margin:0 0 16px;color:#888;font-size:12px;">' + new Date().toLocaleTimeString() + (isCoinsPage ? ' [coins page - all requests]' : ' [keyword filter]') + '</p>'
            + html
            + '<div style="display:flex;gap:8px;">'
            + '<button id="shopee-debug-close" style="background:#c0392b;color:#fff;border:none;padding:8px 24px;border-radius:5px;cursor:pointer;font-size:14px;font-weight:600;">Close</button>'
            + '<span style="color:#999;font-size:12px;align-self:center;">Select text then Ctrl+C to copy</span>'
            + '</div></div></div>';
        document.body.appendChild(modal);
        document.getElementById('shopee-debug-close').onclick = function() { modal.remove(); };
    }

    // Floating badge — click to show summary
    var badge = null;
    function updateBadge() {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'shopee-debug-badge';
            badge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:999999;background:#c0392b;color:#fff;font:bold 12px sans-serif;padding:4px 8px;border-radius:4px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
            badge.title = 'Shopee Debug — click to show API list';
            badge.onclick = function() { showSummary(); };
            document.body.appendChild(badge);
        }
        badge.textContent = captured.length ? ('API: ' + captured.length) : 'Debug';
    }

    if (isCoinsPage) {
        setTimeout(updateBadge, 1000);
    }

    // ------ Hook XMLHttpRequest ------
    var XHR_DATA = new WeakMap();

    var xhrOpenOrig = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        XHR_DATA.set(this, {
            method: (method || '').toUpperCase(),
            url: typeof url === 'string' ? url : String(url),
            headers: {},
            body: null
        });
        return xhrOpenOrig.apply(this, arguments);
    };

    var xhrSetReqHeaderOrig = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        var d = XHR_DATA.get(this);
        if (d) d.headers[name] = value;
        return xhrSetReqHeaderOrig.apply(this, arguments);
    };

    var xhrSendOrig = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        var d = XHR_DATA.get(this);
        if (d && shouldIntercept(d.url)) {
            var bodyStr = (body === null || body === undefined) ? '(empty)' :
                     (typeof body === 'string' || body instanceof String) ? body :
                     (body instanceof URLSearchParams) ? body.toString() :
                     (body instanceof FormData) ? '[FormData]' :
                     String(body);

            var self = this;
            var loadHandler = function() {
                var respBody;
                try { respBody = self.responseText; } catch(e) { respBody = '(unavailable)'; }
                if (!respBody && self.response) {
                    try { respBody = JSON.stringify(self.response); } catch(e) { respBody = String(self.response); }
                }
                record({
                    method: d.method,
                    url: d.url,
                    headers: Object.entries(d.headers).map(function(e) { return e[0] + ': ' + e[1]; }).join('\n'),
                    body: bodyStr,
                    respStatus: self.status + ' ' + self.statusText,
                    respBody: respBody || '(empty)'
                });
            };
            self.addEventListener('load', loadHandler);
        }
        return xhrSendOrig.apply(this, arguments);
    };

    // ------ Hook fetch ------
    var fetchOrig = window.fetch;
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input :
                  (input && typeof input.url === 'string') ? input.url :
                  (input && typeof input === 'object' && input.toString) ? input.toString() :
                  '';
        var method = (init && init.method) ? init.method.toUpperCase() : 'GET';
        var body = (init && init.body) || null;

        if (shouldIntercept(url)) {
            var headers = (init && init.headers) || {};
            var hdrStr = '';
            if (typeof headers === 'object' && headers !== null) {
                if (typeof Headers !== 'undefined' && headers instanceof Headers) {
                    var arr = [];
                    headers.forEach(function(v, k) { arr.push(k + ': ' + v); });
                    hdrStr = arr.join('\n');
                } else if (Array.isArray(headers)) {
                    hdrStr = headers.map(function(h) { return h[0] + ': ' + h[1]; }).join('\n');
                } else {
                    hdrStr = Object.keys(headers).map(function(k) { return k + ': ' + headers[k]; }).join('\n');
                }
            }
            var bdStr = formatBody(body);

            return fetchOrig.apply(window, arguments).then(function(resp) {
                var respClone = resp.clone();
                respClone.text().then(function(respText) {
                    record({
                        method: method,
                        url: url,
                        headers: hdrStr || '(no headers)',
                        body: bdStr,
                        respStatus: resp.status + ' ' + resp.statusText,
                        respBody: respText || '(empty)'
                    });
                });
                return resp;
            });
        }

        return fetchOrig.apply(window, arguments);
    };

    console.log('[Debug] Shopee API interceptor v2.0 ready');
    console.log('[Debug] Coins page: capturing ALL requests. Other pages: keyword filter only.');
    console.log('[Debug] Summary modal auto-shows in 3s on coins page, or run: showSummary()');
    window.showSummary = showSummary;
})();
