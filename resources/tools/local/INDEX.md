# Local — 本專案限定工具

## 檔案

| 檔案 | 說明 | 相依 |
|------|------|------|
| `tray.py` | 系統托盤管理器 — PID 鎖、mtime 偵測、自動重載 | → server.py, server_config.json |
| `server.py` | Flask server — API 端點、dashboard、task runner | ← tray.py, send_cmd.py, loader-core.js, agent/core.js |
| `send_cmd.py` | CLI helper — UTF-8 安全的指令發送工具 | → server.py |
| `loader-core.js` | Loader 核心 — 由 server serve，Tampermonkey 載入 | → server.py, agent/core.js |

## 相依關係

```
tray.py ──管理──→ server.py ←──呼叫── send_cmd.py
                   ↑
loader-core.js ─拉取─┘
agent/core.js ─輪詢─┘
```

## 啟動

```bat
run.bat                              # 根目錄懶人包
python resources\tools\local\tray.py # 直接啟動
```
