# Module Architecture

## 架構

```
universal.loader.user.js   (Tampermonkey，每頁執行)
    ├── GET /agent/core.js  → Function() sandbox 執行
    ├── GET /modules        → match URL patterns
    │       └── GET /serve/<module>.js → Function() sandbox 執行
    └── buildTogglePanel()  → ⚙ 按鈕 + localStorage overrides
```

- Loader 用 `new Function()` 建沙箱，傳入所有 GM_* API
- `modules.json` 是 JSON **array**（非 keyed object），每筆含 `name`、`enabled`、`match`、`script`、`grants`
- `core.js` 讀 `window.__agent_server`（由 loader 設定），port 改兩處：loader + server 啟動參數
- 所有與本地 server 通訊的腳本共用 `const SERVER = window.__agent_server || 'http://localhost:8921';`

## 腳本間重複代碼

| Pattern | 涉及檔案 | 備註 |
|---------|---------|------|
| 頁面指示器 ⇤‹›⇥ | anime1、nhentai、rule34 | 結構幾乎相同，可抽成共用模組 |
| 雙向無限滾動 | anime1、rule34 | isLoading 閾值守衛 + scroll position preservation |
| 下載流程（fetch→regex→GM_download） | anime1、hanime | 同一套 onprogress/onload/onerror |
| `standalone` vs `core` | ~~standalone~~（已刪除）、core.js | 歷史上 ~85% 重複，core 多了 console hook + dump 命令 |
| 客製下拉 combobox（搜尋 + Enter 新增 + x 刪除） | wistron-overtime | `makeDropdown`，見 `reference/common/combobox.md` |
| GM 清單 CRUD + JSON 匯入匯出 | wistron-overtime | `getList/setList`、`exportJSON/importJSON`（含 history） |
| 可拖曳浮動元素 + 狀態 toast | wistron-overtime | 見 `reference/common/floating-panel.md` |

新增腳本時，優先從上述檔案複製對應段落。
