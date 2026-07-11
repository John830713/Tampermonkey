#!/usr/bin/env python3
"""
Web Agent Server — command queue + generator-based task system + dashboard.

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

HERE = Path(__file__).parent
TASKS_DIR = HERE / 'tasks'
TASKS_DIR.mkdir(exist_ok=True)

RESULTS_FILE = HERE / 'task_results.jsonl'

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

# ─── CORS (allow sendBeacon / fetch from any origin) ────────────
@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp

# ─── State ──────────────────────────────────────────────────────
sessions  = {}              # sid -> {url, title, last_seen, state}
cmd_queue = queue.Queue()   # manual command queue
reports   = []              # all reports (ring buffer, max 500)
task_runner = None          # current GeneratorRunner
runner_lock = threading.RLock()

# Tracking/ad domains whose sessions should not receive task commands
TRACKING_DOMAINS = frozenset([
    'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
    'google-analytics.com', 'googletagmanager.com', 'facebook.com/tr',
    'adsrvr.org', 'adservice.google.com',
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


# ─── Generator-based Task Runner ────────────────────────────────
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
        """Called by /poll — returns next command, auto-advances on navigate.

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
                self._claimed_session = None  # page reload → new session
                try:
                    self._step_count += 1
                    self.pending_cmd = next(self.gen)
                except StopIteration as e:
                    self.done = True
                    self.result = e.value
                    self.pending_cmd = None
                    append_task_result(self.name, e.value)
                    log.info(f'[task] {self.name} finished → {e.value}')

            return cmd

    def feed_report(self, report_data):
        """Called by /report — pushes report into generator."""
        with runner_lock:
            if self.done or self.error:
                return
            # If generator already advanced (e.g. auto-advance from navigate),
            # this report is stale — ignore it
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
                log.info(f'[task] {self.name} finished → {e.value}')
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


# ─── Task loader ────────────────────────────────────────────────
def load_tasks():
    """Return {name: gen_func} from task modules."""
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
    return tasks


# ─── Routes ─────────────────────────────────────────────────────

@app.route('/hello', methods=['POST'])
def hello():
    data = request.get_json(force=True)
    sid = data.get('session', '?')
    sessions[sid] = {
        'url':      data.get('url', ''),
        'title':    data.get('title', ''),
        'last_seen': time.time(),
        'state':    'IDLE',
        'agent':    data.get('agentVersion', '?'),
    }
    log.info(f'[hello] {sid} {data.get("url","")}')
    return jsonify({'ok': True})


@app.route('/poll', methods=['GET'])
def poll():
    sid   = request.args.get('session', '?')
    state = request.args.get('state', 'IDLE')
    url   = request.args.get('url', '')
    title = request.args.get('title', '')

    # Auto-register new sessions on first poll (POST-based /hello may not arrive)
    if sid not in sessions:
        sessions[sid] = {
            'url': url, 'title': title, 'last_seen': time.time(),
            'state': state, 'agent': '?',
        }
        log.info(f'[session] new {sid} {url}')
    else:
        sessions[sid].update(last_seen=time.time(), state=state, url=url, title=title)

    # 1) Active task (thread-safe) — delivered only to claiming session
    with runner_lock:
        if task_runner and not task_runner.done and not task_runner.error:
            # Skip task delivery for tracking / ad pages
            if not _is_tracking_url(url):
                cmd = task_runner.pop_cmd(session_id=sid)
                if cmd:
                    log.info(f'[task] step#{task_runner.step} {cmd.get("cmd")} via {sid}')
                    return jsonify(cmd)

    # 2) Manual queue (with optional session filter)
    while True:
        try:
            cmd, sess_filter = cmd_queue.get_nowait()
            if sess_filter is None or sess_filter == sid:
                return jsonify(cmd)
            # Not for this session — put back and continue
            cmd_queue.put((cmd, sess_filter))
            break
        except queue.Empty:
            break

    return jsonify({'cmd': None})


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

    return jsonify({'ok': True})


AGENT_DIR = HERE / '.agent'
AGENT_DIR.mkdir(exist_ok=True)

