# 新機台建置指南

從零開始在新機器上建置 Tampermonkey + Web Agent + OpenCode 環境。每一步都有驗證指令。

---

## 1. Prerequisites

### 1.1 Python 3.8+

```powershell
python --version
# 預期: Python 3.8.x 或更高
```

若沒安裝：
```powershell
winget install Python.Python.3.12
```

### 1.2 pip

```powershell
pip --version
# 預期: pip 24.x.x from ...
```

### 1.3 Flask

```powershell
pip install flask
```

### 1.4 Git

```powershell
git --version
```

### 1.5 Node.js LTS（OpenCode custom tools 需要）

```powershell
node --version
# 預期: v24.x.x 或更高
npm --version
# 預期: v11.x.x 或更高
```

若沒安裝：
```powershell
winget install OpenJS.NodeJS.LTS
```

安裝後**重開終端機**，確認 `node` 和 `npm` 可用。

### 1.6 PowerShell ExecutionPolicy

OpenCode 的 custom tools 用 npm script，PowerShell 預設擋住：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 2. Clone 專案

```powershell
cd D:\
git clone <repo-url> Tampermonkey
cd D:\Tampermonkey
```

確認目錄結構：
```
D:\Tampermonkey\
├── AGENTS.md              # Agent 規則（必讀）
├── README.md              # 專案說明
├── server_config.json     # Server port 設定
├── run.bat                # 一鍵啟動
├── agent/                 # Web Agent 核心
│   ├── core.js
│   └── universal.loader.user.js
├── modules/               # Tampermonkey 腳本
│   ├── modules.json       # 模組設定
│   └── *.js
├── tasks/                 # Server 端任務
├── resources/             # 文件 + 工具
│   ├── tools/
│   │   ├── server.py      # Flask server
│   │   ├── tray.py        # 系統托盤
│   │   └── send_cmd.py    # CLI helper
│   ├── reference/
│   └── skills/
├── .agent/                # Runtime（gitignored）
└── .opencode/             # OpenCode custom tools
    ├── package.json
    ├── tools/
    │   ├── agent.ts       # 10 個 browser agent 工具
    │   └── agent.ts.bak   # 備份
    └── node_modules/      # 依賴（gitignored）
```

---

## 3. Server 啟動

### 3.1 啟動

```powershell
cd D:\Tampermonkey
python resources\tools\tray.py
```

或雙擊 `run.bat`。自訂 port：
```powershell
python resources\tools\tray.py 9999
```

### 3.2 驗證

```powershell
curl.exe -s http://127.0.0.1:8921/status
# 預期: {"last_report":null,"queue_size":0,...}
```

### 3.3 修改 port（可選）

編輯 `server_config.json`：
```json
{"host": "0.0.0.0", "port": 8921}
```

同時修改 `agent/universal.loader.user.js` 第 26 行的 `SERVER_PORT`。

### 3.4 自動重載

修改 `server.py`、`agent/*.js`、`modules/*.js` → tray 自動偵測 mtime → 重啟 server。**不需要手動重啟。**

---

## 4. Tampermonkey 安裝

### 4.1 安裝 Tampermonkey 擴充功能

Chrome / Edge / Firefox 皆可。

### 4.2 安裝 Universal Loader

瀏覽器前往：
```
http://localhost:8921/universal.loader.user.js
```

Tampermonkey 攔截 → 按**安裝**。

安裝一次後，所有 `modules/` 裡的腳本會自動從 server 載入。

### 4.3 驗證

開啟任意網頁（如 `https://www.google.com`），左下角出現 **⚙** 按鈕。點擊開啟模組面板。

---

## 5. OpenCode Custom Tools（Browser Agent 整合）

這是最複雜的部分。嚴格按照步驟操作。

### 5.1 安裝依賴

```powershell
cd D:\Tampermonkey\.opencode
npm install
```

這會安裝 `@opencode-ai/plugin`。opencode 的 Bun 可能出現 WARNING：
```
background dependency install failed ...
```

**這是正常的**。只要 `node_modules/@opencode-ai/plugin` 存在就不影響功能。

驗證安裝：
```powershell
Test-Path "D:\Tampermonkey\.opencode\node_modules\@opencode-ai\plugin"
# 預期: True
```

### 5.2 確認工具檔案

`.opencode/tools/agent.ts` 必須包含：
```typescript
import { tool } from "@opencode-ai/plugin"
import path from "path"
import { execSync } from "child_process"
```

**關鍵規則：**
- `tool()` wrapper 是必要的，不能移除
- `@opencode-ai/plugin` 是必要的，不能移除
- `package.json` 是必要的，不能移除
- 不要用 `Bun.$`（Windows 沒 Bun）
- 零外部依賴，只用 `path` + `child_process`

### 5.3 確認備份

`.opencode/tools/agent.ts.bak` 必須存在，且內容與 `agent.ts` 相同或相近。

若 `.bak` 缺失或過舊：
```powershell
Copy-Item "D:\Tampermonkey\.opencode\tools\agent.ts" "D:\Tampermonkey\.opencode\tools\agent.ts.bak" -Force
```

