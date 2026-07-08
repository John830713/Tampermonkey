// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Auto check-in Shopee coins via client-side route navigation
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    var TODAY = new Date().toDateString();
    if (GM_getValue('lastCheckInDate', '') === TODAY) {
        console.log('[CheckIn] already done today, skipping');
        return;
    }

    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    var originalUrl = location.href;

    function tryClick(doc) {
        doc = doc || document;
        var btn = doc.querySelector('button.iT0yAz');
        if (btn) {
            if (btn.getAttribute('data-inactive') !== 'true' && !btn.disabled) {
                btn.click();
                console.log('[CheckIn] clicked!');
                GM_setValue('lastCheckInDate', TODAY);
                return true;
            }
            GM_setValue('lastCheckInDate', TODAY);
            console.log('[CheckIn] already done (button inactive)');
            return true;
        }
        return false;
    }

    function pollClick(doc, timeoutSec, onDone, onTimeout) {
        doc = doc || document;
        var tries = 0;
        var maxTries = (timeoutSec || 12) * 2;
        var timer = setInterval(function() {
            if (tryClick(doc)) {
                clearInterval(timer);
                if (onDone) onDone();
                return;
            }
            if (++tries >= maxTries) {
                clearInterval(timer);
                console.warn('[CheckIn] timed out');
                if (onTimeout) onTimeout();
            }
        }, 500);
    }

    function goBack() {
        var u = GM_getValue('_checkin_orig_url');
        if (u) {
            GM_deleteValue('_checkin_orig_url');
            setTimeout(function() { location.href = u; }, 500);
        }
    }

    if (isCoinsPage) {
        if (document.body) {
            if (!tryClick(document)) pollClick(document, 12, goBack);
        } else {
            window.addEventListener('DOMContentLoaded', function() {
                if (!tryClick(document)) pollClick(document, 12, goBack);
            });
        }
        return;
    }

    // Attempt client-side navigation to coins page
    console.log('[CheckIn] navigating client-side to /shopee-coins');
    history.pushState(null, '', '/shopee-coins');
    window.dispatchEvent(new PopStateEvent('popstate'));

    pollClick(document, 15, null, function() {
        console.warn('[CheckIn] fallback: hard navigation to coins page');
        GM_setValue('_checkin_orig_url', originalUrl);
        location.href = '/shopee-coins';
    });

    setTimeout(function() {
        history.replaceState(null, '', originalUrl);
    }, 20000);
})();
