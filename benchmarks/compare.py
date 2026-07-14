#!/usr/bin/env python3
"""
compare.py — Compare two benchmark results

Usage:
  python benchmarks/compare.py results/bench-20260714-180000.json results/bench-20260714-190000.json
  python benchmarks/compare.py --latest 2   # compare last 2 runs
"""
import sys, json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT / "benchmarks" / "results"

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def delta(old, new):
    """Compute delta between two values. Returns (delta, pct_change)."""
    if old == 0 or old is None or new is None:
        return None, None
    d = new - old
    pct = round(d / old * 100, 1) if old else None
    return d, pct

def fmt_delta(d, pct, unit="ms"):
    """Format delta for display."""
    if d is None:
        return "  (no data)"
    sign = "+" if d > 0 else ""
    color = "\033[31m" if d > 0 else "\033[32m" if d < 0 else ""
    reset = "\033[0m" if color else ""
    return f"{color}{sign}{d}{unit} ({sign}{pct}%){reset}"

def compare(a, b):
    """Compare two benchmark results."""
    print(f"{'Metric':<25s} {'A':>8s} {'B':>8s} {'Delta':>20s}")
    print("-" * 65)

    # Server tests
    print("\n── Server-side ──")
    for label in a.get("server_tests", {}):
        a_avg = a["server_tests"][label].get("avg")
        b_avg = b.get("server_tests", {}).get(label, {}).get("avg")
        d, pct = delta(a_avg, b_avg)
        print(f"  {label:<23s} {a_avg:>7}ms {b_avg:>7}ms {fmt_delta(d, pct)}")

    # Browser tests
    if a.get("browser_tests") and b.get("browser_tests"):
        print("\n── Browser-side ──")
        for label in a.get("browser_tests", {}):
            a_avg = a["browser_tests"][label].get("avg")
            b_avg = b.get("browser_tests", {}).get(label, {}).get("avg")
            d, pct = delta(a_avg, b_avg)
            print(f"  {label:<23s} {a_avg:>7}ms {b_avg:>7}ms {fmt_delta(d, pct)}")

    # Browser RTT
    a_rtt = a.get("browser_rtt", {}).get("avg")
    b_rtt = b.get("browser_rtt", {}).get("avg")
    if a_rtt and b_rtt:
        d, pct = delta(a_rtt, b_rtt)
        print(f"\n  {'Browser HTTP RTT':<23s} {a_rtt:>7}ms {b_rtt:>7}ms {fmt_delta(d, pct)}")

    # Overall
    a_labels = ["A", "B"]
    a_files = [a.get("label") or a.get("git_commit", "?"), b.get("label") or b.get("git_commit", "?")]
    a_times = [a.get("timestamp", "?")[:16], b.get("timestamp", "?")[:16]]

    print(f"\n  A: {a_files[0]} ({a_times[0]})")
    print(f"  B: {a_files[1]} ({a_times[1]})")

def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--latest":
        n = int(sys.argv[2])
        files = sorted(RESULTS_DIR.glob("bench-*.json"))[-n:]
        if len(files) < 2:
            print(f"Need at least 2 results, found {len(files)}")
            sys.exit(1)
        a, b = load(files[0]), load(files[1])
    elif len(sys.argv) == 3:
        a, b = load(sys.argv[1]), load(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)

    compare(a, b)

if __name__ == "__main__":
    main()
