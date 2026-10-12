const $ = (s) => document.querySelector(s);
const screens = { signup: $('#screen-signup'), add: $('#screen-add'), login: $('#screen-login'), dash: $('#screen-dash') };
const show = (name) => { for (const k in screens) screens[k].hidden = k !== name; };

let extPresent = false;
let currentSet = null;

/* ---------- extension bridge handshake ---------- */
window.addEventListener('message', (e) => {
  if (e.data?.type === 'COOKIE_SNAP_READY') extPresent = true;
});
window.postMessage({ type: 'COOKIE_SNAP_PING' }, '*');

/* ---------- api ---------- */
async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- cookie parsing (mirrors the extension) ---------- */
const MULTI = new Set(['co.uk','org.uk','gov.uk','ac.uk','co.jp','co.in','com.au','net.au','co.nz','com.br','com.mx','co.za','com.tr','com.sg','com.hk','com.tw','co.kr','com.cn']);
function baseDomain(host) {
  host = String(host || '').replace(/^\./, '').replace(/^www\./, '');
  const p = host.split('.').filter(Boolean);
  if (p.length <= 2) return p.join('.');
  const l2 = p.slice(-2).join('.');
  return MULTI.has(l2) && p.length >= 3 ? p.slice(-3).join('.') : l2;
}
function detectFormat(t) {
  t = (t || '').trim();
  if (!t) return 'header';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (/^[A-Za-z0-9+/=\s]+$/.test(t)) {
    try { const d = atob(t.replace(/\s+/g, '')); if (/^[\{\[]/.test(d.trim())) return 'base64'; } catch {}
  }
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (/netscape/i.test(t) || lines.some((l) => l.split('\t').length >= 7)) return 'netscape';
  if (lines.some((l) => /set-cookie:/i.test(l) || /;\s*(domain|path|expires|samesite)=/i.test(l))) return 'setcookie';
  return 'header';
}
function parseCookies(text, fmt = detectFormat(text)) {
  if (fmt === 'json') { const d = JSON.parse(text); return Array.isArray(d) ? d : d.cookies || []; }
  if (fmt === 'base64') return parseCookies(atob(text.replace(/\s+/g, '')), 'json');
  if (fmt === 'netscape') {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      if (!raw || raw.startsWith('#')) continue;
      const p = raw.split('\t'); if (p.length < 7) continue;
      out.push({ domain: p[0], path: p[2], secure: p[3] === 'TRUE', expirationDate: +p[4] || undefined, name: p[5], value: p[6] });
    }
    return out;
  }
  if (fmt === 'setcookie') {
    const out = [];
    for (let line of text.split(/\r?\n/)) {
      line = line.trim().replace(/^set-cookie:\s*/i, '');
      if (!line.includes('=')) continue;
      const parts = line.split(';');
      const i = parts[0].indexOf('=');
      const c = { name: parts[0].slice(0, i).trim(), value: parts[0].slice(i + 1).trim(), path: '/' };
      for (const a of parts.slice(1)) {
        const j = a.indexOf('='); const k = a.slice(0, j).trim().toLowerCase(); const v = a.slice(j + 1).trim();
        if (k === 'domain') c.domain = v; else if (k === 'path') c.path = v;
        else if (k === 'secure') c.secure = true; else if (k === 'httponly') c.httpOnly = true;
        else if (k === 'samesite') c.sameSite = v.toLowerCase().replace('-', '_');
        else if (k === 'expires') { const ts = Date.parse(v); if (!isNaN(ts)) c.expirationDate = Math.floor(ts / 1000); }
      }
      out.push(c);
    }
    return out;
  }
  return text.replace(/^cookie:\s*/i, '').split(';').map((p) => {
    const i = p.indexOf('='); return i < 0 ? null : { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), path: '/' };
  }).filter(Boolean);
}
function targetFrom(cookies) {
  const counts = new Map();
  for (const c of cookies) { if (!c.domain) continue; const b = baseDomain(c.domain); if (b) counts.set(b, (counts.get(b) || 0) + 1); }
  return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0] : '';
}

/* ---------- signup ---------- */
$('#su-go').onclick = async () => {
  $('#su-err').textContent = '';
  try {
    const { token } = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: $('#su-email').value, password: $('#su-pass').value })
    });
    localStorage.setItem('token', token);
    show('add');
  } catch (e) { $('#su-err').textContent = e.message; }
};

/* ---------- add cookies ---------- */
$('#ad-cookies').addEventListener('input', () => {
  try {
    const c = parseCookies($('#ad-cookies').value);
    const d = targetFrom(c);
    if (d && !$('#ad-domain').value) $('#ad-domain').value = d;
  } catch {}
});

$('#ad-go').onclick = async () => {
  $('#ad-err').textContent = '';
  try {
    const raw = $('#ad-cookies').value.trim();
    if (!raw) throw new Error('Paste some cookies first');
    const cookies = parseCookies(raw);
    if (!cookies.length) throw new Error('Could not read any cookies');
    const domain = $('#ad-domain').value.trim() || targetFrom(cookies);
    if (!domain) throw new Error('Add a domain');
    const siteName = $('#ad-name').value.trim() || domain;
    await api('/cookies', { method: 'POST', body: JSON.stringify({ siteName, domain, cookies }) });
    localStorage.removeItem('token');     // must log in again, per flow
    show('login');
  } catch (e) { $('#ad-err').textContent = e.message; }
};

/* ---------- login ---------- */
$('#li-go').onclick = async () => {
  $('#li-err').textContent = '';
  try {
    const { token } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#li-email').value, password: $('#li-pass').value })
    });
    localStorage.setItem('token', token);
    await loadDashboard();
    show('dash');
  } catch (e) { $('#li-err').textContent = e.message; }
};

/* ---------- dashboard ---------- */
async function loadDashboard() {
  const sets = await api('/cookies');
  currentSet = sets[0] || null;
  $('#ready-line').innerHTML = currentSet
    ? `Welcome — your <b>${escapeHtml(currentSet.siteName)}</b> account is ready. Click below to activate.`
    : 'No sites saved yet.';
  $('#ext-note').textContent = extPresent
    ? 'Extension detected — cookies will be applied automatically.'
    : 'Extension not detected — install it to auto-apply cookies (otherwise the site opens logged out).';

  const box = $('#sets');
  box.innerHTML = '';
  for (const s of sets) {
    const el = document.createElement('div');
    el.className = 'set';
    el.innerHTML = `
      <div class="info">
        <b>${escapeHtml(s.siteName)}</b>
        <span>${escapeHtml(s.domain)} · ${s.cookies.length} cookies</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge">ready</span>
        <button class="ghost" data-act="${s._id}">Activate</button>
      </div>`;
    el.querySelector('[data-act]').onclick = () => activate(s);
    box.appendChild(el);
  }
}

function activate(set) {
  if (extPresent) {
    window.postMessage({ type: 'COOKIE_SNAP_APPLY', domain: set.domain, cookies: set.cookies }, '*');
  } else {
    window.open('https://' + set.domain, '_blank');
  }
}
$('#activate').onclick = () => currentSet && activate(currentSet);

$('#logout').onclick = () => { localStorage.removeItem('token'); show('login'); };

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
document.querySelectorAll('[data-go]').forEach((a) => a.onclick = () => show(a.dataset.go));

if (localStorage.getItem('token')) loadDashboard().then(() => show('dash')).catch(() => show('login'));
else show('signup');