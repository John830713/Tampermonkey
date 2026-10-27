# Benchmarks

效能測試工具，測量 Server-side + Browser-side RTT。

| 檔案 | 說明 |
|------|------|
| `bench.py` | 主要測試腳本 |
| `compare.py` | 結果比較工具 |

## 相依

→ 已退役的 Flask `server.py`（測試目標）。伺服器改為 `D:\Project\Project.exe` 後，
這些腳本仍可當「協定 RTT 參考」執行，但不再是主要基準。
