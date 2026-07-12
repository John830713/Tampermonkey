# Tampermonkey Userscripts + Web Agent

Two halves in one repo: standalone Tampermonkey userscripts and a browser-agent framework with a Python Flask server. **No build, no tests, no lint, no typecheck.** Requires Python 3.8+ and Flask (`pip install flask`).

Full command reference, API endpoints, and architecture diagrams are in `README.md`. This file covers what an agent would otherwise get wrong.

## Sync Convention

通用同步規範見 `D:\Agent\AGENTS.md`。以下為本專案的同步細節：

- **MD files (this file, README.md, etc.)** — 跨機台共享的專案知識
- **mneme memory** — 個人進度、臨時決策、session 間的上下文。不跨機台
- **git commit** — 程式碼變更，跨機台同步

## Dev Loop

`python server.py` (port 8921) or `run_server.bat`. Custom port: `python server.py 9999`.

Edit files in `agent/` or `modules/` → restart server → refresh page. The universal loader fetches `core.js` fresh on every page load — **no Tampermonkey reinstall needed** for core changes. `modules.json` is checked every 60s; changes trigger auto-reload.

## Port Change

Edit **two** places:
1. `agent/universal.loader.user.js:25` — `var SERVER_PORT = 8921;`
2. Launch server with matching arg: `python server.py <new_port>`

`core.js` reads port from `window.__agent_server` (set by loader), so no edit needed there.

## Modules

`modules/modules.json` is a **JSON array** (not keyed by name). Each entry: `name`, `enabled`, `match` (URL patterns), `script` (filename in `modules/`), `grants`.

Add a new module: add `.js` to `modules/` + entry in `modules.json`. Set `enabled: false` to disable. **Note:** one script has a Unicode filename (`nHentai 動態排版.js`) — be careful with quoting in shell commands.

Module toggle panel (⚙ button, bottom-left) stores per-module overrides in `localStorage('a1_mod_overrides')`. JSON `enabled` is base; localStorage overrides it.

## Tasks

Add `.py` to `tasks/`, define `get_task()` → generator. `yield {'cmd': 'navigate', 'url': '...'}` sends commands; `.send(report)` receives results. `navigate` auto-advances generator. Return value = task result, visible at `/status`.

## Key Gotchas

- **Tampermonkey sandbox:** `GM_xmlhttpRequest` blob + `<a>.click()` doesn't work for downloads. Use `GM_download` (supports `onprogress`, no abort).
- **Server-side 403:** Anime1 video API (`POST https://v.anime1.me/api`) requires browser cookies — cannot be called from server.
- **Tracking domain filter:** `server.py` silently drops sessions from ad/tracking domains (lines 56-75). If a task navigates to an ad URL, the session won't receive commands.
- **eval limit:** Default 2000 chars. Configurable via `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **task_results.jsonl** and `.agent/` are gitignored.

## Working with Server Efficiently

- **Batch eval:** Send multiple eval commands at once, then poll once for results.
- **Minimal polling:** Only check `/status` when you actually need the result.
- **Isolate exploration:** Use `task` agent for trial-and-error work to keep main context clean.
