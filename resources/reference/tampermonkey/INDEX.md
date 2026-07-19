# Tampermonkey Reference

Tampermonkey 腳本設計參考。新增腳本時先讀這裡。

## Reference Files

| File | 內容 |
|------|------|
| `coding-rules.md` | DOM 操作、Event Handler、Eval、Trusted Types |
| `module-architecture.md` | loader → core → module 架構、重複代碼表 |
| `gm-api-patterns.md` | GM_xmlhttpRequest 節流（Queue / Throttle）、GM_download、大檔 blob 下載模式 |
| `server-comms.md` | 與本地 server 通訊模式 |
| `wai-workflow.md` | Web Element Inspector 操作流程與資料結構 |

## 腳本間重複代碼

新增腳本時，優先從現有檔案複製對應段落，不要重新發明。
