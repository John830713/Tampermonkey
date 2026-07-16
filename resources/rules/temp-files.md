# Temp Files (`.agent/`)

All agent-produced temp files go to `.agent/`. **Never** write to project root.

| Type | Directory | Purpose |
|------|-----------|---------|
| Browser data | `.agent/browser/` | WAI element dumps, screenshots, hidden selectors |
| Server output | `.agent/server/` | `server_log.txt`, `agent.pid` |
| Agent work | `.agent/agent/` | Eval request JSON, temp work files |
| Session logs | `.agent/LOGS/` | Daily session summaries (`YYYY-MM-DD.md`) |
| Tasks | `.agent/TASKS/` | Standing, Adhoc, Scheduled task definitions |
| Results | `.agent/RESULTS/` | Completed task outputs |
| Trash | `.agent/trash/` | Pending deletion (gitignored, recoverable) |

`element_dump.json` and `hidden_selectors.json` live in `.agent/browser/`.

## Index chain
When modifying any `.agent/` path, read `.agent/INDEX.md` to check if it's still accurate. If not, update it. Also grep `*.md` and `*.py` for stale references and fix them.

Clean `.agent/agent/` at end of each session.

`.agent/` and `task_results.jsonl` are gitignored.
