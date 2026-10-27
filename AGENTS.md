# Web Agent Project

Tampermonkey userscripts for browser automation. **No server code lives here any more** — the Python Flask server, tray and loaders were retired; the HTTP surface is now the `WebAgent` module inside `D:\Project\Project.exe` (port 8921). This repo is only the JS asset tree that server reads (`ResourceRoot=D:\Tampermonkey`). No build, no tests, no lint, no typecheck.

## Quick Start

```bat
REM server: run D:\Project\Project.exe (WebAgent module auto-starts, 0.0.0.0:8921)
REM push a one-off command from PowerShell:
python resources\tools\local\send_cmd.py <session> find "h1"
```

## Architecture

Browser agents (Tampermonkey) poll `localhost:8921` for commands. The server lives in `D:\Project\Modules\WebAgent`; this repo supplies the JS it serves.

```
agent/core.js                    ← logic, UI, command execution (auto-fetched dynamically)
agent/universal.loader.user.js   ← Tampermonkey entry point (install once)
modules/*.js                     ← site-specific scripts (auto-loaded via modules.json)
resources/tools/local/send_cmd.py← CLI client for the server
```

Server: `D:\Project\Project.exe` → `Modules/WebAgent` (see `D:\Project\Modules\WebAgent\INDEX.md`). Config: `D:\Project\Config\Config_WebAgent.ini`.

## Key Gotchas

- **`modules.json` is a JSON array** (not keyed object). Each entry: `name`, `enabled`, `match`, `script`, `grants`.
- **`navigate` creates a new session** (page reload = new session ID). Check `/status` after navigation for the new session.
- **eval limit** is 2000 chars default. Increase via `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **Tracking domains** are silently filtered — their sessions don't receive commands.
- **Task runner is single-task** — starting a new task aborts the current one.
- **Module parse errors are silent** — `executeScript` wraps code in `new Function()`; a syntax error is caught with only `console.error`, not visible via `__agent_consoleLogs`. Session looks fine (polls, toggle shows) but module is dead. Debug via browser F12 console.
- **Never `taskkill /F /IM python.exe`** — kills all Python. The server is a Win32 process now: stop `Project.exe` (or its WebAgent settings dialog) instead of hunting PIDs.
- **PowerShell `curl` is `Invoke-WebRequest`** — use `curl.exe`.

## Auto-Update Behavior

| Change | Result | No need to |
|--------|--------|------------|
| `agent/core.js` | Refresh browser | Reinstall Tampermonkey script |
| `modules/*.js` (`@version` bump) | Agent reloads the page within 60s | Refresh browser manually |
| `modules.json` | Agent polls every 60s, reloads on change | Refresh browser manually |
| Server code (`D:\Project`) | Rebuild + restart `Project.exe` | Touch anything here |

## Port Change

Edit all three:
1. `D:\Project\Config\Config_WebAgent.ini` — `Port`
2. `agent/universal.loader.user.js` — `SERVER_PORT` (line 26)
3. `resources/tools/local/send_cmd.py` — port (line 44)

## Task Format

Task *plans* live in `.agent/TASKS/` (Standing/Adhoc/Scheduled) — see `resources/skills/agent-mode.md`. Full spec: `resources/skills/task-authoring.md`.

The Python generator runner went away with `server.py`: `/tasks` returns `{"available":[]}` and `/task/<name>` is 404 in the C++ server. The plan documents are kept as design notes for the deferred C++ task engine. State this explicitly when reading them — the Python snippets below are historical.

```python
def get_task():
    return _run()

def _run():
    r = yield {'cmd': 'navigate', 'url': 'https://example.com'}
    r = yield {'cmd': 'find', 'selector': 'h1'}
    count = (r or {}).get('extra', {}).get('count', 0)
    return {'status': 'ok'}
```

## Tampermonkey Script Rules

- **No `innerHTML`** — use `createElement` + `textContent` (CSP / Trusted Types)
- **Bind events immediately** after creating DOM elements
- **Server URL**: `const SERVER = window.__agent_server || 'http://localhost:8921';`
- See `resources/reference/tampermonkey/module-architecture.md` for code-sharing patterns

## Runtime Directories (gitignored)

- `.agent/` — UI state (`browser/hidden_selectors.json`), scratch scripts. The `server/` log+PID dir belonged to the Python tray and is gone
- `task_results.jsonl` — persistent task results (written by the C++ server's `/dump`/`/results`)

## Useful References (under `resources/`)

- `skills/task-authoring.md` — generator task spec (historical: runner removed)
- `skills/troubleshooting.md` — common issues
- `reference/commands.md` — all browser agent commands
- `reference/api-endpoints.md` — all server endpoints (now served by `D:\Project\Project.exe`)
- `reference/tampermonkey/` — coding rules, GM API patterns, module architecture
- `rules/` — git workflow, safety, temp files
