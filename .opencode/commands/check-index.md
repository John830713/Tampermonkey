---
description: 檢查 INDEX.md 鏈是否完整
template: |
  掃描 `resources/` 目錄，對照 INDEX.md 檢查以下項目：

  ## 檢查清單

  1. **目錄完整性** — 每個有內容的目錄是否都有 INDEX.md
  2. **檔案清單** — INDEX.md 列的檔案是否都存在
  3. **遺漏偵測** — 實際檔案是否都列在 INDEX.md 裡
  4. **相依關係** — 相依是否正確標示（改一個檔時能不能沿著鏈改完）

  ## 輸出格式

  - ✓ 正常的項目
  - ✗ 遺漏或不一致的項目（含修正建議）

  ## 掃描範圍

  - `resources/tools/` — 實體工具
  - `resources/skills/` — 操作技能
  - 各子目錄的 INDEX.md
