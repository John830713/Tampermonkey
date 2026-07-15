# Server Performance Baseline — 2026-07-14

## Test Method
- Session: `a_uvpp3f7r` on Google (agent v1.3, old core.js)
- 3 commands: ping, eval, find
- Polling: `send_and_wait` with 0.2s intervals, 15s timeout
- Server: commit `c69a435` (adaptive poll + cache + /metrics)

## Results (OLD core.js — no adaptive poll)

| Command | RTT     | Detail |
|---------|---------|--------|
| ping    | 4,267ms | simple no-op |
| eval    | 4,270ms | document.title → "Google" |
| find    | 4,310ms | selector "input" → 13 elements |

**Average: ~4,282ms**

## Bottleneck
Browser runs old core.js with `setInterval(poll, 1200)`.
Command waits up to 1.2s for next poll, then report waits another 0–1.2s.
Adaptive poll (poll_ms=300) not yet loaded.

## After refresh (NEW core.js)
To be measured after page reload loads new core.js with:
- `schedulePoll()` replacing `setInterval`
- `poll_ms` signal from server (300ms when queue has work)
- `report()` calls `schedulePoll(0)` for immediate re-poll
