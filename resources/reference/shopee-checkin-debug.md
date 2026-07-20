# Shopee 簽到腳本技術紀錄

最後更新：2026-07-17 | 版本：v9.3

## 架構

```
任何蝦皮頁                    靜默分頁 (shopee-coins?ac=1)
┌─────────────────┐          ┌─────────────────────────┐
│ 檢查 localStorage│          │ poll button.iT0yAz      │
│ 已簽到 → 不動作  │          │ btn.click()             │
│ 未簽到 → 3s 後   │─open──▶ │ 存 localStorage         │
│   window.open    │          │ window.close()          │
│                  │◀─storage─│                         │
│ location.reload()│          └─────────────────────────┘
└─────────────────┘

非 coins 頁：依賴 localStorage 快取判斷是否已簽到
coins 頁：跳過 localStorage，直接 poll 原生按鈕（原生按鈕為唯一真實來源）
```

## 版本演進

| 版本 | 簽到方式 | 觸發方式 | 狀態 |
|------|---------|---------|------|
| v5.1 | `btn.click()` 原生按鈕 | 同頁 redirect `/shopee-coins` | ❌ 已棄用 |
| v6.0 | `fetch()` API 直接呼叫 | 頁面載入自動觸發 | ❌ 已棄用 |
| v7.x | `fetch()` API 直接呼叫 | 手動按鈕觸發 | ❌ 已棄用 |
| v8.x | 無簽到功能 | 純文字顯示原生按鈕文字 | ❌ 已棄用 |
| **v9.3** | `btn.click()` 原生按鈕 | 靜默分頁自動觸發，coins 頁跳過 localStorage 快取 | ✅ 現行 |

## Shopee 簽到 API

### 端點

```
POST https://games-dailycheckin.shopee.tw/mkt/coins/api/v2/checkin_new
```

### 請求

| 項目 | 值 |
|------|-----|
| Method | POST |
| Body | 無 |
| Content-Type | `application/json` |
| credentials | `include`（自動帶 cookie） |
| CSRF | 自動從 cookie 帶入 |

### 回應

| code | 含義 | HTTP Status |
|------|------|-------------|
| `0` | 簽到成功 | 200 |
| `2` | 今天已簽過 (EOF) | 400 |
| `1006` | cheat request | 400 |

### 回應範例

```json
{"code": 2, "msg": "EOF", "data": null}
```

## 原生按鈕 (`button.iT0yAz`)

### 屬性

| 項目 | 值 |
|------|-----|
| Selector | `button.iT0yAz.lWe3F5` |
| 存在頁面 | 僅 `shopee.tw/shopee-coins` |
| 載入方式 | 動態載入（React SPA） |
| `data-inactive` | `"true"` = 已簽到 / 活動結束 |

### 按鈕文字狀態

| 文字 | 含義 | `data-inactive` |
|------|------|-----------------|
| `完成簽到，即可獲得 X 蝦幣！` | 可簽到 | 非 `"true"` |
| `明天再回來簽到，可獲得 X 蝦幣！` | 今日已簽到 | `"true"` |

### 程式化點擊可行性

| 觸發方式 | 結果 | 備註 |
|---------|------|------|
| Tampermonkey `element.click()` | ✅ 可行 | 頁面 context 執行 |
| CDP `Input.dispatchMouseEvent` | ❌ 無效 | React `isTrusted` 過濾 |
| `new MouseEvent('click')` + `dispatchEvent` | ❌ 無效 | 合成事件被忽略 |
| `fetch()` 直接呼叫 API | ✅ 可行 | 繞過按鈕，直接打 API |

**結論**：Tampermonkey 腳本在頁面 context 中執行的 `element.click()` 可觸發 React 按鈕。CDP 外部觸發則被 `isTrusted` 機制擋下。

## 關鍵 Session 資料

| 項目 | 值 |
|------|-----|
| User ID | `1308107520` |
| Device ID / SPC_F | `GbxPdmnqn1R75zphBPNoXAiLYdq17qel` |
| SPC_U | `1308107520` |
| CSRF Token | `x6dU5g6m1wPsNJnAmQGwPqI8dYgg8JGi` |

## 技術要點

### 跨分頁通訊

使用 `storage` event：靜默分頁寫入 `localStorage`，原分頁偵測變化後 `location.reload()`。

### 動態元素等待

`button.iT0yAz` 僅在 coins 頁存在，載入時機不固定。使用 `MutationObserver` 監聽 `document.body` 等待出現。

### 靜默分頁控制

- URL 參數 `?ac=1` 辨識自動分頁（不顯示 UI）
- `window.close()` 可關閉 `window.open` 開啟的分頁
- 分頁切換過程中使用者可短暫看到分頁閃現（~1-2 秒），目前可接受

### localStorage 快取一致性

**問題**：localStorage 記錄的簽到狀態可能與原生按鈕實際狀態不同步。原因：
- 靜默分頁執行 `btn.click()` 失敗（如 React 按鈕未載入完成），但 localStorage 已被先前流程寫入
- 跨分頁/跨 session 的快取殘留

**解法**：coins 頁面跳過 localStorage 快取，直接 poll 原生按鈕文字和 `data-inactive` 屬性判斷實際狀態。非 coins 頁面仍依賴 localStorage（無法看到原生按鈕）。

### fetch hook 相關

- Shopee MDAP wrapper 不影響 `window.fetch` hook
- `fetch` + `credentials: 'include'` 可跨子域攜帶 cookie
- HTTP status code 與 API `code` 不同步，以 `code` 為準

## 已知限制

1. 靜默分頁開啟時使用者可見分頁閃現（~1-2 秒）
2. 首次簽到需等待 3 秒延遲（避免 popup blocker）
3. `btn.click()` 依賴原生按鈕存在，若 Shopee 改 CSS class 需同步更新 selector

## 待辦

- [ ] 測試 popup blocker 對 `window.open` 的影響
- [ ] 考慮更精確的按鈕 selector（目前用 class name，可能隨版本變化）

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `modules/shopee-checkin.js` (v9.3) | 簽到腳本 |
| `modules/shopee-debug.js` (v2.2) | API 攔截 + 頁面標記 |
| `resources/reference/shopee-checkin-debug.md` | 本文件 |
