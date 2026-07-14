# 設計偏好規格

> 新增腳本時先讀這份文件，複製現有 pattern，不要重新發明。

---

## 模組架構

```
universal.loader.user.js   (Tampermonkey，每頁執行)
    ├── GET /agent/core.js  → Function() sandbox 執行
    ├── GET /modules        → match URL patterns
    │       └── GET /serve/<module>.js → Function() sandbox 執行
    └── buildTogglePanel()  → ⚙ 按鈕 + localStorage overrides
```

- Loader 用 `new Function()` 建沙箱，傳入所有 GM_* API
- `modules.json` 是 JSON **array**（非 keyed object），每筆含 `name`、`enabled`、`match`、`script`、`grants`
- `core.js` 讀 `window.__agent_server`（由 loader 設定），port 改兩處：loader + server 啟動參數
- 所有與本地 server 通訊的腳本共用 `const SERVER = window.__agent_server || 'http://localhost:8921';`

## 腳本間重複代碼

| Pattern | 涉及檔案 | 備註 |
|---------|---------|------|
| 頁面指示器 ⇤‹›⇥ | anime1、nhentai、rule34 | 結構幾乎相同，可抽成共用模組 |
| 雙向無限滾動 | anime1、rule34 | isLoading 閾值守衛 + scroll position preservation |
| 下載流程（fetch→regex→GM_download） | anime1、hanime | 同一套 onprogress/onload/onerror |
| `standalone` vs `core` | standalone、core.js | ~85% 重複，core 多了 console hook + dump 命令 |

新增腳本時，優先從上述檔案複製對應段落。

---

## 無限滾動

### 觸發條件（固定 pattern，直接複製）

```javascript
window.addEventListener('scroll', function() {
    if (isLoading || !hasMore) return;
    var grid = document.querySelector('.gallery-grid'); // 或其他容器
    if (!grid) return;
    var rect = grid.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight + 400) {
        fetchNextPage();
    }
});
```

- 用 `getBoundingClientRect().bottom` 而非 `scrollHeight`，更準確、不受其他元素影響
- 預觸發距離 `400px`，在快到底時提前載入
- Scroll 事件建議 debounce 200ms

### 雙向無限滾動（Rule34 pattern）

- 上方：`y <= 200` 時載入上一頁
- 下方：`y >= dh - vh - 400` 時載入下一頁
- 載入上頁後需 `window.scrollTo(0, oldScrollY + addedH)` 保持閱讀位置
- 用 `loadedPids` Set 防止重複載入
- `consecutiveFailures >= MAX_FAILURES` 時停止嘗試
- 結束時顯示 `— 已達最後一頁 —`

### 載入狀態顯示

```javascript
// 載入中
addInfiniteStatus('載入中...');

// 完成後
addInfiniteStatus('已載入 ' + currentPage + ' / ' + numPages + ' 頁');

// 無更多
addInfiniteStatus('— 已無更多內容 —');
```

### Rate Limiting（所有 API 請求必須使用）

```javascript
var reqQueue = [];
var reqBusy = false;

function nhRequest(opts) {
    reqQueue.push(opts);
    if (!reqBusy) processNext();
}

function processNext() {
    if (reqQueue.length === 0) { reqBusy = false; return; }
    reqBusy = true;
    var opts = reqQueue.shift();
    setTimeout(function() {
        GM_xmlhttpRequest({
            method: opts.method || 'GET',
            url: opts.url,
            onload: function(r) { opts.onload(r); reqBusy = false; processNext(); },
            onerror: function(e) { if (opts.onerror) opts.onerror(e); reqBusy = false; processNext(); },
            ontimeout: function() { if (opts.ontimeout) opts.ontimeout(); reqBusy = false; processNext(); }
        });
    }, 800); // 800ms 間隔，避免 Cloudflare 429
}
```

## 跳頁器（nhentai pattern）

### 元件結構

```
⇤ ‹ [X / Y] › ⇥ [頁碼輸入] [跳]
```

- `⇤` first / `‹` prev / `›` next / `⇥` last
- Label: `visiblePage + ' / ' + numPages`
- Input: `type="number" min="1"`
- Jump 按鈕: 點擊或 Enter 觸發

### 核心函數

```javascript
function createPageIndicator() { /* 建立 DOM，綁定事件 */ }
function updatePageIndicator() { /* 更新 label + disabled 狀態 */ }
function goToPage(target) { /* 驗證範圍 → 清空 grid → 請求 → 渲染 → scrollTo(0,0) */ }
function syncPageIndicator() { /* 找最接近 viewport 中心的 item，更新 visiblePage */ }
```

### Disabled 邏輯

- first/prev: `currentPage <= 1` 時 disabled
- next/last: `currentPage >= numPages` 時 disabled

