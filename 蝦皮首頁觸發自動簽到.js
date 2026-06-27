// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  進入蝦皮首頁時自動觸發簽到，無需手動跳轉
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const COIN_URL = 'https://shopee.tw/shopee-coins';
    const TODAY = new Date().toDateString();

    // --- 邏輯 A：如果你在首頁 ---
    if (window.location.pathname === '/' || window.location.host === 'shopee.tw') {
        const lastCheck = GM_getValue('lastCheckInDate', '');

        // 如果今天還沒簽到過
        if (lastCheck !== TODAY) {
            console.log('偵測到進入首頁，準備自動簽到...');

            // 建立一個隱藏的 iframe 來跑簽到頁面
            const iframe = document.createElement('iframe');
            iframe.src = COIN_URL;
            iframe.style.display = 'none'; // 隱藏起來，不影響視覺
            document.body.appendChild(iframe);

            // 設定 10 秒後如果沒反應就移除 iframe，避免浪費資源
            setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 10000);
        }
    }

    // --- 邏輯 B：執行點擊動作（不論是在原頁面還是 iframe 內） ---
    if (window.location.href.includes('shopee-coins')) {
        const tryClick = () => {
            // 根據你提供的按鈕 class
            const btn = document.querySelector('button.iT0yAz.lWe3F5');

            if (btn) {
                // 檢查文字是否為「領取」或包含可簽到的狀態
                if (btn.innerText.includes('領取') || btn.innerText.includes('簽到')) {
                    btn.click();
                    console.log('簽到成功！');
                    GM_setValue('lastCheckInDate', TODAY);
                } else if (btn.innerText.includes('明天再回來')) {
                    // 如果發現已經領過了，也更新日期，避免首頁重複觸發
                    console.log('今日已簽到過。');
                    GM_setValue('lastCheckInDate', TODAY);
                }
            }
        };

        // 使用觀察器等待按鈕出現
        const observer = new MutationObserver(() => {
            tryClick();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // 保險起見 3 秒後跑一次
        setTimeout(tryClick, 3000);
    }
})();