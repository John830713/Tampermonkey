#!/usr/bin/env python3
"""
System tray manager for Web Agent Server.

Runs permanently in the system tray. Manages server.py as a subprocess.
Auto-restarts when server.py file changes (mtime-based detection).

Usage:
    python tray.py              # uses server_config.json
    python python tray.py 9999  # override port
"""
import json, os, socket, subprocess, sys, time, threading
from pathlib import Path

try:
    import pystray
    from PIL import Image
except ImportError:
    print("Missing dependencies. Run: pip install pystray Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent.parent  # resources/tools/ -> project root
CONFIG_FILE = ROOT / 'server_config.json'
PID_FILE = ROOT / 'agent.pid'
LOG_FILE = ROOT / '.agent' / 'debug' / 'server_log.txt'
SERVER_SCRIPT = Path(__file__).parent / 'server.py'

# --- Config ---------------------------------------------------------
def load_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

# --- Process helpers ------------------------------------------------
def is_running(pid):
    """Check if a process with given PID exists."""
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if handle:
            kernel32.CloseHandle(handle)
            return True
        return False
    except Exception:
        # Fallback: try to find in process list
        try:
            result = subprocess.run(
                ['tasklist', '/FI', f'PID eq {pid}'],
                capture_output=True, text=True, timeout=5
            )
            return str(pid) in result.stdout
        except Exception:
            return False

def is_port_taken(port):
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex(('localhost', port)) == 0

def read_pid():
    if PID_FILE.exists():
        try:
            return int(PID_FILE.read_text().strip())
        except (ValueError, OSError):
            return None
    return None

def write_pid(pid):
    PID_FILE.write_text(str(pid))

def remove_pid():
    try:
        PID_FILE.unlink(missing_ok=True)
    except OSError:
        pass

# --- Server management ----------------------------------------------
class ServerManager:
    def __init__(self, port):
        self.port = port
        self.proc = None
        self.last_mtime = 0

    def start(self, force=False):
        if not force and is_port_taken(self.port):
            log(f'Port {self.port} already in use — skipping start')
            return False

        # Log server output to file
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        log_fh = open(LOG_FILE, 'a', encoding='utf-8')
        log_fh.write(f'\n{"="*50}\n[{time.strftime("%Y-%m-%d %H:%M:%S")}] Server starting\n')
        log_fh.flush()

        cmd = [sys.executable, str(SERVER_SCRIPT), str(self.port)]
        self.proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=log_fh,
            stderr=subprocess.STDOUT,
        )
        self._log_fh = log_fh
        log(f'Started server (PID {self.proc.pid}) on port {self.port}')
        self.last_mtime = SERVER_SCRIPT.stat().st_mtime
        return True

    def stop(self):
        if self.proc:
            log('Stopping server...')
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
            exit_code = self.proc.returncode
            self.proc = None
            if hasattr(self, '_log_fh'):
                self._log_fh.write(f'[{time.strftime("%Y-%m-%d %H:%M:%S")}] Server stopped (exit code: {exit_code})\n')
                self._log_fh.flush()
            log(f'Server stopped (exit code: {exit_code})')

    def restart(self):
        self.stop()
        time.sleep(2)  # Wait for port to be released
        return self.start(force=True)

    def check_reload(self):
        """Check if server.py changed. If so, restart."""
        try:
            mtime = SERVER_SCRIPT.stat().st_mtime
            if mtime != self.last_mtime:
                # Wait for file to stabilize (not mid-write)
                time.sleep(2)
                mtime2 = SERVER_SCRIPT.stat().st_mtime
                if mtime2 == mtime:
                    log('Server code changed — reloading...')
                    self.restart()
                    return True
        except OSError:
            pass
        return False

    def is_alive(self):
        if self.proc is None:
            return False
        return self.proc.poll() is None

# --- Logging --------------------------------------------------------
def log(msg):
    print(f'[tray] {msg}')

# --- Tray icon ------------------------------------------------------
def create_icon_image():
    """Create a simple tray icon (blue square with 'A')."""
    img = Image.new('RGB', (64, 64), '#1e40af')
    try:
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        draw.text((18, 10), 'A', fill='white')
    except Exception:
        pass
    return img

# --- Main -----------------------------------------------------------
def main():
    config = load_config()

    # Port from CLI arg or config
    port = 8921
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    else:
        port = config.get('port', 8921)

    # Check for existing instance
    old_pid = read_pid()
    if old_pid and is_running(old_pid):
        print(f'Another tray is running (PID {old_pid}). Exiting.')
        sys.exit(1)
    remove_pid()  # Clean stale PID

    write_pid(os.getpid())
    log(f'Tray started (PID {os.getpid()})')

    manager = ServerManager(port)
    manager.start()

    # --- File watcher thread ---
    def watcher():
        while True:
            time.sleep(3)
            if not manager.is_alive():
                exit_code = manager.proc.returncode if manager.proc else '?'
                log(f'Server process died (exit code: {exit_code}) — restarting...')
                if hasattr(manager, '_log_fh'):
                    manager._log_fh.write(f'[{time.strftime("%Y-%m-%d %H:%M:%S")}] Server CRASHED (exit code: {exit_code})\n')
                    manager._log_fh.flush()
                time.sleep(1)
                manager.start(force=True)
            else:
                manager.check_reload()

    watcher_thread = threading.Thread(target=watcher, daemon=True)
    watcher_thread.start()

    # --- System tray ---
    def on_open_dashboard(icon, item):
        import webbrowser
        webbrowser.open(f'http://localhost:{port}')

    def on_restart(icon, item):
        manager.restart()

    def on_quit(icon, item):
        manager.stop()
        remove_pid()
        icon.stop()

    icon = pystray.Icon(
        'agent',
        create_icon_image(),
        f'Agent Server — :{port}',
        menu=pystray.Menu(
            pystray.MenuItem('Open Dashboard', on_open_dashboard, default=True),
            pystray.MenuItem('Restart Server', on_restart),
            pystray.MenuItem('Quit', on_quit),
        )
    )

    try:
        icon.run()
    except KeyboardInterrupt:
        pass
    finally:
        manager.stop()
        remove_pid()
        log('Tray exited')

if __name__ == '__main__':
    main()
