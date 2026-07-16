# Floating Panel

## 遮擋問題

浮動面板會擋住頁面右側內容（或左側），必須提供左右切換：
- 預設右側，面板內放切換按鈕（◀/▶）
- 切換時 border、shadow 方向跟著翻
- 不需存 localStorage — 每次載入預設右邊

## 按鈕設計

- 面板操作按鈕統一放在面板內，不用獨立浮動按鈕分散注意力
- 按鈕要直觀可辨識：文字或圖示 + hover tooltip
- 事件綁定在 `appendChild` 之後、任何可能 throw 的邏輯之前
- 參考：`debug-toolkit.js` 的 Inspector 功能（面板、標記、傳送）
