# Auto-Check Checklist

可編輯的檢查清單。格式：每行一個檢查項目，用 `-` 開頭。

## INDEX.md 鏈

- [ ] 每個有內容的目錄都有 INDEX.md
- [ ] INDEX.md 列的檔案都存在
- [ ] 實際檔案都列在 INDEX.md 裡
- [ ] 相依關係正確標示

## 檔案結構

- [ ] `resources/tools/local/` 只剩 `send_cmd.py`（server 已移至 `D:\Project`）
- [ ] `resources/tools/common/` 為空（跨專案工具在 D:\Agent）
- [ ] `resources/skills/` 有操作技能
- [ ] `resources/reference/` 有通用參考

## 相依關係

- [ ] `send_cmd.py` → `Project.exe`（WebAgent, port 8921）的相依有標示
- [ ] `agent/` 與 `modules/` → `ResourceRoot` 的相依有標示

## Git 狀態

- [ ] 沒有未提交的改動（git status 乾淨）
- [ ] 沒有未追蹤的重要檔案
- [ ] .gitignore 正確忽略不該追蹤的檔案
