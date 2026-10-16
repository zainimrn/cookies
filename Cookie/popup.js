import { detectFormat, parse } from './formats.js';

const API = 'https://cookies-2t0q.onrender.com';   // ← your Render URL
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));

let TOKEN = localStorage.getItem('cs_token') || '';
let userSet = null;
let editId = null;

const screens = {};
['key', 'user', 'admin'].forEach((n) => (screens[n] = $('screen-' + n)));
const show = (n) => { for (const k in screens) screens[k].hidden = k !== n; };

async function api(path, opts = {}) {
  const res = await fetch(API + '/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200); }

/* ---------- boot ---------- */
async function boot() {
  if (!TOKEN) return show('key');
  try {
    const me = await api('/auth/me');
    me.isAdmin ? await openAdmin() : openUser(me.set);
  } catch { localStorage.removeItem('cs_token'); TOKEN = ''; show('key'); }
}

/* ---------- key login ---------- */
$('key-go').onclick = async () => {
  $('key-err').textContent = '';
  try {
    const key = $('key-input').value.trim();
    if (!key) throw new Error('Enter your key');
    const r = await api('/auth/key', { method: 'POST', body: JSON.stringify({ key }) });
    TOKEN = r.token;
    localStorage.setItem('cs_token', TOKEN);
    r.isAdmin ? await openAdmin() : openUser(r.set);
  } catch (e) { $('key-err').textContent = e.message; }
};
$('key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('key-go').click(); });

/* ---------- user ---------- */
function openUser(set) {
  userSet = set;
  $('u-ready').innerHTML = `Welcome — your <b>${esc(set.siteName)}</b> account is ready. Click below to activate.`;
  $('u-info').textContent = `${set.domain} · ${set.cookies.length} cookies`;
  $('u-status').textContent = '';
  show('user');
}
$('u-activate').onclick = () => userSet && activate(userSet);
$('u-logout').onclick = () => { localStorage.removeItem('cs_token'); TOKEN = ''; show('key'); };

/* ---------- admin ---------- */
async function openAdmin() {
  show('admin');
  await Promise.all([loadStats(), loadUsers(), loadAdminKey()]);
}

document.querySelectorAll('.tab[data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tab[data-tab]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + b.dataset.tab));
  };
});
$('a-logout').onclick = () => { localStorage.removeItem('cs_token'); TOKEN = ''; show('key'); };

let allKeys = [];
async function loadStats() {
  allKeys = await api('/keys');
  $('st-total').textContent = allKeys.length;
  $('st-active').textContent = allKeys.filter((k) => k.active).length;
  $('st-hits').textContent = allKeys.reduce((n, k) => n + (k.hits || 0), 0);

  const box = $('recent'); box.innerHTML = '';
  for (const k of allKeys.slice(0, 4)) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="top"><b>${esc(k.siteName)}</b><span class="pill${k.active ? '' : ' off'}">${k.active ? 'active' : 'off'}</span></div>
      <div class="meta">${esc(k.domain)} · ${k.cookieCount} cookies</div>`;
    box.appendChild(el);
  }
}

async function loadUsers() {
  allKeys = await api('/keys');
  renderUsers(allKeys);
}
$('u-search').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  renderUsers(allKeys.filter((k) => (k.siteName + k.domain + k.key).toLowerCase().includes(q)));
};

function renderUsers(list) {
  const box = $('users'); box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<p class="muted">No keys yet.</p>'; return; }
  for (const k of list) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="top"><b>${esc(k.siteName)}</b><span class="pill${k.active ? '' : ' off'}">${k.active ? 'active' : 'off'}</span></div>
      <div class="meta">${esc(k.domain)} · ${k.cookieCount} cookies · ${k.hits} uses</div>
      <div class="meta">key: <code>${esc(k.key)}</code></div>
      <div class="acts">
        <button class="ghost" data-copy>Copy key</button>
        <button class="ghost" data-edit>Edit</button>
        <button class="ghost" data-toggle>${k.active ? 'Disable' : 'Enable'}</button>
        <button class="ghost" data-del>Delete</button>
      </div>`;
    el.querySelector('[data-copy]').onclick = () => { navigator.clipboard.writeText(k.key); toast('Key copied'); };
    el.querySelector('[data-edit]').onclick = () => startEdit(k);
    el.querySelector('[data-toggle]').onclick = async () => { await api('/keys/' + k.id, { method: 'PATCH', body: JSON.stringify({ active: !k.active }) }); await loadUsers(); await loadStats(); };
    el.querySelector('[data-del]').onclick = async () => { if (confirm('Delete this key?')) { await api('/keys/' + k.id, { method: 'DELETE' }); await loadUsers(); await loadStats(); } };
    box.appendChild(el);
  }
}

/* ---------- add / edit ---------- */
$('a-cookies').addEventListener('input', () => {
  try { const d = targetFrom(parse($('a-cookies').value)); if (d && !$('a-domain').value) $('a-domain').value = d; } catch {}
});
$('a-gen').onclick = async () => { const r = await api('/keys/generate', { method: 'POST' }); $('a-key').value = r.key; };

