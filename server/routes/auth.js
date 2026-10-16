import { Router } from 'express';
import jwt from 'jsonwebtoken';
import auth from '../middleware/auth.js';
import Key from '../models/Key.js';
import { hashKey, decrypt } from '../lib/crypto.js';

const r = Router();

r.post('/key', async (req, res) => {
  const raw = req.body?.key;
  if (!raw) return res.status(400).json({ error: 'Key required' });

  const doc = await Key.findOne({ keyHash: hashKey(raw) });
  if (!doc || !doc.active) return res.status(401).json({ error: 'Invalid or inactive key' });

  doc.hits += 1;
  doc.lastUsedAt = new Date();
  await doc.save();

  const token = jwt.sign({ kid: doc._id, isAdmin: doc.isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    isAdmin: doc.isAdmin,
    set: doc.isAdmin ? null : { siteName: doc.siteName, domain: doc.domain, cookies: doc.cookies }
  });
});

r.get('/me', auth, async (req, res) => {
  const doc = await Key.findById(req.claims.kid);
  if (!doc) return res.status(404).json({ error: 'Key removed' });
  res.json({
    isAdmin: doc.isAdmin,
    set: doc.isAdmin ? null : { siteName: doc.siteName, domain: doc.domain, cookies: doc.cookies }
  });
});

export default r;