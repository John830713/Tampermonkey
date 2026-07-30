# Web Agent Project

Tampermonkey userscripts + Python Flask server for browser automation. No build, no tests, no lint, no typecheck. Python 3.8+ (`pip install flask pystray Pillow`).

## Quick Start

```bash
python resources\tools\local\tray.py   # or double-click run.bat
# Server on localhost:8921, tray auto-manages subprocess
```

## Architecture

Browser agents (Tampermonkey) poll `localhost:8921` for commands. Python generators drive automation sequences.

```
agent/core.js                    ← logic, UI, command execution (auto-fetched dynamically)
agent/universal.loader.user.js   ← Tampermonkey entry point (install once)
modules/*.js                     ← site-specific scripts (auto-loaded via modules.json)
resources/tools/local/server.py  ← Flask server (tray.py manages subprocess)
```

## Key Gotchas

- **`modules.json` is a JSON array** (not keyed object). Each entry: `name`, `enabled`, `match`, `script`, `grants`.
- **`navigate` kills the session** (page reload = new session). Check `/status` after navigation.
- **eval limit** is 2000 chars default. Increase via `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **Tracking domains** are silently filtered — their sessions don't receive commands.
- **Task runner is single-task** — starting a new task aborts the current one.
- **Never `taskkill /F /IM python.exe`** — kills all Python. Kill the specific PID from `.agent/server/agent.pid`.
- **PowerShell `curl` is `Invoke-WebRequest`** — use `curl.exe`.

## Auto-Update Behavior

| Change | Result | No need to |
|--------|--------|------------|
| `agent/core.js` | Refresh browser | Reinstall Tampermonkey script |
| `server.py` | Tray auto-restarts (mtime) | Manually restart server |
| `modules.json` | Agent polls every 60s, reloads on change | Refresh browser manually |

## Port Change

Edit all three:
1. `server_config.json`
2. `agent/universal.loader.user.js` — `SERVER_PORT` (line 26)
3. `resources/tools/local/send_cmd.py` — port (line 44)

## Task Format

Python generator in `tasks/`. See `resources/skills/task-authoring.md` for full spec. (Note: `tasks/` not checked in — tasks live in `.agent/TASKS/` at runtime.)

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

- `.agent/` — logs, tasks, results, browser dumps, server PID/log
- `task_results.jsonl` — persistent task results

## Useful References (under `resources/`)

- `skills/task-authoring.md` — generator task spec
- `skills/troubleshooting.md` — common issues
- `reference/commands.md` — all browser agent commands
- `reference/api-endpoints.md` — all Flask server endpoints
- `reference/tampermonkey/` — coding rules, GM API patterns, module architecture
- `rules/` — git workflow, safety, temp files
