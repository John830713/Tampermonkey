# Environment Setup Checklist

For setting up a new machine to work on the Tampermonkey userscripts project.

## Prerequisites

- [ ] Python 3.8+ installed (`python --version`)
- [ ] pip installed (`pip --version`)
- [ ] Flask installed (`pip install flask`)
- [ ] Git installed (`git --version`)
- [ ] Node.js LTS installed (`node --version`) — via `winget install OpenJS.NodeJS.LTS`
- [ ] npm available (`npm --version`)

## Verify

```bash
python --version        # 3.8+
pip --version           # latest
git --version           # any recent
node --version          # v24+
npm --version           # v11+
```

## Server

```bash
cd D:\Tampermonkey
python resources\tools\tray.py          # starts on port 8921
curl localhost:8921/hello               # should return OK
```

## Optional Tools

| Tool | Install | Purpose |
|------|---------|---------|
| [httpx](https://pypi.org/project/httpx/) | `pip install httpx` | Better HTTP client than curl for API testing |
| [jq](https://stedolan.github.io/jq/) | `winget install jqlang.jq` | JSON query CLI |

## Notes

- Node.js is needed for Chrome DevTools Protocol (CDP) tools and Puppeteer/Playwright
- PowerShell execution policy may block npm.ps1 — use `cmd /c "npm ..."` as workaround, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- This checklist is for reference across machines. Keep updated when adding new dependencies.
