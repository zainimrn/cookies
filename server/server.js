import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Key from './models/Key.js';
import { generateKey, hashKey, encrypt, normalize } from './lib/crypto.js';
import authRoutes from './routes/auth.js';
import keyRoutes from './routes/keys.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '3mb' }));
app.use(express.static('public'));

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);

async function ensureAdmin() {
  const exists = await Key.findOne({ isAdmin: true });
  if (exists) return;
  const plain = normalize(process.env.ADMIN_KEY || generateKey(24));
  await Key.create({ keyHash: hashKey(plain), keyEnc: encrypt(plain), isAdmin: true, label: 'Admin' });
  console.log('=== ADMIN KEY:', plain, '===');
}

const PORT = process.env.PORT || 4000;
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { await ensureAdmin(); app.listen(PORT, () => console.log('Cookie Snap on :' + PORT)); })
  .catch((e) => { console.error('Mongo error', e); process.exit(1); });