// ==UserScript==
// @name         Shopee Check-in Status
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Display check-in status text matching native button
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var el = null;

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
        document.body.appendChild(el);
    }

    function syncText() {
        var nativeBtn = document.querySelector('button.iT0yAz');
        if (nativeBtn && el) {
            el.textContent = nativeBtn.textContent;
        }
    }

    createStatusEl();
    syncText();

    var observer = new MutationObserver(syncText);
    var nativeBtn = document.querySelector('button.iT0yAz');
    if (nativeBtn) {
        observer.observe(nativeBtn, { childList: true, characterData: true, subtree: true });
    }
})();
