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
