# API Endpoints

All endpoints are served by `D:\Project\Project.exe` → `Modules/WebAgent` on `localhost:8921`
(port/bind/root configured in `D:\Project\Config\Config_WebAgent.ini`). The Python Flask
implementation that used to serve them was removed.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Server status, sessions, task progress |
| GET | `/tasks` | List available tasks |
| GET | `/reports?limit=N` | Recent N reports |
| POST | `/hello` | Session registration (auto-called by agent) |
| GET | `/poll?session=&state=&url=&title=` | Agent polling (auto-called) |
| POST | `/poll?session=` | Poll + return last result (merged poll+report) |
| POST | `/report` | Agent report (auto-called) |
| POST | `/task/<name>` | Start a task |
| POST | `/task/stop` | Stop current task |
| POST | `/command` | Push a single command |
| POST | `/commands` | Push multiple commands (JSON array) |
| POST | `/dump` | WAI element dump (screenshots, parent chain, page summary) |
| GET | `/dump` | Read latest dump data |
| POST | `/hidden` | Add hidden selectors `{selectors: [...], url: "..."}` |
| GET | `/hidden` | Read hidden selectors list |
| DELETE | `/hidden` | Clear hidden selectors |
| GET | `/modules` | Module config (JSON) |
| GET | `/universal.loader.user.js` | Universal loader script |
| GET | `/agent.core.js` | Agent core code |
| GET | `/serve/<name>.user.js` | Generic script serving |

Dropped with the Python tree: `/loader-core.js`, `/agent.user.js`, `/agent.loader.user.js`.
