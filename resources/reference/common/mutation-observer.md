# MutationObserver vs setInterval

## 何時用 MutationObserver

- 需要偵測特定容器的子元素變化（如列表動態載入）
- 只需觀察一次（找到後 disconnect）
- 範例：`exhentai-layout.js` 觀察 `#gdt`、`hanime-downloader.js` 觀察 `body` subtree

## 何時用 setInterval

- 需要定期清理或重試（如隐藏元素、移除廣告）
- 頁面會持續動態新增元素（如 anime1 的 header shrink）
- 範例：`anime1-infinite-scroll.js` 每 500ms 隱藏原表格、`rule34-gallery.js` 每 500ms 修正 inline style

## 預設

- 新增腳本時優先用 `MutationObserver`（效能較好）
- 只在需要「反覆重試」時用 `setInterval`，並加防重複判斷
