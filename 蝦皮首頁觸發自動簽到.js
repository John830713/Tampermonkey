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
    var lastVal = GM_getValue('lastCheckInDate', '');
    console.log('[CheckIn] v4.2 path=' + location.pathname + ' last=' + lastVal + ' today=' + TODAY);
    if (lastVal === TODAY) { console.log('[CheckIn] skip: already today'); return; }

    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    console.log('[CheckIn] isCoinsPage=' + isCoinsPage);

    function btnStr(b) {
        if (!b) return 'null';
        return b.tagName + '.' + (b.className || '') + ' inactive=' + b.getAttribute('data-inactive') + ' disabled=' + b.disabled + ' text="' + (b.textContent || '').trim().substring(0, 30) + '"';
    }

    function tryClick() {
        var btn = document.querySelector('button.iT0yAz');
        console.log('[CheckIn] tryClick -> ' + btnStr(btn));
        if (!btn) return false;
        if (btn.getAttribute('data-inactive') !== 'true' && !btn.disabled) {
            btn.click();
            GM_setValue('lastCheckInDate', TODAY);
            console.log('[CheckIn] CLICKED!');
            return true;
        }
        console.log('[CheckIn] inactive/disabled, marking done');
        GM_setValue('lastCheckInDate', TODAY);
        return true;
    }

    function goBack() {
        var orig = GM_getValue('_checkin_orig_url');
        console.log('[CheckIn] goBack orig=' + orig);
        if (orig) {
            GM_deleteValue('_checkin_orig_url');
            location.href = orig;
        }
    }

    if (isCoinsPage) {
        if (tryClick()) { goBack(); return; }
        var maxTries = 60;
        var timer = setInterval(function() {
            if (tryClick()) {
                clearInterval(timer);
                goBack();
            }
            if (--maxTries <= 0) {
                clearInterval(timer);
                console.warn('[CheckIn] TIMEOUT after 30s');
            }
        }, 500);
        return;
    }

    console.log('[CheckIn] navigating to /shopee-coins from ' + location.href);
    GM_setValue('_checkin_orig_url', location.href);
    location.href = '/shopee-coins';
})();
