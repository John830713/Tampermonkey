// ==UserScript==
// @name        搜尋紀錄測試
// @version      0.1
// @description  實驗：搜尋框聚焦跳出歷史紀錄下拉（顯示前4筆、保存50筆、x單獨刪除、刪除後遞補、點紀錄回填）
// ==/UserScript==

(function() {
    'use strict';

    var KEY = 'sb_history';
    var SHOW = 4;
    var LIMIT = 50;

    function getHist() {
        try {
            var h = GM_getValue(KEY, null);
            if (Array.isArray(h)) return h;
        } catch (e) {}
        return [];
    }

    function saveHist(arr) {
        try { GM_setValue(KEY, arr); } catch (e) {}
    }

    function record(text) {
        var h = getHist().filter(function(x) { return x !== text; });
        h.unshift(text);
        saveHist(h.slice(0, LIMIT));
    }

    function removeHist(text) {
        saveHist(getHist().filter(function(x) { return x !== text; }));
    }

    // ============ 畫面正中心文字編輯框 ============
    var box = document.createElement('div');
    box.style.position = 'fixed';
    box.style.left = '50%';
    box.style.top = '38%';
    box.style.transform = 'translate(-50%, -50%)';
    box.style.width = '320px';
    box.style.zIndex = '2147483646';
    box.style.fontFamily = 'sans-serif';

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '搜尋測試：輸入文字按 Enter 記錄';
    input.style.width = '100%';
    input.style.padding = '8px 10px';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    input.style.border = '2px solid #4d79ff';
    input.style.borderRadius = '6px';
    box.appendChild(input);

    var list = document.createElement('div');
    list.style.display = 'none';
    list.style.position = 'absolute';
    list.style.left = '0';
    list.style.right = '0';
    list.style.top = '100%';
    list.style.marginTop = '4px';
    list.style.background = '#fff';
    list.style.border = '1px solid #ccc';
    list.style.borderRadius = '6px';
    list.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    list.style.maxHeight = '220px';
    list.style.overflowY = 'auto';
    box.appendChild(list);

    document.body.appendChild(box);

    function render() {
        list.textContent = '';
        var h = getHist();
        if (!h.length) {
            var empty = document.createElement('div');
            empty.textContent = '（尚無搜尋紀錄，輸入文字按 Enter）';
            empty.style.padding = '6px 10px';
            empty.style.color = '#999';
            empty.style.fontSize = '12px';
            list.appendChild(empty);
            return;
        }
        var header = document.createElement('div');
        header.textContent = '最近搜尋';
        header.style.fontSize = '11px';
        header.style.color = '#888';
        header.style.padding = '4px 10px';
        header.style.borderBottom = '1px solid #eee';
        list.appendChild(header);

        var shown = h.slice(0, SHOW);
        shown.forEach(function(text) {
            var row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.padding = '6px 10px';
            row.style.cursor = 'pointer';
            row.style.borderBottom = '1px solid #f0f0f0';
            row.title = text;

            var span = document.createElement('span');
            span.textContent = text;
            span.style.flex = '1';
            span.style.fontSize = '13px';
            span.style.overflow = 'hidden';
            span.style.whiteSpace = 'nowrap';
            span.style.textOverflow = 'ellipsis';
            row.appendChild(span);

            var xBtn = document.createElement('button');
            xBtn.type = 'button';
            xBtn.textContent = 'x';
            xBtn.title = '刪除此紀錄';
            xBtn.style.border = 'none';
            xBtn.style.background = 'none';
            xBtn.style.color = '#c00';
            xBtn.style.cursor = 'pointer';
            xBtn.style.fontSize = '14px';
            xBtn.style.fontWeight = 'bold';
            xBtn.style.padding = '0 6px';
            xBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeHist(text);
                render();
                input.focus();
            });
            row.appendChild(xBtn);

            row.addEventListener('click', function() {
                input.value = text;
                close();
                input.focus();
            });

            list.appendChild(row);
        });

        var footer = document.createElement('div');
        footer.textContent = '共保存 ' + h.length + ' 筆，顯示前 ' + SHOW + ' 筆';
        footer.style.fontSize = '11px';
        footer.style.color = '#aaa';
        footer.style.padding = '4px 10px';
        list.appendChild(footer);
    }

    function open() {
        render();
        list.style.display = 'block';
    }

    function close() { list.style.display = 'none'; }

    input.addEventListener('focus', open);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var t = input.value.trim();
            if (t) record(t);
            close();
        } else if (e.key === 'Escape') {
            close();
        }
    });
    box.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function() { close(); });
})();
