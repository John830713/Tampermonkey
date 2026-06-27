# Tampermonkey Userscript Repo

單一 userscript，無 build / test / lint / npm。

## 專案結構

- `Rule34 圖片排版優化 + 無限滾動.js` — 唯一的 userscript，v3.5.0

## 腳本重點

- **匹配網域**：`rule34.xxx` 的 post list 頁面 + 本機開發用 file:// 路徑
- **授權**：`GM_addStyle`、`GM_xmlhttpRequest`
- **分頁**：每頁 42 張（`PAGE_SIZE = 42`），以 `pid` query 參數驅動
- **無限滾動**：僅在 web 模式啟用（`file://` 時關閉），連續 3 次失敗後停止重試
- **維護迴圈**：`setInterval(..., 500)` 修正 inline style 與窄圖、隱藏頂部元素

## 開發方式

直接編輯 `.js` 檔案後在 Tampermonkey 中重新安裝或同步即可，無需建置步驟。
