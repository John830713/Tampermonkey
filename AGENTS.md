# Web Agent Project

Tampermonkey userscripts + Python Flask server for browser automation. No build, no tests, no lint, no typecheck. Python 3.8+ (`pip install flask pystray Pillow`).

## Quick Start

```bash
python resources\tools\local\tray.py   # or double-click run.bat
# Server runs on localhost:8921, tray icon auto-manages subprocess
```

## Architecture

Browser agents (Tampermonkey) poll `localhost:8921` for commands. Python generators in `tasks/` drive automation sequences. The server pushes commands, agents execute and report back.

```
agent/core.js          ← logic, UI, command execution (dynamic, auto-fetched)
agent/universal.loader.user.js ← Tampermonkey entry point (install once)
modules/*.js           ← site-specific scripts (auto-loaded via modules.json)
tasks/*.py             ← Python generator tasks
resources/tools/local/server.py ← Flask server (tray.py manages it)
```

## Key Gotchas

- **`modules.json` is a JSON array** (not keyed object). Each entry: `name`, `enabled`, `match`, `script`, `grants`.
- **`navigate` kills the session** (page reload = new session). Check `/status` after navigation.
- **eval limit** is 2000 chars by default. Increase with `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **Tracking domains** (ads, analytics) are silently filtered — their sessions don't receive commands.
- **Task runner is single-task** — starting a new task aborts the current one.
- **Never `taskkill /F /IM python.exe`** — kills all Python processes. Read `.agent/server/agent.pid` for the correct PID.
- **PowerShell `curl` is `Invoke-WebRequest`** — use `curl.exe` for the real curl.

## Index Chain — MUST FOLLOW

When user says "參考" or you need to understand how something works:

1. Start at `resources/INDEX.md`
2. Follow sub-INDEX.md to the right file
3. Don't skip — unless the answer is trivially obvious

Critical paths:
- `resources/rules/` — git workflow, safety rules, temp files
- `resources/skills/` — agent mode, task authoring, troubleshooting
- `resources/reference/` — commands, API endpoints, Tampermonkey coding rules
- `D:\Agent\resources\reference\` — cross-project rules (git, design, common tools)

## Language

User communication: **繁體中文**. Code, comments, variable names: **English**.

## Auto-Update Behavior

| Change | Result | No need to |
|--------|--------|------------|
| `agent/core.js` | Refresh browser page | Reinstall Tampermonkey script |
| `server.py` | Tray auto-restarts (mtime detection) | Manually restart |
| `modules.json` | Agent polls every 60s, reloads on change | Refresh browser manually |

## Port Change

Edit **three** places:
1. `server_config.json`
2. `agent/universal.loader.user.js` line 26 (`SERVER_PORT`)
3. `resources/tools/local/send_cmd.py` line 44

## Task Format

Python generator in `tasks/`. See `resources/skills/task-authoring.md` for full spec. (Note: there is no `tasks/` directory checked in — tasks live in `.agent/TASKS/` at runtime.)

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
- **Server communication**: `const SERVER = window.__agent_server || 'http://localhost:8921';`
- **Reuse code** from existing scripts — see `resources/reference/tampermonkey/module-architecture.md`

## Git

Every file change must be committed immediately. Don't batch. Don't push unless asked.

## Runtime Directories (gitignored)

- `.agent/` — logs, tasks, results, browser dumps, server PID/logs
- `task_results.jsonl` — persistent task results

## Safety

- **Never modify `.opencode/`** — infrastructure files, breaks opencode loading.
- **Revert safely** — `git stash` or `git commit` first. Never overwrite uncommitted work.
