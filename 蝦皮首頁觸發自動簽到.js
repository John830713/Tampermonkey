// ==UserScript==
// @name         蝦皮首頁觸發自動簽到
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  進入蝦皮首頁時自動簽到，直接呼叫 API，無需載入簽到頁面
// @author       Gemini
// @match        https://shopee.tw/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const CHECKIN_API = 'https://shopee.tw/mkt/coins/api/v2/checkin_new';
    const TODAY = new Date().toDateString();

    const lastCheck = GM_getValue('lastCheckInDate', '');
    if (lastCheck === TODAY) return;

    console.log('偵測到進入蝦皮，準備自動簽到...');

    GM_xmlhttpRequest({
        method: 'POST',
        url: CHECKIN_API,
        headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json'
        },
        responseType: 'json',
        onload: function(res) {
            const data = res.response;
            if (data && (data.code === 0 || data.data?.success)) {
                console.log('簽到成功！', data.data?.increase_coins ? `獲得 ${data.data.increase_coins} 蝦幣` : '');
                GM_setValue('lastCheckInDate', TODAY);
            } else if (data && data.code === 1) {
                console.log('今日已簽到過。');
                GM_setValue('lastCheckInDate', TODAY);
            } else {
                console.warn('簽到失敗，稍後重試：', data);
            }
        },
        onerror: function() {
            console.error('簽到 API 請求失敗');
        }
    });
})();