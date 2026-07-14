#!/usr/bin/env python3
"""
bench.py — Web Agent Server Benchmark

Measures two things:
  1. Server-side: raw HTTP response time (no Tampermonkey overhead)
  2. Browser-side: command round-trip time via browser (with Tampermonkey overhead)

Usage:
  python benchmarks/bench.py                  # full benchmark
  python benchmarks/bench.py --server-only    # skip browser tests
  python benchmarks/bench.py --label v1.3     # label this run
  python benchmarks/bench.py --rounds 5       # commands per browser test (default: 4)
"""
import sys, os, json, time, argparse, statistics
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

ROOT = Path(__file__).resolve().parent.parent
SERVER = "http://127.0.0.1:8921"

# ──────────────────────── Helpers ────────────────────────

def server_get(path):
    """GET request to server, returns parsed JSON."""
    with urlopen(SERVER + path, timeout=5) as r:
        return json.loads(r.read())

def server_post(path, data):
    """POST JSON to server, returns parsed JSON."""
    body = json.dumps(data).encode()
    req = Request(SERVER + path, body, {"Content-Type": "application/json"})
    with urlopen(req, timeout=5) as r:
        return json.loads(r.read()) if r.status != 204 else None

def find_session():
    """Find an active browser session with agent=1.3."""
    status = server_get("/status")
    for sid, s in status.get("sessions", {}).items():
        if s.get("agent") == "1.3" and not s.get("tracking"):
            return sid
    return None

def measure_server_endpoint(path, rounds=5):
    """Measure raw server response time for a GET endpoint."""
    times = []
    for _ in range(rounds):
        t0 = time.perf_counter()
        try:
            urlopen(SERVER + path, timeout=5).read()
        except URLError:
            pass
        times.append((time.perf_counter() - t0) * 1000)
    return times

def measure_browser_command(session, cmd_data, wait=8):
    """Send a command to browser and measure time until report arrives."""
    cmd_name = cmd_data.get("cmd", "?")

    # Baseline
    url = f"/reports?limit=200&session={session}&cmd={cmd_name}"
    try:
        baseline = len(server_get(url))
    except Exception:
        baseline = 0

    t0 = time.perf_counter()
    server_post("/command", {"_session": session, **cmd_data})

    deadline = time.perf_counter() + wait
    poll = 0.2
    while time.perf_counter() < deadline:
        time.sleep(poll)
        if poll < 1.0:
            poll = min(poll * 1.3, 1.0)
        try:
            reports = server_get(url)
            if len(reports) > baseline:
                rtt = (time.perf_counter() - t0) * 1000
                return {"rtt_ms": round(rtt), "result": reports[-1].get("extra", {})}
        except Exception:
            pass
    return {"rtt_ms": -1, "result": "TIMEOUT"}

def stats(times):
    """Compute stats from a list of numbers."""
    valid = [t for t in times if t > 0]
    if not valid:
        return {"count": 0}
    return {
        "count": len(valid),
        "min": round(min(valid)),
        "max": round(max(valid)),
        "avg": round(statistics.mean(valid)),
        "median": round(statistics.median(valid)),
        "stdev": round(statistics.stdev(valid)) if len(valid) > 1 else 0,
    }

# ──────────────────────── Tests ────────────────────────

def run_server_tests(rounds=5):
    """Test 1: Server-side response times (no Tampermonkey)."""
    print("\n── Server-side (raw HTTP) ──")
    endpoints = {
        "poll (idle)": "/poll?session=_bench&url=about:blank",
        "status":      "/status",
        "metrics":     "/metrics",
        "queue":       "/queue",
        "reports":     "/reports?limit=50",
        "modules":     "/modules",
    }
    results = {}
    for label, path in endpoints.items():
        times = measure_server_endpoint(path, rounds)
        s = stats(times)
        results[label] = {"times": times, **s}
        print(f"  {label:20s}  avg={s.get('avg',0):>5}ms  p50={s.get('median',0):>5}ms  n={s.get('count',0)}")
    return results