## Overlay 按鈕

### 位置

- 縮圖 overlay: 底部全寬，hover 顯示
- 固定按鈕: 右上角或右下角

### 樣式基準

```css
.dl-overlay-btn {
    width: 100%;
    padding: 5px 0;
    background: rgba(255, 152, 0, 0.9); /* 橙色 */
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    border: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
}
```

## 進度條

### 樣式基準

```css
.dl-progress-outer {
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 0 0 4px 4px;
    overflow: hidden;
}
.dl-progress-inner {
    width: 0%;
    height: 100%;
    background: #4caf50; /* 綠色 */
    transition: width 0.1s linear;
}
```

### 進度文字格式

```
45.3% (120.5 / 266.0 MB)
```

## 通用 CSS 規範

| 屬性 | 值 | 說明 |
|------|-----|------|
| border-radius | `4px` | 所有圓角統一 |
| font-size | `12px` | UI 元素標準字體 |
| overlay 背景 | `rgba(30, 30, 35, 0.9)` | 深色半透明 |
| 主要按鈕 | `#ff9800` | 橙色系 |
| 成功/進度 | `#4caf50` | 綠色 |
| 錯誤/關閉 | `#c0392b` | 紅色 |
| 文字 | `#eee` (深底) / `#222` (淺底) | |

---

## DOM 建構慣例

### 原則

- **全部用 `document.createElement`**，不用 `innerHTML`（防 CSP / TrustedHTML 問題）
- 複雜 HTML 用 template literal 建好再用 `appendChild` 組裝
- 批次插入用 `DocumentFragment`
- 需要強制樣式時用 `element.style.setProperty(prop, val, 'important')`

### 適用場景

| 場景 | 方法 |
|------|------|
| 生成 UI 元件（按鈕、面板、popup） | `createElement` + `textContent` |
| 需要解析外部 HTML（API 回傳） | `DOMParser` + `querySelector` |
| 批次插入大量子元素 | `DocumentFragment` |
| 設定 CSS | `GM_addStyle`（全域）或 `style.setProperty`（個別） |

### 禁止

- `element.innerHTML = '...'` — CSP 頁面會被 block
- 用戶輸入直接插入 DOM — 用 `textContent`

### Trusted Types + `new Function()` 限制

Google 等嚴格 CSP 頁面啟用了 Trusted Types policy，會擋 `new Function()`：
- **在 Tampermonkey 沙箱內原生呼叫** `new Function()` → `@grant unsafeEval` 可以 bypass
- **在 eval 出來的程式碼內呼叫** `new Function()` → Trusted Types 攔截，**無法 bypass**
- `innerHTML` 同理，需用 `textContent` 或 DOM API

**結論：所有 UI 注入邏輯（buildTogglePanel 等）必須在 Tampermonkey 腳本本體內，不能從 server 動態載入。** 可以動態載入的只有 core.js 和模組（它們在沙箱內被 `new Function()` 執行）。

---

## MutationObserver vs setInterval

### 何時用 MutationObserver

- 需要偵測特定容器的子元素變化（如列表動態載入）
- 只需觀察一次（找到後 disconnect）
- 範例：`exhentai-layout.js` 觀察 `#gdt`、`hanime-downloader.js` 觀察 `body` subtree

### 何時用 setInterval

- 需要定期清理或重試（如隐藏元素、移除廣告）
- 頁面會持續動態新增元素（如 anime1 的 header shrink）
- 範例：`anime1-infinite-scroll.js` 每 500ms 隱藏原表格、`rule34-gallery.js` 每 500ms 修正 inline style

### 預設

- 新增腳本時優先用 `MutationObserver`（效能較好）
- 只在需要「反覆重試」時用 `setInterval`，並加防重複判斷

---

## Popup / Modal 模式

### Popup（小彈出視窗）

```javascript
// 全域：只允許一個 popup 開啟
let openPopup = null;
function closeOpenPopup() {
    if (openPopup) { openPopup.classList.remove('nh-visible'); openPopup = null; }
}

// 點擊按鈕切換
btn.onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (popup.classList.contains('nh-visible')) {
        popup.classList.remove('nh-visible');
        openPopup = null;
        return;
    }
    closeOpenPopup();
    openPopup = popup;
    popup.classList.add('nh-visible');
};

// 點擊外部關閉
document.addEventListener('click', function(e) {
    if (openPopup && !e.target.closest('.popup-selector') && !e.target.closest('.btn-selector')) {
        closeOpenPopup();
    }
});
```

### Modal（全屏覆蓋層）

```css
.modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 99998;
    display: none; align-items: center; justify-content: center;
}
.modal-overlay.nh-visible { display: flex; }
.modal-content {
    background: #1a1a2e; color: #eee;
    border-radius: 8px; padding: 16px;
    max-width: 900px; width: 90%;
    max-height: calc(100vh - 100px); overflow-y: auto;
}
```

