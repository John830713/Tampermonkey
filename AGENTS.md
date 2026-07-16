# Tampermonkey Userscripts + Web Agent

Two halves in one repo: Tampermonkey userscripts + browser-agent framework with a Python Flask server. **No build, no tests, no lint, no typecheck.** Requires Python 3.8+ and Flask (`pip install flask pystray Pillow`).

---

## 語言慣例

- 對用戶的結論/摘要：**繁體中文**
- 推理過程、程式碼、註解：**英文**

---

## 安全規則

- **不要改 `.opencode/`** — 基礎設施檔案；改壞會讓 opencode 無法載入。
- **還原檔案前先 `git stash` 或 `git commit`**，不要直接覆蓋未提交的工作。
- **Task runner 是 single-task：** 開新任務會中止當前任務（`/task/<name>`）。
- **不要 `taskkill /F /IM python.exe`** — 會殺掉所有 Python 行程。改成：
  1. 讀 `.agent/server/agent.pid` 取得 tray PID
  2. `Get-Process -Id <pid>` 確認是我們的
  3. `curl localhost:8921/hello` 確認 server 活著
  4. 只殺那個特定 PID

## Git 流程

**改完檔案立刻 commit，不要等用戶說「commit」。** 跨次 batch 提交也不行。

1. `git diff` 確認所有改動完整
2. `git add` + `git commit`（不同功能分開 commit）
3. **不要 `push`** — 除非用戶明確說「push」

## `.agent/` 暫存目錄

所有 agent 產生的暫存檔都放 `.agent/`，**不要寫到專案根目錄**。

| 類型 | 路徑 | 用途 |
|------|------|------|
| 瀏覽器資料 | `.agent/browser/` | WAI 元素傾印、截圖、隱藏選擇器 |
| Server 輸出 | `.agent/server/` | `server_log.txt`、`agent.pid` |
| Agent 暫存 | `.agent/agent/` | Eval 請求 JSON、暫存檔 |
| Session 日誌 | `.agent/LOGS/` | 每日摘要（`YYYY-MM-DD.md`） |
| 任務 | `.agent/TASKS/` | Standing、Adhoc、Scheduled |
| 成果 | `.agent/RESULTS/` | 已完成任務輸出 |
| 垃圾 | `.agent/trash/` | 準備刪除（可還原） |

`element_dump.json` 和 `hidden_selectors.json` 在 `.agent/browser/`。

**Index 鏈：** 改 `.agent/` 路徑時先讀 `.agent/INDEX.md`。改完順便 grep `*.md` 和 `*.py` 修過期的引用。

Session 結束時清空 `.agent/agent/`。

## 開發命令

```bash
python resources\tools\local\tray.py          # 預設 port 8921
python resources\tools\local\tray.py 9999     # 自訂 port
run.bat                                       # 依 server_config.json 選 console/headless
```

Server 程式：`resources/tools/local/server.py`。

- `server.py` 變更 → tray 自動重啟 server（依 mtime 偵測）
- `agent/core.js` 變更 → 重整瀏覽器頁面即可（universal loader 每次載入都抓最新版）
- `modules.json` 變更 → agent 每 60 秒 polling 檢查一次，變更自動觸發頁面重整

**改 port：** 需要改**三個地方**（`server_config.json`、`agent/universal.loader.user.js:26` 的 `SERVER_PORT`、`resources/tools/local/send_cmd.py:44`）。`core.js` 從 loader 設的 `window.__agent_server` 讀取 port。

## 模組系統

`modules/modules.json` 是 **JSON array**。每筆格式：

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | 是 | 模組名稱 |
| `enabled` | 是 | 是否自動載入 |
| `match` | 是 | URL 匹配 pattern 陣列 |
| `script` | 是 | `modules/` 下的檔案名稱 |
| `grants` | 是 | GM API 權限列表 |
| `hidden` | 否 | `true` = 載入但不顯示在開關面板（如 WAI、debug-toolkit） |
| `connect` | 否 | 額外的 GM_xmlhttpRequest 網域 |
| `allFrames` | 否 | 是否注入 iframe |
| `runAt` | 否 | 執行時機 |

新增腳本流程：`modules/` 加 `.js` + `modules.json` 加一筆 → 重整頁面即可。開關面板（⚙ 按鈕）的 per-site 覆蓋存於 `localStorage('a1_mod_overrides')`。

## Tampermonkey 腳本慣例

- **DOM：** 全部用 `createElement` + `textContent`，不用 `innerHTML`（Trusted Types CSP 會擋）
- **Event handler：** 建立元素後**立刻**綁定，不要放在其他邏輯之後
- **`eval()` / `new Function()`：** metadata 必須加 `@grant unsafeEval`
- **UI 注入邏輯必須在腳本本體內**，不能從 server 動態載入（Trusted Types 限制）
- **Debug 流程：** UI 出現但沒反應 → 先看 console errors → 再看 elements panel → 最後才考慮事件攔截
- **下載檔案：** `GM_xmlhttpRequest` blob + `<a>.click()` 無效，改用 `GM_download`

## Server 互動注意事項

- **Batch eval：** 多個檢查包在同一次 eval，一次 poll 取得所有結果。不要序列化輪詢。
- **eval 長度限制：** 預設 2000 字元，可用 `{"cmd":"set_config","key":"evalLimit","value":8000}` 加大
- **`navigate` 會殺 session：** 頁面重整後產生新 session，需要重新註冊。用 `/status` 確認 active session
- **指令序列化：** generator 下一次 `yield` 不會執行，直到當前指令有回報
- **追蹤網域過濾：** `server.py` 會靜態過濾掉廣告/追蹤網域的 session
- **指令格式：** JSON 物件 `{"cmd": "...", ...}`。多指令用 `/commands` 送 JSON 陣列

## Web Element Inspector (WAI)

`web-element-inspector.js`（`hidden: true`，會在所有網站載入）：

- Hover 左邊緣 → 按鈕滑出 → 點擊開啟，或 `Ctrl+Shift+I`
- Hover 預覽元素資訊（tag、id、class、座標、selector）
- Click 標記元素（自動命名元件1、元件2...）
- 按 **📤 Send** → 資料 POST 到 `/dump`，selector 加入 `/hidden`
- 當用戶說「元件1」→ 讀 `.agent/browser/element_dump.json` 確認是哪個元素

## 跨專案參考

- `resources/reference/tampermonkey/` — 腳本設計慣例、GM API pattern、模組架構
- `resources/reference/common/` — 通用 UI pattern（mutation observer、無限滾動、浮動面板等）
- `resources/skills/web-operation.md` — 瀏覽器操作完整指南（用在 agent 情境）
- `resources/skills/task-authoring.md` — Python generator 任務撰寫格式

需要更多資訊時讀 `resources/INDEX.md` 並沿 INDEX 鏈往下追。

`.agent/` 和 `task_results.jsonl` 在 `.gitignore` 裡。
