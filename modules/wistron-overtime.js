// ==UserScript==
// @name         自動填寫加班單（首列精準配對版）
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  自動依首列刷卡時間填寫加班時間，並依欄位組合加班備註（含歷史紀錄、JSON 匯入匯出）
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
    var KEY_SUBJECTS = 'wo_subjects';
    var KEY_REASONS = 'wo_reasons';
    var KEY_UNITS = 'wo_units';
    var KEY_HISTORY = 'wo_history';
    var KEY_CONFIG = 'wo_config';
    var HISTORY_LIMIT = 50;

    var DEFAULT_PROJECTS = ['BLADE 16 GPT CS / 4PD0YB010001 / Renee Ho / PCL500'];
    var DEFAULT_SUBJECTS = ['Critical Audio YB issue', 'NUDD', 'BIOS release on time'];
    var DEFAULT_REASONS = ['issue debug', 'meeting', 'review'];
    var DEFAULT_UNITS = ['PM', 'Customer'];
    var DEFAULT_CONFIG = { project: '', subject: '', reason: '', unit: '' };

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
    function getSubjects() { return getList(KEY_SUBJECTS, DEFAULT_SUBJECTS); }
    function saveSubjects(arr) { setList(KEY_SUBJECTS, arr); }
    function getReasons() { return getList(KEY_REASONS, DEFAULT_REASONS); }
    function saveReasons(arr) { setList(KEY_REASONS, arr); }
    function getUnits() { return getList(KEY_UNITS, DEFAULT_UNITS); }
    function saveUnits(arr) { setList(KEY_UNITS, arr); }

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
            unit: cfg.unit || ''
        };
    }

    function saveConfig() {
        try {
            GM_setValue(KEY_CONFIG, {
                project: projectDD.getValue() || '',
                subject: subjectDD.getValue() || '',
                reason: reasonDD.getValue() || '',
                unit: unitDD.getValue() || ''
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
        lab.style.verticalAlign = 'top';
        r.appendChild(lab);
        r.appendChild(control);
        return r;
    }

    function makeSmallBtn(text) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.fontSize = '11px';
        b.style.padding = '2px 8px';
        b.style.marginLeft = '4px';
        b.style.cursor = 'pointer';
        return b;
    }

    // ============ 自訂下拉（搜尋/新增 + 選項旁可刪除） ============
    function makeDropdown(placeholder, inputPlaceholder) {
        var root = document.createElement('div');
        root.style.position = 'relative';
        root.style.display = 'inline-block';
        root.style.width = '260px';
        root.style.fontSize = '12px';
        root.style.verticalAlign = 'middle';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = placeholder;
        toggle.style.width = '100%';
        toggle.style.textAlign = 'left';
        toggle.style.padding = '2px 6px';
        toggle.style.fontSize = '11px';
        toggle.style.cursor = 'pointer';
        toggle.style.whiteSpace = 'nowrap';
        toggle.style.overflow = 'hidden';
        toggle.style.textOverflow = 'ellipsis';
        toggle.style.backgroundColor = '#fff';
        toggle.style.border = '1px solid #aaa';
        toggle.style.borderRadius = '3px';
        root.appendChild(toggle);

        var listBox = document.createElement('div');
        listBox.style.display = 'none';
        listBox.style.position = 'absolute';
        listBox.style.top = '100%';
        listBox.style.left = '0';
        listBox.style.zIndex = '999999';
        listBox.style.background = '#fff';
        listBox.style.border = '1px solid #ccc';
        listBox.style.borderRadius = '4px';
        listBox.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        listBox.style.minWidth = '300px';
        root.appendChild(listBox);

        // 搜尋 / 新增列（固定上方，不隨選項捲動）
        var addRow = document.createElement('div');
        addRow.style.display = 'flex';
        addRow.style.alignItems = 'center';
        addRow.style.padding = '4px';
        addRow.style.borderBottom = '1px solid #ddd';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = inputPlaceholder;
        input.style.flex = '1';
        input.style.minWidth = '0';
        input.style.fontSize = '11px';
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '＋';
        addBtn.title = 'Enter 或按此新增';
        addBtn.style.fontSize = '13px';
        addBtn.style.padding = '2px 10px';
        addBtn.style.marginLeft = '4px';
        addBtn.style.cursor = 'pointer';
        addRow.appendChild(input);
        addRow.appendChild(addBtn);
        listBox.appendChild(addRow);

        // 選項區（可捲動，render 時重建）
        var optBox = document.createElement('div');
        optBox.style.maxHeight = '150px';
        optBox.style.overflowY = 'auto';
        listBox.appendChild(optBox);

        var value = '';
        var options = [];
        var onChange = function() {};
        var onDelete = null;

        function setValue(v) {
            value = v;
            toggle.textContent = v || placeholder;
            toggle.title = v || '';
        }

        function render() {
            optBox.textContent = '';
            var raw = input.value.trim();
            var q = raw.toLowerCase();
            var hasQ = q.length > 0;
            var matched = 0;

            if (!options.length) {
                var empty = document.createElement('div');
                empty.textContent = hasQ ? '按 Enter 新增「' + raw + '」' : '（尚無選項，輸入後按 Enter 新增）';
                empty.style.padding = '6px';
                empty.style.fontSize = '11px';
                if (hasQ) {
                    empty.style.cursor = 'pointer';
                    empty.style.color = '#2a6';
                    empty.addEventListener('click', function() { addBtn.click(); });
                } else {
                    empty.style.color = '#999';
                }
                optBox.appendChild(empty);
                return;
            }

            options.forEach(function(name) {
                if (hasQ && name.toLowerCase().indexOf(q) === -1) return;
                matched++;
                var row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.padding = '3px 6px';
                row.style.cursor = 'pointer';
                row.style.borderBottom = '1px solid #eee';
                if (name === value) row.style.background = '#e8f0fe';

                var text = document.createElement('span');
                text.textContent = name;
                text.style.flex = '1';
                text.style.fontSize = '11px';
                text.style.whiteSpace = 'normal';
                row.appendChild(text);

                var xBtn = document.createElement('button');
                xBtn.type = 'button';
                xBtn.textContent = 'x';
                xBtn.style.border = 'none';
                xBtn.style.background = 'none';
                xBtn.style.color = '#c00';
                xBtn.style.cursor = 'pointer';
                xBtn.style.fontSize = '13px';
                xBtn.style.fontWeight = 'bold';
                xBtn.style.padding = '0 6px';
                xBtn.style.marginLeft = '6px';
                xBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (onDelete) onDelete(name);
                });
                row.appendChild(xBtn);

                row.addEventListener('click', function() {
                    setValue(name);
                    close();
                    onChange();
                });

                optBox.appendChild(row);
            });

            if (!matched && hasQ) {
                var hint = document.createElement('div');
                hint.textContent = '按 Enter 新增「' + raw + '」';
                hint.style.padding = '6px';
                hint.style.fontSize = '11px';
                hint.style.color = '#2a6';
                hint.style.cursor = 'pointer';
                hint.addEventListener('click', function() { addBtn.click(); });
                optBox.appendChild(hint);
            }
        }

        function open() {
            input.value = '';
            render();
            listBox.style.display = 'block';
            input.focus();
        }
        function close() { listBox.style.display = 'none'; }

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            if (listBox.style.display === 'none') open(); else close();
        });
        root.addEventListener('click', function(e) { e.stopPropagation(); });
        document.addEventListener('click', function() { close(); });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBtn.click();
            } else if (e.key === 'Escape') {
                close();
            }
        });
        input.addEventListener('input', render);

        return {
            root: root,
            input: input,
            addBtn: addBtn,
            getValue: function() { return value; },
            setValue: setValue,
            setOptions: function(arr) {
                options = arr.slice();
                if (options.indexOf(value) === -1) {
                    value = options.length ? options[0] : '';
                }
                setValue(value);
                render();
            },
            setOnChange: function(fn) { onChange = fn; },
            setOnDelete: function(fn) { onDelete = fn; }
        };
    }

    // ============ 浮動按鈕列（自動填寫 + 設定加班事由） ============
    function loadPos(key, def) {
        try {
            var p = GM_getValue(key, null);
            if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
        } catch (e) {}
        return def;
    }

    function makeDraggable(el, key, handle) {
        var h = handle || el;
        h.style.cursor = 'move';
        h.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var startX = e.clientX, startY = e.clientY;
            var baseX = parseInt(el.style.left, 10) || 0;
            var baseY = parseInt(el.style.top, 10) || 0;
            var w = el.offsetWidth, hgt = el.offsetHeight;
            var moved = false;
            function onMove(ev) {
                var dx = ev.clientX - startX, dy = ev.clientY - startY;
                if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                moved = true;
                var maxX = Math.max(0, window.innerWidth - w);
                var maxY = Math.max(0, window.innerHeight - hgt);
                el.style.left = Math.max(0, Math.min(baseX + dx, maxX)) + 'px';
                el.style.top = Math.max(0, Math.min(baseY + dy, maxY)) + 'px';
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (moved) {
                    try {
                        GM_setValue(key, { x: parseInt(el.style.left, 10) || 0, y: parseInt(el.style.top, 10) || 0 });
                    } catch (err) {}
                    e.preventDefault();
                }
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    var uiPos = loadPos('wo_ui_pos', {
        x: Math.max(10, Math.round(window.innerWidth * 0.7 - 199)),
        y: Math.round(window.innerHeight * 0.3)
    });
    var testPos = loadPos('wo_test_pos', {
        x: Math.max(10, Math.round(window.innerWidth * 0.1)),
        y: Math.round(window.innerHeight * 0.3)
    });

    var wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = uiPos.x + 'px';
    wrap.style.top = uiPos.y + 'px';
    wrap.style.zIndex = '99999';
    wrap.style.fontFamily = 'sans-serif';
    wrap.style.userSelect = 'none';

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

    var grip = document.createElement('div');
    grip.textContent = '≡ 拖曳';
    grip.title = '拖曳移動';
    grip.style.fontSize = '10px';
    grip.style.color = '#666';
    grip.style.background = '#eee';
    grip.style.borderRadius = '3px';
    grip.style.padding = '1px 6px';
    grip.style.marginTop = '4px';
    grip.style.cursor = 'move';
    grip.style.textAlign = 'center';
    grip.style.userSelect = 'none';
    wrap.appendChild(grip);
    makeDraggable(wrap, 'wo_ui_pos', grip);

    document.body.appendChild(wrap);

    var statusEl = document.createElement('div');
    statusEl.style.position = 'fixed';
    statusEl.style.bottom = '20px';
    statusEl.style.right = '20px';
    statusEl.style.zIndex = '999999';
    statusEl.style.fontSize = '12px';
    statusEl.style.color = '#c00';
    statusEl.style.backgroundColor = 'rgba(255,255,255,0.95)';
    statusEl.style.padding = '6px 10px';
    statusEl.style.borderRadius = '4px';
    statusEl.style.border = '1px solid #ddd';
    statusEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    statusEl.style.maxWidth = '480px';
    statusEl.style.fontFamily = 'sans-serif';
    statusEl.style.display = 'none';
    document.body.appendChild(statusEl);

    function setStatus(msg) {
        statusEl.textContent = msg;
        statusEl.style.display = msg ? 'block' : 'none';
        clearTimeout(setStatus._t);
        setStatus._t = setTimeout(function() {
            statusEl.textContent = '';
            statusEl.style.display = 'none';
        }, 6000);
    }

    // ============ 設定面板 ============
    var panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.position = 'fixed';
    panel.style.zIndex = '99999';
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'auto';
    panel.style.background = '#fff';
    panel.style.border = '1px solid #ccc';
    panel.style.borderRadius = '6px';
    panel.style.padding = '10px';
    panel.style.width = '380px';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    panel.style.fontFamily = 'sans-serif';
    document.body.appendChild(panel);

    var panelPos = loadPos('wo_panel_pos', null);

    var title = document.createElement('div');
    title.textContent = '設定加班事由';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.cursor = 'move';
    title.title = '拖曳移動';
    panel.appendChild(title);
    makeDraggable(panel, 'wo_panel_pos', title);

    // --- 專案 ---
    var projectDD = makeDropdown('選擇專案', '搜尋或新增（格式：專案/料號/人名/團隊）');
    panel.appendChild(makeRow('專案', projectDD.root));

    // --- 主體 ---
    var subjectDD = makeDropdown('選擇主體', '搜尋或新增主體描述');
    panel.appendChild(makeRow('主體', subjectDD.root));

    // --- 原因 ---
    var reasonDD = makeDropdown('選擇原因', '搜尋或新增原因');
    panel.appendChild(makeRow('原因', reasonDD.root));

    // --- 要求單位 ---
    var unitDD = makeDropdown('選擇單位', '搜尋或新增單位');
    panel.appendChild(makeRow('要求單位', unitDD.root));

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
    previewBox.style.minHeight = '48px';
    previewBox.style.backgroundColor = '#fafafa';
    panel.appendChild(previewBox);

    // --- 匯入 / 匯出 ---
    var ioRow = document.createElement('div');
    ioRow.style.marginTop = '8px';
    var exportBtn = makeSmallBtn('匯出 JSON');
    var importBtn = makeSmallBtn('匯入 JSON');
    ioRow.appendChild(exportBtn);
    ioRow.appendChild(importBtn);
    panel.appendChild(ioRow);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

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
        box.style.left = testPos.x + 'px';
        box.style.top = testPos.y + 'px';
        box.style.zIndex = '99999';
        box.style.maxHeight = '70vh';
        box.style.overflowY = 'auto';
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
        lab.style.cursor = 'move';
        lab.title = '拖曳移動';
        box.appendChild(lab);
        makeDraggable(box, 'wo_test_pos', lab);

        var ta = document.createElement('textarea');
        ta.id = 'wo-test-output';
        ta.rows = 5;
        ta.style.width = '100%';
        ta.style.fontSize = '12px';
        box.appendChild(ta);

        document.body.appendChild(box);
        return ta;
    }

    var testTextarea = ensureTestTextarea();

    // ============ 邏輯 ============
    function buildComment() {
        var lines = [];
        var project = projectDD.getValue().trim();
        var subject = subjectDD.getValue().trim();
        var reason = reasonDD.getValue().trim();
        var unit = unitDD.getValue().trim();
        if (project) lines.push(project);
        if (subject) lines.push(subject);
        if (reason) lines.push(reason);
        if (unit) lines.push(unit);
        return lines.join('\n');
    }

    function updatePreview() {
        previewBox.textContent = buildComment();
    }

    function applyConfig() {
        var cfg = getConfig();
        projectDD.setOptions(getProjects());
        subjectDD.setOptions(getSubjects());
        reasonDD.setOptions(getReasons());
        unitDD.setOptions(getUnits());
        if (cfg.project) projectDD.setValue(cfg.project);
        if (cfg.subject) subjectDD.setValue(cfg.subject);
        if (cfg.reason) reasonDD.setValue(cfg.reason);
        if (cfg.unit) unitDD.setValue(cfg.unit);
        updatePreview();
    }

    function addToList(input, getter, saver, dd) {
        var text = input.value.trim();
        if (!text) { setStatus('請先輸入文字再新增'); return; }
        var arr = getter();
        if (arr.indexOf(text) === -1) {
            arr.push(text);
            saver(arr);
        }
        input.value = '';
        dd.setOptions(arr);
        dd.setValue(text);
        saveConfig();
        updatePreview();
        setStatus('已新增：' + text);
    }

    function deleteItem(name, getter, saver, dd) {
        var arr = getter();
        var idx = arr.indexOf(name);
        if (idx === -1) return;
        arr.splice(idx, 1);
        if (!arr.length) {
            setStatus('至少保留一筆');
            arr = [name];
        }
        saver(arr);
        dd.setOptions(arr);
        saveConfig();
        updatePreview();
        setStatus('已刪除：' + name);
    }

    function exportJSON() {
        var data = {
            version: 1,
            projects: getProjects(),
            subjects: getSubjects(),
            reasons: getReasons(),
            units: getUnits(),
            history: getHistory()
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'wistron-overtime-config.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        setStatus('已匯出 JSON');
    }

    function importJSON(file) {
        var reader = new FileReader();
        reader.onload = function() {
            try {
                var data = JSON.parse(reader.result);
                if (!data || typeof data !== 'object') throw new Error('not object');
                if (Array.isArray(data.projects) && data.projects.length) saveProjects(data.projects);
                if (Array.isArray(data.subjects) && data.subjects.length) saveSubjects(data.subjects);
                if (Array.isArray(data.reasons) && data.reasons.length) saveReasons(data.reasons);
                if (Array.isArray(data.units) && data.units.length) saveUnits(data.units);
                if (Array.isArray(data.history)) setList(KEY_HISTORY, data.history.slice(-HISTORY_LIMIT));
                applyConfig();
                renderHistory();
                setStatus('匯入完成');
            } catch (e) {
                setStatus('匯入失敗：不是有效的 JSON');
            }
        };
        reader.onerror = function() {
            setStatus('匯入失敗：讀取檔案錯誤');
        };
        reader.readAsText(file);
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
        // 非 HR 表單頁面（例：example.com）→ 直接寫入測試文字框
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
    function positionPanel() {
        var w = panel.offsetWidth || 380;
        var h = panel.offsetHeight || 400;
        var x = wrap.offsetLeft + wrap.offsetWidth + 8;
        var y = wrap.offsetTop;
        if (x + w > window.innerWidth) x = Math.max(0, wrap.offsetLeft - w - 8);
        if (y + h > window.innerHeight) y = Math.max(0, window.innerHeight - h - 8);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    }

    fillBtn.addEventListener('click', doFill);

    settingsBtn.addEventListener('click', function() {
        var isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            if (panelPos) {
                panel.style.left = panelPos.x + 'px';
                panel.style.top = panelPos.y + 'px';
            } else {
                positionPanel();
            }
            applyConfig();
            renderHistory();
            setStatus('');
        }
    });

    var dropDowns = [
        { dd: projectDD, getter: getProjects, saver: saveProjects },
        { dd: subjectDD, getter: getSubjects, saver: saveSubjects },
        { dd: reasonDD, getter: getReasons, saver: saveReasons },
        { dd: unitDD, getter: getUnits, saver: saveUnits }
    ];

    dropDowns.forEach(function(item) {
        item.dd.setOnChange(function() { updatePreview(); saveConfig(); });
        item.dd.setOnDelete(function(name) { deleteItem(name, item.getter, item.saver, item.dd); });
        item.dd.addBtn.addEventListener('click', function() {
            addToList(item.dd.input, item.getter, item.saver, item.dd);
        });
    });

    exportBtn.addEventListener('click', exportJSON);
    importBtn.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files[0]) importJSON(fileInput.files[0]);
        fileInput.value = '';
    });
})();
