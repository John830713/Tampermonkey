# Server Performance Comparison — 2026-07-14

## Architecture Change
```
OLD: poll() → send → wait RTT → callback → schedulePoll() → cycle = RTT + interval
NEW: poll() → schedulePoll() → send → wait RTT → callback → cycle = interval only
```

## Key Finding: GM_xmlhttpRequest is the bottleneck
- Browser-side RTT (measured by `__webAgent.rtt()`): **~1000ms** per request
- This is Tampermonkey's extension layer overhead, NOT the server
- Server response time (Python urllib): **<5ms**
- Each command requires 2 browser↔server round-trips: pick up + report

## Results Comparison

| Metric | OLD (baseline) | NEW (optimized) | Change |
|--------|---------------|-----------------|--------|
| avg RTT | 6,017ms | 5,315ms | -12% |
| best case | 4,311ms | 4,221ms | -2% |
| worst case | 6,592ms | 6,419ms | -3% |

## Why the improvement is limited
1. **GM_xmlhttpRequest ~1s overhead** — can't optimize from server side
2. **Poll cycle = 1.2s interval** — browser polls every 1.2s
3. **2 round-trips per command** — pick up (1s) + report (1s) = 2s minimum
4. **Best possible RTT** = poll_wait(0-1.2s) + RTT(1s) + report_RTT(1s) = **2-3.2s**

## What DID improve
- **poll_ms signal**: server tells browser to poll faster when queue has work
- **Adaptive poll**: 300ms when busy, 1200ms when idle
- **Threaded Flask**: concurrent request handling
- **Task cache**: /status no longer re-reads .py files every 3s
- **Queue limit**: MAX_QUEUE=100 prevents memory explosion
- **Session dedup**: /hello + /poll no longer double-register
- **send_cmd.py**: --nowait, --timeout, command-matching wait, baseline-first query

## Remaining work
- Consider WebSocket for real-time push (eliminates poll overhead)
- Or use `fetch()` streaming for long-poll
- Or accept 4-6s as baseline for Tampermonkey-based agent
