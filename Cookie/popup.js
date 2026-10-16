import { detectFormat, parse } from './formats.js';

const API = 'https://cookies-2t0q.onrender.com';   // ← your Render URL
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));

let S = null;               // { token, isAdmin, sets, expiresAt }
let deviceId = '';
let activeSet = null;
let allKeys = [];
let editId = null;
let draftSites = [];

/* ---------- ui ---------- */
const screens = {};
['key', 'user', 'admin'].forEach((n) => (screens[n] = $('screen-' + n)));
function show(n) { for (const k in screens) screens[k].hidden = k !== n; }
function loading(on) { $('loader').hidden = !on; }
function toast(msg, type = 'ok') {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------- state ---------- */
const loadState = async () => { S = (await chrome.storage.local.get('cs')).cs || null; };
const saveState = async () => { await chrome.storage.local.set({ cs: S }); };
const clearState = async () => { S = null; await chrome.storage.local.remove('cs'); };

async function ensureDevice() {
  const r = await chrome.storage.local.get('did');
  deviceId = r.did;
  if (!deviceId) { deviceId = crypto.randomUUID(); await chrome.storage.local.set({ did: deviceId }); }
}

async function api(path, opts = {}) {
  const res = await fetch(API + '/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(S?.token ? { Authorization: 'Bearer ' + S.token } : {}), ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- boot ---------- */
async function boot() {
  await ensureDevice();
  await loadState();
  if (!S?.token) return show('key');

  loading(true);
  try {
    const me = await api('/auth/me');
    if (me.expired) { await hardLogout(false); return show('key'); }
    S.isAdmin = me.isAdmin; S.sets = me.sets; S.expiresAt = me.expiresAt;
    await saveState();
    me.isAdmin ? await openAdmin() : openUser();
  } catch (e) {
    await clearState(); show('key'); toast(e.message, 'err');
  } finally { loading(false); }
}

/* ---------- key login ---------- */
$('key-go').onclick = async () => {
  const key = $('key-input').value.trim();
  if (!key) return toast('Enter your key', 'err');
  $('key-err').textContent = '';
  loading(true);
  try {
    const r = await api('/auth/key', {
      method: 'POST',
      body: JSON.stringify({ key, deviceId, deviceLabel: navigator.userAgent.slice(0, 60) })
    });
    S = { token: r.token, isAdmin: r.isAdmin, sets: r.sets, expiresAt: r.expiresAt };
    await saveState();
    r.isAdmin ? await openAdmin() : openUser();
  } catch (e) {
    $('key-err').textContent = e.message; toast(e.message, 'err');
  } finally { loading(false); }
};
$('key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('key-go').click(); });

/* ---------- user ---------- */
function openUser() { renderSiteTabs(); show('user'); }

function renderSiteTabs() {
  const t = $('site-tabs'); t.innerHTML = '';
  (S.sets || []).forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'tab' + (i === 0 ? ' active' : '');
    b.textContent = s.siteName;
    b.onclick = () => {
      [...t.children].forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      selectSet(s);
    };
    t.appendChild(b);
  });
  if (S.sets?.length) selectSet(S.sets[0]);
}

function selectSet(s) {
  activeSet = s;
  $('site-body').innerHTML = `
    <p class="ready">Your <b>${esc(s.siteName)}</b> session is ready.</p>
    <p class="meta">${esc(s.domain)} · ${s.cookies.length} cookies</p>
    <p class="meta">${S.expiresAt ? 'Expires: ' + new Date(S.expiresAt).toLocaleDateString() : 'No expiry set'}</p>
    <button id="u-activate" class="primary big">Activate</button>
    <p class="note" id="u-status"></p>`;
  $('u-activate').onclick = () => activate(activeSet);
}

$('u-logout').onclick = async () => {
  loading(true);
  await hardLogout(true);
  loading(false);
  toast('Logged out — key disabled');
  show('key');
};

async function hardLogout(callApi = true) {
  for (const s of (S?.sets || [])) await wipe(s.domain);
  if (callApi && S?.token) { try { await api('/auth/logout', { method: 'POST' }); } catch {} }
  await clearState();
  chrome.action.setBadgeText({ text: '' });
}

/* ---------- activate ---------- */
const cUrl = (c) => {
  const scheme = c.secure ? 'https' : 'http';
  const dom = String(c.domain || '').replace(/^\./, '');
  const path = c.path && c.path.startsWith('/') ? c.path : '/' + (c.path || '');
  return `${scheme}://${dom}${path}`;
};

async function wipe(domain) {
  const list = await chrome.cookies.getAll({ domain });
  for (const c of list)
    await chrome.cookies.remove({ url: cUrl(c), name: c.name, storeId: c.storeId, partitionKey: c.partitionKey }).catch(() => {});
}

async function activate(set) {
  const now = Math.floor(Date.now() / 1000);
  const cap = S?.expiresAt ? Math.floor(new Date(S.expiresAt).getTime() / 1000) : null;
  $('u-status').textContent = 'Applying…';

  await wipe(set.domain);

  let ok = 0; const failed = [];
  for (const c of set.cookies) {
    if (!c.name) continue;
    const secure = !!c.secure;
    const dom = c.domain || '.' + set.domain;
    const exp = c.expirationDate && c.expirationDate > now
      ? (cap ? Math.min(c.expirationDate, cap) : c.expirationDate)
      : (cap || now + 365 * 86400);
    const d = {
      url: `${secure ? 'https' : 'http'}://${dom.replace(/^\./, '')}${c.path || '/'}`,
      name: c.name, value: c.value ?? '', path: c.path || '/',
      secure, httpOnly: !!c.httpOnly, domain: dom, expirationDate: exp
    };
    if (c.sameSite && c.sameSite !== 'unspecified') d.sameSite = c.sameSite;
    try { if (await chrome.cookies.set(d)) ok++; else failed.push(c.name); } catch { failed.push(c.name); }
  }

  const msg = `Wrote ${ok}/${set.cookies.length}` + (failed.length ? ` · failed: ${failed.join(', ')}` : '');
  $('u-status').textContent = msg;
  toast(msg, failed.length ? 'err' : 'ok');
  chrome.tabs.create({ url: 'https://' + set.domain + '/' });
}

/* ---------- admin ---------- */
async function openAdmin() { show('admin'); await Promise.all([loadStats(), loadUsers(), loadAdminKey()]); }

document.querySelectorAll('.side .tab[data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.side .tab[data-tab]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + b.dataset.tab));
  };
});
$('a-logout').onclick = async () => { await clearState(); show('key'); };

