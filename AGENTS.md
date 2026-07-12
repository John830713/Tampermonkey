# Tampermonkey Userscripts + Web Agent

Two halves in one repo: standalone Tampermonkey userscripts and a browser-agent framework with a Python Flask server. No build, no tests, no lint.

## Sync Convention

通用同步規範見 `D:\Agent\AGENTS.md`。以下為本專案的同步細節：

- **MD files (this file, README.md, etc.)** — 跨機台共享的專案知識
- **mneme memory** — 個人進度、臨時決策、session 間的上下文。不跨機台
- **git commit** — 程式碼變更，跨機台同步

## Web Agent Framework

Architecture: browser agent script polls a local Flask server, server drives tasks via Python generators.

**Start server:** `python server.py` (port 8921, or `python server.py 9999` for custom port). Also `run_server.bat`.

**Development loop:** edit files in `agent/` or `modules/` → restart server → refresh page. The universal loader fetches core fresh on every page load — no Tampermonkey reinstall needed.

**Universal loader:** `agent/universal.loader.user.js` replaces all individual loaders. Install once, auto-loads Web Agent core + all scripts from `modules.json`. Auto-checks for module changes every 60s and reloads page if config changed.

**Module workflow:**
1. Add script to `modules/` + entry in `modules/modules.json` → auto-updates during dev
2. Set `enabled: false` in modules.json to disable auto-loading

**Directory structure:**
```
agent/                  # Web Agent core (install once, rarely changes)
  core.js               # agent logic, UI, command execution (~600 lines)
  loader.user.js        # legacy loader (backup)
  universal.loader.user.js  # universal loader (primary)
  standalone.user.js    # standalone version (no loader needed)

modules/                # Userscripts (development, frequently edited)
  modules.json          # module config: URL patterns, grants, enabled flag
  *.js                  # individual script files (English filenames)

tasks/                  # Server-side task modules
  *.py                  # each exposes get_task() returning a generator

.agent/                 # Agent runtime data (logs, results)
  element_dump.json     # Inspector mark data (from /dump)
  hidden_selectors.json # Hidden element selectors (from /hidden)
```

**Key files:**
- `server.py` — Flask app: session management, command queue, generator task runner, dashboard at `/`, `/dump` endpoint, `/hidden` endpoint
- `modules/modules.json` — module config: URL patterns, script files, grants, enabled flag

**Task writing:** add `.py` to `tasks/`, define `get_task()` → generator. `yield {'cmd': 'navigate', 'url': '...'}` sends commands; `.send(report)` receives results. `navigate` auto-advances generator. Return value = task result, visible at `/status`.

**Debug commands (v1.3):**
- `wait_for` — wait for element to appear: `{"cmd":"wait_for","selector":"...","timeout":10000}`
- `debug_dump` — dump page structure (headings, links, images, forms, scripts) in one shot
- `console_capture` — get captured console logs (errors, warnings): `{"cmd":"console_capture","level":"error","limit":50}`
- `dump_element` — dump element full info to `/dump`: `{"cmd":"dump_element","selector":"#secondary"}`
- `dump_page` — dump page structure + header to `/dump`: `{"cmd":"dump_page","selector":"header"}`
- `eval` limit now configurable: `{"cmd":"set_config","key":"evalLimit","value":8000}`

**Dashboard:** `http://localhost:8921/dashboard` — start/stop tasks, send manual commands, view session status and reports.

**Persistence:** task results append to `task_results.jsonl` (gitignored only `tasks/__pycache__/`).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Server status, sessions, task progress |
| GET | `/tasks` | List available tasks |
| GET | `/reports?limit=N` | Recent reports |
| POST | `/hello` | Session registration (agent auto-calls) |
| GET | `/poll?session=&state=&url=&title=` | Agent poll (agent auto-calls) |
| POST | `/report` | Agent report (agent auto-calls) |
| POST | `/task/<name>` | Start task |
| POST | `/task/stop` | Stop current task |
| POST | `/command` | Push single command |
| POST | `/commands` | Push multiple commands (JSON array) |
| POST | `/dump` | Save Inspector mark data (elements, screenshot, parent chain, page summary) |
| GET | `/dump` | Read latest mark data |
| POST | `/hidden` | Add selectors to hide list: `{"selectors":["#foo"],"url":"https://..."}` |
| GET | `/hidden` | Read hidden selectors |
| DELETE | `/hidden` | Clear hidden selectors |
| GET | `/modules` | Module config (JSON) |

## Web Element Inspector

Hidden element marking tool, auto-loaded on all sites:
1. Hover left screen edge → button slides out → click to enable
2. Hover to preview element info (tag, id, class, coords, size, selector)
3. Click to mark elements (auto-named 元件1, 元件2...)
4. Press Send → data saved to `/dump` + selector added to `/hidden`
5. Anime1 script auto-reads `/hidden` and hides matching elements

Shortcut: `Ctrl+Shift+I` toggle

## Notes

- Port 8921 is auto-detected via `location.hostname` in loader/core/modules. Server port configurable via `python server.py <port>`.
- New module? Add `.js` to `modules/` + entry in `modules/modules.json`
- New task? Add `.py` to `tasks/` with `get_task()` entrypoint
- Hidden selectors stored in `.agent/hidden_selectors.json`
- Inspector mark data stored in `.agent/element_dump.json`

## Module Toggle Panel

Universal loader v2.0 includes a ⚙ toggle button (bottom-left) on every page.

- Reads `modules.json` from server, matches modules to current URL
- Each module gets an on/off switch; state saved in `localStorage('a1_mod_overrides')`
- Override logic: JSON `enabled` is base, localStorage overrides it
- Toggle → page reloads → loader skips disabled modules
- Toggle panel is generic — works for any module, not hardcoded per-site

## Anime1 Script Notes

**Video API:** `POST https://v.anime1.me/api` with body `d=<data-apireq>` (URL-encoded JSON from `<video>` tag). Response: `{"s":[{"src":"//miru.v.anime1.me/.../file.mp4"}]}`. Requires browser cookies (credentials:include). Cannot be called server-side (403).

**Category page pagination:** WordPress theme uses `.nav-previous a` for forward (more episodes), NOT `.nav-next a`. Labels are counter-intuitive: "上一頁" = older/forward.

**Download:** Use `GM_download` (not `GM_xmlhttpRequest` blob). Blob + `<a>.click()` doesn't work in Tampermonkey sandbox. `GM_download` supports `onprogress` for progress bar. No abort method available.

## Working with Server Efficiently

When interacting with the browser agent via server commands:

- **Batch eval:** Send multiple eval commands at once, then poll once for results. Don't poll `/status` after every single command.
- **Parallel bash:** Use parallel tool calls for independent commands (e.g., `git status` + `git diff` together).
- **Minimal polling:** Only check `/status` when you actually need the result, not out of habit.
- **Isolate exploration:** Use `task` agent for trial-and-error work to keep main context clean.
