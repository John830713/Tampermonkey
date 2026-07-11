# Tampermonkey Userscripts + Web Agent

Two halves in one repo: standalone Tampermonkey userscripts and a browser-agent framework with a Python Flask server. No build, no tests, no lint.

## Web Agent Framework

Architecture: browser agent script polls a local Flask server, server drives tasks via Python generators.

**Start server:** `python server.py` (port 8921, or `python server.py 9999` for custom port). Also `run_server.bat`.

**Development loop:** edit `agent.core.js` → restart server → refresh page. The loader (`agent.loader.user.js`) fetches core fresh on every page load — no Tampermonkey reinstall needed.

**Key files:**
- `agent.loader.user.js` — install once in Tampermonkey, thin wrapper that fetches `agent.core.js` from server
- `agent.core.js` — all agent logic, UI, command execution (500 lines)
- `agent.user.js` — standalone version (no loader needed)
- `server.py` — Flask app: session management, command queue, generator task runner, dashboard at `/`
- `tasks/*.py` — task modules; each exposes `get_task()` returning a generator that yields command dicts

**Task writing:** add `.py` to `tasks/`, define `get_task()` → generator. `yield {'cmd': 'navigate', 'url': '...'}` sends commands; `.send(report)` receives results. `navigate` auto-advances generator. Return value = task result, visible at `/status`.

**Debug commands (v1.3):**
- `wait_for` — wait for element to appear: `{"cmd":"wait_for","selector":"...","timeout":10000}`
- `debug_dump` — dump page structure (headings, links, images, forms, scripts) in one shot
- `console_capture` — get captured console logs (errors, warnings): `{"cmd":"console_capture","level":"error","limit":50}`
- `eval` limit now configurable: `{"cmd":"set_config","key":"evalLimit","value":8000}`

**Dashboard:** `http://localhost:8921/dashboard` — start/stop tasks, send manual commands, view session status and reports.

**Persistence:** task results append to `task_results.jsonl` (gitignored only `tasks/__pycache__/`).

## Standalone Userscripts

Edit `.js` files directly, then reinstall or sync in Tampermonkey.

### Rule34 圖片排版優化 + 無限滾動 (v3.5.0)
- **Match**: `rule34.xxx` post list pages + local dev `file://`
- **Grants**: `GM_addStyle`, `GM_xmlhttpRequest`
- `PAGE_SIZE` = 42, infinite scroll disabled on `file://`
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
- New standalone script? Add to this list and keep the format
- New task? Add `.py` to `tasks/` with `get_task()` entrypoint
- Port 8921 is hardcoded in `agent.loader.user.js:29`, `agent.core.js:5`, `server.py:659`. Change all three if using a different port.
