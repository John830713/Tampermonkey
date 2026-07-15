#!/usr/bin/env python3
"""
Web Agent Server ??command queue + generator-based task system + dashboard.

Usage:
    python server.py              # port 8921
    python server.py 9999         # custom port
    http://localhost:8921          # dashboard
"""
import json, os, sys, time, queue, threading, logging, importlib.util, traceback
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, render_template_string

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('agent')

ROOT = Path(__file__).resolve().parent.parent.parent.parent
RESOURCES = ROOT / 'resources'
TASKS_DIR = ROOT / 'tasks'
TASKS_DIR.mkdir(exist_ok=True)

RESULTS_FILE = ROOT / 'task_results.jsonl'

def append_task_result(name, result):
    """Append a JSON line to the persistent results file."""
    import json
    entry = {
        'time': datetime.now().isoformat(),
        'task': name,
        'result': result,
    }
    try:
        with open(str(RESULTS_FILE), 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except Exception as e:
        log.warning(f'[results] failed to write: {e}')

app = Flask(__name__)

# ??? CORS (allow sendBeacon / fetch from any origin) ????????????
@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp

# ??? State ??????????????????????????????????????????????????????
sessions  = {}              # sid -> {url, title, last_seen, state}
cmd_queue = queue.Queue()   # manual command queue
_pending_filtered = []      # commands with _session filter that didn't match yet
reports   = []              # all reports (ring buffer, max 500)
task_runner = None          # current GeneratorRunner
runner_lock = threading.RLock()
SESSION_TTL = 300           # auto-expire sessions after 5 min idle
MAX_QUEUE = 100             # max pending commands
CFG_POLL_BUSY = 300         # tell browser to poll faster when task active
CFG_POLL_IDLE = 1200        # normal poll interval
_task_cache = {}            # {name: gen_func} cached
_task_cache_ts = 0          # last load time

# Tracking/ad domains whose sessions should not receive task commands
TRACKING_DOMAINS = frozenset([
    'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
    'google-analytics.com', 'googletagmanager.com', 'facebook.com/tr',
    'adsrvr.org', 'adservice.google.com',
    'pubmatic.com', 'inmobi.com', 'criteo.com', 'rubiconproject.com',
    'openx.net', 'adnxs.com', 'indexww.com', 'id5-sync.com',
    'sharethrough.com', 'casalemedia.com', 'turn.com', 'bidswitch.net',
    'adsymptotic.com', 'onaudience.com', 'smartadserver.com',
])

def _is_tracking_url(url):
    """Check if a URL belongs to a known tracking/ad domain."""
    import urllib.parse
    try:
        host = urllib.parse.urlparse(url).hostname or ''
        for td in TRACKING_DOMAINS:
            if td in host:
                return True
        # Also flag extremely long URLs with tracking fingerprints
        if len(url) > 500:
            return True
    except Exception:
        pass
    return False

def _cleanup_sessions():
    """Remove sessions idle for more than SESSION_TTL seconds."""
    now = time.time()
    expired = [sid for sid, s in sessions.items()
               if now - s.get('last_seen', 0) > SESSION_TTL]
    for sid in expired:
        del sessions[sid]
    if expired:
        log.info(f'[cleanup] removed {len(expired)} idle sessions')

# ??? Generator-based Task Runner ????????????????????????????????
class GeneratorRunner:
    """
    Wraps a generator function that yields command dicts
    and receives report dicts via .send().

        def my_task():
            r1 = yield {"cmd": "navigate", "url": "..."}
            r2 = yield {"cmd": "wait", "ms": 3000}
            ...
            return {"status": "ok"}   # final result
    """
    def __init__(self, name, gen_func):
        self.name = name
        self.gen   = gen_func()
        self.done  = False
        self.error = None
        self.started_at = time.time()
        self.pending_cmd = None   # command waiting to be consumed by /poll
        self._step_count = 0
        self.result = None
        self._claimed_session = None   # sid of the session executing this task

        try:
            self.pending_cmd = next(self.gen)
        except StopIteration as e:
            self.done = True
            self.result = e.value
            append_task_result(self.name, e.value)

    @property
    def step(self):
        return self._step_count

    def pop_cmd(self, session_id=None):
        """Called by /poll ??returns next command, auto-advances on navigate.

        If session_id is set and a previous session has claimed this task,
        only that session may receive the next command.
        """
        with runner_lock:
            if self.done or self.error:
                return None
            if self.pending_cmd is None:
                return None

            # Only deliver to the session that claimed this task
            if self._claimed_session is not None and session_id != self._claimed_session:
                return None

            cmd = self.pending_cmd
            self.pending_cmd = None

            # First poller to get a non-wait command claims the task
            if self._claimed_session is None:
                self._claimed_session = session_id
                log.info(f'[task] claimed by session {session_id}')

            # Auto-advance for navigate: page navigation may kill the report
            if cmd.get('cmd') == 'navigate':
                log.info(f'[task] auto-advance after navigate (releasing session claim)')
                self._claimed_session = None  # page reload ??new session
                try:
                    self._step_count += 1
                    self.pending_cmd = next(self.gen)
                except StopIteration as e:
                    self.done = True
                    self.result = e.value
                    self.pending_cmd = None
                    append_task_result(self.name, e.value)
                    log.info(f'[task] {self.name} finished ??{e.value}')

            return cmd

    def feed_report(self, report_data):
        """Called by /report ??pushes report into generator."""
        with runner_lock:
            if self.done or self.error:
                return
            # If generator already advanced (e.g. auto-advance from navigate),
            # this report is stale ??ignore it
            if self.pending_cmd is not None:
                log.debug(f'[task] ignore stale report for {report_data.get("cmd")}')
                return
            try:
                self._step_count += 1
                self.pending_cmd = self.gen.send(report_data)
            except StopIteration as e:
                self.done = True
                self.result = e.value
                self.pending_cmd = None
                append_task_result(self.name, e.value)
                log.info(f'[task] {self.name} finished ??{e.value}')
            except Exception as e:
                self.error = str(e)
                self.pending_cmd = None
                append_task_result(self.name, {'status': 'error', 'error': str(e)})
                log.warning(f'[task] {self.name} error: {e}\n{traceback.format_exc()}')

    def abort(self, reason):
        with runner_lock:
            self.error = reason
            try:
                self.gen.close()
            except Exception:
                pass
            append_task_result(self.name, {'status': 'aborted', 'reason': reason})
            log.warning(f'[task] {self.name} aborted: {reason}')

# ??? Task loader ????????????????????????????????????????????????
def load_tasks():
    """Return {name: gen_func} from task modules (cached 5s)."""
    global _task_cache, _task_cache_ts
    now = time.time()
    if _task_cache and (now - _task_cache_ts) < 5:
        return _task_cache
    tasks = {}
    for f in sorted(TASKS_DIR.glob('*.py')):
        if f.stem == '__init__':
            continue
        try:
            spec = importlib.util.spec_from_file_location(f.stem, str(f))
            mod  = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if hasattr(mod, 'get_task'):
                tasks[f.stem] = mod.get_task
        except Exception as e:
            log.warning(f'[task] load fail {f.name}: {e}')
    _task_cache = tasks
    _task_cache_ts = now
    return tasks

# ??? Routes ?????????????????????????????????????????????????????

@app.route('/hello', methods=['POST'])
def hello():
    data = request.get_json(force=True)
    sid = data.get('session', '?')
    url = data.get('url', '')
    sessions[sid] = {
        'url':      url,
        'title':    data.get('title', ''),
        'last_seen': time.time(),
        'state':    'IDLE',
        'agent':    data.get('agentVersion', '?'),
        'tracking': _is_tracking_url(url),
    }
    log.info(f'[hello] {sid} {url}')
    return jsonify({'ok': True})

@app.route('/tag', methods=['POST'])
def tag_session():
    data = request.get_json(force=True)
    sid = data.get('session', '')
    tag_val = data.get('tagged', True)
    if sid and sid in sessions:
        sessions[sid]['tagged'] = bool(tag_val)
        log.info(f'[tag] {sid} tagged={tag_val}')
    return '', 204

@app.route('/poll', methods=['GET', 'POST'])
def poll():
    sid = request.args.get('session', '?')
    t0 = time.time()

    # Accept merged result from browser (POST body)
    if request.method == 'POST' and request.data:
        try:
            result_data = request.get_json(force=True)
            if result_data and result_data.get('cmd'):
                result_data['time'] = time.time()
                reports.append(result_data)
                if len(reports) > 500:
                    reports[:] = reports[-500:]
                log.info(f'[report] {sid} {result_data.get("cmd")}={result_data.get("result")}')
                with runner_lock:
                    if task_runner and not task_runner.done and not task_runner.error:
                        task_runner.feed_report(result_data)
        except Exception:
            pass

    # Session registration (skip if already registered — avoids duplicate from /hello + /poll)
    if sid not in sessions:
        url = request.args.get('url', '')
        sessions[sid] = {
            'url': url, 'title': '', 'last_seen': time.time(),
            'state': 'IDLE', 'agent': '?', 'tracking': _is_tracking_url(url),
        }
        log.info(f'[session] new {sid} tracking={_is_tracking_url(url)}')
    else:
        sessions[sid]['last_seen'] = time.time()
        url = request.args.get('url', '')
        if url:
            sessions[sid]['url'] = url
        sessions[sid]['tracking'] = _is_tracking_url(sessions[sid].get('url', ''))

    # 1) Active task (thread-safe) — delivered only to non-tracking sessions
    with runner_lock:
        if task_runner and not task_runner.done and not task_runner.error:
            if not sessions[sid].get('tracking'):
                cmd = task_runner.pop_cmd(session_id=sid)
                if cmd:
                    cmd['tagged'] = sessions[sid].get('tagged', False)
                    cmd['poll_ms'] = CFG_POLL_BUSY
                    log.info(f'[task] step#{task_runner.step} {cmd.get("cmd")} via {sid}')
                    return jsonify(cmd)

    # 2) Manual queue — skip tracking sessions entirely
    if sessions[sid].get('tracking'):
        return jsonify({'tagged': sessions[sid].get('tagged', False)})

    # Check pending filtered commands first (no cycling)
    still_pending = []
    for cmd, sess_filter in _pending_filtered:
        if sess_filter is None or sess_filter == sid:
            cmd['tagged'] = sessions[sid].get('tagged', False)
            cmd['poll_ms'] = CFG_POLL_BUSY
            _pending_filtered.clear()
            _pending_filtered.extend(still_pending)
            return jsonify(cmd)
        still_pending.append((cmd, sess_filter))
    _pending_filtered.clear()
    _pending_filtered.extend(still_pending)

    # Then check main queue
    attempts = 0
    while attempts < 100:
        try:
            cmd, sess_filter = cmd_queue.get_nowait()
            if sess_filter is None or sess_filter == sid:
                cmd['tagged'] = sessions[sid].get('tagged', False)
                cmd['poll_ms'] = CFG_POLL_BUSY
                return jsonify(cmd)
            # Not for this session — move to pending (no put-back)
            _pending_filtered.append((cmd, sess_filter))
            attempts += 1
        except queue.Empty:
            break

    # Periodic cleanup
    if int(time.time()) % 30 == 0:
        _cleanup_sessions()

    # Signal fast poll if queue has work (helps other sessions pick up commands faster)
    if cmd_queue.qsize() > 0 or _pending_filtered:
        return jsonify({'tagged': sessions[sid].get('tagged', False), 'poll_ms': CFG_POLL_BUSY})

    return jsonify({'tagged': sessions[sid].get('tagged', False)})

@app.route('/report', methods=['POST'])
def report():
    data = request.get_json(force=True)
    data['time'] = time.time()
    reports.append(data)
    if len(reports) > 500:
        reports[:] = reports[-500:]

    sid    = data.get('session', '?')
    cmd    = data.get('cmd', '?')
    result = data.get('result', '?')
    log.info(f'[report] {sid} {cmd}={result}')

    # Feed task runner (thread-safe)
    with runner_lock:
        if task_runner and not task_runner.done and not task_runner.error:
            task_runner.feed_report(data)

    return '', 204

AGENT_DIR = ROOT / '.agent'
AGENT_DIR.mkdir(exist_ok=True)
(AGENT_DIR / 'browser').mkdir(exist_ok=True)

@app.route('/dump', methods=['POST'])
def dump_element():
    """Save element info dump to .agent/browser/element_dump.json for agent to read."""
    data = request.get_json(force=True)
    data['dumped_at'] = time.time()

    # Extract and save screenshot separately (base64 data URL)
    screenshot = data.pop('screenshot', None)
    if screenshot and screenshot.startswith('data:image'):
        import base64
        b64data = screenshot.split(',', 1)[1]
        screenshot_file = AGENT_DIR / 'browser' / 'element_dump_screenshot.png'
        with open(screenshot_file, 'wb') as f:
            f.write(base64.b64decode(b64data))
        data['screenshot_file'] = str(screenshot_file)
        log.info(f'[dump] screenshot saved to {screenshot_file}')

    dump_file = AGENT_DIR / 'browser' / 'element_dump.json'
    with open(dump_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f'[dump] saved to {dump_file}')
    return jsonify({'ok': True, 'path': str(dump_file)})

@app.route('/dump', methods=['GET'])
def read_dump():
    """Read the latest element dump."""
    dump_file = AGENT_DIR / 'browser' / 'element_dump.json'
    if not dump_file.exists():
        return jsonify({'error': 'no dump yet'}), 404
    with open(dump_file, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))

