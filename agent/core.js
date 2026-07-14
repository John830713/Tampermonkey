'use strict';

    var CFG = {
        server: window.__agent_server || 'http://localhost:8921',
        pollInterval: 1200,
        pollBusyMs: 300,
        evalLimit: 2000,
    };

    var SESSION = 'a_' + Math.random().toString(36).slice(2, 10);
    var state = 'IDLE';
    var foundElements = [];
    var connFailCount = 0;
    var consoleLogs = [];
    var MAX_CONSOLE_LOGS = 100;
    var lastResult = null;
    var _pollTimer = null;
    var _rttSamples = [];
    var _rttAvg = 0;

    (function hookConsole() {
        var methods = ['log', 'warn', 'error', 'info'];
        methods.forEach(function(m) {
            var orig = console[m];
            console[m] = function() {
                var args = Array.prototype.slice.call(arguments);
                var msg = args.map(function(a) {
                    if (typeof a === 'object') try { return JSON.stringify(a); } catch(e) { return String(a); }
                    return String(a);
                }).join(' ');
                consoleLogs.push({ level: m, msg: msg, time: Date.now() });
                if (consoleLogs.length > MAX_CONSOLE_LOGS) consoleLogs.shift();
                return orig.apply(console, arguments);
            };
        });
    })();

    console.log('[WebAgent] v1.3 session=' + SESSION + ' url=' + location.href);

    window.__agent_ui = {
        state: 'starting',
        conn: '⏳ server',
        logs: ['[init]'],
        session: SESSION,
        hostname: location.hostname.slice(0, 30),
    };

    window.__agent_session = SESSION;
    window.__agent_tagged = false;
    window.__agent_consoleLogs = consoleLogs;

    function uiState(s) {
        window.__agent_ui.state = s;
    }

    function uiConn(ok) {
        if (ok === undefined) window.__agent_ui.conn = '⏳ server';
        else if (ok) window.__agent_ui.conn = '✓ connected';
        else window.__agent_ui.conn = '✗ no server';
    }

    function uiLog(msg) {
        var ts = new Date().toLocaleTimeString();
        window.__agent_ui.logs.push('[' + ts + '] ' + msg);
        if (window.__agent_ui.logs.length > 50) window.__agent_ui.logs.shift();
        console.log('[WebAgent] ' + msg);
    }

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
                    if (r.status === 204) { cb(null, null); return; }
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
        lastResult = {
            session: SESSION, cmd: cmd, result: result,
            url: location.href, title: document.title,
            extra: extra || null
        };
        state = 'IDLE';
        uiState('IDLE');
        schedulePoll(0);
    }

    function schedulePoll(delayMs) {
        if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
        var d = (delayMs !== undefined) ? delayMs : (state === 'BUSY' ? CFG.pollBusyMs : CFG.pollInterval);
        _pollTimer = setTimeout(function() { poll(); }, d);
    }

    function poll() {
        _pollTimer = null;
        if (state === 'BUSY') { uiState('BUSY'); return; }
        uiState('IDLE');

        var body = lastResult;
        lastResult = null;

        var t0 = Date.now();
        api('POST', '/poll?session=' + SESSION + '&url=' + encodeURIComponent(location.href), body, function(err, data) {
            var rtt = Date.now() - t0;
            _rttSamples.push(rtt);
            if (_rttSamples.length > 20) _rttSamples.shift();
            _rttAvg = Math.round(_rttSamples.reduce(function(a,b){return a+b},0) / _rttSamples.length);

            if (err || !data) { schedulePoll(); return; }

            if (data.tagged !== undefined) {
                var wasTagged = window.__agent_tagged;
                window.__agent_tagged = !!data.tagged;
                if (wasTagged !== window.__agent_tagged) {
                    uiLog('tag: ' + (window.__agent_tagged ? 'ON' : 'OFF'));
                    window.dispatchEvent(new CustomEvent('agent-tagged', { detail: { tagged: window.__agent_tagged } }));
                }
            }

            if (data.cmd) {
                uiLog('cmd: ' + data.cmd + (data.url || data.selector || ''));
                execute(data);
            } else {
                schedulePoll(data.poll_ms || undefined);
            }
        });
    }

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
                return;

            case 'wait':
                uiLog('→ wait ' + (cmd.ms || 1000) + 'ms');
                setTimeout(function() {
                    report('wait', 'OK', { waited: cmd.ms || 1000 });
                }, cmd.ms || 1000);
                return;

            case 'find':
                uiLog('→ find' + (cmd.selector ? ' ' + cmd.selector : '') + (cmd.text ? ' text=' + cmd.text : '') + (cmd.attr ? ' [' + cmd.attr + ']' : ''));
                findElements(cmd, function(err, count) {
                    if (err) { report('find', 'ERROR', { msg: err }); state = 'ERROR'; return; }
                    uiLog('  found ' + count + ' elements' + (count > 0 ? ' [' + foundElements[0].tagName + ']' : ''));
                    report('find', 'OK', { count: count, tag: count > 0 ? foundElements[0].tagName : null });
                });
                return;

            case 'find_and_click':
                findElements(cmd, function(err, count) {
                    if (err || count === 0) {
                        report('find_and_click', count === 0 ? 'NOT_FOUND' : 'ERROR', { msg: err || 'no elements' });
                        if (count > 0) state = 'ERROR';
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
                return;

            case 'get_text':
                var gi = cmd.index || 0;
                var gel = foundElements[gi] || document.querySelector(cmd.selector || 'body');
                if (!gel) { report('get_text', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                report('get_text', 'OK', { text: (gel.textContent || '').trim().slice(0, 500) });
                return;

            case 'get_attr':
                var ai = cmd.index || 0;
                var ael = foundElements[ai];
                if (!ael) { report('get_attr', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                report('get_attr', 'OK', { attr: cmd.name, value: ael.getAttribute(cmd.name) });
                return;

            case 'scroll_into_view':
                var si = cmd.index || 0;
                var sel = foundElements[si];
                if (!sel) { report('scroll_into_view', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                try { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); report('scroll_into_view', 'OK', {}); }
                catch(e) { report('scroll_into_view', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                return;

            case 'exists':
                var exists = false;
                if (cmd.selector) exists = !!document.querySelector(cmd.selector);
                else if (cmd.text) exists = (document.body && document.body.textContent.indexOf(cmd.text) >= 0);
                report('exists', 'OK', { exists: exists });
                return;

            case 'count':
                var cnt = cmd.selector ? document.querySelectorAll(cmd.selector).length : 0;
                report('count', 'OK', { count: cnt });
                return;

            case 'eval':
                uiLog('→ eval');
                try {
                    var evResult = eval(cmd.code);
                    var reportResult = (typeof evResult === 'object')
                        ? JSON.stringify(evResult)
                        : String(evResult);
                    uiLog('  result: ' + reportResult.slice(0, 80));
                    report('eval', 'OK', { result: reportResult.slice(0, CFG.evalLimit) });
                } catch(e) { report('eval', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                return;

            case 'dump_element':
                var dSel = cmd.selector;
                uiLog('→ dump_element ' + dSel);
                var dEl = null;
                try { dEl = document.querySelector(dSel); } catch(e) {}
                if (!dEl) { report('dump_element', 'ERROR', { msg: 'not found: ' + dSel }); state = 'ERROR'; return; }
                var dR = dEl.getBoundingClientRect();
                var dCS = getComputedStyle(dEl);
                var dDump = {
                    selector: dSel,
                    tag: dEl.tagName.toLowerCase(),
                    id: dEl.id || null,
                    className: dEl.className || null,
                    outerHTML: dEl.outerHTML,
                    innerHTML: dEl.innerHTML,
                    textContent: (dEl.textContent || '').slice(0, 2000),
                    rect: { x: Math.round(dR.left), y: Math.round(dR.top), w: Math.round(dR.width), h: Math.round(dR.height) },
                    scroll: { x: Math.round(dR.left + window.scrollX), y: Math.round(dR.top + window.scrollY) },
                    computedStyle: {
                        display: dCS.display, position: dCS.position, visibility: dCS.visibility,
                        width: dCS.width, height: dCS.height, top: dCS.top, left: dCS.left,
                        margin: dCS.margin, padding: dCS.padding, zIndex: dCS.zIndex,
                        overflow: dCS.overflow, opacity: dCS.opacity, textIndent: dCS.textIndent
                    },
                    parentTag: dEl.parentElement ? dEl.parentElement.tagName.toLowerCase() : null,
                    parentId: dEl.parentElement ? dEl.parentElement.id : null,
                    childCount: dEl.children.length,
                    url: location.href,
                    title: document.title
                };
                api('POST', '/dump', dDump, function(err) {
                    if (err) { report('dump_element', 'ERROR', { msg: err }); state = 'ERROR'; return; }
                    report('dump_element', 'OK', { saved: true, tag: dDump.tag, id: dDump.id });
                });
                return;

            case 'dump_page':
                uiLog('→ dump_page');
                var dpDump = {
                    url: location.href, title: document.title,
                    body: document.body ? { scrollH: document.body.scrollHeight, clientH: document.body.clientHeight } : null,
                    headerHTML: null, headerInfo: null
                };
                var headerEl = document.querySelector(cmd.selector || 'header');
                if (headerEl) {
                    var hR = headerEl.getBoundingClientRect();
                    var hCS = getComputedStyle(headerEl);
                    dpDump.headerHTML = headerEl.outerHTML;
                    dpDump.headerInfo = {
                        tag: headerEl.tagName.toLowerCase(), id: headerEl.id, className: headerEl.className,
                        rect: { x: Math.round(hR.left), y: Math.round(hR.top), w: Math.round(hR.width), h: Math.round(hR.height) },
                        computedStyle: {
                            display: hCS.display, position: hCS.position, top: hCS.top, left: hCS.left,
                            width: hCS.width, height: hCS.height, zIndex: hCS.zIndex, overflow: hCS.overflow
                        }
                    };
                }
                api('POST', '/dump', dpDump, function(err) {
                    if (err) { report('dump_page', 'ERROR', { msg: err }); state = 'ERROR'; return; }
                    report('dump_page', 'OK', { saved: true });
                });
                return;

            case 'wait_for':
                var wfSelector = cmd.selector;
                var wfTimeout = cmd.timeout || 10000;
                var wfInterval = cmd.interval || 200;
                var wfStart = Date.now();
                uiLog('→ wait_for ' + wfSelector + ' (timeout ' + wfTimeout + 'ms)');
                (function pollWaitFor() {
                    var el = null;
                    try { el = document.querySelector(wfSelector); } catch(e) {}
                    if (el) {
                        uiLog('  found ' + wfSelector);
                        report('wait_for', 'OK', { found: true, elapsed: Date.now() - wfStart });
                        return;
                    }
                    if (Date.now() - wfStart >= wfTimeout) {
                        uiLog('  timeout: ' + wfSelector + ' not found');
                        report('wait_for', 'OK', { found: false, elapsed: Date.now() - wfStart });
                        return;
                    }
                    setTimeout(pollWaitFor, wfInterval);
                })();
                return;

            case 'debug_dump':
                uiLog('→ debug_dump');
                try {
                    var dump = {};
                    dump.url = location.href;
                    dump.title = document.title;
                    dump.doctype = document.doctype ? document.doctype.name : null;
                    dump.charset = document.characterSet;
                    dump.lang = document.documentElement.lang;

                    var body = document.body;
                    if (body) {
                        var bs = getComputedStyle(body);
                        dump.body = {
                            scrollH: body.scrollHeight,
                            clientH: body.clientHeight,
                            childCount: body.children.length,
                        };
                    }

                    var headings = [];
                    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(h, i) {
                        if (i < 20) headings.push({ tag: h.tagName, text: h.textContent.trim().slice(0, 80) });
                    });
                    dump.headings = headings;

                    var links = [];
                    document.querySelectorAll('a[href]').forEach(function(a, i) {
                        if (i < 30) links.push({ text: a.textContent.trim().slice(0, 60), href: a.href.slice(0, 120) });
                    });
                    dump.links = links;

                    var images = [];
                    document.querySelectorAll('img').forEach(function(img, i) {
                        if (i < 30) images.push({ src: img.src.slice(0, 120), alt: (img.alt || '').slice(0, 60), w: img.naturalWidth, h: img.naturalHeight });
                    });
                    dump.images = images;

                    var forms = [];
                    document.querySelectorAll('form').forEach(function(f, i) {
                        if (i < 10) {
                            var fields = [];
                            f.querySelectorAll('input,textarea,select').forEach(function(inp) {
                                fields.push({ tag: inp.tagName, type: inp.type || null, name: inp.name || null, id: inp.id || null, placeholder: inp.placeholder || null });
                            });
                            forms.push({ action: f.action, method: f.method, fields: fields });
                        }
                    });
                    dump.forms = forms;

                    var scripts = [];
                    document.querySelectorAll('script[src]').forEach(function(s, i) {
                        if (i < 15) scripts.push(s.src.slice(0, 120));
                    });
                    dump.externalScripts = scripts;

                    var result = JSON.stringify(dump);
                    uiLog('  dump: ' + result.length + ' bytes');
                    report('debug_dump', 'OK', { dump: result.slice(0, CFG.evalLimit) });
                } catch(e) { report('debug_dump', 'ERROR', { msg: e.message }); state = 'ERROR'; return; }
                return;

            case 'console_capture':
                uiLog('→ console_capture');
                var level = cmd.level || null;
                var limit = cmd.limit || 50;
                var since = cmd.since || 0;
                var filtered = consoleLogs;
                if (level) filtered = filtered.filter(function(l) { return l.level === level; });
                if (since) filtered = filtered.filter(function(l) { return l.time >= since; });
                var sliced = filtered.slice(-limit);
                report('console_capture', 'OK', { logs: sliced, total: consoleLogs.length });
                return;

            case 'set_config':
                CFG[cmd.key] = cmd.value;
                uiLog('→ config ' + cmd.key + ' = ' + cmd.value);
                report('set_config', 'OK', { key: cmd.key, value: cmd.value });
                return;

            case 'highlight':
                var hi = cmd.index || 0;
                var hel = foundElements[hi];
                if (!hel) { report('highlight', 'ERROR', { msg: 'no element' }); state = 'ERROR'; return; }
                hel.style.outline = '3px solid red';
                hel.style.outlineOffset = '2px';
                setTimeout(function() { hel.style.outline = ''; }, 3000);
                report('highlight', 'OK', {});
                return;

            case 'inject_ui':
                report('inject_ui', 'OK', {});
                return;

            case 'ping':
                report('ping', 'PONG', {});
                return;

            default:
                report(cmd.cmd || '?', 'UNKNOWN', { msg: 'unknown cmd: ' + cmd.cmd });
        }

        if (state === 'BUSY') {
            state = 'IDLE';
        }
    }

    uiState('IDLE');
    uiConn(undefined);

    setTimeout(function() {
        api('POST', '/hello', {
            session: SESSION, url: location.href, title: document.title, agentVersion: '1.3'
        }, function(err, data) {
            if (err) { uiLog('⚠️ server unreachable at ' + CFG.server); }
            else { uiLog('✓ registered with server'); }
        });
    }, 1000);

    schedulePoll(2000);

    window.__webAgent = {
        session: SESSION,
        state: function() { return state; },
        found: function() { return foundElements; },
        poll: poll,
        cfg: CFG,
        rtt: function() { return { avg: _rttAvg, samples: _rttSamples.slice() }; }
    };
