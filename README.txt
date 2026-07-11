====================================
  Web Agent 快速開始
====================================

1. 安裝 Python 依賴
   pip install flask

2. 啟動伺服器
   python server.py
   或雙擊 run_server.bat
   伺服器預設跑在 http://localhost:8921

3. 安裝通用 Loader（只需一次）
   瀏覽器開啟 http://localhost:8921/universal.loader.user.js
   Tampermonkey 會自動攔截 → 按「安裝」

4. 驗證
   任意頁面右下角出現「WebAgent」面板 = 安裝成功
   命令列執行 curl http://localhost:8921/status 確認 server 回應

====================================
  新增/修改腳本
====================================

  1. 將 .js 檔案放在 modules/ 目錄
  2. 在 modules.json 加入一筆設定（見下方格式）
  3. 重啟 server（改 modules.json 不用重啟，loader 會自動偵測）
  4. 整理瀏覽器頁面

  modules.json 格式：
  {
    "name": "腳本名稱",
    "enabled": true,
    "match": ["https://example.com/*"],
    "script": "腳本檔名.js",
    "grants": ["GM_addStyle", "GM_xmlhttpRequest"],
    "connect": ["localhost"]
  }

  match 支援多個 pattern（陣列格式）
  enabled 設 false 可停用自動載入

====================================
  Port 修改
====================================

若 8921 被占用，需同步改三個檔案：

  agent/universal.loader.user.js  第 31 行
    var SERVER = 'http://localhost:8921'

  agent/core.js                   第 5 行
    server: 'http://localhost:8921'

  server.py                       第 669 行
    或用參數啟動：python server.py 9999
    （只需改 loader 和 core，server 用參數即可）

====================================
  Debug 指令速查
====================================

以下指令透過 server API 送給瀏覽器執行：

  debug_dump
    回傳頁面結構：headings、links、images、forms、scripts
    用法：{"cmd":"debug_dump"}

  wait_for
    等待某個 CSS selector 出現，超時回 found: false
    用法：{"cmd":"wait_for","selector":".my-class","timeout":5000}

  console_capture
    擷取瀏覽器 console 輸出（error、warn、log、info）
    用法：{"cmd":"console_capture","level":"error","limit":20}

  dump_element
    傾印單一元素完整資料（tag、id、class、selector、styles、座標、HTML）到 /dump
    用法：{"cmd":"dump_element","selector":"#secondary"}

  dump_page
    傾印頁面+指定元素結構到 /dump
    用法：{"cmd":"dump_page","selector":"header"}

  set_config (evalLimit)
    調整 eval 指令的結果截斷長度（預設 2000）
    用法：{"cmd":"set_config","key":"evalLimit","value":8000}

====================================
  常用 API 端點
====================================

  http://localhost:8921/status       — 伺服器狀態
  http://localhost:8921/dashboard    — 圖形化控制台
  http://localhost:8921/tasks        — 列出可用任務
  http://localhost:8921/reports      — 最近執行報告
  http://localhost:8921/modules      — 模組清單（modules.json）
  http://localhost:8921/hidden       — 讀取隱藏清單（GET）
  http://localhost:8921/dump         — 讀取最新標記資料（GET）

  啟動任務：POST http://localhost:8921/task/<任務名稱>
  停止任務：POST http://localhost:8921/task/stop
  手動指令：POST http://localhost:8921/command
            Body: {"cmd":"ping","_session":"<session_id>"}
  新增隱藏：POST http://localhost:8921/hidden
            Body: {"selectors":["#sidebar",".ad"],"url":"https://anime1.me/"}

====================================
  Web Element Inspector
====================================

  隱藏式元素標記工具，所有網站自動載入：

  1. hover 畫面左邊緣 → 按鈕滑出 → 點擊開啟
  2. hover 預覽元素資訊（tag、id、class、座標、尺寸、selector）
  3. Click 標記元素（自動命名 元件1、元件2...）
  4. 按 Send → 資料存到 /dump + selector 加入 /hidden
  5. Anime1 腳本自動讀取 /hidden 並隱藏對應元素

  快捷鍵：Ctrl+Shift+I 開啟/關閉

====================================
  Tampermonkey 腳本列表（modules.json）
====================================

  rule34              — rule34.xxx 圖片排版優化 + 無限滾動
  shopee-checkin      — shopee.tw 自動簽到
  shopee-debug        — shopee.tw 攔截簽到請求
  anime1              — anime1.me 綜合自動化助手（舊版）
  anime1-infinite-scroll — anime1.me 無限滾動 + 折疊卡片 + 隱藏清單
  exhentai-layout     — exhentai.org / e-hentai.org 動態排版
  exhentai-autologin  — exhentai.org / e-hentai.org 自動登入
  mhnow-bypass        — mhnow.me 偵測繞過
  blood-questionnaire — dh.blood.org.tw 問卷自動勾選
  hanime-download     — hanime.tv 720p 下載
  web-element-inspector — 全站元素標記工具（隱藏式）
