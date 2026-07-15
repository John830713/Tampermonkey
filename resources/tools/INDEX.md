# Tools — 實體工具

系統托盤管理器和 Flask server。

## 內容

| 檔案 | 說明 |
|------|------|
| `tray.py` | 系統托盤管理器 — PID 鎖、mtime 偵測、自動重載 |
| `server.py` | Flask server — API 端點、dashboard、task runner |
| `send_cmd.py` | CLI helper — UTF-8 安全的指令發送工具 |
| `loader-core.js` | Loader 核心 — 由 server serve，Tampermonkey 載入 |
| `server_config.json` | 設定（port） |

## 啟動

```bat
run.bat                        # 根目錄懶人包
python resources\tools\tray.py # 直接啟動
```

## 自動重載

tray.py 每 3 秒 poll server.py 的 mtime。偵測到變更後等 2 秒確認穩定，再 kill + restart subprocess。

## 安全機制

- **PID 檔** (`agent.pid`) — 防止重複啟動
- **Port 檢測** — 啟動前確認 port 未被佔用
- **Process identification** — 透過 PID 檔和 port 確認身份，不使用 `taskkill /F /IM python.exe`
