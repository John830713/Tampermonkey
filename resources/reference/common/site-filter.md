# Site Filter Pattern

讓模組在特定網站啟用/停用，避免在不需要的頁面注入 UI。

## 實作方式

```js
// Config — 存排除清單（GM_setValue 跨站共享）
var SITE_FILTER_KEY = 'dt_site_filter';

function getHiddenSites() {
    try { return JSON.parse(GM_getValue(SITE_FILTER_KEY, '[]')); } catch(e) { return []; }
}

function getHostname() {
    return location.hostname.replace(/^www\./, '');
}

function isSiteEnabled() {
    var hidden = getHiddenSites();
    var host = getHostname();
    return !hidden.some(function(s) {
        return host === s || host.endsWith('.' + s);
    });
}

function hideSite(site) {
    var hidden = getHiddenSites();
    if (hidden.indexOf(site) === -1) hidden.push(site);
    GM_setValue(SITE_FILTER_KEY, JSON.stringify(hidden));
}

function showSite(site) {
    var hidden = getHiddenSites();
    hidden = hidden.filter(function(s) { return s !== site; });
    GM_setValue(SITE_FILTER_KEY, JSON.stringify(hidden));
}

// Boot 檢查
function boot() {
    if (!isSiteEnabled()) return; // 不注入任何 UI
    init();
}
```

## Config 格式

排除清單，存 Tampermonkey storage（`GM_setValue`/`GM_getValue`）：

```json
["google.com", "translate.google.com"]
```

- 空 array `[]` → 所有網站都顯示（預設）
- 有值 → 清單中的網站不顯示 debug tool

## UI 慣例

- sidebar header 下方放 site filter row
- 顯示目前 hostname + 隱藏數量 + toggle 按鈕
- 按鈕文字：`Visible`（綠色）/ `Hidden`（紅色）
- 按一下切換，直接存 GM_setValue

## 為什麼用 GM_setValue 不用 localStorage

localStorage 是 per-origin，google.com 設的 config 讀不到 translate.google.com。`GM_setValue`/`GM_getValue` 是 Tampermonkey 的跨站 storage，所有網站共享同一份 config。
