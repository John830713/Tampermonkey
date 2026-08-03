# Combobox（文字編輯框 + 歷史/選項下拉）

欄位本身就是 `<input>`：顯示目前值、可直接編輯；聚焦跳出「最近搜尋」＋「選項」下拉，打字即時過濾，Enter 直接導入（無 ＋ 按鈕）。搜尋紀錄與選項合一，最簡模式。

## 結構

```
root (inline-block，寬 260px)
 └─ input   欄位本體（width:100%、box-sizing:border-box、placeholder=欄位名）
listBox（門戶化到 document.body，position:fixed）
 └─ optBox   歷史 + 選項區（max-height + overflow-y:auto，render 時重建）
```

## 行為

- 聚焦 → 顯示全部「最近搜尋」（歷史）+「選項」；欄位值不清空
- 打字 → 即時過濾（大小寫不敏感 substring，兩區各自過濾同一輸入）；無匹配時顯示「按 Enter 新增「xxx」」提示（可點）
- Enter → 以 `input.value` 為值導入（`onAdd(text)` → 外部記錄歷史＋加入選項）並關閉
- 點歷史列/選項列 → 填入欄位值並關閉；歷史列 `x` → 只刪該筆歷史（不影響選項）；選項列 `x` → 刪該選項（可刪空）
- 點 input 或清單內 → 不會觸發 document 的點外關閉；Escape 關閉

## 搜尋紀錄區塊（選配，histKey）

`makeDropdown(placeholder, inputPlaceholder, histKey)` 第三參數傳 GM key 即啟用歷史：

- 渲染順序：`最近搜尋` header → 歷史列（黃底 `#fffbe6`、nowrap + ellipsis）→ `選項` header → 選項列；僅單一列表時不顯示 header
- Enter 導入時同步 `recordSearch`（最新的排最前）；`HIST_SHOW`（顯示前 N 筆）+ `HIST_LIMIT`（保存上限）可調
- `inputPlaceholder` 第二參數變成 hover tooltip（`input.title`，放格式提示）
- helper：`getSearchHist/saveSearchHist/recordSearch/deleteSearch`，見 `modules/wistron-overtime.js`

## 注意事項（坑）

- **render 用獨立的 `query` 變數**（開場清空、input 事件更新），不要直接吃 `input.value`——否則聚焦時會用目前值把列表全過濾掉
- 彈出層必須**門戶化到 `document.body`（position:fixed）**，不能放 panel 內：panel 的 `overflowY:auto` 會裁切、且 z-index 被困在 panel 層疊上下文被同層 fixed 盒蓋住
- 過濾比對用 `toLowerCase()`，兩邊都要轉，否則大寫選項搜不到
- Enter 要 `preventDefault`（避免送出頁面表單）；Escape 可關閉
- root/listBox 上加 `stopPropagation` 的 click，否則點 input 或清單內會讓 document 的「點外關閉」handler 關掉清單
- 重複值：只選中不重複加（`addToList` 檢查 `indexOf`）；空白：toast 提示不新增
- 新增走 `setOnAdd(fn)` 回調（Enter 與提示列點擊共用），不再需要獨立 addBtn / addRow
- 完整範例：`modules/wistron-overtime.js` 的 `makeDropdown`
