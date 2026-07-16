# Web Agent Project

Standalone Tampermonkey userscripts + browser-agent framework with Python Flask server. No build, no tests, no lint, no typecheck. Python 3.8+ required (`pip install flask pystray Pillow`).

## Index Chain — MUST FOLLOW

The project organizes info into `resources/` by category instead of duplicating in this file. When the user tells you to "參考" or look up known patterns, or when you need to understand how something works:

1. **Start at** `resources/INDEX.md` — top-level map of all categories
2. **Follow sub-INDEX.md** down to the right file
3. **Do not skip** — unless the question is trivially answerable from context

Critical paths:
- `resources/rules/` — git workflow, safety rules, temp file conventions
- `resources/skills/` — agent mode flow, task authoring, troubleshooting
- `resources/reference/` — commands list, API endpoints, UI patterns
- `resources/reference/tampermonkey/` — script coding rules, module architecture, WAI workflow

## Language

Conclusions/summaries to the user: **繁體中文**. Reasoning, code, and comments: **English**.

## Automatic Updates

| Change | Result | No need to |
|--------|--------|------------|
| `agent/core.js` | Refresh browser page | Reinstall Tampermonkey script |
| `server.py` | Tray auto-restarts server (mtime) | Manually restart |
| `modules.json` | Agent polls every 60s, reloads on change | Refresh browser manually |

## Port Change

Edit **three** places:
1. `server_config.json`
2. `agent/universal.loader.user.js` line 26 (`SERVER_PORT`)
3. `resources/tools/local/send_cmd.py` line 44

`.agent/` and `task_results.jsonl` are gitignored.
