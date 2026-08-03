# Combobox（文字編輯框 + 選項下拉）

欄位本身就是 `<input>`：顯示目前值、可直接編輯；聚焦跳出「選項」下拉，打字即時過濾，Enter 直接導入（無 ＋ 按鈕）。Enter 導入的新值會加入選項，選項即唯一資料源（不再有獨立的搜尋歷史）。

## 結構

```
root (inline-block，寬 260px)
 └─ input   欄位本體（width:100%、box-sizing:border-box、placeholder=欄位名、title=格式提示）
listBox（門戶化到 document.body，position:fixed）
 └─ optBox   選項區（max-height + overflow-y:auto，render 時重建）
```

## 行為

- 聚焦 → 顯示全部選項；欄位值不清空
- 打字 → 即時過濾（大小寫不敏感 substring）；無匹配時顯示「按 Enter 新增「xxx」」提示（可點）
- Enter → 以 `input.value` 為值導入（`onAdd(text)` → 外部加入選項）並關閉
- 點選項列 → 填入欄位值並關閉；選項列 `x` → 刪該選項（可刪空）
- 點 input 或清單內 → 不會觸發 document 的點外關閉；Escape 關閉
- 打字/選中都會觸發 `onChange`（外部即時存 config + 更新預覽）

## 注意事項（坑）

- **render 用獨立的 `query` 變數**（開場清空、input 事件更新），不要直接吃 `input.value`——否則聚焦時會用目前值把列表全過濾掉
- 彈出層必須**門戶化到 `document.body`（position:fixed）**，不能放 panel 內：panel 的 `overflowY:auto` 會裁切、且 z-index 被困在 panel 層疊上下文被同層 fixed 盒蓋住
- 過濾比對用 `toLowerCase()`，兩邊都要轉，否則大寫選項搜不到
- Enter 要 `preventDefault`（避免送出頁面表單）；Escape 可關閉
- root/listBox 上加 `stopPropagation` 的 click，否則點 input 或清單內會讓 document 的「點外關閉」handler 關掉清單
- 重複值：只選中不重複加（`addToList` 檢查 `indexOf`）；空白：toast 提示不新增
- 新增走 `setOnAdd(fn)` 回調（Enter 與提示列點擊共用），不再需要獨立 addBtn / addRow
- 完整範例：`modules/wistron-overtime.js` 的 `makeDropdown`
