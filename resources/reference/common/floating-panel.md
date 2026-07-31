# Floating Panel

## 遮擋問題

浮動面板會擋住頁面右側內容（或左側），必須提供左右切換：
- 預設右側，面板內放切換按鈕（◀/▶）
- 切換時 border、shadow 方向跟著翻
- 不需存 localStorage — 每次載入預設右邊

## 可拖曳浮動元素

比左右切換更通用的解法：讓元素可拖曳，位置存 GM storage，下次載入還原。

```javascript
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
                GM_setValue(key, { x: parseInt(el.style.left, 10) || 0, y: parseInt(el.style.top, 10) || 0 });
                e.preventDefault();
            }
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
```

### 拖曳 handle 選擇

| 元素類型 | handle | 原因 |
|---------|--------|------|
| 純按鈕列 | 加一個 `≡ 拖曳` grip | 不能拿 button 當 handle，會跟 click 打架 |
| 面板 | 標題列 | 面板內有捲動、輸入框，整面板拖曳會誤觸 |
| 小盒子 | 標籤列 | 同上 |

### 注意事項

- **handle 絕不能是 button / input** — 否則拖曳和點擊互相干擾；grip 放按鈕下方一列
- **4px 移動閾值**：只有真正移動才當拖曳，單純點擊不會觸發 `preventDefault`
- **拖曳時 clamp 到視窗內**（`max(0, innerWidth - w)`），放開後存 `{x, y}`
- **拖曳元素用 `position: fixed` + px `left/top`**，不要混用 `%` / `right`，否則拖曳座標基準會跑掉
- **存的位置在視窗縮小後可能超出畫面** — 載入時如果存的位置超過 `innerWidth`，要重新 clamp 回視窗內
- 讀取時 `GM_getValue` 會自動 parse JSON，直接回傳物件，不要再 `JSON.parse`

### 避免超出視窗

- 內容多時給面板 `max-height: 70vh; overflow-y: auto`，不靠定位躲
- 面板開啟時依觸發元素定位：`el.left + el.width + 8`，右側放不下改放左側，垂直超出就往上挪

## 狀態訊息（toast）

狀態提示不要放在面板裡（會被面板或其他元素蓋住），用固定右下角 toast：
- `position: fixed; bottom: 20px; right: 20px; z-index: 999999`（高於一般面板 99999）
- 空訊息時 `display: none`，避免畫面角落掛一個空框
- `setTimeout` 6 秒自動清除，重複呼叫要先 `clearTimeout`

```javascript
function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = msg ? 'block' : 'none';
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(function() {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
    }, 6000);
}
```

## 按鈕設計

- 面板操作按鈕統一放在面板內，不用獨立浮動按鈕分散注意力
- 按鈕要直觀可辨識：文字或圖示 + hover tooltip
- 事件綁定在 `appendChild` 之後、任何可能 throw 的邏輯之前
- 參考：`debug-toolkit.js` 的 Inspector 功能（面板、標記、傳送）
- 可拖曳 + toast 完整範例：`modules/wistron-overtime.js`
