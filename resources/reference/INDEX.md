# Reference — 設計參考

Tampermonkey 腳本的 UI 設計慣例與可重複使用的 pattern。

## 適用場景

- 新增腳本時先讀 `spec.md`，複用現有 pattern
- 設計 overlay 按鈕、進度條、狀態提示
- 統一樣式規範（顏色、字體、間距）
- 參考跨腳本重複代碼表，避免重造輪子

## spec.md 內容索引

| 章節 | 內容 |
|------|------|
| 模組架構 | loader → core → module 執行流程 |
| 腳本間重複代碼 | 頁面指示器、無限滾動、下載流程的共用 pattern |
| 無限滾動 | 觸發條件、雙向、狀態顯示、rate limiting |
| 跳頁器 | ⇤‹›⇥ 元件結構、disabled 邏輯 |
| Overlay 按鈕 / 進度條 | 樣式基準、進度文字格式 |
| 通用 CSS 規範 | 顏色、字體、圓角統一值 |
| DOM 建構慣例 | createElement vs innerHTML、CSP 安全 |
| MutationObserver vs setInterval | 選擇指南 |
| Popup / Modal 模式 | popup 切換、modal 覆蓋層 |
| GM_xmlhttpRequest 節流 | queue 模式 vs throttle 模式 |
| 伺服器通訊 | SERVER 常量、端點角色表 |

## 參考來源

- `nhentai-dynamic-layout.js` — 無限滾動 + 跳頁器 + 欄位控制 + tag popup
- `rule34-gallery.js` — 雙向無限滾動 + throttle + sidebar drawer
- `anime1-infinite-scroll.js` — API 驅動無限滾動 + 跳頁器 + 下載流程
- `hanime-downloader.js` — overlay 下載 + 進度條 + 狀態追蹤
- `web-element-inspector.js` — DOM inspector + popup/panel 模式
- `exhentai-layout.js` — MutationObserver + 欄位控制
- `universal.loader.user.js` — 模組架構 + Function sandbox
- `setup-checklist.md` — 新機台建置步驟（Python、Node.js、Flask、Git）
