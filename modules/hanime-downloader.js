// ==UserScript==
// @name         Hanime Downloader
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Hover thumbnail to show Download button with progress bar
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
        .thumb-container:hover .dl-overlay-wrap {
            opacity: 1;
            pointer-events: auto;
        }
        .dl-overlay-btn {
            width: 100%;
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
        .dl-progress-outer {
            width: 100%;
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
            color: #fff;
            font-size: 10px;
            font-family: monospace;
            text-shadow: 0 0 3px rgba(0,0,0,0.8);
            margin-top: 2px;
            text-align: center;
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

            var btn = document.createElement('button');
            btn.className = 'dl-overlay-btn';
            if (isDone) {
                btn.textContent = 'Downloaded';
                btn.style.background = 'rgba(46, 125, 50, 0.9)';
            } else if (isFail) {
                btn.textContent = 'Failed';
                btn.style.background = 'rgba(198, 40, 40, 0.9)';
                btn.title = dlStatus[vid].replace('fail:', '');
            } else {
                btn.textContent = 'Download';
            }

            var progressOuter = document.createElement('div');
            progressOuter.className = 'dl-progress-outer';
            var progressInner = document.createElement('div');
            progressInner.className = 'dl-progress-inner';
            progressOuter.appendChild(progressInner);

            var progressText = document.createElement('span');
            progressText.className = 'dl-progress-text';

            wrap.appendChild(btn);
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

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var match = href.match(/v=(\d+)/);
                if (!match) return;
                var videoId = match[1];

                btn.disabled = true;
                btn.textContent = '\u6B63\u5728\u5EFA\u7ACB\u9023\u7DD2...';
                progressOuter.style.display = 'block';
                progressText.style.display = 'block';
                progressText.textContent = 'Fetching video URL...';

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://hanime1.me/watch?v=' + videoId,
                    onload: function(res) {
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

                        startGMDownload(videoUrl, safeTitle, videoId);
                    },
                    onerror: function() {
                        progressText.textContent = '\u7121\u6CD5\u9023\u7DD2\u5230\u4F3A\u670D\u5668';
                        setTimeout(resetUI, 1500);
                    }
                });

                function startGMDownload(videoUrl, safeTitle, videoId) {
                    progressText.textContent = '\u958B\u59CB\u4E0B\u8F09...';
                    progressInner.style.width = '0%';

                    var filename = safeTitle + '.mp4';

                    GM_download({
                        url: videoUrl,
                        name: filename,
                        saveAs: false,
                        onprogress: function(e) {
                            if (e.lengthComputable) {
                                var percent = (e.loaded / e.total) * 100;
                                progressInner.style.width = percent + '%';
                                var loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                                var totalMB = (e.total / 1024 / 1024).toFixed(1);
                                progressText.textContent = percent.toFixed(1) + '% (' + loadedMB + ' / ' + totalMB + ' MB)';
                            }
                        },
                        onload: function() {
                            progressInner.style.width = '100%';
                            progressInner.style.background = '#2e7d32';
                            progressText.textContent = '100% - \u4E0B\u8F09\u5B8C\u6210!';
                            setDlStatus(videoId, 'done');
                            setTimeout(function() {
                                btn.textContent = 'Downloaded';
                                btn.style.background = 'rgba(46, 125, 50, 0.9)';
                                btn.disabled = false;
                                var badge = document.createElement('span');
                                badge.textContent = '\u2713';
                                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(46,125,50,0.9);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:11;pointer-events:none;';
                                tc.style.position = 'relative';
                                tc.appendChild(badge);
                                resetUI();
                            }, 1500);
                        },
                        onerror: function(e) {
                            var errMsg = (e.error || '\u672A\u77E5\u932F\u8AA4');
                            progressText.textContent = '\u4E0B\u8F09\u5931\u6557: ' + errMsg;
                            setDlStatus(videoId, 'fail:' + errMsg);
                            setTimeout(function() {
                                btn.textContent = 'Failed';
                                btn.style.background = 'rgba(198, 40, 40, 0.9)';
                                btn.title = errMsg;
                                btn.disabled = false;
                                var badge = document.createElement('span');
                                badge.textContent = '\u2717';
                                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(198,40,40,0.9);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:11;pointer-events:none;';
                                tc.style.position = 'relative';
                                tc.appendChild(badge);
                                resetUI();
                            }, 2000);
                        }
                    });
                }

                function resetUI() {
                    btn.disabled = false;
                    progressOuter.style.display = 'none';
                    progressText.style.display = 'none';
                    progressInner.style.width = '0%';
                    progressInner.style.background = '#4caf50';
                }
            });
        });
    }

    injectOverlays();
    var observer = new MutationObserver(injectOverlays);
    observer.observe(document.body, { childList: true, subtree: true });
})();
