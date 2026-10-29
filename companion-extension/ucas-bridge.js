// Same-window, same-origin UI bridge. No extension ID or browser tokens in the webpage.
(() => {
  const ORIGIN = 'https://mmashharawi2021-cell.github.io';
  if (location.origin !== ORIGIN || !location.pathname.startsWith('/UCAS/')) return;
  window.addEventListener('message', event => {
    const d = event.data;
    if (
      event.source !== window ||
      event.origin !== ORIGIN ||
      d?.source !== 'UCAS_COMPANION_WEB' ||
      !/^[a-f0-9-]{36}$/.test(d.requestId || '') ||
      ![
        'SCAN',
        'LAST',
        'AUTO',
        'FILE_SCAN',
        'FILE_LIST',
        'FILE_OPEN',
        'FILE_CHUNK',
        'FILE_CLOSE',
      ].includes(d.type)
    )
      return;
    chrome.runtime.sendMessage(
      {
        type: 'UCAS_COMPANION_' + d.type,
        enabled: d.enabled === true,
        fileId: d.fileId,
        sessionId: d.sessionId,
        offset: d.offset,
      },
      result => {
        const err = chrome.runtime.lastError;
        window.postMessage(
          {
            source: 'UCAS_COMPANION_EXTENSION',
            requestId: d.requestId,
            result: err ? { ok: false, error: 'تعذر الاتصال بالإضافة: ' + err.message } : result,
          },
          ORIGIN,
        );
      },
    );
  });
})();
