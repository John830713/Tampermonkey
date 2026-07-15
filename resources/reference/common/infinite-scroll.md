# Infinite Scroll

## 觸發條件（固定 pattern，直接複製）

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

## 雙向無限滾動（Rule34 pattern）

- 上方：`y <= 200` 時載入上一頁
- 下方：`y >= dh - vh - 400` 時載入下一頁
- 載入上頁後需 `window.scrollTo(0, oldScrollY + addedH)` 保持閱讀位置
- 用 `loadedPids` Set 防止重複載入
- `consecutiveFailures >= MAX_FAILURES` 時停止嘗試
- 結束時顯示 `— 已達最後一頁 —`

## 載入狀態顯示

```javascript
// 載入中
addInfiniteStatus('載入中...');

// 完成後
addInfiniteStatus('已載入 ' + currentPage + ' / ' + numPages + ' 頁');

// 無更多
addInfiniteStatus('— 已無更多內容 —');
```
