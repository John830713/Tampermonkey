// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Auto check-in Shopee coins via DOM click (no iframe)
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const TODAY = new Date().toDateString();
    if (GM_getValue('lastCheckInDate', '') === TODAY) return;

    console.log('[CheckIn] looking for check-in button...');

    function clickCheckin() {
        const btn = document.querySelector('button.iT0yAz.lWe3F5');
        if (btn && !btn.disabled && btn.textContent.includes('完成簽到')) {
            btn.click();
            console.log('[CheckIn] button clicked');
            GM_setValue('lastCheckInDate', TODAY);
            return true;
        }
        return false;
    }

    function observe() {
        const observer = new MutationObserver(() => {
            if (clickCheckin()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) {
        if (!clickCheckin()) observe();
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            if (!clickCheckin()) observe();
        });
    }
})();
