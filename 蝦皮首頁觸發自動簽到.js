// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Auto check-in Shopee coins via hard navigation to /shopee-coins
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    var TODAY = new Date().toDateString();
    if (GM_getValue('lastCheckInDate', '') === TODAY) return;

    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);

    function tryClick() {
        var btn = document.querySelector('button.iT0yAz');
        if (!btn) return false;
        if (btn.getAttribute('data-inactive') !== 'true' && !btn.disabled) {
            btn.click();
            GM_setValue('lastCheckInDate', TODAY);
            return true;
        }
        GM_setValue('lastCheckInDate', TODAY);
        return true;
    }

    function goBack() {
        var orig = GM_getValue('_checkin_orig_url');
        if (orig) {
            GM_deleteValue('_checkin_orig_url');
            location.href = orig;
        }
    }

    if (isCoinsPage) {
        if (tryClick()) { goBack(); return; }
        var maxTries = 20;
        var timer = setInterval(function() {
            if (tryClick()) {
                clearInterval(timer);
                goBack();
            }
            if (--maxTries <= 0) clearInterval(timer);
        }, 500);
        return;
    }

    // Hard navigation to coins page
    GM_setValue('_checkin_orig_url', location.href);
    location.href = '/shopee-coins';
})();
