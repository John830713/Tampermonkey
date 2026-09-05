// ==UserScript==
// @name         緯創 PTS 工時自動填報器
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  自動將打卡時數填入專案列；週一至週五若時數為 0 或空白則在假日（Non-project）列填入 8 小時；週六日不填寫。
// @author       You
// @match        *://*/~pts/subsystem/tss/web_pages/application/my_time_sheet.php*
// @match        *://*/~pts/subsystem/tss/web_pages/iframe/my_task_table.php*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // ============ 可調設定 ============
    // 1. PTS_PROJECT_KEYWORD：要填入打卡時數的專案列關鍵字（例如 'R-CY27 EIV'）。
    //    留空 '' 表示「取表格第一個非假日專案列」（兼容原有邏輯）。
    //    可從 DevTools 抓取：專案列第一欄的 <a class="project_col"> 完整文字內容。
    var PTS_PROJECT_KEYWORD = '';
    // 2. PTS_HOLIDAY_NAME：假日列（無打卡時填入 8 小時的列）的專案名稱。
    //    預設 'Non-project'，若你的假日列名稱是其他字樣請一併修改。
    var PTS_HOLIDAY_NAME = 'Non-project';

    function createAutoFillBtn() {
        if (document.getElementById('auto-fill-pts-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'auto-fill-pts-btn';
        btn.type = 'button';
        btn.textContent = '⚡ 智慧帶入打卡工時';
        btn.style.position = 'fixed';
        btn.style.top = '120px';
        btn.style.left = '60%';
        btn.style.zIndex = '99999';
        btn.style.padding = '12px 20px';
        btn.style.fontSize = '16px';
        btn.style.fontWeight = 'bold';
        btn.style.color = '#fff';
        btn.style.backgroundColor = '#28a745';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        btn.addEventListener('mouseover', function() { btn.style.backgroundColor = '#218838'; });
        btn.addEventListener('mouseout', function() { btn.style.backgroundColor = '#28a745'; });
        btn.addEventListener('click', doFill);
        document.body.appendChild(btn);
    }

    function getClockInSpans() {
        var tfootRows = document.querySelectorAll('#ts_table tfoot tr');
        if (!tfootRows || tfootRows.length < 2) return null;
        return tfootRows[1].querySelectorAll('td span');
    }

    function getHolidayRow() {
        var rows = document.querySelectorAll('#ts_table tbody tr');
        for (var i = 0; i < rows.length; i++) {
            var pc = rows[i].querySelector('.project_col');
            if (pc && pc.textContent.trim() === PTS_HOLIDAY_NAME) return rows[i];
        }
        return null;
    }

    function getProjectRow() {
        var rows = document.querySelectorAll('#ts_table tbody tr');
        var kw = PTS_PROJECT_KEYWORD.trim();
        for (var i = 0; i < rows.length; i++) {
            var pc = rows[i].querySelector('.project_col');
            if (!pc) continue;
            var name = pc.textContent.trim();
            if (name === PTS_HOLIDAY_NAME) continue;
            if (!kw || name.indexOf(kw) !== -1) return rows[i];
        }
        return null;
    }

    function fillDay(row, day, hours) {
        if (!row) return false;
        var input = row.querySelector('span.' + day + ' input.input_class');
        if (!input) return false;
        input.value = hours;
        input.dispatchEvent(new Event('blur'));
        return true;
    }

    function doFill() {
        var clockSpans = getClockInSpans();
        if (!clockSpans) {
            alert('找不到打卡時數欄位，請確認頁面已完全載入。');
            return;
        }

        var projectRow = getProjectRow();
        var holidayRow = getHolidayRow();

        if (!projectRow) {
            var kwInfo = PTS_PROJECT_KEYWORD.trim() ? ('（關鍵字：' + PTS_PROJECT_KEYWORD.trim() + '）') : '（第一個非假日列）';
            alert('找不到要填入打卡時數的專案列 ' + kwInfo + '，請確認專案名稱或關鍵字。');
            return;
        }

        var pCount = 0;
        var hCount = 0;
        var skipCount = 0;

        DAYS.forEach(function(day, idx) {
            if (idx >= 5) {
                skipCount++;
                return;
            }
            var span = clockSpans[idx];
            if (!span) {
                skipCount++;
                return;
            }
            var hours = span.textContent.trim();
            if (hours === '' || parseFloat(hours) <= 0) {
                if (fillDay(holidayRow, day, '8')) hCount++;
            } else {
                if (fillDay(projectRow, day, hours)) pCount++;
            }
        });

        alert('工時填寫完成！\n' +
            '填入專案列（有打卡）：' + pCount + ' 天\n' +
            '填入假日欄位（無打卡補 8 小時）：' + hCount + ' 天\n' +
            '跳過不填（週末）：' + skipCount + ' 天\n' +
            '系統已自動同步儲存（觸發 blur 存檔）。');
    }

    var checkExist = setInterval(function() {
        if (document.querySelector('#ts_table tfoot tr')) {
            createAutoFillBtn();
            clearInterval(checkExist);
        }
    }, 1000);
})();