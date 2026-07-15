# Shopee 簽到腳本 Debug 紀錄

日期：2026-07-16
狀態：部分完成，簽到 API 仍未被成功攔截

## 原始問題 (shopee-checkin.js v6)

1. `data.code === 2` 被當作「已簽到」處理，實際可能是未登入或其他錯誤 → 按鈕騙「已簽到」
2. 腳本 page load 自動簽到，不需使用者同意
3. localStorage 快取一旦設了就鎖住，下次直接跳過 API

## v7 修正 (modules/shopee-checkin.js)

- 不再自動簽到，改成按鈕觸發（`statusBtn.addEventListener('click', ...)`）
- `data.code === 2` 不再設 localStorage，改顯示「今天已簽過」
- 加了版本檢查（`sp_checkin_version`），升級 v7 時自動清掉 v6 的舊快取
- 加了防重複點擊保護（`classList.contains('done')` 檢查）
- 只有 `data.code === 0` 才設 localStorage + 顯示「已簽到」

## API 測試結果

在 `shopee.tw/shopee-coins` 頁面上透過 eval 測試：

| 測試 | 結果 |
|------|------|
| GET `checkin_new` (同步 XHR) | `status:0` — CORS 擋掉 |
| POST `checkin_new` (空 body) | `{"code":2, "msg":"EOF"}` — API 通了但缺 body |
| POST `checkin_new` (body `{}`) | `{"code":1006, "msg":"cheat request"}` — API 有防作弊機制 |

API 端點：`https://games-dailycheckin.shopee.tw/mkt/coins/api/v2/checkin_new`

## 攔截簽到請求的過程

### 1. shopee-debug.js 的 hook 沒生效

shopee-debug.js hook 了 `window.fetch`，但 universal loader 在 `document-end` 才載入。Shopee 自己的 JS 先跑，把 `window.fetch` 包了一層 MDAP 監控代碼，覆蓋了我們的 hook。

驗證：`window.fetch.toString()` 顯示的是 Shopee 的 `function(r,o){var i=n()...}` 而非我們的 `shouldIntercept`。

### 2. 手動 hook fetch 後點擊簽到按鈕

在頁面上重新 hook `window.fetch`，然後 dispatch click event 到簽到按鈕 `button.iT0yAz`。

抓到 8 個請求，但**都沒有 `checkin_new` API**：

| # | URL | 說明 |
|---|-----|------|
| 0 | `shopee.tw/api/v4/web/subcart` | POST，加密 body，購物車相關 |
| 1 | `dem.shopee.com/dem/entrance/v1/apps/dailycheckin-pc/tags/web-performance/event/json` | POST，前端監控 SDK |
| 2 | `/api/v4/notification/get_activities?limit=5` | GET，通知 |
| 3 | `/api/v4/notification/get_notifications?limit=5` | GET，通知 |
| 4-7 | 重複的 dem / subcart / notification 請求 | 同上 |

### 3. 結論

簽到請求**不是用 `fetch`**，而是用 **`XMLHttpRequest`**。下次需要同時 hook `XMLHttpRequest.prototype.open` / `send` 才能攔到。

## 抓到的關鍵資料

- **CSRF Token**：`X-CSRFToken: d7TUAJZf3SnHxiyT1fKX9jdtauwFFkf1`（從 notification API 請求 header 擷取）
- **User ID**：`35409418`（從 dem.shopee.com 追蹤請求 body 擷取）
- **Session ID**：`1d757c7c85034f3c92e4b56010c2663f`
- **Device ID**：`5869c795f0b842cf2a5b027099fc1cd7`
- **簽到按鈕 selector**：`button.iT0yAz.lWe3F5`
- **按鈕文字**：「完成簽到，即可獲得 0.10 蝦幣！」

## 下一步

1. **Hook XMLHttpRequest** — 在頁面上 override `XML.prototype.open` 和 `XML.prototype.send`，記錄 method、url、headers、body
2. **或搜尋 Shopee JS 原始碼** — 在頁面 scripts 中搜 `checkin`、`coins`、`dailycheckin` 找簽到函數邏輯
3. **等明天簽到額度重置** — 今天的簽到已完成，需要等明天才能再測
4. **注意**：`cheat request` 錯誤代表 API 需要特定的 token 或簽名，不能只靠 cookie 直接 POST

## 相關檔案

- 腳本：`modules/shopee-checkin.js` (v7)
- Debug 工具：`modules/shopee-debug.js` (v2.2)
- 載入器：`agent/universal.loader.user.js`
- Server：`resources/tools/local/server.py`
