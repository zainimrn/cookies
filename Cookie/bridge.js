window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const d = e.data || {};
  if (d.type === 'COOKIE_SNAP_PING') window.postMessage({ type: 'COOKIE_SNAP_READY' }, '*');
  if (d.type === 'COOKIE_SNAP_APPLY') chrome.runtime.sendMessage({ type: 'APPLY_AND_OPEN', domain: d.domain, cookies: d.cookies });
});