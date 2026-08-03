# Combobox（搜尋 + 新增下拉）

可搜尋、Enter 新增、選項旁 x 刪除的自訂下拉。整合「輸入列」進下拉清單本身，避免獨立新增列被下拉清單盒蓋住。

## 結構

```
toggle (button，顯示目前選值)
listBox
 ├─ addRow   搜尋/新增輸入列（固定上方，不隨選項捲動）
 │   ├─ input  (flex:1)
 │   └─ ＋ button
 └─ optBox   選項區（max-height + overflow-y:auto，render 時重建）
```

## 行為

- 開啟（點 toggle）→ 清空 input、focus、顯示全部選項
- 打字 → 即時過濾（大小寫不敏感 substring）；無匹配時顯示「按 Enter 新增「xxx」」提示（可點）
- Enter → 新增並選中、清單保持開啟（方便連續新增）、清單重新渲染
- 點選項 → 選中並關閉；選項旁 `x` → 刪除（至少保留一筆）
- 點 input 或清單內 → 不會觸發 document 的點外關閉

## 搜尋紀錄區塊（選配，histKey）

`makeDropdown(placeholder, inputPlaceholder, histKey)` 第三參數傳 GM key 即啟用歷史：

- 渲染順序：`最近搜尋` header → 歷史列（黃底 `#fffbe6`、nowrap + ellipsis）→ `選項` header → 選項列
- 歷史與選項各自過濾同一輸入；僅單一列表時不顯示 header
- 歷史列 `x` → 只刪該筆歷史（不影響選項），`deleteSearch` + 立即 `render()`
- 點歷史列 → 回填 input（`input.value = text`）並重新 render，不選中不關閉
- Enter 新增時同步 `recordSearch`（最新的排最前）；`HIST_SHOW`（顯示前 N 筆）+ `HIST_LIMIT`（保存上限）可調
- helper：`getSearchHist/saveSearchHist/recordSearch/deleteSearch`，見 `modules/wistron-overtime.js`

## 注意事項（坑）

- **input 必須放在可捲動的 optBox 之外**（獨立 addRow）— render 用 `textContent = ''` 重建 optBox 會毀掉 input
- 過濾比對用 `toLowerCase()`，兩邊都要轉，否則大寫選項搜不到
- 新增後 `setOptions` 要 re-render（input 已清空 → 回到全清單、新值高亮）；input 清空要在 setOptions 之前
- Enter 要 `preventDefault`（避免送出頁面表單）；Escape 可關閉
- root 上加 `stopPropagation` 的 click，否則點 input 會讓 document 的「點外關閉」handler 關掉清單
- 重複值：只選中不重複加（`addToList` 檢查 `indexOf`）；空白：toast 提示不新增
- 完整範例：`modules/wistron-overtime.js` 的 `makeDropdown`
