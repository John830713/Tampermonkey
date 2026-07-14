# Tampermonkey Userscripts + Web Agent

Two halves in one repo: standalone Tampermonkey userscripts and a browser-agent framework with a Python Flask server. **No build, no tests, no lint, no typecheck.** Requires Python 3.8+ and Flask (`pip install flask`).

---

## 每次 Session 自動匯入

以下內容是每次工作的基礎，不需要特別詢問。

### Safety

- **Before reverting any file:** always `git stash` or `git commit` first. Never overwrite uncommitted work.
- **task runner is single-task:** starting a new task aborts the current one (server.py `/task/<name>` route).
- **NEVER `taskkill /F /IM python.exe`** — this kills ALL Python processes. Instead:
  1. Check `agent.pid` for the tray process PID
  2. Use `Get-Process -Id <pid>` to confirm it's ours
  3. Use `curl localhost:8921/hello` to check if server is alive
  4. Only kill the specific PID if confirmed ours

### Git Commit 流程

修改完成後，按順序執行：

1. **確認改完** — `git diff` 檢查所有改動，確認沒有漏改
2. **分類 commit** — 不同功能/檔案分開 commit（`Split logical changes into separate commits`）
3. **不要手動 push** — 除非用戶明確說「push」或「送」

### 臨時檔案規則

所有 agent 產生的暫存檔案**一律寫到 `.agent/`**，禁止寫到專案根目錄或 C 槔暫存區。

| 類型 | 目錄 | 用途 |
|------|------|------|
| eval 暫存 | `.agent/eval/` | server eval 的 request JSON |
| debug 輸出 | `.agent/debug/` | 調試產出、臨時分析 |
| 其他暫存 | `.agent/scratch/` | 不屬於上面的暫時檔案 |

`element_dump.json` 和 `hidden_selectors.json` 留在 `.agent/` 根目錄（已有慣例）。

**每次 session 結束前**，清理 `.agent/eval/` 和 `.agent/scratch/` 裡的過期檔案。

### Dev Loop

`python resources\tools\tray.py` (port 8921) or `run.bat`. Custom port: `python resources\tools\tray.py 9999`.

Server code lives in `resources/tools/server.py`. Tray auto-restarts on file change — **no manual restart needed**.

Edit files in `agent/` or `modules/` → tray auto-detects → refresh page. Universal loader fetches `core.js` fresh on every page load — **no Tampermonkey reinstall needed** for core changes. `modules.json` is checked every 60s; changes trigger auto-reload.

Port change: edit `server_config.json` + `agent/universal.loader.user.js:26` (`SERVER_PORT`). `core.js` reads port from `window.__agent_server`.

### Modules

`modules/modules.json` is a **JSON array**. Each entry: `name`, `enabled`, `match` (URL patterns), `script`, `grants`. Add `.js` to `modules/` + entry in `modules.json`. Module toggle panel (⚙ button) stores overrides in `localStorage('a1_mod_overrides')`.

### Key Gotchas

