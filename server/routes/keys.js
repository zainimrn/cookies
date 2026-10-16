import { Router } from 'express';
import auth, { adminOnly } from '../middleware/auth.js';
import Key from '../models/Key.js';
import { generateKey, hashKey, encrypt, decrypt, normalize } from '../lib/crypto.js';

const r = Router();
r.use(auth, adminOnly);

const shape = (d) => ({
  id: d._id, key: decrypt(d.keyEnc), isAdmin: d.isAdmin, label: d.label,
  siteName: d.siteName, domain: d.domain, cookieCount: d.cookies.length,
  active: d.active, hits: d.hits, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt
});

r.get('/', async (_req, res) => {
  const list = await Key.find({ isAdmin: false }).sort({ createdAt: -1 });
  res.json(list.map(shape));
});

r.get('/admin', async (_req, res) => {
  const d = await Key.findOne({ isAdmin: true });
  res.json({ key: decrypt(d.keyEnc), hits: d.hits });
});

r.post('/generate', (_req, res) => res.json({ key: generateKey(20) }));

r.post('/admin/regenerate', async (_req, res) => {
  const d = await Key.findOne({ isAdmin: true });
  const plain = generateKey(24);
  d.keyHash = hashKey(plain);
  d.keyEnc = encrypt(plain);
  await d.save();
  res.json({ key: plain });
});

r.post('/', async (req, res) => {
  const { siteName, domain, cookies, key, label } = req.body || {};
  if (!siteName || !domain || !Array.isArray(cookies) || !cookies.length)
    return res.status(400).json({ error: 'siteName, domain and cookies required' });

  const plain = key ? normalize(key) : generateKey(20);
  if (await Key.findOne({ keyHash: hashKey(plain) }))
    return res.status(409).json({ error: 'Key already in use' });

  const doc = await Key.create({
    keyHash: hashKey(plain), keyEnc: encrypt(plain),
    label: label || siteName, siteName, domain, cookies, isAdmin: false
  });
  res.json(shape(doc));
});

r.patch('/:id', async (req, res) => {
  const { siteName, domain, cookies, active, label, key } = req.body || {};
  const doc = await Key.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  if (siteName !== undefined) doc.siteName = siteName;
  if (domain !== undefined) doc.domain = domain;
  if (cookies !== undefined) doc.cookies = cookies;
  if (active !== undefined) doc.active = active;
  if (label !== undefined) doc.label = label;
  if (key) {
    const plain = normalize(key);
    const clash = await Key.findOne({ keyHash: hashKey(plain), _id: { $ne: doc._id } });
    if (clash) return res.status(409).json({ error: 'Key already in use' });
    doc.keyHash = hashKey(plain);
    doc.keyEnc = encrypt(plain);
  }
  await doc.save();
  res.json(shape(doc));
});

r.delete('/:id', async (req, res) => {
  await Key.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

export default r;