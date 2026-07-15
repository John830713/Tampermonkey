# Tools — 工具說明書目錄

AI agent 可自主查閱的工具清單。

## local/ — 本專案限定

瀏覽器操作、任務撰寫、問題排查。見 [local/INDEX.md](local/INDEX.md)。

## common/ — 跨專案通用

UI 設計規範、建置步驟。見 [common/INDEX.md](common/INDEX.md)。

## Server tools

| 檔案 | 說明 |
|------|------|
| `tray.py` | 系統托盤管理器 — PID 鎖、mtime 偵測、自動重載 |
| `server.py` | Flask server — API 端點、dashboard、task runner |
| `send_cmd.py` | CLI helper — UTF-8 安全的指令發送工具 |
| `loader-core.js` | Loader 核心 — 由 server serve，Tampermonkey 載入 |

## 啟動

```bat
run.bat                        # 根目錄懶人包
python resources\tools\tray.py # 直接啟動
```
