# Task Authoring

撰寫 Python generator 自動化任務。

## 基本格式

```python
"""任務說明"""
import logging
log = logging.getLogger('task.my_task')

def get_task():
    return _run()

def _run():
    log.info('[my_task] start')

    r = yield {'cmd': 'navigate', 'url': 'https://example.com'}
    log.info(f'navigate → {(r or {}).get("result")}')

    r = yield {'cmd': 'wait', 'ms': 2000}

    r = yield {'cmd': 'find', 'selector': 'h1'}
    count = (r or {}).get('extra', {}).get('count', 0)
    log.info(f'found {count} h1 elements')

    if count > 0:
        r = yield {'cmd': 'click'}
        log.info('clicked')

    return {'status': 'ok'}
```

## Generator Pattern

- `yield` 送出指令，等待 report 回來
- `r = yield {...}` 收到的是 report dict
- `navigate` 指令自動推進 generator
- `return` = 任務完成，結果顯示在 `/status`

## Report 結構

```python
r = yield {'cmd': 'eval', 'code': 'document.title'}
# r = {'cmd': 'eval', 'result': 'OK', 'extra': {'result': 'Google'}, 'time': ...}
# extra.result = eval 的回傳值
```

## 範例：點擊 + 輸入

```python
r = yield {'cmd': 'find', 'selector': 'input[name=q]'}
r = yield {'cmd': 'type', 'text': 'hello'}
r = yield {'cmd': 'find_and_click', 'selector': 'button[type=submit]'}
r = yield {'cmd': 'wait', 'ms': 3000}
```

## 範例：條件邏輯

```python
r = yield {'cmd': 'exists', 'selector': '.login-btn'}
exists = (r or {}).get('extra', {}).get('exists', False)
if exists:
    r = yield {'cmd': 'find_and_click', 'selector': '.login-btn'}
    r = yield {'cmd': 'wait', 'ms': 2000}
```

## 注意事項

- 一次只能跑一個 task（新的會中斷舊的）
- 指令序列化：每個 yield 要等 report 回來
- tracking 網域的 session 不接收指令
