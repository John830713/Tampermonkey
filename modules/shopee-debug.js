// ==UserScript==
// @name         Shopee Debug
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  攔截 Shopee 簽到相關 API 請求，彈窗顯示 URL / Headers / Body / Response
// @author       Debug
// @match        https://shopee.tw/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const KEYWORDS = ['checkin', 'coin', 'points', 'sign', 'daily', 'reward', 'check_in', 'checkin_new'];

    function shouldIntercept(url) {
        try {
            const u = new URL(url);
            if (u.hostname !== 'shopee.tw' && !u.hostname.endsWith('.shopee.tw')) return false;
        } catch(e) { return false; }
        const lower = url.toLowerCase();
        return KEYWORDS.some(kw => lower.includes(kw));
    }

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
        try {
            return JSON.stringify(body, null, 2);
        } catch (e) {
            return String(body);
        }
    }

    function showModal(data) {
        const existing = document.getElementById('shopee-debug-modal');
        if (existing) existing.remove();

        const time = new Date().toLocaleTimeString();

        function section(title, content) {
            return '\
    <div style="margin-bottom:12px;">\
      <div style="font-weight:700;font-size:12px;color:#c0392b;margin-bottom:3px;">' + title + '</div>\
      <pre style="background:#f4f4f4;padding:8px 10px;border-radius:5px;margin:0;white-space:pre-wrap;word-break:break-all;border:1px solid #e0e0e0;font-size:12px;">' + escapeHtml(content) + '</pre>\
    </div>';
        }

        var respHtml = '';
        if (data.respStatus) {
            respHtml = '\
    <div style="margin-bottom:12px;">\
      <div style="font-weight:700;font-size:12px;color:#27ae60;margin-bottom:3px;">Response Status</div>\
      <pre style="background:#f0faf0;padding:8px 10px;border-radius:5px;margin:0;white-space:pre-wrap;word-break:break-all;border:1px solid #d5f5d5;font-size:12px;">' + escapeHtml(data.respStatus) + '</pre>\
    </div>\
    <div style="margin-bottom:16px;">\
      <div style="font-weight:700;font-size:12px;color:#27ae60;margin-bottom:3px;">Response Body</div>\
      <pre style="background:#f0faf0;padding:8px 10px;border-radius:5px;margin:0;white-space:pre-wrap;word-break:break-all;border:1px solid #d5f5d5;font-size:12px;">' + escapeHtml(data.respBody) + '</pre>\
    </div>';
        }

        const modal = document.createElement('div');
        modal.id = 'shopee-debug-modal';
        modal.innerHTML = '\
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;">\
  <div style="background:#fff;color:#222;border-radius:10px;padding:24px 28px;max-width:92vw;max-height:88vh;overflow:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.6;box-shadow:0 8px 40px rgba(0,0,0,0.4);">\
    <h2 style="margin:0 0 4px;font-size:17px;color:#c0392b;">\uD83D\uDD0D \u7C3B\u6F3E\u5230\u7C3D\u5230\u8ACB\u6C42</h2>\
    <p style="margin:0 0 16px;color:#888;font-size:12px;">' + time + '</p>\
    ' + section('URL', data.url) + '\
    ' + section('Headers', data.headers || '(no custom headers)') + '\
    ' + section('Body', data.body || '(empty)') + '\
    ' + respHtml + '\
    <div style="display:flex;gap:8px;">\
      <button id="shopee-debug-close" style="background:#c0392b;color:#fff;border:none;padding:8px 24px;border-radius:5px;cursor:pointer;font-size:14px;font-weight:600;">\u95DC\u9589</button>\
      <span style="color:#999;font-size:12px;align-self:center;">\u9078\u53D6\u4E0A\u65B9\u6587\u5B57\u5F8C Ctrl+C \u8907\u88FD</span>\
    </div>\
  </div>\
</div>';
        document.body.appendChild(modal);
        document.getElementById('shopee-debug-close').onclick = function() { modal.remove(); };
    }

    // ------ Hook XMLHttpRequest (prototype level) ------
    const XHR_DATA = new WeakMap();

    const xhrOpenOrig = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        XHR_DATA.set(this, {
            method: (method || '').toUpperCase(),
            url: typeof url === 'string' ? url : String(url),
            headers: {},
            body: null
        });
        return xhrOpenOrig.apply(this, arguments);
    };

    const xhrSetReqHeaderOrig = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        const d = XHR_DATA.get(this);
        if (d) d.headers[name] = value;
        return xhrSetReqHeaderOrig.apply(this, arguments);
    };

    const xhrSendOrig = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        const d = XHR_DATA.get(this);
        if (d && d.method === 'POST' && shouldIntercept(d.url)) {
            d.body = (body === null || body === undefined) ? '(empty)' :
                     (typeof body === 'string' || body instanceof String) ? body :
                     (body instanceof URLSearchParams) ? body.toString() :
                     (body instanceof FormData) ? '[FormData]' :
                     String(body);

            const self = this;
            var loadHandler = function() {
                var respBody;
                try { respBody = self.responseText; } catch(e) { respBody = '(unavailable)'; }
                if (!respBody && self.response) {
                    try { respBody = JSON.stringify(self.response); } catch(e) { respBody = String(self.response); }
                }
                showModal({
                    url: d.url,
                    headers: Object.entries(d.headers).map(function(e) { return e[0] + ': ' + e[1]; }).join('\n'),
                    body: d.body,
                    respStatus: self.status + ' ' + self.statusText,
                    respBody: respBody || '(empty)'
                });
            };
            self.addEventListener('load', loadHandler);
        }
        return xhrSendOrig.apply(this, arguments);
    };

    // ------ Hook fetch ------
    const fetchOrig = window.fetch;
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input :
                  (input && typeof input.url === 'string') ? input.url :
                  (input && typeof input === 'object' && input.toString) ? input.toString() :
                  '';
        var method = (init && init.method) ? init.method.toUpperCase() : 'GET';
        var body = (init && init.body) || null;

        if (method === 'POST' && shouldIntercept(url)) {
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
                    setTimeout(function() {
                        showModal({
                            url: url,
                            headers: hdrStr || '(no headers)',
                            body: bdStr,
                            respStatus: resp.status + ' ' + resp.statusText,
                            respBody: respText || '(empty)'
                        });
                    }, 50);
                });
                return resp;
            });
        }

        return fetchOrig.apply(window, arguments);
    };

    console.log('[Debug] \u8CBB\u7C3B\u6F3E\u7C3D\u5230\u8ACB\u6C42\u4E2D\u2026\u2026');
    console.log('[Debug] Shopee check-in API interceptor ready — go to /shopee-coins and click the button');
})();
