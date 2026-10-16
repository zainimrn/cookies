import { Router } from 'express';
import jwt from 'jsonwebtoken';
import auth from '../middleware/auth.js';
import Key from '../models/Key.js';
import { hashKey } from '../lib/crypto.js';

const r = Router();
const isExpired = (d) => d.expiresAt && Date.now() > new Date(d.expiresAt).getTime();

const pubSets = (d) =>
  d.sets.map((s) => ({
    id: s._id, siteName: s.siteName, domain: s.domain,
    cookies: s.cookies.filter((c) => c.enabled !== false)
  }));

r.post('/key', async (req, res) => {
  const { key, deviceId, deviceLabel } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Key required' });
  if (!deviceId) return res.status(400).json({ error: 'Device id required' });

  const doc = await Key.findOne({ keyHash: hashKey(key) });
  if (!doc) return res.status(401).json({ error: 'Invalid key' });
  if (isExpired(doc)) { doc.active = false; await doc.save(); return res.status(401).json({ error: 'Key expired' }); }
  if (!doc.active) return res.status(401).json({ error: 'Key disabled by admin' });

  // permanent device binding
  const known = doc.devices.find((d) => d.id === deviceId);
  if (known) known.lastSeen = new Date();
  else {
    if (doc.devices.length >= doc.maxDevices)
      return res.status(403).json({ error: 'This key is already bound to another browser/device. Ask admin to reset.' });
    doc.devices.push({ id: deviceId, label: deviceLabel || 'Unknown device' });
  }

  doc.hits += 1;
  doc.lastUsedAt = new Date();
  await doc.save();

  const token = jwt.sign(
    { kid: doc._id, isAdmin: doc.isAdmin, did: deviceId },
    process.env.JWT_SECRET, { expiresIn: '365d' }
  );
  res.json({ token, isAdmin: doc.isAdmin, userName: doc.userName, expiresAt: doc.expiresAt, sets: pubSets(doc) });
});

r.get('/me', auth, async (req, res) => {
  const doc = await Key.findById(req.claims.kid);
  if (!doc) return res.status(401).json({ error: 'Key removed' });

  if (!doc.isAdmin && isExpired(doc)) {
    doc.active = false; await doc.save();
    return res.json({ expired: true, isAdmin: false });
  }
  if (!doc.active) {
    return res.json({ disabled: true, isAdmin: doc.isAdmin, userName: doc.userName, sets: pubSets(doc) });
  }
  if (!doc.devices.some((d) => d.id === req.claims.did))
    return res.status(401).json({ error: 'Device unbound' });

  res.json({ isAdmin: doc.isAdmin, userName: doc.userName, expiresAt: doc.expiresAt, sets: pubSets(doc) });
});

// logout = cookies wiped client-side. Key stays ACTIVE, device stays BOUND.
r.post('/logout', auth, async (req, res) => {
  const doc = await Key.findById(req.claims.kid);
  if (doc) { doc.lastLogoutAt = new Date(); await doc.save(); }
  res.json({ ok: true });
});

export default r;