def run_browser_tests(session, rounds=4):
    """Test 2: Browser-side command RTT (with Tampermonkey)."""
    print(f"\n── Browser-side (session={session[:12]}) ──")
    commands = [
        ("ping",         {"cmd": "ping"}),
        ("eval (1+1)",   {"cmd": "eval", "code": "1+1"}),
        ("eval (title)", {"cmd": "eval", "code": "document.title"}),
        ("find (input)", {"cmd": "find", "selector": "input"}),
    ]
    results = {}
    for label, cmd in commands:
        times = []
        for _ in range(rounds):
            time.sleep(0.5)  # gap between commands
            r = measure_browser_command(session, cmd)
            times.append(r["rtt_ms"])
        s = stats(times)
        results[label] = {"times": times, **s}
        print(f"  {label:20s}  avg={s.get('avg',0):>5}ms  p50={s.get('median',0):>5}ms  n={s.get('count',0)}")
    return results

def get_browser_rtt(session):
    """Read browser-side RTT measurement from __webAgent.rtt()."""
    try:
        r = measure_browser_command(session, {
            "cmd": "eval",
            "code": "JSON.stringify(__webAgent.rtt())"
        }, wait=10)
        result_str = r.get("result", {}).get("result", "{}")
        return json.loads(result_str) if isinstance(result_str, str) else {}
    except Exception:
        return {}

# ──────────────────────── Main ────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Web Agent Benchmark")
    parser.add_argument("--server-only", action="store_true", help="Skip browser tests")
    parser.add_argument("--label", default="", help="Label for this run (e.g. commit hash)")
    parser.add_argument("--rounds", type=int, default=4, help="Rounds per browser test")
    parser.add_argument("--server-rounds", type=int, default=5, help="Rounds per server test")
    args = parser.parse_args()

    print("=" * 60)
    print("Web Agent Server Benchmark")
    print(f"  Server: {SERVER}")
    print(f"  Label:  {args.label or '(none)'}")
    print(f"  Time:   {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Check server
    try:
        metrics = server_get("/metrics")
        print(f"  Server uptime: {metrics.get('uptime', 0):.0f}s")
    except Exception:
        print("  ERROR: Server not reachable at " + SERVER)
        sys.exit(1)

    # Server tests
    server_results = run_server_tests(args.server_rounds)

    # Browser tests
    browser_results = {}
    browser_rtt = {}
    if not args.server_only:
        session = find_session()
        if not session:
            print("\n  WARNING: No browser session found. Skipping browser tests.")
            print("  Open a page with the agent loaded, then re-run.")
        else:
            browser_results = run_browser_tests(session, args.rounds)
            browser_rtt = get_browser_rtt(session)
            if browser_rtt:
                print(f"\n  Browser RTT: avg={browser_rtt.get('avg', '?')}ms  samples={len(browser_rtt.get('samples', []))}")

    # Build output
    output = {
        "version": 1,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "label": args.label,
        "git_commit": os.popen("git -C " + str(ROOT) + " rev-parse --short HEAD").read().strip(),
        "server": {
            "url": SERVER,
            "uptime_s": metrics.get("uptime", 0),
            "threaded": True,
        },
        "server_tests": server_results,
        "browser_tests": browser_results,
        "browser_rtt": browser_rtt,
    }

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print(f"  Server avg response:  {server_results.get('poll (idle)', {}).get('avg', '?')}ms")
    if browser_results:
        all_browser_avg = [v.get("avg", 0) for v in browser_results.values() if v.get("avg", 0) > 0]
        if all_browser_avg:
            overall = round(statistics.mean(all_browser_avg))
            print(f"  Browser avg command:  {overall}ms")
    if browser_rtt:
        print(f"  Browser HTTP RTT:     {browser_rtt.get('avg', '?')}ms")
    print("=" * 60)

    # Save
    outdir = ROOT / "benchmarks" / "results"
    outdir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    label_part = f"-{args.label}" if args.label else ""
    outpath = outdir / f"bench-{ts}{label_part}.json"
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {outpath}")

    return output

if __name__ == "__main__":
    main()
