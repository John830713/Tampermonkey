// ==UserScript==
// @name         自動填寫加班單（首列精準配對版）
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  自動依首列刷卡時間填寫加班時間，並依欄位組合加班備註（含歷史紀錄）
// @author       You
// @match        https://hr.wistron.com/psc/PRD/EMPLOYEE/HRMS/c/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL*Z_ESS_OT_APP*
// @match        https://hr.wistron.com/psc/PRD/EMPLOYEE/HRMS/c/Z_AM_MNU.Z_AM_F008.GBL*
// @match        https://example.com/*
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
    var KEY_CONFIG = 'wo_config';
    var HISTORY_LIMIT = 50;

    var DEFAULT_PROJECTS = ['Blade 16 GPT CS', 'BladePTL', 'BladeGPT'];
    var DEFAULT_SAMPLES = ['Test'];
    var DEFAULT_CONFIG = { project: '', subject: '', reason: '', by: '', unit: '', sample: '' };

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

    function getConfig() {
        var cfg = DEFAULT_CONFIG;
        try {
            var v = GM_getValue(KEY_CONFIG, null);
            if (v && typeof v === 'object') cfg = v;
        } catch (e) {}
        return {
            project: cfg.project || '',
            subject: cfg.subject || '',
            reason: cfg.reason || '',
            by: cfg.by || '',
            unit: cfg.unit || '',
            sample: cfg.sample || ''
        };
    }

    function saveConfig() {
        try {
            GM_setValue(KEY_CONFIG, {
                project: projectSelect.value || '',
                subject: subjectInput.value,
                reason: reasonInput.value,
                by: byInput.value,
                unit: unitInput.value,
                sample: sampleSelect.value || ''
            });
        } catch (e) {}
    }

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

    // ============ 浮動按鈕列（自動填寫 + 設定加班事由） ============
    var wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.top = '30%';
    wrap.style.right = '30%';
    wrap.style.zIndex = '99999';
    wrap.style.fontFamily = 'sans-serif';

    var fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.textContent = '自動填寫';
    fillBtn.style.padding = '10px 15px';
    fillBtn.style.marginRight = '6px';
    fillBtn.style.backgroundColor = '#ff4d4d';
    fillBtn.style.color = 'white';
    fillBtn.style.border = 'none';
    fillBtn.style.borderRadius = '5px';
    fillBtn.style.cursor = 'pointer';
    fillBtn.style.fontWeight = 'bold';
    fillBtn.style.boxShadow = '0px 2px 5px rgba(0,0,0,0.3)';
    wrap.appendChild(fillBtn);

    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.textContent = '設定加班事由';
    settingsBtn.style.padding = '10px 15px';
    settingsBtn.style.backgroundColor = '#4d79ff';
    settingsBtn.style.color = 'white';
    settingsBtn.style.border = 'none';
    settingsBtn.style.borderRadius = '5px';
    settingsBtn.style.cursor = 'pointer';
    settingsBtn.style.fontWeight = 'bold';
    settingsBtn.style.boxShadow = '0px 2px 5px rgba(0,0,0,0.3)';
    wrap.appendChild(settingsBtn);

    var statusEl = document.createElement('div');
    statusEl.style.marginTop = '6px';
    statusEl.style.fontSize = '12px';
    statusEl.style.color = '#c00';
    statusEl.style.backgroundColor = 'rgba(255,255,255,0.9)';
    statusEl.style.padding = '3px 6px';
    statusEl.style.borderRadius = '4px';
    wrap.appendChild(statusEl);

    document.body.appendChild(wrap);

    function setStatus(msg) {
        statusEl.textContent = msg;
        clearTimeout(setStatus._t);
        setStatus._t = setTimeout(function() { statusEl.textContent = ''; }, 6000);
    }

    // ============ 設定面板 ============
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
    title.textContent = '設定加班事由';
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

    // ============ 測試文字框（非 HR 頁面用，例：example.com） ============
    function ensureTestTextarea() {
        if (location.hostname === 'hr.wistron.com') return null;
        var existing = document.getElementById('wo-test-output');
        if (existing) return existing;

        var box = document.createElement('div');
        box.id = 'wo-test-wrap';
        box.style.position = 'fixed';
        box.style.top = '30%';
        box.style.left = '10%';
        box.style.zIndex = '99999';
        box.style.background = '#fff';
        box.style.border = '1px solid #ccc';
        box.style.borderRadius = '6px';
        box.style.padding = '8px';
        box.style.width = '380px';
        box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        box.style.fontFamily = 'sans-serif';

        var lab = document.createElement('div');
        lab.textContent = '測試文字框（非 HR 表單頁面，自動填寫會寫入這裡）';
        lab.style.fontSize = '12px';
        lab.style.fontWeight = 'bold';
        lab.style.marginBottom = '4px';
        box.appendChild(lab);

        var ta = document.createElement('textarea');
        ta.id = 'wo-test-output';
        ta.rows = 4;
        ta.style.width = '100%';
        ta.style.fontSize = '12px';
        box.appendChild(ta);

        document.body.appendChild(box);
        return ta;
    }

    var testTextarea = ensureTestTextarea();

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

    function populateProjectSelect(preferred) {
        projectSelect.textContent = '';
        getProjects().forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            projectSelect.appendChild(opt);
        });
        if (preferred) projectSelect.value = preferred;
        if (!projectSelect.value && projectSelect.options.length) {
            projectSelect.selectedIndex = 0;
        }
    }

    function populateSampleSelect(preferred) {
        sampleSelect.textContent = '';
        getSamples().forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sampleSelect.appendChild(opt);
        });
        if (preferred) sampleSelect.value = preferred;
        if (!sampleSelect.value && sampleSelect.options.length) {
            sampleSelect.selectedIndex = 0;
        }
    }

    function applyConfig() {
        var cfg = getConfig();
        populateProjectSelect(cfg.project);
        populateSampleSelect(cfg.sample);
        subjectInput.value = cfg.subject;
        reasonInput.value = cfg.reason;
        byInput.value = cfg.by;
        unitInput.value = cfg.unit;
        updatePreview();
    }

    function addToList(input, getter, saver, populate) {
        var text = input.value.trim();
        if (!text) { setStatus('請先輸入文字再新增'); return; }
        var arr = getter();
        if (arr.indexOf(text) === -1) {
            arr.push(text);
            saver(arr);
        }
        input.value = '';
        populate(text);
        updatePreview();
        saveConfig();
        setStatus('已新增：' + text);
    }

    function delFromList(getter, saver, populate) {
        var text = populate === populateProjectSelect ? projectSelect.value : sampleSelect.value;
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
        saveConfig();
        updatePreview();
        setStatus('已刪除：' + text);
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
                var wrapBtn = document.createElement('button');
                wrapBtn.type = 'button';
                wrapBtn.style.display = 'block';
                wrapBtn.style.width = '100%';
                wrapBtn.style.textAlign = 'left';
                wrapBtn.style.marginBottom = '4px';
                wrapBtn.style.whiteSpace = 'pre-wrap';
                wrapBtn.style.fontSize = '11px';
                wrapBtn.style.cursor = 'pointer';
                wrapBtn.style.border = '1px solid #eee';
                wrapBtn.style.borderRadius = '4px';
                wrapBtn.style.background = '#fff';
                wrapBtn.style.padding = '4px 6px';

                wrapBtn.appendChild(document.createTextNode(item.text));
                var cnt = document.createElement('span');
                var n = historyCount(item.text);
                cnt.textContent = '（近50筆 已用 ' + n + ' 次）';
                cnt.style.color = n > 1 ? '#c00' : '#888';
                wrapBtn.appendChild(cnt);
                wrapBtn.addEventListener('click', function() {
                    fillCommentOnly(item.text);
                });
                historyBox.appendChild(wrapBtn);
            })(items[i]);
        }
    }

    function getCommentTarget() {
        var hr = document.getElementById('DERIVED_ABS_SS_COMMENTS');
        if (hr) return hr;
        return testTextarea;
    }

    function fillCommentOnly(text) {
        var target = getCommentTarget();
        if (!target) { setStatus('找不到可寫入的備註欄'); return; }
        target.value = text;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        pushHistory(text);
        renderHistory();
        setStatus('已填入歷史備註，可自行微調');
    }

    function doFill() {
        // 非 HR 表單頁面（例：example.org）→ 直接寫入測試文字框
        var hrTextarea = document.getElementById('DERIVED_ABS_SS_COMMENTS');
        if (!hrTextarea) {
            if (!testTextarea) testTextarea = ensureTestTextarea();
            if (!testTextarea) { setStatus('找不到可寫入的文字框'); return; }
            var testComment = buildComment();
            testTextarea.value = testComment;
            testTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            pushHistory(testComment);
            renderHistory();
            setStatus('已寫入測試文字框');
            return;
        }

        var changeEvent = new Event('change', { bubbles: true });

        var selectBal = document.getElementById('Z_GP_OT_SS_DAT_Z_OVERTIME_BAL');
        var selectType = document.getElementById('Z_OVERTIME_TYPE');
        var selectMeal = document.getElementById('Z_GP_OT_SS_DAT_Z_MEAL_HOUR_PG');

        // 步驟 1-3：下拉選單，一次一步（PeopleSoft 選完會 re-render，需再按一次）
        if (selectBal && selectBal.value !== 'PAY') {
            selectBal.value = 'PAY';
            selectBal.dispatchEvent(changeEvent);
            setStatus('步驟1/4 加班類別已選 PAY，等頁面更新後再按「自動填寫」');
            return;
        }
        if (selectType && selectType.value !== '10') {
            selectType.value = '10';
            selectType.dispatchEvent(changeEvent);
            setStatus('步驟2/4 加班類型已選 10，等頁面更新後再按「自動填寫」');
            return;
        }
        if (selectMeal && selectMeal.value !== '0.0') {
            selectMeal.value = '0.0';
            selectMeal.dispatchEvent(changeEvent);
            setStatus('步驟3/4 餐費已選 0.0，等頁面更新後再按「自動填寫」');
            return;
        }

        // 步驟 4：填時間 + 備註
        var inputStartTime = document.getElementById('Z_START_TIME');
        var inputEndDate = document.getElementById('ZENDDT');
        var inputEndTime = document.getElementById('Z_END_TIME');

        if (inputStartTime || inputEndDate || inputEndTime || hrTextarea) {
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

                var timeParts = punchBeginStr.split(' ')[1].split(':');
                var hours = parseInt(timeParts[0], 10) + 9;
                var minutes = parseInt(timeParts[1], 10);
                if (hours >= 24) hours -= 24;
                var targetStartTime = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

                if (inputStartTime && inputStartTime.value !== targetStartTime) {
                    inputStartTime.value = targetStartTime;
                    inputStartTime.dispatchEvent(changeEvent);
                }

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

                var comment = buildComment();
                if (hrTextarea) {
                    hrTextarea.value = comment;
                    hrTextarea.dispatchEvent(changeEvent);
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
    fillBtn.addEventListener('click', doFill);

    settingsBtn.addEventListener('click', function() {
        var isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            applyConfig();
            renderHistory();
            setStatus('');
        }
    });

    var fieldControls = [projectSelect, subjectInput, reasonInput, byInput, unitInput, sampleSelect];
    fieldControls.forEach(function(el) {
        el.addEventListener('input', function() { updatePreview(); saveConfig(); });
        el.addEventListener('change', function() { updatePreview(); saveConfig(); });
    });

    addProjectBtn.addEventListener('click', function() {
        addToList(projectAddInput, getProjects, saveProjects, populateProjectSelect);
    });
    projectAddInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addProjectBtn.click();
    });

    delProjectBtn.addEventListener('click', function() {
        delFromList(getProjects, saveProjects, populateProjectSelect);
    });

    addSampleBtn.addEventListener('click', function() {
        addToList(sampleAddInput, getSamples, saveSamples, populateSampleSelect);
    });
    sampleAddInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addSampleBtn.click();
    });

    delSampleBtn.addEventListener('click', function() {
        delFromList(getSamples, saveSamples, populateSampleSelect);
    });
})();
