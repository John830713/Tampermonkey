# Browser Automation

瀏覽器操作的完整指南。Server (`localhost:8921`) 與 Tampermonkey core.js 協作。

## 系統架構

```
User → Agent (this) → POST /command → Flask Server → GET /poll ← core.js (browser)
                                  ← POST /poll (result) ←
```

core.js 在每個頁面載入時自動執行，輪询 server 等待指令。

## 發送指令的兩種方式

### 1. 直接指令（`/command`）

```bash
POST http://localhost:8921/command
Content-Type: application/json

{"cmd": "navigate", "url": "https://example.com"}
```

下一個 poll 的 session 會收到。無 session 則卡在 queue。

### 2. Task 系統（`/task/<name>`）

```bash
POST http://localhost:8921/task/my_task
```

執行 `tasks/my_task.py` 裡的 generator，自動推送指令並接收結果。

## 可用指令

| 指令 | 參數 | 說明 |
|------|------|------|
| `navigate` | `url` | 導航到 URL（自動推進 generator） |
| `wait` | `ms` | 等待指定毫秒 |
| `find` | `selector`, `text`, `textExact`, `attr`, `attrValue`, `tag`, `visible` | 查找元素 |
| `find_and_click` | `selector`, `text`, ... `index` | 查找並點擊 |
| `click` | `index` (預設 0) | 點擊 `foundElements[index]` |
| `type` | `text`, `index` (預設 0) | 對 `foundElements[index]` 輸入文字 |
| `eval` | `code` | 在頁面執行 JS，回傳結果 |
| `get_text` | `index` / `selector` | 取得元素文字 |
| `get_attr` | `name`, `index` | 取得元素屬性 |
| `scroll_into_view` | `index` (預設 0) | 滾動到元素 |
| `highlight` | `index` (預設 0) | 紅框標記元素 |
| `exists` | `selector` / `text` | 檢查元素是否存在 |
| `count` | `selector` | 計算符合選擇器的元素數量 |
| `wait_for` | `selector`, `timeout` | 等待元素出現 |
| `ping` | — | 測試連線（回傳 PONG） |

## Session 管理

- 每個頁面載入 = 一個新 session，有唯一 ID
- `/status` 顯示所有活躍 session
- **navigate 會重載頁面** → 舊 session 失效，新 session 產生
- 只有 `tracking: false` 的 session 能接收 task 指令

## 常用 Workflow

### 操作單一頁面

```
1. POST /command → {"cmd": "navigate", "url": "..."}
2. 等待 session 出現在 /status
3. POST /command → {"cmd": "eval", "code": "...", "_session": "session_id"}
4. GET /reports → 拿結果
```

### 用 Task 自動化

```
1. 寫 tasks/my_task.py（generator pattern）
2. POST /task/my_task
3. Server 自動推送指令，generator 自動推進
4. /status 看 task 結果
```

## Server Debug via Eval

在 Agent 模式下，透過 eval 指令在瀏覽器執行 JS 來 debug。

### 正確流程

```
1. GET /status → 找到目標 URL 的 session ID（非 tracking）
2. POST /command → {"cmd":"eval","code":"...","_session":"<id>"}
3. 等 5-10 秒（瀏覽器下次 poll 時拿到指令並執行）
4. GET /reports?limit=1 → 拿到 eval 結果
```

### 常見錯誤

**不要手動 POST /poll** — 這會把 command 從 queue 拿出來交給你，而不是等瀏覽器執行。Poll 是給 core.js（瀏覽器端）用的，不是給 Agent 用的。

**PowerShell 用 `curl.exe`** — `curl` 是 `Invoke-WebRequest` 的 alias，參數不相容。

```powershell
# 錯
curl -s localhost:8921/status

# 對
curl.exe -s localhost:8921/status
```

### 找 Session

`GET /status` 回傳所有 session。找 `url` 匹配目標頁面、`tracking: false` 的 session：

```bash
curl.exe -s localhost:8921/status | python -c "import sys,json; d=json.load(sys.stdin); [print(k,s['url'][:50]) for k,s in d['sessions'].items() if 'hanime' in s['url'] and not s.get('tracking')]"
```

## 關鍵限制

- **指令序列化**：下一個 yield 要等前一個 report 回來
- **eval limit**：預設 2000 chars，可調
- **tracking filter**：廣告/追蹤網域的 session 不接收指令
- **navigate 後 session 重置**：確認 /status 有新 session 再發指令
