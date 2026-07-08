"""
蝦皮自動簽到任務 — Generator-based.
yield = 送指令給瀏覽器, receive = 回報結果.
"""

import logging, json
log = logging.getLogger('agent.task.shopee')


def get_task():
    return _run()


def _run():
    today = __import__('datetime').datetime.now().strftime('%Y-%m-%d')
    log.info(f'[shopee] start check-in for {today}')

    # ─── 1. Navigate to coins page ──────────────────────────────
    r = yield {
        'cmd': 'navigate',
        'url': 'https://shopee.tw/shopee-coins',
    }
    log.info(f'[shopee] navigate → {r.get("result")}')

    # ─── 2. Wait for SPA to render ──────────────────────────────
    r = yield {'cmd': 'wait', 'ms': 5000}
    log.info(f'[shopee] initial wait done')

    # ─── 3. Try find button by data-inactive attribute ──────────
    r = yield {
        'cmd': 'find',
        'attr': 'data-inactive',
        'tag': 'button',
        'visible': True,
    }
    count = (r.get('extra') or {}).get('count', 0) if isinstance(r, dict) else 0
    log.info(f'[shopee] find by data-inactive → count={count}')

    if count > 0:
        # ─── 4a. Check if inactive ──────────────────────────────
        r = yield {
            'cmd': 'get_attr',
            'name': 'data-inactive',
        }
        val = (r.get('extra') or {}).get('value', 'true') if isinstance(r, dict) else 'true'
        log.info(f'[shopee] data-inactive="{val}"')

        if val == 'true':
            yield {'cmd': 'wait', 'ms': 500}
            return {'status': 'already_checked_in', 'date': today}

        # ─── 5a. Button is active → click it ────────────────────
        r = yield {
            'cmd': 'click',
        }
        clicked = r.get('result') == 'CLICKED' if isinstance(r, dict) else False
        log.info(f'[shopee] click → {r.get("result") if isinstance(r, dict) else "?"}')

        # ─── 6a. Read amount from stored element ────────────────
        r = yield {
            'cmd': 'get_text',
        }
        amount = (r.get('extra') or {}).get('text', '?') if isinstance(r, dict) else '?'

        return {
            'status': 'clicked' if clicked else 'click_failed',
            'date': today,
            'amount': amount,
        }

    # ─── 4b. Fallback: search by text ────────────────────────────
    r = yield {
        'cmd': 'find',
        'text': '完成簽到',
        'tag': 'button',
        'visible': True,
    }
    count2 = (r.get('extra') or {}).get('count', 0) if isinstance(r, dict) else 0
    log.info(f'[shopee] find by text → count={count2}')

    if count2 > 0:
        # Check data-inactive on the matched button
        r = yield {
            'cmd': 'get_attr',
            'name': 'data-inactive',
        }
        val2 = (r.get('extra') or {}).get('value', 'true') if isinstance(r, dict) else 'true'
        if val2 != 'true':
            r = yield {'cmd': 'click'}
            return {'status': 'clicked_fallback', 'date': today}
        else:
            return {'status': 'already_checked_in', 'date': today}

    # ─── 5b. Last resort: eval JS to scan all buttons ──────────
    r = yield {
        'cmd': 'eval',
        'code': '''(function(){
            var b = Array.from(document.querySelectorAll('button'));
            for(var i=0;i<b.length;i++){
                var da = b[i].getAttribute('data-inactive');
                if(da !== null && da !== 'true' && !b[i].disabled){
                    b[i].click();
                    return 'clicked_by_eval';
                }
            }
            return 'no_active_button';
        })()''',
    }
    result_text = (r.get('extra') or {}).get('result', '?') if isinstance(r, dict) else '?'
    log.info(f'[shopee] eval scan → {result_text}')
    return {'status': result_text, 'date': today}
