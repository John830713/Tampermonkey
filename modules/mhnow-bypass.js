// ==UserScript==
// @name         MHNow Bypass
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  強制移除 mhnow.me 的 Adblock 提示並恢復滾動
// @author       Gemini
// @match        https://mhnow.me/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const cleanUI = () => {
        // 1. 移除偵測彈窗 (針對該站特定的 Please allow ads 內容)
        const elements = document.querySelectorAll('div');
        elements.forEach(el => {
            if (el.textContent.includes("Please allow ads on our site")) {
                // 向上找尋最外層的容器並移除
                let container = el.closest('div[style*="z-index"]');
                if (container) container.remove();
                else el.remove();
            }
        });

        // 2. 移除背景半透明遮罩
        const masks = document.querySelectorAll('div[style*="opacity"], div[style*="background-color: rgba(0, 0, 0"]');
        masks.forEach(m => {
            if (m.style.zIndex > 10) m.remove();
        });

        // 3. 強制恢復捲軸 (最重要)
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('position', 'static', 'important');
    };

    // 初始執行一次
    window.addEventListener('load', cleanUI);

    // 每秒檢查一次 (防止 AJAX 非同步載入後又彈出來)
    setInterval(cleanUI, 1000);
})();