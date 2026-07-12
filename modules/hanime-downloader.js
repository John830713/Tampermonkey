// ==UserScript==
// @name         Hanime Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Hover thumbnail to show Download button with progress bar
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

    function injectOverlays() {
        document.querySelectorAll('.thumb-container').forEach(function(tc) {
            if (tc.querySelector('.dl-overlay-btn')) return;

            var link = tc.closest('a.video-link') || tc.querySelector('a');
            if (!link) return;

            var href = link.getAttribute('href');
            if (!href || href.indexOf('watch?v=') === -1) return;

            var wrap = document.createElement('div');
            wrap.className = 'dl-overlay-wrap';

            var btn = document.createElement('button');
            btn.className = 'dl-overlay-btn';
            btn.textContent = 'Download';

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
                        var match2 = res.responseText.match(/<video[^>]+src="([^"]+)"/);
                        if (!match2) {
                            progressText.textContent = '\u7121\u6CD5\u53D6\u5F97\u5F71\u7247 URL';
                            resetUI();
                            return;
                        }
                        var videoUrl = match2[1];
                        if (videoUrl.indexOf('//') === 0) videoUrl = 'https:' + videoUrl;

                        var titleMatch = res.responseText.match(/<h3[^>]*>([^<]+)<\/h3>/);
                        var title = titleMatch ? titleMatch[1].trim() : 'video_' + videoId;
                        var safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

                        downloadBlob(videoUrl, safeTitle);
                    },
                    onerror: function() {
                        progressText.textContent = '\u7121\u6CD5\u9023\u7DD2\u5230\u4F3A\u670D\u5668';
                        resetUI();
                    }
                });

                function downloadBlob(videoUrl, safeTitle) {
                    progressText.textContent = '\u958B\u59CB\u4E0B\u8F09...';

                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', videoUrl, true);
                    xhr.responseType = 'blob';

                    xhr.onprogress = function(event) {
                        if (event.lengthComputable) {
                            var percent = (event.loaded / event.total) * 100;
                            progressInner.style.width = percent + '%';
                            var loadedMB = (event.loaded / 1024 / 1024).toFixed(1);
                            var totalMB = (event.total / 1024 / 1024).toFixed(1);
                            progressText.textContent = percent.toFixed(1) + '% (' + loadedMB + ' / ' + totalMB + ' MB)';
                        }
                    };

                    xhr.onload = function() {
                        if (xhr.status === 200) {
                            var blob = xhr.response;
                            var blobUrl = URL.createObjectURL(blob);
                            var a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = safeTitle + '.mp4';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(function() {
                                URL.revokeObjectURL(blobUrl);
                                document.body.removeChild(a);
                            }, 2000);
                            resetUI();
                        } else {
                            progressText.textContent = '\u4E0B\u8F09\u5931\u6557 (HTTP ' + xhr.status + ')';
                            resetUI();
                        }
                    };

                    xhr.onerror = function() {
                        progressText.textContent = '\u7DB2\u8DEF\u932F\u8AA4';
                        resetUI();
                    };

                    xhr.send();
                }

                function resetUI() {
                    btn.disabled = false;
                    btn.textContent = 'Download';
                    progressOuter.style.display = 'none';
                    progressText.style.display = 'none';
                    progressInner.style.width = '0%';
                }
            });
        });
    }

    injectOverlays();
    var observer = new MutationObserver(injectOverlays);
    observer.observe(document.body, { childList: true, subtree: true });
})();
