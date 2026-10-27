# Safety Rules

## Never modify `.opencode/`
Infrastructure files — modifications break opencode loading.

## Reverting files
`git stash` or `git commit` first. Never overwrite uncommitted work.

## Task runner is single-task
Starting a new task (`/task/<name>`) aborts the current one. The C++ server has no
task engine yet (`/tasks` returns an empty list), so this only matters if it returns.

## Never `taskkill /F /IM python.exe`
Kills ALL Python processes. The server is no longer Python — it is `D:\Project\Project.exe`
(WebAgent module). Stop that process (or toggle the module) instead of hunting PIDs;
`curl localhost:8921/status` tells you whether the server is alive.