- **Tampermonkey sandbox:** `GM_xmlhttpRequest` blob + `<a>.click()` doesn't work for downloads. Use `GM_download`.
- **Server-side 403:** Anime1 video API requires browser cookies — cannot be called from server.
- **Tracking domain filter:** `server.py` silently drops sessions from ad/tracking domains.
- **eval limit:** Default 2000 chars. Configurable via `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **Navigate kills sessions:** After `navigate`, page reloads with new session. Check `/status` for active session.
- **Commands are serialized:** Next `yield` won't execute until current command's report arrives.
- `.agent/` and `task_results.jsonl` are gitignored.

### Tampermonkey 腳本開發原則

**DOM 操作：** 一律用 `createElement` + `textContent`，不要用 `innerHTML`。Trusted Types CSP 會直接擋掉。

**Event Handler 綁定：** 建立 DOM 元素後**立刻**綁事件，不要放在其他邏輯之後。確保即使後續程式碼崩潰，UI 仍然可互動。

**Eval / 動態執行：** 需要 `eval()` 或 `new Function()` 時，metadata 必須加 `@grant unsafeEval`。

**Debug 流程：** UI 元素出現但沒反應 → 先查 console errors → 再查 elements panel → 最後才考慮事件攔截。

### Server 互動效率

**Batch eval：** 一次 eval 放多個偵測，再一次 poll 拿全部結果。不要分次串行。

**Minimal polling：** 只在真正需要結果時才 poll `/reports`。中間狀態不需要反覆 poll。

---

## 使用時查找

需要特定資訊時：
1. **我知道怎麼做** — 直接執行
2. **我知道有工具但需要細節** — 直接讀 `resources/skills/` 或 `resources/reference/`
3. **不確定有沒有** — 先讀 `resources/INDEX.md` 找對應文件

| 需求 | 位置 |
|------|------|
| 新增 Tampermonkey 腳本 | `resources/reference/spec.md` — DOM 建構、CSS 規範、Popup/Modal、Rate Limiting |
| 設計 pattern 參考 | `resources/reference/spec.md` — 無限滾動、跳頁器、Overlay、MutationObserver |
| 瀏覽器操作 | `resources/skills/web-operation.md` — 完整操作流程 |
| Server eval debug | `resources/skills/web-operation.md` § Server Debug via Eval — `curl.exe`、不要手動 poll、正確 eval→report 流程 |
| 撰寫任務 | `resources/skills/task-authoring.md` — Python 任務格式 |
| 問題排查 | `resources/skills/troubleshooting.md` — 常見問題 |
| 新增 server 任務 | `tasks/` 目錄，每個 `.py` 定義 `get_task()` → generator |
| Server API 端點 | `README.md` — API 端點表 |
| 完整架構圖 | `README.md` — 架構段落 |
| Web Element Inspector | 本文件下方「Web Element Inspector」段落 |
| Sync 規範 | `D:\Agent\AGENTS.md` — MD/mneme/git 三層同步原則 |

---

## Web Element Inspector（元件標記工具）

`web-element-inspector.js` 是頁面元素標記工具，hover 預覽、Click 標記。**這是用戶 debug 的核心工具。**

- 標記的元素自動編號為「元件1」「元件2」…
- 標記結果存在 `D:\Tampermonkey\.agent\element_dump.json`
- 當用戶說「元件1」「元件2」時，**必須先讀 `element_dump.json`** 才知道他指的是哪個頁面的哪個元素
- dump 裡每個元素有：`label`、`tag`、`id`、`selector`、`parentChain`、`computed` 樣式等完整資訊

### 工作流程

1. 用戶用 WAI 在瀏覽器標記元素
2. WAI 自動 POST 到 server `/dump` + `/hidden`
3. 標記結果存入 `element_dump.json`
4. 用戶對 agent 說「元件1 有問題」→ agent 讀 dump → 知道是哪個元素 → 排查

---

## Agent 操作模式

用戶要求操作瀏覽器（簽到、爬資料、下載等）時切換到此模式。

### 啟動流程

1. 讀 `.agent/LOGS/` 最新的 log — 取得上次中斷點
2. 讀 `.agent/TASKS/Standing/` — 檢查是否有待執行的 standing task
3. 執行任務
4. 結束時寫 `.agent/LOGS/YYYY-MM-DD.md` — 3-5 行摘要即可

### LOGS 寫法

```markdown
# YYYY-MM-DD

## 做了什麼
- 一兩句描述本次 session 的主要工作

## 關鍵發現
- 值得記住的技術發現或決策（沒有就省略）

## 下次
- 未完成的事或下一步（沒有就省略）
```

### TASKS 結構

- **Standing/** — 長期設定的自動化任務（如蝦皮簽到）。對應 `tasks/*.py`，追蹤啟用狀態和上次執行結果。
- **Adhoc/** — 臨時任務，完成後移至 `RESULTS/`。
- **Scheduled/** — 排程任務，用 `YYYY-MM-DD-NNN` 命名。