async function loadStats() {
  allKeys = await api('/keys');
  $('st-total').textContent = allKeys.length;
  $('st-active').textContent = allKeys.filter((k) => k.active).length;
  $('st-dev').textContent = allKeys.reduce((n, k) => n + k.devices.length, 0);
  const box = $('recent'); box.innerHTML = '';
  for (const k of allKeys.slice(0, 4)) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="top"><b>${esc(k.label)}</b><span class="pill${k.active ? '' : ' off'}">${k.active ? 'active' : 'off'}</span></div>
      <div class="meta">${k.sets.length} site(s) · ${k.devices.length}/${k.maxDevices} devices</div>`;
    box.appendChild(el);
  }
}

async function loadUsers() { allKeys = await api('/keys'); renderUsers(allKeys); }
$('u-search').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  renderUsers(allKeys.filter((k) => (k.label + k.key + k.sets.map((s) => s.siteName + s.domain).join(' ')).toLowerCase().includes(q)));
};

function renderUsers(list) {
  const box = $('users'); box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<p class="muted">No keys yet.</p>'; return; }
  for (const k of list) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="top"><b>${esc(k.label)}</b><span class="pill${k.active ? '' : ' off'}">${k.active ? 'active' : 'off'}</span></div>
      <div class="meta">key: <code>${esc(k.key)}</code></div>
      <div class="meta">${k.sets.map((s) => esc(s.siteName)).join(', ') || 'no sites'}</div>
      <div class="meta">${k.devices.length}/${k.maxDevices} devices · expires ${k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'never'}</div>
      <div class="acts">
        <button class="ghost sm" data-copy>Copy key</button>
        <button class="ghost sm" data-edit>Edit</button>
        <button class="ghost sm" data-dev>Reset devices</button>
        <button class="ghost sm" data-toggle>${k.active ? 'Disable' : 'Enable'}</button>
        <button class="ghost sm" data-del>Delete</button>
      </div>`;
    el.querySelector('[data-copy]').onclick = () => { navigator.clipboard.writeText(k.key); toast('Key copied'); };
    el.querySelector('[data-edit]').onclick = () => startEdit(k);
    el.querySelector('[data-dev]').onclick = async () => { await api('/keys/' + k.id + '/reset-devices', { method: 'POST' }); await loadUsers(); toast('Devices reset'); };
    el.querySelector('[data-toggle]').onclick = async () => { await api('/keys/' + k.id, { method: 'PATCH', body: JSON.stringify({ active: !k.active }) }); await loadUsers(); await loadStats(); };
    el.querySelector('[data-del]').onclick = async () => { if (confirm('Delete this key?')) { await api('/keys/' + k.id, { method: 'DELETE' }); await loadUsers(); await loadStats(); } };
    box.appendChild(el);
  }
}