---

## GM_xmlhttpRequest 節流

### Queue 模式（nhentai pattern）

適用：API 請求密集、需要嚴格控制頻率。

```javascript
var reqQueue = [], reqBusy = false;
function nhRequest(opts) {
    reqQueue.push(opts);
    if (!reqBusy) processNext();
}
function processNext() {
    if (!reqQueue.length) { reqBusy = false; return; }
    reqBusy = true;
    var o = reqQueue.shift();
    setTimeout(function() {
        GM_xmlhttpRequest({
            method: o.method || 'GET', url: o.url,
            onload: function(r) { reqBusy = false; if (o.onload) o.onload(r); processNext(); },
            onerror: function(e) { reqBusy = false; if (o.onerror) o.onerror(e); processNext(); },
            ontimeout: function() { reqBusy = false; if (o.ontimeout) o.ontimeout(); processNext(); }
        });
    }, 800);
}
```

### Throttle 模式（Rule34 pattern）

適用：不需排隊，只要確保間隔。

```javascript
var lastReqTime = 0;
function throttledGet(url, cb) {
    var now = Date.now();
    var delay = Math.max(0, 600 - (now - lastReqTime));
    setTimeout(function() {
        lastReqTime = Date.now();
        GM_xmlhttpRequest({ method: 'GET', url: url, onload: cb });
    }, delay);
}
```

---

## 伺服器通訊

與本地 Flask server (`localhost:8921`) 通訊的腳本共用以下模式：

| 腳本 | 角色 | 端點 |
|------|------|------|
| web-element-inspector.js | 發送 | `POST /dump`、`POST /hidden` |
| anime1-infinite-scroll.js | 接收 | `GET /hidden` |
| universal.loader.user.js | 接收 | `GET /agent/core.js`、`GET /modules`、`GET /serve/*` |
| core.js | 雙向 | `GET/POST /poll`、`POST /hello`、`POST /dump` |

新增腳本如需 server 通訊，共用 `const SERVER = window.__agent_server || 'http://localhost:8921';`

---

## 浮動面板 UI 規則

### 遮擋問題

浮動面板會擋住頁面右側內容（或左側），必須提供左右切換：
- 預設右側，面板內放切換按鈕（◀/▶）
- 切換時 border、shadow 方向跟著翻
- 不需存 localStorage — 每次載入預設右邊

### 按鈕設計

- 面板操作按鈕統一放在面板內，不用獨立浮動按鈕分散注意力
- 按鈕要直觀可辨識：文字或圖示 + hover tooltip
- 事件綁定在 `appendChild` 之後、任何可能 throw 的邏輯之前
- 參考：`web-element-inspector.js` 的 `wai-side-btn`、`wai-send`、`wai-clear`

---

## Site Filter Pattern

讓模組在特定網站啟用/停用，避免在不需要的頁面注入 UI。

### 實作方式

```js
// Config
var SITE_FILTER_KEY = 'dt_site_filter';

// 讀取 filter（GM_setValue 跨站共享）
function getSiteFilter() {
    try { return JSON.parse(GM_getValue(SITE_FILTER_KEY, 'null')); } catch(e) { return null; }
}

// 檢查目前網站是否啟用
function isSiteEnabled() {
    var filter = getSiteFilter();
    if (!filter || !filter.sites || filter.sites.length === 0) return true; // 預設全部啟用
    var host = location.hostname.replace(/^www\./, '');
    var match = filter.sites.some(function(s) {
        return host === s || host.endsWith('.' + s);
    });
    return filter.mode === 'blacklist' ? !match : match;
}

// Boot 時檢查
function boot() {
    if (!isSiteEnabled()) return; // 不注入任何 UI
    init();
}
```

### Config 格式（GM_getValue 存 Tampermonkey storage）

```json
{ "mode": "whitelist", "sites": ["google.com", "arealme.com"] }
```

- `mode: "whitelist"` → 只在列表中的網站啟用
- `mode: "blacklist"` → 在列表中的網站停用
- `sites: []` 或 `null` → 全部啟用（預設）

### UI 慣例

- sidebar header 下方放 site filter row
- 顯示目前 hostname + 當前 mode + toggle 按鈕
- toggle 按鈕用 `GM_setValue` 存 config（不是 localStorage，因為 localStorage 是 per-origin）

### 為什麼用 GM_setValue 不用 localStorage

localStorage 是 per-origin，google.com 設的 config 讀不到 translate.google.com。`GM_setValue`/`GM_getValue` 是 Tampermonkey 的跨站 storage，所有網站共享同一份 config。