function startEdit(k) {
  editId = k.id;
  $('add-title').textContent = 'Edit key';
  $('a-name').value = k.siteName;
  $('a-domain').value = k.domain;
  $('a-key').value = k.key;
  $('a-cookies').value = '';
  $('a-cancel').hidden = false;
  document.querySelector('.tab[data-tab="add"]').click();
  toast('Cookies left blank = keep existing');
}
$('a-cancel').onclick = () => resetForm();

function resetForm() {
  editId = null;
  $('add-title').textContent = 'Add cookies';
  ['a-name', 'a-domain', 'a-cookies', 'a-key'].forEach((id) => ($(id).value = ''));
  $('a-status').textContent = '';
  $('a-cancel').hidden = true;
}

$('a-save').onclick = async () => {
  $('a-status').textContent = '';
  try {
    const siteName = $('a-name').value.trim();
    const domain = $('a-domain').value.trim();
    const raw = $('a-cookies').value.trim();
    const key = $('a-key').value.trim();
    if (!siteName || !domain) throw new Error('Site name and domain required');

    let cookies;
    if (raw) { cookies = parse(raw, detectFormat(raw)); if (!cookies.length) throw new Error('Could not read cookies'); }

    if (editId) {
      await api('/keys/' + editId, { method: 'PATCH', body: JSON.stringify({ siteName, domain, key: key || undefined, ...(cookies ? { cookies } : {}) }) });
    } else {
      if (!cookies) throw new Error('Paste cookies');
      await api('/keys', { method: 'POST', body: JSON.stringify({ siteName, domain, cookies, key: key || undefined }) });
    }
    resetForm();
    await loadUsers();
    await loadStats();
    toast('Saved');
  } catch (e) { $('a-status').textContent = e.message; }
};

/* ---------- settings ---------- */
async function loadAdminKey() { const r = await api('/keys/admin'); $('s-adminkey').value = r.key; }
$('s-copy').onclick = () => { navigator.clipboard.writeText($('s-adminkey').value); toast('Admin key copied'); };
$('s-regen').onclick = async () => { if (!confirm('Regenerate admin key? You must log in again.')) return; const r = await api('/keys/admin/regenerate', { method: 'POST' }); $('s-adminkey').value = r.key; toast('New admin key: ' + r.key); };
$('s-export').onclick = () => {
  const blob = new Blob([JSON.stringify(allKeys, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cookie-snap-keys.json';
  a.click();
};

/* ---------- activate ---------- */
const cUrl = (c) => {
  const scheme = c.secure ? 'https' : 'http';
  const dom = String(c.domain || '').replace(/^\./, '');
  const path = c.path && c.path.startsWith('/') ? c.path : '/' + (c.path || '');
  return `${scheme}://${dom}${path}`;
};

async function activate(set) {
  const now = Math.floor(Date.now() / 1000);
  $('u-status').textContent = 'Applying…';
  const existing = await chrome.cookies.getAll({ domain: set.domain });
  for (const c of existing)
    await chrome.cookies.remove({ url: cUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});

  let ok = 0; const failed = [];
  for (const c of set.cookies) {
    if (!c.name) continue;
    const secure = !!c.secure;
    const dom = c.domain || '.' + set.domain;
    const d = {
      url: `${secure ? 'https' : 'http'}://${dom.replace(/^\./, '')}${c.path || '/'}`,
      name: c.name, value: c.value ?? '', path: c.path || '/',
      secure, httpOnly: !!c.httpOnly, domain: dom,
      expirationDate: c.expirationDate && c.expirationDate > now ? c.expirationDate : now + 365 * 86400
    };
    if (c.sameSite && c.sameSite !== 'unspecified') d.sameSite = c.sameSite;
    try { if (await chrome.cookies.set(d)) ok++; else failed.push(c.name); } catch { failed.push(c.name); }
  }
  $('u-status').textContent = `Cleared ${existing.length}, wrote ${ok}/${set.cookies.length}` + (failed.length ? ` · failed: ${failed.join(', ')}` : '');
  chrome.tabs.create({ url: 'https://' + set.domain + '/' });
}

/* ---------- domain detection ---------- */
const MULTI = new Set(['co.uk','org.uk','gov.uk','ac.uk','co.jp','co.in','com.au','net.au','co.nz','com.br','com.mx','co.za','com.tr','com.sg','com.hk','com.tw','co.kr','com.cn']);
function baseDomain(host) {
  host = String(host || '').replace(/^\./, '').replace(/^www\./, '');
  const p = host.split('.').filter(Boolean);
  if (p.length <= 2) return p.join('.');
  const l2 = p.slice(-2).join('.');
  return MULTI.has(l2) && p.length >= 3 ? p.slice(-3).join('.') : l2;
}
function targetFrom(cookies) {
  const counts = new Map();
  for (const c of cookies) { if (!c.domain) continue; const b = baseDomain(c.domain); if (b) counts.set(b, (counts.get(b) || 0) + 1); }
  return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0] : '';
}

boot();