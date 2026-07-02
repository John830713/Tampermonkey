// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Auto check-in Shopee coins via API (no iframe)
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const ENDPOINTS = [
        'https://shopee.tw/mkt/coins/api/v2/checkin',
        'https://shopee.tw/mkt/coins/api/v2/checkin_new',
    ];
    const TODAY = new Date().toDateString();

    if (GM_getValue('lastCheckInDate', '') === TODAY) return;

    console.log('[CheckIn] attempting daily check-in...');

    let attempt = 0;

    function tryCheckin() {
        if (attempt >= ENDPOINTS.length) {
            console.warn('[CheckIn] all endpoints failed');
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: ENDPOINTS[attempt],
            headers: {
                'accept': 'application/json, text/plain, */*',
                'referer': 'https://shopee.tw/shopee-coins',
            },
            responseType: 'json',
            data: '',
            onload: function(res) {
                const d = res.response;
                if (d && (d.code === 0 || d.data?.success)) {
                    console.log('[CheckIn] success', d.data?.increase_coins ? `+${d.data.increase_coins} coins` : '');
                    GM_setValue('lastCheckInDate', TODAY);
                } else if (d && d.code === 1) {
                    console.log('[CheckIn] already checked in today');
                    GM_setValue('lastCheckInDate', TODAY);
                } else {
                    attempt++;
                    tryCheckin();
                }
            },
            onerror: function() {
                attempt++;
                tryCheckin();
            },
        });
    }

    tryCheckin();
})();