import { Router } from 'express';
import auth, { adminOnly } from '../middleware/auth.js';
import Key from '../models/Key.js';
import { generateKey, hashKey, encrypt, decrypt, normalize } from '../lib/crypto.js';

const r = Router();
r.use(auth, adminOnly);

const shape = (d) => ({
  id: d._id, key: decrypt(d.keyEnc), label: d.label,
  sets: d.sets.map((s) => ({ id: s._id, siteName: s.siteName, domain: s.domain, cookieCount: s.cookies.length })),
  active: d.active, expiresAt: d.expiresAt, hits: d.hits,
  devices: d.devices.map((x) => ({ id: x.id, label: x.label, lastSeen: x.lastSeen })),
  maxDevices: d.maxDevices, createdAt: d.createdAt
});

/* ---- admin key ---- */
r.get('/admin', async (_req, res) => {
  const d = await Key.findOne({ isAdmin: true });
  res.json({ key: decrypt(d.keyEnc), hits: d.hits, devices: d.devices.length, maxDevices: d.maxDevices });
});
r.post('/admin/regenerate', async (_req, res) => {
  const d = await Key.findOne({ isAdmin: true });
  const plain = generateKey(24);
  d.keyHash = hashKey(plain); d.keyEnc = encrypt(plain); d.devices = [];
  await d.save();
  res.json({ key: plain });
});
r.post('/admin/reset-devices', async (_req, res) => {
  const d = await Key.findOne({ isAdmin: true });
  d.devices = [];
  await d.save();
  res.json({ ok: true });
});

/* ---- keys ---- */
r.get('/', async (_req, res) => {
  const list = await Key.find({ isAdmin: false }).sort({ createdAt: -1 });
  res.json(list.map(shape));
});

r.post('/generate', (_req, res) => res.json({ key: generateKey(20) }));

r.post('/', async (req, res) => {
  const { key, label, expiresAt, sets } = req.body || {};
  if (!Array.isArray(sets) || !sets.length) return res.status(400).json({ error: 'At least one site required' });

  const plain = key ? normalize(key) : generateKey(20);
  if (await Key.findOne({ keyHash: hashKey(plain) })) return res.status(409).json({ error: 'Key already in use' });

  const doc = await Key.create({
    keyHash: hashKey(plain), keyEnc: encrypt(plain),
    label: label || sets[0].siteName,
    sets: sets.map((s) => ({ siteName: s.siteName, domain: s.domain, cookies: s.cookies || [] })),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    maxDevices: 1
  });
  res.json(shape(doc));
});

r.post('/:id/sets', async (req, res) => {
  const { siteName, domain, cookies } = req.body || {};
  if (!siteName || !domain) return res.status(400).json({ error: 'siteName and domain required' });
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  doc.sets.push({ siteName, domain, cookies: cookies || [] });
  await doc.save();
  res.json(shape(doc));
});

r.patch('/:id/sets/:setId', async (req, res) => {
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const s = doc.sets.id(req.params.setId);
  if (!s) return res.status(404).json({ error: 'Site not found' });
  const { siteName, domain, cookies } = req.body || {};
  if (siteName !== undefined) s.siteName = siteName;
  if (domain !== undefined) s.domain = domain;
  if (cookies !== undefined) s.cookies = cookies;
  await doc.save();
  res.json(shape(doc));
});

r.delete('/:id/sets/:setId', async (req, res) => {
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  doc.sets.pull(req.params.setId);
  await doc.save();
  res.json(shape(doc));
});

r.patch('/:id', async (req, res) => {
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const { label, active, expiresAt, key, maxDevices } = req.body || {};
  if (label !== undefined) doc.label = label;
  if (active !== undefined) doc.active = active;
  if (expiresAt !== undefined) doc.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (maxDevices !== undefined) doc.maxDevices = maxDevices;
  if (key) {
    const plain = normalize(key);
    if (await Key.findOne({ keyHash: hashKey(plain), _id: { $ne: doc._id } }))
      return res.status(409).json({ error: 'Key already in use' });
    doc.keyHash = hashKey(plain); doc.keyEnc = encrypt(plain);
  }
  await doc.save();
  res.json(shape(doc));
});

r.post('/:id/reset-devices', async (req, res) => {
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  doc.devices = [];
  await doc.save();
  res.json(shape(doc));
});

r.delete('/:id', async (req, res) => {
  await Key.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

export default r;