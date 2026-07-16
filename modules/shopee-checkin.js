// ==UserScript==
// @name         Shopee Auto Check-in
// @namespace    http://tampermonkey.net/
// @version      9.2
// @description  Auto check-in via silent new tab, close after done
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
    var COINS_URL = 'https://shopee.tw/shopee-coins?ac=1';
    var isCoinsPage = /^\/(shopee-coins|coins)(\/|$)/.test(window.location.pathname);
    var isAutoClose = window.location.search.indexOf('ac=1') !== -1;

    // ─── Status display (only on manual pages) ─────────────────
    var statusEl = null;
    var nativeObs = null;

    function createStatusEl() {
        if (statusEl) return;
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
        statusEl = document.createElement('div');
        statusEl.className = 'sp-checkin-status';
        document.body.appendChild(statusEl);
    }

    function updateStatus(text, bg) {
        createStatusEl();
        statusEl.textContent = text;
        if (bg) statusEl.style.background = bg;
    }

    function syncNativeText() {
        var nativeBtn = document.querySelector('button.iT0yAz');
        if (nativeBtn && statusEl) {
            statusEl.textContent = nativeBtn.textContent;
            if (nativeObs) nativeObs.disconnect();
            nativeObs = new MutationObserver(syncNativeText);
            nativeObs.observe(nativeBtn, { childList: true, characterData: true, subtree: true });
        }
    }

    function watchForNativeButton() {
        createStatusEl();
        if (document.querySelector('button.iT0yAz')) {
            syncNativeText();
        } else {
            var bodyObs = new MutationObserver(function() {
                if (document.querySelector('button.iT0yAz')) {
                    bodyObs.disconnect();
                    syncNativeText();
                }
            });
            bodyObs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ─── Early exits ───────────────────────────────────────────
    if (sessionStorage.getItem(SESSION_DONE)) {
        if (isAutoClose) { window.close(); return; }
        var lastAmt = localStorage.getItem(CHECKIN_AMT_KEY);
        createStatusEl();
        updateStatus('已簽到' + (lastAmt ? ' +' + lastAmt + ' 蝦幣' : ''), 'rgba(46, 125, 50, 0.9)');
        return;
    }

    var stored = localStorage.getItem(CHECKIN_KEY);
    if (stored === TODAY) {
        sessionStorage.setItem(SESSION_DONE, '1');
        if (isAutoClose) { window.close(); return; }
        var amt = localStorage.getItem(CHECKIN_AMT_KEY);
        createStatusEl();
        updateStatus('已簽到' + (amt ? ' +' + amt + ' 蝦幣' : ''), 'rgba(46, 125, 50, 0.9)');
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
            if (isAutoClose) setTimeout(function() { window.close(); }, 1000);
            return true;
        }

        if (text.indexOf('明天再回來') !== -1 || inactive === 'true') {
            localStorage.setItem(CHECKIN_KEY, TODAY);
            sessionStorage.setItem(SESSION_DONE, '1');
            console.log('[CheckIn] already done (inactive)');
            if (isAutoClose) setTimeout(function() { window.close(); }, 500);
            return true;
        }

        return false;
    }

    if (isCoinsPage) {
        console.log('[CheckIn] coins page, polling for button...');
        if (!isAutoClose) watchForNativeButton();
        var pollCount = 0;
        var timer = setInterval(function() {
            if (tryClick()) {
                clearInterval(timer);
                return;
            }
            pollCount++;
            if (pollCount >= 120) {
                clearInterval(timer);
                if (isAutoClose) { window.close(); }
                else { updateStatus('簽到超時', 'rgba(198, 40, 40, 0.9)'); }
                console.warn('[CheckIn] TIMEOUT 60s');
            }
        }, 500);
        return;
    }

    // ─── Other pages: show status + open silent tab ────────────
    window.addEventListener('storage', function(e) {
        if (e.key === CHECKIN_KEY && e.newValue === TODAY) {
            console.log('[CheckIn] check-in done in other tab, refreshing...');
            setTimeout(function() { location.reload(); }, 1500);
        }
    });

    updateStatus('即將簽到...', 'rgba(238, 77, 45, 0.9)');
    console.log('[CheckIn] not coins page, will open new tab in 3s...');
    setTimeout(function() {
        window.open(COINS_URL, '_blank');
    }, 3000);
})();
