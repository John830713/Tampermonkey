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

Examples:
  python send_cmd.py abc123 eval "document.title"
  python send_cmd.py abc123 eval "\\u4f60\\u597d"          # 你好 via unicode escape
  python send_cmd.py abc123 find "textarea"
  python send_cmd.py abc123 find_and_click "button[type=submit]"
  python send_cmd.py abc123 type 0 "Hello world"
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

SERVER = "http://localhost:8921"


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
    """Send a command and poll for the report from this session."""
    cmd_data["_session"] = session
    post("/command", cmd_data)

    deadline = time.time() + wait
    seen = set()
    while time.time() < deadline:
        time.sleep(1.0)
        reports = get(f"/reports?limit=100&session={session}")
        for r in reports:
            key = f"{r.get('cmd')}:{r.get('extra')}"
            if key not in seen:
                seen.add(key)
        # Return the latest report
        if reports:
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
        print("Usage: send_cmd.py <session> <cmd> [args...]", file=sys.stderr)
        sys.exit(1)

    verb = sys.argv[2]

    if verb == "eval":
        code = sys.argv[3] if len(sys.argv) > 3 else ""
        result = send_and_wait(session, {"cmd": "eval", "code": code})
    elif verb == "find":
        sel = sys.argv[3]
        text = sys.argv[4] if len(sys.argv) > 4 else None
        d = {"cmd": "find", "selector": sel}
        if text:
            d["text"] = text
        result = send_and_wait(session, d)
    elif verb == "find_and_click":
        sel = sys.argv[3]
        text = sys.argv[4] if len(sys.argv) > 4 else None
        d = {"cmd": "find_and_click", "selector": sel}
        if text:
            d["text"] = text
        result = send_and_wait(session, d)
    elif verb == "click":
        idx = int(sys.argv[3])
        result = send_and_wait(session, {"cmd": "click", "index": idx})
    elif verb == "type":
        idx = int(sys.argv[3])
        text = sys.argv[4]
        result = send_and_wait(session, {"cmd": "type", "index": idx, "text": text})
    elif verb == "wait":
        ms = int(sys.argv[3])
        result = send_and_wait(session, {"cmd": "wait", "ms": ms})
    elif verb == "navigate":
        url = sys.argv[3]
        result = send_and_wait(session, {"cmd": "navigate", "url": url})
    elif verb == "ping":
        result = send_and_wait(session, {"cmd": "ping"})
    elif verb == "raw":
        d = json.loads(sys.argv[3])
        result = send_and_wait(session, d)
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
