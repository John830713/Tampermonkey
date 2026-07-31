// ==UserScript==
// @name         自動填寫加班單（首列精準配對版）
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  自動依首列刷卡時間填寫加班時間，並依欄位組合加班備註（含歷史紀錄）
// @author       You
// @match        https://hr.wistron.com/psc/PRD/EMPLOYEE/HRMS/c/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL*Z_ESS_OT_APP*
// @match        https://hr.wistron.com/psc/PRD/EMPLOYEE/HRMS/c/Z_AM_MNU.Z_AM_F008.GBL*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ============ 儲存（GM storage，跨頁面保留） ============
    var KEY_PROJECTS = 'wo_projects';
    var KEY_SAMPLES = 'wo_samples';
    var KEY_HISTORY = 'wo_history';
    var HISTORY_LIMIT = 50;

    var DEFAULT_PROJECTS = ['Blade 16 GPT CS', 'BladePTL', 'BladeGPT'];
    var DEFAULT_SAMPLES = ['Test'];

    function getList(key, def) {
        try {
            var v = GM_getValue(key, null);
            if (Array.isArray(v)) return v;
        } catch (e) {}
        return def.slice();
    }

    function setList(key, arr) {
        try { GM_setValue(key, arr); } catch (e) {}
    }

    function getProjects() { return getList(KEY_PROJECTS, DEFAULT_PROJECTS); }
    function saveProjects(arr) { setList(KEY_PROJECTS, arr); }
    function getSamples() { return getList(KEY_SAMPLES, DEFAULT_SAMPLES); }
    function saveSamples(arr) { setList(KEY_SAMPLES, arr); }

    function getHistory() {
        try {
            var h = GM_getValue(KEY_HISTORY, null);
            if (Array.isArray(h)) return h.slice(-HISTORY_LIMIT);
        } catch (e) {}
        return [];
    }

    function pushHistory(text) {
        var h = getHistory();
        h.push({ text: text, ts: Date.now() });
        setList(KEY_HISTORY, h.slice(-HISTORY_LIMIT));
    }

    function historyCount(text) {
        var n = 0;
        getHistory().forEach(function(x) { if (x.text === text) n++; });
        return n;
    }

    // ============ UI 輔助 ============
    function makeRow(labelText, control) {
        var r = document.createElement('div');
        r.style.marginBottom = '6px';
        var lab = document.createElement('span');
        lab.textContent = labelText;
        lab.style.display = 'inline-block';
        lab.style.width = '70px';
        lab.style.fontSize = '12px';
        lab.style.verticalAlign = 'middle';
        r.appendChild(lab);
        r.appendChild(control);
        return r;
    }

    function makeSmallBtn(text) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.fontSize = '11px';
        b.style.padding = '1px 6px';
        b.style.marginLeft = '3px';
        b.style.cursor = 'pointer';
        return b;
    }

    // ============ 浮動按鈕 ============
    var btn = document.createElement('button');
    btn.textContent = '自動填寫';
    btn.style.position = 'fixed';
    btn.style.top = '30%';
    btn.style.right = '30%';
    btn.style.zIndex = '99999';
    btn.style.padding = '10px 15px';
    btn.style.backgroundColor = '#ff4d4d';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '5px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    btn.style.boxShadow = '0px 2px 5px rgba(0,0,0,0.3)';
    document.body.appendChild(btn);

    // ============ 面板 ============
    var panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.position = 'fixed';
    panel.style.top = '30%';
    panel.style.right = '30%';
    panel.style.marginTop = '44px';
    panel.style.zIndex = '99999';
    panel.style.background = '#fff';
    panel.style.border = '1px solid #ccc';
    panel.style.borderRadius = '6px';
    panel.style.padding = '10px';
    panel.style.width = '380px';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    panel.style.fontFamily = 'sans-serif';
    document.body.appendChild(panel);

    var title = document.createElement('div');
    title.textContent = '加班單自動填寫';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    // --- 專案（可增刪清單，預設第一筆） ---
    var projectSelect = document.createElement('select');
    projectSelect.style.width = '120px';
    projectSelect.style.fontSize = '12px';
    var projectAddInput = document.createElement('input');
    projectAddInput.type = 'text';
    projectAddInput.placeholder = '新增專案';
    projectAddInput.style.width = '90px';
    projectAddInput.style.fontSize = '11px';
    var addProjectBtn = makeSmallBtn('＋');
    var delProjectBtn = makeSmallBtn('－');
    var projectRow = makeRow('專案', projectSelect);
    projectRow.appendChild(projectAddInput);
    projectRow.appendChild(addProjectBtn);
    projectRow.appendChild(delProjectBtn);
    panel.appendChild(projectRow);

    // --- 主體描述（自由輸入） ---
    var subjectInput = document.createElement('input');
    subjectInput.type = 'text';
    subjectInput.placeholder = '例：Critical Audio YB issue';
    subjectInput.style.width = '292px';
    subjectInput.style.fontSize = '12px';
    panel.appendChild(makeRow('主體', subjectInput));

    // --- 原因（可自訂，建議值下拉） ---
    var reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.setAttribute('list', 'wo-reason-options');
    reasonInput.style.width = '292px';
    reasonInput.style.fontSize = '12px';
    var reasonDatalist = document.createElement('datalist');
    reasonDatalist.id = 'wo-reason-options';
    ['issue debug', 'meeting', 'review'].forEach(function(v) {
        var o = document.createElement('option');
        o.value = v;
        reasonDatalist.appendChild(o);
    });
    document.body.appendChild(reasonDatalist);
    panel.appendChild(makeRow('原因', reasonInput));

    // --- 是由（可自訂，建議值下拉） ---
    var byInput = document.createElement('input');
    byInput.type = 'text';
    byInput.setAttribute('list', 'wo-by-options');
    byInput.style.width = '292px';
    byInput.style.fontSize = '12px';
    var byDatalist = document.createElement('datalist');
    byDatalist.id = 'wo-by-options';
    ['meet schedule'].forEach(function(v) {
        var o = document.createElement('option');
        o.value = v;
        byDatalist.appendChild(o);
    });
    document.body.appendChild(byDatalist);
    panel.appendChild(makeRow('是由', byInput));

    // --- 要求單位（可自訂，建議值下拉） ---
    var unitInput = document.createElement('input');
    unitInput.type = 'text';
    unitInput.setAttribute('list', 'wo-unit-options');
    unitInput.style.width = '292px';
    unitInput.style.fontSize = '12px';
    var unitDatalist = document.createElement('datalist');
    unitDatalist.id = 'wo-unit-options';
    ['PM', 'Customer'].forEach(function(v) {
        var o = document.createElement('option');
        o.value = v;
        unitDatalist.appendChild(o);
    });
    document.body.appendChild(unitDatalist);
    panel.appendChild(makeRow('要求單位', unitInput));

    // --- 特定樣本（可增刪清單，預設第一筆） ---
    var sampleSelect = document.createElement('select');
    sampleSelect.style.width = '120px';
    sampleSelect.style.fontSize = '12px';
    var sampleAddInput = document.createElement('input');
    sampleAddInput.type = 'text';
    sampleAddInput.placeholder = '新增樣本';
    sampleAddInput.style.width = '90px';
    sampleAddInput.style.fontSize = '11px';
    var addSampleBtn = makeSmallBtn('＋');
    var delSampleBtn = makeSmallBtn('－');
    var sampleRow = makeRow('樣本', sampleSelect);
    sampleRow.appendChild(sampleAddInput);
    sampleRow.appendChild(addSampleBtn);
    sampleRow.appendChild(delSampleBtn);
    panel.appendChild(sampleRow);

    // --- 預覽 ---
    var previewLabel = document.createElement('div');
    previewLabel.textContent = '預覽';
    previewLabel.style.fontSize = '12px';
    previewLabel.style.marginTop = '6px';
    panel.appendChild(previewLabel);
    var previewBox = document.createElement('div');
    previewBox.style.whiteSpace = 'pre-wrap';
    previewBox.style.fontSize = '12px';
    previewBox.style.border = '1px solid #ddd';
    previewBox.style.borderRadius = '4px';
    previewBox.style.padding = '6px';
    previewBox.style.minHeight = '36px';
    previewBox.style.backgroundColor = '#fafafa';
    panel.appendChild(previewBox);

    // --- 填寫按鈕 + 狀態 ---
    var fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.textContent = '填寫';
    fillBtn.style.marginTop = '8px';
    fillBtn.style.padding = '5px 18px';
    fillBtn.style.fontSize = '13px';
    fillBtn.style.fontWeight = 'bold';
    fillBtn.style.cursor = 'pointer';
    panel.appendChild(fillBtn);

    var statusEl = document.createElement('div');
    statusEl.style.marginTop = '6px';
    statusEl.style.fontSize = '12px';
    statusEl.style.color = '#c00';
    panel.appendChild(statusEl);

    // --- 歷史（近 50 筆） ---
    var historyTitle = document.createElement('div');
    historyTitle.textContent = '歷史（近 50 筆，點擊直接填入）';
    historyTitle.style.fontSize = '12px';
    historyTitle.style.fontWeight = 'bold';
    historyTitle.style.marginTop = '10px';
    panel.appendChild(historyTitle);

    var historyBox = document.createElement('div');
    historyBox.style.maxHeight = '220px';
    historyBox.style.overflowY = 'auto';
    panel.appendChild(historyBox);

    // ============ 邏輯 ============
    function buildComment() {
        var project = projectSelect.value.trim();
        var subject = subjectInput.value.trim();
        var reason = reasonInput.value.trim();
        var reqBy = byInput.value.trim();
        var unit = unitInput.value.trim();

        var line1 = (project ? '[' + project + ']' : '[]') +
            (subject ? ' ' + subject : '') +
            (reason ? ' ' + reason : '') +
            (reqBy ? ' ' + reqBy : '') +
            (unit ? ' by ' + unit : '');
        var sample = sampleSelect.value.trim();
        return sample ? line1 + '\n' + sample : line1;
    }

    function updatePreview() {
        previewBox.textContent = buildComment();
    }

    function setStatus(msg) {
        statusEl.textContent = msg;
    }

    function populateProjectSelect() {
        var prev = projectSelect.value;
        projectSelect.textContent = '';
        getProjects().forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            projectSelect.appendChild(opt);
        });
        if (prev) projectSelect.value = prev;
        if (!projectSelect.value && projectSelect.options.length) {
            projectSelect.selectedIndex = 0;
        }
    }

    function populateSampleSelect() {
        var prev = sampleSelect.value;
        sampleSelect.textContent = '';
        getSamples().forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sampleSelect.appendChild(opt);
        });
        if (prev) sampleSelect.value = prev;
        if (!sampleSelect.value && sampleSelect.options.length) {
            sampleSelect.selectedIndex = 0;
        }
    }

    function addToList(input, getter, saver, populate, listKey) {
        var text = input.value.trim();
        if (!text) { setStatus('請先輸入文字再新增'); return; }
        var arr = getter();
        if (arr.indexOf(text) === -1) {
            arr.push(text);
            saver(arr);
        }
        input.value = '';
        populate();
        if (listKey === KEY_PROJECTS) projectSelect.value = text;
        if (listKey === KEY_SAMPLES) sampleSelect.value = text;
        updatePreview();
        setStatus('');
    }

    function delFromList(getter, saver, populate, selectEl) {
        var text = selectEl.value;
        var arr = getter();
        var idx = arr.indexOf(text);
        if (idx === -1) return;
        arr.splice(idx, 1);
        if (!arr.length) {
            setStatus('至少保留一筆');
            arr = [text];
        }
        saver(arr);
        populate();
        updatePreview();
        setStatus('');
    }

    function renderHistory() {
        historyBox.textContent = '';
        var items = getHistory();
        if (!items.length) {
            var empty = document.createElement('div');
            empty.textContent = '（尚無記錄）';
            empty.style.fontSize = '12px';
            empty.style.color = '#999';
            historyBox.appendChild(empty);
            return;
        }
        for (var i = items.length - 1; i >= 0; i--) {
            (function(item) {
                var wrap = document.createElement('button');
                wrap.type = 'button';
                wrap.style.display = 'block';
                wrap.style.width = '100%';
                wrap.style.textAlign = 'left';
                wrap.style.marginBottom = '4px';
                wrap.style.whiteSpace = 'pre-wrap';
                wrap.style.fontSize = '11px';
                wrap.style.cursor = 'pointer';
                wrap.style.border = '1px solid #eee';
                wrap.style.borderRadius = '4px';
                wrap.style.background = '#fff';
                wrap.style.padding = '4px 6px';

                wrap.appendChild(document.createTextNode(item.text));
                var cnt = document.createElement('span');
                var n = historyCount(item.text);
                cnt.textContent = '（近50筆 已用 ' + n + ' 次）';
                cnt.style.color = n > 1 ? '#c00' : '#888';
                wrap.appendChild(cnt);
                wrap.addEventListener('click', function() {
                    fillCommentOnly(item.text);
                });
                historyBox.appendChild(wrap);
            })(items[i]);
        }
    }

    function fillCommentOnly(text) {
        var textareaComment = document.getElementById('DERIVED_ABS_SS_COMMENTS');
        if (!textareaComment) { setStatus('找不到備註欄'); return; }
        textareaComment.value = text;
        textareaComment.dispatchEvent(new Event('change', { bubbles: true }));
        pushHistory(text);
        renderHistory();
        setStatus('已填入歷史備註，可自行微調');
    }

    function doFill() {
        var changeEvent = new Event('change', { bubbles: true });

        var selectBal = document.getElementById('Z_GP_OT_SS_DAT_Z_OVERTIME_BAL');
        var selectType = document.getElementById('Z_OVERTIME_TYPE');
        var selectMeal = document.getElementById('Z_GP_OT_SS_DAT_Z_MEAL_HOUR_PG');

        // 步驟 1-3：下拉選單，一次一步（PeopleSoft 選完會 re-render，需再按一次）
        if (selectBal && selectBal.value !== 'PAY') {
            selectBal.value = 'PAY';
            selectBal.dispatchEvent(changeEvent);
            setStatus('步驟1/4 加班類別已選 PAY，等頁面更新後再按「填寫」');
            return;
        }
        if (selectType && selectType.value !== '10') {
            selectType.value = '10';
            selectType.dispatchEvent(changeEvent);
            setStatus('步驟2/4 加班類型已選 10，等頁面更新後再按「填寫」');
            return;
        }
        if (selectMeal && selectMeal.value !== '0.0') {
            selectMeal.value = '0.0';
            selectMeal.dispatchEvent(changeEvent);
            setStatus('步驟3/4 餐費已選 0.0，等頁面更新後再按「填寫」');
            return;
        }

        // 步驟 4：填時間 + 備註
        var inputStartTime = document.getElementById('Z_START_TIME');
        var inputEndDate = document.getElementById('ZENDDT');
        var inputEndTime = document.getElementById('Z_END_TIME');
        var textareaComment = document.getElementById('DERIVED_ABS_SS_COMMENTS');

        if (inputStartTime || inputEndDate || inputEndTime || textareaComment) {
            var dateElem = document.getElementById('Z_TL_CLK_STD_VW_PUNCH_DATE$0');
            var beginElem = document.getElementById('Z_TL_CLK_STD_VW_PUNCH_BEGIN$0');
            var endElem = document.getElementById('Z_TL_CLK_STD_VW_PUNCH_END$0');

            if (!dateElem || !beginElem || !endElem) {
                alert('找不到當日出勤記錄的第一列資料，請確認網頁是否載入完全！');
                return;
            }

            var punchBeginStr = beginElem.textContent.trim();
            var punchEndStr = endElem.textContent.trim();
            var logDate = dateElem.textContent.trim();

            if (punchBeginStr && punchBeginStr.indexOf(':') !== -1 && punchEndStr && punchEndStr.indexOf(':') !== -1) {
                console.log('--- [Tampermonkey] 成功讀取首列日期：' + logDate + ' 進行時間計算 ---');

                // 開始時間 = 上班刷卡 + 9 小時
                var timeParts = punchBeginStr.split(' ')[1].split(':');
                var hours = parseInt(timeParts[0], 10) + 9;
                var minutes = parseInt(timeParts[1], 10);
                if (hours >= 24) hours -= 24;
                var targetStartTime = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

                if (inputStartTime && inputStartTime.value !== targetStartTime) {
                    inputStartTime.value = targetStartTime;
                    inputStartTime.dispatchEvent(changeEvent);
                }

                // 結束日期 / 時間 = 下班刷卡
                var endParts = punchEndStr.split(' ');
                var endDateStr = endParts[0];
                var endTimeStr = endParts[1];
                var endTimeParts = endTimeStr.split(':');
                var targetEndTime = endTimeParts[0] + ':' + endTimeParts[1];

                if (inputEndDate && inputEndDate.value !== endDateStr) {
                    inputEndDate.value = endDateStr;
                    inputEndDate.dispatchEvent(changeEvent);
                    if (typeof oChange_win0 !== 'undefined') { oChange_win0 = inputEndDate; }
                }
                if (inputEndTime && inputEndTime.value !== targetEndTime) {
                    inputEndTime.value = targetEndTime;
                    inputEndTime.dispatchEvent(changeEvent);
                    if (typeof oChange_win0 !== 'undefined') { oChange_win0 = inputEndTime; }
                }

                console.log('--- [Tampermonkey] 已自動填入：開始 ' + targetStartTime + ' / 結束日期 ' + endDateStr + ' / 結束時間 ' + targetEndTime + ' ---');

                // 備註：欄位組合 + 存入歷史
                var comment = buildComment();
                if (textareaComment) {
                    textareaComment.value = comment;
                    textareaComment.dispatchEvent(changeEvent);
                }
                pushHistory(comment);
                renderHistory();
                setStatus('已填寫完成，備註可自行微調');
            } else {
                setStatus('首列 (' + logDate + ') 打卡時間為空，請確認是否已刷卡');
            }
        } else {
            setStatus('找不到表單欄位，請確認頁面已載入');
        }
    }

    // ============ 事件綁定 ============
    btn.addEventListener('click', function() {
        var isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            populateProjectSelect();
            populateSampleSelect();
            updatePreview();
            renderHistory();
            setStatus('');
        }
    });

    fillBtn.addEventListener('click', doFill);

    [projectSelect, subjectInput, reasonInput, byInput, unitInput, sampleSelect].forEach(function(el) {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
    });

    addProjectBtn.addEventListener('click', function() {
        addToList(projectAddInput, getProjects, saveProjects, populateProjectSelect, KEY_PROJECTS);
    });
    projectAddInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addProjectBtn.click();
    });

    delProjectBtn.addEventListener('click', function() {
        delFromList(getProjects, saveProjects, populateProjectSelect, projectSelect);
    });

    addSampleBtn.addEventListener('click', function() {
        addToList(sampleAddInput, getSamples, saveSamples, populateSampleSelect, KEY_SAMPLES);
    });
    sampleAddInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addSampleBtn.click();
    });

    delSampleBtn.addEventListener('click', function() {
        delFromList(getSamples, saveSamples, populateSampleSelect, sampleSelect);
    });
})();
