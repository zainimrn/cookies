import mongoose from 'mongoose';

const siteSchema = new mongoose.Schema({
  siteName: { type: String, required: true },
  domain: { type: String, required: true },
  cookies: { type: Array, default: [] }
}, { _id: true });

const deviceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const keySchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  keyEnc: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  label: { type: String, default: '' },
  sets: { type: [siteSchema], default: [] },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  devices: { type: [deviceSchema], default: [] },
  maxDevices: { type: Number, default: 1 },
  hits: { type: Number, default: 0 },
  lastUsedAt: Date
}, { timestamps: true });

export default mongoose.model('Key', keySchema);