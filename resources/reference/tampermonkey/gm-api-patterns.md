# GM API Patterns

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

## GM_download

`GM_xmlhttpRequest` blob + `<a>.click()` doesn't work for downloads. Use `GM_download`.

### 大檔下載（blob > ~50MB）

`FileReader.readAsDataURL` 會把 blob 轉成 base64 字串（體積 ×1.33），`GM_download` 無法處理超大 data URL。`URL.createObjectURL` 傳 blob URL 也不可靠（存成 .txt）。

**正確做法**：`GM_xmlhttpRequest` 負責進度追蹤，存檔直接用 `GM_download` 打原始 HTTP URL。

```javascript
// GM_xmlhttpRequest 抓 blob（進度 + resume）
GM_xmlhttpRequest({
    url: videoUrl,
    responseType: 'blob',
    onprogress: function(e) { /* update UI */ },
    onload: function(res) {
        var blob = res.response;
        // GM_download 存檔（用原始 URL，不經 blob 轉換）
        GM_download({
            url: videoUrl,        // 原始 HTTP URL，不是 blob URL
            name: filename,
            saveAs: false,
            onload: function() { /* done */ },
            onerror: function(e) { /* fail */ }
        });
    }
});
```

`GM_download` 不吃 data URL（大檔爆掉）也不吃 blob URL（存成 txt），只吃原始 HTTP URL。進度追蹤和存檔分開兩條路。

## Tag Cache + Fetch（nhentai pattern）

從外部頁面抓資料、解析 HTML、快取結果。適用：需要從其他頁面提取結構化資料。

```javascript
const tagCache = new Map();

function fetchGalleryTags(id) {
    if (tagCache.has(id)) return Promise.resolve(tagCache.get(id));
    return new Promise(function(resolve) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://example.com/item/' + id + '/',
            onload: function(r) {
                try {
                    var doc = new DOMParser().parseFromString(r.responseText, 'text/html');
                    var spans = doc.querySelectorAll('.tag-container .name');
                    var tags = [];
                    spans.forEach(function(s) {
                        var t = s.textContent.trim();
                        if (t && tags.indexOf(t) === -1) tags.push(t);
                    });
                    tagCache.set(id, tags);
                    resolve(tags);
                } catch(e) { resolve([]); }
            },
            onerror: function() { resolve([]); },
            ontimeout: function() { resolve([]); }
        });
    });
}
```

- 用 `DOMParser` 解析回傳的 HTML，不要用 `innerHTML`
- `Map` 快取避免重複請求
- 錯誤時 fallback 到空陣列，不阻塞 UI
