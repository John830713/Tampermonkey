// ==UserScript==
// @name         Hanime Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Hover thumbnail to show Download button with progress bar, pause/resume/cancel
// @author       You
// @match        *://hanime1.me/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
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
        .dl-progress-text {
            display: none;
            position: absolute;
            bottom: 10px;
            left: 0;
            right: 0;
            color: #fff;
            font-size: 10px;
            font-family: monospace;
            text-shadow: 0 0 3px rgba(0,0,0,0.8);
            text-align: center;
            pointer-events: none;
        }
    `);

    var DL_KEY = 'hanime_dl_status';

    function getDlStatus() {
        try { return JSON.parse(localStorage.getItem(DL_KEY) || '{}'); } catch(e) { return {}; }
    }

    function setDlStatus(id, status) {
        var s = getDlStatus();
        s[id] = status;
        localStorage.setItem(DL_KEY, JSON.stringify(s));
    }

    function injectOverlays() {
        document.querySelectorAll('.thumb-container').forEach(function(tc) {
            if (tc.querySelector('.dl-overlay-btn')) return;

            var link = tc.closest('a.video-link') || tc.querySelector('a');
            if (!link) return;

            var href = link.getAttribute('href');
            if (!href || href.indexOf('watch?v=') === -1) return;

            var idMatch = href.match(/v=(\d+)/);
            var vid = idMatch ? idMatch[1] : null;
            var dlStatus = getDlStatus();
            var isDone = vid && dlStatus[vid] === 'done';
            var isFail = vid && dlStatus[vid] && dlStatus[vid].indexOf('fail:') === 0;

            var wrap = document.createElement('div');
            wrap.className = 'dl-overlay-wrap';

            var btnRow = document.createElement('div');
            btnRow.className = 'dl-btn-row';

            var btn = document.createElement('button');
            btn.className = 'dl-overlay-btn dl-main-btn';
            if (isDone) {
                btn.textContent = 'Re-download';
                btn.style.background = 'rgba(255, 152, 0, 0.8)';
            } else if (isFail) {
                btn.textContent = 'Retry';
                btn.style.background = 'rgba(198, 40, 40, 0.8)';
                btn.title = dlStatus[vid].replace('fail:', '');
            } else {
                btn.textContent = 'Download';
            }

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

            var progressText = document.createElement('span');
            progressText.className = 'dl-progress-text';

            wrap.appendChild(btnRow);
            wrap.appendChild(progressOuter);
            wrap.appendChild(progressText);
            tc.appendChild(wrap);

            if (isDone) {
                var badge = document.createElement('span');
                badge.textContent = '\u2713';
                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(46,125,50,0.9);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:11;pointer-events:none;';
                tc.style.position = 'relative';
                tc.appendChild(badge);
            } else if (isFail) {
                var badge = document.createElement('span');
                badge.textContent = '\u2717';
                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(198,40,40,0.9);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:11;pointer-events:none;';
                tc.style.position = 'relative';
                tc.appendChild(badge);
            }

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
                var headers = {};
                if (chunks.length > 0 && totalBytes > 0) {
                    headers['Range'] = 'bytes=' + totalBytes + '-';
                }

                activeReq = GM_xmlhttpRequest({
                    method: 'GET',
                    url: dlUrl,
                    responseType: 'blob',
                    headers: headers,
                    onprogress: function(e) {
                        if (paused) return;
                        var currentLoaded = totalBytes + e.loaded;
                        if (e.lengthComputable && e.total > 0) {
                            if (dlTotal === 0) dlTotal = e.total;
                            var pct = (currentLoaded / dlTotal) * 100;
                            progressInner.style.width = pct + '%';
                            var loadedMB = (currentLoaded / 1048576).toFixed(1);
                            var totalMB = (dlTotal / 1048576).toFixed(1);
                            progressText.textContent = pct.toFixed(1) + '% (' + loadedMB + ' / ' + totalMB + ' MB)';
                        } else if (e.loaded > 0) {
                            var loadedMB = (currentLoaded / 1048576).toFixed(1);
                            progressText.textContent = loadedMB + ' MB \u4E0B\u8F09\u4E2D...';
                        }
                    },
                    onload: function(res) {
                        activeReq = null;
                        if (paused) return;
                        if (cancelling) { resetUI(); return; }

                        if (res.status !== 200 && res.status !== 206) {
                            progressText.textContent = '\u4E0B\u8F09\u5931\u6557: HTTP ' + res.status;
                            setDlStatus(dlVideoId, 'fail:HTTP ' + res.status);
                            setTimeout(resetUI, 2000);
                            return;
                        }

                        chunks.push(res.response);
                        totalBytes += res.response.size;

                        progressText.textContent = '\u5DF2\u4E0B\u8F09\u5B8C\u6210\uFF0C\u5B58\u6A94\u4E2D...';
                        progressInner.style.width = '100%';

                        var blob = new Blob(chunks);
                        var reader = new FileReader();
                        reader.onload = function() {
                            GM_download({
                                url: reader.result,
                                name: filename,
                                saveAs: false,
                                onload: function() {
                                    progressInner.style.background = '#2e7d32';
                                    progressText.textContent = '100% - \u4E0B\u8F09\u5B8C\u6210!';
                                    setDlStatus(dlVideoId, 'done');
                                    setTimeout(function() {
                                        btn.textContent = 'Re-download';
                                        btn.style.background = 'rgba(255, 152, 0, 0.8)';
                                        var badge = document.createElement('span');
                                        badge.textContent = '\u2713';
                                        badge.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(46,125,50,0.9);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:11;pointer-events:none;';
                                        tc.style.position = 'relative';
                                        tc.appendChild(badge);
                                        resetUI();
                                    }, 1500);
                                },
                                onerror: function(e) {
                                    var errMsg = (e.error || '\u5B58\u6A94\u5931\u6557');
                                    progressText.textContent = errMsg;
                                    setDlStatus(dlVideoId, 'fail:' + errMsg);
                                    setTimeout(resetUI, 2000);
                                }
                            });
                        };
                        reader.onerror = function() {
                            progressText.textContent = '\u8A8D\u8B49\u5931\u6557';
                            setDlStatus(dlVideoId, 'fail:read');
                            setTimeout(resetUI, 2000);
                        };
                        reader.readAsDataURL(blob);
                    },
                    onerror: function() {
                        activeReq = null;
                        if (paused) return;
                        if (cancelling) {
                            progressText.textContent = '\u5DF2\u53D6\u6D88';
                        } else {
                            progressText.textContent = '\u7121\u6CD5\u9023\u7DD2\u5230\u4F3A\u670D\u5668';
                            setDlStatus(dlVideoId, 'fail:network');
                        }
                        setTimeout(resetUI, 1000);
                    }
                });
            }

            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                cancelling = true;
                if (activeReq) activeReq.abort();
            });

            pauseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (paused) {
                    paused = false;
                    pauseBtn.textContent = 'pause';
                    pauseBtn.title = '\u6682\u505C';
                    progressText.textContent = '\u7E7C\u7E8C\u4E2D...';
                    doDownload();
                } else {
                    paused = true;
                    if (activeReq) activeReq.abort();
                    pauseBtn.textContent = 'play_arrow';
                    pauseBtn.title = '\u7E7C\u7E8C';
                    var pct = totalBytes > 0 && dlTotal > 0 ? ((totalBytes / dlTotal) * 100).toFixed(1) : (totalBytes / 1048576).toFixed(1);
                    progressText.textContent = '\u5DF2\u6682\u505C (' + pct + (dlTotal > 0 ? '%' : ' MB') + ')';
                }
            });

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var match = href.match(/v=(\d+)/);
                if (!match) return;
                var videoId = match[1];

                if (isDone || isFail) {
                    setDlStatus(videoId, '');
                    var oldBadge = tc.querySelector('span[style*="position:absolute"]');
                    if (oldBadge) oldBadge.remove();
                }

                wrap.classList.add('active');
                progressOuter.style.display = 'block';
                progressText.style.display = 'block';
                progressText.textContent = 'Fetching video URL...';

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
                            progressText.textContent = '\u7121\u6CD5\u53D6\u5F97\u5F71\u7247 URL';
                            setTimeout(resetUI, 1500);
                            return;
                        }
                        var videoUrl = match2[1];
                        if (videoUrl.indexOf('//') === 0) videoUrl = 'https:' + videoUrl;

                        var titleMatch = res.responseText.match(/<h3[^>]*>([^<]+)<\/h3>/);
                        var title = titleMatch ? titleMatch[1].trim() : 'video_' + videoId;
                        var safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

                        dlUrl = videoUrl;
                        dlSafeTitle = safeTitle;

                        progressText.textContent = '\u958B\u59CB\u4E0B\u8F09...';
                        progressInner.style.width = '0%';
                        doDownload();
                    },
                    onerror: function() {
                        activeReq = null;
                        if (cancelling) {
                            progressText.textContent = '\u5DF2\u53D6\u6D88';
                        } else {
                            progressText.textContent = '\u7121\u6CD5\u9023\u7DD2\u5230\u4F3A\u670D\u5668';
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
                progressText.style.display = 'none';
                progressInner.style.width = '0%';
                progressInner.style.background = '#4caf50';
                btn.textContent = 'Download';
                btn.style.background = '';
                btn.title = '';
            }
        });
    }

    injectOverlays();
    var observer = new MutationObserver(injectOverlays);
    observer.observe(document.body, { childList: true, subtree: true });
})();
