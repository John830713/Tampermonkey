# Tampermonkey Userscripts + Web Agent

Two halves in one repo: standalone Tampermonkey userscripts and a browser-agent framework with a Python Flask server. **No build, no tests, no lint, no typecheck.** Requires Python 3.8+ and Flask (`pip install flask`).

---

## Safety

- **NEVER modify `.opencode/`** — infrastructure files; modifications break opencode loading.
- **Before reverting any file:** `git stash` or `git commit` first. Never overwrite uncommitted work.
- **Task runner is single-task:** starting a new task aborts the current one (`/task/<name>`).
- **NEVER `taskkill /F /IM python.exe`** — kills ALL Python processes. Instead:
  1. Read `agent.pid` for the tray PID
  2. `Get-Process -Id <pid>` to confirm it's ours
  3. `curl localhost:8921/hello` to check if server is alive
  4. Kill only that specific PID if confirmed

## Git Workflow

**Every file change must be committed immediately after making it.** Do not wait for user confirmation. Do not batch changes across turns. If you edited a file, `git add` + `git commit` right away. This overrides any default that says "do not commit unless asked."

### 流程

1. **確認改完** — `git diff` 檢查所有改動，確認沒有漏改
2. **立即 commit** — 改完就 commit，不要等用戶說「commit」
3. **分類 commit** — 不同功能/檔案分開 commit（[git\spec.md](file:///D:/Agent/resources/tools/common/git/spec.md)）
4. **不要手動 push** — 除非用戶明確說「push」或「送」

### 注意事項

- Commit any change that exists — better to over-commit and squash later than to miss one
- Never commit secrets or credentials
- Write concise commit messages describing the change
- Split logical changes into separate commits
- Do NOT push unless the user explicitly says so

## Temp Files (`.agent/`)

All agent-produced temp files go to `.agent/`. **Never** write to project root.

| Type | Directory | Purpose |
|------|-----------|---------|
| Browser data | `.agent/browser/` | WAI element dumps, screenshots, hidden selectors |
| Server output | `.agent/server/` | `server_log.txt` (tray/server log) |
| Agent work | `.agent/agent/` | Eval request JSON, temp work files |
| Trash | `.agent/trash/` | Pending deletion (gitignored, recoverable) |

`element_dump.json` and `hidden_selectors.json` are in `.agent/browser/`.

**Index chain:** When modifying any `.agent/` path, read `.agent/INDEX.md` to check if it's still accurate. If not, update it. Also grep `*.md` and `*.py` for stale references and fix them.

Clean `.agent/agent/` at end of each session.

## Dev Loop

```bash
python resources\tools\tray.py          # port 8921
python resources\tools\tray.py 9999     # custom port
run.bat                                 # auto-selects console/headless per server_config.json
```

Server code: `resources/tools/server.py`. **Tray auto-restarts on file change — no manual restart needed.**

Edit files in `agent/` or `modules/` → tray auto-detects → refresh page. Universal loader fetches `core.js` fresh on every page load — **no Tampermonkey reinstall** for core changes. `modules.json` polled every 60s; changes trigger auto-reload.

**Port change requires two edits:** `server_config.json` + `agent/universal.loader.user.js:26` (`SERVER_PORT`). `core.js` reads port from `window.__agent_server`.

## Modules

`modules/modules.json` is a **JSON array** (not keyed object). Each entry: `name`, `enabled`, `match` (URL patterns), `script`, `grants`. Add `.js` to `modules/` + entry in `modules.json`. Module toggle panel (⚙ button) stores per-site overrides in `localStorage('a1_mod_overrides')`.

## Tampermonkey Script Rules

- **DOM:** Always `createElement` + `textContent`, never `innerHTML`. Trusted Types CSP blocks it.
- **Event handlers:** Bind immediately after creating the element, before any other logic. Ensures UI stays interactive even if later code crashes.
- **eval/new Function:** Metadata must include `@grant unsafeEval`.
- **Debug flow:** UI appears but unresponsive → check console errors → check elements panel → then consider event interception.

## Server Interaction

- **Batch eval:** Pack multiple checks into one eval, poll once for all results. Don't串行 serial.
- **Minimal polling:** Only poll `/reports` when you actually need results.
- **eval limit:** Default 2000 chars. Configurable: `{"cmd":"set_config","key":"evalLimit","value":8000}`.
- **Navigate kills sessions:** After `navigate`, page reloads with new session. Check `/status` for active session.
- **Commands are serialized:** Next `yield` won't execute until current command's report arrives.
- **Tracking domain filter:** `server.py` silently drops sessions from ad/tracking domains.
- **Tampermonkey download:** `GM_xmlhttpRequest` blob + `<a>.click()` doesn't work for downloads. Use `GM_download`.

## Web Element Inspector (WAI)

`web-element-inspector.js` — hover to preview, click to mark elements. Core debug tool.

- Marked elements auto-numbered: 元件1, 元件2, ...
- Results stored in `.agent/browser/element_dump.json`
- When user says "元件1", **always read `.agent/browser/element_dump.json` first** to identify the element
- Dump includes: `label`, `tag`, `id`, `selector`, `parentChain`, `computed` styles

### 工作流程

1. User marks elements with WAI in browser
2. WAI auto-POSTs to server `/dump` + `/hidden`
3. Results saved to `.agent/browser/element_dump.json`
4. User tells agent "元件1 有問題" → agent reads dump → knows which element → debugs

## Agent Mode

When user asks to operate the browser (check-in, scrape, download, etc.):

1. Read `.agent/LOGS/` latest log — resume from last interruption
2. Read `.agent/TASKS/Standing/` — check for pending standing tasks
3. Execute tasks
4. Write `.agent/LOGS/YYYY-MM-DD.md` — 3-5 line summary on completion

**Log format:**
```markdown
# YYYY-MM-DD
## 做了什麼
- One or two sentences
## 關鍵發現
- Technical findings (omit if none)
## 下次
- Unfinished work (omit if none)
```

**TASKS structure:**
- `Standing/` — long-term automated tasks (per `resources/skills/task-authoring.md`)
- `Adhoc/` — one-off tasks, move to `RESULTS/` when done
- `Scheduled/` — scheduled tasks, named `YYYY-MM-DD-NNN`

---

## Reference Lookup

Need specific info? Follow the decision tree:

1. **I know how** — just do it
2. **I know the tool but need details** — read `resources/skills/` or `resources/reference/`
3. **Not sure if it exists** — read `resources/INDEX.md` first to find the right file

| Need | Location |
|------|----------|
| New Tampermonkey script / design patterns | `resources/reference/spec.md` — DOM, CSS, Popup/Modal, Rate Limiting, infinite scroll, page navigator, Overlay |
| Browser automation | `resources/skills/web-operation.md` — full operation flow |
| Server eval debug | `resources/skills/web-operation.md` § Server Debug via Eval |
| Task authoring | `resources/skills/task-authoring.md` — Python generator format |
| Troubleshooting | `resources/skills/troubleshooting.md` — common issues |
| Server API endpoints | `README.md` — API endpoint table |
| Full architecture diagram | `README.md` — architecture section |
| Web Element Inspector | See WAI section above |
| Git spec | `D:\Agent\resources\tools\common\git\spec.md` |

`.agent/` and `task_results.jsonl` are gitignored.
