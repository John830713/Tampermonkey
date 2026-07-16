# Rule34 Page 結構分析

日期：2026-07-16
頁面：`https://rule34.xxx/index.php?page=post&s=view&id=...`

## DOM 結構

```
#post-view (display: flex, justify-content: flex-start)
  ├── [sidebar area] (固定左側)
  └── #right-col.content (display: block, width: ~1142px, x: 228)
        └── #fit-to-screen (display: block, width: 1142px)
              └── div.flexi (display: flex, justify-content: flex-start)
                    └── div (display: block, width: 962px) ← 圖片的直接父層
                          └── #image (inline, width: 815px, height: 1215px)
```

## 原始定位

| 元素 | display | justify-content | width | x 位置 |
|------|---------|-----------------|-------|--------|
| `#post-view` | flex | flex-start | 1365px | 20px |
| `#right-col` | block | — | 1142px | 228px |
| `#fit-to-screen` | block | — | 1142px | 228px |
| `div.flexi` | flex | flex-start | 1142px | 228px |
| 包裹 div | block | — | 962px | 228px |
| `#image` | inline | — | 815px | 228px |

## 原始站如何避開問題

1. `#image` 是 `inline` 元素，寬度由 HTML 屬性 `width="815"` 決定（非 CSS）
2. 外層 `div`（962px）是 `block`，自然包裹圖片
3. `div.flexi` 用 `justify-content: flex-start`，把 962px 的 block div 推到左邊
4. 圖片在 block div 裡也是靠左，但因為外層有足夠 padding/margin，看起來不會偏

## 問題

腳本加了 `justify-content: center` 後：
- 962px 的 block div 被置中 → 圖片跟著置中
- 但 `#image` 是 `inline`，在 block div 裡還是靠左
- 如果圖片比 block div 大，會溢出

## 最終做法（v3.6.0）

```css
/* 只改圖片本身，不動 flex 父層結構 */
body.view-layout #image {
    display: block !important;
    max-width: 95vw !important;
    max-height: 90vh !important;
    width: auto !important;
    height: auto !important;
    margin: 0 auto !important;
}
/* 這個可以加，因為 flexi 裡的 block div 會自動居中 */
body.view-layout div.flexi {
    justify-content: center !important;
}
```

原因：
- `#image` 改 `display: block` + `margin: 0 auto` → 在 block div 裡自動置中
- `div.flexi` 加 `justify-content: center` → 962px 的 block div 也會置中
- 不改 `#post-view`、`#right-col`、`#fit-to-screen` → 保留原始結構

## 原始 CSS

`desktop.css?46` 控制了大部分排版，腳本只覆寫：
- Header/navbar/ads 隱藏
- 圖片置中（如上）

## View 頁面完整隱藏清單

腳本隱藏的元素：
- `#left-col` — 左側欄（搜尋、標籤）
- `#search` — 搜尋區
- `#comments` — 留言區
- `#related` — 相關貼文
- `#stats` — 統計
- `#options` — 選項
- `#history` — 歷史
- `#edit` — 編輯區
- `#footer` — 頁尾
- `h2, h4, h5, h6` — 標題
- `.blacklist *` — 黑名單區
- `#tags` — 標籤區

保留的元素：
- `#image` — 主圖
- `.layout-control-panel` — 控制面板（顯示左側欄按鈕）

## List 頁縮圖預覽功能 (v3.7.0)

### URL 轉換

縮圖和大圖的 hash 不同，無法直接轉換。需從 View 頁面抓取：
```
缩图: /images/{id}/thumb_{hash1}.jpeg?{post_id}
大图: /samples/{id}/sample_{hash2}.jpg?{post_id}
```

做法：點擊按鈕 → `GM_xmlhttpRequest` fetch View 頁 → 先匹配含 `id="image"` 的 `<img>` tag，再提取 `src`

注意：View 頁 HTML 屬性順序是 `src` 在 `id` 前面，不能用單一 regex 一次抓

### DOM 結構

每個 `span.thumb` 加入：
```html
<button class="thumb-preview-btn">🔍</button>
```

### Lightbox

參考 `resources/reference/common/popup-modal.md` 的 Lightbox pattern。

- 點擊按鈕 → 全螢幕半透明遮罩 + 大圖
- 點擊遮罩 → 關閉
- 右鍵大圖 → 原生選單（可複製圖片連結）
- 圖片尺寸：`max-width: 95vw; max-height: 95vh`
