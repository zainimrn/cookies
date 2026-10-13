import { detectFormat, parse, serialize } from './formats.js';

const $ = (id) => document.getElementById(id);
let activeTab = null, siteUrl = '', siteHost = '', cookies = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (tab && /^https?:/.test(tab.url || '')) {
    siteUrl = tab.url;
    try { siteHost = new URL(tab.url).hostname; } catch { siteHost = ''; }
  }
  $('domain').value = siteHost;
  $('siteLine').textContent = siteHost ? siteHost : 'Empty tab — paste cookies to auto-detect';
  bind();
  await load();
}

function bind() {
  $('loadBtn').onclick = () => {
    siteHost = $('domain').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    $('domain').value = siteHost;
    $('siteLine').textContent = siteHost || 'Empty tab — paste cookies to auto-detect';
    load();
  };
  $('reloadBtn').onclick = () => activeTab && chrome.tabs.reload(activeTab.id);
  $('exportBtn').onclick = doExport;
  $('importBtn').onclick = () => { $('importArea').hidden = !$('importArea').hidden; };
  $('deleteBtn').onclick = deleteAll;
  $('importRun').onclick = doImport;
  $('fileBtn').onclick = () => $('file').click();
  $('file').onchange = readFile;
  $('selectAll').onchange = (e) =>
    document.querySelectorAll('#list input[type=checkbox]').forEach((cb) => (cb.checked = e.target.checked));
}

const keyOf = (c) => `${c.name}|${c.domain}|${c.path}|${c.storeId}`;

async function load() {
  cookies = await collectCookies(siteHost);
  render();
}

async function collectCookies(host) {
  const map = new Map();
  const add = (list) => { for (const c of list) map.set(keyOf(c), c); };
  if (!host) return [];
  try { add(await chrome.cookies.getAll({ domain: host })); } catch {}
  if (siteUrl && /^https?:/.test(siteUrl)) {
    try { add(await chrome.cookies.getAll({ url: siteUrl })); } catch {}
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

function render() {
  const list = $('list');
  list.innerHTML = '';
  $('count').textContent = `${cookies.length} cookie${cookies.length === 1 ? '' : 's'}`;
  if (!cookies.length) { list.innerHTML = '<li class="empty">No cookies loaded.</li>'; return; }
  const now = Date.now() / 1000;
  for (const c of cookies) {
    const expired = c.expirationDate && c.expirationDate < now;
    const flags = [c.secure && 'Secure', c.httpOnly && 'HttpOnly', c.session && 'Session',
      c.partitionKey && 'Partitioned', expired && 'EXPIRED',
      c.sameSite && c.sameSite !== 'unspecified' && c.sameSite].filter(Boolean).join(' · ');
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `
      <input type="checkbox" checked data-k="${esc(keyOf(c))}" />
      <div class="meta">
        <div class="name">${esc(c.name)}</div>
        <div class="val">${esc((c.value || '').slice(0, 80))}</div>
        <div class="dom">${esc(c.domain)}${esc(c.path)}${flags ? ' · ' + esc(flags) : ''}</div>
      </div>
      <button class="del" title="Delete">✕</button>`;
    li.querySelector('.del').onclick = async () => {
      await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});
      await load();
    };
    list.appendChild(li);
  }
}

function selected() {
  const keys = new Set([...document.querySelectorAll('#list input[type=checkbox]:checked')].map((cb) => cb.dataset.k));
  const picked = cookies.filter((c) => keys.has(keyOf(c)));
  return picked.length ? picked : cookies;
}

function cookieUrl(c) {
  const scheme = c.secure ? 'https' : 'http';
  const domain = (c.domain || siteHost).replace(/^\./, '');
  const path = c.path && c.path.startsWith('/') ? c.path : '/' + (c.path || '');
  return `${scheme}://${domain}${path}`;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2800);
}

const EXT = { json: 'json', base64: 'b64.txt', netscape: 'cookies.txt', setcookie: 'setcookie.txt', header: 'header.txt' };

function doExport() {
  const picked = selected();
  if (!picked.length) return toast('Nothing to export');
  const fmt = $('format').value;
  const meta = { domain: siteHost, exportedAt: new Date().toISOString(), format: fmt };
  const text = serialize(fmt, picked, meta);
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cookies-${siteHost || 'site'}.${EXT[fmt]}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  navigator.clipboard.writeText(text).catch(() => {});
  toast(`Exported ${picked.length} cookies as ${fmt}`);
}

function readFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => { $('importText').value = fr.result; };
  fr.readAsText(f);
}

/* ---------- domain detection ---------- */

