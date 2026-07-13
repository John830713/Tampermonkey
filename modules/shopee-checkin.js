// ==UserScript==
// @name         Shopee Auto Check-in
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Auto check-in Shopee coins with floating status button on coins page
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
    console.log('[CheckIn] v5.1 path=' + location.pathname + ' isCoinsPage=' + isCoinsPage);

    // ─── Status Button ─────────────────────────────────────────
    var statusBtn = null;

    function createStatusBtn() {
        if (statusBtn) return;
        var style = document.createElement('style');
        style.textContent = '\
            .sp-checkin-btn {\
                position: fixed;\
                top: 16px;\
                left: 50%;\
                transform: translateX(-50%);\
                z-index: 99999;\
                padding: 8px 14px;\
                background: #9e9e9e;\
                color: #fff;\
                font-size: 12px;\
                font-weight: bold;\
                border: none;\
                border-radius: 6px;\
                cursor: default;\
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);\
                font-family: sans-serif;\
                transition: background 0.3s;\
                pointer-events: none;\
            }\
            .sp-checkin-btn.active {\
                background: rgba(238, 77, 45, 0.9);\
                cursor: pointer;\
                pointer-events: auto;\
            }\
            .sp-checkin-btn.done {\
                background: rgba(46, 125, 50, 0.9);\
            }\
            .sp-checkin-btn.error {\
                background: rgba(198, 40, 40, 0.9);\
            }';
        document.head.appendChild(style);

        statusBtn = document.createElement('button');
        statusBtn.className = 'sp-checkin-btn';
        statusBtn.textContent = '\u7C3D\u5230\u4E2D...';
        document.body.appendChild(statusBtn);
    }

    function updateBtn(text, cls) {
        if (!statusBtn) createStatusBtn();
        statusBtn.textContent = text;
        statusBtn.className = 'sp-checkin-btn' + (cls ? ' ' + cls : '');
    }

    // ─── postMessage to parent (for iframe use) ────────────────
    function postToParent(data) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(Object.assign({source: 'shopee-checkin'}, data), '*');
            }
        } catch(e) {}
    }

    // ─── Early exits ───────────────────────────────────────────
    if (sessionStorage.getItem('_checkin_session_done')) {
        console.log('[CheckIn] skip: already done this session');
        var lastAmt = GM_getValue('lastCheckInAmount', null);
        var lastDate = GM_getValue('lastCheckInDate', '');
        postToParent({status: 'already', date: lastDate, amount: lastAmt});
        if (isCoinsPage) {
            createStatusBtn();
            updateBtn('\u5DF2\u7C3D\u5230' + (lastAmt ? ' +' + lastAmt + ' \u8872\u5E63' : ''), 'done');
        }
        return;
    }

    var stored = GM_getValue('lastCheckInDate', '');
    if (stored === TODAY) {
        console.log('[CheckIn] skip: already checked in today');
        sessionStorage.setItem('_checkin_session_done', '1');
        postToParent({status: 'already', date: TODAY, amount: GM_getValue('lastCheckInAmount', null)});
        if (isCoinsPage) {
            createStatusBtn();
            var amt = GM_getValue('lastCheckInAmount', null);
            updateBtn('\u5DF2\u7C3D\u5230' + (amt ? ' +' + amt + ' \u8872\u5E63' : ''), 'done');
        }
        return;
    }

    // ─── Helpers ───────────────────────────────────────────────
    function btnStr(b) {
        if (!b) return 'null';
        return b.tagName + '.' + (b.className || '') + ' inactive=' + b.getAttribute('data-inactive') + ' disabled=' + b.disabled + ' text="' + (b.textContent || '').trim().substring(0, 40) + '"';
    }

    function findBtn() {
        var all = document.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) {
            var b = all[i];
            if (b.getAttribute('data-inactive') !== null) return b;
            if (b.textContent.indexOf('\u5B8C\u6210\u7C3D\u5230') !== -1) return b;
        }
        return null;
    }

    function parseCoinAmount(text) {
        var m = text.match(/([\d.]+)\s*\u8872\u5E63/);
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
            updateBtn('\u5DF2\u7C3D\u5230 +' + (amount || '?') + ' \u8872\u5E63', 'done');
            return true;
        }

        console.log('[CheckIn] already checked in (inactive=' + inactive + ')');
        GM_setValue('lastCheckInDate', TODAY);
        sessionStorage.setItem('_checkin_session_done', '1');
        postToParent({status: 'already', date: TODAY, amount: amount});
        updateBtn('\u5DF2\u7C3D\u5230' + (amount ? ' +' + amount + ' \u8872\u5E63' : ''), 'done');
        return true;
    }

    // ─── Main logic ────────────────────────────────────────────
    if (isCoinsPage) {
        createStatusBtn();
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
                updateBtn('\u7C3D\u5230\u8D85\u6642', 'error');
            }
        }, 500);
        return;
    }

    console.log('[CheckIn] navigating to /shopee-coins from ' + location.href);
    location.href = '/shopee-coins';
})();
