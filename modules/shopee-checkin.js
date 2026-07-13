// ==UserScript==
// @name         Shopee Auto Check-in
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Auto check-in Shopee coins — find button by data-inactive, click, record amount, postMessage to parent
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    var TODAY = new Date().toDateString();
    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    console.log('[CheckIn] v5.0 path=' + location.pathname + ' isCoinsPage=' + isCoinsPage);

    function postToParent(data) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(Object.assign({source: 'shopee-checkin'}, data), '*');
            }
        } catch(e) {}
    }

    if (sessionStorage.getItem('_checkin_session_done')) {
        console.log('[CheckIn] skip: already done this session');
        var lastAmt = GM_getValue('lastCheckInAmount', null);
        postToParent({status: 'already', date: GM_getValue('lastCheckInDate',''), amount: lastAmt});
        return;
    }

    var stored = GM_getValue('lastCheckInDate', '');
    if (stored === TODAY) {
        console.log('[CheckIn] skip: already checked in today');
        sessionStorage.setItem('_checkin_session_done', '1');
        postToParent({status: 'already', date: TODAY, amount: GM_getValue('lastCheckInAmount', null)});
        return;
    }

    function btnStr(b) {
        if (!b) return 'null';
        return b.tagName + '.' + (b.className || '') + ' inactive=' + b.getAttribute('data-inactive') + ' disabled=' + b.disabled + ' text="' + (b.textContent || '').trim().substring(0, 40) + '"';
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

    function parseCoinAmount(text) {
        var m = text.match(/([\d.]+)\s*蝦幣/);
        return m ? parseFloat(m[1]) : null;
    }

    function tryClick() {
        var btn = findBtn();
        console.log('[CheckIn] tryClick -> ' + btnStr(btn));
        if (!btn) return false;

        var inactive = btn.getAttribute('data-inactive');
        var amount = parseCoinAmount(btn.textContent);

        if (inactive !== 'true' && !btn.disabled) {
            btn.click();
            GM_setValue('lastCheckInDate', TODAY);
            if (amount !== null) GM_setValue('lastCheckInAmount', amount);
            sessionStorage.setItem('_checkin_session_done', '1');
            console.log('[CheckIn] CLICKED! amount=' + amount);
            postToParent({status: 'clicked', date: TODAY, amount: amount});
            return true;
        }

        console.log('[CheckIn] already checked in (inactive=' + inactive + ')');
        GM_setValue('lastCheckInDate', TODAY);
        sessionStorage.setItem('_checkin_session_done', '1');
        postToParent({status: 'already', date: TODAY, amount: amount});
        return true;
    }

    if (isCoinsPage) {
        console.log('[CheckIn] waiting for button...');
        var pollCount = 0;
        var timer = setInterval(function() {
            if (tryClick()) {
                clearInterval(timer);
                return;
            }
            pollCount++;
            if (pollCount >= 120) {
                clearInterval(timer);
                console.warn('[CheckIn] TIMEOUT after 60s');
                postToParent({status: 'timeout'});
            }
        }, 500);
        return;
    }

    console.log('[CheckIn] navigating to /shopee-coins from ' + location.href);
    location.href = '/shopee-coins';
})();
