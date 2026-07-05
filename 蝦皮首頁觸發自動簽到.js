// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Auto check-in Shopee coins via DOM click (invisible iframe on homepage)
// @author       Gemini
// @match        https://shopee.tw/*
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const TODAY = new Date().toDateString();
    if (GM_getValue('lastCheckInDate', '') === TODAY) return;

    const isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    console.log('[CheckIn] checking for check-in button...');

    function tryClick(doc) {
        doc = doc || document;
        var btn = doc.querySelector('button.iT0yAz');
        if (btn) {
            if (btn.getAttribute('data-inactive') !== 'true' && !btn.disabled) {
                btn.click();
                console.log('[CheckIn] clicked!');
                GM_setValue('lastCheckInDate', TODAY);
                return 'clicked';
            }
            // Already checked in today
            GM_setValue('lastCheckInDate', TODAY);
            console.log('[CheckIn] already done today');
            return 'done';
        }
        return null; // not found yet, keep waiting
    }

    function waitAndClick(doc, iframe) {
        var tries = 0;
        var timer = setInterval(function() {
            var r = tryClick(doc);
            if (r) {
                clearInterval(timer);
                if (iframe) setTimeout(function() { iframe.remove(); }, 1000);
                return;
            }
            if (++tries > 40) {
                clearInterval(timer);
                console.warn('[CheckIn] timed out waiting for button');
                if (iframe) iframe.remove();
            }
        }, 500);
    }

    if (isCoinsPage) {
        if (document.body) {
            if (!tryClick()) waitAndClick(document);
        } else {
            window.addEventListener('DOMContentLoaded', function() {
                if (!tryClick()) waitAndClick(document);
            });
        }
    } else {
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;';
        iframe.src = 'https://shopee.tw/shopee-coins';
        document.body.appendChild(iframe);
        console.log('[CheckIn] created iframe for coins page');

        iframe.addEventListener('load', function() {
            try {
                var doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc) waitAndClick(doc, iframe);
            } catch(e) {
                console.warn('[CheckIn] iframe access error:', e);
                iframe.remove();
            }
        });
    }
})();
