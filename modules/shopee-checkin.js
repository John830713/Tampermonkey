// ==UserScript==
// @name         Shopee Auto Check-in
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  Check-in Shopee coins via API, button-triggered, no auto-fire
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
    var API_URL = 'https://games-dailycheckin.shopee.tw/mkt/coins/api/v2/checkin_new';

    // ─── Version check — clear stale cache from v6 auto-checkin ─
    var VERSION_KEY = 'sp_checkin_version';
    var SCRIPT_VER = '7.1';
    if (localStorage.getItem(VERSION_KEY) !== SCRIPT_VER) {
        localStorage.removeItem(CHECKIN_KEY);
        localStorage.removeItem(CHECKIN_AMT_KEY);
        sessionStorage.removeItem(SESSION_DONE);
        localStorage.setItem(VERSION_KEY, SCRIPT_VER);
    }

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
                pointer-events: auto;\
                cursor: pointer;\
            }\
            .sp-checkin-btn.error {\
                background: rgba(198, 40, 40, 0.9);\
                pointer-events: auto;\
            }';
        document.head.appendChild(style);

        statusBtn = document.createElement('button');
        statusBtn.className = 'sp-checkin-btn';
        statusBtn.textContent = '簽到中...';
        document.body.appendChild(statusBtn);
    }

    function updateBtn(text, cls) {
        if (!statusBtn) createStatusBtn();
        statusBtn.textContent = text;
        statusBtn.className = 'sp-checkin-btn' + (cls ? ' ' + cls : '');
    }

    // ─── Reward text from native button ───────────────────────
    var nativeBtn = document.querySelector('button.iT0yAz');
    var rewardText = '';
    if (nativeBtn) {
        var match = nativeBtn.textContent.match(/(\d+[\.,]?\d*)\s*蝦幣/);
        if (match) rewardText = ' (+' + match[1] + ' 蝦幣)';
    }

    // ─── Early exits (from cache) ─────────────────────────────
    if (sessionStorage.getItem(SESSION_DONE)) {
        var lastAmt = localStorage.getItem(CHECKIN_AMT_KEY);
        createStatusBtn();
        updateBtn('已簽到' + (lastAmt ? ' +' + lastAmt + ' 蝦幣' : ''), 'done');
        return;
    }

    var stored = localStorage.getItem(CHECKIN_KEY);
    if (stored === TODAY) {
        sessionStorage.setItem(SESSION_DONE, '1');
        var amt = localStorage.getItem(CHECKIN_AMT_KEY);
        createStatusBtn();
        updateBtn('已簽到' + (amt ? ' +' + amt + ' 蝦幣' : ''), 'done');
        return;
    }

    // ─── API check-in ─────────────────────────────────────────
    function parseCoinAmount(data) {
        if (!data) return null;
        if (data.coin_amount != null) return parseFloat(data.coin_amount);
        if (data.amount != null) return parseFloat(data.amount);
        if (data.data && data.data.coin_amount != null) return parseFloat(data.data.coin_amount);
        if (data.data && data.data.amount != null) return parseFloat(data.data.amount);
        return null;
    }

    function doCheckIn() {
        if (!statusBtn || statusBtn.classList.contains('done') || statusBtn.classList.contains('error')) return;
        updateBtn('簽到中...', '');

        fetch(API_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(function(resp) {
            return resp.json();
        })
        .then(function(data) {
            console.log('[CheckIn] API response:', JSON.stringify(data));

            if (data.code === 0) {
                var amount = parseCoinAmount(data);
                localStorage.setItem(CHECKIN_KEY, TODAY);
                if (amount !== null) localStorage.setItem(CHECKIN_AMT_KEY, String(amount));
                sessionStorage.setItem(SESSION_DONE, '1');
                updateBtn('已簽到 +' + (amount || '?') + ' 蝦幣', 'done');
            } else if (data.code === 2) {
                updateBtn('今天已簽過' + rewardText, 'done');
            } else {
                console.warn('[CheckIn] unexpected:', data);
                updateBtn('簽到失敗: ' + (data.msg || 'unknown'), 'error');
            }
        })
        .catch(function(err) {
            console.error('[CheckIn] fetch error:', err);
            updateBtn('簽到失敗: ' + err.message, 'error');
        });
    }

    // ─── Run ──────────────────────────────────────────────────
    createStatusBtn();
    updateBtn('點擊簽到' + rewardText, 'active');
    statusBtn.addEventListener('click', function() {
        doCheckIn();
    });
})();
