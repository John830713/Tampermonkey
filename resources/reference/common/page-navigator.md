# Page Navigator

## 元件結構

```
⇤ ‹ [X / Y] › ⇥ [頁碼輸入] [跳]
```

- `⇤` first / `‹` prev / `›` next / `⇥` last
- Label: `visiblePage + ' / ' + numPages`
- Input: `type="number" min="1"`
- Jump 按鈕: 點擊或 Enter 觸發

## 核心函數

```javascript
function createPageIndicator() { /* 建立 DOM，綁定事件 */ }
function updatePageIndicator() { /* 更新 label + disabled 狀態 */ }
function goToPage(target) { /* 驗證範圍 → 清空 grid → 請求 → 渲染 → scrollTo(0,0) */ }
function syncPageIndicator() { /* 找最接近 viewport 中心的 item，更新 visiblePage */ }
```

## Disabled 邏輯

- first/prev: `currentPage <= 1` 時 disabled
- next/last: `currentPage >= numPages` 時 disabled
