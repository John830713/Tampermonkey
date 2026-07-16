# Safety Rules

## Never modify `.opencode/`
Infrastructure files — modifications break opencode loading.

## Reverting files
`git stash` or `git commit` first. Never overwrite uncommitted work.

## Task runner is single-task
Starting a new task (`/task/<name>`) aborts the current one.

## Never `taskkill /F /IM python.exe`
Kills ALL Python processes. Instead:
1. Read `.agent/server/agent.pid` for the tray PID
2. `Get-Process -Id <pid>` to confirm it's ours
3. `curl localhost:8921/hello` to check if server is alive
4. Kill only that specific PID
