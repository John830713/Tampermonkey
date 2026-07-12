// ==UserScript==
// @name         Web Agent
// @namespace    http://tampermonkey.net/agent
// @version      1.2
// @description  Universal web automation agent
// @author       Gemini
// @match        *://*/*
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @updateURL    http://localhost:8921/agent.user.js
// @downloadURL  http://localhost:8921/agent.user.js
// ==/UserScript==

(function() {
    'use strict';

    var CFG = {
        server: window.__agent_server || 'http://localhost:8921',
        pollInterval: 1200,
    };

    var SESSION = 'a_' + Math.random().toString(36).slice(2, 10);
    var state = 'IDLE';
    var foundElements = [];
    var connFailCount = 0;

    console.log('[WebAgent] v1.2 session=' + SESSION + ' url=' + location.href);

    /* ============================================================
       UI
       ============================================================ */
    function injectUI() {
        if (document.getElementById('_wa_root')) return;
        var s = document.createElement('style');
        s.textContent =
            '#_wa_root{position:fixed;bottom:12px;right:12px;z-index:999999;width:380px;font:12px/1.4 sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.3)}' +
            '#_wa_head{background:#333;color:#0f0;padding:5px 10px;border-radius:6px 6px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center}' +
            '#_wa_state_badge{padding:1px 6px;border-radius:8px;font-size:10px}' +
            '#_wa_body{background:#1e1e1e;color:#ccc;padding:6px 8px;border-radius:0 0 6px 6px}' +
            '#_wa_log{height:100px;overflow-y:auto;white-space:pre-wrap;font:11px/1.4 monospace;margin:4px 0 0;color:#0f0}' +
            '#_wa_info{font-size:10px;color:#888;display:flex;gap:10px;margin-bottom:2px}' +
            '#_wa_conn{font-size:10px;padding:1px 4px;border-radius:3px}';
        document.head.appendChild(s);

        var d = document.createElement('div');
        d.id = '_wa_root';
        d.innerHTML =
            '<div id="_wa_head">' +
              '<span>🤖 WebAgent</span>' +
              '<span id="_wa_state_badge" style="background:#666;color:#fff">starting</span>' +
            '</div>' +
            '<div id="_wa_body">' +
              '<div id="_wa_info">' +
                '<span id="_wa_conn" style="background:#888;color:#fff">⏳ server</span>' +
                '<span>' + location.hostname.slice(0, 30) + '</span>' +
                '<span>' + SESSION.slice(0, 6) + '</span>' +
              '</div>' +
              '<div id="_wa_log">[init]</div>' +
            '</div>';
        document.body.appendChild(d);

        var head = document.getElementById('_wa_head');
        var body = document.getElementById('_wa_body');
        head.addEventListener('click', function() {
            body.style.display = body.style.display === 'none' ? 'block' : 'none';
        });
    }

    function uiState(s) {
        var el = document.getElementById('_wa_state_badge');
        if (!el) return;
        var colors = { IDLE: '#666', BUSY: '#f59e0b', ERROR: '#ef4444', CONNECTED: '#22c55e' };
        el.textContent = s;
        el.style.background = colors[s] || '#666';
        el.style.color = '#fff';
    }

    function uiConn(ok) {
        var el = document.getElementById('_wa_conn');
        if (!el) return;
        if (ok === undefined) { el.textContent = '⏳ server'; el.style.background = '#888'; }
        else if (ok) { el.textContent = '✓ connected'; el.style.background = '#22c55e'; el.style.color = '#fff'; }
        else { el.textContent = '✗ no server'; el.style.background = '#ef4444'; el.style.color = '#fff'; }
    }

    function uiLog(msg) {
        var el = document.getElementById('_wa_log');
        if (!el) return;
        el.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
        el.scrollTop = el.scrollHeight;
        console.log('[WebAgent] ' + msg);
    }

    // ─── API ────────────────────────────────────────────────────
    function api(method, path, data, cb) {
        var opts = {
            method: method,
            url: CFG.server + path,
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
            onload: function(r) {
                connFailCount = 0;
                uiConn(true);
                if (cb) {
                    try { cb(null, JSON.parse(r.responseText)); }
                    catch (e) { cb(null, r.responseText); }
                }
            },
            onerror: function(r) {
                connFailCount++;
                uiConn(false);
                uiLog('⚠️ conn err (' + connFailCount + '): ' + (r.statusText || 'no response'));
                if (cb) cb(r.statusText || 'ERR', null);
            },
            ontimeout: function() {
                connFailCount++;
                uiConn(false);
                uiLog('⏱ timeout (' + connFailCount + ')');
                if (cb) cb('TIMEOUT', null);
            }
        };
        if (data) { opts.data = JSON.stringify(data); }
        if (method === 'GET' && data) { opts.data = JSON.stringify(data); opts.method = 'POST'; }
        GM_xmlhttpRequest(opts);
    }

    function report(cmd, result, extra) {
        api('POST', '/report', {
            session: SESSION, cmd: cmd, result: result,
            url: location.href, title: document.title,
            extra: extra || null
        });
    }

    // ─── POLL ────────────────────────────────────────────────────
    function poll() {
        if (state === 'BUSY') { uiState('BUSY'); return; }
        uiState('IDLE');

        var url = '/poll?session=' + SESSION + '&state=' + state +
                  '&url=' + encodeURIComponent(location.href) +
                  '&title=' + encodeURIComponent(document.title);

        api('GET', url, null, function(err, data) {
            if (err) return;
            if (data && data.cmd) {
                uiLog('cmd: ' + data.cmd + (data.url || data.selector || ''));
                execute(data);
            }
        });
    }

    // ─── FIND ────────────────────────────────────────────────────
    function findElements(cmd, cb) {
        foundElements = [];
        var all = [];

        if (cmd.selector) {
            try { all = Array.from(document.querySelectorAll(cmd.selector)); }
            catch(e) { return cb('bad selector: ' + cmd.selector, 0); }
        } else {
            all = Array.from(document.querySelectorAll('*'));
        }

        if (cmd.text) {
            var t = cmd.text.toLowerCase();
            all = all.filter(function(el) { return (el.textContent || '').toLowerCase().indexOf(t) >= 0; });
        }
        if (cmd.textExact) {
            all = all.filter(function(el) { return (el.textContent || '').trim() === cmd.textExact; });
        }
        if (cmd.attr) {
            if (cmd.attrValue !== undefined) {
                all = all.filter(function(el) { return el.getAttribute(cmd.attr) === String(cmd.attrValue); });
            } else {
                all = all.filter(function(el) { return el.getAttribute(cmd.attr) !== null; });
            }
        }
        if (cmd.tag) {
            var tu = cmd.tag.toUpperCase();
            all = all.filter(function(el) { return el.tagName === tu; });
        }
        if (cmd.visible) {
            all = all.filter(function(el) {
                var st = getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' && el.offsetParent !== null;
            });
        }

        foundElements = all;
        cb(null, foundElements.length);
    }

    // ─── EXECUTE ─────────────────────────────────────────────────
    function execute(cmd) {
        state = 'BUSY';
        uiState('BUSY');
        var prevCmd = cmd.cmd;

        switch (cmd.cmd) {

            case 'navigate':
                uiLog('→ navigate: ' + cmd.url);
                try {
                    navigator.sendBeacon(CFG.server + '/report', JSON.stringify({
                        session: SESSION, cmd: 'navigate', result: 'OK',
                        url: location.href, title: document.title, extra: { navigating: cmd.url }
                    }));
                } catch(e) {}
                location.href = cmd.url;
                return; // page will unload

            case 'wait':
                uiLog('→ wait ' + (cmd.ms || 1000) + 'ms');
                setTimeout(function() {
                    report('wait', 'OK', { waited: cmd.ms || 1000 });
                    state = 'IDLE';
                }, cmd.ms || 1000);
                return;

            case 'find':
                uiLog('→ find' + (cmd.selector ? ' ' + cmd.selector : '') + (cmd.text ? ' text=' + cmd.text : '') + (cmd.attr ? ' [' + cmd.attr + ']' : ''));
                findElements(cmd, function(err, count) {
                    if (err) { report('find', 'ERROR', { msg: err }); state = 'ERROR'; return; }
                    uiLog('  found ' + count + ' elements' + (count > 0 ? ' [' + foundElements[0].tagName + ']' : ''));
                    report('find', 'OK', { count: count, tag: count > 0 ? foundElements[0].tagName : null });
                    state = 'IDLE';
                });
                return;

            case 'find_and_click':
                findElements(cmd, function(err, count) {
                    if (err || count === 0) {
                        report('find_and_click', count === 0 ? 'NOT_FOUND' : 'ERROR', { msg: err || 'no elements' });
                        state = count === 0 ? 'IDLE' : 'ERROR';
                        return;
                    }
                    var idx = cmd.index || 0;
                    var el = foundElements[idx];
                    if (!el) {
                        report('find_and_click', 'ERROR', { msg: 'index ' + idx + ' OOB' });
                        state = 'ERROR';
                        return;
                    }
                    uiLog('  click [' + idx + '] ' + el.tagName + (el.textContent ? ' "' + el.textContent.trim().slice(0, 30) + '"' : ''));
                    try { el.click(); report('find_and_click', 'CLICKED', { index: idx, tag: el.tagName }); }
                    catch(e) { report('find_and_click', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                    state = 'IDLE';
                });
                return;

            case 'click':
                var ci = cmd.index || 0;
                var cel = foundElements[ci];
                if (!cel) {
                    report('click', 'ERROR', { msg: 'no element at index ' + ci + '; run find first' });
                    state = 'ERROR';
                    return;
                }
                uiLog('→ click [' + ci + '] ' + cel.tagName);
                try { cel.click(); report('click', 'CLICKED', { index: ci }); }
                catch(e) { report('click', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                state = 'IDLE';
                return;

            case 'type':
                var ti = cmd.index || 0;
                var tel = foundElements[ti];
                if (!tel) {
                    report('type', 'ERROR', { msg: 'no element at index ' + ti });
                    state = 'ERROR';
                    return;
                }
                uiLog('→ type "' + (cmd.text || '') + '" into [' + ti + ']');
                try {
                    tel.focus();
                    tel.value = cmd.text || '';
                    tel.dispatchEvent(new Event('input', { bubbles: true }));
                    tel.dispatchEvent(new Event('change', { bubbles: true }));
                    report('type', 'OK', { index: ti, tag: tel.tagName });
                } catch(e) { report('type', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                state = 'IDLE';
                return;

            case 'get_text':
                var gi = cmd.index || 0;
                var gel = foundElements[gi] || document.querySelector(cmd.selector || 'body');
                if (!gel) { report('get_text', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                report('get_text', 'OK', { text: (gel.textContent || '').trim().slice(0, 500) });
                state = 'IDLE';
                return;

            case 'get_attr':
                var ai = cmd.index || 0;
                var ael = foundElements[ai];
                if (!ael) { report('get_attr', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                report('get_attr', 'OK', { attr: cmd.name, value: ael.getAttribute(cmd.name) });
                state = 'IDLE';
                return;

            case 'scroll_into_view':
                var si = cmd.index || 0;
                var sel = foundElements[si];
                if (!sel) { report('scroll_into_view', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                try { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); report('scroll_into_view', 'OK', {}); }
                catch(e) { report('scroll_into_view', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                state = 'IDLE';
                return;

            case 'exists':
                var exists = false;
                if (cmd.selector) exists = !!document.querySelector(cmd.selector);
                else if (cmd.text) exists = (document.body && document.body.textContent.indexOf(cmd.text) >= 0);
                report('exists', 'OK', { exists: exists });
                state = 'IDLE';
                return;

            case 'count':
                var cnt = cmd.selector ? document.querySelectorAll(cmd.selector).length : 0;
                report('count', 'OK', { count: cnt });
                state = 'IDLE';
                return;

            case 'eval':
                uiLog('→ eval');
                try {
                    var evResult = eval(cmd.code);
                    var reportResult = (typeof evResult === 'object')
                        ? JSON.stringify(evResult)
                        : String(evResult);
                    uiLog('  result: ' + reportResult.slice(0, 80));
                    report('eval', 'OK', { result: reportResult.slice(0, 2000) });
                } catch(e) { report('eval', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                state = 'IDLE';
                return;

            case 'set_config':
                CFG[cmd.key] = cmd.value;
                uiLog('→ config ' + cmd.key + ' = ' + cmd.value);
                report('set_config', 'OK', { key: cmd.key, value: cmd.value });
                state = 'IDLE';
                return;

            case 'highlight':
                var hi = cmd.index || 0;
                var hel = foundElements[hi];
                if (!hel) { report('highlight', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                hel.style.outline = '3px solid red';
                hel.style.outlineOffset = '2px';
                setTimeout(function() { hel.style.outline = ''; }, 3000);
                report('highlight', 'OK', {});
                state = 'IDLE';
                return;

            case 'inject_ui':
                injectUI();
                report('inject_ui', 'OK', {});
                state = 'IDLE';
                return;

            case 'ping':
                report('ping', 'PONG', {});
                state = 'IDLE';
                return;

            default:
                report(cmd.cmd || '?', 'UNKNOWN', { msg: 'unknown cmd: ' + cmd.cmd });
                state = 'IDLE';
        }

        // For synchronous commands that didn't return early
        if (state === 'BUSY') {
            state = 'IDLE';
        }
    }

    // ─── INIT ────────────────────────────────────────────────────
    injectUI();
    uiState('IDLE');
    uiConn(undefined);

    // Try hello
    setTimeout(function() {
        api('POST', '/hello', {
            session: SESSION, url: location.href, title: document.title, agentVersion: '1.2'
        }, function(err, data) {
            if (err) { uiLog('⚠️ server unreachable at ' + CFG.server); }
            else { uiLog('✓ registered with server'); }
        });
    }, 1000);

    // Start polling
    setTimeout(function() { poll(); }, 2000);
    setInterval(poll, CFG.pollInterval);

    window.__webAgent = {
        session: SESSION,
        state: function() { return state; },
        found: function() { return foundElements; },
        poll: poll,
        cfg: CFG
    };
})();
