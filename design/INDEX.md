# design

用途：Tampermonkey 腳本的 UI 設計慣例與可重複使用的 pattern。

## 適用場景

- 新增列表頁腳本（無限滾動、跳頁器）
- 設計 overlay 按鈕、進度條、狀態提示
- 統一樣式規範（顏色、字體、間距）

## 參考來源

- `nhentai-dynamic-layout.js` — 無限滾動 + 跳頁器 + 欄位控制
- `rule34-gallery.js` — 雙向無限滾動（上下頁）+ throttle
- `anime1-infinite-scroll.js` — API 驅動的無限滾動 + 跳頁器
