# Local — 本專案限定工具

> 伺服器已遷移：Flask 版 `server.py` / `tray.py` / `loader-core.js` / `run.bat` /
> `server_config.json` 皆已刪除。HTTP 服務改由 `D:\Project\Project.exe` 的 WebAgent
> 模組提供（`D:\Project\Modules\WebAgent`）。

## 檔案

| 檔案 | 說明 | 相依 |
|------|------|------|
| `send_cmd.py` | CLI helper — UTF-8 安全的指令發送工具 | → `D:\Project\Project.exe` (WebAgent, port 8921) |
| `benchmarks/` | Python server 時期的效能基準（歷史資料，僅供參考） | — |

## 相依關係

```
send_cmd.py ──HTTP──→ Project.exe (Modules/WebAgent) ←──輪詢── agent/core.js
```

## 啟動

```bat
D:\Project\Project.exe    REM WebAgent 模組自動監聽 0.0.0.0:8921
```

設定：`D:\Project\Config\Config_WebAgent.ini`（`Enabled`、`Port`、`BindHost`、`ResourceRoot`）。