### 5.4 Server 依賴

Custom tools 透過 `send_cmd.py` 與 server 通訊。確認：
```powershell
Test-Path "D:\Tampermonkey\resources\tools\send_cmd.py"
# 預期: True
```

Server 必須在跑（第 3 步）。

### 5.5 重啟 OpenCode

工具在 opencode 啟動時載入。修改 `agent.ts` 後必須重啟。

### 5.6 驗證工具載入

在 opencode 對話中說：
```
用 agent_status 查 server 狀態
```

預期回應：
```
Server: uptime 123s
Sessions: 0 active / 0 total
Queue: 0 pending
Reports: 0
```

若回應 `undefined` 或無回應，見下方除錯。

---

## 6. 環境變數與路徑

所有路徑假設專案在 `D:\Tampermonkey`。若在其他位置：

1. `server.py` 用 `path.join()` 相對路徑，不需要改
2. `send_cmd.py` 用相對路徑，不需要改
3. `agent.ts` 中 `SERVER = "http://127.0.0.1:8921"` — port 不同要改
4. `agent.ts` 中 `path.join(".", "resources", "tools", "send_cmd.py")` — 相對路徑

---

## 7. 完整驗證清單

```powershell
# 1. Python + Flask
python -c "import flask; print(flask.__version__)"

# 2. Node.js
node --version
npm --version

# 3. Server
curl.exe -s http://127.0.0.1:8921/status

# 4. OpenCode tools 依賴
Test-Path "D:\Tampermonkey\.opencode\node_modules\@opencode-ai\plugin"

# 5. send_cmd.py
Test-Path "D:\Tampermonkey\resources\tools\send_cmd.py"

# 6. agent.ts 有 tool() wrapper
Select-String -Path "D:\Tampermonkey\.opencode\tools\agent.ts" -Pattern 'import.*tool.*from.*@opencode-ai/plugin'
```

全部通過 → 在 opencode 中測試 `agent_status`。

---

## 8. 常見問題

| 症狀 | 原因 | 解決 |
|------|------|------|
| `agent_status` 回 undefined | Server 沒跑 或 field mapping 錯誤 | 先 `curl.exe -s http://127.0.0.1:8921/status` 確認 server 在跑 |
| opencode 對話無回應 | tools 載入失敗卡死 | `Rename-Item .opencode\tools .opencode\tools.disabled` → 重啟 |
| `@opencode-ai/plugin@local` 錯誤 | Bun 版本解析 bug（WARNING only） | 確認 `node_modules/@opencode-ai/plugin` 存在即可 |
| `Bun.$` 錯誤 | Windows 沒 Bun | agent.ts 不要用 `Bun.$`，用 `execSync` |
| `tool()` is not defined | import 遺失 | 確認 agent.ts 第 1 行有 `import { tool } from "@opencode-ai/plugin"` |
| PowerShell 擋 npm | ExecutionPolicy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Server port 衝突 | 8921 被佔用 | `netstat -ano | findstr :8921` 找 PID，或改 port |
| `curl` 回 405 | PowerShell `curl` 是 `Invoke-WebRequest` 別名 | 用 `curl.exe` |

---

## 9. 緊急救援

### OpenCode 掛了（工具載入失敗）

```powershell
# 1. 禁用 tools
Rename-Item "D:\Tampermonkey\.opencode\tools" "D:\Tampermonkey\.opencode\tools.disabled"

# 2. 重啟 opencode

# 3. 修好後重新啟用
Rename-Item "D:\Tampermonkey\.opencode\tools.disabled" "D:\Tampermonkey\.opencode\tools"
```

### Agent.ts 壞了

```powershell
# 從備份還原（注意：.bak 可能是舊版，需要確認 tool() wrapper）
Copy-Item "D:\Tampermonkey\.opencode\tools\agent.ts.bak" "D:\Tampermonkey\.opencode\tools\agent.ts" -Force
```

### 完全重來

```powershell
# 刪除 node_modules 重裝
Remove-Item "D:\Tampermonkey\.opencode\node_modules" -Recurse -Force
cd D:\Tampermonkey\.opencode
npm install
```

### Server 起不來

```powershell
# 檢查 port 佔用
netstat -ano | findstr :8921

# 檢查 Python
python -c "import flask; print('OK')"

# 手動啟動看錯誤
python resources\tools\server.py
```

---

## 10. 開發流程

### 修改 server 端（server.py, tasks/*.py）
1. 修改檔案 → tray 自動重載 → 不需要手動操作

### 修改 agent 端（core.js, modules/*.js）
1. 修改檔案 → tray 自動重載 → 瀏覽器刷新頁面

### 修改 OpenCode tools（.opencode/tools/agent.ts）
1. 修改檔案 → **重啟 opencode** → 測試

### 重要規則
- 所有暫存檔案寫到 `.agent/`，禁止寫到專案根目錄
- 修改 `.opencode/` 前先讀 AGENTS.md
- 完成後 commit + 記錄到 `.agent/LOGS/`
