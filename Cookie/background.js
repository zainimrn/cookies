const API = 'https://cookies-2t0q.onrender.com';

chrome.runtime.setUninstallURL(API);
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
schedule();

function schedule() {
  chrome.alarms.create('expiry-check', { periodInMinutes: 20 });
  check();
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'expiry-check') check(); });

async function check() {
  const { cs } = await chrome.storage.local.get('cs');
  if (!cs?.expiresAt) return;
  if (Date.now() < new Date(cs.expiresAt).getTime()) return;

  for (const s of (cs.sets || [])) await wipe(s.domain);
  try {
    await fetch(API + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + cs.token } });
  } catch {}
  await chrome.storage.local.remove('cs');
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
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