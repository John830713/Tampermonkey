# Tampermonkey Userscript 專案 — Agent Runtime

## 內容

```
.agent/
├── TASKS/              # 任務管理（Standing / Adhoc / Scheduled）
├── RESULTS/            # 成果存檔
├── LOGS/               # Session 日誌
├── dump/               # WAI 元素標記資料
│   ├── element_dump.json
│   ├── element_dump_screenshot.png
│   └── hidden_selectors.json
├── debug/              # 調試產出
│   └── server_log.txt  # server stdout + tray log（tray.py 產出）
├── eval/               # server eval request JSON
├── scratch/            # 其他暫存
└── trash/              # 準備清除（gitignored，可還原）
```

## 與 mneme 的分工

| 資料 | 存哪裡 |
|------|--------|
| 技術決策、偏好、跨 session 記憶 | mneme |
| Session 活動摘要（下次啟動用） | `.agent/LOGS/` |
| 自動化任務狀態 | `.agent/TASKS/` |
| 操作結果存檔 | `.agent/RESULTS/` |
| 元素標記資料 | `.agent/dump/` |
| Server log | `.agent/debug/` |

## 初始化日期

2026-07-02
