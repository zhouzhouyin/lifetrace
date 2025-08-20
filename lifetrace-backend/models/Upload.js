const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filePath: { type: String, required: true },
  desc: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Upload', uploadSchema);

