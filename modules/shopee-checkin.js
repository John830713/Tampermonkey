// ==UserScript==
// @name         Shopee Check-in Status
// @namespace    http://tampermonkey.net/
// @version      8.1
// @description  Display check-in status text matching native button
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var el = null;
    var nativeObserver = null;

    function createStatusEl() {
        if (el) return;
        var style = document.createElement('style');
        style.textContent = '\
            .sp-checkin-status {\
                position: fixed;\
                top: 16px;\
                left: 50%;\
                transform: translateX(-50%);\
                z-index: 99999;\
                padding: 8px 14px;\
                background: rgba(33, 33, 33, 0.85);\
                color: #fff;\
                font-size: 12px;\
                font-weight: bold;\
                border-radius: 6px;\
                font-family: sans-serif;\
                white-space: nowrap;\
                pointer-events: none;\
            }';
        document.head.appendChild(style);

        el = document.createElement('div');
        el.className = 'sp-checkin-status';
        el.textContent = '載入中...';
        document.body.appendChild(el);
    }

    function syncText() {
        var nativeBtn = document.querySelector('button.iT0yAz');
        if (nativeBtn && el) {
            el.textContent = nativeBtn.textContent;
            if (nativeObserver) nativeObserver.disconnect();
            nativeObserver = new MutationObserver(syncText);
            nativeObserver.observe(nativeBtn, { childList: true, characterData: true, subtree: true });
        }
    }

    createStatusEl();

    if (document.querySelector('button.iT0yAz')) {
        syncText();
    } else {
        var bodyObs = new MutationObserver(function() {
            if (document.querySelector('button.iT0yAz')) {
                bodyObs.disconnect();
                syncText();
            }
        });
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }
})();
