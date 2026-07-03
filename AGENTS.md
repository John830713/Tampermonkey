# Tampermonkey Userscript Collection

8 independent userscripts, no build / test / lint / npm. Edit `.js` files directly, then reinstall or sync in Tampermonkey.

## Scripts

### Rule34 圖片排版優化 + 無限滾動 (v3.5.0)
- **Match**: `rule34.xxx` post list pages + local dev `file://` path
- **Grants**: `GM_addStyle`, `GM_xmlhttpRequest`
- Page size = 42 (`PAGE_SIZE`), infinite scroll disabled on `file://`
- `setInterval(..., 500)` maintenance loop fixes inline styles
- 3 consecutive fetch failures stop retry for that direction

### 蝦皮首頁觸發自動簽到 (v3.1)
- **Match**: `shopee.tw/*` — **Grants**: `GM_setValue`, `GM_getValue`, `GM_xmlhttpRequest`
- Dedup by date via `GM_getValue('lastCheckInDate')`; quits if already done today
- Tries 2 API endpoints sequentially

### 蝦皮 Debug - 攔截簽到請求 (v1.1)
- **Match**: `shopee.tw/*`, `@run-at document-start` — **Grant**: none
- Intercepts `fetch`/`XHR` requests matching keywords (`checkin`, `coin`, `points`, ...)

### Anime1 綜合自動化助手 (路徑優化版) (v19.0)
- **Match**: `anime1.me/*`, `v.anime1.me/*` — **Grants**: `GM_download`, `GM_notification`, `GM_openInTab`
- Multi-environment (list page / single / iframe), injects episode panel

### ExHentai 動態排版 (v1.0)
- **Match**: `exhentai.org/g/*`, `e-hentai.org/g/*` — **Grant**: `GM_addStyle`
- CSS grid layout on `#gdt`, column count stored in `localStorage`

### MHNow.me 偵測繞過 (v1.1)
- **Match**: `mhnow.me/*`, `@run-at document-start` — **Grant**: none
- `setInterval(cleanUI, 1000)` removes adblock-detection overlays

### 血液基金會問卷自動勾選 (修正版) (v1.1)
- **Match**: `dh.blood.org.tw/donor/questionnaire.htm*` — **Grant**: none
- Button-triggered, no polling or infinite scroll

### HAnime 720p Download.js
- Empty file (0 bytes) — placeholder

## Notes

- No framework, no monorepo, no tests — each script is standalone
- New script? Add to this list and keep the format
