# Tampermonkey Coding Rules

## DOM 操作

- **全部用 `document.createElement`**，不用 `innerHTML`（防 CSP / TrustedHTML 問題）
- 複雜 HTML 用 template literal 建好再用 `appendChild` 組裝
- 批次插入用 `DocumentFragment`
- 需要強制樣式時用 `element.style.setProperty(prop, val, 'important')`

### 適用場景

| 場景 | 方法 |
|------|------|
| 生成 UI 元件（按鈕、面板、popup） | `createElement` + `textContent` |
| 需要解析外部 HTML（API 回傳） | `DOMParser` + `querySelector` |
| 批次插入大量子元素 | `DocumentFragment` |
| 設定 CSS | `GM_addStyle`（全域）或 `style.setProperty`（個別） |

### 禁止

- `element.innerHTML = '...'` — CSP 頁面會被 block
- 用戶輸入直接插入 DOM — 用 `textContent`

## Event Handler 綁定

建立 DOM 元素後**立刻**綁事件，不要放在其他邏輯之後。確保即使後續程式碼崩潰，UI 仍然可互動。

## Eval / 動態執行

需要 `eval()` 或 `new Function()` 時，metadata 必須加 `@grant unsafeEval`。

## Trusted Types + `new Function()` 限制

Google 等嚴格 CSP 頁面啟用了 Trusted Types policy，會擋 `new Function()`：
- **在 Tampermonkey 沙箱內原生呼叫** `new Function()` → `@grant unsafeEval` 可以 bypass
- **在 eval 出來的程式碼內呼叫** `new Function()` → Trusted Types 攔截，**無法 bypass**
- `innerHTML` 同理，需用 `textContent` 或 DOM API

**結論：所有 UI 注入邏輯（buildTogglePanel 等）必須在 Tampermonkey 腳本本體內，不能從 server 動態載入。** 可以動態載入的只有 core.js 和模組（它們在沙箱內被 `new Function()` 執行）。

## Debug 流程

UI 元素出現但沒反應 → 先查 console errors → 再查 elements panel → 最後才考慮事件攔截。
