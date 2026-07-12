# 使用範例

## 從 nhentai 腳本複製無限滾動

1. 複製 `addInfiniteStatus()` 函數
2. 複製 `fetchNextPage()` 函數，改 API URL 和渲染邏輯
3. 複製 scroll listener（含 debounce）
4. 複製 `nhRequest()` rate limiting 函數
5. 在 `initInfiniteScroll()` 中初始化

## 從 rule34 腳本複製雙向滾動

1. 複製 `loadPrevPage()` 和 `loadNextPage()`
2. 複製 `syncPageIndicator()` 頁碼同步
3. 加入 `loadedPids` Set 和 `consecutiveFailures` 計數器
4. Scroll listener 中加入上下邊界判斷

## 從 nhentai 腳本複製跳頁器

1. 複製 `createPageIndicator()` DOM 建立
2. 複製 `updatePageIndicator()` 狀態更新
3. 複製 `goToPage()` 頁面跳轉
4. 複製 CSS（`.pi-btn`, `.pi-label`, `.pi-input`, `.pi-jump`）

## 注意事項

- 所有 `GM_xmlhttpRequest` 必須經過 rate limiting queue
- Scroll trigger 用 `getBoundingClientRect().bottom` 而非 `scrollHeight`
- 圓角統一 `4px`、字體 `12px`
- 按鈕色 `#ff9800`、進度條 `#4caf50`
