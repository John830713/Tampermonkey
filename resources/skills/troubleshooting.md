# Troubleshooting

常見問題排查。

## UI 元素出現但沒反應

**徵兆：** 按鈕看得到，點了沒反應

**原因：** 建立 DOM 和綁定 event handler 之間程式碼崩潰，handler 沒綁到

**排查：**
1. 開瀏覽器 Console（F12）看 error
2. 找到崩潰的行號
3. 確認 event handler 是否在 DOM 建立後立刻綁定

**修法：** 把 `addEventListener` 移到 `appendChild` 之後立刻執行，不要放在其他邏輯之後。

## Trusted Types CSP 錯誤

**徵兆：** Console 出現 `This document requires 'TrustedHTML' assignment` 或 `TrustedScript`

**原因：** 網站啟用了 `require-trusted-types-for 'script'` CSP

**修法：**
- `innerHTML = string` → 改用 `createElement` + `textContent`
- `new Function(string)` → metadata 加 `@grant unsafeEval`

**影響範圍：** Google 系網站、部分安全性高的網站

## Session 沒出現

**徵兆：** `/status` 看不到目標頁面的 session

**原因：**
1. core.js 載入失敗（CSP 擋了 eval → 加 `@grant unsafeEval`）
2. `/hello` 請求失敗（server 沒跑、port 不對）
3. 頁面是 tracking 網域（被過濾掉）

**排查：**
1. 確認 server 在跑：`curl http://localhost:8921/status`
2. 開頁面 Console 看有沒有 `[WebAgent]` 日誌
3. 檢查 `/status` 的 sessions 列表

## Command 卡在 Queue

**徵兆：** POST `/command` 回傳 `queue_size: 1` 但一直不消化

**原因：** 沒有 session 在 poll（core.js 沒跑、頁面没開、session 是 tracking）

**修法：**
1. 確認目標頁面有活躍 session
2. 如果沒有，先導航到該頁面等 session 出現
3. 再發送 command

## eval 超過字數限制

**徵兆：** eval 結果被截斷或回傳 error

**原因：** 預設 eval limit 2000 chars

**修法：** 發送 `{"cmd": "set_config", "key": "evalLimit", "value": 8000}`

## Module 不載入

**徵兆：** 某個網站的 module 沒有自動載入

**原因：**
1. `modules.json` 的 `match` pattern 不符
2. Module 被 disable（`enabled: false`）
3. Module 的 JS 有語法錯誤

**排查：**
1. 開 Console 看 `[UniversalLoader]` 日誌
2. 確認 `match` pattern 是否匹配當前 URL
3. 檢查 `modules.json` 設定
