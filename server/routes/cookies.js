import { Router } from 'express';
import auth from '../middleware/auth.js';
import CookieSet from '../models/CookieSet.js';

const r = Router();
r.use(auth);

r.post('/', async (req, res) => {
  const { siteName, domain, cookies } = req.body || {};
  if (!siteName || !domain || !Array.isArray(cookies) || !cookies.length)
    return res.status(400).json({ error: 'siteName, domain and cookies are required' });
  const set = await CookieSet.create({ user: req.user.id, siteName, domain, cookies });
  res.json(set);
});

r.get('/', async (req, res) => {
  res.json(await CookieSet.find({ user: req.user.id }).sort({ createdAt: -1 }));
});

r.delete('/:id', async (req, res) => {
  await CookieSet.deleteOne({ _id: req.params.id, user: req.user.id });
  res.json({ ok: true });
});

export default r;