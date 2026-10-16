import crypto from 'crypto';

const SECRET = process.env.KEY_SECRET || 'change-this-key-secret';
const aesKey = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes

// unambiguous alphabet (no I, O, 0, 1)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateKey(len = 20) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const normalize = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashKey = (k) => crypto.createHash('sha256').update(normalize(k)).digest('hex');

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(blob) {
  try {
    const [iv, tag, data] = blob.split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; }
}