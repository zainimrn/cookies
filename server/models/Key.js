import mongoose from 'mongoose';

const cookieSchema = new mongoose.Schema({
  name: String,
  value: String,
  domain: String,
  path: { type: String, default: '/' },
  secure: Boolean,
  httpOnly: Boolean,
  sameSite: String,
  expirationDate: Number,
  enabled: { type: Boolean, default: true }
}, { _id: true, strict: false });

const siteSchema = new mongoose.Schema({
  siteName: { type: String, required: true },
  domain: { type: String, required: true },
  cookies: { type: [cookieSchema], default: [] }
}, { _id: true });

const deviceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const keySchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  keyEnc: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  userName: { type: String, default: '' },
  label: { type: String, default: '' },
  sets: { type: [siteSchema], default: [] },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  devices: { type: [deviceSchema], default: [] },
  maxDevices: { type: Number, default: 1 },
  hits: { type: Number, default: 0 },
  lastUsedAt: Date,
  lastLogoutAt: Date
}, { timestamps: true });

export default mongoose.model('Key', keySchema);