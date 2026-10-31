# Overlay / Progress

## Overlay 按鈕

### 位置與支撐容器

- 縮圖 overlay：`position:absolute; left:0; right:0; bottom:0`，掛在 `position:relative; overflow:hidden` 的 `.thumb-container` 內
- 只在 hover 時出現：預設 `opacity:0; pointer-events:none`，`.thumb-container:hover` 時 `opacity:1; pointer-events:auto`
- **陷阱**：未 hover 時 `pointer-events:none`，點擊會穿透到底下的 `<a>`（直接導航到影片頁）。自動化腳本要點這顆按鈕，必須先 hover 卡片
- 固定按鈕：右上角或右下角

### 樣式基準

```css
.dl-btn-row { width: 100%; display: flex; gap: 4px; }
.dl-overlay-btn {
    flex: 1;              /* 不要用 width:100%，同一列還有暫停/取消鈕時會被擠掉 */
    padding: 5px 0;
    background: rgba(255, 152, 0, 0.9); /* 橙色 */
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    border: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    text-align: center;
}
```

### 狀態語意

狀態的**單一來源是 localStorage**（例：`hanime_dl_status` = `{videoId: "done" | "fail:HTTP 503" | "fail:network"}`），UI 只是它的投影。

| 狀態 | 按鈕文字 | 背景 | 徽章 |
|------|----------|------|------|
| 未下載 | `Download` | 預設橘 `rgba(255,152,0,0.9)` | 無 |
| 下載中 | `Fetching video URL...` / `45%` / `12.3 MB` / `存檔中...` | 預設橘 | 無 |
| 完成 | `Re-download` | `rgba(255,152,0,0.8)` | ✓ 綠 `rgba(46,125,50,0.9)` |
| 失敗 | `Retry`（`title` 放失敗原因） | `rgba(198,40,40,0.8)` | ✗ 紅 `rgba(198,40,40,0.9)` |

- 繪製前**重新讀 localStorage**（`applyState()`），不要沿用注入當下的閉包快照
- 跨分頁同步：`window.addEventListener('storage', ...)` 重新掃描；hover 時再校正一次
- 已有 overlay 的卡片在重掃時只更新狀態，不要用 `return` 直接跳過（否則狀態永遠停在第一次注入時）

### 徽章

用 class 定位/移除，不要用 `span[style*="position:absolute"]` 這種字串比對（會誤刪縮圖內其他元素）：

```css
.dl-badge {
    position: absolute; top: 4px; right: 4px;
    width: 18px; height: 18px; border-radius: 50%;
    color: #fff; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
    z-index: 11; pointer-events: none;
}
.dl-badge.ok { background: rgba(46, 125, 50, 0.9); }
.dl-badge.fail { background: rgba(198, 40, 40, 0.9); }
```

## 進度條

### 樣式基準

```css
.dl-progress-outer {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 8px;
    background: #e0e0e0;
    border-radius: 0 0 4px 4px;
    overflow: hidden;
    display: none;            /* 下載開始時才 display:block */
}
.dl-progress-inner {
    width: 0%;
    height: 100%;
    background: #4caf50; /* 綠色；完成時改 #2e7d32 */
    transition: width 0.1s linear;
}
```

### 進度文字格式

現行 `hanime-downloader.js` 只顯示百分比（`45%`）。要顯示 `45.3% (120.5 / 266.0 MB)` 必須自己記錄 `totalBytes` 與總長，瀏覽器不會給。

### Range 續傳的百分比

`onprogress` 的 `e.total` 只代表**這一次請求的剩餘位元組**，不是檔案總長。

```javascript
var baseBytes = totalBytes;                  // 這一輪之前已收下的位元組
var currentLoaded = baseBytes + e.loaded;    // 已下載
var grandTotal = baseBytes + e.total;        // 檔案總長（Range 續傳時）
var pct = Math.min(100, currentLoaded / grandTotal * 100);
```

直接拿 `e.loaded / e.total` 算，續傳後百分比會爆表或歸零。

## 常見 bug 檢查清單

- [ ] 每次掃描都重建徽章／重寫 `textContent` → 會自己觸發 `MutationObserver`，形成無限迴圈（用值比較跳過）
- [ ] `resetUI()` 無條件把文字設回 `Download` → 完成後的 `Re-download` 立刻被蓋掉；`resetUI()` 最後應呼叫 `applyState()`
- [ ] 已注入的卡片直接 `return` → 狀態永遠停在注入當下
- [ ] 點擊處理器沒有 `if (wrap.classList.contains('active')) return` → 連點會開兩條下載
- [ ] 狀態清除寫 `''` 而不是 `delete` → localStorage 留下一堆空字串鍵
