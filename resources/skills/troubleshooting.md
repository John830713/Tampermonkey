# Troubleshooting

常見問題排查。

## 排查方法論

**先查自己，再查外部。**

1. `git diff` — 確認自己改了什麼
2. Revert 自己的改動 → 測試 → 如果恢復正常 = 自己搞壞的
3. 確認不是自己的問題後，才開始查外部因素（CSP、第三方腳本等）
4. 問用戶「壞掉的症狀是什麼」，不要假設問題在哪

**常見陷阱：**
- 修 A 問題時順便加了 B 功能，B 的 bug 被當成 A 的問題
- 假設問題在最「複雜」的地方（CSP、 Trusted Types），忽略最簡單的可能（自己的 boot check）
- 改了多個檔案後才發現問題，來不及回退

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

**徵兆：** 某個網站的 module 沒有自動載入。`__agent_session` 存在（universal loader 跑了），但 module 的 DOM 元素不存在。

**原因：**
1. `modules.json` 的 `match` pattern 不符
2. Module 被 disable（`enabled: false`）
3. Module 的 JS 有語法錯誤或 runtime error（**最常見且最難查**）

**確認 module 有沒有載入：**
用 eval 檢查 module 特有的 DOM 元素，例如：
```js
document.body.classList.contains('nh-sticky-nav')  // nhentai module
document.getElementById('nh-infinite-status')       // nhentai module
```
⚠️ `__agent_consoleLogs` **看不到 loader 的錯誤**——loader 在 core.js 設 log capture 之前就跑完了。

**排查：**
1. 確認 module 特有的 DOM 元素存不存在（上面的 eval）
2. 確認 `modules.json` 的 `match` pattern 是否匹配當前 URL（`matchPattern` 用 `*` → `.*` 轉 regex）
3. 用 `git diff` 檢查最近改動有沒有引入語法錯誤
4. 開瀏覽器 F12 Console 看 `[Loader] script exec error:` —— 這是 `executeScript` 的 catch 輸出，只出現在瀏覽器 console，**不會**進入 `__agent_consoleLogs`

**關鍵陷阱：**
`executeScript` 用 `new Function()` 包裝 module code。如果 module 有 parse error（例如壞掉的註解行），`new Function` 會 throw，被 catch 後只寫 `console.error`。**不會有任何 agent 可見的錯誤訊息。** Session 照常 poll，toggle 按鈕照常出現，但 module 的所有功能都不會跑。

**真實案例：** 一行 `} ─────────────────────────────────`（壞掉的 comment separator）導致整支 nhentai module 靜默失敗，debug 方向全錯以為是 URL match 或 loader 問題。
