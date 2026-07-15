# Local — 本專案限定工具

## Server

| 檔案 | 說明 |
|------|------|
| `tray.py` | 系統托盤管理器 — PID 鎖、mtime 偵測、自動重載 |
| `server.py` | Flask server — API 端點、dashboard、task runner |
| `send_cmd.py` | CLI helper — UTF-8 安全的指令發送工具 |
| `loader-core.js` | Loader 核心 — 由 server serve，Tampermonkey 載入 |

## Skills

| Name | 說明 |
|------|------|
| `web-operation.md` | 瀏覽器操作完整指南（指令、session、workflow） |
| `task-authoring.md` | Python generator 任務撰寫格式 |
| `troubleshooting.md` | 常見問題排查（CSP、Session、Queue） |

## Benchmarks

`benchmarks/` — Server-side + Browser-side RTT 測量。

## 啟動

```bat
run.bat                              # 根目錄懶人包
python resources\tools\local\tray.py # 直接啟動
```
