# Agent Mode

When the user asks to operate the browser (check-in, scrape, download, etc.):

1. Read latest `.agent/LOGS/` — resume from last interruption
2. Read `.agent/TASKS/Standing/` — check for pending standing tasks
3. Execute tasks
4. Write `.agent/LOGS/YYYY-MM-DD.md` — 3-5 line summary on completion

## Log format

```markdown
# YYYY-MM-DD
## 做了什麼
- One or two sentences
## 關鍵發現
- Technical findings (omit if none)
## 下次
- Unfinished work (omit if none)
```

## TASKS structure

| Directory | Purpose |
|-----------|---------|
| `Standing/` | Long-term automated tasks |
| `Adhoc/` | One-off tasks; move to `RESULTS/` when done |
| `Scheduled/` | Scheduled tasks, named `YYYY-MM-DD-NNN` |

## Server interaction during agent mode

- Commands are **serialized**: next `yield` won't execute until current command's report arrives
- `navigate` kills the current session (page reload = new session)
- Check `/status` for active session after navigation
- **Tracking domains**: `server.py` silently drops sessions from ad/tracking domains

## eval limits

- Default: 2000 chars
- Increase with: `{"cmd":"set_config","key":"evalLimit","value":8000}`
- **Batch eval**: pack multiple checks into one eval, poll once for all results