const MULTI = new Set(['co.uk','org.uk','gov.uk','ac.uk','co.jp','co.in','com.au','net.au',
  'org.au','co.nz','com.br','com.mx','com.ar','co.za','com.tr','com.sg','com.hk','com.tw',
  'co.kr','com.cn','com.my','co.id','com.ph','com.vn','co.th']);

function baseDomain(host) {
  host = String(host || '').replace(/^\./, '').replace(/^www\./, '');
  const p = host.split('.').filter(Boolean);
  if (p.length <= 2) return p.join('.');
  const last2 = p.slice(-2).join('.');
  if (MULTI.has(last2) && p.length >= 3) return p.slice(-3).join('.');
  return last2;
}

// choose the dominant site in the payload (most cookies, then shortest)
function detectTarget(list) {
  const counts = new Map();
  for (const c of list) {
    if (!c.domain) continue;
    const b = baseDomain(c.domain);
    if (b) counts.set(b, (counts.get(b) || 0) + 1);
  }
  if (!counts.size) return '';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
}

/* ---------- the fix: revive dead cookies so Chrome keeps them ---------- */
function revive(c, { renew, persist, days }) {
  const now = Math.floor(Date.now() / 1000);
  const future = now + days * 86400;
  if (renew && c.expirationDate && c.expirationDate < now + 120) {
    c.expirationDate = future; c.session = false;
  } else if (persist && !c.expirationDate) {
    c.expirationDate = future; c.session = false;
  }
  return c;
}

async function setCookie(c, target, validStores) {
  const hasDomain = !!c.domain;
  const domain = hasDomain ? c.domain : '.' + target;   // header-format → cover subdomains
  const secure = !!c.secure;
  const details = {
    url: cookieUrl({ ...c, domain, secure }),
    name: c.name,
    value: c.value ?? '',
    path: c.path || '/',
    secure,
    httpOnly: !!c.httpOnly,
    domain
  };
  if (c.expirationDate) details.expirationDate = c.expirationDate;
  if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  if (c.storeId && validStores.has(c.storeId)) details.storeId = c.storeId;

  try {
    return await chrome.cookies.set(details);
  } catch {
    delete details.sameSite;
    if (details.partitionKey) delete details.partitionKey;
    try { return await chrome.cookies.set(details); } catch { return null; }
  }
}

async function doImport() {
  const text = $('importText').value.trim();
  if (!text) return toast('Nothing to import');
  const fmt = detectFormat(text);
  let list;
  try { list = parse(text, fmt); } catch { return toast('Could not parse input'); }
  list = list.filter((c) => c.name);
  if (!list.length) return toast('No cookies found in input');

  // figure out the site: from payload first, else typed domain, else current tab
  let target = detectTarget(list) || siteHost || $('domain').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!target) return toast('Add a domain (payload has none)');
  siteHost = target;

  const opts = {
    renew: $('optRenew').checked,
    persist: $('optPersist').checked,
    days: Math.max(1, parseInt($('optDays').value) || 365)
  };

  let validStores = new Set();
  try { (await chrome.cookies.getAllCookieStores()).forEach((s) => validStores.add(s.id)); } catch {}

  // wipe the TARGET site's existing cookies (not the current tab's)
  if ($('optClear').checked) {
    const existing = await collectCookies(target);
    for (const c of existing)
      await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});
  }

  let ok = 0; const failed = [];
  for (const c of list) {
    revive(c, opts);
    if (await setCookie(c, target, validStores)) ok++; else failed.push(c.name);
  }

  // verify it landed
  const after = await collectCookies(target);
  const names = new Set(after.map((c) => c.name));
  const missing = list.map((c) => c.name).filter((n) => !names.has(n));

  toast(`Imported ${ok}/${list.length} → ${target}${missing.length ? ' · missing: ' + missing.slice(0, 4).join(', ') : ''}`);

  // go to the site
  if ($('optOpen').checked) {
    openSite(target);
  } else if (activeTab) {
    chrome.tabs.reload(activeTab.id);
  }
  await load();
}

function openSite(target) {
  const url = 'https://' + target + '/';
  if (activeTab && activeTab.id != null && /^https?:/.test(activeTab.url || '')) {
    chrome.tabs.update(activeTab.id, { url });
  } else if (activeTab && activeTab.id != null) {
    chrome.tabs.update(activeTab.id, { url });   // navigate the empty/new tab
  } else {
    chrome.tabs.create({ url });
  }
}

async function deleteAll() {
  const host = siteHost || $('domain').value.trim();
  if (!host) return toast('No site selected');
  const list = await collectCookies(host);
  if (!list.length) return toast('Nothing to delete');
  for (const c of list)
    await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});
  toast(`Deleted ${list.length} cookies from ${host}`);
  await load();
}