"""
send_cmd.py — Send commands to agent browser sessions (UTF-8 safe).

Usage:
  python send_cmd.py <session> eval <code>
  python send_cmd.py <session> find <selector> [text]
  python send_cmd.py <session> find_and_click <selector> [text]
  python send_cmd.py <session> click <index>
  python send_cmd.py <session> type <index> <text>
  python send_cmd.py <session> wait <ms>
  python send_cmd.py <session> navigate <url>
  python send_cmd.py <session> ping
  python send_cmd.py <session> raw <json>
  python send_cmd.py reports [session] [--drain]

Flags:
  --nowait      Send command without waiting for result
  --timeout N   Seconds to wait for response (default: 8)

Examples:
  python send_cmd.py abc123 eval "document.title"
  python send_cmd.py abc123 eval "\\u4f60\\u597d"          # 你好 via unicode escape
  python send_cmd.py abc123 find "textarea"
  python send_cmd.py abc123 find_and_click "button[type=submit]"
  python send_cmd.py abc123 type 0 "Hello world"
  python send_cmd.py abc123 ping --nowait
  python send_cmd.py reports abc123
  python send_cmd.py reports --drain
"""

import sys
import json
import time
import urllib.request
import urllib.error

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SERVER = "http://127.0.0.1:8921"


def post(path, data=None):
    url = SERVER + path
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body,
                                headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"ERROR: server not reachable: {e}", file=sys.stderr)
        sys.exit(1)


def get(path):
    url = SERVER + path
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"ERROR: server not reachable: {e}", file=sys.stderr)
        sys.exit(1)


def send_and_wait(session, cmd_data, wait=8):
    """Send a command and poll for the matching report from this session."""
    cmd_name = cmd_data.get("cmd", "?")

    # Get baseline count BEFORE sending (avoids race condition)
    try:
        existing = get(f"/reports?limit=200&session={session}&cmd={cmd_name}")
        seen_count = len(existing)
    except Exception:
        seen_count = 0

    cmd_data["_session"] = session
    post("/command", cmd_data)

    deadline = time.time() + wait
    poll_interval = 0.3  # start fast
    while time.time() < deadline:
        time.sleep(poll_interval)
        if poll_interval < 1.0:
            poll_interval = min(poll_interval * 1.5, 1.0)
        reports = get(f"/reports?limit=200&session={session}&cmd={cmd_name}")
        if len(reports) > seen_count:
            return reports[-1]
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    # reports subcommand
    if sys.argv[1] == "reports":
        sess = ""
        drain = False
        for arg in sys.argv[2:]:
            if arg == "--drain":
                drain = True
            else:
                sess = arg
        path = "/reports?limit=50"
        if sess:
            path += f"&session={sess}"
        if drain:
            path += "&drain=1"
        data = get(path)
        for r in data:
            extra = r.get("extra", "")
            if isinstance(extra, dict):
                extra = json.dumps(extra, ensure_ascii=False)
            print(f"[{r.get('session')}] {r.get('cmd')} → {extra}")
        return

    session = sys.argv[1]
    if len(sys.argv) < 3:
        print("Usage: send_cmd.py <session> <cmd> [args...] [--nowait] [--timeout N]", file=sys.stderr)
        sys.exit(1)

    # Parse flags
    nowait = "--nowait" in sys.argv
    timeout = 8
    for i, arg in enumerate(sys.argv):
        if arg == "--timeout" and i + 1 < len(sys.argv):
            try: timeout = int(sys.argv[i + 1])
            except ValueError: pass

    # Remove flags from argv for positional parsing
    args = [a for a in sys.argv[3:] if a not in ("--nowait") and not a.startswith("--")]
    verb = sys.argv[2]

    if verb == "eval":
        code = args[0] if args else ""
        if nowait:
            cmd_data = {"cmd": "eval", "code": code, "_session": session}
            post("/command", cmd_data)
            print(f"Sent eval to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "eval", "code": code}, wait=timeout)
    elif verb == "find":
        sel = args[0]
        text = args[1] if len(args) > 1 else None
        d = {"cmd": "find", "selector": sel}
        if text: d["text"] = text
        if nowait:
            d["_session"] = session
            post("/command", d)
            print(f"Sent find to {session} (not waiting)")
            return
        result = send_and_wait(session, d, wait=timeout)
    elif verb == "find_and_click":
        sel = args[0]
        text = args[1] if len(args) > 1 else None
        d = {"cmd": "find_and_click", "selector": sel}
        if text: d["text"] = text
        if nowait:
            d["_session"] = session
            post("/command", d)
            print(f"Sent find_and_click to {session} (not waiting)")
            return
        result = send_and_wait(session, d, wait=timeout)
    elif verb == "click":
        idx = int(args[0])
        if nowait:
            post("/command", {"cmd": "click", "index": idx, "_session": session})
            print(f"Sent click to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "click", "index": idx}, wait=timeout)
    elif verb == "type":
        idx = int(args[0])
        text = args[1]
        if nowait:
            post("/command", {"cmd": "type", "index": idx, "text": text, "_session": session})
            print(f"Sent type to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "type", "index": idx, "text": text}, wait=timeout)
    elif verb == "wait":
        ms = int(args[0])
        if nowait:
            post("/command", {"cmd": "wait", "ms": ms, "_session": session})
            print(f"Sent wait to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "wait", "ms": ms}, wait=timeout)
    elif verb == "navigate":
        url = args[0]
        if nowait:
            post("/command", {"cmd": "navigate", "url": url, "_session": session})
            print(f"Sent navigate to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "navigate", "url": url}, wait=timeout)
    elif verb == "ping":
        if nowait:
            post("/command", {"cmd": "ping", "_session": session})
            print(f"Sent ping to {session} (not waiting)")
            return
        result = send_and_wait(session, {"cmd": "ping"}, wait=timeout)
    elif verb == "raw":
        d = json.loads(args[0])
        if nowait:
            d["_session"] = session
            post("/command", d)
            print(f"Sent raw to {session} (not waiting)")
            return
        result = send_and_wait(session, d, wait=timeout)
    else:
        print(f"Unknown command: {verb}", file=sys.stderr)
        sys.exit(1)

    if result:
        extra = result.get("extra", "")
        if isinstance(extra, dict):
            extra = json.dumps(extra, ensure_ascii=False, indent=2)
        print(f"[{result.get('session')}] {result.get('cmd')} → {extra}")
    else:
        print("No response received (timeout)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
