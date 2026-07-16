# Popup / Modal

## Popup（小彈出視窗）

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

## Modal（全屏覆蓋層）

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

## Lightbox（圖片預覽）

```css
.preview-lightbox {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.85); z-index: 999999;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
}
.preview-lightbox img {
    max-width: 95vw; max-height: 95vh;
    object-fit: contain; cursor: default;
}
```

```javascript
function showLightbox(url) {
    var overlay = document.createElement('div');
    overlay.className = 'preview-lightbox';
    var img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', function(e) { e.stopPropagation(); });
    overlay.addEventListener('click', function() { overlay.remove(); });
    overlay.appendChild(img);
    document.body.appendChild(overlay);
}
```
