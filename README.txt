====================================
  Web Agent 快速開始
====================================

1. 安裝 Python 依賴
   pip install flask

2. 啟動伺服器
   python server.py
   或雙擊 run_server.bat
   伺服器預設跑在 http://localhost:8921

3. 安裝 Tampermonkey 腳本
   瀏覽器開啟 http://localhost:8921/agent.loader.user.js
   Tampermonkey 會自動攔截 → 按「安裝」

4. 驗證
   任意頁面右下角出現「WebAgent」面板 = 安裝成功
   命令列執行 curl http://localhost:8921/status 確認 server 回應

====================================
  Port 修改
====================================

若 8921 被占用，需同步改三個檔案：

  agent.loader.user.js  第 29 行
    http://localhost:8921/agent.core.js

  agent.core.js          第 5 行
    server: 'http://localhost:8921'

  server.py              第 659 行
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

  啟動任務：POST http://localhost:8921/task/<任務名稱>
  停止任務：POST http://localhost:8921/task/stop
  手動指令：POST http://localhost:8921/command
            Body: {"cmd":"ping","_session":"<session_id>"}

====================================
  Tampermonkey 腳本列表
====================================

  Rule34 圖片排版優化 + 無限滾動 (v3.5.0)
    Match: rule34.xxx

  蝦皮首頁觸發自動簽到 (v3.1)
    Match: shopee.tw/*

  蝦皮 Debug - 攔截簽到請求 (v1.1)
    Match: shopee.tw/*

  Anime1 綜合自動化助手 (v19.0)
    Match: anime1.me/*

  ExHentai 動態排版 (v1.0)
    Match: exhentai.org/g/*

  MHNow.me 偵測繞過 (v1.1)
    Match: mhnow.me/*

  血液基金會問卷自動勾選 (v1.1)
    Match: dh.blood.org.tw/donor/questionnaire.htm*