@app.route('/dump', methods=['POST'])
def dump_element():
    """Save element info dump to .agent/element_dump.json for agent to read."""
    data = request.get_json(force=True)
    data['dumped_at'] = time.time()
    dump_file = AGENT_DIR / 'element_dump.json'
    with open(dump_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f'[dump] saved to {dump_file}')
    return jsonify({'ok': True, 'path': str(dump_file)})


@app.route('/dump', methods=['GET'])
def read_dump():
    """Read the latest element dump."""
    dump_file = AGENT_DIR / 'element_dump.json'
    if not dump_file.exists():
        return jsonify({'error': 'no dump yet'}), 404
    with open(dump_file, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))


@app.route('/command', methods=['POST'])
def push_command():
    """Push a single command to the FIFO queue. If `_session` is set, only that session may consume it."""
    data = request.get_json(force=True)
    sess_filter = data.pop('_session', None)
    cmd_queue.put((data, sess_filter))
    return jsonify({'ok': True, 'queue_size': cmd_queue.qsize()})


@app.route('/commands', methods=['POST'])
def push_commands():
    """Push multiple commands at once (JSON array)."""
    data = request.get_json(force=True)
    if isinstance(data, list):
        for item in data:
            sess_filter = item.pop('_session', None)
            cmd_queue.put((item, sess_filter))
    return jsonify({'ok': True, 'pushed': len(data) if isinstance(data, list) else 0,
                    'queue_size': cmd_queue.qsize()})


@app.route('/task/<name>', methods=['POST'])
def start_task(name):
    global task_runner
    tasks = load_tasks()
    if name not in tasks:
        avail = ', '.join(tasks)
        return jsonify({'error': f'Task "{name}" not found', 'available': avail}), 404

    with runner_lock:
        if task_runner and not task_runner.done and not task_runner.error:
            task_runner.abort('replaced')
        task_runner = GeneratorRunner(name, tasks[name])
    log.info(f'[task] START {name}  ({len(list(load_tasks()))} tasks loaded)')
    return jsonify({'ok': True, 'task': name})


@app.route('/task/stop', methods=['POST'])
def stop_task():
    global task_runner
    with runner_lock:
        if task_runner:
            task_runner.abort('stopped by user')
            task_runner = None
    return jsonify({'ok': True})


# ─── Status / queries ───────────────────────────────────────────

@app.route('/status')
def status():
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
    return jsonify(reports[-limit:])


@app.route('/queue')
def view_queue():
    return jsonify({
        'queue_size': cmd_queue.qsize(),
        'sessions': len(sessions),
        'task': {
            'name': task_runner.name,
            'step': task_runner.step,
            'done': task_runner.done,
            'error': task_runner.error,
        } if task_runner else None,
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
    p = HERE / 'agent' / 'standalone.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/agent.loader.user.js')
def serve_loader():
    """Serve the loader userscript (thin wrapper that fetches core on each page load)."""
    p = HERE / 'agent' / 'loader.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/universal.loader.user.js')
