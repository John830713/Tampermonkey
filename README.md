# Web Agent — Tampermonkey + Python 網頁自動化框架

瀏覽器 agent 腳本輪詢本地 Flask 伺服器，伺服器以 Python generator 驅動任務。  
修改 `agent/core.js` → 重啟 server → 重新整理頁面即生效，不需手動更新 Tampermonkey。

## 需求

- Python 3.8+
- Tampermonkey 擴充功能（Chrome / Edge / Firefox）

## 快速開始

### 1. 啟動伺服器

```bash
python resources\tools\tray.py
```

或雙擊 `run.bat`。  
伺服器預設跑在 `http://localhost:8921`。Tray 會在右下角顯示圖示，自動管理 server subprocess。

### 2. 安裝 Universal Loader

開啟瀏覽器，前往：  
`http://localhost:8921/universal.loader.user.js`

Tampermonkey 會攔截並顯示安裝頁 → 按 **安裝**。  
安裝一次後，所有 `modules/` 裡的腳本會自動從 server 載入。

### 3. 驗證

打開任一網頁（如 `https://www.google.com`），左下角會出現 **⚙** 按鈕。  
點擊開啟模組面板，可切換本頁模組和 WebAgent Console。  
確認伺服器狀態：

```
curl http://localhost:8921/status
```

## 架構

```
Tampermonkey (universal loader)  Flask Server (localhost:8921)
┌──────────────────────┐        ┌──────────────────────────┐
│ universal.loader      │─GET──▶│ /agent.core.js           │ 每次載入抓最新 core
│ .user.js              │◀─JS── │                          │
│ (安裝一次)            │        ├──────────────────────────┤
│                       │─GET──▶│ /modules                 │ 模組設定 (JSON)
│                       │◀─JSON─│                          │
│                       │        ├──────────────────────────┤
│                       │─GET──▶│ /poll?session=...        │ 輪詢等待指令
│                       │◀─cmd──│                          │
│                       │─POST─▶│ /report                  │ 回報執行結果
│                       │        ├──────────────────────────┤
│ modules/*.js          │─POST─▶│ /dump                    │ 元素標記資料
│ (自動載入)            │─POST─▶│ /hidden                  │ 隱藏清單
│                       │─GET──▶│ /hidden                  │ 讀取隱藏清單
└──────────────────────┘        └──────────────────────────┘
                                       │
                                ┌──────┴──────┐
                                │ resources/  │  文件 + 工具
                                └─────────────┘
```

## 目錄結構

```
agent/                  # Web Agent 核心（安裝一次，很少改動）
  core.js               # Agent 邏輯、UI、指令執行
  loader.user.js        # 舊版 loader（備用）
  universal.loader.user.js  # Universal loader（主要）
  standalone.user.js    # 獨立版（不需 loader）

modules/                # Tampermonkey 腳本（開發中）
  modules.json          # 模組設定：URL 匹配、grants、enabled
  *.js                  # 各腳本檔案（英文檔名）

.agent/                 # Runtime 資料（gitignored）
  LOGS/                 # Session 日誌
  TASKS/                # 任務管理
  RESULTS/              # 成果存檔
  dump/                 # Inspector 標記資料
    element_dump.json   # 元素標記結果
    hidden_selectors.json # 隱藏清單
  debug/                # 調試產出（server_log.txt）
  eval/                 # server eval 暫存
  scratch/              # 其他暫存
  trash/                # 準備清除的檔案（可還原）
```

## 指令參考

