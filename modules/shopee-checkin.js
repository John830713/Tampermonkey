// ==UserScript==
// @name         Shopee Auto Check-in
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Check-in via new tab + native button click, no API needed
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var TODAY = new Date().toDateString();
    var CHECKIN_KEY = 'sp_checkin_date';
    var CHECKIN_AMT_KEY = 'sp_checkin_amount';
    var SESSION_DONE = '_checkin_session_done';
    var COINS_URL = 'https://shopee.tw/shopee-coins';
    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);

    // ─── Early exits ───────────────────────────────────────────
    if (sessionStorage.getItem(SESSION_DONE)) {
        console.log('[CheckIn] skip: session done');
        return;
    }

    var stored = localStorage.getItem(CHECKIN_KEY);
    if (stored === TODAY) {
        sessionStorage.setItem(SESSION_DONE, '1');
        console.log('[CheckIn] skip: already checked in today');
        return;
    }

    // ─── Coins page: find & click native button ───────────────
    function parseCoinAmount(text) {
        var m = text.match(/([\d.,]+)\s*蝦幣/);
        return m ? parseFloat(m[1].replace(',', '')) : null;
    }

    function findBtn() {
        var all = document.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) {
            var b = all[i];
            if (b.getAttribute('data-inactive') !== null) return b;
            if (b.textContent.indexOf('完成簽到') !== -1) return b;
        }
        return null;
    }

    function tryClick() {
        var btn = findBtn();
        if (!btn) return false;

        var inactive = btn.getAttribute('data-inactive');
        var text = btn.textContent || '';
        var amount = parseCoinAmount(text);

        if (text.indexOf('完成簽到') !== -1 && inactive !== 'true' && !btn.disabled) {
            btn.click();
            localStorage.setItem(CHECKIN_KEY, TODAY);
            if (amount !== null) localStorage.setItem(CHECKIN_AMT_KEY, String(amount));
            sessionStorage.setItem(SESSION_DONE, '1');
            console.log('[CheckIn] CLICKED amount=' + amount);
            return true;
        }

        if (text.indexOf('明天再回來') !== -1 || inactive === 'true') {
            localStorage.setItem(CHECKIN_KEY, TODAY);
            sessionStorage.setItem(SESSION_DONE, '1');
            console.log('[CheckIn] already done (inactive)');
            return true;
        }

        return false;
    }

    if (isCoinsPage) {
        console.log('[CheckIn] coins page, polling for button...');
        var pollCount = 0;
        var timer = setInterval(function() {
            if (tryClick()) {
                clearInterval(timer);
                return;
            }
            pollCount++;
            if (pollCount >= 120) {
                clearInterval(timer);
                console.warn('[CheckIn] TIMEOUT 60s');
            }
        }, 500);
        return;
    }

    // ─── Other pages: open new tab ─────────────────────────────
    console.log('[CheckIn] not coins page, will open new tab in 3s...');
    setTimeout(function() {
        window.open(COINS_URL, '_blank');
    }, 3000);
})();