def serve_universal_loader():
    """Serve the universal loader (fetches core + all modules)."""
    p = HERE / 'agent' / 'universal.loader.user.js'
    if p.exists():
        return p.read_text(encoding='utf-8'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/agent.core.js')
def serve_core():
    """Serve the core agent code (fetched on every page load)."""
    p = HERE / 'agent' / 'core.js'
    if p.exists():
        return (p.read_text(encoding='utf-8') + '\n'), 200, {
            'Content-Type': 'application/x-javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
    return jsonify({'error': 'not found'}), 404

@app.route('/serve/<path:name>')
def serve_userscript(name):
    """Serve any .user.js or .js file — checks root, then modules/ directory."""
    if not name or '..' in name:
        return jsonify({'error': 'invalid name'}), 400
    # Try root first, then modules/
    for base in [HERE, HERE / 'modules']:
        p = base / name
        if p.exists():
            return p.read_text(encoding='utf-8'), 200, {
                'Content-Type': 'application/x-javascript; charset=utf-8',
            }
    return jsonify({'error': 'not found'}), 404


@app.route('/modules')
def serve_modules():
    """Serve modules.json — read from disk on every request for live updates."""
    p = HERE / 'modules' / 'modules.json'
    if not p.exists():
        return jsonify([])
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── Dashboard ──────────────────────────────────────────────────

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
<h1>🤖 Web Agent <small>本機控制台</small></h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="card">
    <h2>🔗 連線中分頁</h2>
    <div id="sessionInfo">載入中…</div>
  </div>
  <div class="card">
    <h2>📊 狀態</h2>
    <div id="queueInfo">載入中…</div>
  </div>
</div>

<div class="card">
  <h2>▶ 任務</h2>
  <div class="form-row">
    <label>選擇任務</label>
    <select id="taskSelect"></select>
    <button class="btn primary" onclick="startTask()">啟動</button>
    <button class="btn danger" onclick="stopTask()">停止</button>
  </div>
  <div id="taskStatus" style="margin-top:6px;font-size:.85rem;color:#666">—</div>
</div>

<div class="card">
  <h2>⌨ 手動指令</h2>
  <div class="form-row">
    <label>指令</label>
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
    <button class="btn secondary" onclick="sendCommand()">送出</button>
  </div>
</div>

<div class="card">
  <h2>📝 任務結果記錄</h2>
  <div id="resultsContent"><span style="color:#888">載入中…</span></div>
</div>

<div class="card">
  <h2>📋 回報記錄</h2>
  <div id="reportsContent"><span style="color:#888">載入中…</span></div>
</div>

<div class="card">
  <h2>📜 Log</h2>
  <div id="log">[等待資料…]</div>
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
    if (!keys.length) { si.innerHTML = '<span style="color:#888">無連線分頁</span>'; }
    else {
      si.innerHTML = keys.map(function(k){
        var s = d.sessions[k];
        return '<div style="margin:2px 0"><span class="badge '+ (s.state==='IDLE'?'green':'blue') +'">'+s.state+'</span> ' +
               '<tt>'+k.slice(0,8)+'</tt> ' + (s.url||'').slice(0,60)+'</div>';
      }).join('');
    }
    document.getElementById('queueInfo').innerHTML =
      '佇列: <b>'+d.queue_size+'</b> &middot; 回報: <b>'+d.reports_count+'</b>';
    var ts = document.getElementById('taskStatus');
    if (d.task && d.task.name) {
      ts.innerHTML = '<span class="badge blue">'+d.task.name+'</span> 步驟 '+d.task.step +
        (d.task.done?' <span class="badge green">完成</span>':'') +
        (d.task.error?' <span class="badge red">'+d.task.error+'</span>':'');
    } else { ts.innerHTML = '<span style="color:#888">無作用中任務</span>'; }
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
    var h = '<table><tr><th>時間</th><th>指令</th><th>結果</th><th>網址</th></tr>';
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
  log('→ send ' + cmd);
  api('POST','/command',p,function(e,d){
    if (d) log('✓ queued (n='+d.queue_size+')');
    else log('✗ err: '+e);
  });
}

function startTask() {
  var n = document.getElementById('taskSelect').value;
  if (!n) return;
  api('POST','/task/'+n,null,function(e,d){
    if (d&&d.ok) log('✅ task started: '+n);
    else log('❌ '+(d?d.error:e));
    refresh();
  });
}

function stopTask() {
  api('POST','/task/stop',null,function(){log('⏹ stopped');refresh()});
}

refresh(); refreshReports();
setInterval(refresh, 3000);
setInterval(refreshReports, 4000);

function refreshResults() {
  api('GET','/results?limit=10',null,function(e,d){
    if (!d||!d.length) { document.getElementById('resultsContent').innerHTML='<span style="color:#888">尚無記錄</span>'; return; }
    var h = '<table><tr><th>時間</th><th>任務</th><th>結果</th></tr>';
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


# ─── Entry point ────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8921
    log.info(f'⚡ Web Agent Server → http://localhost:{port}')
    log.info(f'📁 Tasks: {TASKS_DIR}')
    app.run(host='0.0.0.0', port=port, debug=False)
