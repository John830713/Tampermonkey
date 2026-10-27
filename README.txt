====================================
  Web Agent 快速開始
====================================

0. 伺服器 = D:\Project\Project.exe 的 WebAgent 模組
   （原本的 Python server.py / run_server.bat 已移除，本目錄只剩它讀的 JS）
   設定檔：D:\Project\Config\Config_WebAgent.ini
   伺服器預設跑在 http://localhost:8921

1. 確認伺服器
   直接執行 D:\Project\Project.exe（托盤程式，WebAgent 會自動啟動）
   curl http://localhost:8921/status

2. 安裝通用 Loader（只需一次）
   瀏覽器開啟 http://localhost:8921/universal.loader.user.js
   Tampermonkey 會自動攔截 → 按「安裝」

3. 驗證
   任意頁面右下角出現「WebAgent」面板 = 安裝成功

====================================
  新增/修改腳本
====================================

  1. 將 .js 檔案放在 modules/ 目錄
  2. 在 modules.json 加入一筆設定（見下方格式）
  3. 不必重啟任何東西，存檔後重新整理頁面即可
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

若 8921 被占用，需同步改三個地方：

  D:\Project\Config\Config_WebAgent.ini   Port=8921
    （改完重啟 Project.exe）

  agent/universal.loader.user.js          SERVER_PORT
    var SERVER_PORT = 8921

  resources/tools/local/send_cmd.py       第 44 行
    port = 8921

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

  註：C++ 版尚未實作任務引擎 → /tasks 回傳 {"available":[]}、/task/<name> 為 404。
      Python generator 任務（tasks/*.py）已隨 server.py 移除。

====================================
  Web Element Inspector
====================================

   已整合至 debug-toolkit.js（Ctrl+Shift+I 開啟/關閉）：

   1. hover 預覽元素資訊（tag、id、class、座標、尺寸、selector）
   2. Click 標記元素（自動命名 元件1、元件2...）
   3. 按 Send → 資料存到 /dump + selector 加入 /hidden

====================================
  Tampermonkey 腳本列表（modules.json）
====================================

  rule34              — rule34.xxx gallery optimizer + infinite scroll
  shopee-checkin      — shopee.tw auto check-in
  shopee-debug        — shopee.tw request interceptor
  anime1              — anime1.me automation helper (legacy)
  anime1-infinite-scroll — anime1.me infinite scroll + card collapse + hidden list
  exhentai-layout     — exhentai.org / e-hentai.org dynamic layout
  exhentai-autologin  — exhentai.org / e-hentai.org auto login
  mhnow-bypass        — mhnow.me detection bypass
  blood-questionnaire — dh.blood.org.tw questionnaire auto-fill
  hanime-download     — hanime.tv 720p download
  debug-toolkit       — site-wide debug panel (Inspector, Editor, hidden)
