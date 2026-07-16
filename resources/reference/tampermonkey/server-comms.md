# Server Communication

與本地 Flask server (`localhost:8921`) 通訊的腳本共用以下模式：

| 腳本 | 角色 | 端點 |
|------|------|------|
| debug-toolkit.js | 發送 | `POST /dump`、`POST /hidden` |
| anime1-infinite-scroll.js | 接收 | `GET /hidden` |
| universal.loader.user.js | 接收 | `GET /agent/core.js`、`GET /modules`、`GET /serve/*` |
| core.js | 雙向 | `GET/POST /poll`、`POST /hello`、`POST /dump` |

新增腳本如需 server 通訊，共用 `const SERVER = window.__agent_server || 'http://localhost:8921';`
