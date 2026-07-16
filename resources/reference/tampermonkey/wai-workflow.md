# Web Element Inspector (WAI) Workflow

`debug-toolkit.js` (`hidden: true`, loads on all sites). Mark-up of elements for debugging.

## How to use

1. Hover left edge of the page → button slides out → click to open, or `Ctrl+Shift+I`
2. Hover to preview element info (tag, id, class, coordinates, size, computed selector)
3. Click to mark an element (auto-named 元件1, 元件2, ...)
4. Click **📤 Send** → data POSTed to `/dump`, selectors added to `/hidden`

## Agent workflow

1. User marks elements with WAI in browser
2. WAI auto-POSTs to server `/dump` + `/hidden`
3. Data saved to `.agent/browser/element_dump.json`
4. User says "元件1 有問題" → agent reads `.agent/browser/element_dump.json` to identify the element

## Data structure

Dump includes: `label`, `tag`, `id`, `selector`, `parentChain`, `computed` styles.

## Hidden selectors

Selectors added to `/hidden` are consumed by site-specific modules (e.g. `anime1-infinite-scroll.js`) to permanently remove unwanted elements.
