# 設計偏好規格

## 無限滾動

### 觸發條件（固定 pattern，直接複製）

```javascript
window.addEventListener('scroll', function() {
    if (isLoading || !hasMore) return;
    var grid = document.querySelector('.gallery-grid'); // 或其他容器
    if (!grid) return;
    var rect = grid.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight + 400) {
        fetchNextPage();
    }
});
```

- 用 `getBoundingClientRect().bottom` 而非 `scrollHeight`，更準確、不受其他元素影響
- 預觸發距離 `400px`，在快到底時提前載入
- Scroll 事件建議 debounce 200ms

### 雙向無限滾動（Rule34 pattern）

- 上方：`y <= 200` 時載入上一頁
- 下方：`y >= dh - vh - 400` 時載入下一頁
- 載入上頁後需 `window.scrollTo(0, oldScrollY + addedH)` 保持閱讀位置
- 用 `loadedPids` Set 防止重複載入
- `consecutiveFailures >= MAX_FAILURES` 時停止嘗試
- 結束時顯示 `— 已達最後一頁 —`

### 載入狀態顯示

```javascript
// 載入中
addInfiniteStatus('載入中...');

// 完成後
addInfiniteStatus('已載入 ' + currentPage + ' / ' + numPages + ' 頁');

// 無更多
addInfiniteStatus('— 已無更多內容 —');
```

### Rate Limiting（所有 API 請求必須使用）

```javascript
var reqQueue = [];
var reqBusy = false;

function nhRequest(opts) {
    reqQueue.push(opts);
    if (!reqBusy) processNext();
}

function processNext() {
    if (reqQueue.length === 0) { reqBusy = false; return; }
    reqBusy = true;
    var opts = reqQueue.shift();
    setTimeout(function() {
        GM_xmlhttpRequest({
            method: opts.method || 'GET',
            url: opts.url,
            onload: function(r) { opts.onload(r); reqBusy = false; processNext(); },
            onerror: function(e) { if (opts.onerror) opts.onerror(e); reqBusy = false; processNext(); },
            ontimeout: function() { if (opts.ontimeout) opts.ontimeout(); reqBusy = false; processNext(); }
        });
    }, 800); // 800ms 間隔，避免 Cloudflare 429
}
```

## 跳頁器（nhentai pattern）

### 元件結構

```
⇤ ‹ [X / Y] › ⇥ [頁碼輸入] [跳]
```

- `⇤` first / `‹` prev / `›` next / `⇥` last
- Label: `visiblePage + ' / ' + numPages`
- Input: `type="number" min="1"`
- Jump 按鈕: 點擊或 Enter 觸發

### 核心函數

```javascript
function createPageIndicator() { /* 建立 DOM，綁定事件 */ }
function updatePageIndicator() { /* 更新 label + disabled 狀態 */ }
function goToPage(target) { /* 驗證範圍 → 清空 grid → 請求 → 渲染 → scrollTo(0,0) */ }
function syncPageIndicator() { /* 找最接近 viewport 中心的 item，更新 visiblePage */ }
```

### Disabled 邏輯

- first/prev: `currentPage <= 1` 時 disabled
- next/last: `currentPage >= numPages` 時 disabled

## Overlay 按鈕

### 位置

- 縮圖 overlay: 底部全寬，hover 顯示
- 固定按鈕: 右上角或右下角

### 樣式基準

```css
.dl-overlay-btn {
    width: 100%;
    padding: 5px 0;
    background: rgba(255, 152, 0, 0.9); /* 橙色 */
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    border: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
}
```

## 進度條

### 樣式基準

```css
.dl-progress-outer {
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 0 0 4px 4px;
    overflow: hidden;
}
.dl-progress-inner {
    width: 0%;
    height: 100%;
    background: #4caf50; /* 綠色 */
    transition: width 0.1s linear;
}
```

### 進度文字格式

```
45.3% (120.5 / 266.0 MB)
```

## 下載狀態追蹤

### 儲存方式

- 用 localStorage 記錄下載狀態
- Key: `hanime_dl_status`
- 結構：`{ [videoId]: 'done' | 'fail:error message' }`

### 頁面載入時顯示

- 讀 localStorage 判斷每個影片的狀態
- 成功：綠色 badge (✓) + 按鈕顯示 "Downloaded"
- 失敗：紅色 badge (✗) + 按鈕顯示 "Failed"，hover 時 title 顯示錯誤原因
- 未下載：橙色按鈕顯示 "Download"

### 狀態更新時機

- 下載完成/失敗後立即寫入 localStorage
- 畫面不需重載，DOM 即時更新 badge + 按鈕樣式

## 通用 CSS 規範

| 屬性 | 值 | 說明 |
|------|-----|------|
| border-radius | `4px` | 所有圓角統一 |
| font-size | `12px` | UI 元素標準字體 |
| overlay 背景 | `rgba(30, 30, 35, 0.9)` | 深色半透明 |
| 主要按鈕 | `#ff9800` | 橙色系 |
| 成功/進度 | `#4caf50` | 綠色 |
| 錯誤/關閉 | `#c0392b` | 紅色 |
| 文字 | `#eee` (深底) / `#222` (淺底) | |
