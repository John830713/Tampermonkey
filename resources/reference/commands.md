# Commands Reference

All commands are JSON objects pushed by the server and executed by `agent/core.js` in the browser. Each command execution produces a report back to the server.

| Command | Parameters | Description |
|---------|-----------|-------------|
| `navigate` | `url` | Navigate to URL; auto-advances the generator |
| `wait` | `ms` | Wait for N milliseconds |
| `find` | `selector`, `text`, `textExact`, `attr`, `attrValue`, `tag`, `visible` | Find elements matching criteria |
| `find_and_click` | `selector`, `text`, ... `index` | Find element(s) then click |
| `click` | `index` (default 0) | Click `foundElements[index]` |
| `type` | `text`, `index` (default 0) | Type text into `foundElements[index]` |
| `eval` | `code` | Execute JS in page context, return result |
| `get_text` | `index` / `selector` | Get element text content |
| `get_attr` | `name`, `index` | Get element attribute value |
| `scroll_into_view` | `index` (default 0) | Scroll element into view |
| `highlight` | `index` (default 0) | Highlight element with red border |
| `exists` | `selector` / `text` | Check if element exists |
| `count` | `selector` | Count matching elements |
| `dump_element` | `selector` | Dump element details to `/dump` |
| `dump_page` | `selector` (default `header`) | Dump page structure to `/dump` |
| `wait_for` | `selector`, `timeout` | Wait for element to appear |
| `debug_dump` | — | Dump headings, links, images at once |
| `console_capture` | `level`, `limit` | Get captured console logs |
| `inject_ui` | — | Re-inject the UI panel |
| `ping` | — | Health check (returns PONG) |
| `set_config` | `key`, `value` | Modify agent config (e.g. evalLimit) |