/* ---------- add / edit key ---------- */
function siteCard(site, i) {
  const el = document.createElement('div');
  el.className = 'sitecard';
  el.innerHTML = `
    <div class="row"><input placeholder="Site name" value="${esc(site.siteName || '')}" data-f="siteName" />
      <button class="ghost sm" data-del>✕</button></div>
    <input placeholder="Domain" value="${esc(site.domain || '')}" data-f="domain" />
    <textarea placeholder="Paste cookies…" data-f="raw">${esc(site.raw || '')}</textarea>`;
  el.querySelectorAll('[data-f]').forEach((inp) => {
    inp.oninput = () => {
      draftSites[i][inp.dataset.f] = inp.value;
      if (inp.dataset.f === 'raw' && !draftSites[i].domain) {
        try { const d = targetFrom(parse(inp.value)); if (d) { draftSites[i].domain = d; el.querySelector('[data-f="domain"]').value = d; } } catch {}
      }
    };
  });
  el.querySelector('[data-del]').onclick = () => { draftSites.splice(i, 1); renderDraft(); };
  return el;
}
function renderDraft() {
  const box = $('a-sites'); box.innerHTML = '';
  draftSites.forEach((s, i) => box.appendChild(siteCard(s, i)));
}
$('a-addsite').onclick = () => { draftSites.push({ siteName: '', domain: '', raw: '' }); renderDraft(); };
$('a-gen').onclick = async () => { const r = await api('/keys/generate', { method: 'POST' }); $('a-key').value = r.key; };

function startEdit(k) {
  editId = k.id;
  $('add-title').textContent = 'Edit key';
  $('a-key').value = k.key;
  $('a-expiry').value = k.expiresAt ? k.expiresAt.slice(0, 10) : '';
  draftSites = k.sets.map((s) => ({ id: s.id, siteName: s.siteName, domain: s.domain, raw: '' }));
  $('a-cancel').hidden = false;
  document.querySelector('.side .tab[data-tab="add"]').click();
  toast('Leave cookies blank to keep existing');
}
$('a-cancel').onclick = () => resetForm();
function resetForm() {
  editId = null; draftSites = [];
  $('add-title').textContent = 'Create key';
  ['a-key', 'a-expiry'].forEach((id) => ($(id).value = ''));
  $('a-status').textContent = ''; $('a-cancel').hidden = true;
  draftSites.push({ siteName: '', domain: '', raw: '' });
  renderDraft();
}

$('a-save').onclick = async () => {
  $('a-status').textContent = '';
  loading(true);
  try {
    const key = $('a-key').value.trim();
    const expiresAt = $('a-expiry').value || null;
    const sets = draftSites
      .filter((s) => s.siteName || s.domain || s.raw)
      .map((s) => ({
        id: s.id, siteName: s.siteName.trim(), domain: s.domain.trim(),
        cookies: s.raw.trim() ? parse(s.raw, detectFormat(s.raw)) : null
      }));

    if (!sets.length) throw new Error('Add at least one site');

    if (editId) {
      await api('/keys/' + editId, { method: 'PATCH', body: JSON.stringify({ expiresAt, key: key || undefined }) });
      for (const s of sets) {
        const body = { siteName: s.siteName, domain: s.domain };
        if (s.cookies) body.cookies = s.cookies;
        if (s.id) await api(`/keys/${editId}/sets/${s.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        else await api(`/keys/${editId}/sets`, { method: 'POST', body: JSON.stringify({ ...body, cookies: s.cookies || [] }) });
      }
      await loadUsers(); await loadStats();
      toast('Key updated');
    } else {
      for (const s of sets) if (!s.cookies) throw new Error(`Paste cookies for ${s.siteName}`);
      await api('/keys', { method: 'POST', body: JSON.stringify({ key: key || undefined, expiresAt, sets }) });
      await loadUsers(); await loadStats();
      toast('Key created');
    }
    resetForm();
  } catch (e) { $('a-status').textContent = e.message; toast(e.message, 'err'); }
  finally { loading(false); }
};

/* ---------- settings ---------- */
async function loadAdminKey() {
  const r = await api('/keys/admin');
  $('s-adminkey').value = r.key;
  $('s-devices').textContent = `Bound devices: ${r.devices}/${r.maxDevices}`;
}
$('s-copy').onclick = () => { navigator.clipboard.writeText($('s-adminkey').value); toast('Admin key copied'); };
$('s-resetdev').onclick = async () => { await api('/keys/admin/reset-devices', { method: 'POST' }); await loadAdminKey(); toast('Admin devices reset'); };
$('s-regen').onclick = async () => {
  if (!confirm('Regenerate admin key? You must log in again.')) return;
  const r = await api('/keys/admin/regenerate', { method: 'POST' });
  $('s-adminkey').value = r.key; toast('New admin key: ' + r.key);
};
$('s-export').onclick = () => {
  const blob = new Blob([JSON.stringify(allKeys, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'cookie-snap-keys.json'; a.click();
};

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

resetForm();
boot();