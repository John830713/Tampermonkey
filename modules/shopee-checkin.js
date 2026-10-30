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

    // Detect Shopee anti-bot / verification pages - pause and show notice
    var isVerifyPage = /\/verify\/(captcha|traffic)/i.test(location.pathname) ||
                       location.href.indexOf('anti_bot_tracking_id') !== -1 ||
                       location.href.indexOf('captcha') !== -1;
    if (isVerifyPage) {
        createStatusEl();
        updateStatus('⚠️ 需要人機驗證，請手動通過後重新整理', 'rgba(255, 152, 0, 0.95)');
        console.log('[CheckIn] Shopee verify page detected - pausing auto actions');
        return;
    }

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

    // ─── Early exits (non-coins pages only) ────────────────────
    // Coins page always polls the native button as source of truth
    if (!isCoinsPage) {
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
    }

    // ─── Coins page: find & click native button ───────────────
    function parseCoinAmount(text) {
        var m = text.match(/([\d.,]+)\s*蝦幣/);
        return m ? parseFloat(m[1].replace(',', '')) : null;
    }

    function findBtn() {
        var all = document.querySelectorAll('button');
        // Prefer explicit check-in buttons
        for (var i = 0; i < all.length; i++) {
            var b = all[i];
            var t = b.textContent || '';
            if (t.indexOf('完成簽到') !== -1) return b;
            if ((t.indexOf('每日簽到') !== -1 || t.indexOf('簽到領') !== -1) && b.getAttribute('data-inactive') !== 'true') return b;
        }
        // Shopee sometimes uses data-inactive to mark state
        for (var j = 0; j < all.length; j++) {
            var b2 = all[j];
            var t2 = b2.textContent || '';
            if (b2.getAttribute('data-inactive') !== null && (t2.indexOf('簽到') !== -1 || t2.indexOf('蝦幣') !== -1)) return b2;
        }
        // Fallback: any button mentioning check-in
        for (var k = 0; k < all.length; k++) {
            var b3 = all[k];
            var t3 = b3.textContent || '';
            if (t3.indexOf('明天再回來') !== -1 || t3.indexOf('已簽到') !== -1) return b3;
            if (t3.indexOf('每日簽到') !== -1 || t3.indexOf('領蝦幣') !== -1) return b3;
        }
        return null;
    }

    function isActuallyClickable(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.getAttribute('disabled') !== null) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        if (btn.getAttribute('data-inactive') === 'true') return false;
        var style = window.getComputedStyle(btn);
        if (style && style.pointerEvents === 'none') return false;
        if (style && style.opacity === '0') return false;
        return true;
    }

    function tryClick() {
        var btn = findBtn();
        if (!btn) return false;

        var inactive = btn.getAttribute('data-inactive');
        var text = btn.textContent || '';
        var amount = parseCoinAmount(text);

        // Click if it's clearly the action to do check-in now
        if (isActuallyClickable(btn)) {
            if (text.indexOf('完成簽到') !== -1 || text.indexOf('每日簽到') !== -1 || text.indexOf('簽到領') !== -1 || text.indexOf('領蝦幣') !== -1) {
                btn.click();
                localStorage.setItem(CHECKIN_KEY, TODAY);
                if (amount !== null) localStorage.setItem(CHECKIN_AMT_KEY, String(amount));
                sessionStorage.setItem(SESSION_DONE, '1');
                console.log('[CheckIn] CLICKED amount=' + amount);
                if (isAutoClose) setTimeout(function() { window.close(); }, 1200);
                return true;
            }
        }

        // Only treat as "already done" if clearly unavailable and says so
        if (!isActuallyClickable(btn) || inactive === 'true') {
            if (text.indexOf('明天再回來') !== -1 || text.indexOf('已簽到') !== -1 || text.indexOf('簽到成功') !== -1) {
                localStorage.setItem(CHECKIN_KEY, TODAY);
                if (amount !== null) localStorage.setItem(CHECKIN_AMT_KEY, String(amount));
                sessionStorage.setItem(SESSION_DONE, '1');
                console.log('[CheckIn] already done');
                if (isAutoClose) setTimeout(function() { window.close(); }, 500);
                return true;
            }
        }

        return false;
    }

    if (isCoinsPage) {
        console.log('[CheckIn] coins page, polling for button...');
        if (!isAutoClose) watchForNativeButton();
        var pollCount = 0;
        var didAction = false;
        var timer = setInterval(function() {
            if (tryClick()) {
                didAction = true;
                clearInterval(timer);
                return;
            }
            pollCount++;
            if (pollCount >= 120) {
                clearInterval(timer);
                if (isAutoClose) {
                    if (didAction) {
                        setTimeout(function() { window.close(); }, 800);
                    } else {
                        updateStatus('未找到可點擊的簽到按鈕，請手動檢查', 'rgba(198, 40, 40, 0.9)');
                        console.warn('[CheckIn] TIMEOUT without action - NOT closing, NOT marking done');
                    }
                    return;
                }
                updateStatus('簽到超時', 'rgba(198, 40, 40, 0.9)');
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
