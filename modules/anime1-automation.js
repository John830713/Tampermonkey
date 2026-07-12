// ==UserScript==
// @name         Anime1 Automation Helper
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  自動建立作品資料夾並存放下載檔案
// @author       Gemini
// @match        *://anime1.me/*
// @match        *://*.v.anime1.me/*
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_openInTab
// @allFrames    true
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const isSinglePage = /anime1\.me\/\d+/.test(window.top.location.href);
    const isIframe = window.location.hostname.includes('v.anime1.me');
    const isListPage = !!(document.querySelector('.archive-title') || document.querySelector('article.type-post'));

    // --- [ 1. 列表頁功能：固定式面板 ] ---
    if (window.self === window.top && isListPage) {
        const rawElements = Array.from(document.querySelectorAll('h2.entry-title a'));
        const uniqueEpisodes = [];
        const seenUrls = new Set();

        rawElements.forEach(a => {
            const url = a.href;
            const title = a.innerText.trim();
            if (!seenUrls.has(url) && title.includes('[')) {
                seenUrls.add(url);
                uniqueEpisodes.push({ title: title, url: url });
            }
        });

        const episodes = uniqueEpisodes.reverse();

        if (episodes.length > 0) {
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999;
                width: 300px; max-height: 80vh; overflow-y: auto;
                padding: 15px; background: rgba(47, 53, 66, 0.95);
                backdrop-filter: blur(10px); color: white;
                border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.1);
                font-family: sans-serif;
            `;

            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <b style="color:#e67e22;">📦 快速下載 (${episodes.length} 集)</b>
                    <span id="toggle-panel" style="cursor:pointer; font-size:12px; color:#aaa;">[收合]</span>
                </div>
                <div id="panel-content">
                    <button id="batch-all" style="width:100%; background:#ff4757; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold; margin-bottom:12px;">🚀 一鍵批次全集下載</button>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
            `;

            episodes.forEach((ep, idx) => {
                const epLabel = ep.title.match(/\[(.*?)\]/)?.[1] || (idx + 1);
                html += `<button class="ep-btn" data-url="${ep.url}" title="${ep.title}" style="background:#1e90ff; color:white; border:none; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:11px;">${epLabel}</button>`;
            });

            html += `</div></div>`;
            container.innerHTML = html;
            document.body.appendChild(container);

            const content = container.querySelector('#panel-content');
            const toggle = container.querySelector('#toggle-panel');
            toggle.onclick = () => {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggle.innerText = '[收合]';
                    container.style.width = '300px';
                } else {
                    content.style.display = 'none';
                    toggle.innerText = '[展開]';
                    container.style.width = '120px';
                }
            };

            container.querySelectorAll('.ep-btn').forEach(btn => {
                btn.onclick = () => GM_openInTab(btn.dataset.url, { active: false, insert: true });
            });

            document.getElementById('batch-all').onclick = function() {
                if (confirm(`確定依序下載共 ${episodes.length} 集？\n檔案將儲存於作品名稱資料夾中。`)) {
                    this.disabled = true;
                    episodes.forEach((ep, i) => {
                        setTimeout(() => {
                            GM_openInTab(ep.url, { active: false, insert: true });
                            this.innerText = `正在處理 (${i+1}/${episodes.length})`;
                            if (i === episodes.length - 1) {
                                this.disabled = false;
                                this.innerText = "🚀 一鍵批次全集下載";
                            }
                        }, i * 3000);
                    });
                }
            };
        }
    }

    // --- [ 2. 單集頁面功能：處理路徑與下載 ] ---
    if (isSinglePage || isIframe) {
        if (window.hasFiredDownload) return;

        const getDownloadPath = () => {
            const fullTitle = window.top.document.title;
            // 提取作品名稱 (排除集數與網站後綴)
            const folderName = fullTitle.split(' [')[0].trim().replace(/[\\/:*?"<>|]/g, '_');
            // 提取集數
            const match = fullTitle.match(/\[(\d+(\.\d+)?)\]/);
            const fileName = match ? `${match[1].replace('.', '_')}.mp4` : `Anime1_${Date.now()}.mp4`;

            // 回傳相對路徑：資料夾/檔名
            return `${folderName}/${fileName}`;
        };

        const closeThisTab = () => {
            window.top.close();
            setTimeout(() => { if (!window.top.closed) GM_notification({ title: "下載成功", text: "請手動關閉分頁" }); }, 500);
        };

        const doDownload = (url) => {
            if (window.hasFiredDownload) return;
            window.hasFiredDownload = true;

            const path = getDownloadPath();

            GM_download({
                url: url,
                name: path, // 這裡傳入帶有斜線的路徑
                saveAs: false,
                onerror: (err) => {
                    console.error("下載失敗:", err);
                    // 如果因為路徑問題失敗，嘗試改回純檔名下載
                    if(err.error === 'not_whitelisted') {
                       GM_notification({ title: "權限提示", text: "請在 Tampermonkey 設定中允許下載子資料夾。" });
                    }
                }
            });

            GM_notification({ title: "🚀 開始下載", text: `路徑: ${path}`, timeout: 1500 });
            setTimeout(closeThisTab, 1500);
        };

        const autoPlay = () => {
            const btn = document.querySelector('.vjs-big-play-button') || document.querySelector('.vjs-play-control');
            if (btn) btn.click();
            else {
                const v = document.querySelector('video');
                if (v) v.play().catch(() => {});
            }
        };

        const orgOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(m, url) {
            if (!window.hasFiredDownload && (url.includes('redirect=1') || url.includes('.mp4'))) doDownload(url);
            return orgOpen.apply(this, arguments);
        };

        setInterval(() => {
            const v = document.querySelector('video');
            if (!window.hasFiredDownload && v && v.src && !v.src.includes('blob:')) doDownload(v.src);
        }, 1000);

        window.addEventListener('load', () => setTimeout(autoPlay, 1000));
    }
})();