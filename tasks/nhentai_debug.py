def get_task():
    report = yield {'cmd': 'navigate', 'url': 'https://nhentai.net/'}
    yield {'cmd': 'debug_dump'}
    result = yield {'cmd': 'console_capture', 'level': 'error', 'limit': 50}
    return result
