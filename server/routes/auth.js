import { Router } from 'express';
import jwt from 'jsonwebtoken';
import auth from '../middleware/auth.js';
import Key from '../models/Key.js';
import { hashKey } from '../lib/crypto.js';

const r = Router();
const isExpired = (d) => d.expiresAt && Date.now() > new Date(d.expiresAt).getTime();
const pub = (d) => ({
  isAdmin: d.isAdmin,
  expiresAt: d.expiresAt,
  sets: d.sets.map((s) => ({ id: s._id, siteName: s.siteName, domain: s.domain, cookies: s.cookies }))
});

r.post('/key', async (req, res) => {
  const { key, deviceId, deviceLabel } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Key required' });
  if (!deviceId) return res.status(400).json({ error: 'Device id required' });

  const doc = await Key.findOne({ keyHash: hashKey(key) });
  if (!doc) return res.status(401).json({ error: 'Invalid key' });
  if (isExpired(doc)) { doc.active = false; await doc.save(); return res.status(401).json({ error: 'Key expired' }); }
  if (!doc.active) return res.status(401).json({ error: 'Key disabled — contact admin' });

  const known = doc.devices.find((d) => d.id === deviceId);
  if (known) known.lastSeen = new Date();
  else {
    if (doc.devices.length >= doc.maxDevices)
      return res.status(403).json({ error: `Device limit reached (${doc.maxDevices}). Ask admin to reset.` });
    doc.devices.push({ id: deviceId, label: deviceLabel || 'Unknown device' });
  }

  doc.hits += 1;
  doc.lastUsedAt = new Date();
  await doc.save();

  const token = jwt.sign(
    { kid: doc._id, isAdmin: doc.isAdmin, did: deviceId },
    process.env.JWT_SECRET, { expiresIn: '90d' }
  );
  res.json({ token, ...pub(doc) });
});

r.get('/me', auth, async (req, res) => {
  const doc = await Key.findById(req.claims.kid);
  if (!doc) return res.status(404).json({ error: 'Key removed' });
  if (!doc.isAdmin && isExpired(doc)) {
    doc.active = false; await doc.save();
    return res.json({ expired: true, isAdmin: false });
  }
  if (!doc.devices.some((d) => d.id === req.claims.did))
    return res.status(401).json({ error: 'Device unbound' });
  res.json(pub(doc));
});

// manual logout → disable + free the device slot
r.post('/logout', auth, async (req, res) => {
  const doc = await Key.findById(req.claims.kid);
  if (doc && !doc.isAdmin) {
    doc.active = false;
    doc.devices = doc.devices.filter((d) => d.id !== req.claims.did);
    await doc.save();
  }
  res.json({ ok: true });
});

export default r;