HIDDEN_FILE = AGENT_DIR / 'browser' / 'hidden_selectors.json'

@app.route('/hidden', methods=['GET'])
def get_hidden():
    """Get list of selectors to hide. Returns {selectors: [...], urls: [...]}."""
    if HIDDEN_FILE.exists():
        with open(HIDDEN_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({'selectors': [], 'urls': []})

@app.route('/hidden', methods=['POST'])
def add_hidden():
    """Add selectors to hide list. Body: {selectors: ["#foo", ".bar"], url: "https://..."}"""
    data = request.get_json(force=True)
    current = {'selectors': [], 'urls': []}
    if HIDDEN_FILE.exists():
        with open(HIDDEN_FILE, 'r', encoding='utf-8') as f:
            current = json.load(f)
    new_selectors = data.get('selectors', [])
    for s in new_selectors:
        if s not in current['selectors']:
            current['selectors'].append(s)
    url = data.get('url')
    if url and url not in current.get('urls', []):
        current.setdefault('urls', []).append(url)
    with open(HIDDEN_FILE, 'w', encoding='utf-8') as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    log.info(f'[hidden] added {new_selectors}, total: {len(current["selectors"])}')
    return jsonify({'ok': True, 'count': len(current['selectors'])})

@app.route('/hidden', methods=['DELETE'])
def clear_hidden():
    """Clear hidden selectors for a specific URL or all."""
    data = request.get_json(force=True) if request.data else {}
    url = data.get('url')
    if HIDDEN_FILE.exists():
        with open(HIDDEN_FILE, 'r', encoding='utf-8') as f:
            current = json.load(f)
        if url:
            # Remove selectors that were added for this URL (keep others)
            current['urls'] = [u for u in current.get('urls', []) if u != url]
        else:
            current = {'selectors': [], 'urls': []}
        with open(HIDDEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
    return jsonify({'ok': True})

@app.route('/command', methods=['POST'])
def push_command():
    """Push a single command to the FIFO queue. If `_session` is set, only that session may consume it."""
    data = request.get_json(force=True)
    if cmd_queue.qsize() >= MAX_QUEUE:
        return jsonify({'error': 'queue full', 'queue_size': cmd_queue.qsize()}), 429
    sess_filter = data.pop('_session', None)
    cmd_queue.put((data, sess_filter))
    return jsonify({'ok': True, 'queue_size': cmd_queue.qsize()})

@app.route('/commands', methods=['POST'])
def push_commands():
    """Push multiple commands at once (JSON array)."""
    data = request.get_json(force=True)
    if isinstance(data, list):
        if cmd_queue.qsize() + len(data) > MAX_QUEUE:
            return jsonify({'error': 'queue overflow', 'queue_size': cmd_queue.qsize(), 'pushed': len(data)}), 429
        for item in data:
            sess_filter = item.pop('_session', None)
            cmd_queue.put((item, sess_filter))
    return jsonify({'ok': True, 'pushed': len(data) if isinstance(data, list) else 0,
                    'queue_size': cmd_queue.qsize()})

@app.route('/task/<name>', methods=['POST'])
def start_task(name):
    global task_runner, _task_cache_ts
    tasks = load_tasks()
    if name not in tasks:
        avail = ', '.join(tasks)
        return jsonify({'error': f'Task "{name}" not found', 'available': avail}), 404

    with runner_lock:
        if task_runner and not task_runner.done and not task_runner.error:
            task_runner.abort('replaced')
        task_runner = GeneratorRunner(name, tasks[name])
    _task_cache_ts = 0  # invalidate cache
    log.info(f'[task] START {name}  ({len(tasks)} tasks loaded)')
    return jsonify({'ok': True, 'task': name})

@app.route('/task/stop', methods=['POST'])
def stop_task():
    global task_runner
    with runner_lock:
        if task_runner:
            task_runner.abort('stopped by user')
            task_runner = None
    return jsonify({'ok': True})

# ??? Status / queries ???????????????????????????????????????????

@app.route('/status')
def status():
    _cleanup_sessions()
    tasks = load_tasks()
    with runner_lock:
        t = {
            'name': task_runner.name,
            'step': task_runner.step,
            'done': task_runner.done,
            'error': task_runner.error,
            'result': task_runner.result,
        } if task_runner else None
    return jsonify({
        'sessions': {k: {kk: vv for kk, vv in v.items() if kk != 'last_seen'}
                     for k, v in sessions.items()},
        'queue_size': cmd_queue.qsize(),
        'reports_count': len(reports),
        'last_report': reports[-1] if reports else None,
        'task': t,
        'tasks_available': list(tasks.keys()),
    })

@app.route('/tasks')
def list_tasks():
    return jsonify({'available': list(load_tasks().keys())})

@app.route('/reports')
def get_reports():
    limit = request.args.get('limit', 50, type=int)
    drain = request.args.get('drain', 0, type=int)
    sess = request.args.get('session', '')
    cmd_filter = request.args.get('cmd', '')
    items = reports[-limit:]
    if sess:
        items = [r for r in items if r.get('session') == sess]
    if cmd_filter:
        items = [r for r in items if r.get('cmd') == cmd_filter]
    result = jsonify(items)
    if drain:
        reports.clear()
    return result

@app.route('/queue')
def view_queue():
    return jsonify({
        'queue_size': cmd_queue.qsize(),
        'pending_filtered': len(_pending_filtered),
        'sessions': len(sessions),
        'task': {
            'name': task_runner.name,
            'step': task_runner.step,
            'done': task_runner.done,
            'error': task_runner.error,
        } if task_runner else None,
    })

@app.route('/metrics')
def metrics():
    """Server-side metrics for debugging latency."""
    now = time.time()
    active_sessions = sum(1 for s in sessions.values() if now - s.get('last_seen', 0) < 60)
    tracking_sessions = sum(1 for s in sessions.values() if s.get('tracking'))
    return jsonify({
        'uptime': round(now - app.config.get('START_TIME', now), 0),
        'sessions_total': len(sessions),
        'sessions_active_60s': active_sessions,
        'sessions_tracking': tracking_sessions,
        'queue_size': cmd_queue.qsize(),
        'pending_filtered': len(_pending_filtered),
        'reports_count': len(reports),
        'task_active': bool(task_runner and not task_runner.done and not task_runner.error),
    })

@app.route('/results')
def view_results():
    """Return all persisted task results (newest first)."""
    limit = request.args.get('limit', 20, type=int)
    entries = []
    if RESULTS_FILE.exists():
        with open(str(RESULTS_FILE), 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return jsonify(entries[-limit:])

@app.route('/agent.user.js')
def serve_script():
    """Serve the standalone userscript (for initial install)."""
    p = ROOT / 'agent' / 'standalone.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/agent.loader.user.js')
def serve_loader():
    """Serve the loader userscript (thin wrapper that fetches core on each page load)."""
    p = ROOT / 'agent' / 'loader.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/universal.loader.user.js')
def serve_universal_loader():
    """Serve the universal loader (fetches core + all modules)."""
    p = ROOT / 'agent' / 'universal.loader.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/agent.core.js')
