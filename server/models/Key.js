import mongoose from 'mongoose';

const keySchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  keyEnc: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  label: { type: String, default: '' },
  siteName: { type: String, default: '' },
  domain: { type: String, default: '' },
  cookies: { type: Array, default: [] },
  active: { type: Boolean, default: true },
  hits: { type: Number, default: 0 },
  lastUsedAt: Date
}, { timestamps: true });

export default mongoose.model('Key', keySchema);