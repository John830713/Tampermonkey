# Overlay / Progress

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
