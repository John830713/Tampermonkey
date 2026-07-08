# Web Agent — Tampermonkey + Python 網頁自動化框架

瀏覽器 agent 腳本輪詢本地 Flask 伺服器，伺服器以 Python generator 驅動任務。  
修改 `agent.core.js` → 重啟 server → 重新整理頁面即生效，不需手動更新 Tampermonkey。

## 需求

- Python 3.8+
- Tampermonkey 擴充功能（Chrome / Edge / Firefox）

## 快速開始

### 1. 啟動伺服器

```bash
python server.py
```

或雙擊 `run_server.bat`。  
伺服器預設跑在 `http://localhost:8921`。

### 2. 安裝 Agent 腳本

開啟瀏覽器，前往：  
`http://localhost:8921/agent.loader.user.js`

Tampermonkey 會攔截並顯示安裝頁 → 按 **安裝**。

### 3. 驗證

打開任一網頁（如 `https://www.google.com`），右下角會出現 **WebAgent** 操作面板。  
確認伺服器狀態：

```
curl http://localhost:8921/status
```

回傳 `sessions` 中有 `agent: "1.2"` 的紀錄即表示成功。

## 架構

```
Tampermonkey (loader)         Flask Server (localhost:8921)
┌─────────────────┐          ┌──────────────────────┐
│ agent.loader     │──GET──▶ │ /agent.core.js       │ 每次載入頁面抓取最新 agent 程式碼
│ .user.js         │◀─JS─── │                      │
│ (安裝一次)       │          ├──────────────────────┤
│                  │──GET──▶ │ /poll?session=...    │ 輪詢等待指令
│                  │◀─cmd── │                      │
│                  │──POST─▶ │ /report              │ 回報執行結果
│                  │          ├──────────────────────┤
│                  │──POST─▶ │ /task/<name>         │ 啟動任務
│                  │          ├──────────────────────┤
│                  │──POST─▶ │ /command             │ 推送單一指令
└─────────────────┘          └──────────────────────┘
                                     │
                              ┌──────┴──────┐
                              │ tasks/*.py  │  Generator 任務
                              └─────────────┘
```

## 指令參考

所有指令由伺服器推送，agent 接收後執行並回報結果。

| 指令 | 參數 | 說明 |
|------|------|------|
| `navigate` | `url` | 導航到 URL（自動推進 generator） |
| `wait` | `ms` | 等待指定毫秒 |
| `find` | `selector`, `text`, `textExact`, `attr`, `attrValue`, `tag`, `visible` | 查找元素，結果存於 `foundElements` |
| `find_and_click` | `selector`, `text`, ... `index` | 查找並點擊 |
| `click` | `index` (預設 0) | 點擊 `foundElements[index]` |
| `type` | `text`, `index` (預設 0) | 對 `foundElements[index]` 輸入文字 |
| `eval` | `code` | 在頁面執行 JS，回傳結果（超過 2000 字元截斷） |
| `get_text` | `index` / `selector` | 取得元素文字 |
| `get_attr` | `name`, `index` | 取得元素屬性 |
| `scroll_into_view` | `index` (預設 0) | 滾動到元素 |
| `highlight` | `index` (預設 0) | 紅框標記元素 |
| `exists` | `selector` / `text` | 檢查元素是否存在 |
| `count` | `selector` | 計算符合選擇器的元素數量 |
| `inject_ui` | — | 重新注入 UI 面板 |
| `ping` | — | 測試連線（回傳 PONG） |
| `set_config` | `key`, `value` | 修改 agent 設定 |

## 撰寫任務

在 `tasks/` 目錄新增 `.py` 檔案，格式如下：

```python
"""任務說明"""

import logging
log = logging.getLogger('task.mytask')

def get_task():
    return _run()

def _run():
    log.info('[mytask] start')

    # yield 指令給瀏覽器，receive 回報結果
    r = yield {'cmd': 'navigate', 'url': 'https://example.com'}
    log.info(f'navigate → {(r or {}).get("result")}')

    r = yield {'cmd': 'wait', 'ms': 2000}

    r = yield {'cmd': 'find', 'selector': 'h1'}
    count = (r or {}).get('extra', {}).get('count', 0)
    log.info(f'found {count} h1 elements')

    if count > 0:
        r = yield {'cmd': 'click'}
        log.info(f'clicked')

    # return 為任務結果
    return {'status': 'ok'}
```

**注意：**
- Generator 每次 `yield` 送出指令，下次 `.send(report)` 收回報結果
- `navigate` 指令自動推進 generator（因為頁面跳轉可能中斷回報）
- 任務完成用 `return`，結果會顯示在 `/status`

### 啟動任務

```bash
# REST API
curl -X POST http://localhost:8921/task/mytask

# 或從瀏覽器打開 http://localhost:8921/dashboard
```

### 手動推送指令

```bash
curl -X POST http://localhost:8921/command \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"eval","code":"document.title"}'
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/status` | 伺服器狀態、session、任務進度 |
| GET | `/tasks` | 列出可用任務 |
| GET | `/reports?limit=N` | 最近 N 筆回報 |
| POST | `/hello` | Session 註冊（agent 自動呼叫） |
| GET | `/poll?session=&state=&url=&title=` | Agent 輪詢（agent 自動呼叫） |
| POST | `/report` | Agent 回報（agent 自動呼叫） |
| POST | `/task/<name>` | 啟動任務 |
| POST | `/task/stop` | 停止目前任務 |
| POST | `/command` | 推送單一指令 |
| POST | `/commands` | 推送多個指令（JSON 陣列） |
| GET | `/agent.loader.user.js` | 下載 loader 腳本（安裝用） |
| GET | `/agent.core.js` | Agent 核心程式碼（每次頁面載入抓取） |
| GET | `/agent.user.js` | 獨立版腳本（不含 loader） |
| GET | `/serve/<name>.user.js` | 通用腳本 serve |

## 自動更新機制

修改 `agent.core.js` → 重啟伺服器 → 重新整理頁面：  
Loader 每次載入頁面會從 `/agent.core.js?t={timestamp}` 抓取最新版本，不需手動更新 Tampermonkey。

## 目錄結構

```
D:\Tampermonkey\
├── agent.loader.user.js    # 安裝一次，自動載入最新 core
├── agent.core.js           # Agent 邏輯（每次重整抓取）
├── agent.user.js           # 獨立版（不需 loader）
├── server.py               # Flask 伺服器
├── run_server.bat          # 一鍵啟動
├── tasks/                  # 任務模組
│   ├── __init__.py
│   ├── google_test.py
│   └── shopee_checkin.py
├── *.user.js               # 其他獨立腳本（可選）
└── README.md
```
