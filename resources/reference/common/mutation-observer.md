# MutationObserver vs setInterval

## 何時用 MutationObserver

- 需要偵測特定容器或整頁的子元素變化（如列表動態載入、無限滾動）
- 回呼要能承受高頻觸發

### 兩種觀察策略

| 策略 | 適用 | 範例 |
|------|------|------|
| 觀察特定容器 + 找到就 `disconnect()` | 一次性注入 | `exhentai-layout.js` 觀察 `#gdt` |
| 觀察 `body` subtree + 持續比對 | 元素會一直被新增/換掉 | `hanime-downloader.js`（縮圖卡片會被無限滾動重建） |

### body subtree 必加節流

`body` subtree 的 mutation 在滾動時每秒數十次，直接在回呼裡掃全頁會卡。用 rAF 合併成「每幀最多一次」：

```javascript
var scheduled = false;
function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() { scheduled = false; scan(); });
}
new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
```

### 自己寫 DOM 也會觸發自己

回呼若每次都重建 badge、或 `textContent = 同樣的字串`（setter 一定會換掉 text node），就會產生新的 mutation → 下一幀又掃 → 無限迴圈，CPU 一直燒但畫面看起來正常。

- 先比對再寫：`if (btn.textContent !== label) btn.textContent = label;`
- 徽章用 class 比對：`if (current && current.className === cls) return;`
- 只觀察 `childList` 時，`style` / `title` / `class` 這類屬性變化不會觸發回呼，可以放心每輪重設

## 何時用 setInterval

- 需要定期清理或重試（如隐藏元素、移除廣告）
- 頁面會持續動態新增元素（如 anime1 的 header shrink）
- 範例：`anime1-infinite-scroll.js` 每 500ms 隱藏原表格、`rule34-gallery.js` 每 500ms 修正 inline style

## 預設

- 新增腳本時優先用 `MutationObserver`（效能較好），必要時配 rAF 節流
- 只在需要「反覆重試」時用 `setInterval`，並加防重複判斷
