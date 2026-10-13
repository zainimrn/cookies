chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'snap-export',
    title: 'Cookie Snap: export this site\'s cookies',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'snap-export' || !tab?.url) return;
  let host = '';
  try { host = new URL(tab.url).hostname; } catch { return; }

  const map = new Map();
  const add = (l) => l.forEach((c) => map.set(`${c.name}|${c.domain}|${c.path}`, c));
  add(await chrome.cookies.getAll({ domain: host }));
  if (/^https?:/.test(tab.url)) add(await chrome.cookies.getAll({ url: tab.url }));

  const payload = {
    domain: host,
    exportedAt: new Date().toISOString(),
    cookies: [...map.values()]
  };
  const url = 'data:application/json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(payload, null, 2));
  chrome.downloads.download({ url, filename: `cookies-${host}.json`, saveAs: false });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'APPLY_AND_OPEN') applyAndOpen(msg.domain, msg.cookies);
});

function bgCookieUrl(c) {
  const scheme = c.secure ? 'https' : 'http';
  const dom = (c.domain || '').replace(/^\./, '');
  const path = c.path && c.path.startsWith('/') ? c.path : '/' + (c.path || '');
  return `${scheme}://${dom}${path}`;
}

async function applyAndOpen(domain, cookies) {
  const existing = await chrome.cookies.getAll({ domain });
  for (const c of existing)
    await chrome.cookies.remove({ url: bgCookieUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});

  const now = Math.floor(Date.now() / 1000);
  for (const c of cookies) {
    const secure = !!c.secure;
    const dom = c.domain || '.' + domain;
    const details = {
      url: `${secure ? 'https' : 'http'}://${dom.replace(/^\./, '')}${c.path || '/'}`,
      name: c.name, value: c.value ?? '', path: c.path || '/', secure, httpOnly: !!c.httpOnly, domain: dom,
      expirationDate: c.expirationDate && c.expirationDate > now ? c.expirationDate : now + 365 * 86400
    };
    if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
    await chrome.cookies.set(details).catch(() => {});
  }
  chrome.tabs.create({ url: 'https://' + domain + '/' });
}