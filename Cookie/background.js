const API = 'https://cookies-2t0q.onrender.com';

chrome.runtime.setUninstallURL(API);
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
schedule();

function schedule() {
  chrome.alarms.create('watch', { periodInMinutes: 1 });
  watch();
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'watch') watch(); });

async function watch() {
  const { cs } = await chrome.storage.local.get('cs');
  if (!cs?.token) return;

  // local expiry
  if (cs.expiresAt && Date.now() > new Date(cs.expiresAt).getTime()) return kill(cs, 'Expired');

  try {
    const res = await fetch(API + '/api/auth/me', { headers: { Authorization: 'Bearer ' + cs.token } });
    if (res.status === 401) return kill(cs, 'Unbound');
    const me = await res.json();
    if (me.expired) return kill(cs, 'Expired');
    if (me.disabled) return kill(cs, 'Disabled by admin');
  } catch {}
}

async function kill(cs, reason) {
  for (const s of (cs.sets || [])) if (s?.domain) await wipe(s.domain);
  try { await fetch(API + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + cs.token } }); } catch {}
  await chrome.storage.local.remove('cs');
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#f87171' });
  chrome.notifications?.create?.({
    notificationId: 'cs-' + Date.now(),
    options: { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Cookie Snap', message: reason + ' — cookies removed, logged out.' }
  });
}

function urlOf(c) {
  const scheme = c.secure ? 'https' : 'http';
  const dom = String(c.domain || '').replace(/^\./, '');
  const path = c.path && c.path.startsWith('/') ? c.path : '/' + (c.path || '');
  return `${scheme}://${dom}${path}`;
}
async function wipe(domain) {
  const list = await chrome.cookies.getAll({ domain });
  for (const c of list)
    await chrome.cookies.remove({ url: urlOf(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});
}