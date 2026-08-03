// ==UserScript==
// @name        加班設定測試台
// @version      1.0
// @description  example.com 測試台：調整加班設定的四欄位內容（專案/主體/原因/要求單位）、選項管理、JSON 匯入匯出、歷史紀錄；按「自動填寫」寫入測試文字框。
// @match        https://example.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ============ 儲存（GM storage，與 wistron-overtime production 共用） ============
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

    // ============ 自訂欄位（文字編輯框 + 選項下拉） ============
    function makeDropdown(placeholder, inputPlaceholder) {
        var root = document.createElement('div');
        root.style.position = 'relative';
        root.style.display = 'inline-block';
        root.style.width = '260px';
        root.style.fontSize = '12px';
        root.style.verticalAlign = 'middle';

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.title = inputPlaceholder || '';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.fontSize = '11px';
        input.style.padding = '2px 6px';
        input.style.border = '1px solid #aaa';
        input.style.borderRadius = '3px';
        root.appendChild(input);

        var listBox = document.createElement('div');
        listBox.style.display = 'none';
        listBox.style.position = 'fixed';
        listBox.style.zIndex = '2147483647';
        listBox.style.background = '#fff';
        listBox.style.border = '1px solid #ccc';
        listBox.style.borderRadius = '4px';
        listBox.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        listBox.style.minWidth = '300px';
        document.body.appendChild(listBox);

        var optBox = document.createElement('div');
        optBox.style.maxHeight = '150px';
        optBox.style.overflowY = 'auto';
        listBox.appendChild(optBox);

        var query = '';
        var options = [];
        var onChange = function() {};
        var onDelete = null;
        var onAdd = null;

        function render() {
            optBox.textContent = '';
            var raw = query;
            var q = raw.toLowerCase();
            var hasQ = q.length > 0;

            var shownOpts = [];
            options.forEach(function(name) {
                if (!hasQ || name.toLowerCase().indexOf(q) !== -1) shownOpts.push(name);
            });

            if (!shownOpts.length) {
                var empty = document.createElement('div');
                empty.textContent = hasQ ? '按 Enter 新增「' + raw + '」' : '（尚無選項，輸入文字按 Enter 新增）';
                empty.style.padding = '6px';
                empty.style.fontSize = '11px';
                if (hasQ) {
                    empty.style.cursor = 'pointer';
                    empty.style.color = '#2a6';
                    empty.addEventListener('click', function() { if (onAdd) onAdd(raw); });
                } else {
                    empty.style.color = '#999';
                }
                optBox.appendChild(empty);
                return;
            }

            shownOpts.forEach(function(name) {
                var row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.padding = '3px 6px';
                row.style.cursor = 'pointer';
                row.style.borderBottom = '1px solid #eee';
                if (name === input.value.trim()) row.style.background = '#e8f0fe';

                var text = document.createElement('span');
                text.textContent = name;
                text.style.flex = '1';
                text.style.fontSize = '11px';
                text.style.whiteSpace = 'normal';
                row.appendChild(text);

                var xBtn = document.createElement('button');
                xBtn.type = 'button';
                xBtn.textContent = 'x';
                xBtn.title = '刪除此選項';
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
                    input.value = name;
                    query = '';
                    close();
                    onChange();
                });

                optBox.appendChild(row);
            });

            if (hasQ) {
                var hint = document.createElement('div');
                hint.textContent = '按 Enter 新增「' + raw + '」';
                hint.style.padding = '6px';
                hint.style.fontSize = '11px';
                hint.style.color = '#2a6';
                hint.style.cursor = 'pointer';
                hint.addEventListener('click', function() { if (onAdd) onAdd(raw); });
                optBox.appendChild(hint);
            }
        }

        var scrollAncestors = [];
        function findScrollAncestors() {
            scrollAncestors = [];
            var cur = root.parentElement;
            while (cur) {
                if (cur.scrollHeight > cur.clientHeight) scrollAncestors.push(cur);
                cur = cur.parentElement;
            }
        }
        function reposition() {
            if (listBox.style.display === 'none') return;
            var r = input.getBoundingClientRect();
            var bh = listBox.offsetHeight;
            var top;
            if (r.bottom + bh > window.innerHeight - 8 && r.top - bh > 8) {
                top = Math.max(8, r.top - bh);
            } else {
                top = r.bottom;
            }
            listBox.style.left = r.left + 'px';
            listBox.style.top = top + 'px';
            listBox.style.width = Math.max(r.width, 300) + 'px';
        }

        function open(filter) {
            query = filter || '';
            render();
            listBox.style.display = 'block';
            findScrollAncestors();
            reposition();
            window.addEventListener('scroll', reposition, true);
            scrollAncestors.forEach(function(s) { s.addEventListener('scroll', reposition); });
        }
        function close() {
            listBox.style.display = 'none';
            window.removeEventListener('scroll', reposition, true);
            scrollAncestors.forEach(function(s) { s.removeEventListener('scroll', reposition); });
            scrollAncestors = [];
        }

        listBox.addEventListener('click', function(e) { e.stopPropagation(); });
        root.addEventListener('click', function(e) { e.stopPropagation(); });
        document.addEventListener('click', function() { close(); });

        input.addEventListener('focus', function() {
            if (listBox.style.display === 'none') open();
        });
        input.addEventListener('input', function() {
            var t = input.value.trim();
            if (listBox.style.display === 'none') {
                open(t);
            } else {
                query = t;
                render();
            }
            onChange();
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var t = input.value.trim();
                if (t && onAdd) onAdd(t);
                close();
            } else if (e.key === 'Escape') {
                close();
            }
        });

        return {
            root: root,
            input: input,
            getValue: function() { return input.value; },
            setValue: function(v) { input.value = v; },
            setOptions: function(arr) {
                options = arr.slice();
                render();
            },
            setOnChange: function(fn) { onChange = fn; },
            setOnDelete: function(fn) { onDelete = fn; },
            setOnAdd: function(fn) { onAdd = fn; }
        };
    }

    // ============ 浮動按鈕列 ============
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

    var uiPos = loadPos('sb_ui_pos', {
        x: Math.max(10, Math.round(window.innerWidth * 0.7 - 199)),
        y: Math.round(window.innerHeight * 0.3)
    });
    var testPos = loadPos('sb_test_pos', {
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
    makeDraggable(wrap, 'sb_ui_pos', grip);

    document.body.appendChild(wrap);

    var statusEl = document.createElement('div');
    statusEl.style.position = 'fixed';
    statusEl.style.bottom = '20px';
    statusEl.style.right = '20px';
    statusEl.style.zIndex = '2147483646';
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
    panel.style.zIndex = '2147483645';
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

    var panelPos = loadPos('sb_panel_pos', null);

    var title = document.createElement('div');
    title.textContent = '設定加班事由';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.cursor = 'move';
    title.title = '拖曳移動';
    panel.appendChild(title);
    makeDraggable(panel, 'sb_panel_pos', title);

    // --- 專案 ---
    var projectDD = makeDropdown('選擇專案', '格式：專案/料號/人名/團隊');
    panel.appendChild(makeRow('專案', projectDD.root));

    // --- 主體 ---
    var subjectDD = makeDropdown('選擇主體', '主體描述');
    panel.appendChild(makeRow('主體', subjectDD.root));

    // --- 原因 ---
    var reasonDD = makeDropdown('選擇原因', '加班原因');
    panel.appendChild(makeRow('原因', reasonDD.root));

    // --- 要求單位 ---
    var unitDD = makeDropdown('選擇單位', '要求單位');
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

    // --- 歷史（近 50 筆，可展開/收合） ---
    var historyTitle = document.createElement('div');
    historyTitle.textContent = '▸ 歷史（近 50 筆，點擊直接填入）';
    historyTitle.style.fontSize = '12px';
    historyTitle.style.fontWeight = 'bold';
    historyTitle.style.marginTop = '10px';
    historyTitle.style.cursor = 'pointer';
    historyTitle.style.userSelect = 'none';
    historyTitle.title = '展開 / 收合歷史紀錄';
    panel.appendChild(historyTitle);

    var historyBox = document.createElement('div');
    historyBox.style.display = 'none';
    historyBox.style.maxHeight = '220px';
    historyBox.style.overflowY = 'auto';
    panel.appendChild(historyBox);

    historyTitle.addEventListener('click', function() {
        if (historyBox.style.display === 'none') {
            renderHistory();
            historyBox.style.display = 'block';
            historyTitle.textContent = '▾ 歷史（近 50 筆，點擊直接填入）';
        } else {
            historyBox.style.display = 'none';
            historyTitle.textContent = '▸ 歷史（近 50 筆，點擊直接填入）';
        }
    });

    // ============ 測試文字框 ============
    var testBox = document.createElement('div');
    testBox.style.position = 'fixed';
    testBox.style.left = testPos.x + 'px';
    testBox.style.top = testPos.y + 'px';
    testBox.style.zIndex = '99999';
    testBox.style.maxHeight = '70vh';
    testBox.style.overflowY = 'auto';
    testBox.style.background = '#fff';
    testBox.style.border = '1px solid #ccc';
    testBox.style.borderRadius = '6px';
    testBox.style.padding = '8px';
    testBox.style.width = '380px';
    testBox.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    testBox.style.fontFamily = 'sans-serif';

    var lab = document.createElement('div');
    lab.textContent = '測試文字框（自動填寫會寫入這裡）';
    lab.style.fontSize = '12px';
    lab.style.fontWeight = 'bold';
    lab.style.marginBottom = '4px';
    lab.style.cursor = 'move';
    lab.title = '拖曳移動';
    testBox.appendChild(lab);
    makeDraggable(testBox, 'sb_test_pos', lab);

    var testTextarea = document.createElement('textarea');
    testTextarea.id = 'wo-test-output';
    testTextarea.rows = 5;
    testTextarea.style.width = '100%';
    testTextarea.style.fontSize = '12px';
    testBox.appendChild(testTextarea);

    document.body.appendChild(testBox);

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

    function addToList(text, getter, saver, dd) {
        if (!text) { setStatus('請先輸入文字再新增'); return; }
        var arr = getter();
        if (arr.indexOf(text) === -1) {
            arr.push(text);
            saver(arr);
        }
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

    function fillCommentOnly(text) {
        testTextarea.value = text;
        testTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        pushHistory(text);
        renderHistory();
        setStatus('已填入歷史備註，可自行微調');
    }

    function doFill() {
        var testComment = buildComment();
        testTextarea.value = testComment;
        testTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        pushHistory(testComment);
        renderHistory();
        setStatus('已寫入測試文字框');
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
        item.dd.setOnAdd(function(text) {
            addToList(text, item.getter, item.saver, item.dd);
        });
    });

    exportBtn.addEventListener('click', exportJSON);
    importBtn.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files[0]) importJSON(fileInput.files[0]);
        fileInput.value = '';
    });
})();