def serve_core():
    """Serve the core agent code (fetched on every page load)."""
    p = ROOT / 'agent' / 'core.js'
    if p.exists():
        return (p.read_text(encoding='utf-8') + '\n'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/loader-core.js')
def serve_loader_core():
    """Serve the loader core logic (self-updating, never cached)."""
    p = RESOURCES / 'tools' / 'loader-core.js'
    if p.exists():
        return (p.read_text(encoding='utf-8') + '\n'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/serve/<path:name>')
def serve_userscript(name):
    """Serve any .user.js or .js file ??checks root, then modules/ directory."""
    if not name or '..' in name:
        return jsonify({'error': 'invalid name'}), 400
    # Try root first, then modules/
    for base in [ROOT, ROOT / 'modules']:
        p = base / name
        if p.exists():
            return p.read_text(encoding='utf-8'), 200, {
                'Content-Type': 'application/x-javascript; charset=utf-8',
            }
    return jsonify({'error': 'not found'}), 404

@app.route('/modules')
def serve_modules():
    """Serve modules.json with version parsed from each script's @version header."""
    p = ROOT / 'modules' / 'modules.json'
    if not p.exists():
        return jsonify([])
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        if isinstance(data, list):
            import re
            for m in data:
                script_name = m.get('script', '')
                if not script_name:
                    continue
                for base in [ROOT, ROOT / 'modules']:
                    fp = base / script_name
                    if fp.exists():
                        try:
                            txt = fp.read_text(encoding='utf-8', errors='ignore')[:2000]
                            ver = re.search(r'@version\s+(.+)', txt)
                            if ver:
                                m['version'] = ver.group(1).strip()
                        except Exception:
                            pass
                        break
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ??? Dashboard ??????????????????????????????????????????????????

DASHBOARD = r'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>Web Agent 控制台</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#f5f5f5;color:#333}
h1{font-size:1.4rem;display:flex;align-items:center;gap:10px}
.card{background:#fff;border-radius:8px;padding:16px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.card h2{font-size:1rem;margin:0 0 8px;color:#555}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:bold}
.badge.green{background:#d4edda;color:#155724}
.badge.red{background:#f8d7da;color:#721c24}
.badge.gray{background:#f0f0f0;color:#666}
.badge.blue{background:#dbeafe;color:#1e40af}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
th{color:#888}
tt{font-family:monospace;font-size:.8rem;background:#f0f0f0;padding:1px 4px;border-radius:3px}
.btn{padding:6px 16px;border:none;border-radius:5px;cursor:pointer;font-weight:500}
.btn.primary{background:#ee4d2d;color:#fff}
.btn.primary:hover{background:#d13b1e}
.btn.secondary{background:#e5e7eb;color:#333}
.btn.danger{background:#fee2e2;color:#dc2626}
.form-row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}
.form-row label{min-width:90px;color:#666;font-size:.85rem}
.form-row input,.form-row select{flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px}
#log{background:#1e1e1e;color:#0f0;padding:10px;border-radius:4px;font:12px/1.5 monospace;height:200px;overflow-y:auto;white-space:pre-wrap}
</style>
</head>
<body>
<h1>?? Web Agent <small>?祆?控制台/small></h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="card">
    <h2>?? ???銝剖???/h2>
    <div id="sessionInfo">頛銝凌?/div>
  </div>
  <div class="card">
    <h2>?? ???/h2>
    <div id="queueInfo">頛銝凌?/div>
  </div>
</div>

<div class="card">
  <h2>??隞餃?</h2>
  <div class="form-row">
    <label>?豢?隞餃?</label>
    <select id="taskSelect"></select>
    <button class="btn primary" onclick="startTask()">??</button>
    <button class="btn danger" onclick="stopTask()">?迫</button>
  </div>
  <div id="taskStatus" style="margin-top:6px;font-size:.85rem;color:#666">??/div>
</div>

<div class="card">
  <h2>?????誘</h2>
  <div class="form-row">
    <label>?誘</label>
    <select id="cmdSelect">
      <option value="ping">ping</option>
      <option value="navigate">navigate</option>
      <option value="wait">wait</option>
      <option value="find">find</option>
      <option value="find_and_click">find_and_click</option>
      <option value="click">click</option>
      <option value="get_text">get_text</option>
      <option value="get_attr">get_attr</option>
      <option value="eval">eval</option>
      <option value="inject_ui">inject_ui</option>
      <option value="set_config">set_config</option>
      <option value="scroll_into_view">scroll_into_view</option>
      <option value="type">type</option>
    </select>
    <input id="cmdParams" value='{}' placeholder='JSON params' style="flex:2">
    <button class="btn secondary" onclick="sendCommand()">?</button>
  </div>
</div>

<div class="card">
  <h2>?? 隞餃?蝯?閮?</h2>
  <div id="resultsContent"><span style="color:#888">頛銝凌?/span></div>
</div>

<div class="card">
  <h2>?? ?閮?</h2>
  <div id="reportsContent"><span style="color:#888">頛銝凌?/span></div>
</div>

<div class="card">
  <h2>?? Log</h2>
  <div id="log">[蝑?鞈??因</div>
</div>

<script>
function api(m, p, b, cb) {
  fetch(p, {method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):null})
    .then(function(r){return r.json()})
    .then(function(d){cb(null,d)})
    .catch(function(e){cb(e,null)});
}

function log(msg) {
  var el = document.getElementById('log');
  el.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
  el.scrollTop = el.scrollHeight;
}

function refresh() {
  api('GET','/status',null,function(e,d){
    if (e) return;
    var si = document.getElementById('sessionInfo');
    var keys = Object.keys(d.sessions);
    if (!keys.length) { si.innerHTML = '<span style="color:#888">?⊿????</span>'; }
    else {
      si.innerHTML = keys.map(function(k){
        var s = d.sessions[k];
        return '<div style="margin:2px 0"><span class="badge '+ (s.state==='IDLE'?'green':'blue') +'">'+s.state+'</span> ' +
               '<tt>'+k.slice(0,8)+'</tt> ' + (s.url||'').slice(0,60)+'</div>';
      }).join('');
    }
    document.getElementById('queueInfo').innerHTML =
      '雿?: <b>'+d.queue_size+'</b> &middot; ?: <b>'+d.reports_count+'</b>';
    var ts = document.getElementById('taskStatus');
    if (d.task && d.task.name) {
      ts.innerHTML = '<span class="badge blue">'+d.task.name+'</span> 甇仿? '+d.task.step +
        (d.task.done?' <span class="badge green">摰?</span>':'') +
        (d.task.error?' <span class="badge red">'+d.task.error+'</span>':'');
    } else { ts.innerHTML = '<span style="color:#888">?∩??其葉隞餃?</span>'; }
    // task dropdown
    var sel = document.getElementById('taskSelect');
    if (d.tasks_available && sel.options.length <= 1) {
      d.tasks_available.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=t;sel.appendChild(o)});
    }
  });
}

function refreshReports() {
  api('GET','/reports?limit=15',null,function(e,d){
    if (!d||!d.length) return;
    var h = '<table><tr><th>??</th><th>?誘</th><th>蝯?</th><th>蝬脣?</th></tr>';
    d.slice().reverse().forEach(function(r){
      var t = new Date(r.time*1000).toLocaleTimeString();
      var c = r.result==='OK'||r.result==='CLICKED'||r.result==='PONG'?'green':r.result==='ERROR'?'red':'gray';
      h += '<tr><td>'+t+'</td><td><span class="badge '+c+'">'+r.cmd+'</span></td><td>'+r.result+'</td>'+
           '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r.url||'')+'</td></tr>';
    });
    h += '</table>';
    document.getElementById('reportsContent').innerHTML = h;
  });
}

function sendCommand() {
  var cmd = document.getElementById('cmdSelect').value;
  var params = {};
  try { params = JSON.parse(document.getElementById('cmdParams').value||'{}'); } catch(e) { alert('JSON error'); return; }
  var p = Object.assign({cmd:cmd}, params);
  log('??send ' + cmd);
  api('POST','/command',p,function(e,d){
    if (d) log('??queued (n='+d.queue_size+')');
    else log('??err: '+e);
  });
}

function startTask() {
  var n = document.getElementById('taskSelect').value;
  if (!n) return;
  api('POST','/task/'+n,null,function(e,d){
    if (d&&d.ok) log('??task started: '+n);
    else log('??'+(d?d.error:e));
    refresh();
  });
}

function stopTask() {
  api('POST','/task/stop',null,function(){log('??stopped');refresh()});
}

refresh(); refreshReports();
setInterval(refresh, 3000);
setInterval(refreshReports, 4000);

function refreshResults() {
  api('GET','/results?limit=10',null,function(e,d){
    if (!d||!d.length) { document.getElementById('resultsContent').innerHTML='<span style="color:#888">撠閮?</span>'; return; }
    var h = '<table><tr><th>??</th><th>隞餃?</th><th>蝯?</th></tr>';
    d.slice().reverse().forEach(function(r){
      var s = r.result||{};
      var st = s.status||'?';
      var c = st==='ok'||st==='already_checked_in'?'green':st==='error'||st==='aborted'?'red':'gray';
      h += '<tr><td>'+r.time.slice(11,19)+'</td><td>'+r.task+'</td><td><span class="badge '+c+'">'+st+'</span></td></tr>';
    });
    h += '</table>';
    document.getElementById('resultsContent').innerHTML = h;
  });
}
refreshResults();
setInterval(refreshResults, 5000);
</script>
</body>
</html>
'''

@app.route('/')
@app.route('/dashboard')
def dashboard():
    return render_template_string(DASHBOARD)

@app.route('/restart', methods=['POST'])
def restart_server():
    """Gracefully restart the server process."""
    log.info('[restart] restarting server...')
    import subprocess, os
    subprocess.Popen([sys.executable] + sys.argv,
                     cwd=str(ROOT), close_fds=True)
    os._exit(0)

# ??? Entry point ????????????????????????????????????????????????
if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8921
    app.config['START_TIME'] = time.time()
    log.info(f'🌐 Web Agent Server → http://localhost:{port}')
    log.info(f'📂 Tasks: {TASKS_DIR}')
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
