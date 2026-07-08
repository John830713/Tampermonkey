"""Google search test — navigate, type, search."""

import logging, json
log = logging.getLogger('task.google')

NAME = 'google_test'
DESCRIPTION = 'Navigate to Google, type a query, search'

def get_task():
    return _run()

def _run():
    log.info('[google] start')

    r = yield {'cmd': 'navigate', 'url': 'https://www.google.com'}
    log.info(f'[google] navigate={(r or {}).get("result")}')

    r = yield {'cmd': 'wait', 'ms': 3000}
    log.info('[google] wait ok')

    # Find the search input
    r = yield {'cmd': 'find', 'selector': 'input[name="q"], textarea[name="q"], input[aria-label*="search" i], textarea[aria-label*="search" i]'}
    cnt = (r or {}).get('extra', {}).get('count', 0)
    log.info(f'[google] find → {cnt}')

    if cnt == 0:
        r = yield {'cmd': 'eval', 'code': 'document.body.innerHTML.slice(0,2000)'}
        body = (r or {}).get('extra', {}).get('result', '')[:200]
        log.info(f'[google] no input, body={body}')
        return {'status': 'no_input'}

    r = yield {'cmd': 'type', 'text': 'hello world'}
    log.info(f'[google] typed')

    # Navigate directly to search results (avoids report-loss on page navigation)
    r = yield {'cmd': 'navigate', 'url': 'https://www.google.com/search?q=hello+world'}
    log.info(f'[google] navigate search')

    r = yield {'cmd': 'wait', 'ms': 3000}
    r = yield {'cmd': 'eval', 'code': 'document.title'}
    title = (r or {}).get('extra', {}).get('result', '?')
    log.info(f'[google] title={title}')
    return {'status': 'ok', 'title': title}
