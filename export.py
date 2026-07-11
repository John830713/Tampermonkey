#!/usr/bin/env python3
"""
Export a module to a standalone .user.js file.

Usage:
    python export.py <module-name>
    python export.py rule34
    python export.py --list

Output goes to exported/<module-name>.user.js
"""
import json, sys, re
from pathlib import Path

HERE = Path(__file__).parent
MODULES_DIR = HERE / 'modules'
EXPORTED_DIR = HERE / 'exported'
MODULES_JSON = MODULES_DIR / 'modules.json'


def load_modules():
    if not MODULES_JSON.exists():
        print('Error: modules/modules.json not found')
        sys.exit(1)
    return json.loads(MODULES_JSON.read_text(encoding='utf-8'))


def generate_header(module):
    name = module['name']
    match_lines = '\n'.join(f'// @match        {m}' for m in module.get('match', []))
    grant_lines = '\n'.join(f'// @grant        {g}' for g in module.get('grants', []))

    return f'''// ==UserScript==
// @name         {name}
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-exported from modules/{module.get('script', '?')}
// @author       You
{match_lines}
{grant_lines}
// ==/UserScript==


'''


def export_module(name):
    modules = load_modules()
    target = None
    for m in modules:
        if m['name'] == name:
            target = m
            break

    if not target:
        avail = ', '.join(m['name'] for m in modules)
        print(f'Error: module "{name}" not found')
        print(f'Available: {avail}')
        sys.exit(1)

    script_name = target.get('script', '')
    script_path = MODULES_DIR / script_name
    if not script_path.exists():
        print(f'Error: script file not found: {script_path}')
        sys.exit(1)

    header = generate_header(target)
    body = script_path.read_text(encoding='utf-8')

    output = header + body
    out_path = EXPORTED_DIR / f'{name}.user.js'
    out_path.write_text(output, encoding='utf-8')
    print(f'Exported: {out_path}')
    print(f'  Module: {name}')
    print(f'  Script: {script_name}')
    print(f'  Output: {out_path.relative_to(HERE)}')


def list_modules():
    modules = load_modules()
    for m in modules:
        status = 'enabled' if m.get('enabled', True) else 'disabled'
        print(f'  {m["name"]:20s} [{status:8s}] {m.get("script", "?")}')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    if sys.argv[1] in ('-l', '--list'):
        list_modules()
    else:
        export_module(sys.argv[1])
