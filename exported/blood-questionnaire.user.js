// ==UserScript==
// @name         blood-questionnaire
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-exported from modules/血液基金會問卷自動勾選 (修正版).js
// @author       You
// @match        https://dh.blood.org.tw/donor/questionnaire.htm*

// ==/UserScript==


// ==UserScript==
// @name         血液基金會問卷自動勾選 (修正版)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  自動勾選健康問卷選項：第一題「是」，其餘「否」，並包含個資同意選項。
// @author       Gemini
// @match        https://dh.blood.org.tw/donor/questionnaire.htm*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 建立按鈕
    const btn = document.createElement('button');
    btn.innerHTML = '⚡ 自動填寫問卷';
    btn.style.position = 'fixed';
    btn.style.top = '100px';
    btn.style.left = '20px';
    btn.style.zIndex = '9999';
    btn.style.padding = '10px 20px';
    btn.style.backgroundColor = '#d32f2f';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '5px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';

    document.body.appendChild(btn);

    // 點擊邏輯
    btn.onclick = function() {
        // 1. 處理主體問卷 (表格內的題目)
        const rows = document.querySelectorAll('tr');
        rows.forEach((row) => {
            const radios = row.querySelectorAll('input[type="radio"]');
            if (radios.length >= 2) {
                // 如果是第一題選「是」，其餘選「否」
                if (row.innerText.includes("1.自覺身體狀況良好")) {
                    radios[0].checked = true;
                } else {
                    // 這裡排除掉有特殊 name 的 radio，避免影響後續邏輯
                    const name = radios[1].getAttribute('name');
                    if (name !== 'dnMdise' && name !== 'dnCite' && name !== 'isReuse') {
                        radios[1].checked = true;
                    }
                }
            }
        });

        // 2. 精準勾選底部的同意事項 (針對你提供的 label 區塊)

        // 捐血邀約宣導 (dnMdise) -> 同意
        const promoRadio = document.querySelector('input[name="dnMdise"][value="Y"]');
        if (promoRadio) promoRadio.checked = true;

        // 捐血表揚 (dnCite) -> 同意
        const citeRadio = document.querySelector('input[name="dnCite"][value="Y"]');
        if (citeRadio) citeRadio.checked = true;

        // 資源再利用 (isReuse) -> 同意
        const reuseRadio = document.querySelector('input[name="isReuse"][value="Y"]');
        if (reuseRadio) reuseRadio.checked = true;

        alert('已完成自動勾選！\n包含：第一題「是」、其餘「否」、以及底部的「同意」選項。\n\n請務必檢查後再手動送出。');
    };
})();