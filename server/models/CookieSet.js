import mongoose from 'mongoose';

const cookieSetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  siteName: { type: String, required: true },
  domain: { type: String, required: true },
  cookies: { type: Array, required: true }
}, { timestamps: true });

export default mongoose.model('CookieSet', cookieSetSchema);