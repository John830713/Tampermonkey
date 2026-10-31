// ==UserScript==
// @name         Hanime Downloader
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Hover thumbnail to show Download button with progress bar, pause/resume/cancel
// @author       You
// @match        *://hanime1.me/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .dl-overlay-wrap {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            z-index: 10;
        }
        .dl-overlay-wrap.active {
            bottom: 30px;
            padding-bottom: 14px;
        }
        .thumb-container:hover .dl-overlay-wrap {
            opacity: 1;
            pointer-events: auto;
        }
        .dl-btn-row {
            width: 100%;
            display: flex;
            gap: 4px;
        }
        .dl-overlay-btn {
            flex: 1;
            padding: 5px 0;
            background: rgba(255, 152, 0, 0.9);
            color: #fff;
            font-size: 12px;
            font-weight: bold;
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            text-align: center;
        }
        .dl-overlay-btn:hover {
            background: #ff9800;
        }
        .dl-overlay-btn:disabled {
            background: #9e9e9e;
            cursor: default;
        }
        .dl-icon-btn {
            flex: 0 0 28px;
            width: 28px;
            height: 28px;
            padding: 0;
            display: none;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: #fff;
            font-size: 16px;
            line-height: 1;
        }
        .dl-icon-btn.pause {
            background: rgba(255, 152, 0, 0.9);
        }
        .dl-icon-btn.pause:hover {
            background: #ff9800;
        }
        .dl-icon-btn.cancel {
            background: rgba(244, 67, 54, 0.85);
        }
        .dl-icon-btn.cancel:hover {
            background: #f44336;
        }
        .dl-icon-btn.material-icons {
            font-size: 18px;
        }
        .dl-overlay-wrap.active .dl-icon-btn {
            display: flex;
        }
        .dl-overlay-wrap.active .dl-main-btn {
            flex: 1;
            border-radius: 4px 0 0 4px;
        }
        .dl-badge {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            color: #fff;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 11;
            pointer-events: none;
        }
        .dl-badge.ok { background: rgba(46, 125, 50, 0.9); }
        .dl-badge.fail { background: rgba(198, 40, 40, 0.9); }
        .dl-progress-outer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 8px;
            background: #e0e0e0;
            border-radius: 0 0 4px 4px;
            overflow: hidden;
            display: none;
        }
        .dl-progress-inner {
            width: 0%;
            height: 100%;
            background: #4caf50;
            transition: width 0.1s linear;
        }
    `);

    var DL_KEY = 'hanime_dl_status';
    var BTN_SELECTOR = '.dl-overlay-btn.dl-main-btn';

    // thumb-container -> video id, so state can be refreshed without re-reading the DOM path
    var vidMap = new WeakMap();

    function getDlStatus() {
        try { return JSON.parse(localStorage.getItem(DL_KEY) || '{}'); } catch(e) { return {}; }
    }

    function setDlStatus(id, status) {
        if (!id) return;
        var s = getDlStatus();
        if (status) {
            s[id] = status;
        } else {
            delete s[id];
        }
        try { localStorage.setItem(DL_KEY, JSON.stringify(s)); } catch(e) {}
    }

    function removeBadge(tc) {
        var old = tc.querySelector('.dl-badge');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    function setBadge(tc, ok) {
        var cls = 'dl-badge ' + (ok ? 'ok' : 'fail');
        // Re-appending an identical badge would mutate the DOM on every scan
        // and keep the MutationObserver -> scan loop alive forever.
        var current = tc.querySelector('.dl-badge');
        if (current && current.className === cls) return;

        removeBadge(tc);
        var badge = document.createElement('span');
        badge.className = cls;
        badge.textContent = ok ? '\u2713' : '\u2717';
        if (getComputedStyle(tc).position === 'static') tc.style.position = 'relative';
        tc.appendChild(badge);
    }

    // Single source of truth for the idle/done/fail look.
    // Always read localStorage here so a status written by another tab shows up.
    function applyState(tc) {
        var btn = tc.querySelector(BTN_SELECTOR);
        if (!btn) return;
        var wrap = tc.querySelector('.dl-overlay-wrap');
        if (wrap && wrap.classList.contains('active')) return;  // in-flight download wins

        var vid = vidMap.get(tc);
        var status = vid ? getDlStatus()[vid] : null;
        var isDone = status === 'done';
        var isFail = !!status && status.indexOf('fail:') === 0;

        var label = isDone ? 'Re-download' : (isFail ? 'Retry' : 'Download');
        if (btn.textContent !== label) btn.textContent = label;  // text writes are observed mutations
        btn.style.background = isDone ? 'rgba(255, 152, 0, 0.8)'
                              : isFail ? 'rgba(198, 40, 40, 0.8)'
                              : '';
        btn.title = isFail ? status.slice(5) : '';

        if (isDone) setBadge(tc, true);
        else if (isFail) setBadge(tc, false);
        else removeBadge(tc);
    }

    function injectOverlays() {
        document.querySelectorAll('.thumb-container').forEach(function(tc) {
            var link = tc.closest('a.video-link') || tc.querySelector('a');
            if (!link) return;

            var href = link.getAttribute('href');
            if (!href || href.indexOf('watch?v=') === -1) return;

            var idMatch = href.match(/v=(\d+)/);
            var vid = idMatch ? idMatch[1] : null;
            vidMap.set(tc, vid);

            // Already injected: refresh the label instead of bailing out, so a
            // status change made elsewhere is picked up on the next scan.
            if (tc.querySelector(BTN_SELECTOR)) {
                applyState(tc);
                return;
            }

            var wrap = document.createElement('div');
            wrap.className = 'dl-overlay-wrap';

            var btnRow = document.createElement('div');
            btnRow.className = 'dl-btn-row';

            var btn = document.createElement('button');
            btn.className = 'dl-overlay-btn dl-main-btn';

            var pauseBtn = document.createElement('button');
            pauseBtn.className = 'dl-icon-btn pause material-icons';
            pauseBtn.textContent = 'pause';
            pauseBtn.title = '\u6682\u505C';

            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'dl-icon-btn cancel material-icons';
            cancelBtn.textContent = 'close';
            cancelBtn.title = '\u53D6\u6D88';

            btnRow.appendChild(btn);
            btnRow.appendChild(pauseBtn);
            btnRow.appendChild(cancelBtn);

            var progressOuter = document.createElement('div');
            progressOuter.className = 'dl-progress-outer';
            var progressInner = document.createElement('div');
            progressInner.className = 'dl-progress-inner';
            progressOuter.appendChild(progressInner);

            wrap.appendChild(btnRow);
            wrap.appendChild(progressOuter);
            tc.appendChild(wrap);

            applyState(tc);

            var activeReq = null;
            var cancelling = false;
            var paused = false;
            var chunks = [];
            var totalBytes = 0;
            var dlTotal = 0;
            var dlUrl = null;
            var dlSafeTitle = null;
            var dlVideoId = null;

            function doDownload() {
                var filename = dlSafeTitle + '.mp4';
                var baseBytes = totalBytes;   // bytes already kept from earlier attempts
                var headers = {};
                if (baseBytes > 0) {
                    headers['Range'] = 'bytes=' + baseBytes + '-';
                }

                activeReq = GM_xmlhttpRequest({
                    method: 'GET',
                    url: dlUrl,
                    responseType: 'blob',
                    headers: headers,
                    onprogress: function(e) {
                        if (paused) return;
                        var currentLoaded = baseBytes + e.loaded;
                        if (e.lengthComputable && e.total > 0) {
                            // On a Range resume e.total is only the remaining bytes,
                            // so the grand total is baseBytes + e.total.
                            var grandTotal = baseBytes + e.total;
                            if (grandTotal > dlTotal) dlTotal = grandTotal;
                            var pct = Math.min(100, (currentLoaded / dlTotal) * 100);
                            progressInner.style.width = pct + '%';
                            btn.textContent = pct.toFixed(0) + '%';
                        } else if (e.loaded > 0) {
                            btn.textContent = (currentLoaded / 1048576).toFixed(1) + ' MB';
                        }
                    },
                    onload: function(res) {
                        activeReq = null;
                        if (paused) return;
                        if (cancelling) { resetUI(); return; }

                        if (res.status !== 200 && res.status !== 206) {
                            btn.textContent = 'HTTP ' + res.status;
                            setDlStatus(dlVideoId, 'fail:HTTP ' + res.status);
                            setTimeout(resetUI, 2000);
                            return;
                        }

                        // Server ignored the Range header: start the buffer over.
                        if (chunks.length > 0 && res.status === 200) {
                            chunks = [];
                            totalBytes = 0;
                        }

                        chunks.push(res.response);
                        totalBytes += res.response.size;

                        btn.textContent = '\u5B58\u6A94\u4E2D...';
                        progressInner.style.width = '100%';

                        var blob = new Blob(chunks);
                        var blobUrl = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = filename;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(function() {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(blobUrl);
                        }, 5000);

                        progressInner.style.background = '#2e7d32';
                        btn.textContent = '100%';
                        setDlStatus(dlVideoId, 'done');
                        setTimeout(resetUI, 1500);
                    },
                    onerror: function() {
                        activeReq = null;
                        if (paused) return;
                        if (cancelling) {
                            btn.textContent = '\u5DF2\u53D6\u6D88';
                        } else {
                            btn.textContent = '\u7DB2\u8DEF\u932F\u8AA4';
                            setDlStatus(dlVideoId, 'fail:network');
                        }
                        setTimeout(resetUI, 1000);
                    },
                    onabort: function(e) {
                        if (cancelling) return;
                        if (e.response && e.response.size > 0) {
                            chunks.push(e.response);
                            totalBytes += e.response.size;
                        }
                    }
                });
            }

            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                cancelling = true;
                paused = false;
                if (activeReq) {
                    activeReq.abort();
                    activeReq = null;
                }
                resetUI();
            });

            pauseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (paused) {
                    paused = false;
                    pauseBtn.textContent = 'pause';
                    pauseBtn.title = '\u6682\u505C';
                    doDownload();
                } else {
                    paused = true;
                    if (activeReq) activeReq.abort();
                    pauseBtn.textContent = 'play_arrow';
                    pauseBtn.title = '\u7E7C\u7E8C';
                    if (dlTotal > 0) {
                        btn.textContent = Math.min(100, (totalBytes / dlTotal) * 100).toFixed(0) + '%';
                    } else {
                        btn.textContent = (totalBytes / 1048576).toFixed(1) + ' MB';
                    }
                }
            });

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (wrap.classList.contains('active')) return;  // already running

                var match = href.match(/v=(\d+)/);
                if (!match) return;
                var videoId = match[1];

                // Re-download / Retry starts from a clean slate
                if (getDlStatus()[videoId]) {
                    setDlStatus(videoId, '');
                    removeBadge(tc);
                }

                cancelling = false;
                paused = false;
                wrap.classList.add('active');
                progressOuter.style.display = 'block';
                btn.textContent = 'Fetching video URL...';

                dlVideoId = videoId;
                dlTotal = 0;

                activeReq = GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://hanime1.me/watch?v=' + videoId,
                    onload: function(res) {
                        activeReq = null;
                        if (cancelling) { resetUI(); return; }
                        var match2 = res.responseText.match(/<source[^>]+src="([^"]+)"/);
                        if (!match2) {
                            btn.textContent = 'URL\u932F\u8AA4';
                            setTimeout(resetUI, 1500);
                            return;
                        }
                        var videoUrl = match2[1];
                        if (videoUrl.indexOf('//') === 0) videoUrl = 'https:' + videoUrl;

                        var titleMatch = res.responseText.match(/<h3[^>]*>([^<]+)<\/h3>/);
                        var title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'") : 'video_' + videoId;
                        var safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

                        dlUrl = videoUrl;
                        dlSafeTitle = safeTitle;

                        btn.textContent = '\u958B\u59CB\u4E0B\u8F09...';
                        progressInner.style.width = '0%';
                        doDownload();
                    },
                    onerror: function() {
                        activeReq = null;
                        if (cancelling) {
                            btn.textContent = '\u5DF2\u53D6\u6D88';
                        } else {
                            btn.textContent = '\u7DB2\u8DEF\u932F\u8AA4';
                        }
                        setTimeout(resetUI, 1000);
                    }
                });
            });

            function resetUI() {
                activeReq = null;
                cancelling = false;
                paused = false;
                chunks = [];
                totalBytes = 0;
                dlUrl = null;
                dlSafeTitle = null;
                dlVideoId = null;
                dlTotal = 0;
                wrap.classList.remove('active');
                pauseBtn.textContent = 'pause';
                pauseBtn.title = '\u6682\u505C';
                progressOuter.style.display = 'none';
                progressInner.style.width = '0%';
                progressInner.style.background = '#4caf50';
                applyState(tc);
            }

            // Hovering is when the overlay becomes visible — refresh then, so a
            // download finished in another tab is reflected without a reload.
            tc.addEventListener('mouseenter', function() { applyState(tc); });
        });
    }

    injectOverlays();

    // Throttle to one scan per frame instead of one per mutation record
    // (the search grid mutates constantly while scrolling).
    var scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(function() {
            scanScheduled = false;
            injectOverlays();
        });
    }

    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // Another tab finished/failed a download: refresh labels and badges.
    window.addEventListener('storage', function(e) {
        if (e.key === DL_KEY) scheduleScan();
    });
})();