所有指令由伺服器推送，agent 接收後執行並回報結果。

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
| `dump_element` | `selector` | 傾印元素完整資料到 `/dump` |
| `dump_page` | `selector` (預設 `header`) | 傾印頁面結構到 `/dump` |
| `wait_for` | `selector`, `timeout` | 等待元素出現 |
| `debug_dump` | — | 一次傾印頁面結構（headings, links, images） |
| `console_capture` | `level`, `limit` | 取得 console log |
| `inject_ui` | — | 重新注入 UI 面板 |
| `ping` | — | 測試連線（回傳 PONG） |
| `set_config` | `key`, `value` | 修改 agent 設定 |

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/status` | 伺服器狀態、session、任務進度 |
| GET | `/tasks` | 列出可用任務 |
| GET | `/reports?limit=N` | 最近 N 筆回報 |
| POST | `/hello` | Session 註冊（agent 自動呼叫） |
| GET | `/poll?session=&state=&url=&title=` | Agent 輪詢（agent 自動呼叫） |
| POST | `/poll?session=` | Agent 輪詢 + 回傳上次結果（合併 poll+report） |
| POST | `/report` | Agent 回報（agent 自動呼叫） |
| POST | `/task/<name>` | 啟動任務 |
| POST | `/task/stop` | 停止目前任務 |
| POST | `/command` | 推送單一指令 |
| POST | `/commands` | 推送多個指令（JSON 陣列） |
| POST | `/dump` | Inspector 標記資料（含截圖、母元素鏈、頁面摘要） |
| GET | `/dump` | 讀取最新標記資料 |
| POST | `/hidden` | 新增隱藏清單（`{selectors: [...], url: "..."}`) |
| GET | `/hidden` | 讀取隱藏清單 |
| DELETE | `/hidden` | 清除隱藏清單 |
| GET | `/modules` | 模組設定（JSON） |
| GET | `/agent.loader.user.js` | 舊版 loader 腳本 |
| GET | `/universal.loader.user.js` | Universal loader 腳本 |
| GET | `/agent.core.js` | Agent 核心程式碼 |
| GET | `/agent.user.js` | 獨立版腳本 |
| GET | `/serve/<name>.user.js` | 通用腳本 serve |

## 模組工作流

1. 在 `modules/` 新增 `.js` + 在 `modules.json` 加一筆設定
2. Server 自動 serve，刷新頁面即可測試
3. `modules.json` 設 `enabled: false` 可停用自動載入

## Web Element Inspector

隱藏式元素標記工具，所有網站自動載入：

1. hover 畫面左邊緣 → 按鈕滑出 → 點擊開啟
2. hover 預覽元素資訊（tag、id、class、座標、尺寸、selector）
3. **Click 標記**元素（自動命名 元件1、元件2...）
4. 按 **📤 Send** → 資料存到 `/dump` + selector 加入 `/hidden`
5. Anime1 腳本自動讀取 `/hidden` 並隱藏對應元素

快捷鍵：`Ctrl+Shift+I` 開啟/關閉

## 撰寫任務

詳見 `resources/skills/task-authoring.md`。格式如下：

```python
"""任務說明"""

import logging
log = logging.getLogger('task.mytask')

def get_task():
    return _run()

def _run():
    log.info('[mytask] start')

    r = yield {'cmd': 'navigate', 'url': 'https://example.com'}
    log.info(f'navigate → {(r or {}).get("result")}')

    r = yield {'cmd': 'wait', 'ms': 2000}

    r = yield {'cmd': 'find', 'selector': 'h1'}
    count = (r or {}).get('extra', {}).get('count', 0)
    log.info(f'found {count} h1 elements')

    if count > 0:
        r = yield {'cmd': 'click'}
        log.info(f'clicked')

    return {'status': 'ok'}
```

**注意：**
- Generator 每次 `yield` 送出指令，下次 `.send(report)` 收回報結果
- `navigate` 指令自動推進 generator
- 任務完成用 `return`，結果顯示在 `/status`

## 自動更新機制

修改 `agent/core.js` → 重啟伺服器 → 重新整理頁面：  
Universal loader 每次載入頁面會從 `/agent.core.js?t={timestamp}` 抓取最新版本。  
`modules.json` 每 60 秒檢查一次，有變更自動重新整理頁面。
